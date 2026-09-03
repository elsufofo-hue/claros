# claros

Projeto Vite + React + TypeScript + Tailwind + TanStack Start. Originado no [Lovable](https://lovable.dev) (ver `AGENTS.md`), mas o **deploy é no Railway** e o **Supabase foi removido** (migrado para Postgres puro).

## Banco de dados: Postgres puro (sem Supabase)

- Cliente único: `src/db/index.ts` → `sql` (pool `Bun.sql` lazy). Helpers: `primeira()` (= `.maybeSingle()`), `pgArray()` (colunas `text[]` — `Bun.sql` não serializa array JS direto).
- Schema versionado em `db/migrations/*.sql`; runner: `bun run db:migrate` (roda no boot do Docker também).
- `DATABASE_URL` obrigatória. No Railway: referência ao serviço Postgres (`${{ Postgres.DATABASE_PRIVATE_URL }}` via **Add Reference**, mesmo ambiente).
- Retornos ao cliente: `numeric` vira `::float8` e `date` vira `to_char(..., 'YYYY-MM-DD')` — senão chegam como string/ISO e quebram os formatadores.
- `IN` com array: `WHERE col IN ${sql(arrayJs)}` (não `= ANY(${...})`).
- Sem realtime: o dashboard usa polling (`refetchInterval`).

## Auth do painel: senha única via env

- `ADMIN_PASSWORD` (senha do `/auth`) + `SESSION_SECRET` (HMAC do cookie, ≥16 chars). Sem usuários, sem signup, sem reset por email.
- `src/lib/auth.server.ts` (`sessaoAtiva()`, `exigirAdmin()`, cookie `claros_admin`), `src/lib/auth.functions.ts` (`login`/`logout`/`verificarSessao`).
- Todo handler admin chama `exigirAdmin()` no início (antes era RLS do Supabase, que não estava versionada).

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

## Deploy no Railway

Serviço do site: build pelo `Dockerfile` (raiz). Variáveis necessárias: `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `SITE_URL`, `PORT`/`HOST` (Railway injeta `PORT`), e as credenciais dos gateways em uso (`CASHINPAY_SECRET_KEY`, `PROPIX_CLIENT_ID`/`_SECRET`, `M2PAY_API_KEY`, `NOWBANKS_*`, `PIX_CHAVE`). Rodar `bun run db:migrate` uma vez contra o Postgres novo (o Dockerfile do site ainda **não** roda migrate automático — fazer manual ou adicionar ao CMD).

## Não reescrever histórico publicado

Conforme `AGENTS.md`: sem force-push, rebase, amend ou squash de commits já enviados.
