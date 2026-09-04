# claros — segundo stack (isolado, mesma VPS)

Um segundo par site+redirect, com domínios, bancos e `.env` próprios,
rodando **na mesma VPS** do stack principal (`../deploy/`). Compartilha, de
propósito, só o processo Postgres e o Caddy — nada de dados cruza.

```
                    ┌────────────────────────────┐
Internet ─443─▶ caddy (../deploy) ─┬─▶ site:3000       banco claros
                                   ├─▶ redirect:8080    banco redirect
                                   ├─▶ site2:3000        banco claros2
                                   └─▶ redirect2:8080    banco redirect2
                                          │
                                       db:5432  (postgres:16, container único)
```

## Pré-requisito

O stack em `../deploy/` já precisa estar de pé — é ele quem sobe o Postgres
(`claros-db-1`) e o Caddy que este stack reaproveita.

## Instalar

```sh
cd deploy2
cp .env.example .env
nano .env
# preencha: SITE_DOMAIN, REDIRECT_DOMAIN, POSTGRES_USER/PASSWORD (os MESMOS
# do ../deploy/.env — é o mesmo Postgres), ADMIN_PASSWORD, SESSION_SECRET,
# REDIRECT_ADMIN_TOKEN, credenciais de gateway

./scripts/criar-bancos.sh          # cria claros2 + redirect2 no Postgres existente
docker compose up -d --build       # sobe site2 + redirect2 na rede claros_interna
```

## Plugar no Caddy compartilhado

O Caddyfile principal (`../deploy/Caddyfile`) importa qualquer `.caddy` de
`../deploy/extra.d/` — por padrão essa pasta está vazia (não afeta o stack 1).

```sh
sed -e 's/__SITE2_DOMAIN__/portalfaturaclaro.com/' \
    -e 's/__REDIRECT2_DOMAIN__/faturaclarofacil.com/' \
    Caddyfile.snippet > ../deploy/extra.d/claros2.caddy

cd ../deploy
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

O Caddy emite os certificados Let's Encrypt na hora — só funciona se o DNS
dos dois domínios já apontar para o IP desta VPS **sem proxy/CDN na frente**
(o desafio HTTP-01 precisa bater direto na porta 80 do Caddy).

## Verificar

```sh
curl -s https://portalfaturaclaro.com/api/health
curl -sI https://faturaclarofacil.com/ | head -1
docker compose ps          # site2, redirect2
```

## Desativar (sem afetar o stack 1)

```sh
rm ../deploy/extra.d/claros2.caddy
cd ../deploy && docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
cd ../deploy2 && docker compose down     # para site2/redirect2; bancos continuam no volume do Postgres
```

## Isolamento — o que é separado, o que é compartilhado

| | Separado | Compartilhado |
|---|---|---|
| Banco de dados | bancos `claros2`/`redirect2` (schemas e linhas próprios) | processo Postgres (container `db`), CPU/RAM dele |
| Variáveis de ambiente | `.env` próprio deste diretório | — |
| Containers da app | `site2`, `redirect2` | — |
| Proxy/TLS | bloco de rota próprio (`extra.d/claros2.caddy`) | processo Caddy, certificados de outros domínios no mesmo volume `caddy-data` |
| Rede Docker | — | `claros_interna` |
| Máquina | — | a VPS inteira (CPU, RAM, disco, IP) |

Se algum dia precisar de isolamento total (até do Postgres/Caddy), a
alternativa é subir noutra VPS — ver `../deploy/README.md`.
