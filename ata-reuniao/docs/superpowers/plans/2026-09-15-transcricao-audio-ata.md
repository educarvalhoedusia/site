# Transcrição de Áudio por IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao Gerador de Ata de Reunião upload de áudio, transcrição via API Whisper da OpenAI, estruturação automática em pauta/encaminhamentos via GPT-4o-mini, e um painel de revisão onde o usuário aprova seletivamente o que entra na ata.

**Architecture:** Tudo dentro do único arquivo `index.html` já existente (HTML+CSS+JS, sem bibliotecas externas). Três novas peças lógicas dentro da mesma IIFE: armazenamento da chave de API (`localStorage`), o fluxo de chamadas à OpenAI (Whisper + Chat Completions), e um painel de revisão que aplica seletivamente os itens sugeridos ao `state.pauta` / `state.encaminhamentos` já existentes, reaproveitando `renderPauta()`, `renderEncaminhamentos()`, `agendarSalvarRascunho()`, `openModal()`, `showStatus()` e `makeFieldInput()`.

**Tech Stack:** HTML/CSS/JS puro (sem build, sem framework), `fetch()` para as APIs da OpenAI (`audio/transcriptions` e `chat/completions`), `localStorage` para persistência.

**Spec:** `docs/superpowers/specs/2026-09-15-transcricao-audio-design.md`

## Global Constraints

- Um único arquivo `index.html`, sem bibliotecas externas, sem build step.
- As únicas chamadas de rede permitidas são `fetch()` direto para `https://api.openai.com/...`, feitas pelo navegador do usuário com a chave de API dele.
- A chave de API nunca é escrita no código-fonte; fica só em `localStorage` (`ataReuniao.openaiApiKey`).
- O arquivo de áudio e o texto bruto da transcrição nunca são persistidos — só o que o usuário aplicar via o painel de revisão entra em `state.pauta` / `state.encaminhamentos` e é salvo pelo autosave já existente.
- Limite de arquivo de áudio: 25 MB (limite da API Whisper). Sem chunking nesta versão.
- `prazo` sugerido pela IA deve ser `AAAA-MM-DD` ou vazio; `prioridade` sugerida deve ser exatamente `"Alta"`, `"Média"`, `"Baixa"` ou vazio — qualquer outro valor é normalizado para vazio.
- Este projeto não usa framework de testes automatizado (consistente com o resto do app e com a seção "Testes" do spec). Cada tarefa termina com uma verificação manual no navegador, com passos exatos e resultado esperado, em vez de um comando de teste automatizado.
- Todos os textos de interface em português do Brasil.

---

## Verificação manual — como rodar o app durante a implementação

Sirva o arquivo localmente (ele usa `fetch`, que não funciona bem em `file://`):

```bash
cd C:/projetos/ata-reuniao
node -e "
const http = require('http');
const fs = require('fs');
const path = require('path');
http.createServer((req,res)=>{
  let filePath = path.join(__dirname, req.url === '/' ? '/index.html' : req.url);
  fs.readFile(filePath, (err,data)=>{
    if(err){res.writeHead(404);res.end('not found');return;}
    res.writeHead(200,{'Content-Type':'text/html'});
    res.end(data);
  });
}).listen(8791, ()=>console.log('listening'));
"
```

Depois abra `http://localhost:8791/index.html` no navegador. Pare o processo (`Stop-Process`/`kill`) ao final de cada sessão de verificação.

---

### Task 1: Chave de API — armazenamento e modal de configuração

**Files:**
- Modify: `index.html` (CSS, HTML, JS, todos no mesmo arquivo)

**Interfaces:**
- Produces: `STORAGE_API_KEY` (constante), `getApiKey()`, `setApiKey(key)`, `clearApiKey()`, `mascararApiKey(key)`, `atualizarStatusApiKey()`, `abrirModalApiKey()`, `bindApiKeyButton()` — usadas por tarefas seguintes para checar se há chave antes de transcrever.
- Consumes: `openModal(title, bodyHtml, buttons)`, `closeModal()`, `showStatus(msg)`, `escapeHtml(s)` (já existentes no arquivo).

- [ ] **Step 1: Adicionar a constante de armazenamento da chave**

Em `index.html`, localize (por volta da linha 620):

```js
  var STORAGE_THEME = "ataReuniao.tema";
```

Substitua por:

```js
  var STORAGE_THEME = "ataReuniao.tema";
  var STORAGE_API_KEY = "ataReuniao.openaiApiKey";
```

- [ ] **Step 2: Adicionar as funções de armazenamento e o modal de configuração**

Localize (por volta da linha 751-757):

```js
  function setAtas(lista) {
    try {
      localStorage.setItem(STORAGE_ATAS, JSON.stringify(lista));
    } catch (e) { /* ignora */ }
  }

  // ---------- Renderização: formulário ----------
```

Substitua por:

