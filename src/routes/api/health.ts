import { createFileRoute } from "@tanstack/react-router";

/**
 * Healthcheck para o orquestrador do host (Timeweb Cloud, Railway, docker-compose...).
 *
 * `GET /api/health` → 200 `{ ok: true }` se o processo está de pé e o banco
 * responde; 503 se a query falhar. Sem auth e isento do anti-bot
 * (`PREFIXOS_ISENTOS` em `src/lib/anti-bot.server.ts`), porque o probe usa
 * UA de cliente HTTP genérico.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { sql } = await import("@/db");
          await sql`select 1`;
          return Response.json(
            { ok: true, db: true },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (erro) {
          return Response.json(
            { ok: false, db: false, erro: erro instanceof Error ? erro.message : String(erro) },
            { status: 503, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
