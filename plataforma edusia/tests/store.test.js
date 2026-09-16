import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = await import('../store.js');

beforeEach(() => {
  store.clearAlunoAtual();
});

const alunoExemplo = {
  nome: 'Ana',
  email: 'ana@ex.com',
  senha: 'abc12345',
  disc: { D: 10, I: 20, S: 30, C: 40 },
  progresso: {},
};

test('setAlunoAtual / getAlunoAtual store and retrieve the current student in memory', () => {
  assert.equal(store.getAlunoAtual(), null);
  store.setAlunoAtual(alunoExemplo);
  const atual = store.getAlunoAtual();
  assert.equal(atual.nome, 'Ana');
  assert.equal(atual.email, 'ana@ex.com');
});

test('clearAlunoAtual resets the current student to null', () => {
  store.setAlunoAtual(alunoExemplo);
  store.clearAlunoAtual();
  assert.equal(store.getAlunoAtual(), null);
});

test('toggleVideoAssistidoLocal marks and unmarks a video, preserving other progress', () => {
  store.setAlunoAtual({ ...alunoExemplo, progresso: {} });
  let progresso = store.toggleVideoAssistidoLocal(2, 0);
  assert.deepEqual(progresso, [0]);
  progresso = store.toggleVideoAssistidoLocal(2, 1);
  assert.deepEqual(progresso, [0, 1]);
  progresso = store.toggleVideoAssistidoLocal(2, 0);
  assert.deepEqual(progresso, [1]);
  assert.deepEqual(store.getProgresso(2), [1]);
  assert.deepEqual(store.getProgresso(3), []);
});

test('toggleVideoAssistidoLocal is a no-op when there is no current student', () => {
  assert.deepEqual(store.toggleVideoAssistidoLocal(2, 0), []);
});

test('getProgresso returns [] when there is no current student', () => {
  assert.deepEqual(store.getProgresso(1), []);
});

test('agendarSalvarProgresso debounces and eventually calls the given function', async () => {
  let chamadas = 0;
  store.agendarSalvarProgresso(() => {
    chamadas += 1;
  });
  store.agendarSalvarProgresso(() => {
    chamadas += 1;
  });
  assert.equal(chamadas, 0);
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(chamadas, 1);
});