```js
  function setAtas(lista) {
    try {
      localStorage.setItem(STORAGE_ATAS, JSON.stringify(lista));
    } catch (e) { /* ignora */ }
  }

  // ---------- Chave de API da OpenAI ----------

  function getApiKey() {
    try { return localStorage.getItem(STORAGE_API_KEY) || ""; } catch (e) { return ""; }
  }

  function setApiKey(key) {
    try { localStorage.setItem(STORAGE_API_KEY, key); } catch (e) { /* ignora */ }
  }

  function clearApiKey() {
    try { localStorage.removeItem(STORAGE_API_KEY); } catch (e) { /* ignora */ }
  }

  function mascararApiKey(key) {
    if (!key) return "";
    if (key.length <= 8) return "••••";
    return key.slice(0, 4) + "•".repeat(Math.max(4, key.length - 8)) + key.slice(-4);
  }

  function atualizarStatusApiKey() {
    var el = document.getElementById("apiKeyStatus");
    var key = getApiKey();
    el.textContent = key ? "Chave configurada: " + mascararApiKey(key) : "Nenhuma chave configurada.";
  }

  function abrirModalApiKey() {
    var atual = getApiKey();
    var bodyHtml =
      "<p>Cole sua chave de API da OpenAI. Ela fica salva apenas neste navegador " +
      "(localStorage), nunca é enviada a nenhum lugar além da própria API da OpenAI.</p>" +
      '<div class="field"><label for="modalApiKeyInput">Chave de API</label>' +
      '<input type="password" id="modalApiKeyInput" placeholder="sk-..." value="' +
      escapeHtml(atual) + '"></div>';

    var buttons = [{ label: "Cancelar", variant: "ghost" }];

    if (atual) {
      buttons.push({
        label: "Remover chave", variant: "danger", onClick: function () {
          clearApiKey();
          atualizarStatusApiKey();
          showStatus("Chave de API removida.");
        }
      });
    }

    buttons.push({
      label: "Salvar", variant: "primary", onClick: function () {
        var input = document.getElementById("modalApiKeyInput");
        var valor = input ? input.value.trim() : "";
        if (!valor) { showStatus("Nenhuma chave informada."); return; }
        setApiKey(valor);
        atualizarStatusApiKey();
        showStatus("Chave de API salva.");
      }
    });

    openModal("Configurar chave de API da OpenAI", bodyHtml, buttons);
  }

  function bindApiKeyButton() {
    document.getElementById("btnConfigurarApiKey").addEventListener("click", abrirModalApiKey);
  }

  // ---------- Renderização: formulário ----------
```

- [ ] **Step 3: Adicionar a seção HTML "Transcrição por IA"**

Localize (por volta da linha 547-550):

```html
    </div>
  </section>

  <section class="card" id="participantesCard">
```

Substitua por:

```html
    </div>
  </section>

  <section class="card" id="transcricaoCard">
    <h2>Transcrição por IA
      <span class="hint">Envie o áudio da reunião para transcrever e sugerir pauta e encaminhamentos automaticamente.</span>
    </h2>
    <p class="privacy-note">Ao transcrever, o áudio e o texto da reunião são enviados aos servidores da OpenAI usando sua chave de API.</p>
    <div class="actions-row">
      <button type="button" id="btnConfigurarApiKey">Configurar chave de API da OpenAI</button>
      <span id="apiKeyStatus" class="status-text"></span>
    </div>
  </section>

  <section class="card" id="participantesCard">
```

- [ ] **Step 4: Adicionar o CSS novo**

Localize (por volta da linha 414):

```css
  .saved-item .info .sub { color: var(--text-secondary); font-size: 0.82rem; }
```

Substitua por:

```css
  .saved-item .info .sub { color: var(--text-secondary); font-size: 0.82rem; }

  .privacy-note {
    font-size: 0.85rem;
    color: var(--text-secondary);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 14px;
  }

  .status-text {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .transcricao-status {
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 0.9rem;
    background: var(--bg);
    border: 1px solid var(--border);
    white-space: pre-wrap;
  }

  .transcricao-status.erro {
    color: var(--error);
    border-color: var(--error);
  }

  .transcricao-bruta {
    max-height: 220px;
    overflow-y: auto;
    white-space: pre-wrap;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    font-size: 0.9rem;
    margin-top: 8px;
  }

  .sugestao-item {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 12px;
    background: var(--bg);
  }

  .sugestao-item-header {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 10px;
  }

  .sugestao-item-header input[type="checkbox"] {
    width: 20px;
    height: 20px;
    margin-top: 2px;
    flex-shrink: 0;
  }

  #revisaoCard h3 { margin: 16px 0 8px; font-size: 0.95rem; }
```

- [ ] **Step 5: Excluir a seção de transcrição/revisão da folha de impressão**

Localize (por volta da linha 470-473):

```css
  @media print {
    .app-header, .toolbar, #dadosCard, #participantesCard, #pautaCard,
    #encaminhamentosCard, .generate-bar, #statusMsg, .modal-overlay,
    #previewActions, details.saved-list { display: none !important; }
```

Substitua por:

```css
  @media print {
    .app-header, .toolbar, #dadosCard, #participantesCard, #pautaCard,
    #encaminhamentosCard, .generate-bar, #statusMsg, .modal-overlay,
    #previewActions, details.saved-list, #transcricaoCard, #revisaoCard { display: none !important; }
```

- [ ] **Step 6: Ligar o botão no `init()`**

Localize (por volta da linha 1577-1579):

```js
    bindThemeToggle();

    document.getElementById("btnExemplo").addEventListener("click", carregarExemplo);
```

Substitua por:

```js
    bindThemeToggle();
    atualizarStatusApiKey();
    bindApiKeyButton();

    document.getElementById("btnExemplo").addEventListener("click", carregarExemplo);
```

- [ ] **Step 7: Verificação manual**

Suba o servidor local (ver seção acima) e abra `http://localhost:8791/index.html`.

1. Confirme que a nova seção "Transcrição por IA" aparece entre "Dados da reunião" e "Participantes", com o aviso de privacidade visível.
2. O texto ao lado do botão deve dizer "Nenhuma chave configurada."
3. Clique em "Configurar chave de API da OpenAI" → um modal abre pedindo a chave, com botões "Cancelar" e "Salvar" (sem botão "Remover chave", pois ainda não há chave salva).
4. Digite um texto qualquer (ex. `sk-teste-123456`) e clique "Salvar" → o modal fecha, aparece um aviso "Chave de API salva." e o texto ao lado do botão muda para algo como "Chave configurada: sk-t••••3456".
5. Recarregue a página (F5) → o status da chave deve continuar mostrando a chave mascarada (persistiu no localStorage).
6. Abra o modal de novo → agora deve aparecer também o botão "Remover chave". Clique nele → o status volta para "Nenhuma chave configurada."

