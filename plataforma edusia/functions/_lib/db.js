import { hashPassword } from './auth.js';

export async function getConfig(db) {
  const { results: temaRows } = await db.prepare('SELECT * FROM temas ORDER BY id').all();
  const temas = temaRows.map((row) => ({
    id: row.id,
    nome: row.nome,
    icone: row.icone,
    descricao: row.descricao,
    competenciasDesenvolvidas: JSON.parse(row.competencias_json),
    videos: JSON.parse(row.videos_json),
  }));

  const { results: mapRows } = await db.prepare('SELECT * FROM mapeamento_disc').all();
  const mapeamentoDisc = {};
  for (const row of mapRows) {
    mapeamentoDisc[row.perfil] = {
      pontosFracos: JSON.parse(row.pontos_fracos_json),
      mensagem: row.mensagem,
      temasRecomendados: JSON.parse(row.temas_recomendados_json),
    };
  }
  return { temas, mapeamentoDisc };
}

export async function replaceTemas(db, temas) {
  const statements = [db.prepare('DELETE FROM temas')];
  for (const tema of temas) {
    statements.push(
      db.prepare(
        'INSERT INTO temas (id, nome, icone, descricao, competencias_json, videos_json) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        tema.id,
        tema.nome,
        tema.icone,
        tema.descricao,
        JSON.stringify(tema.competenciasDesenvolvidas || []),
        JSON.stringify(tema.videos || [])
      )
    );
  }
  await db.batch(statements);
}

export async function replaceMapeamento(db, mapeamentoDisc) {
  const statements = [db.prepare('DELETE FROM mapeamento_disc')];
  for (const perfil of ['D', 'I', 'S', 'C']) {
    const dados = mapeamentoDisc[perfil] || { pontosFracos: [], mensagem: '', temasRecomendados: [] };
    statements.push(
      db.prepare(
        'INSERT INTO mapeamento_disc (perfil, pontos_fracos_json, mensagem, temas_recomendados_json) VALUES (?, ?, ?, ?)'
      ).bind(perfil, JSON.stringify(dados.pontosFracos || []), dados.mensagem || '', JSON.stringify(dados.temasRecomendados || []))
    );
  }
  await db.batch(statements);
}

export async function listAlunos(db) {
  const { results } = await db.prepare('SELECT email, nome, disc_json, progresso_json, criado_em FROM alunos ORDER BY criado_em DESC').all();
  return results.map((row) => ({
    email: row.email,
    nome: row.nome,
    disc: JSON.parse(row.disc_json),
    progresso: JSON.parse(row.progresso_json),
    criadoEm: row.criado_em,
  }));
}

export async function getAlunoByEmail(db, email) {
  const row = await db.prepare('SELECT * FROM alunos WHERE email = ?').bind(email).first();
  if (!row) return null;
  return {
    email: row.email,
    nome: row.nome,
    senhaHash: row.senha_hash,
    disc: JSON.parse(row.disc_json),
    progresso: JSON.parse(row.progresso_json),
    criadoEm: row.criado_em,
  };
}

export async function createAluno(db, { email, nome, senhaHash, disc, criadoEm }) {
  await db.prepare(
    'INSERT INTO alunos (email, nome, senha_hash, disc_json, progresso_json, criado_em) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(email, nome, senhaHash, JSON.stringify(disc), '{}', criadoEm).run();
}

export async function updateProgresso(db, email, progresso) {
  await db.prepare('UPDATE alunos SET progresso_json = ? WHERE email = ?').bind(JSON.stringify(progresso), email).run();
}

export async function getAdminByUsuario(db, usuario) {
  const row = await db.prepare('SELECT * FROM admin_usuarios WHERE usuario = ?').bind(usuario).first();
  if (!row) return null;
  return { usuario: row.usuario, senhaHash: row.senha_hash };
}

export async function ensureAdminSeed(db, env) {
  const { results } = await db.prepare('SELECT COUNT(*) AS n FROM admin_usuarios').all();
  if (results[0].n > 0) return;
  if (!env.ADMIN_SEED_USER || !env.ADMIN_SEED_PASSWORD) {
    throw new Error('Nenhum admin cadastrado e ADMIN_SEED_USER/ADMIN_SEED_PASSWORD não configurados.');
  }
  const senhaHash = await hashPassword(env.ADMIN_SEED_PASSWORD);
  await db.prepare('INSERT INTO admin_usuarios (usuario, senha_hash) VALUES (?, ?)').bind(env.ADMIN_SEED_USER, senhaHash).run();
}
