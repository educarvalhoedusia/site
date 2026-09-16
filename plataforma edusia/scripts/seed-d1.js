// Gera as instruções SQL de seed a partir do config.json atual e as
// aplica no D1 local. Rodar uma única vez por ambiente (local, depois
// produção) para popular temas + mapeamentoDisc.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const statements = [];

config.temas.forEach((tema) => {
  statements.push(
    `INSERT INTO temas (id, nome, icone, descricao, competencias_json, videos_json) VALUES (` +
      `${tema.id}, ${sqlString(tema.nome)}, ${sqlString(tema.icone)}, ${sqlString(tema.descricao)}, ` +
      `${sqlString(JSON.stringify(tema.competenciasDesenvolvidas))}, ${sqlString(JSON.stringify(tema.videos))});`
  );
});

['D', 'I', 'S', 'C'].forEach((perfil) => {
  const dados = config.mapeamentoDisc[perfil];
  statements.push(
    `INSERT INTO mapeamento_disc (perfil, pontos_fracos_json, mensagem, temas_recomendados_json) VALUES (` +
      `${sqlString(perfil)}, ${sqlString(JSON.stringify(dados.pontosFracos))}, ${sqlString(dados.mensagem)}, ` +
      `${sqlString(JSON.stringify(dados.temasRecomendados))});`
  );
});

const sqlFile = new URL('../.seed-d1-generated.sql', import.meta.url);
const { writeFileSync } = await import('node:fs');
writeFileSync(sqlFile, statements.join('\n'), 'utf8');

const target = process.argv.includes('--remote') ? '--remote' : '--local';
execFileSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'edusia-portal-db', target, '--file=.seed-d1-generated.sql'],
  { stdio: 'inherit', shell: true }
);

console.log(`Seed aplicado (${target}).`);