Resultado esperado: todos os passos acima se comportam exatamente como descrito, sem erros no console do navegador.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Add OpenAI API key storage and configuration modal

First piece of the audio transcription feature: lets the user paste
and store their own OpenAI API key in localStorage, never in source.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Upload de áudio e validação de tamanho

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `MAX_AUDIO_BYTES` (nova constante desta tarefa), nenhuma dependência de tarefas anteriores além do CSS/HTML já criados.
- Produces: `validarArquivoAudio(file)` → `{ ok: boolean, mensagem: string }`, `mostrarStatusTranscricao(mensagem, tipo)`, `limparStatusTranscricao()`, `bindAudioFileInput()`. Usadas pela Task 3 ao clicar em "Transcrever".

- [ ] **Step 1: Adicionar a constante de limite de tamanho**

Localize (após a edição da Task 1):

```js
  var STORAGE_API_KEY = "ataReuniao.openaiApiKey";
```

Substitua por:

```js
  var STORAGE_API_KEY = "ataReuniao.openaiApiKey";
  var MAX_AUDIO_BYTES = 25 * 1024 * 1024;
```

- [ ] **Step 2: Adicionar o campo de upload e o botão de transcrever no HTML**

Localize (o bloco criado na Task 1):

```html
    <div class="actions-row">
      <button type="button" id="btnConfigurarApiKey">Configurar chave de API da OpenAI</button>
      <span id="apiKeyStatus" class="status-text"></span>
    </div>
  </section>
```

Substitua por:

```html
    <div class="actions-row">
      <button type="button" id="btnConfigurarApiKey">Configurar chave de API da OpenAI</button>
      <span id="apiKeyStatus" class="status-text"></span>
    </div>
    <div class="field" style="margin-top:14px;">
      <label for="fAudioFile">Arquivo de áudio da reunião</label>
      <input type="file" id="fAudioFile" accept="audio/*">
      <span class="desc">Formatos comprimidos (MP3, M4A) até 25 MB.</span>
    </div>
    <div class="actions-row">
      <button type="button" class="primary" id="btnTranscrever" disabled>Transcrever e sugerir pauta</button>
    </div>
    <div id="transcricaoStatus" class="transcricao-status" hidden></div>
  </section>
```

- [ ] **Step 3: Adicionar a função de validação e os helpers de status**

Localize (o bloco de funções criado na Task 1, logo antes de `// ---------- Renderização: formulário ----------`):

```js
  function bindApiKeyButton() {
    document.getElementById("btnConfigurarApiKey").addEventListener("click", abrirModalApiKey);
  }

  // ---------- Renderização: formulário ----------
```

Substitua por:

```js
  function bindApiKeyButton() {
    document.getElementById("btnConfigurarApiKey").addEventListener("click", abrirModalApiKey);
  }

  // ---------- Upload e validação de áudio ----------

  function validarArquivoAudio(file) {
    if (!file) return { ok: false, mensagem: "Nenhum arquivo selecionado." };
    if (file.size > MAX_AUDIO_BYTES) {
      var tamanhoMb = (file.size / (1024 * 1024)).toFixed(1);
      return {
        ok: false,
        mensagem: "Arquivo de " + tamanhoMb + " MB excede o limite de 25 MB. " +
          "Comprima o áudio (ex.: exporte em MP3) ou envie um trecho mais curto."
      };
    }
    return { ok: true, mensagem: "" };
  }

  function mostrarStatusTranscricao(mensagem, tipo) {
    var el = document.getElementById("transcricaoStatus");
    el.textContent = mensagem;
    el.hidden = false;
    el.className = "transcricao-status" + (tipo === "erro" ? " erro" : "");
  }

  function limparStatusTranscricao() {
    var el = document.getElementById("transcricaoStatus");
    el.hidden = true;
    el.textContent = "";
    el.className = "transcricao-status";
  }

  function bindAudioFileInput() {
    var input = document.getElementById("fAudioFile");
    var btn = document.getElementById("btnTranscrever");
    input.addEventListener("change", function () {
      var file = input.files[0];
      if (!file) {
        btn.disabled = true;
        limparStatusTranscricao();
        return;
      }
      var resultado = validarArquivoAudio(file);
      if (!resultado.ok) {
        btn.disabled = true;
        mostrarStatusTranscricao(resultado.mensagem, "erro");
      } else {
        btn.disabled = false;
        limparStatusTranscricao();
      }
    });
  }

  // ---------- Renderização: formulário ----------
```

- [ ] **Step 4: Ligar no `init()`**

Localize:

```js
    bindApiKeyButton();

    document.getElementById("btnExemplo").addEventListener("click", carregarExemplo);
```

Substitua por:

```js
    bindApiKeyButton();
    bindAudioFileInput();

    document.getElementById("btnExemplo").addEventListener("click", carregarExemplo);
```

- [ ] **Step 5: Verificação manual**

Recarregue `http://localhost:8791/index.html`.

1. O botão "Transcrever e sugerir pauta" deve começar desabilitado.
2. Crie um arquivo de teste grande (ex.: `fsutil file createnew audio-grande.mp3 30000000` no PowerShell, ~30 MB) e selecione-o no campo de áudio → deve aparecer a mensagem de erro sobre exceder 25 MB, e o botão continua desabilitado.
3. Selecione um arquivo de áudio pequeno de verdade (qualquer MP3/M4A curto que você tenha, ou grave um áudio curto no celular) → a mensagem de erro deve sumir e o botão "Transcrever e sugerir pauta" deve ficar habilitado.
4. Limpe a seleção de arquivo (se o navegador permitir) → o botão volta a ficar desabilitado.

