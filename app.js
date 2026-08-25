const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];

const PATIENT_SESSION_KEY = 'dr-estomato-patient-session-v2';
const CLINICAL_GUIDELINE_URL = 'https://bvsms.saude.gov.br/bvs/publicacoes/diretriz_pratica_odontologica_aps_cancer.pdf';
const CLINICAL_BOOK_REFERENCE = 'Bonan, Perez e Mélo. Diagnóstico diferencial de lesões bucais na clínica odontológica, 2014.';
const UNESP_CEDOB = {
  name: 'Ambulatório de Estomatologia (CEDOB) · ICT/UNESP',
  address: 'Av. Eng. Francisco José Longo, 777 · Jardim São Dimas · São José dos Campos',
  phone: '(12) 3947-9000'
};
const state = { patient: null, answers: [], step: 0, sound: true, currentCase: null, currentCaseId: null, currentCaseToken: null, coords: null, pollTimer: null, navigatorMessageCount: 0 };

const questions = [
  { text: 'Para começar, conte com suas palavras o que está acontecendo na sua boca.', chips: ['Estou com dor', 'Tenho uma ferida', 'Notei um inchaço', 'É uma dúvida de rotina'] },
  { text: 'Há quanto tempo você percebeu isso?', chips: ['Hoje', 'De 2 a 7 dias', 'De 8 a 14 dias', 'Mais de 14 dias'] },
  { text: 'Você está com febre, inchaço no rosto ou pescoço, ou dificuldade para abrir a boca?', chips: ['Não', 'Febre e inchaço', 'Dificuldade para abrir a boca'] },
  { text: 'Está com dificuldade para respirar ou engolir, ou com sangramento que não para?', chips: ['Não', 'Dificuldade para respirar', 'Dificuldade para engolir', 'Sangramento não para'] },
  { text: 'Qual destas opções mais se parece com a alteração?', chips: ['Ferida ou úlcera', 'Mancha ou placa branca/vermelha', 'Caroço, nódulo ou endurecimento', 'Bolha ou vesícula', 'Outra ou nenhuma'] },
  { text: 'Em que região da boca está a alteração?', chips: ['Língua', 'Embaixo da língua', 'Lábio', 'Gengiva ou céu da boca', 'Outra região', 'Não se aplica'] },
  { text: 'Ela está crescendo, não cicatriza, tem parte endurecida ou sangra facilmente?', chips: ['Não', 'Está crescendo', 'Não cicatriza', 'Está endurecida', 'Sangra facilmente', 'Não se aplica'] },
  { text: 'Você fuma ou já fumou algum produto de tabaco?', chips: ['Nunca fumei', 'Fumo atualmente', 'Já fumei', 'Prefiro não informar'] },
  { text: 'Com que frequência você consome bebidas alcoólicas?', chips: ['Não consumo', 'Ocasionalmente', 'Frequentemente', 'Prefiro não informar'] },
  { text: 'A dor impede você de dormir ou realizar suas atividades?', chips: ['Não sinto dor', 'Dor leve', 'Dor moderada', 'Sim, impede'] }
];

function esc(value = '') { const el = document.createElement('span'); el.textContent = String(value); return el.innerHTML; }
function showScreen(id) { $$('.card-screen').forEach(el => el.classList.toggle('active', el.id === id)); }
function now() { return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
let preferredVoice = null, currentAudio = null, speechRequest = 0;
function selectNaturalMaleVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices(), pt = voices.filter(v => /^pt[-_]BR/i.test(v.lang));
  const maleNames = /antonio|ant[oô]nio|ricardo|felipe|daniel|tiago|thiago|joaquim|jorge|paulo|miguel|rafael|marcelo|carlos|davi|male|masculin/i;
  preferredVoice = pt.find(v => maleNames.test(v.name)) || null;
}
selectNaturalMaleVoice();
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = selectNaturalMaleVoice;
function browserSpeak(text) {
  if (!('speechSynthesis' in window) || !preferredVoice) return false;
  speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'pt-BR';
  u.voice = preferredVoice; u.rate = .89; u.pitch = .86; u.volume = 1; speechSynthesis.speak(u); return true;
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
  if (type === 'bot' && state.sound && !browserSpeak(text)) speak(text);
}

function renderQuestionChips(question) {
  $('#quickReplies').innerHTML = '';
  question.chips.forEach(label => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => submitAnswer(label); $('#quickReplies').append(b); });
}

