const ALUNO_PREFIX = 'edusia_aluno_';
const SESSAO_KEY = 'edusia_sessao';

export function saveAluno(payload) {
  const existente = getAluno(payload.email);
  const progresso = existente ? existente.progresso : {};
  const record = { ...payload, progresso };
  localStorage.setItem(ALUNO_PREFIX + payload.email, JSON.stringify(record));
  return record;
}

export function getAluno(email) {
  const raw = localStorage.getItem(ALUNO_PREFIX + email);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function setSessao(email) {
  localStorage.setItem(SESSAO_KEY, email);
}

export function getSessaoEmail() {
  return localStorage.getItem(SESSAO_KEY);
}

export function clearSessao() {
  localStorage.removeItem(SESSAO_KEY);
}

export function toggleVideoAssistido(email, temaId, videoIndex) {
  const aluno = getAluno(email);
  if (!aluno) return null;
  const chave = String(temaId);
  const atual = aluno.progresso[chave] || [];
  const idx = atual.indexOf(videoIndex);
  const atualizado = idx === -1 ? [...atual, videoIndex] : atual.filter((i) => i !== videoIndex);
  aluno.progresso[chave] = atualizado;
  localStorage.setItem(ALUNO_PREFIX + email, JSON.stringify(aluno));
  return atualizado;
}

export function getProgresso(email, temaId) {
  const aluno = getAluno(email);
  if (!aluno) return [];
  return aluno.progresso[String(temaId)] || [];
}