Resultado esperado: comportamento acima confirmado, sem erros no console.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Add audio file upload with 25MB size validation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Chamada à API Whisper (transcrição) com estados de carregamento e erro

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `getApiKey()`, `abrirModalApiKey()` (Task 1); `validarArquivoAudio(file)`, `mostrarStatusTranscricao()`, `limparStatusTranscricao()` (Task 2).
- Produces: `TranscricaoErro` (construtor de erro com `.tipo` e `.mensagem`), `chamarWhisper(file, apiKey)` → `Promise<string>` (texto transcrito), `executarTranscricao()`, `bindBtnTranscrever()`. `executarTranscricao` e `chamarWhisper`/`TranscricaoErro` serão reaproveitados/estendidos pela Task 4.

- [ ] **Step 1: Adicionar o tipo de erro e a chamada à API de transcrição**

Localize o bloco de upload criado na Task 2, logo antes de `// ---------- Renderização: formulário ----------`:

```js
  function bindAudioFileInput() {
    var input = document.getElementById("fAudioFile");
    var btn = document.getElementById("btnTranscrever");
    input.addEventListener("change", function () {
      var file = input.files[0];
      if (!file) {
        btn.disabled = true;
        limparStatusTranscricao();
        return;
      }
      var resultado = validarArquivoAudio(file);
      if (!resultado.ok) {
        btn.disabled = true;
        mostrarStatusTranscricao(resultado.mensagem, "erro");
      } else {
        btn.disabled = false;
        limparStatusTranscricao();
      }
    });
  }

  // ---------- Renderização: formulário ----------
```

Substitua por:

```js
  function bindAudioFileInput() {
    var input = document.getElementById("fAudioFile");
    var btn = document.getElementById("btnTranscrever");
    input.addEventListener("change", function () {
      var file = input.files[0];
      if (!file) {
        btn.disabled = true;
        limparStatusTranscricao();
        return;
      }
      var resultado = validarArquivoAudio(file);
      if (!resultado.ok) {
        btn.disabled = true;
        mostrarStatusTranscricao(resultado.mensagem, "erro");
      } else {
        btn.disabled = false;
        limparStatusTranscricao();
      }
    });
  }

  // ---------- Transcrição via API da OpenAI ----------

  function TranscricaoErro(tipo, mensagem) {
    this.tipo = tipo;
    this.mensagem = mensagem;
  }
  TranscricaoErro.prototype = Object.create(Error.prototype);

  async function chamarWhisper(file, apiKey) {
    var formData = new FormData();
    formData.append("file", file);
    formData.append("model", "whisper-1");
    formData.append("language", "pt");

    var resposta;
    try {
      resposta = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + apiKey },
        body: formData
      });
    } catch (e) {
      throw new TranscricaoErro("rede", "Não foi possível conectar à OpenAI. Verifique sua internet e tente novamente.");
    }

    if (resposta.status === 401) {
      throw new TranscricaoErro("autenticacao", 'Chave de API inválida ou sem permissão. Verifique em "Configurar chave de API".');
    }
    if (!resposta.ok) {
      throw new TranscricaoErro("api", "Erro ao transcrever o áudio (código " + resposta.status + "). Tente novamente.");
    }

    var dados;
    try {
      dados = await resposta.json();
    } catch (e) {
      throw new TranscricaoErro("api", "Resposta inesperada da API de transcrição.");
    }

    var texto = dados && dados.text ? String(dados.text).trim() : "";
    if (!texto) {
      throw new TranscricaoErro("vazio", "Nenhum conteúdo de fala foi identificado no áudio.");
    }
    return texto;
  }

  async function executarTranscricao() {
    var apiKey = getApiKey();
    if (!apiKey) {
      abrirModalApiKey();
      return;
    }
    var file = document.getElementById("fAudioFile").files[0];
    var validacao = validarArquivoAudio(file);
    if (!validacao.ok) {
      mostrarStatusTranscricao(validacao.mensagem, "erro");
      return;
    }

    var btn = document.getElementById("btnTranscrever");
    btn.disabled = true;
    mostrarStatusTranscricao("Transcrevendo áudio... isso pode levar alguns instantes.", "info");

    var texto;
    try {
      texto = await chamarWhisper(file, apiKey);
    } catch (e) {
      mostrarStatusTranscricao(e.mensagem || "Erro inesperado ao transcrever o áudio.", "erro");
      btn.disabled = false;
      return;
    }

    mostrarStatusTranscricao("Transcrição concluída:\n\n" + texto, "info");
    btn.disabled = false;
  }

  function bindBtnTranscrever() {
    document.getElementById("btnTranscrever").addEventListener("click", executarTranscricao);
  }

  // ---------- Renderização: formulário ----------
```

- [ ] **Step 2: Ligar no `init()`**

Localize:

```js
    bindAudioFileInput();

    document.getElementById("btnExemplo").addEventListener("click", carregarExemplo);
```

Substitua por:

```js
    bindAudioFileInput();
    bindBtnTranscrever();

    document.getElementById("btnExemplo").addEventListener("click", carregarExemplo);
```

- [ ] **Step 3: Verificação manual**

Recarregue a página. Você vai precisar de uma chave de API da OpenAI de verdade (peça ao usuário para configurar a dele em "Configurar chave de API") e um arquivo de áudio curto (1-2 minutos, com alguém falando algo em português) para este teste.

1. Sem chave configurada: selecione um áudio válido e clique "Transcrever e sugerir pauta" → deve abrir direto o modal de configuração da chave, sem tentar chamar a API.
2. Configure uma chave inválida (ex. `sk-invalida`) e repita → após "Transcrevendo áudio...", deve aparecer o erro "Chave de API inválida ou sem permissão...".
3. Configure uma chave de API válida (do próprio usuário) e repita com o áudio curto → deve mostrar "Transcrevendo áudio... isso pode levar alguns instantes." e, após alguns segundos, "Transcrição concluída:" seguido do texto transcrito, coerente com o que foi dito no áudio.
4. Durante a chamada, o botão deve ficar desabilitado, voltando a ficar habilitado ao final (sucesso ou erro).

