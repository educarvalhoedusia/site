# Portal "IA na Prática" — Backend no Cloudflare (D1 + Pages Functions)

Data: 2026-09-16

## Contexto e objetivo

O portal nasceu como site 100% estático (ver
`2026-09-16-portal-ia-na-pratica-design.md`), sem backend: `config.json`
editado no admin e baixado/re-subido manualmente, e alunos existindo só como
token Base64 no link + `localStorage` do navegador. Isso trouxe duas
limitações que o autor agora quer resolver:

1. Editar conteúdo (temas, mapeamento DISC) exige baixar `config.json` e
   redeployar o site manualmente.
2. Login do aluno só funciona no navegador onde ele usou o link a primeira
   vez — sem lista central de alunos, sem acesso de outro dispositivo, sem
   progresso sincronizado.

Objetivo deste spec: dar ao portal um backend leve no Cloudflare (Pages
Functions + D1) que elimina as duas limitações, mantendo o site hospedado no
Cloudflare Pages e sem introduzir infraestrutura além do necessário.

## Restrições que moldam o design

- Continua hospedado no Cloudflare Pages — o backend deve viver no mesmo
  projeto/deploy (Pages Functions), não um serviço à parte.
- Sem sessão/estado além do estritamente necessário para autenticação —
  YAGNI: nada de fila, cache, analytics, etc.
- O admin hoje não tem senha própria (proteção = URL secreta). Com uma API
  de escrita pública, isso deixa de ser aceitável — o admin passa a ter
  login próprio.
- Estrutura de conteúdo (temas, mapeamento DISC) e o formato do JSON de
  entrada do resultado DISC (aba "Gerar Acesso") não mudam — só onde os
  dados são persistidos.

## Arquitetura

**Cloudflare Pages Functions** (pasta `functions/api/`) fornecem as rotas de
API, publicadas junto com o site estático no mesmo deploy do Pages — sem
Worker separado, sem CORS entre origens.

**D1** (SQLite gerenciado pelo Cloudflare) é a única fonte de persistência
para conteúdo e alunos, substituindo `config.json` no papel de "banco
central" e adicionando uma tabela de alunos que hoje não existe.

**Sessão** (admin e aluno) via cookie assinado com HMAC-SHA256, usando um
secret guardado como variável de ambiente do Pages (`SESSION_SECRET`).
Stateless — não há tabela nem KV de sessões; o cookie carrega
`{sub, tipo, exp}` codificado + assinatura, validado a cada request. Evita
criar e limpar estado de sessão para um caso de uso simples.

Por que não Worker separado: exigiria dois deploys e CORS — sem ganho aqui,
já que Pages Functions cobre o caso.

Por que não KV para os dados: o admin precisa **listar** alunos (quem tem
acesso, progresso) — KV não lista/filtra bem; D1 é a escolha natural para
dado relacional com essa necessidade de consulta.

## Modelo de dados (D1)

```sql
CREATE TABLE temas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  icone TEXT NOT NULL DEFAULT '⭐',
  descricao TEXT NOT NULL DEFAULT '',
  competencias_json TEXT NOT NULL DEFAULT '[]',  -- array de strings
  videos_json TEXT NOT NULL DEFAULT '[]'         -- array de {titulo, link}
);

CREATE TABLE mapeamento_disc (
  perfil TEXT PRIMARY KEY CHECK (perfil IN ('D','I','S','C')),
  pontos_fracos_json TEXT NOT NULL DEFAULT '[]',
  mensagem TEXT NOT NULL DEFAULT '',
  temas_recomendados_json TEXT NOT NULL DEFAULT '[]' -- array de tema.id
);

CREATE TABLE alunos (
  email TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  senha_hash TEXT NOT NULL,     -- scrypt, mesmo padrão do admin atual
  disc_json TEXT NOT NULL,      -- {D,I,S,C}
  progresso_json TEXT NOT NULL DEFAULT '{}', -- {temaId: [videoIndex,...]}
  criado_em TEXT NOT NULL
);

CREATE TABLE admin_usuarios (
  usuario TEXT PRIMARY KEY,
  senha_hash TEXT NOT NULL
);
```

`temas_recomendados_json` e `videos_json` continuam JSON serializado dentro
da coluna (mesma forma de hoje) — não há necessidade de normalizar mais
fundo para o volume de dados deste portal (dezenas de temas, não milhares).

