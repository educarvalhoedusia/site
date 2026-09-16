import { verifySession, parseCookies } from './auth.js';

export async function requireSession(request, env, tipo) {
  const cookieName = tipo === 'admin' ? 'edusia_admin_sessao' : 'edusia_aluno_sessao';
  const cookies = parseCookies(request.headers.get('Cookie'));
  const payload = await verifySession(cookies[cookieName], env.SESSION_SECRET);
  if (!payload || payload.tipo !== tipo) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  return payload;
}
