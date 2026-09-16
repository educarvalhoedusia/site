# Portal IA na Prática — Backend Cloudflare (D1 + Pages Functions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `config.json` + localStorage-only student model with a Cloudflare Pages Functions + D1 backend: admin login and direct save (no more download/re-upload), and students that log in with email+password from any device with progress synced server-side.

**Architecture:** Cloudflare Pages Functions (`functions/api/**`) provide the API, deployed in the same Pages project as the static site. D1 (SQLite) is the single source of truth for `temas`, `mapeamento_disc`, `alunos`, `admin_usuarios`. Sessions (admin and student) are stateless signed cookies (HMAC-SHA256) — no session table, no KV.

**Tech Stack:** Cloudflare Pages Functions, Cloudflare D1, Web Crypto API (`crypto.subtle`) for password hashing (PBKDF2) and cookie signing (HMAC), `wrangler` CLI for local dev/deploy, vanilla JS on the frontend (no framework, matching the existing codebase).

**Spec:** `docs/superpowers/specs/2026-09-16-cloudflare-backend-design.md`

## Global Constraints

- Node **20+** required (this plan uses global `crypto.subtle`, not available by default before Node 20) — update `package.json` engines and README accordingly.
- No new frontend framework or build step — keep vanilla HTML/CSS/JS, same as the rest of the project.
- Cookies: `HttpOnly`, `Secure`, `SameSite=Strict`. Admin session expires in 8h, student session in 30 days (from the spec).
- All write routes (except the two login routes) require a valid session cookie of the matching type — return `401` otherwise.
- Reuse existing pure logic from `logic.js` (`generatePassword`, `encodeToken`, `decodeToken`, `validateDiscResult`, `buildPlanoDeAcao`) — do not duplicate it in the backend functions.
- Every API error response is JSON: `{ "error": "<mensagem em português, amigável>" }`.

---

## File Structure

```
schema.sql                        # D1 DDL (temas, mapeamento_disc, alunos, admin_usuarios)
wrangler.toml                     # D1 binding config for local dev + deploy
scripts/seed-d1.js                # one-time: config.json -> D1 insert statements
functions/
  _lib/
    auth.js                       # password hashing, cookie sign/verify, authenticateAdmin/Aluno
    db.js                         # D1 query helpers (one function per table operation)
  api/
    config.js                     # GET /api/config
    admin/
      login.js                    # POST /api/admin/login
      logout.js                   # POST /api/admin/logout
      temas.js                    # PUT /api/admin/temas
      mapeamento.js                # PUT /api/admin/mapeamento
      gerar-acesso.js              # POST /api/admin/gerar-acesso
      alunos.js                    # GET /api/admin/alunos
    aluno/
      login.js                    # POST /api/aluno/login
      token-login.js               # POST /api/aluno/token-login
      me.js                        # GET /api/aluno/me
      progresso.js                 # PUT /api/aluno/progresso
admin.html / admin.js             # + tela de login, botão "Salvar" em vez de "Baixar"
index.html / script.js / store.js # login/token-login/progresso via API
README.md                         # setup do D1, novo fluxo de deploy
```

---

### Task 1: D1 schema, wrangler config, and seed script

**Files:**
- Create: `schema.sql`
- Create: `wrangler.toml`
- Create: `scripts/seed-d1.js`
- Modify: `package.json` (add `engines.node`, `devDependencies.wrangler`, script `db:seed`)
- Test: manual, via `wrangler d1` CLI (no D1 binding exists yet for automated tests)

**Interfaces:**
- Produces: the four tables described in the spec (`temas`, `mapeamento_disc`, `alunos`, `admin_usuarios`), and a populated local D1 database that later tasks query against.

- [ ] **Step 1: Write `schema.sql`**

```sql
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
  disc_json TEXT NOT NULL,
  progresso_json TEXT NOT NULL DEFAULT '{}',
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_usuarios (
  usuario TEXT PRIMARY KEY,
  senha_hash TEXT NOT NULL
);
```

- [ ] **Step 2: Write `wrangler.toml`**

```toml
name = "portal-ia-na-pratica"
compatibility_date = "2026-09-16"
pages_build_output_dir = "."

[[d1_databases]]
binding = "DB"
database_name = "edusia-portal-db"
database_id = "REPLACE_WITH_ID_FROM_WRANGLER_D1_CREATE"
```

- [ ] **Step 3: Create the local D1 database and apply the schema**

```bash
npx wrangler d1 create edusia-portal-db
```

Copy the `database_id` printed by that command into `wrangler.toml` (replacing
`REPLACE_WITH_ID_FROM_WRANGLER_D1_CREATE`). Then apply the schema locally:

```bash
npx wrangler d1 execute edusia-portal-db --local --file=schema.sql
```

Expected: `🌀 Executing on local database...` followed by success, no errors.

- [ ] **Step 4: Write `scripts/seed-d1.js`**

```js
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
```

- [ ] **Step 5: Update `package.json`**

Add (merge into the existing file, keep `"test": "node --test"`):

```json
{
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test",
    "db:seed": "node scripts/seed-d1.js",
    "db:seed:remote": "node scripts/seed-d1.js --remote"
  },
  "devDependencies": {
    "wrangler": "^3.78.0"
  }
}
```

- [ ] **Step 6: Run the seed script locally and verify**

```bash
npm install
npm run db:seed
npx wrangler d1 execute edusia-portal-db --local --command "SELECT count(*) AS n FROM temas;"
```

Expected: `n` equals the number of temas in `config.json` (6 in the current seed data).

- [ ] **Step 7: Commit**

```bash
git add schema.sql wrangler.toml scripts/seed-d1.js package.json package-lock.json .gitignore
git commit -m "feat: add D1 schema, wrangler config, and seed script"
```

(Add `.wrangler/` and `.seed-d1-generated.sql` to `.gitignore` if not already ignored — these are local build/seed artifacts.)

---

### Task 2: `_lib/auth.js` — password hashing and session cookies

**Files:**
- Create: `functions/_lib/auth.js`
- Test: `tests/auth.test.js`

**Interfaces:**
- Produces:
  - `hashPassword(senha: string): Promise<string>` — returns `"<saltHex>:<hashHex>"`.
  - `verifyPassword(senha: string, armazenado: string): Promise<boolean>`.
  - `signSession(payload: object, secret: string, maxAgeSeconds: number): Promise<string>` — returns cookie value.
  - `verifySession(cookieValue: string, secret: string): Promise<object|null>` — returns payload or `null` if invalid/expired.
  - `buildSetCookie(name: string, value: string, maxAgeSeconds: number): string` — `Set-Cookie` header value.
  - `parseCookies(cookieHeader: string|null): Record<string,string>`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/auth.test.js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/auth.test.js`
Expected: FAIL — `functions/_lib/auth.js` does not exist yet.

- [ ] **Step 3: Write `functions/_lib/auth.js`**

```js
const PBKDF2_ITERATIONS = 100000;
const HASH_ALGO = 'SHA-256';

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function base64url(bytesOrString) {
  const bytes = typeof bytesOrString === 'string' ? new TextEncoder().encode(bytesOrString) : bytesOrString;
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - (str.length % 4)) % 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function hashPassword(senha) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: HASH_ALGO },
    keyMaterial,
    256
  );
  return `${toHex(salt)}:${toHex(derived)}`;
}