Resultado esperado: os quatro cenários acima se comportam exatamente como descrito.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Add Whisper API call for audio transcription

Handles missing/invalid API key, network errors, and empty
transcriptions with clear Portuguese error messages.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Estruturação via GPT-4o-mini e painel de revisão (exibição)

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `PRIORIDADES` (array já existente no arquivo), `hoje()`, `state.reuniao.data`, `makeFieldInput()`, `uid()` (já existentes); `chamarWhisper`, `TranscricaoErro`, `mostrarStatusTranscricao`, `limparStatusTranscricao` (Task 3).
- Produces: `chamarEstruturacao(texto, apiKey, dataReuniaoIso)` → `Promise<{pauta, encaminhamentos}>`, `normalizarItemPauta`, `normalizarPrazoSugerido`, `normalizarPrioridadeSugerida`, `normalizarItemEncaminhamento`, `sugestaoAtual` (variável de estado do painel), `abrirPainelRevisao(texto, sugestao, estruturaFalhou)`, `renderPainelRevisao()`, `criarBlocoSugestaoPauta`, `criarBlocoSugestaoEncaminhamento`, `fecharPainelRevisao()`, `bindPainelRevisaoBotoes()` (com `aplicarSugestoes`/`descartarSugestoes` ainda como versão simplificada — a Task 5 substitui por lógica completa).

- [ ] **Step 1: Adicionar a seção HTML do painel de revisão**

Localize (o bloco criado na Task 2, dentro de `#transcricaoCard`):

```html
    <div id="transcricaoStatus" class="transcricao-status" hidden></div>
  </section>

  <section class="card" id="participantesCard">
```

Substitua por:

```html
    <div id="transcricaoStatus" class="transcricao-status" hidden></div>
  </section>

  <section class="card" id="revisaoCard" hidden>
    <h2>Sugestões da IA</h2>
    <p id="revisaoAviso" class="transcricao-status erro" hidden></p>
    <details class="saved-list">
      <summary>Ver transcrição bruta</summary>
      <div id="transcricaoBrutaTexto" class="transcricao-bruta"></div>
    </details>
    <h3>Itens de pauta sugeridos</h3>
    <div id="sugestaoPautaList"></div>
    <h3>Encaminhamentos sugeridos</h3>
    <div id="sugestaoEncaminhamentosList"></div>
    <div class="actions-row">
      <button type="button" class="primary" id="btnAplicarSugestoes">Aplicar selecionados</button>
      <button type="button" class="danger" id="btnDescartarSugestoes">Descartar tudo</button>
    </div>
  </section>

  <section class="card" id="participantesCard">
```

- [ ] **Step 2: Substituir `executarTranscricao` para incluir a chamada de estruturação, e adicionar as funções do painel**

Localize a função inteira criada na Task 3 (do início de `executarTranscricao` até o fechamento antes de `bindBtnTranscrever`):

```js
  async function executarTranscricao() {
    var apiKey = getApiKey();
    if (!apiKey) {
      abrirModalApiKey();
      return;
    }
    var file = document.getElementById("fAudioFile").files[0];
    var validacao = validarArquivoAudio(file);
    if (!validacao.ok) {
      mostrarStatusTranscricao(validacao.mensagem, "erro");
      return;
    }

    var btn = document.getElementById("btnTranscrever");
    btn.disabled = true;
    mostrarStatusTranscricao("Transcrevendo áudio... isso pode levar alguns instantes.", "info");

    var texto;
    try {
      texto = await chamarWhisper(file, apiKey);
    } catch (e) {
      mostrarStatusTranscricao(e.mensagem || "Erro inesperado ao transcrever o áudio.", "erro");
      btn.disabled = false;
      return;
    }

    mostrarStatusTranscricao("Transcrição concluída:\n\n" + texto, "info");
    btn.disabled = false;
  }

  function bindBtnTranscrever() {
    document.getElementById("btnTranscrever").addEventListener("click", executarTranscricao);
  }
```

Substitua por:

