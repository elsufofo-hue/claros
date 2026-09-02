# claros

Projeto Vite + React + TypeScript + Tailwind, backend Supabase. Originado no [Lovable](https://lovable.dev) (ver `AGENTS.md`), mas o **deploy é no Railway**.

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

## Não reescrever histórico publicado

Conforme `AGENTS.md`: sem force-push, rebase, amend ou squash de commits já enviados — o Lovable sincroniza a branch conectada e o usuário perde histórico.
