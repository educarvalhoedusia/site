-- Torna alunos.disc_json opcional (aluno pode ser criado sem avaliação DISC).
-- SQLite não suporta ALTER COLUMN para remover NOT NULL, então recriamos a tabela.
CREATE TABLE alunos_novo (
  email TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  disc_json TEXT,
  progresso_json TEXT NOT NULL DEFAULT '{}',
  criado_em TEXT NOT NULL
);

INSERT INTO alunos_novo (email, nome, senha_hash, disc_json, progresso_json, criado_em)
SELECT email, nome, senha_hash, disc_json, progresso_json, criado_em FROM alunos;

DROP TABLE alunos;
ALTER TABLE alunos_novo RENAME TO alunos;
