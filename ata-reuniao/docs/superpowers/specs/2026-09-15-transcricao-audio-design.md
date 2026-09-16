# Transcrição de áudio por IA — Gerador de Ata de Reunião

**Data:** 2026-09-15
**Status:** Aprovado para planejamento de implementação

## Contexto

O "Gerador de Ata de Reunião" (`index.html`) é hoje uma aplicação 100% client-side,
sem internet e sem bibliotecas externas, com todos os dados em `localStorage`.
Esta funcionalidade adiciona upload de um arquivo de áudio da reunião, transcrição
automática desse áudio e uso da transcrição para sugerir automaticamente itens de
pauta e encaminhamentos.

Isso introduz uma exceção deliberada e explícita à regra original de "sem
internet": a transcrição e a estruturação da pauta dependem de duas chamadas à
API da OpenAI, usando uma chave de API fornecida e controlada pelo próprio
usuário. Todo o restante do aplicativo (dados salvos, atas geradas, backup/
restauração) continua funcionando 100% localmente, sem qualquer chamada de rede.

## Objetivo

Permitir que o usuário grave/tenha um áudio da reunião, envie esse arquivo ao
app, e receba sugestões de pauta e encaminhamentos já estruturados, que ele
revisa e aplica seletivamente ao formulário existente — sem perder controle
editorial sobre o conteúdo final da ata.

## Fora de escopo (decidido explicitamente no brainstorming)

- Áudios maiores que ~25 MB (limite da API Whisper): não há divisão em pedaços
  (chunking) nesta versão. O app apenas valida o tamanho e orienta o usuário a
  comprimir/cortar o áudio.
- Armazenamento do arquivo de áudio original: não é guardado em lugar nenhum,
  nem em `localStorage` nem em IndexedDB. É usado apenas na memória durante o
  processamento e descartado depois.
- Armazenamento do texto bruto da transcrição após a sessão de revisão: só o
  que o usuário efetivamente aplicar (pauta/encaminhamentos) é persistido, do
  mesmo jeito que os outros dados da ata.
- Preenchimento automático de participantes: a IA não adiciona nomes à lista de
  participantes; apenas pode referenciar um nome como responsável sugerido em
  um encaminhamento (mesmo comportamento que já existe hoje para um responsável
  "solto" que não está na lista de participantes).
- Qualquer tipo de estimativa de custo/consumo da API dentro do app. O usuário
  acompanha uso e cobrança diretamente no painel da OpenAI.
- Suporte a outros provedores de transcrição/IA (Groq, Google, modelos locais
  via WASM). Fica só a OpenAI nesta versão.

## Arquitetura

Continua um único arquivo `index.html` (HTML + CSS + JS), sem dependências
externas — as únicas chamadas de rede são `fetch()` diretamente para a API da
OpenAI, feitas pelo próprio navegador do usuário.

Três blocos lógicos novos dentro do mesmo `<script>` já existente:

1. **`apiKeyStore`** — obtém, salva e limpa a chave de API da OpenAI em
   `localStorage` (chave própria, ex. `ataReuniao.openaiApiKey`), e controla o
   modal de configuração da chave.
2. **`transcricaoIA`** — orquestra o fluxo de transcrição: valida o arquivo,
   chama a API de transcrição (Whisper), chama a API de estruturação (Chat
   Completions), e retorna um objeto de resultado ou lança um erro tipado.
3. **`revisaoSugestoes`** — renderiza o painel de revisão (transcrição bruta +
   itens sugeridos com checkboxes editáveis) e aplica os itens selecionados ao
   `state.pauta` e `state.encaminhamentos` existentes, por meio das mesmas
   funções de render já usadas pelo formulário principal.

Nenhuma mudança é necessária no modelo de dados persistido (`state.pauta` e
`state.encaminhamentos` já têm exatamente os campos precisados: assunto/resumo/
decisao e tarefa/responsavel/prazo/prioridade).

## Interface e fluxo do usuário

Nova seção no formulário, entre "Dados da reunião" e "Participantes":

**"Transcrição por IA"**
- Texto curto explicando a funcionalidade e o aviso de privacidade (ver
  seção Privacidade).
- Botão "Configurar chave de API da OpenAI" (abre modal para colar/atualizar/
  remover a chave; mostra se já há uma chave configurada, sem exibi-la em
  texto puro).
- Campo de upload de arquivo (`accept="audio/*"`).
- Botão "Transcrever e sugerir pauta" (desabilitado até haver um arquivo
  selecionado).

Fluxo ao clicar em "Transcrever e sugerir pauta":

1. Se não há chave de API configurada → abre o modal de configuração e
   interrompe o fluxo até haver uma chave salva.
2. Valida o tamanho do arquivo (≤ 25 MB). Se exceder, mostra erro e para.
3. Mostra estado de carregamento: "Transcrevendo áudio... isso pode levar
   alguns instantes." Botão fica desabilitado durante o processamento.
