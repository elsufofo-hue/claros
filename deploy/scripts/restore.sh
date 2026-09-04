#!/usr/bin/env bash
# Restaura um dump feito por backup.sh (pg_dumpall) para o Postgres do stack.
#
# Uso:
#   deploy/scripts/restore.sh /root/backups/claros-20260904-120000.sql.gz
#
# ATENÇÃO: sobrescreve os bancos atuais. Faça um backup antes se houver dúvida.
set -euo pipefail

FILE="${1:?uso: restore.sh <arquivo.sql.gz>}"
[[ -f "$FILE" ]] || { echo "arquivo não encontrado: $FILE"; exit 1; }

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DEPLOY_DIR"

echo "Isto vai SOBRESCREVER os bancos claros e redirect com $FILE"
read -rp "digite 'restaurar' para confirmar: " ok
[[ "$ok" == "restaurar" ]] || { echo "cancelado."; exit 1; }

# Para o site/redirect pra ninguém escrever durante o restore.
docker compose stop site redirect

# pg_dumpall inclui DROP/CREATE DATABASE, então psql no banco 'postgres' basta.
gunzip -c "$FILE" | docker compose exec -T db psql -U claros -d postgres

docker compose start site redirect
echo "restore concluído. Confira: curl -s https://portal.faturaclaros.com/api/health"
