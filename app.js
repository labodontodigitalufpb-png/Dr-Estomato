const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];

const PATIENT_SESSION_KEY = 'dr-estomato-patient-session-v2';
const state = { patient: null, answers: [], step: 0, sound: true, currentCase: null, currentCaseId: null, currentCaseToken: null, coords: null, pollTimer: null, navigatorMessageCount: 0 };

const questions = [
  { text: 'Para começar, conte com suas palavras o que está acontecendo na sua boca.', chips: ['Estou com dor', 'Tenho uma ferida', 'Notei um inchaço', 'É uma dúvida de rotina'] },
  { text: 'Há quanto tempo você percebeu isso?', chips: ['Hoje', 'De 2 a 7 dias', 'De 8 a 14 dias', 'Mais de 14 dias'] },
  { text: 'Você está com febre, inchaço no rosto ou pescoço, ou dificuldade para abrir a boca?', chips: ['Não', 'Febre e inchaço', 'Dificuldade para abrir a boca'] },
  { text: 'Está com dificuldade para respirar ou engolir, ou com sangramento que não para?', chips: ['Não', 'Dificuldade para respirar', 'Dificuldade para engolir', 'Sangramento não para'] },
  { text: 'A dor impede você de dormir ou realizar suas atividades?', chips: ['Não sinto dor', 'Dor leve', 'Dor moderada', 'Sim, impede'] }
];

const units = {
  central: { ubs: ['UBS Resolve Centro 1', 'Av. Dr. João Guilhermino, 317 · Centro'], upa: ['UPA mais próxima', 'Confirme pelo telefone 156 antes de sair'] },
  sul: { ubs: ['UBS Jardim Satélite', 'Av. Andrômeda, 1960 · Jardim Satélite'], upa: ['UPA Campo dos Alemães', 'R. João Batista do Nascimento, 359'] },
  leste: { ubs: ['UBS Vila Industrial', 'R. Felício Savastano, 440 · Vila Industrial'], upa: ['UPA Novo Horizonte', 'Av. Tancredo Neves, 5120'] },
  norte: { ubs: ['UBS Santana', 'Av. Rui Barbosa, 2455 · Santana'], upa: ['UPA Alto da Ponte', 'R. Alziro Lebrão, 76'] },
  sudeste: { ubs: ['UBS Putim', 'R. Roberto Aparecido Cruz, 100 · Santo Onofre'], upa: ['UPA Putim', 'Av. João Rodolfo Castelli, 1035'] },
  oeste: { ubs: ['UBS Jardim das Indústrias', 'R. Pirassununga, 130 · Jardim das Indústrias'], upa: ['UPA mais próxima', 'Confirme pelo telefone 156 antes de sair'] }
};

function regionFor(address = '') {
  const a = address.toLowerCase();
  if (/sat[eé]lite|bosque|morumbi|oriente|industrial|alem[aã]es|colonial|dom pedro|reunidas/.test(a)) return 'sul';
  if (/santana|alto da ponte|telespark|buquirinha|são francisco/.test(a)) return 'norte';
  if (/putim|granja|são judas|vila nair/.test(a)) return 'sudeste';
  if (/novo horizonte|eug[eê]nio|galo branco|vista verde|tesouro|detroit|santa in[eê]s/.test(a)) return 'leste';
  if (/indústrias|limoeiro|aquarius|urbanova/.test(a)) return 'oeste';
  return 'central';
}

function esc(value = '') { const el = document.createElement('span'); el.textContent = String(value); return el.innerHTML; }
function showScreen(id) { $$('.card-screen').forEach(el => el.classList.toggle('active', el.id === id)); }
function now() { return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
let preferredVoice = null, currentAudio = null, speechRequest = 0;
function selectNaturalMaleVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices(), pt = voices.filter(v => /^pt[-_]BR/i.test(v.lang));
  const maleNames = /antonio|ant[oô]nio|ricardo|felipe|daniel|tiago|male|masculin/i;
  preferredVoice = pt.find(v => maleNames.test(v.name)) || pt.find(v => /google|microsoft|premium|enhanced|natural/i.test(v.name)) || pt[0] || null;
}
selectNaturalMaleVoice();
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = selectNaturalMaleVoice;
function browserSpeak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'pt-BR';
  if (preferredVoice) u.voice = preferredVoice; u.rate = .89; u.pitch = .86; u.volume = 1; speechSynthesis.speak(u);
}
async function speak(text) {
  if (!state.sound) return;
  const requestId = ++speechRequest;
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  try {
    const response = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    if (!response.ok) throw new Error('TTS indisponível');
    const data = await response.json(); if (requestId !== speechRequest || !state.sound) return;
    currentAudio = new Audio(`data:${data.mimeType};base64,${data.audio}`); await currentAudio.play();
  } catch { if (requestId === speechRequest && state.sound) browserSpeak(text); }
}
function toast(text) { const el = $('#toast'); el.textContent = text; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2600); }
function messageTime(date = new Date()) { return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }

