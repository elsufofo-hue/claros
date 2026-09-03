/**
 * Proteção anti-bot/anti-scraper (defensiva).
 *
 * Objetivo: só gente de verdade (navegador real) enxerga o site. O resto —
 * clientes HTTP genéricos, headless, UA vazio, UA que não parece navegador —
 * recebe uma página em branco (HTTP 200 sem conteúdo). Não é 403: o bot não
 * "sabe" que foi barrado, só vê um documento vazio, tipo about:blank.
 *
 * Três camadas, nesta ordem:
 *   1. Denylist explícita de UA (spy tools de SEO, curl, scrapy...) → tela branca.
 *   2. Allowlist de bots legítimos (Googlebot, Bingbot, previews de link do
 *      WhatsApp/Telegram/redes) → passam, porque o robots.txt já os autoriza
 *      nas páginas públicas e os previews de fatura/checkout dependem disso.
 *   3. Heurística "parece navegador?": precisa ter "Mozilla/" + engine conhecida
 *      (Chrome/Safari/Firefox/Gecko/Edg/OPR) e NÃO ser headless. Senão → tela branca.
 *
 * Rate limit por IP (janela deslizante em memória) segue como 429 explícito —
 * excesso de requisições é abuso, não "bot vs. humano", e o Retry-After ajuda
 * clientes legítimos que só surtaram.
 *
 * Isenções: webhooks das gateways (/api/public/webhooks/*), assets estáticos e
 * caminhos internos — chamadas server-to-server não têm UA de navegador.
 *
 * Emergência (falso positivo travando algo legítimo): ANTI_BOT_OFF=1 no ambiente.
 */

const ANTI_BOT_DESATIVADO = process.env.ANTI_BOT_OFF === "1";

/**
 * Quando `1`, a allowlist de bots legítimos (buscadores + previewers) é
 * ignorada — Googlebot, WhatsApp, facebookexternalhit etc. passam a cair na
 * heurística de navegador como qualquer outro. Útil para testar o filtro sem
 * abrir exceção. Não afeta a denylist nem a heurística.
 */
const ANTI_BOT_SEM_ALLOWLIST = process.env.ANTI_BOT_NO_ALLOWLIST === "1";

