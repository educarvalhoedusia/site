import { getConfig } from '../_lib/db.js';

export async function onRequestGet({ env }) {
  try {
    const config = await getConfig(env.DB);
    return Response.json(config);
  } catch (e) {
    return Response.json({ error: 'Conteúdo não pôde ser carregado.' }, { status: 500 });
  }
}
