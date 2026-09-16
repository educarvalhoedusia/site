let alunoAtual = null;

export function setAlunoAtual(aluno) {
  alunoAtual = aluno;
}

export function getAlunoAtual() {
  return alunoAtual;
}

export function clearAlunoAtual() {
  alunoAtual = null;
}

let debounceTimer = null;

export function toggleVideoAssistidoLocal(temaId, videoIndex) {
  if (!alunoAtual) return [];
  const chave = String(temaId);
  const atual = alunoAtual.progresso[chave] || [];
  const idx = atual.indexOf(videoIndex);
  const atualizado = idx === -1 ? [...atual, videoIndex] : atual.filter((i) => i !== videoIndex);
  alunoAtual.progresso[chave] = atualizado;
  return atualizado;
}

export function agendarSalvarProgresso(salvarFn) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(salvarFn, 500);
}

export function getProgresso(temaId) {
  if (!alunoAtual) return [];
  return alunoAtual.progresso[String(temaId)] || [];
}