/** Camada 1 — UA que é explicitamente ferramenta de raspagem/scan. Tela branca. */
const UA_DE_BOT =
  /(ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|bytespider|serpstatbot|dataforseobot|zoominfobot|backlinkcrawler|rogerbot|screaming ?frog|sitebulb|sistrix|blexbot|linkdexbot|spyfu|seokicks|megaindex|dnsresearch|domainstatsbot|nimbostratus|barkrowler|semanticbot|awariobot|magpie-crawler|dataprovider|netcraftsurveyagent|curl|wget|python-requests|python-urllib|python-httpx|aiohttp|scrapy|go-http-client|okhttp|libwww-perl|lwp::simple|httpclient|apache-httpclient|java\/|jakarta|node-fetch|axios\/|got \(|undici|guzzlehttp|http_request2|winhttp|zgrab|masscan|nmap|nikto|sqlmap|dirbuster|gobuster|ffuf|feroxbuster|nuclei|wpscan|acunetix|nessus|openvas|qualys|censys|shodan|httrack|wget|phantomjs|slimerjs|headlesschrome|electron\/)/i;

/**
 * Camada 2 — bots que DEVEM passar: buscadores autorizados no robots.txt e
 * previewers de link (o preview do /fatura/... no WhatsApp/Telegram depende disso).
 * Bate no UA antes da heurística de navegador.
 */
const UA_BOT_LEGITIMO =
  /(googlebot|google-inspectiontool|bingbot|bingpreview|applebot|duckduckbot|yandex(bot|images|mobilebot)|baiduspider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|slackbot|slack-imgproxy|pinterest(bot|\/)|redditbot|skypeuripreview|vkshare|w3c_validator|chrome-lighthouse|google page ?speed|gtmetrix)/i;

/**
 * Camada 3 — heurística de navegador real. Precisa começar com "Mozilla/5.0",
 * ter uma engine de browser conhecida, e não anunciar headless/automação.
 */
const UA_NAVEGADOR = /^mozilla\/5\.0 .*(applewebkit|gecko\/|trident\/)/i;
const UA_ENGINE_BROWSER = /(chrome\/|crios\/|safari\/|firefox\/|fxios\/|edg(a|ios)?\/|opr\/|samsungbrowser\/|ucbrowser\/|yabrowser\/)/i;
const UA_HEADLESS = /(headless|puppeteer|playwright|selenium|webdriver|phantomjs|slimerjs|cypress|bot|crawler|spider|scraper|preview|http-client|dataminr)/i;

const ASSET = /\.(js|mjs|css|map|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|txt|xml|json)$/i;

const PREFIXOS_ISENTOS = [
  "/api/public/webhooks", // gateways chamam com UA de servidor
  "/api/health", // healthcheck do host (Timeweb/Railway/compose) usa UA de cliente HTTP
  "/.well-known",
  "/_",
  "/__",
  "/@",
];

const JANELA_MS = 60_000;
const LIMITE_POR_IP = 120;
const MAX_IPS_RASTREADOS = 20_000;

const contagens = new Map<string, number[]>();

function podar(ip: string, agora: number) {
  const marcas = contagens.get(ip);
  if (!marcas) return;
  const vivas = marcas.filter((t) => agora - t < JANELA_MS);
  if (vivas.length === 0) contagens.delete(ip);
  else contagens.set(ip, vivas);
}

if (typeof setInterval === "function") {
  const varredura = setInterval(() => {
    const agora = Date.now();
    for (const ip of contagens.keys()) podar(ip, agora);
  }, 5 * 60_000);
  varredura.unref?.();
}

export function ipDoCliente(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "desconhecido";
  return request.headers.get("x-real-ip") ?? "desconhecido";
}

function isento(pathname: string): boolean {
  if (ASSET.test(pathname)) return true;
  return PREFIXOS_ISENTOS.some((prefixo) => pathname.startsWith(prefixo));
}

/**
 * Tela branca: HTTP 200 com um documento HTML vazio. Para o bot é
 * indistinguível de uma página que simplesmente não renderizou nada.
 */
function telaBranca(): Response {
  return new Response(
    "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>",
    {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    },
  );
}

function respostaDeBloqueio(status: number, mensagem: string, retryAfterSeg?: number): Response {
  const headers: Record<string, string> = {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  };
  if (retryAfterSeg) headers["retry-after"] = String(retryAfterSeg);
  return new Response(mensagem, { status, headers });
}

/**
 * true = o UA passa no teste de "pessoa real ou bot legítimo autorizado".
 * false = tela branca.
 */
export function pareceHumano(ua: string): boolean {
  if (!ua) return false;
  if (UA_DE_BOT.test(ua)) return false;
  if (!ANTI_BOT_SEM_ALLOWLIST && UA_BOT_LEGITIMO.test(ua)) return true;
  if (!UA_NAVEGADOR.test(ua)) return false;
  if (!UA_ENGINE_BROWSER.test(ua)) return false;
  if (UA_HEADLESS.test(ua)) return false;
  return true;
}

/**
 * Roda no topo do handler de fetch (src/server.ts), antes de qualquer rota.
 * Retorna a Response de bloqueio (tela branca 200 / 429) ou null para seguir.
 */
export function filtrarBots(request: Request): Response | null {
  if (ANTI_BOT_DESATIVADO) return null;

  const url = new URL(request.url);
  if (isento(url.pathname)) return null;

  const ua = request.headers.get("user-agent") ?? "";
  if (!pareceHumano(ua)) {
    return telaBranca();
  }

  if (contagens.size > MAX_IPS_RASTREADOS) contagens.clear();

  const ip = ipDoCliente(request);
  const agora = Date.now();
  podar(ip, agora);

  const marcas = contagens.get(ip) ?? [];
  if (marcas.length >= LIMITE_POR_IP) {
    return respostaDeBloqueio(429, "Muitas requisições. Tente novamente em instantes.", 60);
  }
  marcas.push(agora);
  contagens.set(ip, marcas);

  return null;
}
