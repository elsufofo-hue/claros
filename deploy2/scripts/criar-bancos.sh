#!/usr/bin/env bash
# Cria os bancos claros2 e redirect2 no Postgres que já roda no stack
# original (container claros-db-1). Idempotente.
#
# Uso: deploy2/scripts/criar-bancos.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"
[[ -f .env ]] || { echo "faltou deploy2/.env — copie de .env.example primeiro"; exit 1; }

# shellcheck disable=SC1091
set -a; source .env; set +a

SITE_DB="${SITE_DB:-claros2}"
REDIRECT_DB="${REDIRECT_DB:-redirect2}"
PG_USER="${POSTGRES_USER:?defina POSTGRES_USER no .env — mesmo valor do stack original}"

echo "criando bancos '$SITE_DB' e '$REDIRECT_DB' no container claros-db-1..."

docker exec claros-db-1 psql -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 <<SQL
SELECT 'CREATE DATABASE $SITE_DB'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$SITE_DB')\gexec

SELECT 'CREATE DATABASE $REDIRECT_DB'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$REDIRECT_DB')\gexec
SQL

echo "ok. bancos disponíveis:"
docker exec claros-db-1 psql -U "$PG_USER" -d postgres -tAc "select datname from pg_database where datistemplate = false"
