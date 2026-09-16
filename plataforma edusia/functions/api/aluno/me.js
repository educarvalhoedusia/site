import { requireSession } from '../../_lib/require-session.js';
import { getAlunoByEmail } from '../../_lib/db.js';

export async function onRequestGet({ request, env }) {
  const session = await requireSession(request, env, 'aluno');
  if (session instanceof Response) return session;

  const aluno = await getAlunoByEmail(env.DB, session.sub);
  if (!aluno) return Response.json({ error: 'Aluno não encontrado.' }, { status: 404 });

  return Response.json({ nome: aluno.nome, email: aluno.email, disc: aluno.disc, progresso: aluno.progresso });
}
