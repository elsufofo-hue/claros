/**
 * `fetch` com timeout curto — usar em TODA chamada às APIs de gateway.
 *
 * Sem isto, uma gateway com a conexão travada (TCP não fecha o handshake,
 * ex.: bloqueio de IP do lado deles) prende o `fetch` até o timeout do
 * runtime, que pode levar minutos. O usuário vê "carregando" parado e o
 * `payment-router.server.ts` só tenta a próxima gateway ativa depois que
 * a atual desiste — então o timeout daqui é o que decide "rápido o
 * suficiente pra o fallback ser útil" vs. "página travada".
 */
const TIMEOUT_PADRAO_MS = 15_000;

export async function fetchComTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = TIMEOUT_PADRAO_MS,
): Promise<Response> {
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controlador.signal });
  } finally {
    clearTimeout(timeout);
  }
}
