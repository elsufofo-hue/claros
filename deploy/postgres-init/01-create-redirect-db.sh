#!/bin/sh
# Roda uma única vez, no primeiro boot do container do Postgres (quando o
# volume db-data ainda está vazio). Cria o segundo banco, usado pelo serviço
# de redirect. O banco `claros` já é criado pelo entrypoint via POSTGRES_DB.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-SQL
	SELECT 'CREATE DATABASE redirect'
	WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'redirect')\gexec
SQL

echo "banco 'redirect' pronto."
