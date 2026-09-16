# Portal "IA na Prática" — Design

Data: 2026-09-16

## Contexto e objetivo

Portal de trilhas de treinamento em IA para alunos que já concluíram uma
avaliação DISC (em outro sistema). Cada aluno recebe um link único
personalizado; o portal monta um Plano de Ação de desenvolvimento tendencioso
para IA (recomenda trilhas de IA que atacam os pontos fracos do perfil DISC
do aluno) e dá acesso a 6+ trilhas de vídeo com progresso rastreável.

O conteúdo (temas/trilhas e o mapeamento DISC → recomendações) precisa ser
editável sem mexer em código.

## Restrições que moldam o design

- Site 100% estático, vanilla HTML/CSS/JS, sem build step, hospedado no
  Cloudflare Pages (ou qualquer hosting estático).
- Sem backend, sem banco de dados real — logo, sem servidor para persistir
  gravações feitas pelo navegador.
- Fluxo de deploy de conteúdo já existente do autor: editar arquivo →
  redeploy manual (FTP/Cloudflare), igual aos outros projetos do repositório.

Essas restrições eliminam a opção de um "banco de alunos" vivo no servidor:
qualquer coisa que precise estar disponível para todos os alunos sem
depender do navegador de cada um só pode vir de um arquivo estático versionado
(`config.json`) ou do próprio link que o aluno recebe.

## Arquitetura

Duas fontes de dado, com responsabilidades diferentes:

1. **`config.json`** — conteúdo, editável pelo admin, mesmo para todos os
   alunos. Contém os temas/trilhas e o mapeamento DISC → recomendações.
   Mudanças exigem redeploy (fluxo manual já existente do autor).
2. **Token no link (`#/t=<base64>`)** — dado por aluno: nome, email, DISC,
   senha. Gerado uma vez (na aba "Gerar Acesso" do admin) a partir do JSON de
   resultado DISC. Não requer redeploy nenhum — o link funciona assim que é
   gerado, independente do estado do site publicado.

Não existe uma "lista de alunos" central. Cada aluno só existe (a) no token
do link que ele recebeu, e (b) no cache local (`localStorage`) do navegador
onde ele acessou o link pela primeira vez, usado só para permitir login por
email+senha em visitas seguintes *nesse mesmo navegador* e para guardar o
progresso das trilhas.

**Consequência aceita**: login por email/senha só funciona no navegador onde
o aluno usou o link originalmente pela primeira vez. Em outro dispositivo,
ele precisa do link de novo. Isso é uma limitação conhecida de um site sem
backend e foi validada com o autor durante o brainstorming.

**Segurança do token — expectativa realista**: o token é Base64 (ofuscação),
não criptografia. Qualquer pessoa com o link consegue decodificar e ler
nome/email/DISC no console do navegador. Adequado para o caso de uso (acesso
individual a conteúdo de treinamento, não dado de alto risco), mas isso deve
ficar documentado no README para não sugerir uma garantia de segurança que
não existe.

## Modelo de dados

### `config.json`

```json
{
  "temas": [
    {
      "id": 1,
      "nome": "IA Generativa & Prompting",
      "descricao": "Aprenda a usar IA generativa para criar conteúdo, ideias e soluções.",
      "icone": "⚡",
      "videos": [
        { "titulo": "Introdução a Prompting", "link": "https://..." },
        { "titulo": "Técnicas avançadas de prompt", "link": "https://..." }
      ],
      "competenciasDesenvolvidas": ["Comunicação com IA", "Escrita estruturada"]
    }
  ],
  "mapeamentoDisc": {
    "D": {
      "pontosFracos": ["Empatia", "Escuta ativa", "Paciência"],
      "temasRecomendados": [2, 5, 6],
      "mensagem": "Como D você é direto e orientado a resultado. Use IA para entender pessoas e situações antes de agir."
    },
    "I": { "pontosFracos": [], "temasRecomendados": [], "mensagem": "" },
    "S": { "pontosFracos": [], "temasRecomendados": [], "mensagem": "" },
    "C": { "pontosFracos": [], "temasRecomendados": [], "mensagem": "" }
  }
}
```