## Autenticação

Reaproveita o hashing scrypt já usado em `plataforma-edudisc` (salt +
`crypto.scryptSync`), adaptado para rodar em Pages Functions (Web Crypto —
`crypto.subtle`, já que Node `crypto` não está disponível no runtime do
Cloudflare; usa PBKDF2 via Web Crypto como equivalente).

- **Admin**: `POST /api/admin/login` (usuário+senha) → valida contra
  `admin_usuarios` → cookie `edusia_admin_sessao` (HttpOnly, Secure,
  SameSite=Strict, HMAC-assinado, expira em 8h). Seed inicial: 1 usuário
  criado a partir de variáveis de ambiente (`ADMIN_SEED_USER`,
  `ADMIN_SEED_PASSWORD`) na primeira execução, mesmo padrão do
  `adminStore.js` do outro projeto.
- **Aluno**: `POST /api/aluno/login` (email+senha) → valida contra `alunos`
  → cookie `edusia_aluno_sessao` (mesmo esquema, expira em 30 dias).
- Todas as rotas de escrita (`/api/admin/*` exceto login, `/api/aluno/progresso`)
  exigem cookie de sessão válido do tipo certo; sem cookie válido → `401`.

## Rotas de API

| Rota | Método | Auth | Função |
|---|---|---|---|
| `/api/admin/login` | POST | — | login admin |
| `/api/admin/logout` | POST | admin | limpa cookie |
| `/api/config` | GET | — | retorna temas + mapeamento (substitui fetch de `config.json`) |
| `/api/admin/temas` | PUT | admin | substitui lista de temas inteira |
| `/api/admin/mapeamento` | PUT | admin | substitui mapeamento DISC inteiro |
| `/api/admin/alunos` | GET | admin | lista alunos (email, nome, criado_em, resumo de progresso) |
| `/api/admin/gerar-acesso` | POST | admin | recebe JSON do resultado DISC, cria aluno (senha gerada), retorna link+senha |
| `/api/aluno/login` | POST | — | login aluno (email+senha) |
| `/api/aluno/token-login` | POST | — | autologin a partir do token do link |
| `/api/aluno/logout` | POST | aluno | limpa cookie |
| `/api/aluno/me` | GET | aluno | retorna dados do aluno logado (nome, disc, progresso) |
| `/api/aluno/progresso` | PUT | aluno | atualiza `progresso_json` (toggle de vídeo assistido) |

`PUT` em vez de PATCH parcial nas rotas de admin (temas/mapeamento): mantém
a UX atual do admin (edita tudo em memória, salva de uma vez) — só troca
"baixar arquivo" por "salvar via API".

## Fluxos que mudam

### Admin: login
1. Abre `admin.html` → tela de login (usuário/senha) antes de qualquer aba.
2. Sucesso → cookie de sessão → libera as 3 abas.
3. Falha → erro genérico ("usuário ou senha inválidos").

### Admin: editar Temas / Mapeamento DISC
- Mesma UX de hoje (edição em memória), mas o botão vira **"Salvar"** em vez
  de "Baixar config.json" → `PUT /api/admin/temas` e/ou
  `/api/admin/mapeamento`. Sucesso mostra confirmação inline; falha mostra
  erro sem perder o estado em memória (permite tentar salvar de novo).
- `GET /api/config` carrega o estado inicial ao abrir a página (substitui
  `fetch('config.json')`).

### Admin: Gerar Acesso
- Cola o JSON do resultado DISC → `POST /api/admin/gerar-acesso` → backend
  gera senha aleatória, grava o aluno em `alunos`, retorna
  `{link, email, senha}` (link ainda é `index.html#/t=<token>` por
  compatibilidade de UX, mas agora o aluno já existe no banco mesmo antes de
  ele clicar no link).
- Nova aba/seção: **lista de alunos** (`GET /api/admin/alunos`) — não
  existia antes; é conteúdo novo pedido junto com "registro de alunos".

