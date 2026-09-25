const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];

const PATIENT_SESSION_KEY = 'dr-estomato-patient-session-v3';
const VOICE_KEY = 'dr-estomato-voice';
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/3.0.1/jspdf.umd.min.js';
const TEAM_CHAT_ENABLED = false; // acompanhamento com a equipe em espera; volte para true para reativar

const ICON = {
  pin: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.5S13 10 13 6.2A5 5 0 0 0 3 6.2C3 10 8 14.5 8 14.5Z"/><circle cx="8" cy="6.2" r="1.9"/></svg>',
  route: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M14.2 1.8 1.9 6.4l5 2.2 2.2 5 5.1-11.8Z"/><path d="M14.2 1.8 6.9 8.6"/></svg>',
  download: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8"/><path d="m4.8 7 3.2 3.2L11.2 7"/><path d="M2.4 12.2v1.4h11.2v-1.4"/></svg>',
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.2 3.3v9.4l8-4.7-8-4.7Z"/></svg>',
  phone: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.6h2.4l1.2 3-1.5 1.2a9.4 9.4 0 0 0 4.1 4.1l1.2-1.5 3 1.2v2.4a1 1 0 0 1-1.1 1A11.4 11.4 0 0 1 2 3.7a1 1 0 0 1 1-1.1Z"/></svg>',
};

const VALID_DDD = new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99]);
const CLINICAL_GUIDELINE_URL = 'https://bvsms.saude.gov.br/bvs/publicacoes/diretriz_pratica_odontologica_aps_cancer.pdf';
const CLINICAL_BOOK_REFERENCE = 'Bonan, Perez e Mélo. Diagnóstico diferencial de lesões bucais na clínica odontológica, 2014.';
const UNESP_CEDOB = {
  name: 'Ambulatório de Estomatologia (CEDOB) do ICT/UNESP',
  address: 'Av. Eng. Francisco José Longo, 777, Jardim São Dimas, São José dos Campos',
  phone: '(12) 3947-9000'
};
const state = { patient: null, answers: [], step: 0, sound: localStorage.getItem(VOICE_KEY) !== 'off', currentCase: null, currentCaseId: null, currentCaseToken: null, coords: null, pollTimer: null, navigatorMessageCount: 0, area: null, care: null };

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
function selectPreferredVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices();
  const ptBR = voices.filter(v => /^pt[-_]BR/i.test(v.lang));
  const maleNames = /antonio|ant[oô]nio|ricardo|felipe|daniel|tiago|thiago|joaquim|jorge|paulo|miguel|rafael|marcelo|carlos|davi|male|masculin/i;
  preferredVoice = ptBR.find(v => maleNames.test(v.name)) || ptBR.find(v => v.default) || ptBR[0] || null;
}
selectPreferredVoice();
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = selectPreferredVoice;
function browserSpeak(text) {
  if (!('speechSynthesis' in window) || !text) return false;
  if (!preferredVoice) selectPreferredVoice();
  if (!preferredVoice) return false;
  speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'pt-BR';
  u.voice = preferredVoice;
  u.rate = .89; u.pitch = .92; u.volume = 1;
  u.onerror = () => { if (state.sound) toast('A leitura em voz está bloqueada. Verifique o volume e a permissão de áudio do navegador.'); };
  speechSynthesis.speak(u);
  speechSynthesis.resume();
  return true;
}
async function speak(text, force = false) {
  if (!state.sound && !force) return;
  const requestId = ++speechRequest, wanted = () => requestId === speechRequest && (state.sound || force);
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  try {
    const response = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    if (!response.ok) throw new Error('TTS indisponível');
    const data = await response.json(); if (!wanted()) return;
    currentAudio = new Audio(`data:${data.mimeType};base64,${data.audio}`); await currentAudio.play();
  } catch { if (wanted()) browserSpeak(text); }
}

function stopSpeaking() { speechRequest++; if ('speechSynthesis' in window) speechSynthesis.cancel(); currentAudio?.pause(); currentAudio = null; }

function updateVoiceToggle() {
  const button = $('#soundToggle'); if (!button) return;
  button.classList.toggle('sound-on', state.sound);
  button.setAttribute('aria-pressed', String(state.sound));
  button.querySelector('.voice-toggle-icon').textContent = state.sound ? '◖))' : '◖×';
  $('#soundToggleLabel').textContent = state.sound ? 'Desativar voz' : 'Ativar voz';
  button.setAttribute('aria-label', state.sound ? 'Desativar a leitura em voz do assistente' : 'Ativar a leitura em voz do assistente');
}

function setVoice(enabled) {
  state.sound = enabled; localStorage.setItem(VOICE_KEY, enabled ? 'on' : 'off');
  if (!enabled) stopSpeaking();
  updateVoiceToggle();
  toast(enabled ? 'Leitura em voz ativada' : 'Leitura em voz desativada. A conversa continua em texto.');
}
function toast(text, duration = 2600) { const el = $('#toast'); el.textContent = text; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), duration); }
function messageTime(date = new Date()) { return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }

function addMessage(text, type = 'bot', viaVoice = false) {
  const el = document.createElement('div'); el.className = `message ${type}${viaVoice ? ' voice' : ''}`;
  const p = document.createElement('p'); p.textContent = text;
  el.append(p); el.insertAdjacentHTML('beforeend', `<time>${now()}</time>`);
  $('#chatMessages').append(el); $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
  if (type === 'bot' && state.sound) speak(text);
}

function renderQuestionChips(question) {
  $('#quickReplies').innerHTML = '';
  question.chips.forEach(label => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => submitAnswer(label); $('#quickReplies').append(b); });
}

