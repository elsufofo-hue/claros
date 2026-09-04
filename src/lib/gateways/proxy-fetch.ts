/**
 * `fetch` que sai por um proxy HTTP externo, isolado num subprocesso.
 *
 * Uso: quando uma gateway específica está bloqueando o IP da VPS (aconteceu
 * com a CashinPay em 2026-09 — TCP SYN nem respondido, confirmado via MTR
 * que não é rota/rede geral, e sim filtro na borda do destino) mas não faz
 * sentido rotear TODO o tráfego de saída por um proxy só por causa de uma
 * gateway. Ver `proxy-fetch-worker.ts` para o porquê do subprocesso (o Bun
 * não respeita ProxyAgent/dispatcher do undici no fetch principal).
 *
 * Configuração: GATEWAY_PROXY_URL no ambiente, formato
 * `http://usuario:senha@host:porta`. Sem essa env, `proxyDisponivel()`
 * retorna false e o chamador deve cair para fetch direto.
 */
import { fileURLToPath } from "node:url";

const WORKER_PATH = fileURLToPath(new URL("./proxy-fetch-worker.ts", import.meta.url));

export function proxyDisponivel(): boolean {
  return Boolean(process.env["GATEWAY_PROXY_URL"]);
}

export type RespostaProxy = {
  status: number;
  headers: Record<string, string>;
  text(): string;
  json(): unknown;
};

/**
 * Faz um fetch saindo pelo proxy configurado em GATEWAY_PROXY_URL.
 * Lança erro se GATEWAY_PROXY_URL não estiver setada — checar
 * `proxyDisponivel()` antes, ou tratar o catch como "proxy indisponível".
 */
export async function fetchViaProxy(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  timeoutMs = 15_000,
): Promise<RespostaProxy> {
  const proxyUrl = process.env["GATEWAY_PROXY_URL"];
  if (!proxyUrl) throw new Error("GATEWAY_PROXY_URL não configurada.");

  const pedido = JSON.stringify({ url, init, timeoutMs });

  const proc = Bun.spawn(["bun", "run", WORKER_PATH], {
    env: { ...process.env, HTTPS_PROXY: proxyUrl, HTTP_PROXY: proxyUrl },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  proc.stdin.write(pedido);
  proc.stdin.end();

  const [saida, erro] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const codigo = await proc.exited;

  if (codigo !== 0) {
    throw new Error(`fetchViaProxy falhou: ${erro || "erro desconhecido"}`);
  }

  const dados = JSON.parse(saida) as {
    status: number;
    headers: Record<string, string>;
    bodyBase64: string;
  };
  const corpoBuffer = Buffer.from(dados.bodyBase64, "base64");

  return {
    status: dados.status,
    headers: dados.headers,
    text: () => corpoBuffer.toString("utf8"),
    json: () => JSON.parse(corpoBuffer.toString("utf8")),
  };
}
