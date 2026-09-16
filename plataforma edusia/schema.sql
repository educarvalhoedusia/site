CREATE TABLE IF NOT EXISTS temas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  icone TEXT NOT NULL DEFAULT '⭐',
  descricao TEXT NOT NULL DEFAULT '',
  competencias_json TEXT NOT NULL DEFAULT '[]',
  videos_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS mapeamento_disc (
  perfil TEXT PRIMARY KEY CHECK (perfil IN ('D','I','S','C')),
  pontos_fracos_json TEXT NOT NULL DEFAULT '[]',
  mensagem TEXT NOT NULL DEFAULT '',
  temas_recomendados_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS alunos (
  email TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  disc_json TEXT,
  progresso_json TEXT NOT NULL DEFAULT '{}',
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_usuarios (
  usuario TEXT PRIMARY KEY,
  senha_hash TEXT NOT NULL
);