function addMessage(text, type = 'bot') {
  const el = document.createElement('div'); el.className = `message ${type}`;
  const p = document.createElement('p'); p.textContent = text;
  el.append(p); el.insertAdjacentHTML('beforeend', `<time>${now()}</time>`);
  $('#chatMessages').append(el); $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
  if (type === 'bot') speak(text);
}

function askQuestion() {
  const q = questions[state.step];
  if (!q) return finishTriage();
  const typing = document.createElement('div'); typing.className = 'typing'; typing.innerHTML = '<i></i><i></i><i></i>';
  $('#chatMessages').append(typing); $('#quickReplies').innerHTML = '';
  setTimeout(() => {
    typing.remove(); addMessage(q.text);
    q.chips.forEach(label => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => submitAnswer(label); $('#quickReplies').append(b); });
  }, 520);
}

async function askNextWithGemini(userText) {
  const q = questions[state.step];
  if (!q) return finishTriage();
  const typing = document.createElement('div'); typing.className = 'typing'; typing.innerHTML = '<i></i><i></i><i></i>';
  $('#chatMessages').append(typing); $('#quickReplies').innerHTML = ''; $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
  let reply = q.text;
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: userText, nextQuestion: q.text }) });
    if (response.ok) { const data = await response.json(); if (data.reply) reply = data.reply; }
  } catch { /* A pergunta local mantém o atendimento disponível. */ }
  typing.remove(); addMessage(reply);
  q.chips.forEach(label => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => submitAnswer(label); $('#quickReplies').append(b); });
}

function emergencySignal(text) { return /dificuldade.*(respirar|engolir)|n[aã]o consigo (respirar|engolir)|falta de ar|sangramento.*(não|nao).*para|febre.*incha|incha.*febre|trauma.*grave/i.test(text); }
function submitAnswer(text, source = 'text') {
  if (!text.trim()) return;
  addMessage(source === 'audio' ? `🎙 ${text.trim()}` : text.trim(), 'user'); state.answers.push(text.trim()); $('#quickReplies').innerHTML = ''; $('#messageInput').value = '';
  if (emergencySignal(text)) { setTimeout(finishTriage, 450); return; }
  state.step += 1; setTimeout(() => askNextWithGemini(text.trim()), 250);
}

function classify(answers) {
  const t = answers.join(' ').toLowerCase();
  const red = /dificuldade.*(respirar|engolir)|não consigo (respirar|engolir)|nao consigo (respirar|engolir)|falta de ar|sangramento.*(não|nao).*para|febre.*incha|incha.*febre|sim, impede|trauma.*grave|dor.*pulsátil|dor.*pulsatil/.test(t);
  const yellow = /mais de 14 dias|ferida|úlcera|ulcera|mancha (branca|vermelha|escura)|caroço|caroco|nódulo|nodulo|prótese|protese|mobilidade/.test(t);
  return red ? 'red' : yellow ? 'yellow' : 'green';
}

const riskCopy = {
  red: { label: 'Atenção imediata', title: 'É importante buscar atendimento agora.', icon: '!', body: 'Os sinais relatados precisam ser avaliados presencialmente com urgência. Vá com calma à UPA mais próxima; se houver falta de ar intensa ou piora rápida, ligue 192.', action: 'Procure uma UPA agora', place: 'upa' },
  yellow: { label: 'Avaliação prioritária', title: 'Agende uma avaliação em curto prazo.', icon: '◷', body: 'O que você relatou precisa ser examinado de perto por um cirurgião-dentista. Procure sua UBS de referência nos próximos dias; se necessário, a equipe fará o encaminhamento ao CEO.', action: 'Procure sua UBS em curto prazo', place: 'ubs' },
  green: { label: 'Cuidado de rotina', title: 'Não parece haver risco imediato.', icon: '✓', body: 'Muitas alterações da boca são comuns e não trazem risco imediato. Ainda assim, apenas o exame presencial confirma; marque uma consulta de rotina na UBS do seu bairro.', action: 'Agende uma consulta de rotina', place: 'ubs' }
};

