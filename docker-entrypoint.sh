#!/bin/sh
# Roda as migrations pendentes e então sobe o servidor SSR.
# `db:migrate` é idempotente (schema_migrations), seguro rodar em todo boot.
set -e

echo "→ aplicando migrations..."
bun run db/migrate.ts

echo "→ iniciando servidor..."
exec bun run .output/server/index.mjs
