/**
 * Filtro anti-bot do serviço de redirect.
 *
 * Mesma política do site principal: só navegador de verdade (ou bot legítimo
 * conhecido) segue para o redirect. O resto recebe uma página em branco
 * (HTTP 200 sem conteúdo) — não um 403, pra não sinalizar que existe filtro.
 *
 * `/healthz` e `/_admin` são isentos: o healthcheck do Railway usa UA de
 * servidor e o admin já é protegido por token.
 *
 * Emergência: REDIRECT_ANTI_BOT_OFF=1 no ambiente desliga tudo.
 */

const DESATIVADO = process.env["REDIRECT_ANTI_BOT_OFF"] === "1";

/** Ferramentas de raspagem/scan explícitas → tela branca. */
const UA_DE_BOT =
  /(ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|bytespider|serpstatbot|dataforseobot|zoominfobot|backlinkcrawler|rogerbot|screaming ?frog|sitebulb|sistrix|blexbot|linkdexbot|spyfu|seokicks|megaindex|barkrowler|semanticbot|awariobot|magpie-crawler|dataprovider|netcraftsurveyagent|curl|wget|python-requests|python-urllib|python-httpx|aiohttp|scrapy|go-http-client|okhttp|libwww-perl|lwp::simple|httpclient|apache-httpclient|java\/|jakarta|node-fetch|axios\/|got \(|undici|guzzlehttp|winhttp|zgrab|masscan|nmap|nikto|sqlmap|dirbuster|gobuster|ffuf|feroxbuster|nuclei|wpscan|acunetix|nessus|openvas|qualys|censys|shodan|httrack|phantomjs|slimerjs|headlesschrome|electron\/)/i;

/** Buscadores e previewers de link autorizados → passam. */
const UA_BOT_LEGITIMO =
  /(googlebot|google-inspectiontool|bingbot|bingpreview|applebot|duckduckbot|yandex(bot|images|mobilebot)|baiduspider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|slackbot|slack-imgproxy|pinterest(bot|\/)|redditbot|skypeuripreview|vkshare)/i;

const UA_NAVEGADOR = /^mozilla\/5\.0 .*(applewebkit|gecko\/|trident\/)/i;
const UA_ENGINE_BROWSER =
  /(chrome\/|crios\/|safari\/|firefox\/|fxios\/|edg(a|ios)?\/|opr\/|samsungbrowser\/|ucbrowser\/|yabrowser\/)/i;
const UA_HEADLESS =
  /(headless|puppeteer|playwright|selenium|webdriver|phantomjs|slimerjs|cypress|bot|crawler|spider|scraper|preview|http-client)/i;

const CAMINHOS_ISENTOS = new Set(["/healthz", "/_admin"]);

export function pareceHumano(ua: string): boolean {
  if (!ua) return false;
  if (UA_DE_BOT.test(ua)) return false;
  if (UA_BOT_LEGITIMO.test(ua)) return true;
  if (!UA_NAVEGADOR.test(ua)) return false;
  if (!UA_ENGINE_BROWSER.test(ua)) return false;
  if (UA_HEADLESS.test(ua)) return false;
  return true;
}

function telaBranca(): Response {
  return new Response(
    '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
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

/**
 * Retorna a tela branca se o UA não passar no filtro, ou null para seguir.
 * Chamado no topo do `fetch` do servidor.
 */
export function filtrarBots(req: Request): Response | null {
  if (DESATIVADO) return null;

  const { pathname } = new URL(req.url);
  if (CAMINHOS_ISENTOS.has(pathname)) return null;

  const ua = req.headers.get("user-agent") ?? "";
  if (!pareceHumano(ua)) return telaBranca();

  return null;
}