function startDialogue(patient) {
  const first = questions[0];
  addMessage(`Olá, ${patient.name}. Eu sou o Dr. Estomato. Antes de você responder, preciso explicar: esta conversa não fornece diagnóstico. Ela ajuda a reconhecer sinais que precisam de avaliação presencial. ${first.text}`);
  renderQuestionChips(first);
}

function askQuestion() {
  const q = questions[state.step];
  if (!q) return finishTriage();
  const typing = document.createElement('div'); typing.className = 'typing'; typing.innerHTML = '<i></i><i></i><i></i>';
  $('#chatMessages').append(typing); $('#quickReplies').innerHTML = '';
  setTimeout(() => {
    typing.remove(); addMessage(q.text);
    renderQuestionChips(q);
  }, 520);
}

function askNextQuestion() {
  const q = questions[state.step];
  if (!q) return finishTriage();
  const typing = document.createElement('div'); typing.className = 'typing'; typing.innerHTML = '<i></i><i></i><i></i>';
  $('#chatMessages').append(typing); $('#quickReplies').innerHTML = ''; $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
  setTimeout(() => {
    typing.remove(); addMessage(q.text);
    renderQuestionChips(q);
  }, 220);
}

function emergencySignal(text) { return /dificuldade.*(respirar|engolir)|n[aã]o consigo (respirar|engolir)|falta de ar|sangramento.*(não|nao).*para|febre.*incha|incha.*febre|trauma.*grave/i.test(text); }
function submitAnswer(text, source = 'text') {
  if (!text.trim()) return;
  addMessage(source === 'audio' ? `🎙 ${text.trim()}` : text.trim(), 'user'); state.answers.push(text.trim()); $('#quickReplies').innerHTML = ''; $('#messageInput').value = '';
  if (emergencySignal(text)) { setTimeout(finishTriage, 450); return; }
  state.step += 1; setTimeout(askNextQuestion, 120);
}

function classify(answers) {
  const t = answers.join(' ').toLowerCase();
  const red = /dificuldade.*(respirar|engolir)|não consigo (respirar|engolir)|nao consigo (respirar|engolir)|falta de ar|sangramento.*(não|nao).*para|febre.*incha|incha.*febre|sim, impede|trauma.*grave|dor.*pulsátil|dor.*pulsatil/.test(t);
  const yellow = /mais de 14 dias|não cicatriza|nao cicatriza|sangra facilmente|ferida|úlcera|ulcera|mancha (branca|vermelha|escura)|placa (branca|vermelha|escura)|caroço|caroco|nódulo|nodulo|endurecimento|endurecida|aumentando|crescendo|prótese|protese|mobilidade/.test(t);
  return red ? 'red' : yellow ? 'yellow' : 'green';
}

function diagnosticPossibilities(answers) {
  const t = answers.join(' ').toLowerCase(), possibilities = [];
  const add = value => { if (!possibilities.includes(value)) possibilities.push(value); };
  if (/ferida|úlcera|ulcera|erosão|erosao/.test(t)) {
    add('causas traumáticas ou reacionais');
    add('processos infecciosos, inflamatórios ou imunologicamente mediados');
  }
  if (/mancha|placa|branca|vermelha/.test(t)) {
    add('alterações reacionais ou inflamatórias da mucosa');
    add('infecções da mucosa oral');
  }
  if (/caroço|caroco|nódulo|nodulo|endurec/.test(t)) {
    add('lesões reacionais e alterações de glândulas salivares ou vasos');
    add('neoplasias benignas ou malignas, que só o exame pode diferenciar');
  }
  if (/bolha|vesícula|vesicula/.test(t)) {
    add('infecções virais, extravasamento de muco ou doenças imunologicamente mediadas');
  }
  const warning = /mais de 14 dias|não cicatriza|nao cicatriza|crescendo|endurecida|sangra facilmente|mancha|placa/.test(t);
  if (warning) add('desordens orais potencialmente malignas ou câncer de boca, que precisam ser descartados presencialmente');
  if (!possibilities.length) add('causas dentárias, traumáticas, inflamatórias ou infecciosas comuns');
  return possibilities.slice(0, 6);
}