(estrutura de `I`, `S`, `C` é idêntica à de `D` — omitida acima por brevidade)

- `temas` é uma lista aberta (não fixa em 6) — admin pode adicionar/remover.
- `temasRecomendados` referencia `temas[].id`.
- Seed inicial: 6 temas de exemplo cobrindo IA Generativa/Prompting,
  Automação (Make/Zapier/n8n), IA em Vendas, IA em RH/Recrutamento, Análise
  de Dados com IA, e Produtividade Pessoal com IA — com 2 vídeos de exemplo
  cada (links de placeholder) e competências preenchidas.

### Token do aluno (payload antes de codificar em Base64)

```json
{
  "nome": "João Silva",
  "email": "joao@example.com",
  "senha": "Xk9pL2mQ",
  "disc": { "D": 80, "I": 40, "S": 30, "C": 20 },
  "geradoEm": "2026-09-16T00:00:00.000Z"
}
```

- Perfil dominante = maior valor entre D/I/S/C (empate: ordem D > I > S > C).
- `senha` gerada aleatoriamente (8 caracteres alfanuméricos) no momento da
  geração do link, mostrada ao admin junto com o link para repassar ao aluno.
- Token = `base64(JSON.stringify(payload))`, colocado em
  `index.html#/t=<token>`. Uso de `#` (não querystring) evita que o token
  vá parar em logs de servidor.

### `localStorage` do aluno (por navegador)

- `edusia_aluno_<email>`: cópia do payload do token + `progresso` (mapa
  `temaId -> [índices de vídeos assistidos]`).
- `edusia_sessao`: email do aluno logado atualmente (sessão ativa).

### JSON de entrada (resultado DISC, colado na aba "Gerar Acesso")

```json
{
  "nome": "João Silva",
  "email": "joao@example.com",
  "disc": { "D": 80, "I": 40, "S": 30, "C": 20 }
}
```

`link_unico` do briefing original é substituído pelo token — não é mais um
campo de entrada, é o output desse processo.

## Fluxos

### Fluxo do admin: gerar acesso de um aluno

1. Admin abre `admin.html` → aba "Gerar Acesso".
2. Cola o JSON de resultado DISC do aluno.
3. Sistema valida campos obrigatórios (nome, email, disc.D/I/S/C numéricos).
   Em caso de JSON inválido ou campo faltando, mostra erro específico
   (qual campo) sem travar a tela.
4. Sistema gera senha aleatória, monta o token, monta a URL completa.
5. Tela mostra: link pronto (botão copiar), email, senha — prontos para
   admin repassar ao aluno (WhatsApp/email, fora do escopo do sistema).

### Fluxo do aluno: primeiro acesso

1. Aluno abre o link recebido.
2. `script.js` detecta `#/t=` na URL, decodifica o token.
   - Token ausente ou corrompido (JSON.parse falha) → tela de erro amigável
     ("link inválido, entre em contato com..."), com opção de ir para tela
     de login normal.
3. Salva o payload em `localStorage` (chave por email) e marca sessão ativa.
4. Redireciona para o dashboard.

### Fluxo do aluno: acessos seguintes

