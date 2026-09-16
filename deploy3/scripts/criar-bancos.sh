#!/usr/bin/env bash
# Cria os bancos claros3 e redirect3 no Postgres que já roda no stack
# original (container claros-db-1). Idempotente.
#
# Uso: deploy3/scripts/criar-bancos.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"
[[ -f .env ]] || { echo "faltou deploy3/.env — copie de .env.example primeiro"; exit 1; }

# shellcheck disable=SC1091
set -a; source .env; set +a

SITE_DB="${SITE_DB:-claros3}"
REDIRECT_DB="${REDIRECT_DB:-redirect3}"
PG_USER="${POSTGRES_USER:?defina POSTGRES_USER no .env — mesmo valor do stack original}"

echo "criando bancos '$SITE_DB' e '$REDIRECT_DB' no container claros-db-1..."

# `\gexec` só funciona em sessão interativa do psql — via -c/heredoc não
# interativo ele é lido como SQL literal e quebra. Checar em shell e criar
# direto é o jeito que funciona nos dois modos.
for db in "$SITE_DB" "$REDIRECT_DB"; do
  existe="$(docker exec claros-db-1 psql -U "$PG_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname = '$db'")"
  if [[ "$existe" == "1" ]]; then
    echo "  $db já existe"
  else
    docker exec claros-db-1 psql -U "$PG_USER" -d postgres -c "CREATE DATABASE $db"
    echo "  $db criado"
  fi
done

echo "ok. bancos disponíveis:"
docker exec claros-db-1 psql -U "$PG_USER" -d postgres -tAc "select datname from pg_database where datistemplate = false"