function maskPhone(value) {
  const digits = String(value).replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  const rest = digits.slice(2), split = digits.length > 10 ? 5 : 4;
  return rest.length <= split ? `(${digits.slice(0, 2)}) ${rest}` : `(${digits.slice(0, 2)}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

function phoneDigits(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 10 && digits.length !== 11) return null;
  if (!VALID_DDD.has(Number(digits.slice(0, 2)))) return null;
  if ('01'.includes(digits[2])) return null;
  if (digits.length === 11 && digits[2] !== '9') return null;
  return digits;
}

function phoneProblem(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return 'Informe o telefone com DDD.';
  if (digits.length < 10) return `Faltam ${10 - digits.length} dígito(s). Use DDD + 8 ou 9 dígitos.`;
  if (!VALID_DDD.has(Number(digits.slice(0, 2)))) return `DDD ${digits.slice(0, 2)} não existe no Brasil.`;
  if (digits.length === 11 && digits[2] !== '9') return 'Celular com 9 dígitos precisa começar com 9 depois do DDD.';
  if ('01'.includes(digits[2])) return 'O número não pode começar com 0 ou 1 depois do DDD.';
  return phoneDigits(digits) ? '' : 'Telefone inválido. Use DDD + 8 ou 9 dígitos.';
}

function maskCep(value) {
  const digits = String(value).replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function setNote(id, text, tone = '') {
  const note = $(id); if (!note) return;
  note.textContent = text;
  note.classList.toggle('is-error', tone === 'error');
  note.classList.toggle('is-ok', tone === 'ok');
}

async function serviceArea() {
  if (state.area) return state.area;
  try { state.area = await (await fetch('/api/area')).json(); } catch { state.area = null; }
  return state.area;
}

function normalizeCity(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

async function checkArea(notify = false) {
  const area = await serviceArea(); if (!area) return true;
  const city = $('[name="city"]').value, uf = $('[name="uf"]').value;
  if (!city.trim()) { setNote('#areaNote', `Atendimento para ${area.city} e municípios vizinhos.`); return true; }
  const allowed = area.cities.some(item => normalizeCity(item) === normalizeCity(city)) && /^sp$/i.test(uf.trim() || 'SP');
  if (allowed) setNote('#areaNote', `${city.trim()} está na área de atendimento.`, 'ok');
  else {
    setNote('#areaNote', area.message, 'error');
    if (notify) toast(area.message, 6000);
  }
  return allowed;
}

async function lookupCep(silent = false) {
  const field = $('[name="cep"]'), digits = field.value.replace(/\D/g, '');
  if (digits.length !== 8) { if (!silent) setNote('#cepNote', 'O CEP precisa ter 8 dígitos.', 'error'); return; }
  setNote('#cepNote', 'Consultando o CEP…');
  try {
    const response = await fetch(`/api/cep/${digits}`), data = await response.json();
    if (!response.ok) return setNote('#cepNote', data.error || 'Não foi possível consultar o CEP.', 'error');
    if (data.street) $('[name="street"]').value = data.street;
    if (data.neighborhood) $('[name="neighborhood"]').value = data.neighborhood;
    $('[name="city"]').value = data.city; $('[name="uf"]').value = data.uf;
    if (!data.allowed) { setNote('#cepNote', 'CEP fora da área de atendimento.', 'error'); await checkArea(true); return; }
    setNote('#cepNote', data.primary ? 'Endereço preenchido. Revise o número e o complemento.' : `Endereço em ${data.city}, município vizinho atendido. Revise os dados.`, 'ok');
    await checkArea();
    $('[name="number"]').focus();
  } catch { setNote('#cepNote', 'Sem conexão para consultar o CEP. Preencha o endereço manualmente.', 'error'); }
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
  addMessage(text.trim(), 'user', source === 'audio'); state.answers.push(text.trim()); $('#quickReplies').innerHTML = ''; $('#messageInput').value = '';
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
  const location = coords ? `${coords.lat},${coords.lng}` : patientLocation(caseData);
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
  button.disabled = true; button.innerHTML = `${ICON.play}Preparando áudio…`;
  await speak(text, true);
  button.disabled = false; button.innerHTML = `${ICON.play}Ouvir novamente`;
}

async function finishTriage() {
  const risk = classify(state.answers), copy = riskCopy[risk];
  const caseData = { ...state.patient, coords: state.coords || state.patient.coords || null, risk, answers: state.answers, possibilities: diagnosticPossibilities(state.answers), riskFactors: riskFactorSummary(state.answers), createdAt: new Date().toISOString(), status: 'Aguardando retorno', messages: [{ from: 'system', text: `Triagem concluída: ${copy.label}. Não constitui diagnóstico.`, sentAt: new Date().toISOString() }] };
  try {
    const response = await fetch('/api/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(caseData) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    state.currentCase = data.case; state.currentCaseId = data.case.id; state.currentCaseToken = data.patientToken;
    localStorage.setItem(PATIENT_SESSION_KEY, JSON.stringify({ id: state.currentCaseId, token: state.currentCaseToken }));
  } catch (error) {
    if (error?.message) toast(error.message, 5200);
    state.currentCase = { ...caseData, id: `demo-${Date.now()}` };
    state.currentCaseId = null; state.currentCaseToken = null;
    renderResult(state.currentCase, state.coords, true, false);
    toast('Modo demonstração: a orientação foi gerada, mas o atendimento não foi salvo.');
    return;
  }
  renderResult(state.currentCase, state.coords, true, true);
  startCasePolling();
}

function renderResult(caseData, coords = null, autoSpeak = false, serverConnected = Boolean(state.currentCaseId && state.currentCaseToken)) {
  const risk = caseData.risk, copy = riskCopy[risk];
  const possibilities = Array.isArray(caseData.possibilities) && caseData.possibilities.length ? caseData.possibilities : diagnosticPossibilities(caseData.answers || []);
  const riskFactors = caseData.riskFactors || riskFactorSummary(caseData.answers || []);

  // Nível 1: a prioridade e o que fazer agora, em uma frase.
  const urgent = risk === 'red' ? '<a class="verdict-emergency" href="tel:192"><strong>Falta de ar intensa ou piora rápida?</strong><span>Ligar 192 agora</span></a>' : '';
  const verdict = `<section class="verdict ${risk}"><span class="verdict-badge">${copy.label}</span><h2>${copy.title.replace(/\.$/, '')}</h2><p>${copy.action}.</p>${urgent}</section>`;

  // Nível 3: o secundário fica recolhido para não competir com a decisão.
  const historyBlock = riskFactors ? `<p class="panel-note"><strong>Histórico informado.</strong> ${esc(riskFactors)}</p>` : '';
  const panels = `
    <details class="panel"><summary>O que precisa ser avaliado</summary><div class="panel-body">
      <p>Isto não é diagnóstico. Alterações parecidas têm causas diferentes e só o exame presencial as separa.</p>
      <ul class="panel-list">${possibilities.map(item => `<li>${esc(item)}</li>`).join('')}</ul>${historyBlock}
    </div></details>
    <details class="panel"><summary>Base clínica e referências</summary><div class="panel-body">
      <p>Os grupos acima seguem os diagramas por lesão fundamental do livro e os sinais de alerta da diretriz. Conforme o exame, a conduta pode incluir biópsia ou encaminhamento.</p>
      <a href="${CLINICAL_GUIDELINE_URL}" target="_blank" rel="noreferrer">Diretriz do Ministério da Saúde sobre câncer de boca</a>
      <p class="panel-note">${CLINICAL_BOOK_REFERENCE}</p>
    </div></details>`;

  const demoNote = serverConnected ? '' : '<p class="care-note">Modo demonstração: a orientação não foi registrada no servidor, mas o relatório pode ser baixado normalmente.</p>';
  const followupSection = !TEAM_CHAT_ENABLED ? demoNote : serverConnected
    ? `<section class="patient-followup"><div class="patient-followup-title"><div><strong>Converse com a equipe</strong><small>As mensagens ficam disponíveis neste aparelho</small></div><button id="enableNotifications" class="notification-btn" type="button">Ativar notificações</button></div><p id="notificationHelp" class="notification-help">Autorize para receber um aviso quando a equipe responder.</p><div id="patientChatMessages" class="patient-chat-messages"></div><form id="patientChatForm" class="patient-chat-form"><input id="patientChatInput" placeholder="Escreva uma mensagem para a equipe…" required><button aria-label="Enviar mensagem">➤</button></form></section>`
    : `<section class="patient-followup"><div class="patient-followup-title"><div><strong>Modo demonstração</strong><small>A orientação não foi enviada à equipe</small></div></div><p class="notification-help">O servidor de atendimento não está disponível. Você pode baixar o relatório, mas mensagens e notificações estão desativadas.</p></section>`;

  $('#resultScreen').innerHTML = `
    ${verdict}
    <section id="careFinder" class="care-finder" aria-live="polite"></section>
    <div class="result-tools">
      <button id="readGuidance" class="pill pill-outlined" type="button">${ICON.play}Ouvir orientação</button>
      <button id="downloadReport" class="pill pill-filled" type="button">${ICON.download}Baixar relatório</button>
    </div>
    <div id="carePanels" class="panel-stack"></div>
    ${panels}
    ${followupSection}
    <div class="result-actions"><button class="ghost-action" onclick="window.print()">Imprimir</button><button class="ghost-action" onclick="restart()">Nova triagem</button></div>`;
  showScreen('resultScreen');
  if (TEAM_CHAT_ENABLED && serverConnected) renderPatientChat();
  $('#readGuidance').onclick = readGuidance;
  $('#downloadReport').onclick = downloadReport;
  loadCare(caseData, coords);
  if (TEAM_CHAT_ENABLED && serverConnected) {
    $('#enableNotifications').onclick = enableNotifications;
    updateNotificationButton();
  }
  if (state.sound && autoSpeak) setTimeout(readGuidance, 350);
}

/* ── Relatório da avaliação ───────────────────────────────────────
   Reúne cadastro, perguntas e respostas, classificação, possibilidades e encaminhamentos em um PDF. */

function reportData(caseData) {
  const copy = riskCopy[caseData.risk] || riskCopy.green;
  const answers = Array.isArray(caseData.answers) ? caseData.answers : [];
  const possibilities = Array.isArray(caseData.possibilities) && caseData.possibilities.length ? caseData.possibilities : diagnosticPossibilities(answers);
  const address = [caseData.street, caseData.number, caseData.apartment].filter(Boolean).join(', ');
  return {
    generatedAt: new Date(),
    caseId: caseData.id || 'não registrado no servidor',
    identification: [
      ['Nome', caseData.name], ['Idade', caseData.age ? `${caseData.age} anos` : ''], ['Sexo', caseData.sex],
      ['Telefone', caseData.phone], ['CEP', caseData.cep], ['Endereço', address],
      ['Bairro', caseData.neighborhood], ['Cidade', [caseData.city, caseData.uf].filter(Boolean).join(', ')],
      ['Triagem em', caseData.createdAt ? new Date(caseData.createdAt).toLocaleString('pt-BR') : ''],
      ['Situação', caseData.status],
    ].filter(([, value]) => String(value || '').trim()),
    riskKey: caseData.risk,
    risk: { label: copy.label, title: copy.title, body: copy.body, action: copy.action },
    fallbackUnit: `Procure a ${careLabel(careKind(caseData.risk)).toLowerCase()} mais próxima do endereço informado.`,
    contacts: [
      'Central 156: informações sobre a unidade de referência, endereço e horário.',
      caseData.risk === 'red' ? 'SAMU 192: em caso de falta de ar intensa ou piora rápida.' : '',
      caseData.risk === 'yellow' ? `${UNESP_CEDOB.name}: ${UNESP_CEDOB.address}. Telefone ${UNESP_CEDOB.phone}.` : '',
    ].filter(Boolean),
    triage: questions.slice(0, answers.length).map((question, index) => ({ question: question.text, answer: answers[index] })),
    possibilities,
    riskFactors: caseData.riskFactors || riskFactorSummary(answers),
    units: state.care?.units || [],
    messages: (caseData.messages || []).filter(m => m.from !== 'system').map(m => ({
      author: m.from === 'navigator' ? 'Equipe de acompanhamento' : m.from === 'patient' ? (caseData.name || 'Cidadão') : 'Sistema',
      text: m.text, at: m.sentAt ? new Date(m.sentAt).toLocaleString('pt-BR') : '',
    })),
  };
}

function loadJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = JSPDF_URL; script.async = true;
    script.onload = () => window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('jspdf'));
    script.onerror = () => reject(new Error('jspdf'));
    document.head.append(script);
  });
}

const REPORT_INK = { carbon: [29, 29, 31], ash: [112, 112, 112], line: [210, 210, 215], wash: [244, 248, 251] };
const RISK_INK = { red: [215, 0, 21], yellow: [178, 80, 0], green: [29, 127, 61] };

/* Desenha o relatório e devolve a altura usada. Com draw=false apenas mede, sem quebrar página,
   para que a escala possa ser calculada antes e o documento caiba em uma folha. */
function layoutReport(doc, report, { scale = 1, draw = true } = {}) {
  const pageWidth = doc.internal.pageSize.getWidth(), pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44, contentWidth = pageWidth - margin * 2, footer = 34;
  const { carbon, ash, line, wash } = REPORT_INK;
  const risk = RISK_INK[report.riskKey] || RISK_INK.green;
  const px = value => value * scale;
  const limit = () => pageHeight - footer - 12;
  let y = margin;

  const need = height => { if (draw && y + height > limit()) { doc.addPage(); y = margin; } };
  const measure = (value, size, width) => {
    doc.setFontSize(px(size));
    return doc.splitTextToSize(String(value ?? ''), width).length;
  };
  const write = (value, { size = 8.5, style = 'normal', color = carbon, x = margin, width = contentWidth, lead = 1.3, after = 0, align } = {}) => {
    const fontSize = px(size), lineHeight = fontSize * lead;
    doc.setFont('helvetica', style).setFontSize(fontSize);
    doc.splitTextToSize(String(value ?? ''), width).forEach(text => {
      need(lineHeight); y += lineHeight;
      if (draw) { doc.setTextColor(...color); doc.text(text, x, y - fontSize * 0.26, align ? { align } : undefined); }
    });
    y += px(after);
  };
  const rule = (before = 4, after = 6) => {
    y += px(before); need(1);
    if (draw) { doc.setDrawColor(...line).setLineWidth(.5).line(margin, y, pageWidth - margin, y); }
    y += px(after);
  };
  const heading = label => {
    y += px(11); need(px(22));
    write(label.toUpperCase(), { size: 7, style: 'bold', color: ash, lead: 1.2 });
    rule(2, 6);
  };

  /* Cabeçalho */
  write('Dr. Estomato', { size: 17, style: 'bold', lead: 1.15 });
  write('Relatório de triagem em saúde bucal', { size: 10.5, color: ash, lead: 1.25 });
  write(`Emitido em ${report.generatedAt.toLocaleString('pt-BR')}. Atendimento ${report.caseId}`, { size: 7, color: ash, lead: 1.3 });
  rule(6, 0);

  /* Aviso */
  const noticeText = 'Este documento não é um diagnóstico. Ele registra uma triagem de orientação e não substitui o exame presencial com um cirurgião-dentista.';
  const noticeLines = measure(noticeText, 7.8, contentWidth - px(24));
  const noticeHeight = noticeLines * px(7.8) * 1.35 + px(16);
  y += px(8); need(noticeHeight);
  if (draw) { doc.setFillColor(...wash).rect(margin, y, contentWidth, noticeHeight, 'F'); }
  const noticeTop = y; y += px(8);
  write(noticeText, { size: 7.8, style: 'bold', x: margin + px(12), width: contentWidth - px(24), lead: 1.35 });
  y = noticeTop + noticeHeight;

  /* Identificação em duas colunas */
  heading('Identificação');
  const gutter = px(18), columnWidth = (contentWidth - gutter) / 2, labelWidth = px(64);
  const half = Math.ceil(report.identification.length / 2);
  const columns = [report.identification.slice(0, half), report.identification.slice(half)];
  const rowsTop = y;
  let deepest = y;
  columns.forEach((rows, index) => {
    const left = margin + index * (columnWidth + gutter);
    let columnY = rowsTop;
    rows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold').setFontSize(px(8.5));
      const valueLines = doc.splitTextToSize(String(value), columnWidth - labelWidth);
      const rowHeight = Math.max(valueLines.length, 1) * px(8.5) * 1.32 + px(2.5);
      if (draw) {
        doc.setFont('helvetica', 'normal').setFontSize(px(7.2)).setTextColor(...ash);
        doc.text(doc.splitTextToSize(label, labelWidth - px(6))[0], left, columnY + px(8.5));
        doc.setFont('helvetica', 'bold').setFontSize(px(8.5)).setTextColor(...carbon);
        valueLines.forEach((text, lineIndex) => doc.text(text, left + labelWidth, columnY + px(8.5) + lineIndex * px(8.5) * 1.32));
      }
      columnY += rowHeight;
    });
    deepest = Math.max(deepest, columnY);
  });
  y = deepest;

  /* Classificação */
  heading('Classificação de risco');
  write(report.risk.label, { size: 11, style: 'bold', color: risk, lead: 1.25 });
  write(report.risk.title, { size: 9.5, style: 'bold', lead: 1.3, after: 1 });
  write(report.risk.body, { size: 8, color: ash, lead: 1.35, after: 3 });
  write(`Conduta orientada: ${report.risk.action}.`, { size: 8.5, style: 'bold', lead: 1.3 });
  write('Leve documento com foto, Cartão SUS (se tiver) e comprovante de endereço. Não se automedique.', { size: 7.4, color: ash, lead: 1.3 });

  /* Perguntas e respostas lado a lado */
  heading('Perguntas e respostas da triagem');
  if (!report.triage.length) write('Nenhuma resposta registrada.', { size: 8, color: ash });
  const questionWidth = contentWidth * .52, answerLeft = margin + questionWidth + px(12), answerWidth = contentWidth - questionWidth - px(12);
  report.triage.forEach((item, index) => {
    doc.setFont('helvetica', 'normal').setFontSize(px(7.4));
    const questionLines = doc.splitTextToSize(`${index + 1}. ${item.question}`, questionWidth);
    doc.setFont('helvetica', 'bold').setFontSize(px(8.5));
    const answerLines = doc.splitTextToSize(String(item.answer ?? ''), answerWidth);
    const rowHeight = Math.max(questionLines.length * px(7.4) * 1.3, answerLines.length * px(8.5) * 1.3) + px(4);
    need(rowHeight);
    if (draw) {
      doc.setFont('helvetica', 'normal').setFontSize(px(7.4)).setTextColor(...ash);
      questionLines.forEach((text, i) => doc.text(text, margin, y + px(7.4) + i * px(7.4) * 1.3));
      doc.setFont('helvetica', 'bold').setFontSize(px(8.5)).setTextColor(...carbon);
      answerLines.forEach((text, i) => doc.text(text, answerLeft, y + px(8.2) + i * px(8.5) * 1.3));
    }
    y += rowHeight;
  });

  /* Possibilidades */
  heading('Possibilidades a avaliar presencialmente');
  write('As possibilidades abaixo NÃO são um diagnóstico. Alterações parecidas têm causas diferentes e só o exame clínico as diferencia.', { size: 7.4, color: ash, lead: 1.35, after: 3 });
  report.possibilities.forEach(item => write(`•   ${item}`, { size: 8.3, lead: 1.32, after: 1.5 }));
  if (report.riskFactors) {
    y += px(4);
    write('Histórico informado', { size: 7, style: 'bold', color: ash, lead: 1.25 });
    write(report.riskFactors, { size: 8, lead: 1.32 });
  }

  /* Encaminhamento */
  heading('Onde buscar atendimento');
  if (report.units.length) {
    report.units.forEach((unit, index) => {
      write(`${index + 1}. ${unit.name}`, { size: 8.5, style: 'bold', lead: 1.3 });
      const facts = [unit.address, unit.durationText && `${unit.durationText} de carro`, unit.distanceText, unit.phone].filter(Boolean).join(', ');
      write(facts, { size: 7.3, color: ash, x: margin + px(11), width: contentWidth - px(11), lead: 1.32, after: 2.5 });
    });
  } else {
    write(report.fallbackUnit, { size: 8.5, style: 'bold', lead: 1.3, after: 2 });
  }
  report.contacts.forEach(contact => write(contact, { size: 7.3, color: ash, lead: 1.35 }));

  /* Conversa */
  if (report.messages.length) {
    heading('Registro da conversa com a equipe');
    report.messages.forEach(message => {
      write(`${message.author}${message.at ? `, ${message.at}` : ''}`, { size: 6.8, color: ash, lead: 1.25 });
      write(message.text, { size: 8, x: margin + px(11), width: contentWidth - px(11), lead: 1.32, after: 2.5 });
    });
  }

  /* Referências */
  heading('Base clínica');
  write('BRASIL. Ministério da Saúde. Diretriz para a prática clínica odontológica na Atenção Primária à Saúde: condutas para diagnóstico das desordens orais potencialmente malignas e do câncer de boca. Brasília, 2023.', { size: 7, color: ash, lead: 1.35 });
  write(CLINICAL_BOOK_REFERENCE, { size: 7, color: ash, lead: 1.35 });

  return y;
}

function buildReportPdf(JsPDF, report, patientName) {
  const measuring = new JsPDF({ unit: 'pt', format: 'a4' });
  const pageHeight = measuring.internal.pageSize.getHeight(), margin = 44;
  const available = pageHeight - 34 - 12 - margin * 2;
  const used = layoutReport(measuring, report, { draw: false }) - margin;
  const scale = Math.min(1, Math.max(.68, available / used));

  const doc = new JsPDF({ unit: 'pt', format: 'a4' });
  layoutReport(doc, report, { scale, draw: true });

  const width = doc.internal.pageSize.getWidth(), pages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(...REPORT_INK.line).setLineWidth(.5).line(margin, pageHeight - 32, width - margin, pageHeight - 32);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...REPORT_INK.ash);
    doc.text('Dr. Estomato. Triagem de orientação, não realiza diagnóstico', margin, pageHeight - 21);
    doc.text(pages > 1 ? `Página ${page} de ${pages}` : patientName, width - margin, pageHeight - 21, { align: 'right' });
  }
  doc.setProperties({ title: `Relatório Dr. Estomato, ${patientName}`, subject: 'Triagem em saúde bucal', creator: 'Dr. Estomato' });
  return doc;
}

async function downloadReport() {
  const caseData = state.currentCase; if (!caseData) return;
  const button = $('#downloadReport'), original = button.innerHTML;
  button.disabled = true; button.innerHTML = `${ICON.download}Gerando PDF…`;
  try {
    const JsPDF = await loadJsPdf();
    const report = reportData(caseData);
    const name = (caseData.name || 'cidadao').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    buildReportPdf(JsPDF, report, caseData.name || 'Cidadão').save(`relatorio-dr-estomato-${name}-${report.generatedAt.toISOString().slice(0, 10)}.pdf`);
    toast('Relatório baixado. Guarde ou leve impresso na consulta.');
  } catch {
    toast('Não foi possível gerar o PDF agora. Abrindo a versão para impressão.', 4200);
    window.print();
  } finally { button.disabled = false; button.innerHTML = original; }
}

/* ── Onde buscar atendimento ──────────────────────────────────────
   Usa o endereço que o cidadão já informou; o servidor resolve as unidades reais e o tempo de rota. */

let mapsLoader = null;
function loadGoogleMaps(key) {
  if (mapsLoader) return mapsLoader;
  mapsLoader = new Promise((resolve, reject) => {
    window.__drEstomatoMapsReady = () => resolve(window.google.maps);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=pt-BR&region=BR&loading=async&callback=__drEstomatoMapsReady`;
    script.async = true; script.onerror = () => reject(new Error('maps-indisponivel'));
    document.head.append(script);
  });
  return mapsLoader;
}

