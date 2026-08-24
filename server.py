#!/usr/bin/env python3
"""Servidor do Dr. Estomato: API clínica, autenticação e Web Push."""

import base64, getpass, hashlib, hmac, io, json, os, secrets, sqlite3, subprocess, threading, time
import urllib.error, urllib.parse, urllib.request, uuid, wave
from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8080"))
MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.7-flash")
API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DR_ESTOMATO_DATA_DIR", APP_DIR / ".data"))
DB_PATH, VAPID_KEY_PATH = DATA_DIR / "dr-estomato.sqlite3", DATA_DIR / "vapid-private.pem"
NAV_USER = os.environ.get("NAVIGATOR_USER", "navegador")
NAV_PASSWORD = os.environ.get("NAVIGATOR_PASSWORD", "UnespSJC")
PUSH_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:responsavel@dr-estomato.local")
SYSTEM_PROMPT = """Você é o Dr. Estomato, assistente virtual de orientação em saúde bucal para a APS do SUS em São José dos Campos. Fale em português do Brasil, de modo acolhedor, natural e apropriado para áudio. Responda em no máximo 2 frases curtas. Nunca dê diagnóstico, nunca prescreva medicamentos, pomadas, receitas caseiras ou procedimentos invasivos. Reforce o exame presencial quando necessário. A classificação de risco é feita separadamente pelo sistema; não a contradiga nem tente substituí-la. Reconheça brevemente a fala do cidadão e faça exatamente a próxima pergunta fornecida, com linguagem natural. Não acrescente perguntas."""

DATA_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
DB_LOCK, SESSIONS = threading.RLock(), {}


def db():
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with db() as connection:
        connection.executescript("""
        CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, patient_token_hash TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS subscriptions (endpoint TEXT PRIMARY KEY, case_id TEXT NOT NULL, subscription TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, case_id TEXT, created_at INTEGER NOT NULL);
        """)


def token_hash(value): return hashlib.sha256(str(value).encode()).hexdigest()


def load_case(case_id):
    with DB_LOCK, db() as connection:
        row = connection.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
    return (row, json.loads(row["data"])) if row else (None, None)


def store_case(case_data, patient_token_hash=None):
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with DB_LOCK, db() as connection:
        if patient_token_hash:
            connection.execute("INSERT INTO cases VALUES(?,?,?,?,?)", (case_data["id"], patient_token_hash, json.dumps(case_data, ensure_ascii=False), case_data.get("createdAt", now), now))
        else:
            connection.execute("UPDATE cases SET data = ?, updated_at = ? WHERE id = ?", (json.dumps(case_data, ensure_ascii=False), now, case_data["id"]))


def safe_case(incoming):
    allowed = {"name", "age", "sex", "phone", "street", "number", "apartment", "neighborhood", "city", "address", "risk", "answers", "createdAt", "status", "messages"}
    data = {key: incoming[key] for key in allowed if key in incoming}
    for key in ("name", "age", "sex", "phone", "street", "number", "apartment", "neighborhood", "city", "address", "risk", "status"):
        data[key] = str(data.get(key, ""))[:500]
    data["risk"] = data["risk"] if data["risk"] in {"red", "yellow", "green"} else "green"
    data["answers"] = [str(item)[:1500] for item in data.get("answers", [])[:10]]
    data["messages"] = [m for m in data.get("messages", []) if isinstance(m, dict)][:1000]
    data["createdAt"] = str(data.get("createdAt") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    data["status"] = data["status"] or "Aguardando retorno"
    return data


def get_vapid():
    try:
        from py_vapid import Vapid
        from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
        if VAPID_KEY_PATH.exists(): vapid = Vapid.from_file(str(VAPID_KEY_PATH))
        else:
            vapid = Vapid(); vapid.generate_keys(); vapid.save_key(str(VAPID_KEY_PATH)); os.chmod(VAPID_KEY_PATH, 0o600)
        raw = vapid.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
    except Exception: return ""


VAPID_PUBLIC_KEY = get_vapid()


def gemini_api_key():
    """Lê a chave do ambiente ou, no macOS, do Keychain sem expô-la em logs."""
    configured = os.environ.get("GEMINI_API_KEY", "").strip()
    if configured: return configured
    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-a", getpass.getuser(), "-s", "dr-estomato-gemini", "-w"],
            capture_output=True, text=True, timeout=3, check=False,
        )
        return result.stdout.strip() if result.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def send_push(case_id):
    if not VAPID_PUBLIC_KEY: return
    try: from pywebpush import WebPushException, webpush
    except ImportError: return
    with DB_LOCK, db() as connection:
        rows = connection.execute("SELECT endpoint, subscription FROM subscriptions WHERE case_id = ?", (case_id,)).fetchall()
    payload = json.dumps({"title": "Dr. Estomato", "body": "Você recebeu uma nova mensagem da equipe de acompanhamento.", "caseId": case_id}, ensure_ascii=False)
    expired = []
    for row in rows:
        try: webpush(json.loads(row["subscription"]), data=payload, vapid_private_key=str(VAPID_KEY_PATH), vapid_claims={"sub": PUSH_SUBJECT})
        except WebPushException as exc:
            if getattr(exc.response, "status_code", 0) in {404, 410}: expired.append(row["endpoint"])
        except Exception: pass
    if expired:
        with DB_LOCK, db() as connection: connection.executemany("DELETE FROM subscriptions WHERE endpoint = ?", [(x,) for x in expired])


