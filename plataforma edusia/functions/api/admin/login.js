import { verifyPassword, signSession, buildSetCookie } from '../../_lib/auth.js';
import { getAdminByUsuario, ensureAdminSeed } from '../../_lib/db.js';

const OITO_HORAS = 8 * 60 * 60;

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  const { usuario, senha } = body || {};
  if (!usuario || !senha) {
    return Response.json({ error: 'Usuário e senha são obrigatórios.' }, { status: 400 });
  }

  if (!env.SESSION_SECRET) {
    return Response.json({ error: 'Configuração do servidor incompleta (SESSION_SECRET ausente).' }, { status: 500 });
  }

  try {
    await ensureAdminSeed(env.DB, env);
  } catch (e) {
    return Response.json({ error: 'Configuração do servidor incompleta (admin inicial não configurado).' }, { status: 500 });
  }
  const admin = await getAdminByUsuario(env.DB, usuario);
  if (!admin || !(await verifyPassword(senha, admin.senhaHash))) {
    return Response.json({ error: 'Usuário ou senha inválidos.' }, { status: 401 });
  }

  const cookieValue = await signSession({ sub: admin.usuario, tipo: 'admin' }, env.SESSION_SECRET, OITO_HORAS);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': buildSetCookie('edusia_admin_sessao', cookieValue, OITO_HORAS),
    },
  });
}