function careKind(risk) { return risk === 'red' ? 'upa' : 'ubs'; }
function careLabel(kind) { return kind === 'upa' ? 'UPA / pronto atendimento' : 'Unidade básica de saúde'; }

function unitActions(unit, origin) {
  const destination = unit.lat && unit.lng ? `${unit.lat},${unit.lng}` : unit.address;
  const from = origin ? `${origin.lat},${origin.lng}` : '';
  const route = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  const phone = unit.phone ? `<a class="pill pill-outlined" href="tel:${esc(unit.phone.replace(/[^0-9+]/g, ''))}">${ICON.phone}Ligar ${esc(unit.phone)}</a>` : '';
  return `<div class="care-actions"><a class="pill pill-filled" href="${route}" target="_blank" rel="noreferrer">${ICON.route}Traçar rota</a>${phone}</div>`;
}

function unitMetrics(unit) {
  const items = [];
  if (unit.durationText) items.push(`<li><strong>${esc(unit.durationText)}</strong><small>de carro</small></li>`);
  if (unit.distanceText) items.push(`<li><strong>${esc(unit.distanceText)}</strong><small>de distância</small></li>`);
  if (unit.openNow === true) items.push('<li><strong>Aberta agora</strong><small>segundo o Google</small></li>');
  return items.length ? `<ul class="care-metrics">${items.join('')}</ul>` : '';
}

