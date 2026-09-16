# Portal "IA na Prática" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, backend-free training portal that turns a DISC result into a personalized "Plano de Ação" and 6+ trackable video trilhas, with a hidden admin panel for editing content and generating student access links.

**Architecture:** Two pure-JS logic/data modules (`logic.js`, `store.js`) with automated unit tests, consumed by two DOM layers (`index.html`+`script.js` for the student portal, `admin.html`+`admin.js` for the admin panel) that are verified manually in a browser, per the spec's own testing approach. Content lives in `config.json`; student identity lives in a Base64 token embedded in the unique link plus a `localStorage` cache per browser.

**Tech Stack:** Vanilla HTML5/CSS3/JavaScript (ES modules), jsPDF (CDN, UMD build) for PDF export, Node.js built-in test runner (`node --test`) for unit tests. No build step, no framework, no backend.

**Spec:** `docs/superpowers/specs/2026-09-16-portal-ia-na-pratica-design.md`

All file paths in this plan are relative to the project directory `plataforma edusia/` (i.e. `C:\projetos\plataforma edusia`).

## Global Constraints

- No backend, no build step — everything must run by opening `index.html`/`admin.html` directly or serving the folder as static files (Cloudflare Pages).
- JS modules use ES module syntax (`import`/`export`); loaded in HTML via `<script type="module">`.
- Only external dependency: jsPDF UMD build via `https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js`, loaded with a classic (non-module) `<script>` tag before the module script.
- Automated tests use Node's built-in `node:test` + `node:assert/strict` (Node 18+ required — uses global `atob`/`btoa`), run with `node --test tests/`.
- Student token lives at `index.html#/t=<base64>`, never as a query string.
- Generated student passwords are 8 characters, alphanumeric, excluding visually ambiguous characters (`0/O`, `1/l/I`).
- DISC dominant-profile tie-break order: `D > I > S > C` (first strictly-greater-or-equal in that scan order wins).
- Plano de Ação time estimate: `temasRecomendados.length * 4` hours; fixed 30-day goal.
- `localStorage` keys: `edusia_aluno_<email>` (student record) and `edusia_sessao` (active session email).
- The token is Base64 obfuscation, not encryption — this must be stated in the README, not hidden.

---

## File Structure

```
package.json          # Node test runner config (type: module)
config.json           # editable content: temas + mapeamentoDisc (seeded with 6 temas)
logic.js              # pure functions: token, password, DISC calc, plano de ação
store.js              # localStorage wrapper: session + student record + progress
tests/
  config.test.js       # schema checks for config.json
  logic.test.js        # unit tests for logic.js
  store.test.js        # unit tests for store.js (in-memory localStorage shim)
style.css             # shared design system for both pages
index.html             # student portal shell
script.js             # student portal DOM logic (auth, dashboard, trilhas, PDF)
admin.html             # admin panel shell
admin.js               # admin panel DOM logic (temas, mapeamento, gerar acesso)
README.md              # docs: editing content, generating access, hosting, examples
```

---

### Task 1: Project setup + `config.json` seed data

**Files:**
- Create: `package.json`
- Create: `config.json`
- Test: `tests/config.test.js`