export async function verifyPassword(senha, armazenado) {
  const [saltHex, hashHex] = String(armazenado).split(':');
  if (!saltHex || !hashHex) return false;
  const salt = fromHex(saltHex);
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: HASH_ALGO },
    keyMaterial,
    256
  );
  const derivedHex = toHex(derived);
  if (derivedHex.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < derivedHex.length; i++) {
    diff |= derivedHex.charCodeAt(i) ^ hashHex.charCodeAt(i);
  }
  return diff === 0;
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: HASH_ALGO }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return base64url(new Uint8Array(signature));
}

export async function signSession(payload, secret, maxAgeSeconds) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + maxAgeSeconds };
  const encodedPayload = base64url(JSON.stringify(body));
  const signature = await hmac(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifySession(cookieValue, secret) {
  if (!cookieValue || !cookieValue.includes('.')) return null;
  const [encodedPayload, signature] = cookieValue.split('.');
  const expected = await hmac(secret, encodedPayload);
  if (expected !== signature) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64url(encodedPayload)));
  } catch (e) {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function buildSetCookie(name, value, maxAgeSeconds) {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map((part) => {
      const [k, ...rest] = part.trim().split('=');
      return [k, rest.join('=')];
    })
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/auth.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/auth.js tests/auth.test.js
git commit -m "feat: add password hashing and signed-cookie session helpers"
```

---

### Task 3: `_lib/db.js` and `GET /api/config`

**Files:**
- Create: `functions/_lib/db.js`
- Create: `functions/api/config.js`
- Test: manual, via `wrangler pages dev`

**Interfaces:**
- Consumes: none (first D1-touching code).
- Produces (used by later tasks):
  - `getConfig(db): Promise<{temas: Array, mapeamentoDisc: object}>`
  - `replaceTemas(db, temas: Array): Promise<void>`
  - `replaceMapeamento(db, mapeamentoDisc: object): Promise<void>`
  - `listAlunos(db): Promise<Array<{email,nome,criado_em,progresso}>>`
  - `getAlunoByEmail(db, email): Promise<object|null>`
  - `createAluno(db, {email, nome, senhaHash, disc, criadoEm}): Promise<void>`
  - `updateProgresso(db, email, progresso: object): Promise<void>`
  - `getAdminByUsuario(db, usuario): Promise<object|null>`
  - `ensureAdminSeed(db, env): Promise<void>` — inserts one admin row from `env.ADMIN_SEED_USER`/`env.ADMIN_SEED_PASSWORD` if `admin_usuarios` is empty.

- [ ] **Step 1: Write `functions/_lib/db.js`**

```js
import { hashPassword } from './auth.js';

export async function getConfig(db) {
  const { results: temaRows } = await db.prepare('SELECT * FROM temas ORDER BY id').all();
  const temas = temaRows.map((row) => ({
    id: row.id,
    nome: row.nome,
    icone: row.icone,
    descricao: row.descricao,
    competenciasDesenvolvidas: JSON.parse(row.competencias_json),
    videos: JSON.parse(row.videos_json),
  }));

  const { results: mapRows } = await db.prepare('SELECT * FROM mapeamento_disc').all();
  const mapeamentoDisc = {};
  for (const row of mapRows) {
    mapeamentoDisc[row.perfil] = {
      pontosFracos: JSON.parse(row.pontos_fracos_json),
      mensagem: row.mensagem,
      temasRecomendados: JSON.parse(row.temas_recomendados_json),
    };
  }
  return { temas, mapeamentoDisc };
}

export async function replaceTemas(db, temas) {
  const statements = [db.prepare('DELETE FROM temas')];
  for (const tema of temas) {
    statements.push(
      db.prepare(
        'INSERT INTO temas (id, nome, icone, descricao, competencias_json, videos_json) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        tema.id,
        tema.nome,
        tema.icone,
        tema.descricao,
        JSON.stringify(tema.competenciasDesenvolvidas || []),
        JSON.stringify(tema.videos || [])
      )
    );
  }
  await db.batch(statements);
}

export async function replaceMapeamento(db, mapeamentoDisc) {
  const statements = [db.prepare('DELETE FROM mapeamento_disc')];
  for (const perfil of ['D', 'I', 'S', 'C']) {
    const dados = mapeamentoDisc[perfil] || { pontosFracos: [], mensagem: '', temasRecomendados: [] };
    statements.push(
      db.prepare(
        'INSERT INTO mapeamento_disc (perfil, pontos_fracos_json, mensagem, temas_recomendados_json) VALUES (?, ?, ?, ?)'
      ).bind(perfil, JSON.stringify(dados.pontosFracos || []), dados.mensagem || '', JSON.stringify(dados.temasRecomendados || []))
    );
  }
  await db.batch(statements);
}

export async function listAlunos(db) {
  const { results } = await db.prepare('SELECT email, nome, disc_json, progresso_json, criado_em FROM alunos ORDER BY criado_em DESC').all();
  return results.map((row) => ({
    email: row.email,
    nome: row.nome,
    disc: JSON.parse(row.disc_json),
    progresso: JSON.parse(row.progresso_json),
    criadoEm: row.criado_em,
  }));
}

export async function getAlunoByEmail(db, email) {
  const row = await db.prepare('SELECT * FROM alunos WHERE email = ?').bind(email).first();
  if (!row) return null;
  return {
    email: row.email,
    nome: row.nome,
    senhaHash: row.senha_hash,
    disc: JSON.parse(row.disc_json),
    progresso: JSON.parse(row.progresso_json),
    criadoEm: row.criado_em,
  };
}

export async function createAluno(db, { email, nome, senhaHash, disc, criadoEm }) {
  await db.prepare(
    'INSERT INTO alunos (email, nome, senha_hash, disc_json, progresso_json, criado_em) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(email, nome, senhaHash, JSON.stringify(disc), '{}', criadoEm).run();
}

export async function updateProgresso(db, email, progresso) {
  await db.prepare('UPDATE alunos SET progresso_json = ? WHERE email = ?').bind(JSON.stringify(progresso), email).run();
}

export async function getAdminByUsuario(db, usuario) {
  const row = await db.prepare('SELECT * FROM admin_usuarios WHERE usuario = ?').bind(usuario).first();
  if (!row) return null;
  return { usuario: row.usuario, senhaHash: row.senha_hash };
}

export async function ensureAdminSeed(db, env) {
  const { results } = await db.prepare('SELECT COUNT(*) AS n FROM admin_usuarios').all();
  if (results[0].n > 0) return;
  if (!env.ADMIN_SEED_USER || !env.ADMIN_SEED_PASSWORD) {
    throw new Error('Nenhum admin cadastrado e ADMIN_SEED_USER/ADMIN_SEED_PASSWORD não configurados.');
  }
  const senhaHash = await hashPassword(env.ADMIN_SEED_PASSWORD);
  await db.prepare('INSERT INTO admin_usuarios (usuario, senha_hash) VALUES (?, ?)').bind(env.ADMIN_SEED_USER, senhaHash).run();
}
```

- [ ] **Step 2: Write `functions/api/config.js`**

```js
import { getConfig } from '../_lib/db.js';

export async function onRequestGet({ env }) {
  try {
    const config = await getConfig(env.DB);
    return Response.json(config);
  } catch (e) {
    return Response.json({ error: 'Conteúdo não pôde ser carregado.' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify manually with `wrangler pages dev`**

```bash
npx wrangler pages dev . --d1=DB=edusia-portal-db --compatibility-date=2026-09-16
```

In another terminal:

```bash
curl -s http://127.0.0.1:8788/api/config | head -c 300
```

Expected: JSON with `"temas"` (array, same length as `config.json`) and `"mapeamentoDisc"` with keys `D`, `I`, `S`, `C`.

- [ ] **Step 4: Commit**

```bash
git add functions/_lib/db.js functions/api/config.js
git commit -m "feat: add D1 query helpers and GET /api/config"
```

---

### Task 4: Admin login and logout

**Files:**
- Create: `functions/api/admin/login.js`
- Create: `functions/api/admin/logout.js`

**Interfaces:**
- Consumes: `hashPassword`/`verifyPassword`/`signSession`/`buildSetCookie`/`parseCookies` from `_lib/auth.js`; `getAdminByUsuario`/`ensureAdminSeed` from `_lib/db.js`.
- Produces: cookie name `edusia_admin_sessao`, session payload `{ sub: usuario, tipo: 'admin' }`, 8h max age (`8 * 60 * 60` seconds) — later tasks' protected routes read this cookie.

- [ ] **Step 1: Write `functions/api/admin/login.js`**

```js
import { verifyPassword, signSession, buildSetCookie } from '../../_lib/auth.js';
import { getAdminByUsuario, ensureAdminSeed } from '../../_lib/db.js';

const OITO_HORAS = 8 * 60 * 60;

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  const { usuario, senha } = body || {};
  if (!usuario || !senha) {
    return Response.json({ error: 'Usuário e senha são obrigatórios.' }, { status: 400 });
  }

  await ensureAdminSeed(env.DB, env);
  const admin = await getAdminByUsuario(env.DB, usuario);
  if (!admin || !(await verifyPassword(senha, admin.senhaHash))) {
    return Response.json({ error: 'Usuário ou senha inválidos.' }, { status: 401 });
  }

  const cookieValue = await signSession({ sub: admin.usuario, tipo: 'admin' }, env.SESSION_SECRET, OITO_HORAS);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': buildSetCookie('edusia_admin_sessao', cookieValue, OITO_HORAS),
    },
  });
}
```

- [ ] **Step 2: Write `functions/api/admin/logout.js`**

```js
export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'edusia_admin_sessao=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    },
  });
}
```

- [ ] **Step 3: Verify manually**

```bash
# with wrangler pages dev still running and SESSION_SECRET / ADMIN_SEED_USER / ADMIN_SEED_PASSWORD
# set via .dev.vars (create if missing, see Step 4)
curl -i -s -c cookies.txt -X POST http://127.0.0.1:8788/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"usuario":"admin@edusia","senha":"Edusia03*"}'
```

Expected: `200`, body `{"ok":true}`, `Set-Cookie: edusia_admin_sessao=...` in the response headers, and `cookies.txt` now has the cookie.

```bash
curl -i -s -X POST http://127.0.0.1:8788/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"usuario":"admin@edusia","senha":"errada"}'
```

Expected: `401`, `{"error":"Usuário ou senha inválidos."}`.

- [ ] **Step 4: Create `.dev.vars` for local secrets (not committed)**

```
SESSION_SECRET=troque-por-um-segredo-longo-e-aleatorio-local
ADMIN_SEED_USER=admin@edusia
ADMIN_SEED_PASSWORD=Edusia03*
```

Add `.dev.vars` to `.gitignore` if not already present.

- [ ] **Step 5: Commit**

```bash
git add functions/api/admin/login.js functions/api/admin/logout.js .gitignore
git commit -m "feat: add admin login/logout with signed session cookie"
```

---

### Task 5: Admin temas and mapeamento (protected PUT routes)

**Files:**
- Create: `functions/_lib/require-session.js`
- Create: `functions/api/admin/temas.js`
- Create: `functions/api/admin/mapeamento.js`

**Interfaces:**
- Consumes: `verifySession`, `parseCookies` from `_lib/auth.js`; `replaceTemas`, `replaceMapeamento` from `_lib/db.js`.
- Produces: `requireSession(request, env, tipo): Promise<object|Response>` — returns the session payload on success, or a ready-to-return `401` `Response` on failure. Later protected routes (Tasks 6–9) use this same helper.

- [ ] **Step 1: Write `functions/_lib/require-session.js`**

```js
import { verifySession, parseCookies } from './auth.js';

export async function requireSession(request, env, tipo) {
  const cookieName = tipo === 'admin' ? 'edusia_admin_sessao' : 'edusia_aluno_sessao';
  const cookies = parseCookies(request.headers.get('Cookie'));
  const payload = await verifySession(cookies[cookieName], env.SESSION_SECRET);
  if (!payload || payload.tipo !== tipo) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  return payload;
}
```

- [ ] **Step 2: Write `functions/api/admin/temas.js`**

```js
import { requireSession } from '../../_lib/require-session.js';
import { replaceTemas } from '../../_lib/db.js';

export async function onRequestPut({ request, env }) {
  const session = await requireSession(request, env, 'admin');
  if (session instanceof Response) return session;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  if (!Array.isArray(body?.temas)) {
    return Response.json({ error: 'Campo "temas" deve ser uma lista.' }, { status: 400 });
  }
  for (const tema of body.temas) {
    if (typeof tema.id !== 'number' || typeof tema.nome !== 'string') {
      return Response.json({ error: 'Cada tema precisa de "id" numérico e "nome" texto.' }, { status: 400 });
    }
  }

  await replaceTemas(env.DB, body.temas);
  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Write `functions/api/admin/mapeamento.js`**

```js
import { requireSession } from '../../_lib/require-session.js';
import { replaceMapeamento } from '../../_lib/db.js';

export async function onRequestPut({ request, env }) {
  const session = await requireSession(request, env, 'admin');
  if (session instanceof Response) return session;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  const mapeamento = body?.mapeamentoDisc;
  if (!mapeamento || typeof mapeamento !== 'object') {
    return Response.json({ error: 'Campo "mapeamentoDisc" é obrigatório.' }, { status: 400 });
  }
  for (const perfil of ['D', 'I', 'S', 'C']) {
    if (!mapeamento[perfil]) {
      return Response.json({ error: `Perfil "${perfil}" ausente em mapeamentoDisc.` }, { status: 400 });
    }
  }

  await replaceMapeamento(env.DB, mapeamento);
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Verify manually**

```bash
# sem cookie -> 401
curl -i -s -X PUT http://127.0.0.1:8788/api/admin/temas -H "Content-Type: application/json" -d '{"temas":[]}'

# com cookie (reaproveita cookies.txt do Task 4) -> 200
curl -i -s -b cookies.txt -X PUT http://127.0.0.1:8788/api/admin/temas \
  -H "Content-Type: application/json" \
  -d '{"temas":[{"id":1,"nome":"Teste","icone":"⭐","descricao":"","competenciasDesenvolvidas":[],"videos":[]}]}'

curl -s http://127.0.0.1:8788/api/config
```

Expected: first call `401`; second call `200 {"ok":true}`; third call shows `temas` replaced with the single "Teste" tema. Re-run `npm run db:seed` afterwards to restore the original 6 temas for later manual testing.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/require-session.js functions/api/admin/temas.js functions/api/admin/mapeamento.js
git commit -m "feat: add protected admin routes to replace temas and mapeamento"
```

---

### Task 6: Admin — gerar acesso and listar alunos

**Files:**
- Create: `functions/api/admin/gerar-acesso.js`
- Create: `functions/api/admin/alunos.js`

**Interfaces:**
- Consumes: `requireSession`; `hashPassword` from `_lib/auth.js`; `createAluno`, `listAlunos` from `_lib/db.js`; `generatePassword`, `encodeToken`, `validateDiscResult` from `../../../logic.js`.
- Produces: on success, `gerar-acesso` returns `{ link, email, senha }` — the frontend admin (Task 10) renders these exactly as it does today.

- [ ] **Step 1: Write `functions/api/admin/gerar-acesso.js`**

```js
import { requireSession } from '../../_lib/require-session.js';
import { hashPassword } from '../../_lib/auth.js';
import { createAluno, getAlunoByEmail } from '../../_lib/db.js';
import { generatePassword, encodeToken, validateDiscResult } from '../../../logic.js';

export async function onRequestPost({ request, env }) {
  const session = await requireSession(request, env, 'admin');
  if (session instanceof Response) return session;

  let dados;
  try {
    dados = await request.json();
  } catch (e) {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const { valid, errors } = validateDiscResult(dados);
  if (!valid) {
    return Response.json({ error: errors.join(' | ') }, { status: 400 });
  }

  const existente = await getAlunoByEmail(env.DB, dados.email);
  if (existente) {
    return Response.json({ error: 'Já existe um aluno cadastrado com esse email.' }, { status: 409 });
  }

  const senha = generatePassword();
  const senhaHash = await hashPassword(senha);
  const geradoEm = new Date().toISOString();
  await createAluno(env.DB, { email: dados.email, nome: dados.nome, senhaHash, disc: dados.disc, criadoEm: geradoEm });

  const token = encodeToken({ nome: dados.nome, email: dados.email, senha, disc: dados.disc, geradoEm });
  const baseUrl = new URL('index.html', request.url).href;
  const link = `${baseUrl}#/t=${token}`;

  return Response.json({ link, email: dados.email, senha });
}
```

- [ ] **Step 2: Write `functions/api/admin/alunos.js`**

```js
import { requireSession } from '../../_lib/require-session.js';
import { listAlunos } from '../../_lib/db.js';

export async function onRequestGet({ request, env }) {
  const session = await requireSession(request, env, 'admin');
  if (session instanceof Response) return session;

  const alunos = await listAlunos(env.DB);
  const resumo = alunos.map((a) => ({
    email: a.email,
    nome: a.nome,
    criadoEm: a.criadoEm,
    videosAssistidos: Object.values(a.progresso).reduce((soma, lista) => soma + lista.length, 0),
  }));
  return Response.json({ alunos: resumo });
}
```

- [ ] **Step 3: Verify manually**

```bash
curl -i -s -b cookies.txt -X POST http://127.0.0.1:8788/api/admin/gerar-acesso \
  -H "Content-Type: application/json" \
  -d '{"nome":"Maria Souza","email":"maria@example.com","disc":{"D":30,"I":85,"S":40,"C":25}}'

curl -s -b cookies.txt http://127.0.0.1:8788/api/admin/alunos
```

Expected: first call `200` with `link`, `email`, `senha`; second call lists `maria@example.com` with `videosAssistidos: 0`. Repeating the first call with the same email returns `409`.

- [ ] **Step 4: Commit**

```bash
git add functions/api/admin/gerar-acesso.js functions/api/admin/alunos.js
git commit -m "feat: add admin routes to generate student access and list students"
```

---

### Task 7: Student login and token-login

**Files:**
- Modify: `functions/_lib/auth.js` (add `authenticateAluno`)
- Create: `functions/api/aluno/login.js`
- Create: `functions/api/aluno/token-login.js`

**Interfaces:**
- Consumes: `getAlunoByEmail` from `_lib/db.js`; `verifyPassword`, `signSession`, `buildSetCookie` from `_lib/auth.js`.
- Produces: `authenticateAluno(db, email, senha): Promise<object|null>` (returns the aluno record from `getAlunoByEmail` on success). Cookie name `edusia_aluno_sessao`, payload `{ sub: email, tipo: 'aluno' }`, 30-day max age (`30 * 24 * 60 * 60`).

- [ ] **Step 1: Add `authenticateAluno` to `functions/_lib/auth.js`**

Append to the end of the file:

```js
export async function authenticateAluno(db, email, senha) {
  const { getAlunoByEmail } = await import('./db.js');
  const aluno = await getAlunoByEmail(db, email);
  if (!aluno || !(await verifyPassword(senha, aluno.senhaHash))) return null;
  return aluno;
}
```

(Dynamic import avoids a circular import, since `db.js` also imports `hashPassword` from `auth.js`.)

- [ ] **Step 2: Write `functions/api/aluno/login.js`**

```js
import { authenticateAluno, signSession, buildSetCookie } from '../../_lib/auth.js';

const TRINTA_DIAS = 30 * 24 * 60 * 60;

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  const { email, senha } = body || {};
  if (!email || !senha) {
    return Response.json({ error: 'Email e senha são obrigatórios.' }, { status: 400 });
  }

  const aluno = await authenticateAluno(env.DB, email, senha);
  if (!aluno) {
    return Response.json({ error: 'Email ou senha inválidos.' }, { status: 401 });
  }

  const cookieValue = await signSession({ sub: aluno.email, tipo: 'aluno' }, env.SESSION_SECRET, TRINTA_DIAS);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': buildSetCookie('edusia_aluno_sessao', cookieValue, TRINTA_DIAS),
    },
  });
}
```

- [ ] **Step 3: Write `functions/api/aluno/token-login.js`**

Same behavior as `login.js`, exposed on a distinct route as described in the spec (so the frontend has one clear name for "login coming from the link token" vs. "login coming from the form"):

```js
export { onRequestPost } from './login.js';
```

- [ ] **Step 4: Verify manually**

```bash
curl -i -s -c aluno-cookies.txt -X POST http://127.0.0.1:8788/api/aluno/login \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","senha":"<senha retornada no Task 6>"}'
```

Expected: `200`, `Set-Cookie: edusia_aluno_sessao=...`.

```bash
curl -i -s -X POST http://127.0.0.1:8788/api/aluno/token-login \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","senha":"senha-errada"}'
```

Expected: `401`.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/auth.js functions/api/aluno/login.js functions/api/aluno/token-login.js
git commit -m "feat: add student login and token-login routes"
```

---

### Task 8: Student — me and progresso

**Files:**
- Create: `functions/api/aluno/me.js`
- Create: `functions/api/aluno/progresso.js`

**Interfaces:**
- Consumes: `requireSession` from `_lib/require-session.js`; `getAlunoByEmail`, `updateProgresso` from `_lib/db.js`.

- [ ] **Step 1: Write `functions/api/aluno/me.js`**

```js
import { requireSession } from '../../_lib/require-session.js';
import { getAlunoByEmail } from '../../_lib/db.js';

export async function onRequestGet({ request, env }) {
  const session = await requireSession(request, env, 'aluno');
  if (session instanceof Response) return session;

  const aluno = await getAlunoByEmail(env.DB, session.sub);
  if (!aluno) return Response.json({ error: 'Aluno não encontrado.' }, { status: 404 });

  return Response.json({ nome: aluno.nome, email: aluno.email, disc: aluno.disc, progresso: aluno.progresso });
}
```

- [ ] **Step 2: Write `functions/api/aluno/progresso.js`**

```js
import { requireSession } from '../../_lib/require-session.js';
import { updateProgresso } from '../../_lib/db.js';

export async function onRequestPut({ request, env }) {
  const session = await requireSession(request, env, 'aluno');
  if (session instanceof Response) return session;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  if (!body || typeof body.progresso !== 'object') {
    return Response.json({ error: 'Campo "progresso" é obrigatório.' }, { status: 400 });
  }

  await updateProgresso(env.DB, session.sub, body.progresso);
  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Verify manually**

```bash
curl -s -b aluno-cookies.txt http://127.0.0.1:8788/api/aluno/me

curl -i -s -b aluno-cookies.txt -X PUT http://127.0.0.1:8788/api/aluno/progresso \
  -H "Content-Type: application/json" \
  -d '{"progresso":{"1":[0]}}'

curl -s -b aluno-cookies.txt http://127.0.0.1:8788/api/aluno/me
```

Expected: first call shows `progresso: {}`; second call `200 {"ok":true}`; third call shows `progresso: {"1":[0]}`.

- [ ] **Step 4: Commit**

```bash
git add functions/api/aluno/me.js functions/api/aluno/progresso.js
git commit -m "feat: add student profile and progress routes"
```

---

### Task 9: Admin frontend — login screen and API-backed editing

**Files:**
- Modify: `admin.html`
- Modify: `admin.js`

**Interfaces:**
- Consumes: `GET /api/config`, `POST /api/admin/login`, `POST /api/admin/logout`, `PUT /api/admin/temas`, `PUT /api/admin/mapeamento`, `POST /api/admin/gerar-acesso`, `GET /api/admin/alunos`.

- [ ] **Step 1: Add a login section and an "Alunos" tab to `admin.html`**

Insert before `<nav class="admin-tabs">` (replace the `<main>` opening block):

```html
<main class="container">
  <section id="tela-login-admin" class="admin-secao">
    <h2>Login administrador</h2>
    <label for="admin-usuario">Usuário</label>
    <input type="email" id="admin-usuario" autocomplete="username" />
    <label for="admin-senha">Senha</label>
    <input type="password" id="admin-senha" autocomplete="current-password" />
    <p id="admin-login-erro" class="erro" hidden></p>
    <button id="btn-admin-login" class="btn btn-primario">Entrar</button>
  </section>

  <div id="admin-painel" hidden>
    <div class="admin-header">
      <button id="btn-admin-logout" class="btn-link">Sair</button>
    </div>
    <nav class="admin-tabs">
      <button class="tab-btn ativo" data-tab="tab-temas">Temas</button>
      <button class="tab-btn" data-tab="tab-mapeamento">Mapeamento DISC</button>
      <button class="tab-btn" data-tab="tab-gerar-acesso">Gerar Acesso</button>
      <button class="tab-btn" data-tab="tab-alunos">Alunos</button>
    </nav>

    <p id="config-erro" class="erro" hidden></p>

    <section id="tab-temas" class="admin-secao">
      <div id="temas-lista"></div>
      <button id="btn-add-tema" class="btn btn-secundario">Adicionar tema</button>
    </section>

    <section id="tab-mapeamento" class="admin-secao" hidden>
      <div id="mapeamento-lista"></div>
    </section>

    <section id="tab-gerar-acesso" class="admin-secao" hidden>
      <h2>Gerar acesso a partir do resultado DISC</h2>
      <label for="json-disc-input">Cole aqui o JSON do resultado DISC</label>
      <textarea id="json-disc-input" rows="8" placeholder='{"nome":"João Silva","email":"joao@example.com","disc":{"D":80,"I":40,"S":30,"C":20}}'></textarea>
      <p id="gerar-acesso-erro" class="erro" hidden></p>
      <button id="btn-gerar-acesso" class="btn btn-primario">Gerar link do aluno</button>
      <div id="acesso-resultado" class="acesso-resultado" hidden>
        <p><strong>Link:</strong> <span id="resultado-link"></span> <button id="btn-copiar-link" class="btn-link">Copiar</button></p>
        <p><strong>Email:</strong> <span id="resultado-email"></span></p>
        <p><strong>Senha:</strong> <span id="resultado-senha"></span></p>
      </div>
    </section>

    <section id="tab-alunos" class="admin-secao" hidden>
      <div id="alunos-lista"></div>
    </section>

    <button id="btn-salvar-config" class="btn btn-primario btn-download">Salvar</button>
  </div>
</main>
```

Remove the old `<p class="aviso-card">Lembre-se de clicar em "Baixar config.json"...` line and the old `<button id="btn-download-config">` — they no longer apply.

- [ ] **Step 2: Rewrite `admin.js`**

Replace the whole file:

```js
import { validateDiscResult } from './logic.js';

const el = (id) => document.getElementById(id);
let config = { temas: [], mapeamentoDisc: {} };
let configCarregado = false;

async function api(path, options = {}) {
  const resp = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Erro ${resp.status}`);
  return data;
}

async function carregarConfig() {
  try {
    config = await api('/api/config');
    configCarregado = true;
    renderTemas();
    renderMapeamento();
  } catch (e) {
    el('config-erro').textContent = 'Não foi possível carregar o conteúdo. Recarregue a página.';
    el('config-erro').hidden = false;
  }
}

function proximoId() {
  return config.temas.reduce((max, t) => Math.max(max, t.id), 0) + 1;
}

function renderTemas() {
  const container = el('temas-lista');
  container.innerHTML = '';
  config.temas.forEach((tema, idx) => {
    const div = document.createElement('div');
    div.className = 'tema-editor card';
    const videosHtml = tema.videos
      .map((v, vi) => `
        <div class="video-editor">
          <input type="text" value="${v.titulo}" data-field="titulo" data-tema="${idx}" data-video="${vi}" placeholder="Título do vídeo" />
          <input type="text" value="${v.link}" data-tema="${idx}" data-video="${vi}" data-field="link" placeholder="Link" />
          <button type="button" class="btn-link btn-remove-video" data-tema="${idx}" data-video="${vi}">Remover</button>
        </div>
      `)
      .join('');
    div.innerHTML = `
      <label>Ícone <input type="text" value="${tema.icone}" data-field="icone" data-tema="${idx}" class="input-icone" /></label>
      <label>Nome <input type="text" value="${tema.nome}" data-field="nome" data-tema="${idx}" /></label>
      <label>Descrição <textarea data-field="descricao" data-tema="${idx}">${tema.descricao}</textarea></label>
      <label>Competências (separadas por vírgula)
        <input type="text" value="${tema.competenciasDesenvolvidas.join(', ')}" data-field="competencias" data-tema="${idx}" />
      </label>
      <div class="videos-editor">${videosHtml}</div>
      <button type="button" class="btn-secundario btn-add-video" data-tema="${idx}">Adicionar vídeo</button>
      <button type="button" class="btn-link btn-remove-tema" data-tema="${idx}">Remover tema</button>
    `;
    container.appendChild(div);
  });
  ligarEventosTemas();
}

function ligarEventosTemas() {
  const container = el('temas-lista');
  container.querySelectorAll('input[data-field], textarea[data-field]').forEach((input) => {
    input.addEventListener('input', (ev) => {
      const idx = Number(ev.target.dataset.tema);
      const campo = ev.target.dataset.field;
      if (campo === 'competencias') {
        config.temas[idx].competenciasDesenvolvidas = ev.target.value.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (ev.target.dataset.video !== undefined) {
        const vi = Number(ev.target.dataset.video);
        config.temas[idx].videos[vi][campo] = ev.target.value;
      } else {
        config.temas[idx][campo] = ev.target.value;
      }
    });
  });
  container.querySelectorAll('.btn-remove-tema').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      const idx = Number(ev.target.dataset.tema);
      const removedId = config.temas[idx].id;
      config.temas.splice(idx, 1);
      ['D', 'I', 'S', 'C'].forEach((perfil) => {
        config.mapeamentoDisc[perfil].temasRecomendados = config.mapeamentoDisc[perfil].temasRecomendados.filter((id) => id !== removedId);
      });
      renderTemas();
      renderMapeamento();
    });
  });
  container.querySelectorAll('.btn-add-video').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      const idx = Number(ev.target.dataset.tema);
      config.temas[idx].videos.push({ titulo: '', link: '' });
      renderTemas();
    });
  });
  container.querySelectorAll('.btn-remove-video').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      const idx = Number(ev.target.dataset.tema);
      const vi = Number(ev.target.dataset.video);
      config.temas[idx].videos.splice(vi, 1);
      renderTemas();
    });
  });
}

function renderMapeamento() {
  const container = el('mapeamento-lista');
  container.innerHTML = '';
  ['D', 'I', 'S', 'C'].forEach((perfil) => {
    const dados = config.mapeamentoDisc[perfil];
    const div = document.createElement('div');
    div.className = 'perfil-editor card';
    const checkboxes = config.temas
      .map((t) => `
        <label class="checkbox-tema">
          <input type="checkbox" data-perfil="${perfil}" data-tema-id="${t.id}" ${dados.temasRecomendados.includes(t.id) ? 'checked' : ''} />
          ${t.icone} ${t.nome}
        </label>
      `)
      .join('');
    div.innerHTML = `
      <h3>Perfil ${perfil}</h3>
      <label>Pontos fracos (separados por vírgula)
        <input type="text" value="${dados.pontosFracos.join(', ')}" data-perfil="${perfil}" data-field="pontosFracos" />
      </label>
      <label>Mensagem
        <textarea data-perfil="${perfil}" data-field="mensagem">${dados.mensagem}</textarea>
      </label>
      <fieldset>
        <legend>Temas recomendados</legend>
        ${checkboxes}
      </fieldset>
    `;
    container.appendChild(div);
  });
  ligarEventosMapeamento();
}

function ligarEventosMapeamento() {
  const container = el('mapeamento-lista');
  container.querySelectorAll('input[data-field], textarea[data-field]').forEach((input) => {
    input.addEventListener('input', (ev) => {
      const perfil = ev.target.dataset.perfil;
      const campo = ev.target.dataset.field;
      if (campo === 'pontosFracos') {
        config.mapeamentoDisc[perfil].pontosFracos = ev.target.value.split(',').map((s) => s.trim()).filter(Boolean);
      } else {
        config.mapeamentoDisc[perfil][campo] = ev.target.value;
      }
    });
  });
  container.querySelectorAll('input[data-tema-id]').forEach((cb) => {
    cb.addEventListener('change', (ev) => {
      const perfil = ev.target.dataset.perfil;
      const temaId = Number(ev.target.dataset.temaId);
      const lista = config.mapeamentoDisc[perfil].temasRecomendados;
      const idx = lista.indexOf(temaId);
      if (ev.target.checked && idx === -1) lista.push(temaId);
      if (!ev.target.checked && idx !== -1) lista.splice(idx, 1);
    });
  });
}

async function renderAlunos() {
  const container = el('alunos-lista');
  try {
    const { alunos } = await api('/api/admin/alunos');
    container.innerHTML = alunos.length
      ? `<table class="tabela-alunos"><thead><tr><th>Nome</th><th>Email</th><th>Criado em</th><th>Vídeos assistidos</th></tr></thead><tbody>${alunos
          .map((a) => `<tr><td>${a.nome}</td><td>${a.email}</td><td>${new Date(a.criadoEm).toLocaleDateString('pt-BR')}</td><td>${a.videosAssistidos}</td></tr>`)
          .join('')}</tbody></table>`
      : '<p>Nenhum aluno cadastrado ainda.</p>';
  } catch (e) {
    container.innerHTML = '<p class="erro">Não foi possível carregar a lista de alunos.</p>';
  }
}

function iniciarTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('ativo'));
      document.querySelectorAll('.admin-secao').forEach((s) => { s.hidden = true; });
      btn.classList.add('ativo');
      el(btn.dataset.tab).hidden = false;
      if (btn.dataset.tab === 'tab-alunos') renderAlunos();
    });
  });
}

function iniciarGerarAcesso() {
  el('btn-gerar-acesso').addEventListener('click', async () => {
    const erroEl = el('gerar-acesso-erro');
    erroEl.hidden = true;
    let dados;
    try {
      dados = JSON.parse(el('json-disc-input').value);
    } catch (e) {
      erroEl.textContent = 'JSON inválido: não foi possível interpretar o texto colado.';
      erroEl.hidden = false;
      return;
    }
    const { valid, errors } = validateDiscResult(dados);
    if (!valid) {
      erroEl.textContent = errors.join(' | ');
      erroEl.hidden = false;
      return;
    }
    try {
      const resultado = await api('/api/admin/gerar-acesso', { method: 'POST', body: JSON.stringify(dados) });
      el('resultado-link').textContent = resultado.link;
      el('resultado-email').textContent = resultado.email;
      el('resultado-senha').textContent = resultado.senha;
      el('acesso-resultado').hidden = false;
    } catch (e) {
      erroEl.textContent = e.message;
      erroEl.hidden = false;
    }
  });

  el('btn-copiar-link').addEventListener('click', () => {
    navigator.clipboard.writeText(el('resultado-link').textContent);
  });
}

function iniciarSalvar() {
  el('btn-salvar-config').addEventListener('click', async () => {
    const erroEl = el('config-erro');
    erroEl.hidden = true;
    if (!configCarregado) return;
    try {
      await api('/api/admin/temas', { method: 'PUT', body: JSON.stringify({ temas: config.temas }) });
      await api('/api/admin/mapeamento', { method: 'PUT', body: JSON.stringify({ mapeamentoDisc: config.mapeamentoDisc }) });
    } catch (e) {
      erroEl.textContent = `Erro ao salvar: ${e.message}`;
      erroEl.hidden = false;
    }
  });
}

function mostrarPainel() {
  el('tela-login-admin').hidden = true;
  el('admin-painel').hidden = false;
  carregarConfig();
}

function iniciarLoginAdmin() {
  el('btn-admin-login').addEventListener('click', async () => {
    const erroEl = el('admin-login-erro');
    erroEl.hidden = true;
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ usuario: el('admin-usuario').value.trim(), senha: el('admin-senha').value }),
      });
      mostrarPainel();
    } catch (e) {
      erroEl.textContent = e.message;
      erroEl.hidden = false;
    }
  });

  el('btn-admin-logout').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    el('admin-painel').hidden = true;
    el('tela-login-admin').hidden = false;
  });
}

el('btn-add-tema').addEventListener('click', () => {
  config.temas.push({ id: proximoId(), nome: 'Novo tema', descricao: '', icone: '⭐', videos: [], competenciasDesenvolvidas: [] });
  renderTemas();
  renderMapeamento();
});

iniciarLoginAdmin();
iniciarTabs();
iniciarGerarAcesso();
iniciarSalvar();
```

- [ ] **Step 3: Verify manually with `wrangler pages dev` running**

Open `http://127.0.0.1:8788/admin.html`, log in with the seed admin/password, confirm: Temas/Mapeamento/Gerar Acesso/Alunos tabs all work, "Salvar" persists edits (reload the page and confirm the edited value is still there), and "Sair" returns to the login screen.

- [ ] **Step 4: Commit**

```bash
git add admin.html admin.js
git commit -m "feat: admin login screen and direct-save editing via API"
```

---

### Task 10: Student frontend — API-backed login, token-login, and progress

**Files:**
- Modify: `script.js`
- Modify: `store.js`

**Interfaces:**
- Consumes: `GET /api/config`, `POST /api/aluno/login`, `POST /api/aluno/token-login`, `GET /api/aluno/me`, `PUT /api/aluno/progresso`.

- [ ] **Step 1: Rewrite `store.js`**

The student record and session no longer live in `localStorage` as the source of truth — the API is. Keep only an in-memory cache for the current session (avoids re-fetching `/api/aluno/me` on every render) and a small debounce for progress writes.

```js
let alunoAtual = null;

export function setAlunoAtual(aluno) {
  alunoAtual = aluno;
}

export function getAlunoAtual() {
  return alunoAtual;
}

export function clearAlunoAtual() {
  alunoAtual = null;
}

let debounceTimer = null;

export function toggleVideoAssistidoLocal(temaId, videoIndex) {
  if (!alunoAtual) return [];
  const chave = String(temaId);
  const atual = alunoAtual.progresso[chave] || [];
  const idx = atual.indexOf(videoIndex);
  const atualizado = idx === -1 ? [...atual, videoIndex] : atual.filter((i) => i !== videoIndex);
  alunoAtual.progresso[chave] = atualizado;
  return atualizado;
}

export function agendarSalvarProgresso(salvarFn) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(salvarFn, 500);
}

export function getProgresso(temaId) {
  if (!alunoAtual) return [];
  return alunoAtual.progresso[String(temaId)] || [];
}
```

- [ ] **Step 2: Rewrite `script.js`**

Replace the whole file:

```js
import { decodeToken, buildPlanoDeAcao } from './logic.js';
import { setAlunoAtual, getAlunoAtual, clearAlunoAtual, toggleVideoAssistidoLocal, agendarSalvarProgresso, getProgresso } from './store.js';

const el = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const resp = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Erro ${resp.status}`);
  return data;
}

function mostrarTela(id) {
  ['tela-erro-token', 'tela-login', 'tela-dashboard'].forEach((t) => {
    el(t).hidden = t !== id;
  });
}

let planoAtual = null;

function renderDiscGrafico(disc) {
  const container = el('disc-grafico');
  container.innerHTML = '';
  ['D', 'I', 'S', 'C'].forEach((chave) => {
    const linha = document.createElement('div');
    linha.className = 'disc-linha';
    linha.innerHTML = `
      <span class="disc-letra">${chave}</span>
      <div class="disc-barra-fundo"><div class="disc-barra" style="width:${disc[chave]}%"></div></div>
      <span class="disc-valor">${disc[chave]}</span>
    `;
    container.appendChild(linha);
  });
}

function renderPlanoAcao(plano) {
  const nomesPerfil = { D: 'Dominante (D)', I: 'Influente (I)', S: 'Estável (S)', C: 'Cauteloso (C)' };
  const container = el('plano-acao');
  const prioridades = plano.trilhas
    .slice(0, plano.qtdRecomendados)
    .map((t, i) => `<li><strong>PRIORIDADE ${i + 1}:</strong> ${t.nome}</li>`)
    .join('');
  container.innerHTML = `
    <p><strong>Seu perfil DISC:</strong> ${nomesPerfil[plano.perfil]}</p>
    <p><strong>Pontos de desenvolvimento:</strong> ${plano.pontosFracos.join(', ')}</p>
    <p>${plano.mensagem}</p>
    <ol class="prioridades">${prioridades}</ol>
    <p><strong>Tempo estimado:</strong> ${plano.tempoEstimadoHoras}h — <strong>Meta:</strong> completar em ${plano.metaDias} dias</p>
  `;
}

async function salvarProgresso() {
  const aluno = getAlunoAtual();
  if (!aluno) return;
  try {
    await api('/api/aluno/progresso', { method: 'PUT', body: JSON.stringify({ progresso: aluno.progresso }) });
  } catch (e) {
    // falha silenciosa: o estado otimista local já foi aplicado; próxima
    // interação tenta salvar de novo.
  }
}

function renderTrilhas(trilhas) {
  const container = el('trilhas-lista');
  container.innerHTML = '';
  trilhas.forEach((tema) => {
    const assistidos = getProgresso(tema.id);
    const card = document.createElement('div');
    card.className = 'trilha-card';
    const videosHtml = tema.videos
      .map((v, i) => `
        <li class="video-item">
          <label>
            <input type="checkbox" data-tema="${tema.id}" data-video="${i}" ${assistidos.includes(i) ? 'checked' : ''} />
            ${v.titulo}
          </label>
          <a href="${v.link}" target="_blank" rel="noopener" class="btn-link">Assistir</a>
        </li>
      `)
      .join('');
    card.innerHTML = `
      <h3>${tema.icone} ${tema.nome}</h3>
      <p>${tema.descricao}</p>
      <p class="trilha-progresso">${assistidos.length} de ${tema.videos.length} assistidos</p>
      <ul class="videos-lista">${videosHtml}</ul>
    `;
    container.appendChild(card);
  });
  container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', (ev) => {
      const temaId = Number(ev.target.dataset.tema);
      const videoIndex = Number(ev.target.dataset.video);
      toggleVideoAssistidoLocal(temaId, videoIndex);
      const tema = trilhas.find((t) => t.id === temaId);
      const item = ev.target.closest('.trilha-card');
      const assistidos = getProgresso(temaId);
      item.querySelector('.trilha-progresso').textContent = `${assistidos.length} de ${tema.videos.length} assistidos`;
      agendarSalvarProgresso(salvarProgresso);
    });
  });
}