function careSupport(caseData, care) {
  const origin = care?.origin ? `${care.origin.lat},${care.origin.lng}` : patientLocation(caseData);
  const unesp = caseData.risk === 'yellow'
    ? `<div class="care-support-item"><div><strong>Ambulatório de Estomatologia do ICT/UNESP</strong><small>${UNESP_CEDOB.address}. Atendimento gratuito, confirme antes de ir.</small></div><span class="care-support-actions"><a href="https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(UNESP_CEDOB.address)}" target="_blank" rel="noreferrer">Rota</a><a href="tel:+551239479000">${UNESP_CEDOB.phone}</a></span></div>`
    : '';
  const samu = caseData.risk === 'red'
    ? '<div class="care-support-item"><div><strong>SAMU 192</strong><small>Falta de ar intensa ou piora rápida</small></div><a href="tel:192">Ligar</a></div>'
    : '';
  return `<details class="panel"><summary>Contatos de apoio</summary><div class="panel-body care-support">${samu}${unesp}<div class="care-support-item"><div><strong>Central 156</strong><small>Confirme a unidade de referência, o endereço e o horário antes de sair</small></div><a href="tel:156">Ligar</a></div></div></details>`;
}

function careFallback(caseData, message) {
  const care = nearestCare(caseData, state.coords, riskCopy[caseData.risk].place);
  return `<article class="care-primary"><span class="care-eyebrow">Vá até</span><h3>${care.name}</h3><p class="care-address">${care.detail}. Compare distância, horário e rota antes de sair.</p><div class="care-actions"><a class="pill pill-filled" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(care.mapQuery)}" target="_blank" rel="noreferrer">${ICON.pin}Ver no mapa</a></div><p class="care-footnote">Leve documento com foto, Cartão SUS se tiver e comprovante de endereço.</p></article>${message ? `<p class="care-note">${esc(message)}</p>` : ''}`;
}

