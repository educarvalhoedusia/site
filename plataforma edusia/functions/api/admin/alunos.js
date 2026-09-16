import { requireSession } from '../../_lib/require-session.js';
import { listAlunos } from '../../_lib/db.js';

export async function onRequestGet({ request, env }) {
  const session = await requireSession(request, env, 'admin');
  if (session instanceof Response) return session;

  const alunos = await listAlunos(env.DB);
  const resumo = alunos.map((a) => ({
    email: a.email,
    nome: a.nome,
    criadoEm: a.criadoEm,
    videosAssistidos: Object.values(a.progresso).reduce((soma, lista) => soma + lista.length, 0),
  }));
  return Response.json({ alunos: resumo });
}
