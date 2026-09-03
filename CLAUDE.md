# claros

Projeto Vite + React + TypeScript + Tailwind + TanStack Start. Originado no [Lovable](https://lovable.dev) (ver `AGENTS.md`), mas o **deploy é por Dockerfile** (Railway, Timeweb Cloud ou docker-compose) e o **Supabase foi removido** (migrado para Postgres puro).

## Banco de dados: Postgres puro (sem Supabase)

- Cliente único: `src/db/index.ts` → `sql` (pool `Bun.sql` lazy). Helpers: `primeira()` (= `.maybeSingle()`), `pgArray()` (colunas `text[]` — `Bun.sql` não serializa array JS direto).
- Schema versionado em `db/migrations/*.sql`; runner: `bun run db:migrate` (roda no boot do Docker também).
- `DATABASE_URL` obrigatória (ver seção "Deploy" para como setar em cada host).
- Retornos ao cliente: `numeric` vira `::float8` e `date` vira `to_char(..., 'YYYY-MM-DD')` — senão chegam como string/ISO e quebram os formatadores.
- `IN` com array: `WHERE col IN ${sql(arrayJs)}` (não `= ANY(${...})`).
- Sem realtime: o dashboard usa polling (`refetchInterval`).

## Auth do painel: senha única via env

- `ADMIN_PASSWORD` (senha do `/auth`) + `SESSION_SECRET` (HMAC do cookie, ≥16 chars). Sem usuários, sem signup, sem reset por email.
- `src/lib/auth.server.ts` (`sessaoAtiva()`, `exigirAdmin()`, cookie `claros_admin`), `src/lib/auth.functions.ts` (`login`/`logout`/`verificarSessao`).
- Todo handler admin chama `exigirAdmin()` no início (antes era RLS do Supabase, que não estava versionada).

## Anti-bot / anti-scraper (defensivo)

- `src/lib/anti-bot.server.ts` roda no topo do `src/server.ts` (todas as requisições). Política: **só navegador real passa**. `filtrarBots()` / `pareceHumano(ua)` decidem em 3 camadas:
  1. Denylist de UA (spy tools SEO, curl/wget/python-requests/scrapy, scanners) → **página em branco** (HTTP 200, `<html><body></body></html>` vazio — não 403, o bot não sabe que foi barrado).
  2. Allowlist de bots legítimos (Googlebot, Bingbot, Applebot, `facebookexternalhit`, `WhatsApp`, `TelegramBot`, Discord/Slack/LinkedIn previewers...) → passam, porque o `robots.txt` os autoriza e os previews de link de `/fatura` dependem disso.
  3. Heurística de navegador: exige `^Mozilla/5.0 ...(AppleWebKit|Gecko/|Trident/)` **e** engine (`Chrome/Safari/Firefox/Edg/OPR/SamsungBrowser/...`) **e** não-headless. Senão → página em branco.
- Rate limit segue como **429 explícito** (com `Retry-After`): >120 req/min por IP, janela deslizante de 60s em memória — abuso de volume não é "bot vs. humano".
- Isenções: `/api/public/webhooks/*` (gateways chamam com UA de servidor), assets estáticos, `/.well-known`, `/_*`, `/@*` (internos).
- `X-Robots-Tag: noindex, nofollow` em `/api`, `/fatura` e `/auth` (função `comCabecalhoRobots` no `src/server.ts`); `public/robots.txt` proíbe spy tools e esconde esses caminhos dos crawlers.
- Kill switch de emergência (falso positivo): `ANTI_BOT_OFF=1` no ambiente.
- **O redirect (`apps/redirect/src/anti-bot.ts`) usa a mesma política** (mesmas regexes de UA, mesma página em branco); isenta `/healthz` e `/_admin`. Kill switch: `REDIRECT_ANTI_BOT_OFF=1`.
- A página em branco é a mesma resposta para todo mundo que não passa — **não é cloaking** (não servimos conteúdo *diferente* por visitante; servimos *nada*). Nunca servir conteúdo alternativo para bots/moderação.

## Runtime: Bun

Gerenciador de pacotes **e** runtime de execução é o **Bun** (não Node/npm).

- Instalar deps: `bun install` (lockfile: `bun.lock`; não há `package-lock.json`)
- Rodar scripts: `bun run <script>` / `bun dev`
- Build: `bun run build` → Vite + Nitro com **preset `bun`** (`vite.config.ts` → `nitro: { preset: "bun" }`), gera `.output/`
  - **Pegadinha local:** se houver Node <20 no PATH (ex.: nvm), `bun run build` delega o `vite` pra esse Node e quebra com `styleText`/`node:util`. Rode `bun --bun run build` para forçar o runtime bun. No Docker (`oven/bun:1`) não há Node no PATH, então `bun run build` já usa bun.
- Servidor SSR de produção: `bun run .output/server/index.mjs` (script `start`)
- Docker: `Dockerfile` multi-stage sobre `oven/bun:1`; `NITRO_PRESET=bun` no estágio de build
- O `bunfig.toml` tem `minimumReleaseAge = 86400` (guard de supply-chain de 24h) — `bun install` na primeira vez é lento porque checa a data de publicação de cada pacote. Novas exceções a esse guard vão em `minimumReleaseAgeExcludes` **só após confirmar com o usuário**.

## Conta do GitHub — trocar antes de operações remotas

Este repo pertence à conta **`elsufofo-hue`** (`https://github.com/elsufofo-hue/claros`, privado), **não** à conta padrão `Ryukaii` usada nos outros projetos.

A identidade de autoria já está fixada nesta pasta via `git config --local` (`elsufofo-hue`), então commits locais não precisam de ajuste. Mas o credential helper do `gh` autentica com a **conta ativa global**, que normalmente é `Ryukaii` — e ela não enxerga este repo privado.

**Antes de qualquer `git push`, `git pull`, `git fetch` ou comando `gh` neste repo:**

```bash
gh auth switch --user elsufofo-hue
```

**Ao terminar, restaurar a conta padrão:**

```bash
gh auth switch --user Ryukaii
```

Se um `git fetch`/`push` falhar com `Repository not found` ou `could not read Password`, é quase certo que a conta ativa está errada — rode o `gh auth switch --user elsufofo-hue` e tente de novo.

## Monorepo (workspaces Bun)

- Raiz: o site (não movido para `apps/web`).
- `apps/redirect/`: serviço de redirect independente (domínio único → destino), Postgres próprio, deploy separado no Railway (`apps/redirect/Dockerfile`). Ver `apps/redirect/README.md`.

## Deploy (Dockerfile portátil)

Build pelo `Dockerfile` da raiz — roda em qualquer host que aceite Dockerfile (Railway, Timeweb Cloud, VPS com docker-compose). O `docker-entrypoint.sh` **aplica as migrations pendentes no boot** (`bun run db/migrate.ts`, idempotente via `schema_migrations`) e então sobe o SSR. `HEALTHCHECK` embutido bate em `GET /api/health` (rota pública, isenta do anti-bot; testa o banco com `select 1`).

Variáveis necessárias (o host injeta): `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `SITE_URL`, e as credenciais dos gateways em uso (`CASHINPAY_SECRET_KEY`, `PROPIX_CLIENT_ID`/`_SECRET`, `M2PAY_API_KEY`, `NOWBANKS_*`, `PIX_CHAVE`). `HOST=0.0.0.0` já é default; `PORT` default 3000 (Railway injeta o dele; Timeweb/VPS usam o default ou sobrescrevem).

- **Railway:** `DATABASE_URL` = **Add Reference** ao serviço Postgres (`${{ Postgres.DATABASE_PRIVATE_URL }}`, mesmo ambiente).
- **Timeweb Cloud:** provisionar um Postgres (cluster gerenciado ou container) **antes do primeiro deploy** e colar a connection string em `DATABASE_URL` — sem banco, o entrypoint aborta (`set -e`) e o container fica em crash-loop. Detalhes em `docs/deploy-timeweb.md`.
- **Local:** `docker compose up --build` (lê `.env`; `.env*` fica fora da imagem via `.dockerignore`).

## Não reescrever histórico publicado

Conforme `AGENTS.md`: sem force-push, rebase, amend ou squash de commits já enviados.
