# claros

Projeto Vite + React + TypeScript + Tailwind + TanStack Start. Originado no [Lovable](https://lovable.dev) (ver `AGENTS.md`), mas o **deploy é por Dockerfile** (Railway, Timeweb Cloud ou docker-compose) e o **Supabase foi removido** (migrado para Postgres puro).

## Banco de dados: Postgres puro (sem Supabase)

- Cliente único: `src/db/index.ts` → `sql` (pool `Bun.sql` lazy). Helpers: `primeira()` (= `.maybeSingle()`), `pgArray()` (colunas `text[]` — `Bun.sql` não serializa array JS direto).
- Schema versionado em `db/migrations/*.sql`; runner: `bun run db:migrate` (roda no boot do Docker também).
- `DATABASE_URL` obrigatória (ver seção "Deploy" para como setar em cada host).
- Retornos ao cliente: `numeric` vira `::float8` e `date` vira `to_char(..., 'YYYY-MM-DD')` — senão chegam como string/ISO e quebram os formatadores.
- `IN` com array: `WHERE col IN ${sql(arrayJs)}` (não `= ANY(${...})`).
- Sem realtime: o dashboard usa polling (`refetchInterval`).

### Cluster gerenciado (DigitalOcean) — desde 2026-09-17

Pra não perder dados de novo se uma VPS cair/for suspensa (já aconteceu 3x com a vsys.host — ver "Suspensões vsys.host"), os bancos de produção saíram do Postgres local de cada VPS (container `db` do compose) e foram migrados pra um **cluster Postgres gerenciado da DigitalOcean** (região fra1), compartilhado com outros projetos da conta.

- **Atenção: cluster compartilhado.** Ele já tinha bancos de outros projetos (`francis`, `jhon`, `maite`, `teste`, e um `redirect` de outro produto — não confundir com o `redirect` deste projeto). Todo banco deste projeto usa prefixo **`claros_`** pra não colidir: `claros_s1`/`claros_s1_redirect` (stack 1), `claros_s2`/`claros_s2_redirect` (stack 2), `claros_s3`/`claros_s3_redirect` (stack 3), `claros_cc`/`claros_cc_redirect` (CC).
- Credencial fica só no `.env` de cada stack (`DATABASE_URL` e `REDIRECT_DATABASE_URL`, ver `.env.example`) — nunca em texto claro aqui. Formato: `postgres://doadmin:<senha>@<host-do-cluster>:25060/<banco>?sslmode=require`.
- `docker-compose.yml` de `deploy/`, `deploy2/` e `deploy3/` aceitam `DATABASE_URL`/`REDIRECT_DATABASE_URL` do `.env` como **override** — se não setadas, cai no fallback antigo (Postgres local via container `db`, montado a partir de `POSTGRES_USER`/`POSTGRES_PASSWORD`). Ou seja, é opt-in por stack, sem regressão pra quem ainda não migrou.
- Migração feita via `pg_dump`/`psql` direto de cada VPS pro cluster (dump com `--no-owner --no-privileges`; ignorar erro de `\restrict`/`\unrestrict` no início/fim do dump — são diretivas do `pg_dump` mais novo que o `psql` do cluster não reconhece, mas não interrompem a aplicação do resto do dump).
- **Pendente:** Trusted Sources do cluster ainda não restringe por IP (qualquer host consegue conectar hoje, inclusive fora das VPS) — travar pros IPs da GG (`85.137.49.103`) e CC (`178.104.129.140`) assim que possível. Ver também `[[infra-control-banco-gerenciado]]` na memória — mesma pendência já existia noutro projeto.
- Os Postgres locais (container `db` de cada stack) continuam no ar por enquanto (não foram desligados) — servem de contingência até confirmar estabilidade do cluster; descomissionar depois de um período de observação.

## Auth do painel: senha única via env

- `ADMIN_PASSWORD` (senha do `/auth`) + `SESSION_SECRET` (HMAC do cookie, ≥16 chars). Sem usuários, sem signup, sem reset por email.
- `src/lib/auth.server.ts` (`sessaoAtiva()`, `exigirAdmin()`, cookie `claros_admin`), `src/lib/auth.functions.ts` (`login`/`logout`/`verificarSessao`).
- Todo handler admin chama `exigirAdmin()` no início (antes era RLS do Supabase, que não estava versionada).

## Gateways de pagamento (multi-gateway com fallback)

- `src/lib/payment-router.server.ts` escolhe a gateway por `roteamento_config.estrategia` (`prioridade` | `rodizio` | `fixa`) e **já faz failover**: se `adaptador.criarPix()` de uma gateway lança erro, tenta a próxima ativa (ordenadas por `gateways_config.prioridade` ASC), registrando cada falha em `pagamentos_log`. Cada gateway implementa o contrato `GatewayAdapter` (`src/lib/gateways/types.ts`), registrado em `src/lib/gateways/adapters.server.ts`.
- **Toda chamada HTTP a uma API de gateway usa `fetchComTimeout` (`src/lib/gateways/http.ts`, default 15s)** — nunca `fetch` puro. Sem isso, uma gateway com a conexão travada (ex.: IP da VPS bloqueado do lado deles — já aconteceu com a CashinPay) prende o `fetch` por minutos e o fallback do router só reage depois que a atual desiste; com timeout curto, o fallback é útil de verdade (segundos, não minutos). Ao adicionar uma gateway nova ou mexer numa existente, usar `fetchComTimeout` em toda chamada de `criarPix`/`consultarStatus`.
- Gateways cadastradas hoje: `cashinpay`, `propix`, `pixzypay`, `m2pay`, `nowbanks`, `pix-estatico` (contingência sem baixa automática). Adicionar uma nova: módulo `src/lib/<gateway>.server.ts` + adaptador em `adapters.server.ts` + linha em `gateways_config` (seed via migration) + opção no `<Select>` de `src/routes/_authenticated/admin.gateways.tsx`.
- Diagnosticar "PIX não gera / fica carregando": primeiro `docker compose logs site | grep -i <gateway>` — se for `Unable to connect`/timeout, é conectividade da VPS até o host da gateway (testar com `curl -m 10 https://<api-da-gateway>` no host da VPS, e comparar com outro domínio de controle tipo `https://www.google.com` para isolar "rede da VPS" vs. "essa gateway específica bloqueando o IP"), não bug do código. Confirmar com MTR (`mtr -T -P 443 -n -c 3 <ip>`) antes de concluir bloqueio — rota íntegra até o penúltimo hop e 100% de perda só no último é a assinatura de firewall na borda do destino, não instabilidade genérica de trânsito.

### Proxy de saída (todos os gateways, nos 3 stacks) + fachada de webhook

Duas metades que juntas escondem o IP **e** o domínio real das VPS de todos os gateways de pagamento:

**1. Saída (nós → gateway): proxy Squid.** Toda chamada que a app faz a uma API de gateway (gerar PIX, consultar/confirmar status) sai por `GATEWAY_PROXY_URL` quando setada. Origem: incidente 2026-09, a CashinPay bloqueou o IP da VPS GG **antiga** (`45.134.174.96`) — TCP SYN nem respondido, confirmado por MTR (não era rede geral; outros gateways respondiam pela mesma VPS). Hoje a mitigação virou padrão permanente pra **todo** gateway (não só CashinPay), pra nunca expor o IP real.

**2. Entrada (gateway → nós): reverse proxy de webhook (domínio de fachada).** O gateway nunca recebe o domínio real; ele manda o webhook pra `metodo.emagrecersecreto.com`, que reencaminha pro stack certo. Ver "Fachada de webhook" abaixo.

> **Estado 2026-09-13:** `GATEWAY_PROXY_URL` está **setado nos 3 stacks** (GG s1, GG s2, CC), todos apontando pro mesmo proxy. IP de saída de todos = `174.138.43.153`. Validado dentro dos containers (`bun -e` com `HTTPS_PROXY` sai por esse IP). A `GATEWAY_PROXY_URL` atual é `http://gateways:<senha>@174.138.43.153:3128` (senha resetada em 2026-09-13, guardada no `.env` de cada stack).

- `src/lib/gateways/http.ts` → `fetchGateway()` é o **único** ponto de decisão proxy-vs-direto: se `proxyDisponivel()` (`GATEWAY_PROXY_URL` setada) usa `fetchViaProxy`, senão `fetchComTimeout` direto. **Todo** adapter de gateway chama `fetchGateway` — não é específico da CashinPay (o comentário antigo dizendo isso estava errado).
- `src/lib/gateways/proxy-fetch.ts`: o Bun **não respeita** `ProxyAgent`/`dispatcher` do `undici` no `fetch()` — testado e confirmado (IP de saída não muda). A única forma que funciona é `HTTPS_PROXY` como env var **do processo**, setada antes dele subir — por isso a chamada roda num subprocesso `Bun.spawn` dedicado (`fetchViaProxy`), com `HTTPS_PROXY` só no `env` daquele spawn. O worker é uma **string embutida** (`WORKER_SRC`), não um arquivo `.ts` separado — um arquivo separado não sobrevive ao bundle Vite/Nitro em produção (`Module not found`, já quebrou 4x). Exige `bun` no PATH do container (tem, é `oven/bun:1`).
- Formato do `.env`: `GATEWAY_PROXY_URL=http://usuario:senha@host:porta`. É por stack — cada `.env` decide. Vazio = fetch direto (sem regressão).

**⚠️ Importante — proxy só cobre SAÍDA.** O recebimento do webhook (gateway faz `POST` pra nós) **não** passa pelo proxy — é fisicamente impossível um forward proxy interceptar conexão que o gateway inicia. Pra esconder o domínio no webhook, é a fachada (metade 2), não o proxy.

#### O proxy Squid — `174.138.43.153` (`metodo.emagrecersecreto.com`, DigitalOcean)

Droplet "Proxy-out-in-metodo" (1 vCPU / 512MB), provedor diferente de propósito (não vsys.host). Roda **duas coisas**: o Squid (saída) **e** um Caddy (fachada de webhook, entrada).

- **Squid** (`/etc/squid/squid.conf`, porta `3128`): auth básica via `/etc/squid/passwd`, usuário `gateways`, sem cache. Firewall (`ufw`) libera a `3128` só pros IPs das VPS: `45.134.174.96` e `213.111.148.28` (GG, órfãos vsys.host), `176.97.114.185` e `85.137.49.98` (CC, órfãos vsys.host), e desde 2026-09-17 os IPs atuais `85.137.49.103` (GG, vsys.host) e `178.104.129.140` (CC, agora Hetzner) — **confirmar se já foram liberados**, senão o `fetchViaProxy` falha com conexão recusada. Adicionar origem nova: `ufw allow from <IP> to any port 3128 proto tcp`. Resetar senha: `htpasswd -b /etc/squid/passwd gateways <nova>` + `squid -k reconfigure`, e atualizar a `GATEWAY_PROXY_URL` de cada `.env`.
- **(Obsoleto)** havia um Squid antigo em `137.184.134.152` — não é mais o proxy ativo; o ativo é o `174.138.43.153`.

#### Fachada de webhook (Caddy no Droplet do proxy)

`/etc/caddy/Caddyfile` no `174.138.43.153` faz reverse proxy dos webhooks por **caminho por stack**, escondendo o domínio real. O gateway só conhece `metodo.emagrecersecreto.com`.

| Rota na fachada | Reencaminha pra (Host real) |
|---|---|
| `/s1/webhook/<slug>` | `portal.faturaclaros.com` (GG stack 1) |
| `/s2/webhook/<slug>` | `portalfaturaclaro.com` (GG stack 2) |
| `/s3/webhook/<slug>` | `faturasclaro.net` (GG stack 3) |
| `/cc/webhook/<slug>` | `minha-faturaclaro.com` (CC) |
| `/webhook/<slug>` | GG stack 1 (compat com URLs antigas) |

- Cada `handle_path` faz `rewrite * /api/public/webhooks{uri}` + `reverse_proxy https://<dominio-real>` com `header_up Host`. Path desconhecido → `respond 200` vazio (não vaza rota). Editar o Caddyfile e `systemctl reload caddy`.
- **Qual URL o gateway recebe** é decidido em `payment-router.server.ts` (~linha 315): `webhookUrl: gw.webhook_url || \`${baseUrl}/api/public/webhooks/${slug}\``. Ou seja, **a coluna `webhook_url` da tabela `gateways_config` controla isso** — se preenchida, é o que vai pro gateway; se vazia, cai no fallback com o **domínio real** (`SITE_URL`). O código relê a config a cada cobrança, então mudar a coluna vale na hora, sem reiniciar.
- **Estado 2026-09-13:** `gateways_config.webhook_url` preenchido em todos os gateways dos 3 stacks apontando pra fachada (`.../s1|s2|cc/webhook/<slug>`). Setar de novo (ex.: gateway novo): `UPDATE gateways_config SET webhook_url = 'https://metodo.emagrecersecreto.com/<prefixo>/webhook/' || slug WHERE slug <> 'pix-estatico'`.
- **Gateways sem campo de webhook no painel** (ex.: PixzyPay): recebem a URL **por transação**, no corpo do `POST /transactions` (campo `webhook_url`). É por isso que preencher `gateways_config.webhook_url` resolve pra eles também — não precisa cadastrar nada no painel do gateway.

- `cashinpay.server.ts` / demais `*.server.ts`: chamam `fetchGateway` para toda requisição HTTP (nunca `fetch` puro), então herdam o proxy automaticamente quando `GATEWAY_PROXY_URL` está setada.

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

Variáveis necessárias (o host injeta): `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `SITE_URL`, e as credenciais dos gateways em uso (`CASHINPAY_SECRET_KEY`, `PROPIX_CLIENT_ID`/`_SECRET`, `PIXZYPAY_TOKEN`, `M2PAY_API_KEY`, `NOWBANKS_*`, `PIX_CHAVE`). `HOST=0.0.0.0` já é default; `PORT` default 3000 (Railway injeta o dele; Timeweb/VPS usam o default ou sobrescrevem).

- **Railway:** `DATABASE_URL` = **Add Reference** ao serviço Postgres (`${{ Postgres.DATABASE_PRIVATE_URL }}`, mesmo ambiente).
- **Timeweb Cloud:** provisionar um Postgres (cluster gerenciado ou container) **antes do primeiro deploy** e colar a connection string em `DATABASE_URL` — sem banco, o entrypoint aborta (`set -e`) e o container fica em crash-loop. Detalhes em `docs/deploy-timeweb.md`.
- **Local:** `docker compose up --build` (lê `.env`; `.env*` fica fora da imagem via `.dockerignore`).

## VPS em produção

Duas VPS Ubuntu 24.04 (vsys.host), providas com `deploy/scripts/bootstrap-vps.sh`. Apelidos usados no dia a dia — **GG** e **CC**:

### GG — `85.137.49.103`

> **IP novo desde 2026-09-17.** 3ª suspensão da vsys.host (ver "Suspensões vsys.host" abaixo) — a GG anterior (`213.111.148.28`) caiu junto com a CC. Recriada do zero neste IP, hostname `hxxfLLNSaH`. Roda os **3 stacks** (o stack 3, `deploy3/`, foi criado no commit `ee4449f` e ainda não tinha sido implantado quando a VPS anterior caiu). Confirmar se o proxy de saída (`174.138.43.153`) já foi ajustado no firewall pra aceitar esse IP novo — a lista antiga do Squid ainda cita `213.111.148.28`.

Roda **três stacks isolados** (`deploy/` + `deploy2/` + `deploy3/`), compartilhando só o processo Postgres, o Caddy e a máquina.

| | Stack 1 (`deploy/`) | Stack 2 (`deploy2/`) | Stack 3 (`deploy3/`) |
|---|---|---|---|
| Site | `portal.faturaclaros.com` | `portalfaturaclaro.com` | `faturasclaro.net` |
| Redirect | `fatura-claro.com` | `faturaclarofacil.com` | `fatura-claro.net` |
| Bancos | `claros` / `redirect` | `claros2` / `redirect2` | `claros3` / `redirect3` |
| Containers | `claros-site-1`, `claros-redirect-1` | `claros2-site2-1`, `claros2-redirect2-1` | `claros3-site3-1`, `claros3-redirect3-1` |
| CashinPay | **ativa** (`sk_live_70ef25e3...`), via proxy | **ativa** (`sk_live_11bc78c2...`), via proxy | a configurar |
| PixzyPay | **ativa, prioridade 1** (`PIXZYPAY_TOKEN` configurado) | mesmo token do stack 1 | a configurar |

Compartilhado entre os três: `claros-db-1` (um Postgres, bancos separados — zero cruzamento de dados) e `claros-caddy-1` (roteia por domínio; as rotas do stack 2 entram via `import /etc/caddy/extra.d/*.caddy`, arquivo gerado a partir de `deploy2/Caddyfile.snippet`, e o stack 3 do mesmo jeito a partir de `deploy3/Caddyfile.snippet` — nunca editar o `Caddyfile` do stack 1 diretamente). Ver `deploy2/README.md` para o desenho completo e como plugar/desplugar um stack extra sem afetar os outros.

**Pendências do stack 3 (2026-09-17):** `deploy3/.env.example` e `deploy3/Caddyfile.snippet` ainda têm os domínios do stack 2 colados por engano no exemplo/comentário (corrigir para `faturasclaro.net`/`fatura-claro.net` antes de copiar) — o `.env` real precisa ser criado com os domínios certos. DNS dos dois domínios do stack 3 aponta para este IP novo (`85.137.49.103`).

### CC — `178.104.129.140`

> **Trocada de provedor em 2026-09-17.** Depois da 3ª suspensão da vsys.host, a tentativa de recriar a CC lá (`85.137.49.98`, hostname `7UyzhMqJBh`) ficou sem SSH acessível (timeout na porta 22) — **descartada**. A CC mudou para **Hetzner** (CPX12, `ubuntu-2gb-nbg1-2`, Nürnberg), hostname `ubuntu-2gb-nbg1-2`, IPv6 `2a01:4f8:1c0c:422e::/64`. SSH confirmado OK. Banco sobe vazio (sem backup automático entre trocas de VPS — ver "Suspensões vsys.host"). **Pendente:** liberar este IP novo no firewall do proxy de saída (`174.138.43.153`) — a lista do Squid ainda cita só IPs vsys.host antigos.

Um stack só (`deploy/`), réplica do padrão do GG.

| | |
|---|---|
| Site | `minha-faturaclaro.com` |
| Redirect | `minhafaturaclaro.com` |
| Bancos | `claros` / `redirect` |
| CashinPay | **ativa** (`sk_live_f745eb54...` + `CASHINPAY_WEBHOOK_SECRET`), via proxy — confirmar após rebuild |
| PixzyPay | não configurado (adicionar pelo painel quando houver token) |

### Proxy de saída + fachada de webhook — `174.138.43.153` (`metodo.emagrecersecreto.com`, DigitalOcean)

Droplet mínimo (1 vCPU / 512MB), provedor diferente de propósito (não vsys.host). Roda Squid (saída) **e** Caddy (fachada de webhook). **Detalhes completos na seção "Proxy de saída (todos os gateways...)" lá em cima** — config do Squid, firewall, fachada de webhook, e como o `gateways_config.webhook_url` controla a URL enviada ao gateway.

> **Ponto de falha único:** os dois lados do sigilo de gateway (saída via Squid, entrada via fachada Caddy) dependem deste Droplet. Se ele cair: a saída volta a ser direta (se `GATEWAY_PROXY_URL` continuar setada, o `fetchViaProxy` **falha** e o adapter trata como gateway indisponível → cai pro próximo gateway/PIX estático) e os webhooks param de chegar (o gateway bate num host morto). RAM baixa (~458Mi). Vale um healthcheck externo aqui.
- Proxy antigo `137.184.134.152` (Squid, usuário `claros`) está **obsoleto** — não é mais usado por nenhum stack.

### Comum aos dois

- SSH: `ssh root@<IP>` (chave `~/.ssh/id_ed25519` do operador). Deploy key própria por VPS cadastrada em Settings → Deploy keys do repo, read-only. Chaves atuais: GG `85.137.49.103` (vsys.host), CC `178.104.129.140` (Hetzner) — as anteriores (`claros-deploy-vps-gg-nova`, `claros-deploy-vps-cc-nova`, e as órfãs mais antigas `claros-deploy-vps`/`claros-deploy-vps2`) ficaram órfãs com a 3ª suspensão/troca de provedor e podem ser removidas do repo. Cada VPS usa o host alias `github-claros` no `~/.ssh/config` do root apontando pra `/root/.ssh/id_claros`.
- `ADMIN_PASSWORD` do painel `/auth`: mesma em todos os stacks hoje (`seed39646608`) — trocar por stack se precisar de isolamento de acesso.
- Nameservers dos domínios: `ns1/ns2.dyna-ns.net` (Dynadot) — mas **cuidado**: o registro DNS que importa é a zona de verdade (checar propagação com `dig @8.8.8.8`, não confiar no atalho "Dynadot DNS: IP" da listagem geral de domínios, que é só forwarding do registrador e não edita a zona).
- Runbook de contingência (DNS caiu, banco caiu, VPS inteira caiu, container caiu, gateway caiu) + scripts de backup/restore/healthcheck/bootstrap: `deploy/scripts/` e o artifact publicado (pedir o link se precisar, ou gerar de novo com `/artifacts`).
- Kill switches do anti-bot por `.env` de cada stack: `ANTI_BOT_OFF=1` (desliga tudo), `ANTI_BOT_NO_ALLOWLIST=1` (allowlist de bots legítimos desligada — modo de teste "só navegador passa, nem Googlebot/WhatsApp passam"). Estado hoje (2026-09-11, após rebuild): `ANTI_BOT_NO_ALLOWLIST=1` **e** `REDIRECT_ANTI_BOT_NO_ALLOWLIST=1` **ligados em todos os stacks** — os dois da GG e o único da CC. Conferir com `grep ANTI_BOT .env` antes de assumir — muda conforme pedido de teste.
- **Pegadinha do `PIXZYPAY_TOKEN` no `.env`:** o token tem um `|` (formato `587|UV0z...`). O `docker compose` lê o `.env` como pares literais e não se importa, mas `deploy2/scripts/criar-bancos.sh` faz `source .env` e o bash interpreta o `|` como pipe → quebra. Solução: **aspar** o valor no `.env` (`PIXZYPAY_TOKEN="587|UV0z..."`); o Compose remove as aspas e o valor chega limpo ao container. Vale aspar qualquer valor de gateway com metacaractere de shell.

### Suspensões vsys.host (2026-09-11, 2026-09-17)

CC (`176.97.114.233`) e GG (`45.134.174.96`) foram **suspensas pela vsys.host no mesmo dia** em 2026-09-11, com poucas horas de intervalo. Suspensão (não deleção): SSH/ping/HTTP todos com 100% de perda, mas o provedor não apagou os dados. Como atingiu as **duas** VPS da conta quase juntas, a causa provável é algo do lado do provedor/conta (política de conteúdo, cobrança, abuse report) e **não** falha isolada de uma VPS — investigar a causa raiz com o suporte antes de recriar de novo, senão o IP novo cai pelo mesmo motivo. Ambas foram recriadas em IPs novos (`213.111.148.28`/`176.97.114.185`). **Não há automação de restore de dados** entre a VPS suspensa e a nova: o banco novo sobe vazio.

**Terceira suspensão em 2026-09-17**: os IPs de 09-11 (`213.111.148.28` GG, `176.97.114.185` CC) também caíram — mesmo padrão (ambas as VPS da conta, sem investigação de causa raiz concluída ainda). GG recriada de novo na vsys.host: `85.137.49.103` (hostname `hxxfLLNSaH`), SSH OK. A tentativa de recriar a CC na vsys.host (`85.137.49.98`, hostname `7UyzhMqJBh`) ficou sem SSH acessível — em vez de tentar de novo no mesmo provedor, a CC **mudou para Hetzner** (`178.104.129.140`, CPX12 `ubuntu-2gb-nbg1-2`). **Causa raiz da vsys.host ainda não identificada** — três suspensões em uma semana é padrão, não acaso; vale abrir chamado formal pedindo o motivo exato, e considerar migrar a GG também se a resposta não vier (a CC já saiu). Se recuperar acesso a alguma VPS suspensa, dá pra `deploy/scripts/backup.sh` lá e `restore.sh` na nova.

## Não reescrever histórico publicado

Conforme `AGENTS.md`: sem force-push, rebase, amend ou squash de commits já enviados.