function renderCareFinder(caseData, care, message = '') {
  const box = $('#careFinder'); if (!box) return;
  const units = care?.units || [];
  if (!units.length) {
    box.innerHTML = careFallback(caseData, message);
    const empty = $('#carePanels'); if (empty) empty.innerHTML = careSupport(caseData, care);
    return;
  }

  const [first, ...rest] = units;
  const primary = `<article class="care-primary"><span class="care-eyebrow">Vá até</span><h3>${esc(first.name)}</h3><p class="care-address">${esc(first.address)}</p>${unitMetrics(first)}${unitActions(first, care.origin)}<p class="care-footnote">Leve documento com foto, Cartão SUS se tiver e comprovante de endereço.</p></article>`;
  const others = rest.length
    ? `<ol class="care-list">${rest.map((unit, index) => `<li class="care-item"><span class="care-rank">${index + 2}</span><div><strong>${esc(unit.name)}</strong><small>${esc(unit.address)}</small></div><span class="care-item-meta">${unit.durationText ? `<strong>${esc(unit.durationText)}</strong>` : ''}${unit.distanceText ? `<small>${esc(unit.distanceText)}</small>` : ''}</span><a href="https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(care.origin ? `${care.origin.lat},${care.origin.lng}` : '')}&destination=${encodeURIComponent(`${unit.lat},${unit.lng}`)}&travelmode=driving" target="_blank" rel="noreferrer">Rota</a></li>`).join('')}</ol>`
    : '';
  const explore = `<details class="panel"><summary>Mapa e outras ${rest.length ? rest.length + ' unidades' : 'unidades'}</summary><div class="panel-body"><div class="care-map" id="careMap" role="img" aria-label="Mapa com sua localização e as unidades próximas"><p class="care-map-loading">Carregando o mapa…</p></div>${others}</div></details>`;
  box.innerHTML = primary;
  const stack = $('#carePanels');
  if (!stack) return;
  stack.innerHTML = explore + careSupport(caseData, care);
  $('.panel > summary', stack).addEventListener('click', () => setTimeout(() => drawCareMap(care), 60), { once: true });
}

