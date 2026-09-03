import { lerConfig, salvarConfig } from "./db.ts";
import { paginaAdmin } from "./admin-page.ts";
import { filtrarBots } from "./anti-bot.ts";

const PORT = Number(process.env["PORT"] ?? 8080);
const HOST = process.env["HOST"] ?? "0.0.0.0";
const ADMIN_TOKEN = process.env["REDIRECT_ADMIN_TOKEN"] ?? "";

/**
 * Cache curto do destino pra não bater no banco a cada request.
 * Um redirect quente pode receber muito tráfego; 10s de TTL é suficiente
 * pra manter a troca "quase imediata" sem derrubar o Postgres.
 */
const CACHE_TTL_MS = 10_000;
let cache: { destino: string; statusCode: number; expira: number } | null = null;

async function destinoAtual() {
  const agora = Date.now();
  if (cache && cache.expira > agora) return cache;
  const cfg = await lerConfig();
  if (!cfg) {
    cache = null;
    return null;
  }
  cache = {
    destino: cfg.destino,
    statusCode: cfg.status_code,
    expira: agora + CACHE_TTL_MS,
  };
  return cache;
}

function tokenValido(req: Request): boolean {
  if (!ADMIN_TOKEN) return false;
  const url = new URL(req.url);
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const query = url.searchParams.get("token");
  const cookie = req.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith("redirect_admin="))
    ?.slice("redirect_admin=".length);
  const fornecido = header || query || cookie || "";
  // comparação de tamanho constante
  if (fornecido.length !== ADMIN_TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < fornecido.length; i++) {
    diff |= fornecido.charCodeAt(i) ^ ADMIN_TOKEN.charCodeAt(i);
  }
  return diff === 0;
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req) {
    const url = new URL(req.url);

    // Só navegador de verdade (ou bot legítimo) passa; o resto vê página em branco.
    const bloqueio = filtrarBots(req);
    if (bloqueio) return bloqueio;

    // Health check (Railway)
    if (url.pathname === "/healthz") {
      try {
        const d = await destinoAtual();
        return Response.json({
          ok: true,
          configurado: Boolean(d),
          destino: d?.destino ?? null,
        });
      } catch (err) {
        return Response.json(
          { ok: false, erro: String(err instanceof Error ? err.message : err) },
          { status: 503 },
        );
      }
    }

    // ---- Área admin ----
    if (url.pathname === "/_admin") {
      if (!ADMIN_TOKEN) {
        return new Response(
          "REDIRECT_ADMIN_TOKEN não configurada — área admin desativada.",
          { status: 503 },
        );
      }
      if (!tokenValido(req)) {
        return new Response("Não autorizado. Use ?token=… ou header Authorization.", {
          status: 401,
        });
      }

      if (req.method === "POST") {
        // Parse manual do corpo urlencoded. `req.formData()` do Bun quebra com
        // ERR_FORMDATA_PARSE_ERROR quando um proxy à frente (Caddy) reescreve o
        // Content-Type ou recomprime o corpo; URLSearchParams não depende disso.
        const ct = req.headers.get("content-type") ?? "";
        let destino = "";
        let statusCode = 302;
        try {
          if (ct.includes("application/x-www-form-urlencoded") || ct === "") {
            const params = new URLSearchParams(await req.text());
            destino = (params.get("destino") ?? "").trim();
            statusCode = Number(params.get("status_code") ?? 302);
          } else {
            const form = await req.formData();
            destino = String(form.get("destino") ?? "").trim();
            statusCode = Number(form.get("status_code") ?? 302);
          }
        } catch (err) {
          console.error("[_admin] falha ao ler o formulário:", err);
          return new Response(
            paginaAdmin({ erro: "Não foi possível ler o formulário. Tente novamente." }),
            { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
          );
        }
        if (!/^https?:\/\//i.test(destino)) {
          return new Response(paginaAdmin({ erro: "Destino precisa começar com http:// ou https://" }), {
            status: 400,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        if (![301, 302, 307, 308].includes(statusCode)) {
          return new Response(paginaAdmin({ erro: "Status code inválido." }), {
            status: 400,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        const salvo = await salvarConfig(destino, statusCode);
        cache = null; // invalida o cache imediatamente
        return new Response(
          paginaAdmin({
            config: salvo,
            ok: `Destino atualizado para ${salvo.destino} (${salvo.status_code}).`,
          }),
          { headers: { "content-type": "text/html; charset=utf-8" } },
        );
      }

      const cfg = await lerConfig();
      return new Response(paginaAdmin({ config: cfg }), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // ---- Redirect (qualquer outro path) ----
    let d;
    try {
      d = await destinoAtual();
    } catch (err) {
      console.error("erro lendo destino:", err);
      return new Response("Serviço temporariamente indisponível.", { status: 503 });
    }
    if (!d) {
      return new Response(
        "Nenhum destino configurado. Acesse /_admin?token=… para definir.",
        { status: 503 },
      );
    }

    // Preserva query string e path do acesso original, se houver.
    const alvo = new URL(d.destino);
    if (url.search && !alvo.search) alvo.search = url.search;

    return new Response(null, {
      status: d.statusCode,
      headers: {
        location: alvo.toString(),
        "cache-control": d.statusCode === 301 || d.statusCode === 308
          ? "public, max-age=3600"
          : "no-store",
      },
    });
  },
});

console.log(`redirect no ar em http://${server.hostname}:${server.port}`);
console.log(ADMIN_TOKEN ? "admin: /_admin (token exigido)" : "admin: desativado (defina REDIRECT_ADMIN_TOKEN)");
