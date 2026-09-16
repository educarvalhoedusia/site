import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

test('config.json has at least 6 temas with required fields', () => {
  assert.ok(Array.isArray(config.temas));
  assert.ok(config.temas.length >= 6);
  config.temas.forEach((tema) => {
    assert.equal(typeof tema.id, 'number');
    assert.equal(typeof tema.nome, 'string');
    assert.equal(typeof tema.descricao, 'string');
    assert.equal(typeof tema.icone, 'string');
    assert.ok(Array.isArray(tema.videos));
    tema.videos.forEach((v) => {
      assert.equal(typeof v.titulo, 'string');
      assert.equal(typeof v.link, 'string');
    });
    assert.ok(Array.isArray(tema.competenciasDesenvolvidas));
  });
});

test('mapeamentoDisc covers D, I, S, C and references valid tema ids', () => {
  const idsValidos = new Set(config.temas.map((t) => t.id));
  ['D', 'I', 'S', 'C'].forEach((perfil) => {
    const dados = config.mapeamentoDisc[perfil];
    assert.ok(dados, `perfil ${perfil} ausente`);
    assert.ok(Array.isArray(dados.pontosFracos) && dados.pontosFracos.length > 0);
    assert.ok(Array.isArray(dados.temasRecomendados) && dados.temasRecomendados.length > 0);
    dados.temasRecomendados.forEach((id) => assert.ok(idsValidos.has(id), `id ${id} inválido em ${perfil}`));
    assert.equal(typeof dados.mensagem, 'string');
    assert.ok(dados.mensagem.length > 0);
  });
});
