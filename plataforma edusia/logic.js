export function generatePassword(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function encodeToken(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export function decodeToken(token) {
  let binary;
  try {
    binary = atob(token);
  } catch (e) {
    throw new Error('Token inválido');
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  let payload;
  try {
    payload = JSON.parse(json);
  } catch (e) {
    throw new Error('Token corrompido');
  }
  if (!payload.nome || !payload.email || !payload.disc) {
    throw new Error('Token incompleto');
  }
  return payload;
}

export function dominantProfile(disc) {
  const order = ['D', 'I', 'S', 'C'];
  let best = order[0];
  for (const key of order) {
    if (disc[key] > disc[best]) best = key;
  }
  return best;
}

export function validateDiscResult(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') {
    return { valid: false, errors: ['JSON inválido'] };
  }
  if (!obj.nome || typeof obj.nome !== 'string' || !obj.nome.trim()) {
    errors.push('Campo "nome" é obrigatório');
  }
  if (!obj.email || typeof obj.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(obj.email)) {
    errors.push('Campo "email" inválido ou ausente');
  }
  if (!obj.disc || typeof obj.disc !== 'object') {
    errors.push('Campo "disc" é obrigatório');
  } else {
    for (const key of ['D', 'I', 'S', 'C']) {
      if (typeof obj.disc[key] !== 'number' || Number.isNaN(obj.disc[key])) {
        errors.push(`Campo "disc.${key}" deve ser numérico`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function orderThemesByPriority(temas, temasRecomendados) {
  const recomendados = temasRecomendados
    .map((id) => temas.find((t) => t.id === id))
    .filter(Boolean);
  const idsRecomendados = new Set(temasRecomendados);
  const restantes = temas.filter((t) => !idsRecomendados.has(t.id));
  return [...recomendados, ...restantes];
}

export function buildPlanoDeAcao(config, disc) {
  const perfil = dominantProfile(disc);
  const mapeamento = config.mapeamentoDisc[perfil];
  const trilhas = orderThemesByPriority(config.temas, mapeamento.temasRecomendados);
  const horasPorTrilha = 4;
  return {
    perfil,
    pontosFracos: mapeamento.pontosFracos,
    mensagem: mapeamento.mensagem,
    trilhas,
    qtdRecomendados: mapeamento.temasRecomendados.length,
    tempoEstimadoHoras: mapeamento.temasRecomendados.length * horasPorTrilha,
    metaDias: 30,
  };
}
