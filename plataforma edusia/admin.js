const el = (id) => document.getElementById(id);
let config = { temas: [], mapeamentoDisc: {} };

async function carregarConfig() {
  const resp = await fetch('config.json');
  config = await resp.json();
  renderTemas();
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
      config.temas.splice(idx, 1);
      renderTemas();
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

el('btn-add-tema').addEventListener('click', () => {
  config.temas.push({
    id: proximoId(),
    nome: 'Novo tema',
    descricao: '',
    icone: '⭐',
    videos: [],
    competenciasDesenvolvidas: [],
  });
  renderTemas();
});

carregarConfig();