1. Aluno abre a URL base (sem token) → tela de login (email + senha).
2. Sistema busca `edusia_aluno_<email>` no localStorage; compara senha.
   - Não encontrado ou senha errada → mensagem de erro genérica ("email ou
     senha inválidos"), sem revelar qual dos dois está errado.
3. Sucesso → marca sessão ativa → dashboard.

### Dashboard do aluno

- Perfil DISC dominante calculado a partir de `disc` salvo.
- Gráfico DISC visual (barras simples, CSS/SVG — sem lib externa).
- Plano de Ação: monta a partir de `config.json.mapeamentoDisc[perfil]`
  (pontos fracos, mensagem) + trilhas recomendadas em ordem de prioridade
  (`temasRecomendados` primeiro, demais temas depois, todos exibidos).
- Cada trilha: card com ícone, nome, descrição, lista de vídeos
  (checkbox "assistido" grava em `progresso` no localStorage), contador
  "x de y assistidos", botão "Assistir" abre o link do vídeo em nova aba.
- Botão "Baixar Plano de Ação em PDF" → jsPDF (CDN) gera PDF com: perfil,
  pontos de desenvolvimento, trilhas priorizadas com prioridade numerada,
  tempo estimado (soma de vídeos × duração estimada fixa, ou contagem de
  vídeos se duração não for rastreada), meta de prazo (30 dias, fixo).

### Painel Admin — abas "Temas" e "Mapeamento DISC"

- Carrega `config.json` (fetch local) para um estado em memória.
- Aba Temas: formulário por tema (nome, ícone, descrição, vídeos
  adicionar/remover, competências); botão "Adicionar tema".
- Aba Mapeamento DISC: formulário por perfil D/I/S/C (pontos fracos,
  temas recomendados — multi-select dos temas existentes, mensagem).
- Botão global "Baixar config.json": serializa o estado em memória e
  dispara download do arquivo — autor substitui manualmente no projeto e
  redeploya. (Alternativa "salvar automaticamente" não existe porque não há
  servidor para gravar o arquivo.)
- Sem persistência entre sessões do admin além do que está no
  `config.json` carregado — se ele recarregar a página sem baixar,
  perde as edições não salvas. Isso é aceitável para uma ferramenta de
  edição pontual e será avisado na UI ("lembre-se de baixar antes de sair").

## Tratamento de erros

- JSON de entrada inválido (admin): erro inline, específico por campo.
- Token de link corrompido/ausente: tela de erro + caminho alternativo
  (login manual).
- Login incorreto: mensagem genérica, sem enumerar usuários válidos.
- `config.json` ausente/corrompido ao carregar o portal: mensagem de erro
  visível ("conteúdo não pôde ser carregado") em vez de tela em branco.
- Geração de PDF falha (raro, lib não carregou): mensagem de erro com opção
  de tentar novamente, sem quebrar o resto da página.

## Estrutura de entrega

```
index.html      # portal do aluno (login, dashboard, trilhas)
admin.html      # painel admin (Temas / Mapeamento DISC / Gerar Acesso)
config.json     # temas + mapeamentoDisc (dados de exemplo, 6 temas)
script.js       # lógica do portal (token, auth, dashboard, progresso, PDF)
admin.js        # lógica do admin (edição, geração de link, download)
style.css       # visual azul/branco/cinza, responsivo
README.md       # como editar temas, gerar acesso, integrar, hospedar,
                # limitações de segurança/persistência, JSONs de exemplo
```

Bibliotecas externas: apenas `jsPDF` via CDN (cdnjs), carregada com `<script>`
antes do `script.js`. Nenhuma outra dependência.

## Testes / verificação

Sem framework de testes automatizados (não faz parte do escopo de um site
estático simples) — verificação manual cobrindo:

- Gerar acesso a partir de um JSON de exemplo válido e um inválido (aba
  Gerar Acesso do admin).
- Abrir o link gerado em navegador limpo → cai direto no dashboard.
- Fechar e reabrir a URL base → login por email/senha funciona.
- Marcar vídeos como assistidos, recarregar a página → progresso mantido.
- Editar um tema no admin, baixar `config.json`, substituir o arquivo,
  recarregar o portal → mudança refletida.
- Gerar PDF do Plano de Ação para os 4 perfis DISC (D, I, S, C) e conferir
  conteúdo.
- Testar layout em mobile (largura ~375px) e desktop.

## Fora de escopo (explicitamente)

- Qualquer backend, API ou banco de dados real.
- Sincronização de progresso entre dispositivos diferentes do mesmo aluno.
- Autenticação de admin (o painel fica atrás de uma URL não-divulgada,
  como pedido no briefing — sem senha própria).
- Encurtador de link (mitigação futura para o token longo, não construída
  agora).