function gerarPdf() {
  if (!planoAtual) return;
  const erroEl = el('pdf-erro');
  erroEl.hidden = true;
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('jsPDF não carregou');
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const nomesPerfil = { D: 'Dominante (D)', I: 'Influente (I)', S: 'Estável (S)', C: 'Cauteloso (C)' };
    let y = 20;
    doc.setFontSize(16);
    doc.text('Plano de Ação — Portal IA na Prática', 14, y);
    y += 10;
    doc.setFontSize(12);
    doc.text(`Perfil DISC: ${nomesPerfil[planoAtual.perfil]}`, 14, y);
    y += 8;
    doc.text(`Pontos de desenvolvimento: ${planoAtual.pontosFracos.join(', ')}`, 14, y);
    y += 8;
    const mensagemLinhas = doc.splitTextToSize(planoAtual.mensagem, 180);
    doc.text(mensagemLinhas, 14, y);
    y += mensagemLinhas.length * 6 + 4;
    doc.text('Plano recomendado:', 14, y);
    y += 8;
    planoAtual.trilhas.slice(0, planoAtual.qtdRecomendados).forEach((t, i) => {
      doc.text(`Prioridade ${i + 1}: ${t.nome}`, 18, y);
      y += 7;
    });
    y += 4;
    doc.text(`Tempo estimado: ${planoAtual.tempoEstimadoHoras}h`, 14, y);
    y += 7;
    doc.text(`Meta: completar em ${planoAtual.metaDias} dias`, 14, y);
    doc.save('plano-de-acao.pdf');
  } catch (e) {
    erroEl.textContent = 'Não foi possível gerar o PDF agora. Tente novamente em instantes.';
    erroEl.hidden = false;
  }
}