class AppHandler(SimpleHTTPRequestHandler):
    server_version = "DrEstomato/1.0"

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff"); self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Permissions-Policy", "geolocation=(self), microphone=(self)"); super().end_headers()

    def send_json(self, status, payload, extra=None):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(body))); self.send_header("Cache-Control", "no-store")
        for name, value in (extra or {}).items(): self.send_header(name, value)
        self.end_headers(); self.wfile.write(body)

    def incoming_json(self, max_size=200_000):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > max_size: raise ValueError("Requisição inválida")
        return json.loads(self.rfile.read(length))

    def path_parts(self): return [urllib.parse.unquote(p) for p in urllib.parse.urlparse(self.path).path.split("/") if p]

    def patient_allowed(self, row):
        token = self.headers.get("X-Patient-Token", "")
        return bool(token and hmac.compare_digest(row["patient_token_hash"], token_hash(token)))

    def session_id(self):
        jar = cookies.SimpleCookie(self.headers.get("Cookie", "")); item = jar.get("dr_nav_session")
        return item.value if item else ""

    def admin_allowed(self):
        session_id = self.session_id(); expires = SESSIONS.get(session_id, 0)
        if expires <= time.time(): SESSIONS.pop(session_id, None); return False
        SESSIONS[session_id] = time.time() + 28800; return True

    def do_GET(self):
        parts = self.path_parts()
        if parts == ["api", "push", "public-key"]: return self.send_json(200, {"publicKey": VAPID_PUBLIC_KEY, "available": bool(VAPID_PUBLIC_KEY)})
        if parts == ["api", "admin", "session"]:
            allowed = self.admin_allowed(); return self.send_json(200 if allowed else 401, {"authenticated": allowed})
        if parts == ["api", "admin", "cases"]:
            if not self.admin_allowed(): return self.send_json(401, {"error": "Não autorizado"})
            with DB_LOCK, db() as connection: rows = connection.execute("SELECT data FROM cases ORDER BY created_at DESC").fetchall()
            return self.send_json(200, {"cases": [json.loads(r["data"]) for r in rows]})
        if len(parts) == 3 and parts[:2] == ["api", "cases"]:
            row, data = load_case(parts[2])
            if not row or not self.patient_allowed(row): return self.send_json(404, {"error": "Atendimento não encontrado"})
            return self.send_json(200, {"case": data})
        pathname = urllib.parse.urlparse(self.path).path
        if pathname == "/sw.js": self.extensions_map[".js"] = "application/javascript"
        if pathname.endswith(".webmanifest"): self.extensions_map[".webmanifest"] = "application/manifest+json"
        return super().do_GET()

    def do_POST(self):
        parts = self.path_parts()
        if parts == ["api", "admin", "login"]:
            try: incoming = self.incoming_json(10_000)
            except (ValueError, json.JSONDecodeError): return self.send_json(400, {"error": "Dados inválidos"})
            good = hmac.compare_digest(str(incoming.get("username", "")), NAV_USER) and hmac.compare_digest(str(incoming.get("password", "")), NAV_PASSWORD)
            if not good: time.sleep(.35); return self.send_json(401, {"error": "Login ou senha incorretos"})
            sid = secrets.token_urlsafe(32); SESSIONS[sid] = time.time() + 28800
            return self.send_json(200, {"authenticated": True}, {"Set-Cookie": f"dr_nav_session={sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800"})
        if parts == ["api", "admin", "logout"]:
            SESSIONS.pop(self.session_id(), None); return self.send_json(200, {"ok": True}, {"Set-Cookie": "dr_nav_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"})
        if parts == ["api", "cases"]:
            try: incoming = safe_case(self.incoming_json())
            except (ValueError, json.JSONDecodeError): return self.send_json(400, {"error": "Dados inválidos"})
            case_id, patient_token = uuid.uuid4().hex, secrets.token_urlsafe(32); incoming["id"] = case_id
            store_case(incoming, token_hash(patient_token)); return self.send_json(201, {"case": incoming, "patientToken": patient_token})
        if len(parts) == 4 and parts[:2] == ["api", "cases"] and parts[3] in {"messages", "subscription"}:
            row, case_data = load_case(parts[2])
            if not row or not self.patient_allowed(row): return self.send_json(404, {"error": "Atendimento não encontrado"})
            try: incoming = self.incoming_json()
            except (ValueError, json.JSONDecodeError): return self.send_json(400, {"error": "Dados inválidos"})
            if parts[3] == "messages":
                text = str(incoming.get("text", "")).strip()[:2000]
                if not text: return self.send_json(400, {"error": "Mensagem vazia"})
                case_data.setdefault("messages", []).append({"from": "patient", "text": text, "sentAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}); case_data["status"] = "Em contato"; store_case(case_data)
                return self.send_json(201, {"case": case_data})
            subscription = incoming.get("subscription", {}); endpoint = str(subscription.get("endpoint", ""))[:3000]
            if not endpoint: return self.send_json(400, {"error": "Inscrição inválida"})
            with DB_LOCK, db() as connection: connection.execute("INSERT OR REPLACE INTO subscriptions VALUES(?,?,?,?)", (endpoint, case_data["id"], json.dumps(subscription), int(time.time())))
            return self.send_json(201, {"subscribed": True})
        if len(parts) == 5 and parts[:3] == ["api", "admin", "cases"] and parts[4] == "messages":
            if not self.admin_allowed(): return self.send_json(401, {"error": "Não autorizado"})
            row, case_data = load_case(parts[3])
            if not row: return self.send_json(404, {"error": "Atendimento não encontrado"})
            try: incoming = self.incoming_json()
            except (ValueError, json.JSONDecodeError): return self.send_json(400, {"error": "Dados inválidos"})
            text = str(incoming.get("text", "")).strip()[:2000]
            if not text: return self.send_json(400, {"error": "Mensagem vazia"})
            case_data.setdefault("messages", []).append({"from": "navigator", "text": text, "sentAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}); case_data["status"] = "Em contato"; store_case(case_data)
            threading.Thread(target=send_push, args=(case_data["id"],), daemon=True).start(); return self.send_json(201, {"case": case_data})
        if parts and parts[0] == "api" and parts[-1] in {"chat", "transcribe", "speak"}: return self.handle_gemini(parts[-1])
        return self.send_json(404, {"error": "Rota não encontrada"})

    def do_PATCH(self):
        parts = self.path_parts()
        if len(parts) != 4 or parts[:3] != ["api", "admin", "cases"]: return self.send_json(404, {"error": "Rota não encontrada"})
        if not self.admin_allowed(): return self.send_json(401, {"error": "Não autorizado"})
        row, case_data = load_case(parts[3])
        if not row: return self.send_json(404, {"error": "Atendimento não encontrado"})
        try: incoming = self.incoming_json()
        except (ValueError, json.JSONDecodeError): return self.send_json(400, {"error": "Dados inválidos"})
        for key in {"name", "age", "sex", "phone", "street", "number", "apartment", "neighborhood", "city", "address", "status"}:
            if key in incoming: case_data[key] = str(incoming[key])[:500]
        store_case(case_data); return self.send_json(200, {"case": case_data})

    def do_DELETE(self):
        parts = self.path_parts()
        if len(parts) != 4 or parts[:3] != ["api", "admin", "cases"]: return self.send_json(404, {"error": "Rota não encontrada"})
        if not self.admin_allowed(): return self.send_json(401, {"error": "Não autorizado"})
        with DB_LOCK, db() as connection:
            connection.execute("DELETE FROM subscriptions WHERE case_id = ?", (parts[3],)); result = connection.execute("DELETE FROM cases WHERE id = ?", (parts[3],))
        return self.send_json(200 if result.rowcount else 404, {"deleted": bool(result.rowcount)})

    def handle_gemini(self, action):
        api_key = gemini_api_key()
        if not api_key: return self.send_json(503, {"error": "Gemini não configurado"})
        try:
            incoming = self.incoming_json(12_000_000 if action == "transcribe" else 20_000)
            if action == "chat":
                message, question = str(incoming.get("message", ""))[:1500], str(incoming.get("nextQuestion", ""))[:500]
                payload = {"model": MODEL, "system_instruction": SYSTEM_PROMPT, "input": f"Fala do cidadão: {message}\nPróxima pergunta obrigatória: {question}", "store": False, "generation_config": {"max_output_tokens": 512, "thinking_level": "low"}}
            elif action == "transcribe":
                audio, mime = str(incoming.get("audio", "")), str(incoming.get("mimeType", "audio/webm")).split(";")[0]
                if not audio or len(audio) > 11_000_000: return self.send_json(400, {"error": "Áudio inválido ou muito grande"})
                base64.b64decode(audio, validate=True)
                payload = {"model": MODEL, "input": [{"type": "text", "text": "Transcreva exatamente a fala deste áudio em português do Brasil. Retorne somente a transcrição, sem comentários."}, {"type": "audio", "data": audio, "mime_type": mime}], "store": False, "generation_config": {"max_output_tokens": 512, "thinking_level": "low"}}
            else:
                text = str(incoming.get("text", ""))[:1400].strip()
                if not text: return self.send_json(400, {"error": "Texto vazio"})
                payload = {"model": "gemini-3.1-flash-tts-preview", "input": f"Fale em português do Brasil, com voz masculina adulta, acolhedora, calma e natural. Ritmo conversacional e pausas suaves. Leia exatamente este texto: {text}", "response_format": {"type": "audio"}, "generation_config": {"speech_config": [{"voice": "Orus"}]}}
            request = urllib.request.Request(API_URL, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": api_key}, method="POST")
            with urllib.request.urlopen(request, timeout=30) as response: result = json.loads(response.read())
            if action == "speak":
                audio = result.get("output_audio") or {}
                if not audio:
                    for step in result.get("steps", []):
                        if step.get("type") == "model_output": audio = next((b for b in step.get("content", []) if b.get("type") == "audio"), {})
                if not audio.get("data"): raise ValueError()
                if str(audio.get("mime_type", "")).startswith("audio/l16"):
                    pcm, output = base64.b64decode(audio["data"]), io.BytesIO()
                    with wave.open(output, "wb") as f: f.setnchannels(int(audio.get("channels", 1))); f.setsampwidth(2); f.setframerate(int(audio.get("sample_rate", 24000))); f.writeframes(pcm)
                    audio = {"data": base64.b64encode(output.getvalue()).decode(), "mime_type": "audio/wav"}
                return self.send_json(200, {"audio": audio["data"], "mimeType": audio.get("mime_type", "audio/mp3")})
            reply = ""
            for step in result.get("steps", []):
                if step.get("type") == "model_output": reply += " ".join(b.get("text", "") for b in step.get("content", []) if b.get("type") == "text")
            if not reply.strip(): raise ValueError()
            return self.send_json(200, {"transcript" if action == "transcribe" else "reply": reply.strip(), "model": MODEL})
        except urllib.error.HTTPError as error: return self.send_json(502, {"error": f"Gemini recusou a solicitação ({error.code})"})
        except (urllib.error.URLError, TimeoutError): return self.send_json(504, {"error": "Gemini temporariamente indisponível"})
        except (ValueError, KeyError, json.JSONDecodeError): return self.send_json(502, {"error": "Resposta inválida do Gemini"})
        except Exception: return self.send_json(502, {"error": "Falha inesperada na comunicação com o Gemini"})

    def log_message(self, fmt, *args):
        if not self.path.startswith("/api/"): super().log_message(fmt, *args)


if __name__ == "__main__":
    init_db(); print(f"Dr. Estomato disponível em http://{HOST}:{PORT}"); print(f"Gemini: {'configurado' if gemini_api_key() else 'não configurado'} · Web Push: {'configurado' if VAPID_PUBLIC_KEY else 'indisponível'}")
    ThreadingHTTPServer((HOST, PORT), AppHandler).serve_forever()