async function drawCareMap(care) {
  const box = $('#careMap'); if (!box || !care?.origin) return;
  let config; try { config = await (await fetch('/api/maps/config')).json(); } catch { config = null; }
  if (!config?.available) return void (box.innerHTML = '<p class="care-map-loading">O mapa não está configurado neste servidor. Use "Traçar rota" para abrir o Google Maps.</p>');
  try {
    const maps = await loadGoogleMaps(config.browserKey);
    box.innerHTML = '';
    const map = new maps.Map(box, { center: care.origin, zoom: 13, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
    const bounds = new maps.LatLngBounds(), info = new maps.InfoWindow();
    new maps.Marker({ position: care.origin, map, title: 'Seu endereço', icon: { path: maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#0071e3', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 } });
    bounds.extend(care.origin);
    care.units.forEach((unit, index) => {
      if (!unit.lat || !unit.lng) return;
      const position = { lat: unit.lat, lng: unit.lng };
      const marker = new maps.Marker({ position, map, title: unit.name, label: { text: String(index + 1), color: '#ffffff', fontSize: '12px' } });
      marker.addListener('click', () => { info.setContent(`<strong>${esc(unit.name)}</strong><br>${esc(unit.address)}${unit.durationText ? `<br>${esc(unit.durationText)} de carro` : ''}`); info.open({ map, anchor: marker }); });
      bounds.extend(position);
    });
    map.fitBounds(bounds, 48);
  } catch { box.innerHTML = '<p class="care-map-loading">Não foi possível carregar o mapa. Use "Traçar rota" para abrir o Google Maps.</p>'; }
}

async function loadCare(caseData, preferred = null) {
  const box = $('#careFinder'); if (!box) return;
  box.innerHTML = '<div class="care-loading"><span class="care-spinner" aria-hidden="true"></span><p>Procurando unidades próximas do seu endereço…</p></div>';
  const coords = preferred || caseData.coords || state.coords || null;
  const payload = { kind: careKind(caseData.risk) };
  if (coords) payload.coords = coords; else payload.address = patientLocation(caseData);
  try {
    const response = await fetch('/api/maps/units', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) return renderCareFinder(caseData, null, data.error || 'Não foi possível buscar as unidades agora.');
    state.care = data.units?.length ? data : null;
    renderCareFinder(caseData, state.care, data.reason || '');
  } catch { renderCareFinder(caseData, null, 'Sem conexão para buscar as unidades. Use o Google Maps para localizá-las.'); }
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
  button.textContent = enabled ? 'Notificações ativadas' : 'Ativar notificações'; button.disabled = enabled;
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

$('#intakeForm').addEventListener('submit', async e => {
  e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget));
  const phoneError = phoneProblem(data.phone);
  if (phoneError) { setNote('#phoneNote', phoneError, 'error'); $('[name="phone"]').focus(); return toast(phoneError, 4200); }
  if (!await checkArea(true)) return $('[name="city"]').focus();
  data.phone = maskPhone(data.phone); data.cep = maskCep(data.cep); data.uf = (data.uf || 'SP').toUpperCase();
  data.address = `${data.street}, ${data.number}${data.apartment ? `, ${data.apartment}` : ''}, ${data.neighborhood}, ${data.city}, ${data.uf}`;
  if (state.coords) data.coords = state.coords;
  state.patient = data; state.answers = []; state.step = 0;
  showScreen('chatScreen'); startDialogue(data);
});

$('[name="phone"]').addEventListener('input', e => {
  e.target.value = maskPhone(e.target.value);
  const problem = phoneProblem(e.target.value);
  const complete = e.target.value.replace(/\D/g, '').length >= 10;
  if (!complete) setNote('#phoneNote', 'Com DDD. Celular com 9 dígitos ou fixo com 8.');
  else setNote('#phoneNote', problem || 'Telefone válido.', problem ? 'error' : 'ok');
});
$('[name="phone"]').addEventListener('blur', e => { if (e.target.value) setNote('#phoneNote', phoneProblem(e.target.value) || 'Telefone válido.', phoneProblem(e.target.value) ? 'error' : 'ok'); });
$('[name="cep"]').addEventListener('input', e => {
  e.target.value = maskCep(e.target.value);
  if (e.target.value.replace(/\D/g, '').length === 8) lookupCep(true);
});
$('[name="cep"]').addEventListener('blur', () => { if ($('[name="cep"]').value) lookupCep(); });
$('[name="city"]').addEventListener('blur', () => checkArea());
$('[name="uf"]').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2); });
$('#chatForm').addEventListener('submit', e => { e.preventDefault(); submitAnswer($('#messageInput').value); });
$('#backToIntake').onclick = () => showScreen('intakeScreen');
$('#geoBtn').onclick = () => {
  if (!navigator.geolocation) return toast('Localização não disponível neste navegador. Digite seu bairro.');
  const btn = $('#geoBtn'); btn.textContent = 'Localizando…'; btn.disabled = true;
  navigator.geolocation.getCurrentPosition(pos => {
    state.coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    $('[name="street"]').value = `Localização compartilhada (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`;
    $('[name="number"]').value = 's/n'; $('[name="neighborhood"]').value = 'Localização atual';
    btn.textContent = 'Localização compartilhada'; btn.disabled = false; checkArea(); toast('Localização usada apenas para sugerir a rota');
  }, () => { btn.textContent = 'Usar minha localização atual'; btn.disabled = false; toast('Não foi possível acessar a localização. Digite seu bairro.'); }, { enableHighAccuracy: false, timeout: 8000 });
};
$('#soundToggle').onclick = () => setVoice(!state.sound);
updateVoiceToggle();

let mediaRecorder = null, mediaStream = null, audioChunks = [], recordedBlob = null, recordingTimer = null, recordingSeconds = 0, previewUrl = null;
let speechRecognition = null, directTranscript = '', speechRecognitionTimer = null;
function formatDuration(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function clearRecording() {
  if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; recordedBlob = null; audioChunks = [];
  $('#recordingPanel').hidden = true; $('#recordingPanel').classList.remove('recording'); $('#recordingPreview').removeAttribute('src');
}
function resetVoiceButton() { $('#voiceBtn').classList.remove('listening'); $('#voiceBtn').disabled = false; $('#voiceBtn').setAttribute('aria-label', 'Falar resposta'); }

function startDirectSpeechInput() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return startRecording();
  let timedOut = false;
  clearRecording(); directTranscript = ''; speechRecognition = new Recognition(); speechRecognition.lang = 'pt-BR'; speechRecognition.interimResults = true; speechRecognition.continuous = false;
  $('#recordingPanel').hidden = false; $('#recordingPanel').classList.add('recording'); $('#recordingLabel').textContent = 'Ouvindo… fale sua resposta'; $('#recordingTime').textContent = 'Envio automático'; $('#recordingPreview').hidden = true; $('.recording-actions').hidden = true; $('#voiceBtn').classList.add('listening'); $('#voiceBtn').setAttribute('aria-label', 'Parar e enviar fala');
  speechRecognition.onresult = event => {
    const parts = [];
    for (let i = 0; i < event.results.length; i++) parts.push(event.results[i][0].transcript);
    directTranscript = parts.join(' ').trim();
    if (directTranscript) $('#recordingLabel').textContent = directTranscript;
  };
  speechRecognition.onerror = event => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') toast('Microfone bloqueado. No navegador, abra as permissões deste site e selecione Microfone: Permitir.', 6500);
    else if (event.error !== 'no-speech' && event.error !== 'aborted') toast('Não foi possível reconhecer a fala. Tente novamente.');
  };
  speechRecognition.onend = () => {
    clearTimeout(speechRecognitionTimer); speechRecognitionTimer = null;
    speechRecognition = null; resetVoiceButton(); clearRecording();
    if (directTranscript) submitAnswer(directTranscript, 'audio');
    else if (!timedOut) toast('Nenhuma fala foi identificada. Toque no microfone e tente novamente.');
  };
  try {
    speechRecognition.start();
    speechRecognitionTimer = setTimeout(() => {
      if (!speechRecognition) return;
      timedOut = true;
      toast('O tempo de escuta terminou. Fale após tocar no microfone ou responda por texto.');
      speechRecognition.stop();
    }, 15000);
  } catch {
    clearTimeout(speechRecognitionTimer); speechRecognitionTimer = null;
    speechRecognition = null; resetVoiceButton(); clearRecording(); startRecording();
  }
}