async function finishTriage() {
  const risk = classify(state.answers), copy = riskCopy[risk], region = regionFor(state.patient.address);
  const unit = state.coords ? [`${copy.place === 'upa' ? 'UPAs' : 'UBSs'} perto de você`, 'Use o mapa para comparar distância e rota'] : units[region][copy.place];
  const mapQuery = state.coords ? `${copy.place === 'upa' ? 'UPA 24 horas' : 'UBS'} perto de ${state.coords.latitude},${state.coords.longitude}` : `${unit[0]} São José dos Campos`;
  const caseData = { ...state.patient, risk, answers: state.answers, createdAt: new Date().toISOString(), status: 'Aguardando retorno', messages: [{ from: 'system', text: `Triagem concluída: ${copy.label}.`, sentAt: new Date().toISOString() }] };
  try {
    const response = await fetch('/api/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(caseData) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    state.currentCase = data.case; state.currentCaseId = data.case.id; state.currentCaseToken = data.patientToken;
    localStorage.setItem(PATIENT_SESSION_KEY, JSON.stringify({ id: state.currentCaseId, token: state.currentCaseToken }));
  } catch {
    toast('Não foi possível salvar o atendimento. Tente novamente.');
    return;
  }
  renderResult(state.currentCase, unit, mapQuery);
  startCasePolling();
}

function renderResult(caseData, suppliedUnit = null, suppliedMapQuery = null) {
  const risk = caseData.risk, copy = riskCopy[risk], region = regionFor(caseData.address);
  const unit = suppliedUnit || units[region][copy.place];
  const mapQuery = suppliedMapQuery || `${unit[0]} São José dos Campos`;
  $('#resultScreen').innerHTML = `
    <div class="result-top"><span class="risk-symbol ${risk}">${copy.icon}</span><span class="eyebrow">${copy.label}</span><h2>${copy.title}</h2><p>${copy.body}</p></div>
    <div class="action-card"><strong>Orientação para ${esc(state.patient.name)}</strong><p>${copy.action}. Leve documento com foto, Cartão SUS (se tiver) e comprovante de endereço. Não se automedique.</p></div>
    <div class="unit-card"><span class="unit-pin">⌖</span><div><strong>${unit[0]}</strong><small>${unit[1]} · Confirme a referência antes de sair</small></div><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}" target="_blank" rel="noreferrer">Ver mapa ↗</a></div>
    <div class="unit-card"><span class="unit-pin">☎</span><div><strong>Central 156</strong><small>Confirme a unidade de referência, endereço e horário antes de sair</small></div><a href="tel:156">Ligar</a></div>
    <section class="patient-followup"><div class="patient-followup-title"><span>◉</span><div><strong>Converse com a equipe</strong><small>As mensagens ficam disponíveis neste aparelho</small></div></div><button id="enableNotifications" class="notification-btn" type="button">🔔 Ativar notificações no celular</button><p id="notificationHelp" class="notification-help">Autorize para receber um aviso quando o navegador responder.</p><div id="patientChatMessages" class="patient-chat-messages"></div><form id="patientChatForm" class="patient-chat-form"><input id="patientChatInput" placeholder="Escreva uma mensagem para o navegador…" required><button aria-label="Enviar mensagem">➤</button></form></section>
    <div class="result-actions"><button class="secondary-btn" onclick="window.print()">Salvar orientação</button><button class="primary-btn" onclick="restart()">Nova triagem</button></div>`;
  showScreen('resultScreen'); renderPatientChat();
  $('#enableNotifications').onclick = enableNotifications;
  updateNotificationButton();
}

function renderPatientChat() {
  const c = state.currentCase, list = $('#patientChatMessages');
  if (!c || !list) return;
  const visible = (c.messages || []).filter(m => m.from !== 'system');
  list.innerHTML = visible.length ? visible.map(m => `<div class="patient-chat-bubble ${m.from === 'patient' ? 'mine' : ''}"><span>${m.from === 'patient' ? 'Você' : 'Navegador'}</span><p>${esc(m.text)}</p><time>${messageTime(m.sentAt)}</time></div>`).join('') : '<p class="chat-empty">Nenhuma mensagem ainda. A equipe poderá acompanhar as dificuldades relatadas por aqui.</p>';
  list.scrollTop = list.scrollHeight;
  const form = $('#patientChatForm');
  form.onsubmit = async e => {
    e.preventDefault(); const input = $('#patientChatInput'), text = input.value.trim(); if (!text) return;
    input.disabled = true;
    try {
      const response = await patientFetch(`/api/cases/${state.currentCaseId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      state.currentCase = data.case; input.value = ''; renderPatientChat(); toast('Mensagem enviada para o navegador');
    } catch { toast('Não foi possível enviar. Confira sua conexão.'); }
    finally { input.disabled = false; input.focus(); }
  };
}

function patientFetch(url, options = {}) {
  options.headers = { ...(options.headers || {}), 'X-Patient-Token': state.currentCaseToken };
  return fetch(url, options);
}

async function refreshCurrentCase(notify = true) {
  if (!state.currentCaseId || !state.currentCaseToken) return;
  try {
    const response = await patientFetch(`/api/cases/${state.currentCaseId}`); if (!response.ok) return;
    const data = await response.json();
    const newCount = (data.case.messages || []).filter(m => m.from === 'navigator').length;
    if (notify && newCount > state.navigatorMessageCount) {
      toast('Você recebeu uma mensagem da equipe.');
      if (document.hidden && Notification.permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        registration.showNotification('Dr. Estomato', { body: 'Você recebeu uma nova mensagem da equipe de acompanhamento.', icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', tag: `case-${state.currentCaseId}`, data: { url: '/' } });
      }
    }
    state.navigatorMessageCount = newCount; state.currentCase = data.case; renderPatientChat();
  } catch { /* a próxima atualização tenta novamente */ }
}

function startCasePolling() {
  clearInterval(state.pollTimer);
  state.navigatorMessageCount = (state.currentCase?.messages || []).filter(m => m.from === 'navigator').length;
  state.pollTimer = setInterval(() => refreshCurrentCase(true), 10000);
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4), base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

async function enableNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return toast('Este navegador não oferece notificações push.');
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return updateNotificationButton();
    const registration = await navigator.serviceWorker.ready;
    const keyResponse = await fetch('/api/push/public-key'), keyData = await keyResponse.json();
    if (!keyData.available) throw new Error('Push indisponível');
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(keyData.publicKey) });
    const response = await patientFetch(`/api/cases/${state.currentCaseId}/subscription`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
    if (!response.ok) throw new Error('Inscrição recusada');
    localStorage.setItem('dr-estomato-notifications', 'enabled'); updateNotificationButton(); toast('Notificações ativadas neste aparelho');
  } catch { toast('Não foi possível ativar. Em celulares, instale o app e use uma conexão HTTPS.'); }
}

function updateNotificationButton() {
  const button = $('#enableNotifications'), help = $('#notificationHelp'); if (!button) return;
  const enabled = 'Notification' in window && Notification.permission === 'granted' && localStorage.getItem('dr-estomato-notifications') === 'enabled';
  button.textContent = enabled ? '✓ Notificações ativadas' : '🔔 Ativar notificações no celular'; button.disabled = enabled;
  if (help) help.textContent = enabled ? 'Você receberá um aviso quando a equipe responder.' : 'No iPhone, adicione o app à Tela de Início antes de ativar.';
}

async function restorePatientCase() {
  let saved; try { saved = JSON.parse(localStorage.getItem(PATIENT_SESSION_KEY) || 'null'); } catch { return; }
  if (!saved?.id || !saved?.token) return;
  state.currentCaseId = saved.id; state.currentCaseToken = saved.token;
  await refreshCurrentCase(false);
  if (state.currentCase) { state.patient = state.currentCase; renderResult(state.currentCase); startCasePolling(); }
}

function restart() { clearInterval(state.pollTimer); localStorage.removeItem(PATIENT_SESSION_KEY); state.patient = null; state.currentCase = null; state.currentCaseId = null; state.currentCaseToken = null; state.answers = []; state.step = 0; $('#intakeForm').reset(); $('#chatMessages').innerHTML = ''; showScreen('intakeScreen'); }
window.restart = restart;

$('#intakeForm').addEventListener('submit', e => {
  e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget));
  data.address = `${data.street}, ${data.number}${data.apartment ? `, ${data.apartment}` : ''} · ${data.neighborhood} · ${data.city}`;
  state.patient = data; state.answers = []; state.step = 0;
  showScreen('chatScreen'); addMessage(`Olá, ${data.name}. Eu sou o Dr. Estomato. Vou ouvir você e ajudar a entender qual cuidado procurar. Minha orientação não substitui a avaliação presencial.`); setTimeout(askQuestion, 500);
});
$('#chatForm').addEventListener('submit', e => { e.preventDefault(); submitAnswer($('#messageInput').value); });
$('#backToIntake').onclick = () => showScreen('intakeScreen');
$('#geoBtn').onclick = () => {
  if (!navigator.geolocation) return toast('Localização não disponível neste navegador. Digite seu bairro.');
  const btn = $('#geoBtn'); btn.textContent = '⌖ Localizando…'; btn.disabled = true;
  navigator.geolocation.getCurrentPosition(pos => {
    state.coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    $('[name="street"]').value = `Localização compartilhada (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`;
    $('[name="number"]').value = 's/n'; $('[name="neighborhood"]').value = 'Localização atual'; $('[name="city"]').value = 'São José dos Campos';
    btn.textContent = '✓ Localização compartilhada'; btn.disabled = false; toast('Localização usada apenas para sugerir a rota');
  }, () => { btn.textContent = '⌖ Usar minha localização atual'; btn.disabled = false; toast('Não foi possível acessar a localização. Digite seu bairro.'); }, { enableHighAccuracy: false, timeout: 8000 });
};
$('#soundToggle').onclick = e => { state.sound = !state.sound; e.currentTarget.classList.toggle('sound-on', state.sound); e.currentTarget.textContent = state.sound ? '◖))' : '◖×'; if (!state.sound) { speechRequest++; speechSynthesis?.cancel(); currentAudio?.pause(); } toast(state.sound ? 'Leitura em voz ativada' : 'Leitura em voz desativada'); };

let mediaRecorder = null, mediaStream = null, audioChunks = [], recordedBlob = null, recordingTimer = null, recordingSeconds = 0, previewUrl = null;
function formatDuration(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function clearRecording() {
  if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; recordedBlob = null; audioChunks = [];
  $('#recordingPanel').hidden = true; $('#recordingPanel').classList.remove('recording'); $('#recordingPreview').removeAttribute('src');
}
async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Gravação de áudio não disponível neste navegador.');
  try {
    clearRecording(); mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'];
    const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type));
    mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
    audioChunks = []; recordingSeconds = 0; $('#recordingPanel').hidden = false; $('#recordingPanel').classList.add('recording'); $('#recordingLabel').textContent = 'Gravando… toque novamente para parar'; $('#recordingTime').textContent = '00:00'; $('#recordingPreview').hidden = true; $('.recording-actions').hidden = true; $('#voiceBtn').classList.add('listening'); $('#voiceBtn').setAttribute('aria-label', 'Parar gravação');
    mediaRecorder.ondataavailable = event => { if (event.data.size) audioChunks.push(event.data); };
    mediaRecorder.onstop = () => {
      clearInterval(recordingTimer); mediaStream?.getTracks().forEach(track => track.stop());
      recordedBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' }); previewUrl = URL.createObjectURL(recordedBlob); $('#recordingPreview').src = previewUrl; $('#recordingPreview').hidden = false; $('.recording-actions').hidden = false; $('#recordingPanel').classList.remove('recording'); $('#recordingLabel').textContent = 'Áudio pronto para enviar'; $('#voiceBtn').classList.remove('listening'); $('#voiceBtn').setAttribute('aria-label', 'Iniciar gravação de áudio');
    };
    mediaRecorder.start(); recordingTimer = setInterval(() => { recordingSeconds++; $('#recordingTime').textContent = formatDuration(recordingSeconds); if (recordingSeconds >= 45) stopRecording(); }, 1000);
  } catch { toast('Não foi possível acessar o microfone. Confira a permissão do navegador.'); }
}
function stopRecording() { if (mediaRecorder?.state === 'recording') mediaRecorder.stop(); }
$('#voiceBtn').onclick = () => mediaRecorder?.state === 'recording' ? stopRecording() : startRecording();
$('#discardRecording').onclick = clearRecording;
$('#sendRecording').onclick = async () => {
  if (!recordedBlob) return; const button = $('#sendRecording'); button.disabled = true; button.textContent = 'Transcrevendo…';
  try {
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(recordedBlob); });
    const response = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: dataUrl.split(',')[1], mimeType: recordedBlob.type }) });
    const data = await response.json(); if (!response.ok || !data.transcript) throw new Error(data.error);
    clearRecording(); submitAnswer(data.transcript, 'audio');
  } catch { toast('Não foi possível entender o áudio. Você pode gravar novamente ou digitar.'); button.disabled = false; button.textContent = 'Enviar áudio ➤'; }
};

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
restorePatientCase();
