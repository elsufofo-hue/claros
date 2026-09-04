import { fetchViaProxy, proxyDisponivel } from "./proxy-fetch";

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

export type RespostaGateway = {
  status: number;
  ok: boolean;
  text(): Promise<string>;
  json(): Promise<unknown>;
};

/**
 * `fetch` para chamadas de gateway de pagamento: sai por `GATEWAY_PROXY_URL`
 * quando configurada (esconde o IP real da VPS do gateway — usado hoje pelo
 * GG stack1, proxy dedicado em metodo.emagrecersecreto.com), senão cai para
 * `fetchComTimeout` direto. Único ponto de decisão proxy-vs-direto — todo
 * adapter de gateway deve chamar isto, nunca `fetch`/`fetchComTimeout` puro.
 */
export async function fetchGateway(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  timeoutMs = TIMEOUT_PADRAO_MS,
): Promise<RespostaGateway> {
  if (proxyDisponivel()) {
    const r = await fetchViaProxy(url, init, timeoutMs);
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      text: async () => r.text(),
      json: async () => r.json(),
    };
  }
  const r = await fetchComTimeout(url, init, timeoutMs);
  return { status: r.status, ok: r.ok, text: () => r.text(), json: () => r.json() };
}
