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
- **O painel admin tem login próprio** — proteja `SESSION_SECRET` e a senha
  do admin como qualquer outra credencial.

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

## Testes automatizados

A lógica pura (token, senha, cálculo de perfil DISC, priorização de
trilhas) tem testes automatizados com o runner nativo do Node.js (requer
Node 18+):

```bash
npm test
# equivalente a: node --test
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
