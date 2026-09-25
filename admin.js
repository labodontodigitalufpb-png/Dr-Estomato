const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const LEGACY_KEY = 'dr-esomato-cases-v1';
const state = { cases: [], selected: null, filter: 'all', pollTimer: null };
const riskCopy = {
  red: { label: 'Atenção imediata', action: 'Procure uma UPA agora' },
  yellow: { label: 'Avaliação prioritária', action: 'Procure sua UBS em curto prazo' },
  green: { label: 'Cuidado de rotina', action: 'Agende uma consulta de rotina' }
};

function esc(value = '') { const el = document.createElement('span'); el.textContent = String(value); return el.innerHTML; }
function messageTime(date = new Date()) { return new Date(date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
function toast(text) { const el = $('#toast'); el.textContent = text; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3000); }
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  if (response.status === 401) { showLogin(); throw new Error('Sessão encerrada'); }
  return response;
}

function showLogin() {
  clearInterval(state.pollTimer); $('#adminDashboard').hidden = true; $('#adminLogin').hidden = false;
  setTimeout(() => $('#loginUser').focus(), 50);
}

async function showDashboard() {
  $('#adminLogin').hidden = true; $('#adminDashboard').hidden = false;
  await migrateLegacyCases(); await loadCases();
  clearInterval(state.pollTimer); state.pollTimer = setInterval(loadCases, 10000);
}

async function migrateLegacyCases() {
  if (localStorage.getItem('dr-estomato-legacy-migrated') === 'yes') return;
  let legacy = []; try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]'); } catch { legacy = []; }
  for (const item of Array.isArray(legacy) ? legacy : []) {
    try { await fetch('/api/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) }); } catch { return; }
  }
  localStorage.setItem('dr-estomato-legacy-migrated', 'yes'); localStorage.removeItem(LEGACY_KEY);
  if (legacy.length) toast(`${legacy.length} atendimento(s) anterior(es) migrado(s) para o servidor`);
}

async function loadCases() {
  try {
    const response = await api('/api/admin/cases'), data = await response.json();
    state.cases = data.cases || [];
    if (state.selected && !state.cases.some(c => c.id === state.selected)) state.selected = null;
    renderDashboard();
  } catch (error) { if (error.message !== 'Sessão encerrada') toast('Não foi possível atualizar os atendimentos'); }
}

$('#loginForm').onsubmit = async e => {
  e.preventDefault(); $('#loginError').textContent = '';
  try {
    const response = await fetch('/api/admin/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('#loginUser').value, password: $('#loginPassword').value }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    await showDashboard(); toast('Acesso autorizado');
  } catch (error) {
    $('#loginError').textContent = error.message || 'Login ou senha incorretos.'; const card = $('.login-card'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); $('#loginPassword').select();
  }
};

$('#logoutBtn').onclick = async () => {
  await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }); state.selected = null; $('#loginForm').reset(); $('#loginError').textContent = ''; showLogin();
};

function renderDashboard() {
  $('#totalCases').textContent = state.cases.length;
  $('#redCases').textContent = state.cases.filter(c => c.risk === 'red' && c.status !== 'Assistência acessada').length;
  $('#followupCases').textContent = state.cases.filter(c => ['Aguardando retorno', 'Em contato'].includes(c.status)).length;
  $('#resolvedCases').textContent = state.cases.filter(c => c.status === 'Assistência acessada').length;
  const query = $('#caseSearch').value.toLowerCase();
  const filtered = state.cases.filter(c => (state.filter === 'all' || c.risk === state.filter) && String(c.name || '').toLowerCase().includes(query));
  $('#caseList').innerHTML = filtered.length ? filtered.map(c => `<article class="case-item ${state.selected === c.id ? 'active' : ''}" data-id="${esc(c.id)}"><span class="person-avatar">${esc(String(c.name || '?').slice(0,2).toUpperCase())}</span><div><strong>${esc(c.name)}</strong><p>${esc(c.age)} anos, ${new Date(c.createdAt).toLocaleDateString('pt-BR')}, ${esc(c.status)}</p></div><span class="risk-pill ${c.risk}">${riskCopy[c.risk]?.label || 'Rotina'}</span></article>`).join('') : '<div class="case-detail empty"><div><span class="empty-icon">◎</span><h3>Nenhum atendimento</h3><p>As triagens concluídas aparecerão aqui.</p></div></div>';
  $$('.case-item').forEach(el => el.onclick = () => { state.selected = el.dataset.id; renderDashboard(); renderCaseDetail(); });
  if (state.selected) renderCaseDetail();
}

