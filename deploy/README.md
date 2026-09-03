# Deploy numa VPS (Ubuntu 24.04 + Docker)

Roda **tudo** num servidor só: site (`claros`), serviço de redirect, Postgres
(um servidor, dois bancos) e um reverse proxy Caddy que resolve HTTPS sozinho.

```
Internet ─443─▶ caddy ─┬─▶ site:3000      (banco: claros)
                       └─▶ redirect:8080  (banco: redirect)
                              │
                           db:5432  (postgres:16, volume db-data)
```

Só o Caddy publica portas (80/443). Os outros containers ficam na rede interna.

---

## 1. Provisionar a VPS

- **SO:** Ubuntu 24.04 LTS.
- **Chave SSH:** cole sua pública (`~/.ssh/id_ed25519.pub`) no painel do provedor.
- **Recursos:** 2 vCPU / 2 GB RAM / 20 GB disco dão folga. O build do site
  (`vite build`) é o pico de memória — com 1 GB pode faltar; se faltar, veja
  "Build sem memória" no fim.

## 2. Apontar o DNS **antes** de subir

O Caddy pede os certificados no primeiro acesso a cada domínio — o DNS já
precisa resolver para o IP da VPS, senão o Let's Encrypt falha.

Crie dois registros **A** apontando para o IP da VPS:

| Nome | Tipo | Valor |
|---|---|---|
| `claros.seudominio.com` (o site) | A | IP da VPS |
| `ir.seudominio.com` (o redirect) | A | IP da VPS |

Confirme a propagação: `dig +short claros.seudominio.com` deve devolver o IP.

## 3. Preparar o servidor

```sh
ssh root@IP_DA_VPS

# Docker + plugin compose (script oficial)
curl -fsSL https://get.docker.com | sh
docker compose version   # confirma que o plugin veio junto

# Firewall
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable

# Swap de 2 GB (evita OOM no build; pule se a VPS já tem >=4 GB RAM)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 4. Clonar o repo

O repo é privado, da conta `elsufofo-hue`. Duas opções:

**a) Deploy key (recomendado)** — gere uma chave na VPS e cadastre em
GitHub → repo → Settings → Deploy keys (read-only):

```sh
ssh-keygen -t ed25519 -f ~/.ssh/claros_deploy -N ""
cat ~/.ssh/claros_deploy.pub   # cole isto em Deploy keys
cat >> ~/.ssh/config <<'EOF'
Host github-claros
  HostName github.com
  User git
  IdentityFile ~/.ssh/claros_deploy
EOF
git clone git@github-claros:elsufofo-hue/claros.git
```

**b) HTTPS com Personal Access Token** — `git clone https://TOKEN@github.com/elsufofo-hue/claros.git`.

## 5. Configurar e subir

```sh
cd claros/deploy
cp .env.example .env

# Gere os segredos:
openssl rand -hex 24   # -> POSTGRES_PASSWORD
openssl rand -hex 24   # -> SESSION_SECRET
openssl rand -hex 24   # -> REDIRECT_ADMIN_TOKEN

nano .env   # preencha TUDO: domínios, e-mail do TLS, senhas, ADMIN_PASSWORD,
            # a(s) credencial(is) de gateway em uso

docker compose up -d --build
```

Primeiro boot: o Postgres cria os bancos `claros` e `redirect`, cada serviço
aplica suas migrations, o Caddy pega os certificados. Acompanhe:

```sh
docker compose logs -f
```

Pronto quando você vê `2 migration(s) aplicada(s)` (site), `1 migration(s)
aplicada(s)` (redirect) e o Caddy sem erro de ACME.

## 6. Verificar

```sh
curl -sI https://claros.seudominio.com/api/health   # 200
curl -s  https://claros.seudominio.com/api/health   # {"ok":true,"db":true}

# anti-bot: UA de bot recebe página em branco (~76 bytes), navegador recebe o site
curl -s -A "curl/8" https://claros.seudominio.com/ | wc -c            # ~76
curl -s -A "Mozilla/5.0 ... Safari/605.1.15" https://claros.seudominio.com/ | wc -c   # milhares
```

## 7. Configurar o destino do redirect

```
https://ir.seudominio.com/_admin?token=SEU_REDIRECT_ADMIN_TOKEN
```

Tela HTML para definir destino e status code (301/302/307/308).

---

## Operação

### Atualizar (deploy de nova versão)

```sh
cd claros
git pull
cd deploy
docker compose up -d --build
```

Migrations pendentes aplicam sozinhas no boot. Zero-downtime não é garantido
(o container reinicia); para o volume de tráfego do projeto, o blip de segundos
é aceitável.

### Logs

```sh
docker compose logs -f site
docker compose logs -f redirect
docker compose logs --tail=100 caddy
```

### Backup do banco

```sh
# dump dos dois bancos
docker compose exec db pg_dumpall -U claros > backup-$(date +%F).sql

# restaurar
cat backup-2026-09-03.sql | docker compose exec -T db psql -U claros
```

Agende no cron (`crontab -e`):

```
0 4 * * * cd /root/claros/deploy && docker compose exec -T db pg_dumpall -U claros | gzip > /root/backups/claros-$(date +\%F).sql.gz
```

### Reiniciar um serviço

```sh
docker compose restart site
```

### Parar tudo

```sh
docker compose down          # mantém os volumes (dados do banco, certs)
docker compose down -v       # APAGA os volumes — só se quiser zerar
```

---

## Troubleshooting

| Sintoma | Causa / correção |
|---|---|
| Caddy loga `obtaining certificate: ... DNS problem` | o DNS do domínio ainda não aponta para a VPS, ou porta 80/443 fechada no firewall |
| `site` reinicia, log para em "aplicando migrations..." | `DATABASE_URL` (montada no compose) não conecta — confira `POSTGRES_PASSWORD` igual nos dois lugares; `docker compose logs db` |
| Visitantes reais veem página em branco | falso positivo do anti-bot — `ANTI_BOT_OFF=1` no `.env`, `docker compose up -d`, e revise `src/lib/anti-bot.server.ts` |
| Redirect sempre em branco | idem, `REDIRECT_ANTI_BOT_OFF=1` |
| PIX gera link com domínio errado | `SITE_DOMAIN` errado no `.env` (vira `SITE_URL=https://...`) — corrija e `up -d` |
| **Build sem memória** (`vite build` morre / `Killed`) | ative o swap (passo 3) ou faça o build local e suba a imagem: `docker save` / `docker load`, ou use um registry |
| Precisa acessar o Postgres de fora | **não exponha a porta**; use `docker compose exec db psql -U claros` ou um túnel SSH: `ssh -L 5432:localhost:5432 root@IP` + `docker compose port db 5432` |