async function renderDashboard() {
  const aluno = getAlunoAtual();
  let config;
  try {
    config = await api('/api/config');
  } catch (e) {
    el('tela-dashboard').innerHTML = '<p class="erro">Conteúdo não pôde ser carregado. Tente novamente mais tarde.</p>';
    mostrarTela('tela-dashboard');
    return;
  }
  el('dash-nome').textContent = aluno.nome;
  renderDiscGrafico(aluno.disc);
  planoAtual = buildPlanoDeAcao(config, aluno.disc);
  renderPlanoAcao(planoAtual);
  renderTrilhas(planoAtual.trilhas);
  el('usuario-nome').textContent = aluno.nome;
  el('usuario-info').hidden = false;
  mostrarTela('tela-dashboard');
}

async function carregarSessaoEDashboard() {
  try {
    const me = await api('/api/aluno/me');
    setAlunoAtual(me);
    await renderDashboard();
    return true;
  } catch (e) {
    return false;
  }
}

async function tratarToken() {
  const hash = window.location.hash;
  const match = hash.match(/#\/t=(.+)/);
  if (!match) return false;
  let payload;
  try {
    payload = decodeToken(decodeURIComponent(match[1]));
  } catch (e) {
    mostrarTela('tela-erro-token');
    return 'erro';
  }
  try {
    await api('/api/aluno/token-login', { method: 'POST', body: JSON.stringify({ email: payload.email, senha: payload.senha }) });
    history.replaceState(null, '', window.location.pathname);
    return true;
  } catch (e) {
    mostrarTela('tela-erro-token');
    return 'erro';
  }
}

function iniciarLogin() {
  el('form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = el('login-email').value.trim();
    const senha = el('login-senha').value;
    try {
      await api('/api/aluno/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
      el('login-erro').hidden = true;
      await carregarSessaoEDashboard();
    } catch (e) {
      el('login-erro').textContent = 'Email ou senha inválidos.';
      el('login-erro').hidden = false;
    }
  });
}

function iniciarLogout() {
  el('btn-logout').addEventListener('click', async () => {
    await api('/api/aluno/logout', { method: 'POST' }).catch(() => {});
    clearAlunoAtual();
    el('usuario-info').hidden = true;
    mostrarTela('tela-login');
  });
}

async function init() {
  iniciarLogin();
  iniciarLogout();
  el('btn-pdf').addEventListener('click', gerarPdf);
  el('btn-ir-login').addEventListener('click', () => mostrarTela('tela-login'));

  const resultadoToken = await tratarToken();
  if (resultadoToken === 'erro') return;
  if (resultadoToken === true) {
    await carregarSessaoEDashboard();
    return;
  }
  const logado = await carregarSessaoEDashboard();
  if (!logado) mostrarTela('tela-login');
}

init();
```

- [ ] **Step 3: Add a `POST /api/aluno/logout` route (was missed — required by `iniciarLogout` above)**

Create `functions/api/aluno/logout.js`:

```js
export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'edusia_aluno_sessao=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    },
  });
}
```

- [ ] **Step 4: Verify manually with `wrangler pages dev` running**

1. Use the link generated in Task 6's verification (or generate a fresh one via `admin.html` → Gerar Acesso) and open it in a browser with cleared cookies — confirm it lands directly on the dashboard.
2. Mark a video as watched, then open the same URL (no token) in a **different** browser profile and log in with email+password — confirm the watched video is checked (progress synced).
3. Log out and confirm the login screen (not the dashboard) shows on reload.
4. Stop the local D1/dev server mid-session and confirm `/api/config` failure shows the "Conteúdo não pôde ser carregado" message instead of a blank page.

- [ ] **Step 5: Commit**

```bash
git add script.js store.js functions/api/aluno/logout.js
git commit -m "feat: student login, token-login, and synced progress via API"
```

---

### Task 11: README update and full end-to-end verification

**Files:**
- Modify: `README.md`

**Interfaces:** none (documentation + verification task).

- [ ] **Step 1: Update `README.md`**

Replace the "Como hospedar no Cloudflare Pages" and "Rodando localmente" sections, and the "Limitações conhecidas" section's now-resolved items, with:

```markdown
## Como hospedar no Cloudflare Pages (com backend D1)

