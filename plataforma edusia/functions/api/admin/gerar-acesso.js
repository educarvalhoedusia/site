import { requireSession } from '../../_lib/require-session.js';
import { hashPassword } from '../../_lib/auth.js';
import { createAluno, getAlunoByEmail } from '../../_lib/db.js';
import { generatePassword, encodeToken, validateAcessoInput } from '../../../logic.js';

export async function onRequestPost({ request, env }) {
  const session = await requireSession(request, env, 'admin');
  if (session instanceof Response) return session;

  let dados;
  try {
    dados = await request.json();
  } catch (e) {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const { valid, errors } = validateAcessoInput(dados);
  if (!valid) {
    return Response.json({ error: errors.join(' | ') }, { status: 400 });
  }
  const disc = dados.disc ?? null;

  const existente = await getAlunoByEmail(env.DB, dados.email);
  if (existente) {
    return Response.json({ error: 'Já existe um aluno cadastrado com esse email.' }, { status: 409 });
  }

  const senha = generatePassword();
  const senhaHash = await hashPassword(senha);
  const geradoEm = new Date().toISOString();
  await createAluno(env.DB, { email: dados.email, nome: dados.nome, senhaHash, disc, criadoEm: geradoEm });

  const token = encodeToken({ nome: dados.nome, email: dados.email, senha, disc, geradoEm });
  const baseUrl = new URL('/index.html', request.url).href;
  const link = `${baseUrl}#/t=${token}`;

  return Response.json({ link, email: dados.email, senha });
}
