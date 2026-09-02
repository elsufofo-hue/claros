# Fatura Fácil - produção (Node + TanStack Start + Nitro)
FROM node:22-bookworm-slim AS build

WORKDIR /app

# Keep production mode, but explicitly install devDependencies because Vite,
# TanStack Start and the Lovable Vite config are required to build the app.
ENV NODE_ENV=production
ENV NITRO_PRESET=node-server

COPY package*.json ./
COPY bun.lock ./
RUN npm install --include=dev --no-audit --no-fund

COPY . .

# Vite automatically reads VITE_* values from the .env copied above.
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV NITRO_PRESET=node-server
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
