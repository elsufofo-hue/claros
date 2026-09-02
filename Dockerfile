# claros - produção (Bun + TanStack Start + Nitro preset `bun`)
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

COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

CMD ["bun", "run", ".output/server/index.mjs"]
