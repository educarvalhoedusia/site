import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePassword, encodeToken, decodeToken, dominantProfile, validateDiscResult, orderThemesByPriority, buildPlanoDeAcao } from '../logic.js';

test('generatePassword returns an 8-character alphanumeric string by default', () => {
  const senha = generatePassword();
  assert.equal(senha.length, 8);
  assert.match(senha, /^[A-Za-z0-9]+$/);
  assert.doesNotMatch(senha, /[0O1lI]/);
});

test('generatePassword respects a custom length', () => {
  assert.equal(generatePassword(12).length, 12);
});

test('encodeToken then decodeToken returns the original payload', () => {
  const payload = { nome: 'João Silva', email: 'joao@example.com', senha: 'Xk9pL2mQ', disc: { D: 80, I: 40, S: 30, C: 20 }, geradoEm: '2026-09-16T00:00:00.000Z' };
  const token = encodeToken(payload);
  assert.equal(typeof token, 'string');
  const decoded = decodeToken(token);
  assert.deepEqual(decoded, payload);
});

test('encodeToken survives accented characters', () => {
  const payload = { nome: 'João Coração', email: 'joao@example.com', senha: 'abc12345', disc: { D: 1, I: 2, S: 3, C: 4 }, geradoEm: '2026-01-01T00:00:00.000Z' };
  const decoded = decodeToken(encodeToken(payload));
  assert.equal(decoded.nome, 'João Coração');
});

test('decodeToken throws on garbage input', () => {
  assert.throws(() => decodeToken('not-valid-base64!!!'), /inválido|corrompido/i);
});

test('decodeToken throws when required fields are missing', () => {
  const token = encodeToken({ senha: 'abc12345' });
  assert.throws(() => decodeToken(token), /incompleto/i);
});

test('dominantProfile picks the highest score', () => {
  assert.equal(dominantProfile({ D: 80, I: 40, S: 30, C: 20 }), 'D');
  assert.equal(dominantProfile({ D: 10, I: 90, S: 30, C: 20 }), 'I');
});

test('dominantProfile breaks ties in D > I > S > C order', () => {
  assert.equal(dominantProfile({ D: 50, I: 50, S: 50, C: 50 }), 'D');
  assert.equal(dominantProfile({ D: 10, I: 50, S: 50, C: 10 }), 'I');
  assert.equal(dominantProfile({ D: 10, I: 10, S: 50, C: 50 }), 'S');
});

test('validateDiscResult accepts a well-formed result', () => {
  const { valid, errors } = validateDiscResult({ nome: 'Ana', email: 'ana@ex.com', disc: { D: 1, I: 2, S: 3, C: 4 } });
  assert.equal(valid, true);
  assert.deepEqual(errors, []);
});

test('validateDiscResult reports each missing/invalid field', () => {
  const { valid, errors } = validateDiscResult({ nome: '', email: 'nao-e-email', disc: { D: 'x', I: 2, S: 3 } });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /nome/.test(e)));
  assert.ok(errors.some((e) => /email/.test(e)));
  assert.ok(errors.some((e) => /disc\.D/.test(e)));
  assert.ok(errors.some((e) => /disc\.C/.test(e)));
});

test('validateDiscResult handles completely invalid input without throwing', () => {
  const { valid, errors } = validateDiscResult(null);
  assert.equal(valid, false);
  assert.ok(errors.length > 0);
});

const temasExemplo = [
  { id: 1, nome: 'Tema Um', descricao: '', icone: '⚡', videos: [{ titulo: 'v1', link: '#' }], competenciasDesenvolvidas: [] },
  { id: 2, nome: 'Tema Dois', descricao: '', icone: '🤖', videos: [{ titulo: 'v1', link: '#' }, { titulo: 'v2', link: '#' }], competenciasDesenvolvidas: [] },
  { id: 3, nome: 'Tema Três', descricao: '', icone: '💼', videos: [], competenciasDesenvolvidas: [] },
];

test('orderThemesByPriority puts recommended temas first, in the given order', () => {
  const ordenado = orderThemesByPriority(temasExemplo, [3, 1]);
  assert.deepEqual(ordenado.map((t) => t.id), [3, 1, 2]);
});

test('orderThemesByPriority ignores recommended ids that do not exist', () => {
  const ordenado = orderThemesByPriority(temasExemplo, [99, 2]);
  assert.deepEqual(ordenado.map((t) => t.id), [2, 1, 3]);
});

test('buildPlanoDeAcao assembles perfil, mensagem, trilhas and estimates', () => {
  const config = {
    temas: temasExemplo,
    mapeamentoDisc: {
      D: { pontosFracos: ['Empatia'], temasRecomendados: [2, 1], mensagem: 'Mensagem D' },
      I: { pontosFracos: [], temasRecomendados: [1], mensagem: 'Mensagem I' },
      S: { pontosFracos: [], temasRecomendados: [1], mensagem: 'Mensagem S' },
      C: { pontosFracos: [], temasRecomendados: [1], mensagem: 'Mensagem C' },
    },
  };
  const plano = buildPlanoDeAcao(config, { D: 90, I: 10, S: 10, C: 10 });
  assert.equal(plano.perfil, 'D');
  assert.deepEqual(plano.pontosFracos, ['Empatia']);
  assert.equal(plano.mensagem, 'Mensagem D');
  assert.deepEqual(plano.trilhas.map((t) => t.id), [2, 1, 3]);
  assert.equal(plano.tempoEstimadoHoras, 8);
  assert.equal(plano.qtdRecomendados, 2);
  assert.equal(plano.metaDias, 30);
});

test('the URL-fragment token pattern used by tratarToken extracts and round-trips the token', () => {
  const payload = { nome: 'Ana', email: 'ana@ex.com', senha: 'abc12345', disc: { D: 1, I: 2, S: 3, C: 4 }, geradoEm: '2026-01-01T00:00:00.000Z' };
  const token = encodeToken(payload);
  const hash = `#/t=${token}`;
  const match = hash.match(/#\/t=(.+)/);
  assert.ok(match);
  const decoded = decodeToken(decodeURIComponent(match[1]));
  assert.deepEqual(decoded, payload);
});
