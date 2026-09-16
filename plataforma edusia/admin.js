import { validateDiscResult } from './logic.js';

const el = (id) => document.getElementById(id);
let config = { temas: [], mapeamentoDisc: {} };
let configCarregado = false;

async function api(path, options = {}) {
  const resp = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Erro ${resp.status}`);
  return data;
}

async function carregarConfig() {
  try {
    config = await api('/api/config');
    configCarregado = true;
    renderTemas();
    renderMapeamento();
  } catch (e) {
    el('config-erro').textContent = 'Não foi possível carregar o conteúdo. Recarregue a página.';
    el('config-erro').hidden = false;
  }
}

function proximoId() {
  return config.temas.reduce((max, t) => Math.max(max, t.id), 0) + 1;
}

function renderTemas() {
  const container = el('temas-lista');
  container.innerHTML = '';
  config.temas.forEach((tema, idx) => {
    const div = document.createElement('div');
    div.className = 'tema-editor card';
    const videosHtml = tema.videos
      .map((v, vi) => `
        <div class="video-editor">
          <input type="text" value="${v.titulo}" data-field="titulo" data-tema="${idx}" data-video="${vi}" placeholder="Título do vídeo" />
          <input type="text" value="${v.link}" data-tema="${idx}" data-video="${vi}" data-field="link" placeholder="Link" />
          <button type="button" class="btn-link btn-remove-video" data-tema="${idx}" data-video="${vi}">Remover</button>
        </div>
      `)
      .join('');
    div.innerHTML = `
      <label>Ícone <input type="text" value="${tema.icone}" data-field="icone" data-tema="${idx}" class="input-icone" /></label>
      <label>Nome <input type="text" value="${tema.nome}" data-field="nome" data-tema="${idx}" /></label>
      <label>Descrição <textarea data-field="descricao" data-tema="${idx}">${tema.descricao}</textarea></label>
      <label>Competências (separadas por vírgula)
        <input type="text" value="${tema.competenciasDesenvolvidas.join(', ')}" data-field="competencias" data-tema="${idx}" />
      </label>
      <div class="videos-editor">${videosHtml}</div>
      <button type="button" class="btn-secundario btn-add-video" data-tema="${idx}">Adicionar vídeo</button>
      <button type="button" class="btn-link btn-remove-tema" data-tema="${idx}">Remover tema</button>
    `;
    container.appendChild(div);
  });
  ligarEventosTemas();
}

function ligarEventosTemas() {
  const container = el('temas-lista');
  container.querySelectorAll('input[data-field], textarea[data-field]').forEach((input) => {
    input.addEventListener('input', (ev) => {
      const idx = Number(ev.target.dataset.tema);
      const campo = ev.target.dataset.field;
      if (campo === 'competencias') {
        config.temas[idx].competenciasDesenvolvidas = ev.target.value.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (ev.target.dataset.video !== undefined) {
        const vi = Number(ev.target.dataset.video);
        config.temas[idx].videos[vi][campo] = ev.target.value;
      } else {
        config.temas[idx][campo] = ev.target.value;
      }
    });
  });
  container.querySelectorAll('.btn-remove-tema').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      const idx = Number(ev.target.dataset.tema);
      const removedId = config.temas[idx].id;
      config.temas.splice(idx, 1);
      ['D', 'I', 'S', 'C'].forEach((perfil) => {
        config.mapeamentoDisc[perfil].temasRecomendados = config.mapeamentoDisc[perfil].temasRecomendados.filter((id) => id !== removedId);
      });
      renderTemas();
      renderMapeamento();
    });
  });
  container.querySelectorAll('.btn-add-video').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      const idx = Number(ev.target.dataset.tema);
      config.temas[idx].videos.push({ titulo: '', link: '' });
      renderTemas();
    });
  });
  container.querySelectorAll('.btn-remove-video').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      const idx = Number(ev.target.dataset.tema);
      const vi = Number(ev.target.dataset.video);
      config.temas[idx].videos.splice(vi, 1);
      renderTemas();
    });
  });
}

function renderMapeamento() {
  const container = el('mapeamento-lista');
  container.innerHTML = '';
  ['D', 'I', 'S', 'C'].forEach((perfil) => {
    const dados = config.mapeamentoDisc[perfil];
    const div = document.createElement('div');
    div.className = 'perfil-editor card';
    const checkboxes = config.temas
      .map((t) => `
        <label class="checkbox-tema">
          <input type="checkbox" data-perfil="${perfil}" data-tema-id="${t.id}" ${dados.temasRecomendados.includes(t.id) ? 'checked' : ''} />
          ${t.icone} ${t.nome}
        </label>
      `)
      .join('');
    div.innerHTML = `
      <h3>Perfil ${perfil}</h3>
      <label>Pontos fracos (separados por vírgula)
        <input type="text" value="${dados.pontosFracos.join(', ')}" data-perfil="${perfil}" data-field="pontosFracos" />
      </label>
      <label>Mensagem
        <textarea data-perfil="${perfil}" data-field="mensagem">${dados.mensagem}</textarea>
      </label>
      <fieldset>
        <legend>Temas recomendados</legend>
        ${checkboxes}
      </fieldset>
    `;
    container.appendChild(div);
  });
  ligarEventosMapeamento();
}

function ligarEventosMapeamento() {
  const container = el('mapeamento-lista');
  container.querySelectorAll('input[data-field], textarea[data-field]').forEach((input) => {
    input.addEventListener('input', (ev) => {
      const perfil = ev.target.dataset.perfil;
      const campo = ev.target.dataset.field;
      if (campo === 'pontosFracos') {
        config.mapeamentoDisc[perfil].pontosFracos = ev.target.value.split(',').map((s) => s.trim()).filter(Boolean);
      } else {
        config.mapeamentoDisc[perfil][campo] = ev.target.value;
      }
    });
  });
  container.querySelectorAll('input[data-tema-id]').forEach((cb) => {
    cb.addEventListener('change', (ev) => {
      const perfil = ev.target.dataset.perfil;
      const temaId = Number(ev.target.dataset.temaId);
      const lista = config.mapeamentoDisc[perfil].temasRecomendados;
      const idx = lista.indexOf(temaId);
      if (ev.target.checked && idx === -1) lista.push(temaId);
      if (!ev.target.checked && idx !== -1) lista.splice(idx, 1);
    });
  });
}

async function renderAlunos() {
  const container = el('alunos-lista');
  try {
    const { alunos } = await api('/api/admin/alunos');
    container.innerHTML = alunos.length
      ? `<table class="tabela-alunos"><thead><tr><th>Nome</th><th>Email</th><th>Criado em</th><th>Vídeos assistidos</th></tr></thead><tbody>${alunos
          .map((a) => `<tr><td>${a.nome}</td><td>${a.email}</td><td>${new Date(a.criadoEm).toLocaleDateString('pt-BR')}</td><td>${a.videosAssistidos}</td></tr>`)
          .join('')}</tbody></table>`
      : '<p>Nenhum aluno cadastrado ainda.</p>';
  } catch (e) {
    container.innerHTML = '<p class="erro">Não foi possível carregar a lista de alunos.</p>';
  }
}

function iniciarTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('ativo'));
      document.querySelectorAll('.admin-secao').forEach((s) => { s.hidden = true; });
      btn.classList.add('ativo');
      el(btn.dataset.tab).hidden = false;
      if (btn.dataset.tab === 'tab-alunos') renderAlunos();
    });
  });
}

function iniciarGerarAcesso() {
  el('btn-gerar-acesso').addEventListener('click', async () => {
    const erroEl = el('gerar-acesso-erro');
    erroEl.hidden = true;
    let dados;
    try {
      dados = JSON.parse(el('json-disc-input').value);
    } catch (e) {
      erroEl.textContent = 'JSON inválido: não foi possível interpretar o texto colado.';
      erroEl.hidden = false;
      return;
    }
    const { valid, errors } = validateDiscResult(dados);
    if (!valid) {
      erroEl.textContent = errors.join(' | ');
      erroEl.hidden = false;
      return;
    }
    try {
      const resultado = await api('/api/admin/gerar-acesso', { method: 'POST', body: JSON.stringify(dados) });
      el('resultado-link').textContent = resultado.link;
      el('resultado-email').textContent = resultado.email;
      el('resultado-senha').textContent = resultado.senha;
      el('acesso-resultado').hidden = false;
    } catch (e) {
      erroEl.textContent = e.message;
      erroEl.hidden = false;
    }
  });

  el('btn-copiar-link').addEventListener('click', () => {
    navigator.clipboard.writeText(el('resultado-link').textContent);
  });
}

function iniciarSalvar() {
  el('btn-salvar-config').addEventListener('click', async () => {
    const erroEl = el('config-erro');
    erroEl.hidden = true;
    if (!configCarregado) return;
    try {
      await api('/api/admin/temas', { method: 'PUT', body: JSON.stringify({ temas: config.temas }) });
      await api('/api/admin/mapeamento', { method: 'PUT', body: JSON.stringify({ mapeamentoDisc: config.mapeamentoDisc }) });
    } catch (e) {
      erroEl.textContent = `Erro ao salvar: ${e.message}`;
      erroEl.hidden = false;
    }
  });
}

function mostrarPainel() {
  el('tela-login-admin').hidden = true;
  el('admin-painel').hidden = false;
  carregarConfig();
}

function iniciarLoginAdmin() {
  el('btn-admin-login').addEventListener('click', async () => {
    const erroEl = el('admin-login-erro');
    erroEl.hidden = true;
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ usuario: el('admin-usuario').value.trim(), senha: el('admin-senha').value }),
      });
      mostrarPainel();
    } catch (e) {
      erroEl.textContent = e.message;
      erroEl.hidden = false;
    }
  });

  el('btn-admin-logout').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    el('admin-painel').hidden = true;
    el('tela-login-admin').hidden = false;
  });
}

el('btn-add-tema').addEventListener('click', () => {
  config.temas.push({ id: proximoId(), nome: 'Novo tema', descricao: '', icone: '⭐', videos: [], competenciasDesenvolvidas: [] });
  renderTemas();
  renderMapeamento();
});

iniciarLoginAdmin();
iniciarTabs();
iniciarGerarAcesso();
iniciarSalvar();
