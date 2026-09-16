import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, signSession, verifySession, buildSetCookie, parseCookies } from '../functions/_lib/auth.js';

test('hashPassword produces a salt:hash string, different each time', async () => {
  const a = await hashPassword('Edusia03*');
  const b = await hashPassword('Edusia03*');
  assert.match(a, /^[0-9a-f]+:[0-9a-f]+$/);
  assert.notEqual(a, b, 'salts should differ between calls');
});

test('verifyPassword accepts the correct password and rejects a wrong one', async () => {
  const stored = await hashPassword('Edusia03*');
  assert.equal(await verifyPassword('Edusia03*', stored), true);
  assert.equal(await verifyPassword('senha-errada', stored), false);
});

test('signSession then verifySession round-trips the payload', async () => {
  const cookie = await signSession({ sub: 'aluno@example.com', tipo: 'aluno' }, 'segredo-teste', 60);
  const payload = await verifySession(cookie, 'segredo-teste');
  assert.equal(payload.sub, 'aluno@example.com');
  assert.equal(payload.tipo, 'aluno');
});

test('verifySession rejects a tampered cookie', async () => {
  const cookie = await signSession({ sub: 'x', tipo: 'admin' }, 'segredo-teste', 60);
  const tampered = cookie.slice(0, -1) + (cookie.at(-1) === 'a' ? 'b' : 'a');
  assert.equal(await verifySession(tampered, 'segredo-teste'), null);
});

test('verifySession rejects an expired cookie', async () => {
  const cookie = await signSession({ sub: 'x', tipo: 'admin' }, 'segredo-teste', -1);
  assert.equal(await verifySession(cookie, 'segredo-teste'), null);
});

test('verifySession rejects a cookie signed with a different secret', async () => {
  const cookie = await signSession({ sub: 'x', tipo: 'admin' }, 'segredo-a', 60);
  assert.equal(await verifySession(cookie, 'segredo-b'), null);
});

test('buildSetCookie sets HttpOnly, Secure, SameSite=Strict and Max-Age', () => {
  const header = buildSetCookie('edusia_teste', 'valor', 3600);
  assert.match(header, /^edusia_teste=valor;/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.match(header, /SameSite=Strict/);
  assert.match(header, /Max-Age=3600/);
});

test('parseCookies reads multiple cookies from a header string', () => {
  const cookies = parseCookies('a=1; b=2; edusia_admin_sessao=abc.def');
  assert.deepEqual(cookies, { a: '1', b: '2', edusia_admin_sessao: 'abc.def' });
});

test('parseCookies returns {} for null header', () => {
  assert.deepEqual(parseCookies(null), {});
});
