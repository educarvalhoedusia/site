import { requireSession } from '../../_lib/require-session.js';
import { replaceMapeamento } from '../../_lib/db.js';

export async function onRequestPut({ request, env }) {
  const session = await requireSession(request, env, 'admin');
  if (session instanceof Response) return session;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  const mapeamento = body?.mapeamentoDisc;
  if (!mapeamento || typeof mapeamento !== 'object') {
    return Response.json({ error: 'Campo "mapeamentoDisc" é obrigatório.' }, { status: 400 });
  }
  for (const perfil of ['D', 'I', 'S', 'C']) {
    if (!mapeamento[perfil]) {
      return Response.json({ error: `Perfil "${perfil}" ausente em mapeamentoDisc.` }, { status: 400 });
    }
  }

  await replaceMapeamento(env.DB, mapeamento);
  return Response.json({ ok: true });
}
