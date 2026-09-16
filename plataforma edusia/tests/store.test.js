import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() {
    this.data = new Map();
  }
  getItem(k) {
    return this.data.has(k) ? this.data.get(k) : null;
  }
  setItem(k, v) {
    this.data.set(k, String(v));
  }
  removeItem(k) {
    this.data.delete(k);
  }
}

globalThis.localStorage = new MemoryStorage();

const store = await import('../store.js');

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

const payloadExemplo = { nome: 'Ana', email: 'ana@ex.com', senha: 'abc12345', disc: { D: 10, I: 20, S: 30, C: 40 }, geradoEm: '2026-01-01T00:00:00.000Z' };

test('saveAluno then getAluno returns the saved record with empty progresso', () => {
  const salvo = store.saveAluno(payloadExemplo);
  assert.deepEqual(salvo.progresso, {});
  const carregado = store.getAluno('ana@ex.com');
  assert.equal(carregado.nome, 'Ana');
  assert.deepEqual(carregado.progresso, {});
});

test('getAluno returns null for an unknown email', () => {
  assert.equal(store.getAluno('ninguem@ex.com'), null);
});

test('setSessao / getSessaoEmail / clearSessao manage the active session', () => {
  assert.equal(store.getSessaoEmail(), null);
  store.setSessao('ana@ex.com');
  assert.equal(store.getSessaoEmail(), 'ana@ex.com');
  store.clearSessao();
  assert.equal(store.getSessaoEmail(), null);
});

test('toggleVideoAssistido marks and unmarks a video, preserving other progress', () => {
  store.saveAluno(payloadExemplo);
  let progresso = store.toggleVideoAssistido('ana@ex.com', 2, 0);
  assert.deepEqual(progresso, [0]);
  progresso = store.toggleVideoAssistido('ana@ex.com', 2, 1);
  assert.deepEqual(progresso, [0, 1]);
  progresso = store.toggleVideoAssistido('ana@ex.com', 2, 0);
  assert.deepEqual(progresso, [1]);
  assert.deepEqual(store.getProgresso('ana@ex.com', 2), [1]);
  assert.deepEqual(store.getProgresso('ana@ex.com', 3), []);
});

test('saveAluno called again for the same email preserves existing progresso', () => {
  store.saveAluno(payloadExemplo);
  store.toggleVideoAssistido('ana@ex.com', 1, 0);
  const resalvo = store.saveAluno({ ...payloadExemplo, senha: 'novaSenha1' });
  assert.deepEqual(resalvo.progresso, { '1': [0] });
  assert.equal(resalvo.senha, 'novaSenha1');
});