```js
  function normalizarItemPauta(item) {
    return {
      assunto: item && item.assunto ? String(item.assunto) : "",
      resumo: item && item.resumo ? String(item.resumo) : "",
      decisao: item && item.decisao ? String(item.decisao) : ""
    };
  }

  function normalizarPrazoSugerido(valor) {
    if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
    return "";
  }

  function normalizarPrioridadeSugerida(valor) {
    return PRIORIDADES.indexOf(valor) >= 0 ? valor : "";
  }

  function normalizarItemEncaminhamento(item) {
    return {
      tarefa: item && item.tarefa ? String(item.tarefa) : "",
      responsavel: item && item.responsavel ? String(item.responsavel) : "",
      prazo: normalizarPrazoSugerido(item && item.prazo),
      prioridade: normalizarPrioridadeSugerida(item && item.prioridade)
    };
  }

  async function chamarEstruturacao(texto, apiKey, dataReuniaoIso) {
    var promptSistema = "Você é um assistente que organiza transcrições de reuniões em atas estruturadas. " +
      "Responda EXCLUSIVAMENTE com um JSON no formato exato: " +
      '{"pauta":[{"assunto":"","resumo":"","decisao":""}],"encaminhamentos":[{"tarefa":"","responsavel":"","prazo":"","prioridade":""}]}. ' +
      "Regras: (1) 'prazo' deve ser uma data no formato AAAA-MM-DD apenas quando a reunião mencionar uma data ou prazo relativo " +
      "claramente calculável a partir da data da reunião (" + dataReuniaoIso + "); caso contrário deixe como string vazia, nunca invente uma data. " +
      "(2) 'prioridade' deve ser exatamente 'Alta', 'Média', 'Baixa' ou string vazia; nenhum outro valor. " +
      "(3) Não invente informações que não estão na transcrição.";

    var resposta;
    try {
      resposta = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: promptSistema },
            { role: "user", content: texto }
          ]
        })
      });
    } catch (e) {
      throw new TranscricaoErro("rede", "Não foi possível conectar à OpenAI para estruturar a pauta. Verifique sua internet e tente novamente.");
    }

    if (resposta.status === 401) {
      throw new TranscricaoErro("autenticacao", 'Chave de API inválida ou sem permissão. Verifique em "Configurar chave de API".');
    }
    if (!resposta.ok) {
      throw new TranscricaoErro("api", "Erro ao estruturar a pauta (código " + resposta.status + ").");
    }

    var dados;
    try {
      dados = await resposta.json();
    } catch (e) {
      throw new TranscricaoErro("estrutura", "Resposta inesperada da API ao estruturar a pauta.");
    }

    var conteudo = dados && dados.choices && dados.choices[0] && dados.choices[0].message
      ? dados.choices[0].message.content : "";

    var sugestao;
    try {
      sugestao = JSON.parse(conteudo);
    } catch (e) {
      throw new TranscricaoErro("estrutura", "Não foi possível estruturar automaticamente a pauta a partir da transcrição.");
    }

    return {
      pauta: Array.isArray(sugestao.pauta) ? sugestao.pauta.map(normalizarItemPauta) : [],
      encaminhamentos: Array.isArray(sugestao.encaminhamentos) ? sugestao.encaminhamentos.map(normalizarItemEncaminhamento) : []
    };
  }

  var sugestaoAtual = null;

  function abrirPainelRevisao(textoTranscrito, sugestao, estruturaFalhou) {
    sugestaoAtual = {
      textoTranscrito: textoTranscrito,
      estruturaFalhou: !!estruturaFalhou,
      pauta: sugestao.pauta.map(function (item) {
        return { selecionado: true, assunto: item.assunto, resumo: item.resumo, decisao: item.decisao };
      }),
      encaminhamentos: sugestao.encaminhamentos.map(function (item) {
        return { selecionado: true, tarefa: item.tarefa, responsavel: item.responsavel, prazo: item.prazo, prioridade: item.prioridade };
      })
    };
    renderPainelRevisao();
    document.getElementById("revisaoCard").hidden = false;
    document.getElementById("revisaoCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderPainelRevisao() {
    document.getElementById("transcricaoBrutaTexto").textContent = sugestaoAtual.textoTranscrito;

    var aviso = document.getElementById("revisaoAviso");
    if (sugestaoAtual.estruturaFalhou) {
      aviso.hidden = false;
      aviso.textContent = "Não foi possível estruturar automaticamente a pauta a partir da transcrição. Use o texto bruto acima para preencher manualmente.";
    } else {
      aviso.hidden = true;
    }

    var pautaBox = document.getElementById("sugestaoPautaList");
    pautaBox.innerHTML = "";
    if (!sugestaoAtual.pauta.length) {
      pautaBox.innerHTML = '<p class="empty-msg">Nenhum item de pauta sugerido.</p>';
    } else {
      sugestaoAtual.pauta.forEach(function (item, idx) {
        pautaBox.appendChild(criarBlocoSugestaoPauta(item, idx));
      });
    }

    var encBox = document.getElementById("sugestaoEncaminhamentosList");
    encBox.innerHTML = "";
    if (!sugestaoAtual.encaminhamentos.length) {
      encBox.innerHTML = '<p class="empty-msg">Nenhum encaminhamento sugerido.</p>';
    } else {
      sugestaoAtual.encaminhamentos.forEach(function (item, idx) {
        encBox.appendChild(criarBlocoSugestaoEncaminhamento(item, idx));
      });
    }
  }

  function criarCheckboxSugestao(checked, onChange) {
    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.addEventListener("change", function () { onChange(this.checked); });
    return checkbox;
  }

  function criarBlocoSugestaoPauta(item, idx) {
    var box = document.createElement("div");
    box.className = "sugestao-item";

    var header = document.createElement("div");
    header.className = "sugestao-item-header";
    header.appendChild(criarCheckboxSugestao(item.selecionado, function (checked) {
      sugestaoAtual.pauta[idx].selecionado = checked;
    }));
    var titulo = document.createElement("strong");
    titulo.textContent = "Item de pauta " + (idx + 1);
    header.appendChild(titulo);
    box.appendChild(header);

    box.appendChild(makeFieldInput("Assunto", item.assunto, function (v) { sugestaoAtual.pauta[idx].assunto = v; }, "text"));
    box.appendChild(makeFieldInput("Resumo da discussão", item.resumo, function (v) { sugestaoAtual.pauta[idx].resumo = v; }, "textarea"));
    box.appendChild(makeFieldInput("Decisão tomada", item.decisao, function (v) { sugestaoAtual.pauta[idx].decisao = v; }, "textarea"));

    return box;
  }

  function criarBlocoSugestaoEncaminhamento(item, idx) {
    var box = document.createElement("div");
    box.className = "sugestao-item";

    var header = document.createElement("div");
    header.className = "sugestao-item-header";
    header.appendChild(criarCheckboxSugestao(item.selecionado, function (checked) {
      sugestaoAtual.encaminhamentos[idx].selecionado = checked;
    }));
    var titulo = document.createElement("strong");
    titulo.textContent = "Encaminhamento " + (idx + 1);
    header.appendChild(titulo);
    box.appendChild(header);

    box.appendChild(makeFieldInput("O que fazer", item.tarefa, function (v) { sugestaoAtual.encaminhamentos[idx].tarefa = v; }, "text"));
    box.appendChild(makeFieldInput("Responsável", item.responsavel, function (v) { sugestaoAtual.encaminhamentos[idx].responsavel = v; }, "text"));

    var prazoWrap = document.createElement("div");
    prazoWrap.className = "field";
    var prazoLabel = document.createElement("label");
    var prazoId = "sugPrazo" + uid();
    prazoLabel.setAttribute("for", prazoId);
    prazoLabel.textContent = "Prazo";
    var prazoInput = document.createElement("input");
    prazoInput.type = "date";
    prazoInput.id = prazoId;
    prazoInput.value = item.prazo || "";
    prazoInput.addEventListener("input", function () { sugestaoAtual.encaminhamentos[idx].prazo = this.value; });
    prazoWrap.appendChild(prazoLabel);
    prazoWrap.appendChild(prazoInput);
    box.appendChild(prazoWrap);

    var prioWrap = document.createElement("div");
    prioWrap.className = "field";
    var prioLabel = document.createElement("label");
    var prioId = "sugPrio" + uid();
    prioLabel.setAttribute("for", prioId);
    prioLabel.textContent = "Prioridade";
    var prioSelect = document.createElement("select");
    prioSelect.id = prioId;
    var optVazia = document.createElement("option");
    optVazia.value = "";
    optVazia.textContent = "(selecione)";
    prioSelect.appendChild(optVazia);
    PRIORIDADES.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      if (item.prioridade === p) opt.selected = true;
      prioSelect.appendChild(opt);
    });
    prioSelect.addEventListener("change", function () { sugestaoAtual.encaminhamentos[idx].prioridade = this.value; });
    prioWrap.appendChild(prioLabel);
    prioWrap.appendChild(prioSelect);
    box.appendChild(prioWrap);

    return box;
  }

  function fecharPainelRevisao() {
    sugestaoAtual = null;
    document.getElementById("revisaoCard").hidden = true;
    document.getElementById("fAudioFile").value = "";
    document.getElementById("btnTranscrever").disabled = true;
  }

  function aplicarSugestoes() {
    fecharPainelRevisao();
    showStatus("Sugestões descartadas.");
  }

  function descartarSugestoes() {
    fecharPainelRevisao();
    showStatus("Sugestões descartadas.");
  }

  function bindPainelRevisaoBotoes() {
    document.getElementById("btnAplicarSugestoes").addEventListener("click", aplicarSugestoes);
    document.getElementById("btnDescartarSugestoes").addEventListener("click", descartarSugestoes);
  }

  async function executarTranscricao() {
    var apiKey = getApiKey();
    if (!apiKey) {
      abrirModalApiKey();
      return;
    }
    var file = document.getElementById("fAudioFile").files[0];
    var validacao = validarArquivoAudio(file);
    if (!validacao.ok) {
      mostrarStatusTranscricao(validacao.mensagem, "erro");
      return;
    }

    var btn = document.getElementById("btnTranscrever");
    btn.disabled = true;
    mostrarStatusTranscricao("Transcrevendo áudio... isso pode levar alguns instantes.", "info");

    var texto;
    try {
      texto = await chamarWhisper(file, apiKey);
    } catch (e) {
      mostrarStatusTranscricao(e.mensagem || "Erro inesperado ao transcrever o áudio.", "erro");
      btn.disabled = false;
      return;
    }

    mostrarStatusTranscricao("Analisando a conversa para montar a pauta...", "info");

    var sugestao;
    try {
      sugestao = await chamarEstruturacao(texto, apiKey, state.reuniao.data || hoje());
    } catch (e) {
      if (e && e.tipo === "estrutura") {
        limparStatusTranscricao();
        btn.disabled = false;
        abrirPainelRevisao(texto, { pauta: [], encaminhamentos: [] }, true);
        return;
      }
      mostrarStatusTranscricao(e.mensagem || "Erro inesperado ao estruturar a pauta.", "erro");
      btn.disabled = false;
      return;
    }

    limparStatusTranscricao();
    btn.disabled = false;
    abrirPainelRevisao(texto, sugestao, false);
  }

  function bindBtnTranscrever() {
    document.getElementById("btnTranscrever").addEventListener("click", executarTranscricao);
  }
```

