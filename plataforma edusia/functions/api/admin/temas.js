import { requireSession } from '../../_lib/require-session.js';
import { replaceTemas } from '../../_lib/db.js';

export async function onRequestPut({ request, env }) {
  const session = await requireSession(request, env, 'admin');
  if (session instanceof Response) return session;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  if (!Array.isArray(body?.temas)) {
    return Response.json({ error: 'Campo "temas" deve ser uma lista.' }, { status: 400 });
  }
  for (const tema of body.temas) {
    if (!tema || typeof tema.id !== 'number' || typeof tema.nome !== 'string') {
      return Response.json({ error: 'Cada tema precisa de "id" numérico e "nome" texto.' }, { status: 400 });
    }
  }

  await replaceTemas(env.DB, body.temas);
  return Response.json({ ok: true });
}
