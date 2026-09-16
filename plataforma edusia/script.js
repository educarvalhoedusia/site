import { decodeToken } from './logic.js';
import { saveAluno, getAluno, setSessao, getSessaoEmail, clearSessao } from './store.js';

const el = (id) => document.getElementById(id);

function mostrarTela(id) {
  ['tela-erro-token', 'tela-login', 'tela-dashboard'].forEach((t) => {
    el(t).hidden = t !== id;
  });
}

function tratarToken() {
  const hash = window.location.hash;
  const match = hash.match(/#\/t=(.+)/);
  if (!match) return false;
  try {
    const payload = decodeToken(decodeURIComponent(match[1]));
    saveAluno(payload);
    setSessao(payload.email);
    history.replaceState(null, '', window.location.pathname);
    return true;
  } catch (e) {
    mostrarTela('tela-erro-token');
    return 'erro';
  }
}

async function renderDashboard(email) {
  const aluno = getAluno(email);
  if (!aluno) {
    mostrarTela('tela-login');
    return;
  }
  el('dash-nome').textContent = aluno.nome;
  el('usuario-nome').textContent = aluno.nome;
  el('usuario-info').hidden = false;
  mostrarTela('tela-dashboard');
}

function iniciarLogin() {
  el('form-login').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const email = el('login-email').value.trim();
    const senha = el('login-senha').value;
    const aluno = getAluno(email);
    if (!aluno || aluno.senha !== senha) {
      el('login-erro').textContent = 'Email ou senha inválidos.';
      el('login-erro').hidden = false;
      return;
    }
    el('login-erro').hidden = true;
    setSessao(email);
    renderDashboard(email);
  });
}

function iniciarLogout() {
  el('btn-logout').addEventListener('click', () => {
    clearSessao();
    el('usuario-info').hidden = true;
    mostrarTela('tela-login');
  });
}

async function init() {
  iniciarLogin();
  iniciarLogout();

  const resultadoToken = tratarToken();
  if (resultadoToken === 'erro') return;
  if (resultadoToken === true) {
    await renderDashboard(getSessaoEmail());
    return;
  }
  const emailSessao = getSessaoEmail();
  if (emailSessao && getAluno(emailSessao)) {
    await renderDashboard(emailSessao);
  } else {
    mostrarTela('tela-login');
  }
}

init();