**Interfaces:**
- Produces: `config.json` shape `{ temas: Tema[], mapeamentoDisc: { D, I, S, C } }` where `Tema = { id: number, nome: string, descricao: string, icone: string, videos: {titulo, link}[], competenciasDesenvolvidas: string[] }` and each DISC entry is `{ pontosFracos: string[], temasRecomendados: number[], mensagem: string }`. Every later task that reads config data assumes this shape.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "portal-ia-na-pratica",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/config.test.js`:

```js
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/config.test.js`
Expected: FAIL — `config.json` does not exist yet (ENOENT).

- [ ] **Step 4: Create `config.json`**

```json
{
  "temas": [
    {
      "id": 1,
      "nome": "IA Generativa & Prompting",
      "descricao": "Aprenda a usar IA generativa para criar textos, ideias e soluções com prompts eficazes.",
      "icone": "⚡",
      "videos": [
        { "titulo": "Introdução a Prompting", "link": "https://youtube.com/watch?v=exemplo-prompting-1" },
        { "titulo": "Técnicas avançadas de prompt", "link": "https://youtube.com/watch?v=exemplo-prompting-2" }
      ],
      "competenciasDesenvolvidas": ["Comunicação com IA", "Escrita estruturada"]
    },
    {
      "id": 2,
      "nome": "Automação com IA (Make, Zapier, n8n)",
      "descricao": "Automatize tarefas repetitivas conectando ferramentas de IA a fluxos de trabalho.",
      "icone": "🤖",
      "videos": [
        { "titulo": "Primeiros passos com automação", "link": "https://youtube.com/watch?v=exemplo-automacao-1" },
        { "titulo": "Montando seu primeiro fluxo", "link": "https://youtube.com/watch?v=exemplo-automacao-2" }
      ],
      "competenciasDesenvolvidas": ["Automação de processos", "Pensamento sistêmico"]
    },
    {
      "id": 3,
      "nome": "IA em Vendas",
      "descricao": "Use IA para qualificar leads, personalizar abordagens e negociar com mais dados.",
      "icone": "💼",
      "videos": [
        { "titulo": "IA para qualificação de leads", "link": "https://youtube.com/watch?v=exemplo-vendas-1" },
        { "titulo": "Negociação apoiada por dados", "link": "https://youtube.com/watch?v=exemplo-vendas-2" }
      ],
      "competenciasDesenvolvidas": ["Negociação", "Personalização de abordagem"]
    },
    {
      "id": 4,
      "nome": "IA em RH & Recrutamento",
      "descricao": "Aplique IA para entender perfis, triar candidatos e melhorar a comunicação com pessoas.",
      "icone": "🧑‍🤝‍🧑",
      "videos": [
        { "titulo": "IA na triagem de candidatos", "link": "https://youtube.com/watch?v=exemplo-rh-1" },
        { "titulo": "Comunicação empática com apoio de IA", "link": "https://youtube.com/watch?v=exemplo-rh-2" }
      ],
      "competenciasDesenvolvidas": ["Empatia", "Escuta ativa"]
    },
    {
      "id": 5,
      "nome": "Análise de Dados com IA",
      "descricao": "Transforme planilhas e relatórios em decisões rápidas com apoio de IA.",
      "icone": "📊",
      "videos": [
        { "titulo": "IA para analisar planilhas", "link": "https://youtube.com/watch?v=exemplo-dados-1" },
        { "titulo": "Gerando relatórios automáticos", "link": "https://youtube.com/watch?v=exemplo-dados-2" }
      ],
      "competenciasDesenvolvidas": ["Análise de dados", "Tomada de decisão"]
    },
    {
      "id": 6,
      "nome": "Produtividade Pessoal com IA",
      "descricao": "Organize tarefas, priorize o dia e ganhe tempo usando IA no seu dia a dia.",
      "icone": "🚀",
      "videos": [
        { "titulo": "Organizando a rotina com IA", "link": "https://youtube.com/watch?v=exemplo-produtividade-1" },
        { "titulo": "Priorização inteligente de tarefas", "link": "https://youtube.com/watch?v=exemplo-produtividade-2" }
      ],
      "competenciasDesenvolvidas": ["Gestão do tempo", "Priorização"]
    }
  ],
  "mapeamentoDisc": {
    "D": {
      "pontosFracos": ["Empatia", "Escuta ativa", "Paciência"],
      "temasRecomendados": [2, 4, 3],
      "mensagem": "Como D você é direto e orientado a resultado. Use IA para entender pessoas e agir com mais empatia."
    },
    "I": {
      "pontosFracos": ["Foco", "Execução", "Prazos"],
      "temasRecomendados": [2, 3, 6],
      "mensagem": "Como I você é inspirador e cheio de ideias. Use IA para estruturar e executar o que você imagina."
    },
    "S": {
      "pontosFracos": ["Iniciativa", "Assertividade", "Mudança"],
      "temasRecomendados": [1, 5, 6],
      "mensagem": "Como S você é confiável e estável. Use IA para inovar com segurança, no seu ritmo."
    },
    "C": {
      "pontosFracos": ["Delegação", "Flexibilidade", "Velocidade"],
      "temasRecomendados": [2, 5, 3],
      "mensagem": "Como C você é analítico e preciso. Use IA para processar informação mais rápido e ganhar agilidade."
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/config.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json config.json tests/config.test.js
git commit -m "Add project setup and seeded config.json with 6 temas"
```

---

### Task 2: `logic.js` — token encode/decode + password generation

**Files:**
- Create: `logic.js`
- Test: `tests/logic.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `generatePassword(length = 8): string`, `encodeToken(payload: object): string`, `decodeToken(token: string): object` (throws `Error` on invalid/corrupt input). Later tasks (script.js, admin.js) call these exactly.

- [ ] **Step 1: Write the failing tests**

Create `tests/logic.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePassword, encodeToken, decodeToken } from '../logic.js';

test('generatePassword returns an 8-character alphanumeric string by default', () => {
  const senha = generatePassword();
  assert.equal(senha.length, 8);
  assert.match(senha, /^[A-Za-z0-9]+$/);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/logic.test.js`
Expected: FAIL — `logic.js` does not exist yet.

- [ ] **Step 3: Implement `logic.js`**

```js
export function generatePassword(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function encodeToken(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export function decodeToken(token) {
  let binary;
  try {
    binary = atob(token);
  } catch (e) {
    throw new Error('Token inválido');
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  let payload;
  try {
    payload = JSON.parse(json);
  } catch (e) {
    throw new Error('Token corrompido');
  }
  if (!payload.nome || !payload.email || !payload.disc) {
    throw new Error('Token incompleto');
  }
  return payload;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/logic.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add logic.js tests/logic.test.js
git commit -m "Add token encode/decode and password generation to logic.js"
```

---

### Task 3: `logic.js` — dominant profile + DISC result validation

**Files:**
- Modify: `logic.js`
- Test: `tests/logic.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `dominantProfile(disc: {D,I,S,C}): 'D'|'I'|'S'|'C'`, `validateDiscResult(obj): { valid: boolean, errors: string[] }`. Used by `buildPlanoDeAcao` (Task 4) and by `admin.js`'s "Gerar Acesso" tab (Task 12).

- [ ] **Step 1: Write the failing tests**

In `tests/logic.test.js`, change the top import line from:

```js
import { generatePassword, encodeToken, decodeToken } from '../logic.js';
```

to:

```js
import { generatePassword, encodeToken, decodeToken, dominantProfile, validateDiscResult } from '../logic.js';
```

Then add to the end of `tests/logic.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/logic.test.js`
Expected: FAIL — `dominantProfile` and `validateDiscResult` are not exported yet.

- [ ] **Step 3: Implement in `logic.js`**

Append to `logic.js`:

```js
export function dominantProfile(disc) {
  const order = ['D', 'I', 'S', 'C'];
  let best = order[0];
  for (const key of order) {
    if (disc[key] > disc[best]) best = key;
  }
  return best;
}

export function validateDiscResult(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') {
    return { valid: false, errors: ['JSON inválido'] };
  }
  if (!obj.nome || typeof obj.nome !== 'string' || !obj.nome.trim()) {
    errors.push('Campo "nome" é obrigatório');
  }
  if (!obj.email || typeof obj.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(obj.email)) {
    errors.push('Campo "email" inválido ou ausente');
  }
  if (!obj.disc || typeof obj.disc !== 'object') {
    errors.push('Campo "disc" é obrigatório');
  } else {
    for (const key of ['D', 'I', 'S', 'C']) {
      if (typeof obj.disc[key] !== 'number' || Number.isNaN(obj.disc[key])) {
        errors.push(`Campo "disc.${key}" deve ser numérico`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/logic.test.js`
Expected: PASS (11 tests total).

- [ ] **Step 5: Commit**

```bash
git add logic.js tests/logic.test.js
git commit -m "Add dominant profile calc and DISC result validation to logic.js"
```

---

### Task 4: `logic.js` — theme prioritization + Plano de Ação builder

**Files:**
- Modify: `logic.js`
- Test: `tests/logic.test.js`

**Interfaces:**
- Consumes: `dominantProfile` (Task 3), `config.json` shape (Task 1).
- Produces: `orderThemesByPriority(temas: Tema[], temasRecomendados: number[]): Tema[]`, `buildPlanoDeAcao(config: {temas, mapeamentoDisc}, disc: {D,I,S,C}): { perfil, pontosFracos: string[], mensagem: string, trilhas: Tema[], tempoEstimadoHoras: number, metaDias: number }`. `script.js` (Task 8) and the PDF export (Task 9) consume `buildPlanoDeAcao`'s return shape directly.

- [ ] **Step 1: Write the failing tests**

Update the import at the top of `tests/logic.test.js` to:

```js
import { generatePassword, encodeToken, decodeToken, dominantProfile, validateDiscResult, orderThemesByPriority, buildPlanoDeAcao } from '../logic.js';
```

Add to the end of `tests/logic.test.js`:

```js
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
  assert.equal(plano.metaDias, 30);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/logic.test.js`
Expected: FAIL — `orderThemesByPriority` and `buildPlanoDeAcao` are not exported yet.

- [ ] **Step 3: Implement in `logic.js`**

Append to `logic.js`:

```js
export function orderThemesByPriority(temas, temasRecomendados) {
  const recomendados = temasRecomendados
    .map((id) => temas.find((t) => t.id === id))
    .filter(Boolean);
  const idsRecomendados = new Set(temasRecomendados);
  const restantes = temas.filter((t) => !idsRecomendados.has(t.id));
  return [...recomendados, ...restantes];
}

export function buildPlanoDeAcao(config, disc) {
  const perfil = dominantProfile(disc);
  const mapeamento = config.mapeamentoDisc[perfil];
  const trilhas = orderThemesByPriority(config.temas, mapeamento.temasRecomendados);
  const horasPorTrilha = 4;
  return {
    perfil,
    pontosFracos: mapeamento.pontosFracos,
    mensagem: mapeamento.mensagem,
    trilhas,
    tempoEstimadoHoras: mapeamento.temasRecomendados.length * horasPorTrilha,
    metaDias: 30,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/logic.test.js`
Expected: PASS (14 tests total).

- [ ] **Step 5: Commit**

```bash
git add logic.js tests/logic.test.js
git commit -m "Add theme prioritization and Plano de Ação builder to logic.js"
```

---

### Task 5: `store.js` — localStorage session/student/progress wrapper

**Files:**
- Create: `store.js`
- Test: `tests/store.test.js`

**Interfaces:**
- Consumes: nothing (works on any object shaped like the token payload: `{nome, email, senha, disc, geradoEm}`).
- Produces: `saveAluno(payload): record`, `getAluno(email): record|null`, `setSessao(email): void`, `getSessaoEmail(): string|null`, `clearSessao(): void`, `toggleVideoAssistido(email, temaId, videoIndex): number[]|null`, `getProgresso(email, temaId): number[]`, where `record = {...payload, progresso: { [temaId: string]: number[] }}`. `script.js` (Tasks 7–9) is the consumer.

- [ ] **Step 1: Write the failing tests**

Create `tests/store.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/store.test.js`
Expected: FAIL — `store.js` does not exist yet.

- [ ] **Step 3: Implement `store.js`**

```js
const ALUNO_PREFIX = 'edusia_aluno_';
const SESSAO_KEY = 'edusia_sessao';

export function saveAluno(payload) {
  const existente = getAluno(payload.email);
  const progresso = existente ? existente.progresso : {};
  const record = { ...payload, progresso };
  localStorage.setItem(ALUNO_PREFIX + payload.email, JSON.stringify(record));
  return record;
}

export function getAluno(email) {
  const raw = localStorage.getItem(ALUNO_PREFIX + email);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function setSessao(email) {
  localStorage.setItem(SESSAO_KEY, email);
}

export function getSessaoEmail() {
  return localStorage.getItem(SESSAO_KEY);
}

export function clearSessao() {
  localStorage.removeItem(SESSAO_KEY);
}

export function toggleVideoAssistido(email, temaId, videoIndex) {
  const aluno = getAluno(email);
  if (!aluno) return null;
  const chave = String(temaId);
  const atual = aluno.progresso[chave] || [];
  const idx = atual.indexOf(videoIndex);
  const atualizado = idx === -1 ? [...atual, videoIndex] : atual.filter((i) => i !== videoIndex);
  aluno.progresso[chave] = atualizado;
  localStorage.setItem(ALUNO_PREFIX + email, JSON.stringify(aluno));
  return atualizado;
}

export function getProgresso(email, temaId) {
  const aluno = getAluno(email);
  if (!aluno) return [];
  return aluno.progresso[String(temaId)] || [];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/store.test.js`
Expected: PASS (5 tests).

Then run the full suite: `node --test tests/`
Expected: PASS (20 tests total across config/logic/store).

- [ ] **Step 5: Commit**

```bash
git add store.js tests/store.test.js
git commit -m "Add localStorage session/student/progress wrapper in store.js"
```

---

### Task 6: `style.css` — shared design system

**Files:**
- Create: `style.css`

**Interfaces:**
- Consumes: nothing.
- Produces: CSS classes that Tasks 7–12 rely on by exact name: `.topo`, `.logo`, `.usuario-info`, `.container`, `.card`, `.btn`, `.btn-primario`, `.btn-secundario`, `.btn-link`, `.erro`, `.login-card`, `.disc-grafico`, `.disc-linha`, `.disc-letra`, `.disc-barra-fundo`, `.disc-barra`, `.disc-valor`, `.plano-acao`, `.prioridades`, `.trilhas-grid`, `.trilha-card`, `.trilha-progresso`, `.videos-lista`, `.video-item`, `.admin-tabs`, `.tab-btn`, `.ativo`, `.admin-secao`, `.aviso-card`, `.tema-editor`, `.video-editor`, `.videos-editor`, `.perfil-editor`, `.checkbox-tema`, `.acesso-resultado`, `.btn-download`.

- [ ] **Step 1: Create `style.css`**

```css
:root {
  --azul-primario: #1d4ed8;
  --azul-escuro: #1e3a8a;
  --cinza-claro: #f3f4f6;
  --cinza-medio: #6b7280;
  --cinza-escuro: #111827;
  --branco: #ffffff;
  --vermelho: #dc2626;
  --verde: #16a34a;
  --sombra: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
  --raio: 10px;
  --fonte: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--fonte);
  color: var(--cinza-escuro);
  background: var(--cinza-claro);
}

.topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--azul-escuro);
  color: var(--branco);
  padding: 16px 24px;
}

.logo {
  font-size: 1.4rem;
  font-weight: 700;
}

.usuario-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.container {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 16px 64px;
}

.card {
  background: var(--branco);
  border-radius: var(--raio);
  box-shadow: var(--sombra);
  padding: 24px;
  margin-bottom: 24px;
}

.login-card {
  max-width: 400px;
  margin: 48px auto;
}

label {
  display: block;
  margin-bottom: 12px;
  font-weight: 600;
  font-size: 0.9rem;
}

input[type="email"],
input[type="password"],
input[type="text"],
textarea {
  width: 100%;
  padding: 10px 12px;
  margin-top: 4px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-family: inherit;
  font-size: 1rem;
}

.btn {
  display: inline-block;
  border: none;
  border-radius: 6px;
  padding: 10px 18px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-primario {
  background: var(--azul-primario);
  color: var(--branco);
}

.btn-secundario {
  background: var(--cinza-claro);
  color: var(--azul-escuro);
  border: 1px solid var(--azul-primario);
}

.btn-link {
  background: none;
  border: none;
  color: var(--azul-primario);
  cursor: pointer;
  text-decoration: underline;
  font-size: 0.9rem;
  padding: 0;
}

.btn-download {
  position: sticky;
  bottom: 16px;
}

.erro {
  color: var(--vermelho);
  font-size: 0.9rem;
}

.disc-grafico {
  margin: 16px 0;
}

.disc-linha {
  display: grid;
  grid-template-columns: 24px 1fr 40px;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.disc-letra {
  font-weight: 700;
}

.disc-barra-fundo {
  background: var(--cinza-claro);
  border-radius: 6px;
  height: 14px;
  overflow: hidden;
}

.disc-barra {
  background: var(--azul-primario);
  height: 100%;
}

.disc-valor {
  text-align: right;
  color: var(--cinza-medio);
}

.plano-acao {
  margin: 16px 0;
}

.prioridades {
  padding-left: 20px;
}

.trilhas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.trilha-card {
  background: var(--branco);
  border-radius: var(--raio);
  box-shadow: var(--sombra);
  padding: 20px;
}

.trilha-progresso {
  color: var(--cinza-medio);
  font-size: 0.9rem;
}

.videos-lista {
  list-style: none;
  padding: 0;
}

.video-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-top: 1px solid var(--cinza-claro);
}

.admin-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.tab-btn {
  background: var(--branco);
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
}

.tab-btn.ativo {
  background: var(--azul-primario);
  color: var(--branco);
  border-color: var(--azul-primario);
}

.admin-secao {
  margin-bottom: 24px;
}

.aviso-card {
  background: #fef9c3;
  border: 1px solid #eab308;
  border-radius: 6px;
  padding: 12px 16px;
  font-size: 0.9rem;
}

.tema-editor,
.perfil-editor {
  margin-bottom: 16px;
}

.video-editor {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.videos-editor {
  margin: 12px 0;
}

.checkbox-tema {
  display: block;
  font-weight: 400;
  margin-bottom: 4px;
}

.acesso-resultado {
  background: var(--cinza-claro);
  border-radius: 6px;
  padding: 16px;
  margin-top: 16px;
  word-break: break-all;
}

@media (max-width: 640px) {
  .container {
    padding: 16px 12px 48px;
  }

  .video-editor {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Verify with a quick smoke check**

Run: `node -e "const fs=require('fs'); const css=fs.readFileSync('style.css','utf8'); const open=(css.match(/{/g)||[]).length; const close=(css.match(/}/g)||[]).length; if(open!==close) throw new Error('brace mismatch: '+open+' vs '+close); console.log('OK', open, 'rule blocks');"`
Expected: prints `OK <n> rule blocks` with no error (braces balanced). Full visual verification happens once `index.html`/`admin.html` exist (Tasks 7 and 10) and again in the final manual pass (Task 14).

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "Add shared design system in style.css"
```

---

### Task 7: `index.html` + `script.js` — auth flow (token, login, logout, session)

**Files:**
- Create: `index.html`
- Create: `script.js`

**Interfaces:**
- Consumes: `decodeToken` (Task 2), `saveAluno`, `getAluno`, `setSessao`, `getSessaoEmail`, `clearSessao` (Task 5), CSS classes from Task 6.
- Produces: DOM element ids that Tasks 8–9 append behavior to: `tela-erro-token`, `tela-login`, `tela-dashboard`, `form-login`, `login-email`, `login-senha`, `login-erro`, `usuario-info`, `usuario-nome`, `btn-logout`, `dash-nome`, `disc-grafico`, `plano-acao`, `btn-pdf`, `pdf-erro`, `trilhas-lista`. Also produces the `mostrarTela(id)` and `el(id)` helpers used throughout `script.js`.

- [ ] **Step 1: Create `index.html`**

```html
<!doctype html>
<html lang="pt-br">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Portal IA na Prática — EdusIA</title>
<link rel="stylesheet" href="style.css" />
</head>
<body>
<header class="topo">
  <div class="logo">EdusIA</div>
  <div id="usuario-info" class="usuario-info" hidden>
    <span id="usuario-nome"></span>
    <button id="btn-logout" class="btn-link">Sair</button>
  </div>
</header>

<main class="container">
  <section id="tela-erro-token" class="card" hidden>
    <h2>Link inválido</h2>
    <p>Este link de acesso não é válido ou expirou. Você pode tentar entrar com email e senha abaixo.</p>
  </section>

  <section id="tela-login" class="card login-card" hidden>
    <h1>Entrar</h1>
    <form id="form-login">
      <label for="login-email">Email
        <input type="email" id="login-email" required />
      </label>
      <label for="login-senha">Senha
        <input type="password" id="login-senha" required />
      </label>
      <p id="login-erro" class="erro" hidden></p>
      <button type="submit" class="btn btn-primario">Entrar</button>
    </form>
  </section>

  <section id="tela-dashboard" hidden>
    <section class="card resumo-disc">
      <h1>Olá, <span id="dash-nome"></span>!</h1>
      <div id="disc-grafico" class="disc-grafico"></div>
      <div id="plano-acao" class="plano-acao"></div>
      <button id="btn-pdf" class="btn btn-secundario">Baixar Plano de Ação em PDF</button>
      <p id="pdf-erro" class="erro" hidden></p>
    </section>

    <section class="trilhas">
      <h2>Suas Trilhas</h2>
      <div id="trilhas-lista" class="trilhas-grid"></div>
    </section>
  </section>
</main>

<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script type="module" src="script.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `script.js` with the auth flow**

```js
import { decodeToken } from './logic.js';
import { saveAluno, getAluno, setSessao, getSessaoEmail, clearSessao } from './store.js';

const el = (id) => document.getElementById(id);

function mostrarTela(id) {
  ['tela-erro-token', 'tela-login', 'tela-dashboard'].forEach((t) => {
    el(t).hidden = t !== id;
  });
}

function tratarToken() {
  const hash = window.location.hash;
  const match = hash.match(/#\/t=(.+)/);
  if (!match) return false;
  try {
    const payload = decodeToken(decodeURIComponent(match[1]));
    saveAluno(payload);
    setSessao(payload.email);
    history.replaceState(null, '', window.location.pathname);
    return true;
  } catch (e) {
    mostrarTela('tela-erro-token');
    return 'erro';
  }
}

async function renderDashboard(email) {
  const aluno = getAluno(email);
  if (!aluno) {
    mostrarTela('tela-login');
    return;
  }
  el('dash-nome').textContent = aluno.nome;
  el('usuario-nome').textContent = aluno.nome;
  el('usuario-info').hidden = false;
  mostrarTela('tela-dashboard');
}

function iniciarLogin() {
  el('form-login').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const email = el('login-email').value.trim();
    const senha = el('login-senha').value;
    const aluno = getAluno(email);
    if (!aluno || aluno.senha !== senha) {
      el('login-erro').textContent = 'Email ou senha inválidos.';
      el('login-erro').hidden = false;
      return;
    }
    el('login-erro').hidden = true;
    setSessao(email);
    renderDashboard(email);
  });
}

function iniciarLogout() {
  el('btn-logout').addEventListener('click', () => {
    clearSessao();
    el('usuario-info').hidden = true;
    mostrarTela('tela-login');
  });
}

async function init() {
  iniciarLogin();
  iniciarLogout();

  const resultadoToken = tratarToken();
  if (resultadoToken === 'erro') return;
  if (resultadoToken === true) {
    await renderDashboard(getSessaoEmail());
    return;
  }
  const emailSessao = getSessaoEmail();
  if (emailSessao && getAluno(emailSessao)) {
    await renderDashboard(emailSessao);
  } else {
    mostrarTela('tela-login');
  }
}

init();
```

- [ ] **Step 3: Manual verification in a browser**

Serve the folder locally (any static server works, e.g. `npx serve .` or `python -m http.server`, run from the project directory) and open `http://localhost:<port>/index.html`.

1. With no hash and no prior session: the login screen appears (dashboard and error screen stay hidden).
2. Open the browser console and run:
   ```js
   import('./logic.js').then(({ encodeToken }) => {
     const token = encodeToken({ nome: 'Teste', email: 'teste@ex.com', senha: 'abc12345', disc: { D: 10, I: 20, S: 30, C: 40 }, geradoEm: new Date().toISOString() });
     window.location.hash = '#/t=' + token;
   });
   ```
   The page should redirect to the dashboard screen showing "Olá, Teste!" and the header should show "Teste" with a "Sair" button.
3. Reload the page (now with no hash, since it was replaced): still shows the dashboard (session persisted).
4. Click "Sair": returns to the login screen.
5. Log in with `teste@ex.com` / `abc12345`: returns to the dashboard.
6. Log in with a wrong password: shows "Email ou senha inválidos." without revealing which field was wrong.
7. Manually set `window.location.hash = '#/t=lixo-invalido'` and reload: shows the "Link inválido" screen.

Expected: all seven checks behave as described. If any fails, fix `script.js` before proceeding.

- [ ] **Step 4: Commit**

```bash
git add index.html script.js
git commit -m "Add student portal shell with token/login/logout auth flow"
```

---

### Task 8: `script.js` — dashboard rendering (DISC chart, Plano de Ação, trilhas)

**Files:**
- Modify: `script.js`

**Interfaces:**
- Consumes: `buildPlanoDeAcao` (Task 4), `getProgresso`, `toggleVideoAssistido` (Task 5), DOM ids from Task 7.
- Produces: module-level `planoAtual` variable holding the last-built plano (consumed by Task 9's PDF export).

- [ ] **Step 1: Add rendering functions to `script.js`**

At the top of `script.js`, replace the two `import` lines from Task 7 with:

```js
import { decodeToken, buildPlanoDeAcao } from './logic.js';
import { saveAluno, getAluno, setSessao, getSessaoEmail, clearSessao, toggleVideoAssistido, getProgresso } from './store.js';
```

Add before `renderDashboard`:

```js
let planoAtual = null;

async function carregarConfig() {
  const resp = await fetch('config.json');
  if (!resp.ok) throw new Error('config.json não encontrado');
  return resp.json();
}

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
    .slice(0, 3)
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

function renderTrilhas(trilhas, aluno) {
  const container = el('trilhas-lista');
  container.innerHTML = '';
  trilhas.forEach((tema) => {
    const assistidos = getProgresso(aluno.email, tema.id);
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
      toggleVideoAssistido(aluno.email, temaId, videoIndex);
      const tema = trilhas.find((t) => t.id === temaId);
      const item = ev.target.closest('.trilha-card');
      const assistidos = getProgresso(aluno.email, temaId);
      item.querySelector('.trilha-progresso').textContent = `${assistidos.length} de ${tema.videos.length} assistidos`;
    });
  });
}
```

- [ ] **Step 2: Wire rendering into `renderDashboard`**

Replace the existing `renderDashboard` function (from Task 7) with:

```js
async function renderDashboard(email) {
  const aluno = getAluno(email);
  if (!aluno) {
    mostrarTela('tela-login');
    return;
  }
  let config;
  try {
    config = await carregarConfig();
  } catch (e) {
    el('tela-dashboard').innerHTML = '<p class="erro">Conteúdo não pôde ser carregado. Tente novamente mais tarde.</p>';
    mostrarTela('tela-dashboard');
    return;
  }
  el('dash-nome').textContent = aluno.nome;
  renderDiscGrafico(aluno.disc);
  planoAtual = buildPlanoDeAcao(config, aluno.disc);
  renderPlanoAcao(planoAtual);
  renderTrilhas(planoAtual.trilhas, aluno);
  el('usuario-nome').textContent = aluno.nome;
  el('usuario-info').hidden = false;
  mostrarTela('tela-dashboard');
}
```

- [ ] **Step 3: Manual verification in a browser**

Re-run the same local server as Task 7 (must be served over HTTP, not `file://`, since `fetch('config.json')` requires it). Repeat the token login from Task 7 Step 3 (or reuse an existing session), then check:

1. The DISC bar chart shows four bars (D/I/S/C) with widths matching the values in the token (`D:10, I:20, S:30, C:40`).
2. The Plano de Ação text shows the dominant profile (C, since it's highest at 40), its `pontosFracos`, `mensagem`, and up to 3 numbered priority trilhas — all pulled from `config.json`'s `mapeamentoDisc.C`.
3. The trilhas grid shows all 6 temas, with the `temasRecomendados` for C first.
4. Click a video checkbox: the "x de y assistidos" counter for that card updates immediately.
5. Reload the page: the checkbox stays checked and the counter stays updated (progress persisted).

Expected: all five checks pass.

- [ ] **Step 4: Commit**

```bash
git add script.js
git commit -m "Add dashboard rendering: DISC chart, Plano de Ação, trilhas with progress"
```

---

### Task 9: `script.js` — PDF export via jsPDF

**Files:**
- Modify: `script.js`

**Interfaces:**
- Consumes: `planoAtual` (module-level variable from Task 8), the global `window.jspdf.jsPDF` (loaded by the `<script>` tag already present in `index.html` from Task 7), the `pdf-erro` element already present in `index.html` from Task 7.
- Produces: nothing consumed by later tasks (this is a leaf feature).

- [ ] **Step 1: Add `gerarPdf` and wire the button**

Add to `script.js`, after `renderTrilhas`:

```js
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
    planoAtual.trilhas.slice(0, 3).forEach((t, i) => {
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
```

In `init()`, add this line alongside the other `iniciar*()` calls:

```js
  el('btn-pdf').addEventListener('click', gerarPdf);
```

- [ ] **Step 2: Manual verification in a browser**

With the dashboard loaded (per Task 8's verification), click "Baixar Plano de Ação em PDF".

1. Expected: a file named `plano-de-acao.pdf` downloads. Open it and confirm it contains the perfil, pontos de desenvolvimento, the message, up to 3 numbered priorities matching what's shown on-screen, the estimated hours, and the 30-day goal — with no overlapping or cut-off text.
2. In the browser console, run `window.jspdf = undefined;` to simulate the CDN failing to load, then click the button again: the "Não foi possível gerar o PDF agora..." message appears near the button instead of a console error, and the rest of the dashboard (DISC chart, trilhas, checkboxes) keeps working.

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "Add Plano de Ação PDF export via jsPDF"
```

---

### Task 10: `admin.html` + `admin.js` — Temas tab

**Files:**
- Create: `admin.html`
- Create: `admin.js`

**Interfaces:**
- Consumes: CSS classes from Task 6.
- Produces: module-level `config` object (mutated in place by all admin tabs), `el(id)` helper, DOM ids consumed by Tasks 11–12: `temas-lista`, `btn-add-tema`, `mapeamento-lista`, `tab-temas`, `tab-mapeamento`, `tab-gerar-acesso`, `json-disc-input`, `gerar-acesso-erro`, `btn-gerar-acesso`, `acesso-resultado`, `resultado-link`, `resultado-email`, `resultado-senha`, `btn-copiar-link`, `btn-download-config`.

- [ ] **Step 1: Create `admin.html`**

```html
<!doctype html>
<html lang="pt-br">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Admin — Portal IA na Prática</title>
<link rel="stylesheet" href="style.css" />
</head>
<body>
<header class="topo">
  <div class="logo">EdusIA — Admin</div>
</header>

<main class="container">
  <nav class="admin-tabs">
    <button class="tab-btn ativo" data-tab="tab-temas">Temas</button>
    <button class="tab-btn" data-tab="tab-mapeamento">Mapeamento DISC</button>
    <button class="tab-btn" data-tab="tab-gerar-acesso">Gerar Acesso</button>
  </nav>

  <p class="aviso-card">Lembre-se de clicar em "Baixar config.json" antes de sair — edições não salvas se perdem ao recarregar a página.</p>

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

  <button id="btn-download-config" class="btn btn-primario btn-download">Baixar config.json</button>
</main>

<script type="module" src="admin.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `admin.js` with config loading and the Temas tab**

```js
const el = (id) => document.getElementById(id);
let config = { temas: [], mapeamentoDisc: {} };

async function carregarConfig() {
  const resp = await fetch('config.json');
  config = await resp.json();
  renderTemas();
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
          <input type="text" value="${v.link}" data-field="link" data-tema="${idx}" data-video="${vi}" placeholder="Link" />
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
      config.temas.splice(idx, 1);
      renderTemas();
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

el('btn-add-tema').addEventListener('click', () => {
  config.temas.push({
    id: proximoId(),
    nome: 'Novo tema',
    descricao: '',
    icone: '⭐',
    videos: [],
    competenciasDesenvolvidas: [],
  });
  renderTemas();
});

carregarConfig();
```

- [ ] **Step 3: Manual verification in a browser**

Serve the folder locally (same as Task 7) and open `http://localhost:<port>/admin.html`.

1. The Temas tab shows 6 tema cards pre-filled from `config.json`.
2. Edit a tema's nome: the input reflects the change (no reload needed).
3. Click "Adicionar vídeo" on a tema: a new blank título/link row appears.
4. Click "Remover" on a video: that row disappears.
5. Click "Adicionar tema": a new "Novo tema" card appears with id 7.
6. Click "Remover tema" on it: it disappears.

Expected: all six checks pass. Editing here has no effect on `index.html` yet — that only happens after downloading and swapping the file (verified fully in Task 14).

- [ ] **Step 4: Commit**

```bash
git add admin.html admin.js
git commit -m "Add admin panel shell and Temas tab editor"
```

---

### Task 11: `admin.js` — Mapeamento DISC tab + tab switching

**Files:**
- Modify: `admin.js`

**Interfaces:**
- Consumes: `config` (Task 10), DOM ids `tab-mapeamento`, `mapeamento-lista` from `admin.html` (Task 10).
- Produces: nothing consumed by later tasks (Task 12 is independent).

- [ ] **Step 1: Add `renderMapeamento` and tab switching to `admin.js`**

Add to `admin.js`, after `renderTemas`/`ligarEventosTemas`:

```js
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

function iniciarTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('ativo'));
      document.querySelectorAll('.admin-secao').forEach((s) => {
        s.hidden = true;
      });
      btn.classList.add('ativo');
      el(btn.dataset.tab).hidden = false;
    });
  });
}
```

Update `carregarConfig` to also render the mapeamento tab, and call `iniciarTabs()` at the end of the file:

```js
async function carregarConfig() {
  const resp = await fetch('config.json');
  config = await resp.json();
  renderTemas();
  renderMapeamento();
}
```

(This replaces the two-line body of `carregarConfig` from Task 10.)

Add at the very end of `admin.js`, after the existing `carregarConfig();` call:

```js
iniciarTabs();
```

- [ ] **Step 2: Manual verification in a browser**

Reload `admin.html`.

1. Click the "Mapeamento DISC" tab button: the Temas section hides, the Mapeamento section shows 4 perfil cards (D, I, S, C), each pre-filled with `pontosFracos`, `mensagem`, and checkboxes for all 6 temas with the recommended ones pre-checked.
2. Edit the "D" perfil's mensagem textarea: the change is reflected (no reload).
3. Uncheck a currently-checked tema for perfil "D", then check a different one: no errors in the console.
4. Click back to the "Temas" tab: it still shows the edits made in Task 10's verification (state preserved across tab switches, since `config` is a single in-memory object).

Expected: all four checks pass.

- [ ] **Step 3: Commit**

```bash
git add admin.js
git commit -m "Add Mapeamento DISC tab and tab switching to admin panel"
```

---

### Task 12: `admin.js` — Gerar Acesso tab + download config.json

**Files:**
- Modify: `admin.js`

**Interfaces:**
- Consumes: `generatePassword`, `encodeToken`, `validateDiscResult` (Tasks 2–3), `config` (Task 10), DOM ids `btn-gerar-acesso`, `json-disc-input`, `gerar-acesso-erro`, `acesso-resultado`, `resultado-link`, `resultado-email`, `resultado-senha`, `btn-copiar-link`, `btn-download-config` (Task 10).
- Produces: nothing consumed by later tasks — this is the last admin feature.

- [ ] **Step 1: Add the import and the Gerar Acesso + download functions to `admin.js`**

Add at the very top of `admin.js`:

```js
import { generatePassword, encodeToken, validateDiscResult } from './logic.js';
```

Add to `admin.js`, after `iniciarTabs`:

```js
function iniciarGerarAcesso() {
  el('btn-gerar-acesso').addEventListener('click', () => {
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
    const senha = generatePassword();
    const payload = { nome: dados.nome, email: dados.email, senha, disc: dados.disc, geradoEm: new Date().toISOString() };
    const token = encodeToken(payload);
    const baseUrl = window.location.href.replace(/admin\.html.*$/, 'index.html');
    const link = `${baseUrl}#/t=${token}`;
    el('resultado-link').textContent = link;
    el('resultado-email').textContent = dados.email;
    el('resultado-senha').textContent = senha;
    el('acesso-resultado').hidden = false;
  });

  el('btn-copiar-link').addEventListener('click', () => {
    navigator.clipboard.writeText(el('resultado-link').textContent);
  });
}

function iniciarDownload() {
  el('btn-download-config').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'config.json';
    a.click();
    URL.revokeObjectURL(url);
  });
}
```

Add at the very end of `admin.js`, after `iniciarTabs();`:

```js
iniciarGerarAcesso();
iniciarDownload();
```

- [ ] **Step 2: Manual verification in a browser**

Reload `admin.html`, click the "Gerar Acesso" tab.

1. Paste `{"nome":"João Silva","email":"joao@example.com","disc":{"D":80,"I":40,"S":30,"C":20}}` into the textarea and click "Gerar link do aluno": a link, email, and 8-character password appear below.
2. Open the generated link in a new tab (adjust the base path if serving locally differs from `index.html`'s location): it logs "João Silva" straight into the dashboard, with the DISC profile "Dominante (D)".
3. Back in the admin tab, paste `{"nome":"","disc":{"D":"x"}}` (missing/invalid fields) and click "Gerar link do aluno": an error message lists the specific problems (nome, email, disc.D, disc.I, disc.S, disc.C) instead of crashing.
4. Paste `not valid json` and click "Gerar link do aluno": shows the "JSON inválido" message.
5. Click "Baixar config.json": a `config.json` file downloads; open it and confirm it reflects any edits made during Task 10/11's verification (proves the download always reflects current in-memory state).

Expected: all five checks pass.

- [ ] **Step 3: Commit**

```bash
git add admin.js
git commit -m "Add Gerar Acesso tab and config.json download to admin panel"
```

---

### Task 13: `README.md`

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Create `README.md`**

```markdown
# Portal "IA na Prática" — EdusIA

Portal de trilhas de treinamento em IA, personalizado pelo resultado DISC de
cada aluno. Site 100% estático (HTML/CSS/JS puro), sem backend, sem build
step — hospedável em qualquer hosting estático (ex.: Cloudflare Pages).

## Como funciona

- **Conteúdo** (temas/trilhas e recomendações por perfil DISC) vive em
  `config.json`, editado pelo painel admin.
- **Identidade do aluno** vive dentro do próprio link de acesso: um token
  Base64 (`index.html#/t=...`) que carrega nome, email, senha e resultado
  DISC. Não existe uma lista central de alunos — cada aluno só existe no
  link que recebeu e no `localStorage` do navegador onde ele acessou esse
  link pela primeira vez.

## Como editar os temas e o mapeamento DISC

1. Abra `admin.html` (a URL não é divulgada publicamente — trate como uma
   URL secreta, não há senha própria de admin).
2. Na aba **Temas**: edite nome, ícone, descrição, competências e vídeos de
   cada trilha; adicione ou remova temas e vídeos livremente.
3. Na aba **Mapeamento DISC**: para cada perfil (D, I, S, C), edite os
   pontos fracos, a mensagem personalizada e quais temas são recomendados
   (marcando as caixas).
4. Clique em **"Baixar config.json"** — isso baixa o arquivo com todas as
   edições. Substitua o `config.json` do projeto por esse arquivo baixado e
   refaça o deploy do site (mesmo processo que você já usa nos outros
   projetos).

**Importante:** as edições no admin só existem na memória da página. Se você
recarregar `admin.html` sem clicar em "Baixar config.json", perde as
edições não salvas.

## Como gerar o acesso de um aluno (integração com o DISC)

1. Depois que o aluno concluir a avaliação DISC (em outro sistema), pegue o
   resultado nesse formato JSON:

   ```json
   {
     "nome": "João Silva",
     "email": "joao@example.com",
     "disc": { "D": 80, "I": 40, "S": 30, "C": 20 }
   }
   ```

2. Abra `admin.html` → aba **Gerar Acesso**, cole esse JSON e clique em
   "Gerar link do aluno".
3. O sistema gera uma senha aleatória de 8 caracteres e monta o link único
   do aluno. Copie o link (botão "Copiar") e a senha, e envie ao aluno
   (WhatsApp, email — fora do escopo deste sistema).
4. O aluno abre o link e cai direto no dashboard dele — sem precisar digitar
   senha na primeira vez. Em acessos futuros, no mesmo navegador, ele usa
   email + a senha gerada.

Gerar um acesso **não** exige redeploy do site — o link funciona assim que é
gerado, independente do que está publicado.

## Limitações conhecidas (por design)

- **O token não é criptografia real, é ofuscação Base64.** Qualquer pessoa
  com o link consegue decodificar e ler nome/email/resultado DISC pelo
  console do navegador. Adequado para acesso individual a conteúdo de
  treinamento — não deve ser usado para dado sensível de alto risco.
- **Login por email/senha só funciona no navegador onde o aluno usou o link
  pela primeira vez.** Em outro dispositivo ou navegador, ele precisa do
  link de novo (não há login universal, pois não há backend).
- **Progresso das trilhas é local ao navegador** — não sincroniza entre
  dispositivos do mesmo aluno.
- **O painel admin não tem senha própria** — a proteção é a URL não ser
  divulgada. Não use `admin.html` como link público.

## Como hospedar no Cloudflare Pages

1. Crie um projeto no Cloudflare Pages apontando para este diretório (sem
   build command, sem diretório de output diferente — é um site estático
   puro).
2. Cada vez que editar `config.json` (via admin ou manualmente), suba o
   arquivo atualizado e o Cloudflare Pages redistribui automaticamente.
3. Gerar acessos de novos alunos (aba "Gerar Acesso") **não** exige esse
   passo — só a edição de conteúdo (Temas/Mapeamento DISC) exige.

## Rodando localmente

Como o portal usa `fetch('config.json')`, é preciso servir os arquivos por
HTTP (não abrir `index.html` direto como `file://`). Qualquer servidor
estático simples funciona, por exemplo:

```bash
npx serve .
# ou
python -m http.server
```

## Testes automatizados

A lógica pura (token, senha, cálculo de perfil DISC, priorização de
trilhas) tem testes automatizados com o runner nativo do Node.js (requer
Node 18+):

```bash
npm test
# equivalente a: node --test tests/
```

O restante (telas, formulários, PDF) é verificado manualmente em navegador
— não há framework de testes de UI neste projeto.

## Exemplos de JSON

**Resultado DISC de entrada** (colar na aba "Gerar Acesso"):

```json
{
  "nome": "Maria Souza",
  "email": "maria@example.com",
  "disc": { "D": 30, "I": 85, "S": 40, "C": 25 }
}
```

**Trecho de `config.json`** (um tema editável):

```json
{
  "id": 1,
  "nome": "IA Generativa & Prompting",
  "descricao": "Aprenda a usar IA generativa para criar textos, ideias e soluções com prompts eficazes.",
  "icone": "⚡",
  "videos": [
    { "titulo": "Introdução a Prompting", "link": "https://youtube.com/watch?v=exemplo-prompting-1" }
  ],
  "competenciasDesenvolvidas": ["Comunicação com IA", "Escrita estruturada"]
}
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add README with editing, integration, hosting and testing docs"
```

---

### Task 14: Final end-to-end manual verification pass

**Files:**
- None created — verification only. Fix any file above if a check fails.

**Interfaces:**
- Consumes: the entire deployed set of files from Tasks 1–13.
- Produces: nothing — this is the closing gate before the branch is considered done.

- [ ] **Step 1: Run the full automated test suite**

Run: `node --test tests/`
Expected: PASS, 0 failures (20 tests from Tasks 1–5).

- [ ] **Step 2: Run through the spec's manual verification checklist**

Serve the project directory over HTTP (e.g. `npx serve .`) and, starting from a clean browser profile or an incognito window (no leftover `localStorage`):

1. In `admin.html`, generate an access link from a valid DISC JSON, and one from an invalid JSON (confirm the error message names the specific bad field).
2. Open the generated link in the fresh browser: lands directly on the dashboard (no login prompt).
3. Close the tab, reopen the base `index.html` URL (no token): the login screen appears; log in with the generated email/password and reach the dashboard again.
4. Mark 2 videos as watched across 2 different trilhas, reload the page: both remain checked and both counters are correct.
5. In `admin.html`, edit one tema's nome and one perfil's mensagem, download `config.json`, replace the project's `config.json` with the downloaded file, and reload `index.html`: the dashboard shows the updated tema name and message.
6. Generate the Plano de Ação PDF for a DISC result where each of D, I, S, and C is the highest value in turn (4 separate generations) — confirm each PDF shows the correct dominant profile, its `pontosFracos`, and its top-3 recommended trilhas.
7. Resize the browser to ~375px width (or use device emulation) and check both `index.html` (login, dashboard, trilhas grid) and `admin.html` (tabs, forms) — no horizontal scrolling, no overlapping text.

Expected: all seven checks pass. If any fails, identify which task's file is responsible and fix it there (not with a one-off patch that diverges from that task's documented code).

- [ ] **Step 3: Commit any fixes made during verification**

If Step 2 required fixes:

```bash
git add -A
git commit -m "Fix issues found during end-to-end verification"
```

If no fixes were needed, this task requires no commit.