### Aluno: primeiro acesso (via link)
- Mesma detecção de `#/t=` e mesmo payload de token Base64 (nome, email,
  senha, disc). Diferença: como o aluno já foi criado no banco no momento
  da geração do acesso, o token agora serve só para autologin (evita pedir
  senha na primeira visita) — `script.js` decodifica o token e chama
  `POST /api/aluno/token-login` com `{email, senha}` extraídos dele; a rota
  valida contra `alunos` (mesma lógica de `/api/aluno/login`) e devolve o
  cookie de sessão. O token não é de uso único — reabrir o mesmo link
  sempre revalida contra o banco e loga de novo, igual ao comportamento
  atual (sem expiração adicional além da sessão).

### Aluno: login (qualquer dispositivo)
- Tela de login → `POST /api/aluno/login` → cookie de sessão → dashboard
  busca dados via `GET /api/aluno/me`.
- Erro → mensagem genérica ("email ou senha inválidos").

### Aluno: progresso
- Toggle de vídeo assistido chama `PUT /api/aluno/progresso` (debounced,
  não uma request por clique perdido) além de atualizar o estado local
  imediatamente (otimista) para não travar a UI esperando a rede.

## Migração do `config.json` atual

Script único de seed (`scripts/seed-d1.js` ou migration SQL gerada a partir
do `config.json` atual) roda uma vez para popular `temas` e
`mapeamento_disc` a partir do arquivo existente. Depois da migração,
`config.json` deixa de ser lido em runtime (mantido no repo só como
histórico/seed, ou removido — decidir na implementação).

## Tratamento de erros

- Falha de rede/API no portal ou admin: mensagem de erro visível (nunca
  tela em branco), com opção de tentar novamente quando fizer sentido
  (salvar, login).
- Sessão expirada em qualquer rota autenticada: `401` → frontend redireciona
  para a tela de login correspondente (admin ou aluno) sem perder o que
  o usuário estava fazendo, quando possível recuperável (ex.: admin com
  edições em memória — avisa antes de redirecionar).
- Validação de entrada (JSON do resultado DISC, campos de tema) continua
  client-side como hoje **e** é revalidada no backend (não confiar só no
  client).

## Estrutura de entrega (adições sobre a estrutura atual)

```
functions/
  api/
    admin/
      login.js
      logout.js
      temas.js
      mapeamento.js
      alunos.js
      gerar-acesso.js
    aluno/
      login.js
      logout.js
      me.js
      progresso.js
    config.js
  _lib/
    db.js          # helpers de query D1
    auth.js         # hashing, cookie assinado, middleware de sessão
schema.sql          # DDL das tabelas acima, usado por `wrangler d1 execute`
scripts/
  seed-d1.js         # popula D1 a partir do config.json atual
wrangler.toml        # binding do D1 (nome do binding, database_id)
```

`admin.html`/`admin.js`, `index.html`/`script.js`, `store.js` são
atualizados para chamar a API em vez de `fetch('config.json')` e
`localStorage` (progresso e sessão passam a ser espelhados via API; cache
local pode continuar existindo como otimização, não como fonte de verdade).

## Testes / verificação

- Mantém `npm test` (lógica pura: token, senha, cálculo DISC) e adiciona
  testes das novas funções em `functions/_lib/` (hashing, assinatura/
  validação de cookie, validação de payload) — rodáveis com o runner nativo
  do Node (sem depender do runtime do Workers para a lógica pura).
- Verificação manual com `wrangler pages dev` + D1 local
  (`wrangler d1 execute --local`) cobrindo:
  - Login admin (certo/errado) e acesso às 3 abas.
  - Editar tema/mapeamento, salvar, recarregar página → mudança persistida.
  - Gerar acesso, abrir link em navegador limpo → cai no dashboard sem
    pedir senha.
  - Logout e login do aluno em "outro dispositivo" (outro navegador) →
    funciona com email+senha.
  - Marcar vídeo assistido em um navegador, logar em outro → progresso
    sincronizado.
  - Sessão expirada/cookie inválido → redireciona para login sem crash.

## Fora de escopo (explicitamente)

- Recuperação de senha (esqueci minha senha) para admin ou aluno.
- Múltiplos usuários admin com papéis diferentes (só 1 tipo de conta admin).
- Rate limiting / proteção contra força bruta no login (aceitável para o
  volume de uso esperado; documentar como limitação conhecida).
- Editar `config.json` manualmente como alternativa ao admin passa a ser
  não suportado (fonte de verdade agora é o D1).