1. Crie o banco: `npx wrangler d1 create edusia-portal-db` e copie o
   `database_id` para `wrangler.toml`.
2. Aplique o schema em produção: `npx wrangler d1 execute edusia-portal-db --remote --file=schema.sql`.
3. Rode o seed uma única vez: `npm run db:seed:remote`.
4. No painel do Cloudflare Pages, configure as variáveis de ambiente
   (Settings → Environment variables): `SESSION_SECRET` (string aleatória
   longa), `ADMIN_SEED_USER`, `ADMIN_SEED_PASSWORD`.
5. Conecte o repositório ao Cloudflare Pages (sem build command, diretório
   raiz do projeto) — o deploy publica o site estático e as Pages Functions
   juntos automaticamente a cada push.
6. Editar temas/mapeamento agora é feito direto pelo admin (botão
   "Salvar") — não requer mais redeploy manual de `config.json`.

## Rodando localmente

```bash
npm install
npx wrangler d1 create edusia-portal-db   # uma vez, copiar o id para wrangler.toml
npx wrangler d1 execute edusia-portal-db --local --file=schema.sql
npm run db:seed
npx wrangler pages dev . --d1=DB=edusia-portal-db --compatibility-date=2026-09-16
```

Crie um `.dev.vars` (não versionado) com `SESSION_SECRET`,
`ADMIN_SEED_USER` e `ADMIN_SEED_PASSWORD` antes de rodar o `wrangler pages dev`.
```

In "Limitações conhecidas", remove the two bullets now resolved ("Login por
email/senha só funciona no navegador..." and "Progresso das trilhas é
local ao navegador...") and remove "O painel admin não tem senha própria"
(replace with: "O painel admin tem login próprio — proteja `SESSION_SECRET`
e a senha do admin como qualquer outra credencial.").

- [ ] **Step 2: Run the full automated test suite**

```bash
npm test
```

Expected: all tests pass (existing `logic.test.js`, `config.test.js` —
note `config.test.js` now tests the seed data shape, still valid — plus
the new `auth.test.js`).

- [ ] **Step 3: Full manual regression pass**

Repeat, against `wrangler pages dev` with a freshly seeded local D1:
- Admin login (right/wrong credentials), edit a tema, Salvar, reload, confirm persisted.
- Gerar Acesso → open link in a clean browser → dashboard loads without asking for a password.
- Aluno login on a second browser profile with email+senha → dashboard loads, progress matches.
- Mark videos watched, generate the PDF for all 4 DISC profiles, confirm content.
- Mobile width (~375px) and desktop layout check for `admin.html` and `index.html`.
- Logout (both admin and aluno) returns to the respective login screen.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README for Cloudflare D1 backend setup and local dev"
```
