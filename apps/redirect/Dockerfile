# claros/redirect — serviço de redirect (Bun + Postgres via Bun.sql)
FROM oven/bun:1 AS runtime

WORKDIR /app

# Sem dependências externas (usa Bun.sql nativo e APIs do Bun).
# Copiamos só o que o serviço precisa.
COPY apps/redirect/package.json ./package.json
COPY apps/redirect/src ./src
COPY apps/redirect/migrations ./migrations

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

EXPOSE 8080

# Roda as migrations pendentes e sobe o servidor.
CMD ["sh", "-c", "bun src/migrate.ts && bun src/server.ts"]
