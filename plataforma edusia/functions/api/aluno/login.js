import { authenticateAluno, signSession, buildSetCookie } from '../../_lib/auth.js';

const TRINTA_DIAS = 30 * 24 * 60 * 60;

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  const { email, senha } = body || {};
  if (!email || !senha) {
    return Response.json({ error: 'Email e senha são obrigatórios.' }, { status: 400 });
  }

  const aluno = await authenticateAluno(env.DB, email, senha);
  if (!aluno) {
    return Response.json({ error: 'Email ou senha inválidos.' }, { status: 401 });
  }

  const cookieValue = await signSession({ sub: aluno.email, tipo: 'aluno' }, env.SESSION_SECRET, TRINTA_DIAS);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': buildSetCookie('edusia_aluno_sessao', cookieValue, TRINTA_DIAS),
    },
  });
}