function renderCaseDetail() {
  const c = state.cases.find(x => x.id === state.selected); if (!c) return;
  const answers = Array.isArray(c.answers) ? c.answers : [], possibilities = Array.isArray(c.possibilities) ? c.possibilities : [], detail = $('#caseDetail'); detail.classList.remove('empty');
  detail.innerHTML = `<div class="detail-head"><span class="person-avatar">${esc(String(c.name || '?').slice(0,2).toUpperCase())}</span><div><h3>${esc(c.name)}</h3><p>${esc(c.phone)}${c.cep ? `, CEP ${esc(c.cep)}` : ''}, ${esc(c.address)}</p></div><span class="risk-pill ${c.risk}">${riskCopy[c.risk]?.label || 'Rotina'}</span></div><div class="person-actions"><button id="editPerson" class="secondary-btn">Editar pessoa</button><button id="deletePerson" class="delete-btn">Excluir</button></div><form id="editPersonForm" class="edit-person-form" hidden><h4>Editar dados cadastrais</h4><div class="edit-grid"><label>Nome<input name="name" value="${esc(c.name)}" required></label><label>Idade<input name="age" type="number" min="0" max="120" value="${esc(c.age)}" required></label><label>Sexo<select name="sex"><option ${c.sex==='Feminino'?'selected':''}>Feminino</option><option ${c.sex==='Masculino'?'selected':''}>Masculino</option><option ${c.sex==='Intersexo'?'selected':''}>Intersexo</option><option ${c.sex==='Prefiro não informar'?'selected':''}>Prefiro não informar</option></select></label><label>Telefone<input name="phone" value="${esc(c.phone)}" required></label><label>CEP<input name="cep" value="${esc(c.cep || '')}" maxlength="9"></label><label class="wide">Rua ou avenida<input name="street" value="${esc(c.street || '')}" required></label><label>Número<input name="number" value="${esc(c.number || '')}" required></label><label>Apto./Complemento<input name="apartment" value="${esc(c.apartment || '')}"></label><label>Bairro<input name="neighborhood" value="${esc(c.neighborhood || '')}" required></label><label>Cidade<input name="city" value="${esc(c.city || 'São José dos Campos')}" required></label><label>UF<input name="uf" value="${esc(c.uf || 'SP')}" maxlength="2" required></label></div><div class="edit-actions"><button id="cancelEdit" type="button">Cancelar</button><button class="primary-btn" type="submit">Salvar alterações</button></div></form><div class="clinical-summary"><h4>Resumo clínico objetivo</h4><div class="summary-grid"><div><small>QUEIXA PRINCIPAL</small><strong>${esc(answers[0] || 'Não informada')}</strong></div><div><small>TEMPO DE EVOLUÇÃO</small><strong>${esc(answers[1] || 'Não informado')}</strong></div><div><small>SINAIS ASSOCIADOS</small><strong>${esc(answers.slice(2).join('; ') || 'Não informados')}</strong></div><div><small>CONDUTA ORIENTADA</small><strong>${riskCopy[c.risk]?.action || 'Avaliação presencial'}</strong></div></div><select class="status-select" id="statusSelect"><option ${c.status==='Aguardando retorno'?'selected':''}>Aguardando retorno</option><option ${c.status==='Em contato'?'selected':''}>Em contato</option><option ${c.status==='Assistência acessada'?'selected':''}>Assistência acessada</option><option ${c.status==='Não conseguiu acesso'?'selected':''}>Não conseguiu acesso</option></select></div><div class="followup"><h4>Conversa com ${esc(c.name)}</h4><div class="followup-messages">${(c.messages||[]).map(m => `<div class="follow-msg ${['navigator','patient'].includes(m.from) ? m.from : 'system'}"><span>${m.from === 'navigator' ? 'Navegador' : m.from === 'patient' ? esc(c.name) : 'Sistema'}</span><p>${esc(m.text)}</p><time>${messageTime(m.sentAt)}</time></div>`).join('')}</div><form class="followup-form"><input placeholder="Escreva uma mensagem para o paciente…" required><button aria-label="Enviar mensagem">➤</button></form></div>`;
  if (possibilities.length || c.riskFactors) {
    $('.clinical-summary', detail).insertAdjacentHTML('beforeend', `<div class="clinical-assessment"><h4>POSSIBILIDADES PARA AVALIAÇÃO (NÃO É DIAGNÓSTICO)</h4>${possibilities.length ? `<ul>${possibilities.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}${c.riskFactors ? `<p><strong>Histórico informado:</strong> ${esc(c.riskFactors)}</p>` : ''}</div>`);
  }
  $('#editPerson').onclick = () => { $('#editPersonForm').hidden = false; $('#editPerson').hidden = true; };
  $('#cancelEdit').onclick = () => { $('#editPersonForm').hidden = true; $('#editPerson').hidden = false; };
  $('#editPersonForm').onsubmit = async e => {
    e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); data.address = `${data.street}, ${data.number}${data.apartment ? `, ${data.apartment}` : ''}, ${data.neighborhood}, ${data.city}, ${data.uf || 'SP'}`;
    try { const response = await api(`/api/admin/cases/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await loadCases(); toast('Dados da pessoa atualizados'); } catch (error) { toast(error.message || 'Não foi possível salvar as alterações'); }
  };
  $('#deletePerson').onclick = async () => {
    if (!confirm(`Excluir permanentemente o atendimento de ${c.name}? Esta ação não pode ser desfeita.`)) return;
    try { const response = await api(`/api/admin/cases/${c.id}`, { method: 'DELETE' }); if (!response.ok) throw new Error(); state.selected = null; await loadCases(); detail.className = 'case-detail empty'; detail.innerHTML = '<div><span class="empty-icon">☷</span><h3>Atendimento excluído</h3><p>Selecione outra pessoa para visualizar os dados.</p></div>'; toast('Pessoa e histórico excluídos'); } catch { toast('Não foi possível excluir o atendimento'); }
  };
  $('#statusSelect').onchange = async e => { try { await api(`/api/admin/cases/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: e.target.value }) }); await loadCases(); toast('Situação atualizada'); } catch { toast('Não foi possível atualizar'); } };
  $('.followup-form', detail).onsubmit = async e => {
    e.preventDefault(); const input = $('input', e.currentTarget), text = input.value.trim(); if (!text) return; input.disabled = true;
    try { const response = await api(`/api/admin/cases/${c.id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }); if (!response.ok) throw new Error(); await loadCases(); toast('Mensagem enviada; o cidadão será notificado se tiver autorizado.'); } catch { toast('Não foi possível enviar a mensagem'); } finally { input.disabled = false; }
  };
}

$('#caseSearch').oninput = renderDashboard;
$$('.filter').forEach(button => button.onclick = () => { state.filter = button.dataset.filter; $$('.filter').forEach(x => x.classList.toggle('active', x === button)); renderDashboard(); });
$('#exportBtn').onclick = () => { const blob = new Blob([JSON.stringify(state.cases, null, 2)], {type:'application/json'}), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `dr-estomato-historico-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href); };

fetch('/api/admin/session', { credentials: 'same-origin' }).then(response => response.ok ? showDashboard() : showLogin()).catch(showLogin);
