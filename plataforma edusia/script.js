import { decodeToken, buildPlanoDeAcao } from './logic.js';
import { setAlunoAtual, getAlunoAtual, clearAlunoAtual, toggleVideoAssistidoLocal, agendarSalvarProgresso, getProgresso } from './store.js';

const el = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const resp = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.error || `Erro ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return data;
}

function mostrarTela(id) {
  ['tela-erro-token', 'tela-login', 'tela-dashboard'].forEach((t) => {
    el(t).hidden = t !== id;
  });
}

let planoAtual = null;

function renderDiscGrafico(disc) {
  const container = el('disc-grafico');
  container.innerHTML = '';
  ['D', 'I', 'S', 'C'].forEach((chave) => {
    const linha = document.createElement('div');
    linha.className = 'disc-linha';
    linha.innerHTML = `
      <span class="disc-letra">${chave}</span>
      <div class="disc-barra-fundo"><div class="disc-barra" style="width:${disc[chave]}%"></div></div>
      <span class="disc-valor">${disc[chave]}</span>
    `;
    container.appendChild(linha);
  });
}

function renderPlanoAcao(plano) {
  const nomesPerfil = { D: 'Dominante (D)', I: 'Influente (I)', S: 'Estável (S)', C: 'Cauteloso (C)' };
  const container = el('plano-acao');
  const prioridades = plano.trilhas
    .slice(0, plano.qtdRecomendados)
    .map((t, i) => `<li><strong>PRIORIDADE ${i + 1}:</strong> ${t.nome}</li>`)
    .join('');
  container.innerHTML = `
    <p><strong>Seu perfil DISC:</strong> ${nomesPerfil[plano.perfil]}</p>
    <p><strong>Pontos de desenvolvimento:</strong> ${plano.pontosFracos.join(', ')}</p>
    <p>${plano.mensagem}</p>
    <ol class="prioridades">${prioridades}</ol>
    <p><strong>Tempo estimado:</strong> ${plano.tempoEstimadoHoras}h — <strong>Meta:</strong> completar em ${plano.metaDias} dias</p>
  `;
}

async function salvarProgresso() {
  const aluno = getAlunoAtual();
  if (!aluno) return;
  try {
    await api('/api/aluno/progresso', { method: 'PUT', body: JSON.stringify({ progresso: aluno.progresso }) });
  } catch (e) {
    if (e.status === 401) {
      clearAlunoAtual();
      mostrarTela('tela-login');
      const erroEl = el('login-erro');
      erroEl.textContent = 'Sua sessão expirou. Faça login novamente para continuar.';
      erroEl.hidden = false;
      return;
    }
    // falha silenciosa para demais erros: o estado otimista local já foi
    // aplicado; próxima interação tenta salvar de novo.
  }
}

function renderTrilhas(trilhas) {
  const container = el('trilhas-lista');
  container.innerHTML = '';
  trilhas.forEach((tema) => {
    const assistidos = getProgresso(tema.id);
    const card = document.createElement('div');
    card.className = 'trilha-card';
    const videosHtml = tema.videos
      .map((v, i) => `
        <li class="video-item">
          <label>
            <input type="checkbox" data-tema="${tema.id}" data-video="${i}" ${assistidos.includes(i) ? 'checked' : ''} />
            ${v.titulo}
          </label>
          <a href="${v.link}" target="_blank" rel="noopener" class="btn-link">Assistir</a>
        </li>
      `)
      .join('');
    card.innerHTML = `
      <h3>${tema.icone} ${tema.nome}</h3>
      <p>${tema.descricao}</p>
      <p class="trilha-progresso">${assistidos.length} de ${tema.videos.length} assistidos</p>
      <ul class="videos-lista">${videosHtml}</ul>
    `;
    container.appendChild(card);
  });
  container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', (ev) => {
      const temaId = Number(ev.target.dataset.tema);
      const videoIndex = Number(ev.target.dataset.video);
      toggleVideoAssistidoLocal(temaId, videoIndex);
      const tema = trilhas.find((t) => t.id === temaId);
      const item = ev.target.closest('.trilha-card');
      const assistidos = getProgresso(temaId);
      item.querySelector('.trilha-progresso').textContent = `${assistidos.length} de ${tema.videos.length} assistidos`;
      agendarSalvarProgresso(salvarProgresso);
    });
  });
}

function gerarPdf() {
  if (!planoAtual) return;
  const erroEl = el('pdf-erro');
  erroEl.hidden = true;
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('jsPDF não carregou');
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const nomesPerfil = { D: 'Dominante (D)', I: 'Influente (I)', S: 'Estável (S)', C: 'Cauteloso (C)' };
    let y = 20;
    doc.setFontSize(16);
    doc.text('Plano de Ação — Portal IA na Prática', 14, y);
    y += 10;
    doc.setFontSize(12);
    doc.text(`Perfil DISC: ${nomesPerfil[planoAtual.perfil]}`, 14, y);
    y += 8;
    doc.text(`Pontos de desenvolvimento: ${planoAtual.pontosFracos.join(', ')}`, 14, y);
    y += 8;
    const mensagemLinhas = doc.splitTextToSize(planoAtual.mensagem, 180);
    doc.text(mensagemLinhas, 14, y);
    y += mensagemLinhas.length * 6 + 4;
    doc.text('Plano recomendado:', 14, y);
    y += 8;
    planoAtual.trilhas.slice(0, planoAtual.qtdRecomendados).forEach((t, i) => {
      doc.text(`Prioridade ${i + 1}: ${t.nome}`, 18, y);
      y += 7;
    });
    y += 4;
    doc.text(`Tempo estimado: ${planoAtual.tempoEstimadoHoras}h`, 14, y);
    y += 7;
    doc.text(`Meta: completar em ${planoAtual.metaDias} dias`, 14, y);
    doc.save('plano-de-acao.pdf');
  } catch (e) {
    erroEl.textContent = 'Não foi possível gerar o PDF agora. Tente novamente em instantes.';
    erroEl.hidden = false;
  }
}

async function renderDashboard() {
  const aluno = getAlunoAtual();
  let config;
  try {
    config = await api('/api/config');
  } catch (e) {
    el('tela-dashboard').innerHTML = '<p class="erro">Conteúdo não pôde ser carregado. Tente novamente mais tarde.</p>';
    mostrarTela('tela-dashboard');
    return;
  }
  el('dash-nome').textContent = aluno.nome;
  renderDiscGrafico(aluno.disc);
  planoAtual = buildPlanoDeAcao(config, aluno.disc);
  renderPlanoAcao(planoAtual);
  renderTrilhas(planoAtual.trilhas);
  el('usuario-nome').textContent = aluno.nome;
  el('usuario-info').hidden = false;
  mostrarTela('tela-dashboard');
}

async function carregarSessaoEDashboard() {
  try {
    const me = await api('/api/aluno/me');
    setAlunoAtual(me);
    await renderDashboard();
    return true;
  } catch (e) {
    return false;
  }
}

async function tratarToken() {
  const hash = window.location.hash;
  const match = hash.match(/#\/t=(.+)/);
  if (!match) return false;
  let payload;
  try {
    payload = decodeToken(decodeURIComponent(match[1]));
  } catch (e) {
    mostrarTela('tela-erro-token');
    return 'erro';
  }
  try {
    await api('/api/aluno/token-login', { method: 'POST', body: JSON.stringify({ email: payload.email, senha: payload.senha }) });
    history.replaceState(null, '', window.location.pathname);
    return true;
  } catch (e) {
    mostrarTela('tela-erro-token');
    return 'erro';
  }
}

function iniciarLogin() {
  el('form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = el('login-email').value.trim();
    const senha = el('login-senha').value;
    try {
      await api('/api/aluno/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
      el('login-erro').hidden = true;
      await carregarSessaoEDashboard();
    } catch (e) {
      el('login-erro').textContent = 'Email ou senha inválidos.';
      el('login-erro').hidden = false;
    }
  });
}

function iniciarLogout() {
  el('btn-logout').addEventListener('click', async () => {
    await api('/api/aluno/logout', { method: 'POST' }).catch(() => {});
    clearAlunoAtual();
    el('usuario-info').hidden = true;
    mostrarTela('tela-login');
  });
}

async function init() {
  iniciarLogin();
  iniciarLogout();
  el('btn-pdf').addEventListener('click', gerarPdf);
  el('btn-ir-login').addEventListener('click', () => mostrarTela('tela-login'));

  const resultadoToken = await tratarToken();
  if (resultadoToken === 'erro') return;
  if (resultadoToken === true) {
    await carregarSessaoEDashboard();
    return;
  }
  const logado = await carregarSessaoEDashboard();
  if (!logado) mostrarTela('tela-login');
}

init();