function riskFactorSummary(answers) {
  const t = answers.join(' ').toLowerCase(), factors = [];
  if (/fumo atualmente/.test(t)) factors.push('tabagismo atual');
  else if (/já fumei|ja fumei/.test(t)) factors.push('tabagismo prévio');
  if (/frequentemente/.test(t)) factors.push('consumo frequente de álcool');
  else if (/ocasionalmente/.test(t)) factors.push('consumo ocasional de álcool');
  if (!factors.length) return '';
  return `Foi relatado ${factors.join(' e ')}. Esse histórico ajuda a definir a prioridade da avaliação, mas não confirma nenhuma doença.`;
}

const riskCopy = {
  red: { label: 'Atenção imediata', title: 'É importante buscar atendimento agora.', icon: '!', body: 'Os sinais relatados precisam ser avaliados presencialmente com urgência. Vá com calma à UPA mais próxima; se houver falta de ar intensa ou piora rápida, ligue 192.', action: 'Procure uma UPA agora', place: 'upa' },
  yellow: { label: 'Avaliação prioritária', title: 'Agende uma avaliação em curto prazo.', icon: '◷', body: 'O que você relatou precisa ser examinado de perto por um cirurgião-dentista. Procure a unidade de saúde mais próxima da sua casa ou confirme o acesso ao Ambulatório de Estomatologia do ICT/UNESP.', action: 'Busque avaliação na UBS mais próxima ou no Ambulatório de Estomatologia do ICT/UNESP', place: 'ubs' },
  green: { label: 'Cuidado de rotina', title: 'Não parece haver risco imediato.', icon: '✓', body: 'Muitas alterações da boca são comuns e não trazem risco imediato. Ainda assim, apenas o exame presencial confirma; marque uma consulta de rotina na unidade de saúde mais próxima da sua casa.', action: 'Agende uma consulta na UBS mais próxima', place: 'ubs' }
};

function patientLocation(caseData) {
  return [caseData.street, caseData.number, caseData.neighborhood, caseData.city].filter(Boolean).join(', ') || caseData.address || 'São José dos Campos';
}

function nearestCare(caseData, coords, place) {
  const emergency = place === 'upa', type = emergency ? 'UPA 24 horas' : 'UBS';
  const location = coords ? `${coords.latitude},${coords.longitude}` : patientLocation(caseData);
  return {
    name: emergency ? 'UPA mais próxima de você' : 'Unidade de saúde mais próxima da sua casa',
    detail: coords ? 'Busca baseada na localização compartilhada' : `Busca próxima de ${caseData.neighborhood || caseData.city || 'sua residência'}`,
    mapQuery: `${type} perto de ${location}`
  };
}

function guidanceSpeech(caseData) {
  const copy = riskCopy[caseData?.risk];
  if (!copy) return '';
  const greeting = caseData.name ? `Orientação para ${caseData.name}. ` : '';
  const possibilities = (caseData.possibilities || []).slice(0, 3).join('; ');
  const differential = possibilities ? `Isto não é um diagnóstico. No exame, o profissional precisará avaliar possibilidades como ${possibilities}. ` : 'Isto não é um diagnóstico. ';
  return `${greeting}${copy.title} ${copy.body} ${differential}${caseData.riskFactors || ''} ${copy.action}. Leve documento com foto, Cartão SUS, se tiver, e comprovante de endereço. Não se automedique.`;
}

async function readGuidance() {
  const button = $('#readGuidance'), text = guidanceSpeech(state.currentCase);
  if (!button || !text) return;
  state.sound = true;
  const soundToggle = $('#soundToggle');
  if (soundToggle) { soundToggle.classList.add('sound-on'); soundToggle.textContent = '◖))'; }
  button.disabled = true; button.innerHTML = '<span aria-hidden="true">◌</span><span><strong>Preparando áudio…</strong><small>Aguarde um instante</small></span>';
  await speak(text);
  button.disabled = false; button.innerHTML = '<span aria-hidden="true">▶</span><span><strong>Ouvir orientação novamente</strong><small>Leitura em voz pelo Dr. Estomato</small></span>';
}