4. Chama a API de transcrição (Whisper) com o arquivo e idioma português.
5. Ao obter o texto, atualiza o estado de carregamento: "Analisando a
   conversa para montar a pauta..."
6. Chama a API de Chat Completions pedindo a estruturação em JSON (pauta e
   encaminhamentos), usando o texto transcrito como entrada.
7. Abre o painel "Sugestões da IA" com:
   - Área recolhível com o texto bruto transcrito (só leitura, para
     conferência).
   - Lista de itens de pauta sugeridos (assunto/resumo/decisão), cada um com
     checkbox marcado por padrão e campos editáveis.
   - Lista de encaminhamentos sugeridos (tarefa/responsável/prazo/
     prioridade), mesma lógica de checkbox + edição.
   - Botões "Aplicar selecionados" e "Descartar tudo".
8. Ao aplicar: os itens marcados são adicionados ao final de `state.pauta` e
   `state.encaminhamentos` (nunca substituem o que já existia), o formulário
   principal é re-renderizado, e o rascunho é salvo normalmente (mesmo
   mecanismo de autosave já existente). O painel de revisão é então fechado e
   seu conteúdo (transcrição bruta, sugestões não aplicadas) é descartado.

## Integração com a API da OpenAI

- **Transcrição:** `POST https://api.openai.com/v1/audio/transcriptions`,
  `multipart/form-data` com `file` (o áudio), `model=whisper-1`,
  `language=pt`, cabeçalho `Authorization: Bearer <chave>`.
- **Estruturação:** `POST https://api.openai.com/v1/chat/completions`,
  `model=gpt-4o-mini`, `response_format={"type":"json_object"}`, uma mensagem
  de sistema instruindo o modelo a devolver exclusivamente um JSON no formato
  `{"pauta":[{"assunto":"","resumo":"","decisao":""}], "encaminhamentos":
  [{"tarefa":"","responsavel":"","prazo":"","prioridade":""}]}`, e a
  transcrição como mensagem do usuário. Campos que a IA não conseguir inferir
  (ex. prazo não mencionado) devem vir como string vazia. Restrições exigidas
  no prompt e reforçadas no código (normalização defensiva antes de exibir a
  revisão, ignorando/limpando qualquer valor fora do esperado):
  - `prazo`: deve ser uma data no formato `AAAA-MM-DD` (mesmo formato usado
    pelo campo de data do app) quando a reunião mencionar uma data ou prazo
    relativo claramente resolvível (ex. "até sexta que vem", com base na data
    da reunião); caso contrário, string vazia. A IA não deve adivinhar uma
    data quando não há como calculá-la com confiança.
  - `prioridade`: deve ser exatamente `"Alta"`, `"Média"`, `"Baixa"` ou string
    vazia — nenhum outro valor. Qualquer valor fora desse conjunto é tratado
    pelo app como string vazia (equivalente a "(selecione)").
- Ambas as chamadas usam a mesma chave de API configurada pelo usuário.

## Tratamento de erros

| Situação | Comportamento |
|---|---|
| Sem chave de API configurada | Abre modal de configuração antes de prosseguir |
| Arquivo de áudio > 25 MB | Bloqueia com mensagem explicando o limite e sugerindo comprimir/cortar |
| Chave inválida / erro de autenticação da API | Mensagem clara ("Chave de API inválida ou sem permissão. Verifique em Configurar chave.") |
| Sem internet / falha de rede / timeout | Mensagem clara com opção de tentar novamente, sem perder o arquivo selecionado |
| Resposta da API de estruturação não é um JSON válido | Não trava o app: mostra a transcrição bruta para cópia manual, com aviso de que não foi possível estruturar automaticamente |
| Transcrição vazia ou sem fala identificável | Mensagem informando que nada de aproveitável foi identificado no áudio |

Em nenhum caso um erro nesta seção deve afetar ou apagar dados já preenchidos
no restante do formulário.

## Privacidade

Aviso fixo e visível na seção "Transcrição por IA", antes do botão de
transcrever:

> "Ao transcrever, o áudio e o texto da reunião são enviados aos servidores
> da OpenAI usando sua chave de API."

A chave de API nunca é enviada a nenhum destino além da própria API da
OpenAI, nunca é gravada no código-fonte, e fica salva apenas no
`localStorage` do navegador do usuário — mesmo tratamento de dado sensível
local que o restante do app já dá aos dados da ata.

## Testes

Sem framework automatizado neste projeto (consistente com o restante do
app). Verificação manual no navegador cobrindo:

- Configurar/atualizar/remover a chave de API.
- Transcrever um áudio real curto (poucos minutos) e revisar as sugestões
  geradas.
- Aplicar seletivamente parte dos itens sugeridos e confirmar que somam aos
  itens já existentes sem apagar nada.
- Descartar as sugestões sem aplicar nada.
- Arquivo acima de 25 MB → mensagem de erro correta.
- Chave inválida (simulada) → mensagem de erro correta.
- Simular resposta malformada da IA (se necessário, via mock temporário) →
  fallback para transcrição bruta funciona.