- [ ] **Step 3: Ligar os botões do painel no `init()`**

Localize:

```js
    bindBtnTranscrever();

    document.getElementById("btnExemplo").addEventListener("click", carregarExemplo);
```

Substitua por:

```js
    bindBtnTranscrever();
    bindPainelRevisaoBotoes();

    document.getElementById("btnExemplo").addEventListener("click", carregarExemplo);
```

- [ ] **Step 4: Verificação manual**

Recarregue a página, com uma chave de API válida já configurada.

1. Selecione o mesmo áudio curto de teste e clique "Transcrever e sugerir pauta".
2. Observe as mensagens de status mudarem: "Transcrevendo áudio..." → "Analisando a conversa para montar a pauta..." → o painel "Sugestões da IA" aparece automaticamente, com scroll até ele.
3. Expanda "Ver transcrição bruta" → deve mostrar o texto transcrito.
4. Confira que aparecem blocos em "Itens de pauta sugeridos" (assunto/resumo/decisão, cada um com checkbox marcado e campos editáveis) e em "Encaminhamentos sugeridos" (tarefa/responsável/prazo/prioridade), coerentes com o conteúdo do áudio.
5. Desmarque um checkbox, edite um campo de texto → a edição deve ser aceita sem erro.
6. Clique "Descartar tudo" → o painel fecha, aparece o aviso "Sugestões descartadas.", e o campo de arquivo é limpo.
7. Repita a transcrição e clique "Aplicar selecionados" desta vez → por enquanto (esta tarefa ainda não liga a aplicação de verdade) o painel também deve simplesmente fechar com o aviso "Sugestões descartadas." — confirmando que o botão não trava nem gera erro. A aplicação real ao formulário é verificada na Task 5.

Resultado esperado: painel abre, exibe corretamente as sugestões, campos são editáveis, e ambos os botões fecham o painel sem erros no console.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Add GPT-based structuring and suggestion review panel

