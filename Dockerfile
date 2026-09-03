# claros - produção (Bun + TanStack Start + Nitro preset `bun`)
# Portátil para qualquer host que rode Dockerfile: Railway, Timeweb Cloud,
# docker-compose local. O host injeta as env vars (DATABASE_URL, ADMIN_PASSWORD,
# SESSION_SECRET, SITE_URL, credenciais de gateway) e, se quiser, sobrescreve PORT.
FROM oven/bun:1 AS build

WORKDIR /app

# Vite, TanStack Start e a config Lovable são necessários no build, então
# instalamos todas as dependências (incluindo devDependencies).
ENV NODE_ENV=production
ENV NITRO_PRESET=bun

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY . .

# Vite lê automaticamente os valores VITE_* do .env, se presente.
RUN bun run build

FROM oven/bun:1 AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# App buildado + o que o runner de migrations precisa (db/, src/db/, e o
# pacote `postgres` de node_modules).
COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/db ./db
COPY --from=build /app/src/db ./src/db
COPY --from=build /app/node_modules/postgres ./node_modules/postgres
COPY --from=build /app/docker-entrypoint.sh ./docker-entrypoint.sh

EXPOSE 3000

# Healthcheck embutido (hosts que fazem deploy por Dockerfile puro, sem compose,
# respeitam isto). Usa o runtime bun da própria imagem — não depende de curl/wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD bun -e "fetch(\`http://127.0.0.1:\${process.env.PORT||3000}/api/health\`).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Aplica migrations pendentes e sobe o servidor.
CMD ["sh", "./docker-entrypoint.sh"]
