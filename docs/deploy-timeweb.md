# Deploy no Timeweb Cloud

O site roda pelo `Dockerfile` da raiz — o mesmo usado no Railway e no
docker-compose local. Nada no runtime é específico de host; o que muda é como as
variáveis de ambiente e o banco chegam ao container.

## 1. Postgres primeiro

O `docker-entrypoint.sh` roda `bun run db/migrate.ts` no boot com `set -e`. **Sem
um `DATABASE_URL` que conecte, o container aborta e entra em crash-loop.** Então,
antes de subir o app:

- **Opção A — Postgres gerenciado do Timeweb:** crie um cluster/banco Postgres no
  painel, pegue a connection string (host, porta, user, senha, database).
- **Opção B — container Postgres no mesmo projeto:** suba um `postgres:16-alpine`
  e use o nome do serviço como host.

A connection string tem o formato:

```
postgres://USUARIO:SENHA@HOST:5432/NOME_DO_BANCO
```

Se o Timeweb exigir SSL no Postgres gerenciado, adicione `?sslmode=require` ao
final (o driver `postgres` respeita).

## 2. Variáveis de ambiente do serviço do site

Obrigatórias:

| Var | Valor |
|---|---|
| `DATABASE_URL` | connection string do passo 1 |
| `ADMIN_PASSWORD` | senha do painel `/auth` |
| `SESSION_SECRET` | string aleatória ≥16 chars (HMAC do cookie) |
| `SITE_URL` | URL pública final, ex. `https://claros.seudominio.com` (usada nas cobranças PIX) |

Credenciais dos gateways de pagamento que forem usados (só os ativos):
`CASHINPAY_SECRET_KEY`, `PROPIX_CLIENT_ID` / `PROPIX_CLIENT_SECRET`,
`M2PAY_API_KEY`, `NOWBANKS_CLIENT_ID` / `NOWBANKS_CLIENT_SECRET`, `PIX_CHAVE`.

Opcionais:

| Var | Default | Quando mexer |
|---|---|---|
| `PORT` | `3000` | se o Timeweb exigir uma porta específica de exposição |
| `HOST` | `0.0.0.0` | não mexer |
| `ANTI_BOT_OFF` | — | `=1` só em emergência (filtro anti-bot travando algo legítimo) |

Não suba o arquivo `.env` local — ele está no `.dockerignore`. As vars vão no
painel do Timeweb.

## 3. Configuração do build no painel

- **Fonte:** este repositório, branch de produção.
- **Método de build:** Dockerfile.
- **Dockerfile path:** `Dockerfile` (raiz).
- **Build context:** raiz do repo.
- **Porta do container:** `3000` (ou o valor de `PORT` que você setar).
- **Healthcheck HTTP:** path `/api/health`, se o painel pedir. A rota retorna
  `200 {"ok":true,"db":true}` quando o banco responde, `503` quando não. O
  `Dockerfile` também tem um `HEALTHCHECK` embutido que faz o mesmo.

O serviço de redirect (`apps/redirect/`) tem deploy **separado** — outro serviço,
outro Postgres, `apps/redirect/Dockerfile`. Não faz parte deste deploy.

## 4. Primeiro deploy

1. Suba o Postgres, anote a `DATABASE_URL`.
2. Crie o serviço do site, cole todas as env vars.
3. Dispare o build. No primeiro boot os logs devem mostrar:
   ```
   → aplicando migrations...
   N migration(s) aplicada(s).
   → iniciando servidor...
   ➜ Listening on: http://localhost:3000/ (all interfaces)
   ```
4. Aponte o domínio para o serviço e ajuste `SITE_URL` se ainda não estava certo
   (requer novo deploy para propagar).

## 5. Migrations em deploys seguintes

Automáticas — todo boot roda as pendentes. Adicionar migration = novo arquivo em
`db/migrations/NNN_descricao.sql` e deploy. O runner é idempotente
(`schema_migrations`), então rebuilds sem migration nova não fazem nada.

## Troubleshooting

| Sintoma | Causa provável |
|---|---|
| Container reinicia em loop, log para em "aplicando migrations..." | `DATABASE_URL` errada / Postgres inacessível / faltou SSL |
| `503` em `/api/health`, resto do site 500 | banco caiu ou credenciais mudaram |
| Visitantes reais veem página em branco | falso positivo do anti-bot — `ANTI_BOT_OFF=1` temporário e revisar `src/lib/anti-bot.server.ts` |
| PIX gera link com domínio errado | `SITE_URL` desatualizada — corrigir e redeployar |
| Build falha em `bun install --frozen-lockfile` | `bun.lock` fora de sync com `package.json` — rodar `bun install` local e commitar |