Transcription is now analyzed into pauta/encaminhamentos suggestions
and shown in a review panel with editable, checkable items. Applying
still just closes the panel — Task 5 wires it into the form state.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Aplicar sugestões selecionadas à ata

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `sugestaoAtual`, `fecharPainelRevisao()` (Task 4); `state.pauta`, `state.encaminhamentos`, `renderPauta()`, `renderEncaminhamentos()`, `agendarSalvarRascunho()`, `showStatus()` (já existentes no arquivo).
- Produces: versão final de `aplicarSugestoes()` e `descartarSugestoes()`.

- [ ] **Step 1: Substituir as funções `aplicarSugestoes` e `descartarSugestoes`**

Localize (criadas na Task 4):

```js
  function aplicarSugestoes() {
    fecharPainelRevisao();
    showStatus("Sugestões descartadas.");
  }

  function descartarSugestoes() {
    fecharPainelRevisao();
    showStatus("Sugestões descartadas.");
  }
```

Substitua por:

```js
  function aplicarSugestoes() {
    if (!sugestaoAtual) return;

    var pautaAplicada = sugestaoAtual.pauta.filter(function (i) { return i.selecionado; });
    var encAplicados = sugestaoAtual.encaminhamentos.filter(function (i) { return i.selecionado; });

    pautaAplicada.forEach(function (item) {
      state.pauta.push({ assunto: item.assunto, resumo: item.resumo, decisao: item.decisao });
    });
    encAplicados.forEach(function (item) {
      state.encaminhamentos.push({
        tarefa: item.tarefa,
        responsavel: item.responsavel,
        prazo: item.prazo,
        prioridade: item.prioridade
      });
    });

    renderPauta();
    renderEncaminhamentos();
    agendarSalvarRascunho();
    fecharPainelRevisao();
    showStatus((pautaAplicada.length + encAplicados.length) + " item(ns) aplicado(s) à ata.");
  }

  function descartarSugestoes() {
    fecharPainelRevisao();
    showStatus("Sugestões descartadas.");
  }
```

- [ ] **Step 2: Verificação manual**

Recarregue a página, com chave de API válida configurada, e comece com o formulário de pauta/encaminhamentos vazio (ou com 1 item manual já digitado, para confirmar que nada é apagado).

1. Digite manualmente um item de pauta simples (ex. assunto "Item manual de teste") antes de transcrever.
2. Transcreva o áudio curto de teste, aguarde o painel de sugestões.
3. Desmarque um dos itens sugeridos (de pauta ou de encaminhamentos) para confirmar que ele NÃO deve ser aplicado.
4. Clique "Aplicar selecionados" → o painel fecha, aparece um aviso do tipo "N item(ns) aplicado(s) à ata."
5. Role até "Pauta e discussões" → confirme que o item manual de teste continua lá, E os itens de pauta sugeridos marcados foram adicionados como novos blocos depois dele (na ordem em que apareciam no painel).
6. Role até "Encaminhamentos" → confirme que os encaminhamentos sugeridos marcados foram adicionados como novas linhas, com responsável/prazo/prioridade corretos; se o responsável sugerido não estiver na lista de participantes, ele ainda deve aparecer selecionado no dropdown (mesmo comportamento já existente para responsáveis "soltos").
7. Confirme que o item desmarcado no passo 3 NÃO aparece em lugar nenhum do formulário.
8. Recarregue a página (F5) → os itens aplicados devem persistir (fazem parte do rascunho salvo automaticamente).

Resultado esperado: aplicação seletiva funciona exatamente como descrito, sem apagar conteúdo pré-existente.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Apply selected AI suggestions to pauta and encaminhamentos

Checked suggestions are appended to existing state (never replacing
manually entered content) and persisted via the existing autosave.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Revisão final, mensagens de erro e teste ponta a ponta

**Files:**
- Modify: `index.html` (apenas se a verificação abaixo encontrar algo a corrigir)

**Interfaces:**
- Nenhuma nova — esta tarefa é de verificação e polimento do que já foi construído nas Tasks 1-5.

- [ ] **Step 1: Releitura do spec**

Abra `docs/superpowers/specs/2026-09-15-transcricao-audio-design.md` e confira, item por item, que cada requisito da seção "Interface e fluxo do usuário", "Tratamento de erros" e "Privacidade" está implementado exatamente como descrito. Anote qualquer divergência encontrada.

- [ ] **Step 2: Verificação manual end-to-end completa**

Com o servidor local rodando e uma chave de API real configurada:

1. **Fluxo feliz completo:** grave ou obtenha um áudio real de alguns minutos com uma conversa (pode ser você mesmo simulando uma reunião curta com 2-3 pautas e 1-2 combinados). Preencha "Dados da reunião" e participantes, envie o áudio, aplique as sugestões, gere a ata (botão "Gerar ata" já existente) e confira que o texto final faz sentido.
2. **Arquivo grande:** confirme novamente o bloqueio de arquivo > 25 MB.
3. **Chave inválida:** remova a chave, coloque uma inválida, tente transcrever → mensagem de erro clara, sem travar a página.
4. **Sem chave:** remova a chave completamente, tente transcrever → abre o modal de configuração automaticamente.
5. **Áudio sem fala** (grave 5 segundos de silêncio ou ruído) → deve cair no erro "Nenhum conteúdo de fala foi identificado no áudio."
6. **Descartar sugestões:** confirme que descartar não altera nada no formulário.
7. **Impressão:** clique "Gerar ata" e depois "Imprimir / Salvar em PDF" → confirme visualmente (Visualizar impressão do navegador) que as seções "Transcrição por IA" e "Sugestões da IA" NÃO aparecem na versão impressa.
8. **Tema escuro:** force o tema escuro e repita o fluxo feliz (passo 1, resumido) → confirme que o aviso de privacidade, o painel de sugestões e as mensagens de erro têm contraste e legibilidade adequados no escuro.

Corrija inline qualquer problema encontrado nos passos acima antes de prosseguir.

- [ ] **Step 3: Commit final (somente se houver correções do Step 2)**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Polish audio transcription feature after end-to-end review

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
