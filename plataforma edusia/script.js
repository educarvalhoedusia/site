import { decodeToken, buildPlanoDeAcao } from './logic.js';
import { saveAluno, getAluno, setSessao, getSessaoEmail, clearSessao, toggleVideoAssistido, getProgresso } from './store.js';

const el = (id) => document.getElementById(id);

function mostrarTela(id) {
  ['tela-erro-token', 'tela-login', 'tela-dashboard'].forEach((t) => {
    el(t).hidden = t !== id;
  });
}

let planoAtual = null;

async function carregarConfig() {
  const resp = await fetch('config.json');
  if (!resp.ok) throw new Error('config.json não encontrado');
  return resp.json();
}

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

function renderTrilhas(trilhas, aluno) {
  const container = el('trilhas-lista');
  container.innerHTML = '';
  trilhas.forEach((tema) => {
    const assistidos = getProgresso(aluno.email, tema.id);
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
      toggleVideoAssistido(aluno.email, temaId, videoIndex);
      const tema = trilhas.find((t) => t.id === temaId);
      const item = ev.target.closest('.trilha-card');
      const assistidos = getProgresso(aluno.email, temaId);
      item.querySelector('.trilha-progresso').textContent = `${assistidos.length} de ${tema.videos.length} assistidos`;
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
  let config;
  try {
    config = await carregarConfig();
  } catch (e) {
    el('tela-dashboard').innerHTML = '<p class="erro">Conteúdo não pôde ser carregado. Tente novamente mais tarde.</p>';
    mostrarTela('tela-dashboard');
    return;
  }
  el('dash-nome').textContent = aluno.nome;
  renderDiscGrafico(aluno.disc);
  planoAtual = buildPlanoDeAcao(config, aluno.disc);
  renderPlanoAcao(planoAtual);
  renderTrilhas(planoAtual.trilhas, aluno);
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
  el('btn-pdf').addEventListener('click', gerarPdf);
  el('btn-ir-login').addEventListener('click', () => mostrarTela('tela-login'));

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
