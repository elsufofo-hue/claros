# @claros/redirect

Serviço de redirect independente. **Um domínio → um destino.** Quem acessar
qualquer path do domínio configurado recebe um `302` (por padrão) para o destino.

O destino fica num **Postgres próprio** (não o Supabase do site), então dá pra
trocar sem redeploy — pela tela `/_admin` ou direto no banco.

## Rodar local

```sh
# na raiz do monorepo
bun install

# precisa de um Postgres; aponte DATABASE_URL para ele
export DATABASE_URL="postgres://user:pass@localhost:5432/redirect"
export REDIRECT_ADMIN_TOKEN="um-token-secreto"

bun run redirect:dev          # ou: bun run --cwd apps/redirect dev
```

Primeiro boot aplica `migrations/001_init.sql` automaticamente (o `Dockerfile`
roda `bun src/migrate.ts` antes de subir; local, o `dev` não roda — rode
`bun run --cwd apps/redirect migrate` uma vez).

## Endpoints

| Rota | O quê |
|---|---|
| `/*` (qualquer path) | redireciona para o destino configurado. Preserva a query string. |
| `/_admin?token=…` | tela HTML pra ver/editar o destino e o status code (301/302/307/308). Exige `REDIRECT_ADMIN_TOKEN`. |
| `/healthz` | JSON de status; usado pelo healthcheck do Railway. |

## Anti-bot (filtro de user-agent)

`src/anti-bot.ts` roda no topo do `fetch`: só passa quem tem UA de navegador
real (`Mozilla/5.0` + engine conhecida, sem headless) ou está na allowlist de
bots legítimos (Googlebot, Bingbot, previews de link do WhatsApp/Telegram...).
Todo o resto — `curl`, `python-requests`, scrapers, UA vazio — recebe uma
**página em branco** (HTTP 200 sem conteúdo), não um 403.

`/healthz` e `/_admin` são isentos. Kill switch: `REDIRECT_ANTI_BOT_OFF=1`.

## Variáveis de ambiente

| Var | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | string de conexão do Postgres do redirect. No Railway, referencie o serviço Postgres. |
| `REDIRECT_ADMIN_TOKEN` | pra usar `/_admin` | token de acesso à tela admin. Sem ela, `/_admin` responde 503. |
| `PORT` | não | porta HTTP (Railway injeta; default 8080). |
| `HOST` | não | default `0.0.0.0`. |
| `REDIRECT_ANTI_BOT_OFF` | não | `=1` desliga o filtro anti-bot (emergência/falso positivo). |

## Deploy no Railway

1. Novo **serviço** no mesmo projeto, apontando para este repo.
2. **Root Directory:** deixe na raiz; **Dockerfile Path:** `apps/redirect/Dockerfile`
   (o Dockerfile copia só `apps/redirect/`).
3. Adicione um **Postgres** ao projeto e, nas Variables do serviço de redirect,
   referencie `DATABASE_URL` do Postgres.
4. Defina `REDIRECT_ADMIN_TOKEN`.
5. Aponte o DNS desejado para o domínio gerado pelo Railway (Settings → Networking).

O cache do destino é de 10s — uma troca no `/_admin` propaga em até 10 segundos.
