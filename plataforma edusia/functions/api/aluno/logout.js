export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'edusia_aluno_sessao=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    },
  });
}
