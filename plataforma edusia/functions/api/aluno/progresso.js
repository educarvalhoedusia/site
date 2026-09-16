import { requireSession } from '../../_lib/require-session.js';
import { updateProgresso } from '../../_lib/db.js';

export async function onRequestPut({ request, env }) {
  const session = await requireSession(request, env, 'aluno');
  if (session instanceof Response) return session;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  if (!body || typeof body.progresso !== 'object') {
    return Response.json({ error: 'Campo "progresso" é obrigatório.' }, { status: 400 });
  }

  await updateProgresso(env.DB, session.sub, body.progresso);
  return Response.json({ ok: true });
}