async function transcribeAndSubmit(blob) {
  if (!blob) return;
  $('#recordingPanel').hidden = false; $('#recordingPanel').classList.remove('recording'); $('#recordingLabel').textContent = 'Entendendo sua resposta…'; $('#recordingTime').textContent = 'Envio automático'; $('#voiceBtn').disabled = true;
  try {
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    const response = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: dataUrl.split(',')[1], mimeType: blob.type }) });
    if (!response.ok) throw new Error(response.status === 404 ? 'server-unavailable' : 'transcription-failed');
    const data = await response.json(); if (!data.transcript) throw new Error('transcription-failed');
    clearRecording(); resetVoiceButton(); submitAnswer(data.transcript, 'audio');
  } catch (error) {
    clearRecording(); resetVoiceButton();
    toast(error?.message === 'server-unavailable' ? 'A transcrição por voz precisa do servidor. Por enquanto, responda por texto.' : 'Não foi possível entender o áudio. Toque no microfone e tente novamente.');
  }
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
  } catch (error) {
    const blocked = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
    toast(blocked ? 'O microfone está bloqueado. Autorize-o nas configurações do site e use HTTPS.' : 'Não foi possível acessar o microfone neste aparelho.');
  }
}
function stopRecording() { if (mediaRecorder?.state === 'recording') mediaRecorder.stop(); }
async function beginVoiceInput() {
  if (!window.isSecureContext) return toast('O microfone exige uma conexão segura. Abra o aplicativo por http://127.0.0.1:8080 ou HTTPS.', 6500);
  if (!navigator.mediaDevices?.getUserMedia) return toast('Este navegador não disponibiliza acesso ao microfone. Tente uma versão atual do Chrome, Edge ou Safari.', 6500);
  let permissionStream = null;
  try {
    permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    permissionStream.getTracks().forEach(track => track.stop());
    startDirectSpeechInput();
  } catch (error) {
    const blocked = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
    const missing = error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError';
    if (blocked) toast('Microfone bloqueado. Clique no cadeado ao lado do endereço e escolha Microfone: Permitir. No macOS, confira também Privacidade e Segurança › Microfone.', 8000);
    else if (missing) toast('Nenhum microfone foi encontrado neste aparelho.', 6000);
    else toast('Não foi possível iniciar o microfone. Feche outros aplicativos que estejam usando áudio e tente novamente.', 6500);
  } finally {
    permissionStream?.getTracks().forEach(track => track.stop());
  }
}
$('#voiceBtn').onclick = () => speechRecognition ? speechRecognition.stop() : mediaRecorder?.state === 'recording' ? stopRecording() : beginVoiceInput();
$('#discardRecording').onclick = clearRecording;
$('#sendRecording').onclick = () => transcribeAndSubmit(recordedBlob);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
restorePatientCase();