async function finishTriage() {
  const risk = classify(state.answers), copy = riskCopy[risk];
  const caseData = { ...state.patient, risk, answers: state.answers, possibilities: diagnosticPossibilities(state.answers), riskFactors: riskFactorSummary(state.answers), createdAt: new Date().toISOString(), status: 'Aguardando retorno', messages: [{ from: 'system', text: `Triagem concluída: ${copy.label}. Não constitui diagnóstico.`, sentAt: new Date().toISOString() }] };
  try {
    const response = await fetch('/api/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(caseData) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    state.currentCase = data.case; state.currentCaseId = data.case.id; state.currentCaseToken = data.patientToken;
    localStorage.setItem(PATIENT_SESSION_KEY, JSON.stringify({ id: state.currentCaseId, token: state.currentCaseToken }));
  } catch {
    toast('Não foi possível salvar o atendimento. Tente novamente.');
    return;
  }
  renderResult(state.currentCase, state.coords, true);
  startCasePolling();
}

function renderResult(caseData, coords = null, autoSpeak = false) {
  const risk = caseData.risk, copy = riskCopy[risk], care = nearestCare(caseData, coords, copy.place);
  const unespOrigin = coords ? `${coords.latitude},${coords.longitude}` : patientLocation(caseData);
  const unespRoute = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(unespOrigin)}&destination=${encodeURIComponent(UNESP_CEDOB.address)}`;
  const unespCard = risk === 'yellow' ? `<div class="unit-card specialty-card"><span class="unit-pin">DE</span><div><strong>${UNESP_CEDOB.name}</strong><small>${UNESP_CEDOB.address} · Atendimento gratuito; confirme antes de sair</small></div><span class="unit-actions"><a href="${unespRoute}" target="_blank" rel="noreferrer">Traçar rota ↗</a><a href="tel:+551239479000">Ligar ${UNESP_CEDOB.phone}</a></span></div>` : '';
  const possibilities = Array.isArray(caseData.possibilities) && caseData.possibilities.length ? caseData.possibilities : diagnosticPossibilities(caseData.answers || []);
  const riskFactors = caseData.riskFactors || riskFactorSummary(caseData.answers || []);
  const possibilityItems = possibilities.map(item => `<li>${esc(item)}</li>`).join('');
  $('#resultScreen').innerHTML = `
    <div class="result-top"><span class="risk-symbol ${risk}">${copy.icon}</span><span class="eyebrow">${copy.label}</span><h2>${copy.title}</h2><p>${copy.body}</p></div>
    <div class="action-card"><strong>Orientação para ${esc(state.patient.name)}</strong><p>${copy.action}. Leve documento com foto, Cartão SUS (se tiver) e comprovante de endereço. Não se automedique.</p></div>
    <section class="possibility-card"><strong>Possibilidades que precisam ser avaliadas</strong><p>Isso não é diagnóstico. Alterações parecidas podem ter causas diferentes; o cirurgião-dentista precisa examinar a boca para diferenciá-las.</p><ul>${possibilityItems}</ul>${riskFactors ? `<div class="risk-context"><strong>Histórico informado</strong><span>${esc(riskFactors)}</span></div>` : ''}</section>
    <button id="readGuidance" class="guidance-audio-btn" type="button"><span aria-hidden="true">▶</span><span><strong>Ouvir orientação</strong><small>Leitura em voz pelo Dr. Estomato</small></span></button>
    <aside class="clinical-source"><strong>Base clínica</strong><p>Os grupos acima seguem os diagramas por lesão fundamental do livro e os sinais de alerta da diretriz. Eles organizam possibilidades para avaliação profissional; não determinam doença. Conforme o exame, a conduta pode incluir biópsia ou encaminhamento.</p><a href="${CLINICAL_GUIDELINE_URL}" target="_blank" rel="noreferrer">Diretriz do Ministério da Saúde sobre diagnóstico do câncer de boca ↗</a><span>${CLINICAL_BOOK_REFERENCE}</span></aside>
    <section class="referral-options"><strong class="referral-title">Onde buscar atendimento</strong><div class="unit-card"><span class="unit-pin">⌖</span><div><strong>${care.name}</strong><small>${care.detail} · Compare distância, horário e rota antes de sair</small></div><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(care.mapQuery)}" target="_blank" rel="noreferrer">Ver unidades ↗</a></div>${unespCard}</section>
    <div class="unit-card"><span class="unit-pin">☎</span><div><strong>Central 156</strong><small>Confirme a unidade de referência, endereço e horário antes de sair</small></div><a href="tel:156">Ligar</a></div>
    <section class="patient-followup"><div class="patient-followup-title"><span>◉</span><div><strong>Converse com a equipe</strong><small>As mensagens ficam disponíveis neste aparelho</small></div></div><button id="enableNotifications" class="notification-btn" type="button">🔔 Ativar notificações no celular</button><p id="notificationHelp" class="notification-help">Autorize para receber um aviso quando o navegador responder.</p><div id="patientChatMessages" class="patient-chat-messages"></div><form id="patientChatForm" class="patient-chat-form"><input id="patientChatInput" placeholder="Escreva uma mensagem para o navegador…" required><button aria-label="Enviar mensagem">➤</button></form></section>
    <div class="result-actions"><button class="secondary-btn" onclick="window.print()">Salvar orientação</button><button class="primary-btn" onclick="restart()">Nova triagem</button></div>`;
  showScreen('resultScreen'); renderPatientChat();
  $('#readGuidance').onclick = readGuidance;
  $('#enableNotifications').onclick = enableNotifications;
  updateNotificationButton();
  if (state.sound && autoSpeak) setTimeout(readGuidance, 350);
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
  showScreen('chatScreen'); startDialogue(data);
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
let speechRecognition = null, directTranscript = '';
function formatDuration(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function clearRecording() {
  if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; recordedBlob = null; audioChunks = [];
  $('#recordingPanel').hidden = true; $('#recordingPanel').classList.remove('recording'); $('#recordingPreview').removeAttribute('src');
}
function resetVoiceButton() { $('#voiceBtn').classList.remove('listening'); $('#voiceBtn').disabled = false; $('#voiceBtn').setAttribute('aria-label', 'Falar resposta'); }

function startDirectSpeechInput() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return startRecording();
  clearRecording(); directTranscript = ''; speechRecognition = new Recognition(); speechRecognition.lang = 'pt-BR'; speechRecognition.interimResults = true; speechRecognition.continuous = false;
  $('#recordingPanel').hidden = false; $('#recordingPanel').classList.add('recording'); $('#recordingLabel').textContent = 'Ouvindo… fale sua resposta'; $('#recordingTime').textContent = 'Envio automático'; $('#recordingPreview').hidden = true; $('.recording-actions').hidden = true; $('#voiceBtn').classList.add('listening'); $('#voiceBtn').setAttribute('aria-label', 'Parar e enviar fala');
  speechRecognition.onresult = event => {
    const parts = [];
    for (let i = 0; i < event.results.length; i++) parts.push(event.results[i][0].transcript);
    directTranscript = parts.join(' ').trim();
    if (directTranscript) $('#recordingLabel').textContent = directTranscript;
  };
  speechRecognition.onerror = event => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') toast('Autorize o microfone para responder por voz.');
    else if (event.error !== 'no-speech' && event.error !== 'aborted') toast('Não foi possível reconhecer a fala. Tente novamente.');
  };
  speechRecognition.onend = () => {
    speechRecognition = null; resetVoiceButton(); clearRecording();
    if (directTranscript) submitAnswer(directTranscript, 'audio');
    else toast('Nenhuma fala foi identificada. Toque no microfone e tente novamente.');
  };
  try { speechRecognition.start(); } catch { speechRecognition = null; resetVoiceButton(); clearRecording(); startRecording(); }
}

async function transcribeAndSubmit(blob) {
  if (!blob) return;
  $('#recordingPanel').hidden = false; $('#recordingPanel').classList.remove('recording'); $('#recordingLabel').textContent = 'Entendendo sua resposta…'; $('#recordingTime').textContent = 'Envio automático'; $('#voiceBtn').disabled = true;
  try {
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    const response = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: dataUrl.split(',')[1], mimeType: blob.type }) });
    const data = await response.json(); if (!response.ok || !data.transcript) throw new Error(data.error);
    clearRecording(); resetVoiceButton(); submitAnswer(data.transcript, 'audio');
  } catch { clearRecording(); resetVoiceButton(); toast('Não foi possível entender o áudio. Toque no microfone e tente novamente.'); }
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
      recordedBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' }); resetVoiceButton(); transcribeAndSubmit(recordedBlob);
    };
    mediaRecorder.start(); recordingTimer = setInterval(() => { recordingSeconds++; $('#recordingTime').textContent = formatDuration(recordingSeconds); if (recordingSeconds >= 45) stopRecording(); }, 1000);
  } catch { toast('Não foi possível acessar o microfone. Confira a permissão do navegador.'); }
}
function stopRecording() { if (mediaRecorder?.state === 'recording') mediaRecorder.stop(); }
$('#voiceBtn').onclick = () => speechRecognition ? speechRecognition.stop() : mediaRecorder?.state === 'recording' ? stopRecording() : startDirectSpeechInput();
$('#discardRecording').onclick = clearRecording;
$('#sendRecording').onclick = () => transcribeAndSubmit(recordedBlob);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
restorePatientCase();
