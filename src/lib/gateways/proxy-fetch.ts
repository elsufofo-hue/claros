/**
 * `fetch` que sai por um proxy HTTP externo, isolado num subprocesso.
 *
 * Uso: quando uma gateway específica está bloqueando o IP da VPS (aconteceu
 * com a CashinPay em 2026-09 — TCP SYN nem respondido, confirmado via MTR
 * que não é rota/rede geral, e sim filtro na borda do destino) mas não faz
 * sentido rotear TODO o tráfego de saída por um proxy só por causa de uma
 * gateway.
 *
 * Por que subprocesso, e por que o worker é uma STRING embutida (não um
 * arquivo `.ts` separado importado por caminho):
 *  1. O Bun não respeita `ProxyAgent`/`dispatcher` do `undici` no `fetch()`
 *     — testado e confirmado (IP de saída não mudava com o dispatcher
 *     setado). A única forma que funciona de verdade é `HTTPS_PROXY` como
 *     env var do PROCESSO, lida antes dele subir — daí rodar a chamada
 *     num `Bun.spawn` próprio, com a env só naquele spawn.
 *  2. Um `proxy-fetch-worker.ts` como arquivo separado funciona em dev,
 *     mas o build de produção (Vite/Nitro) bundla tudo em `.mjs` com hash
 *     no nome e NÃO copia o `.ts` original pro `.output` — o spawn
 *     `bun run <caminho-do-arquivo>` falha em produção com "Module not
 *     found" (aconteceu de verdade: CashinPay caiu 4x em produção com
 *     esse erro antes de virar string embutida). Uma string sobrevive a
 *     qualquer bundler porque não depende de resolução de caminho — ela
 *     é dado, não um import.
 */

const WORKER_SRC = `
const bruto = await new Response(Bun.stdin).text();
const pedido = JSON.parse(bruto);
const controlador = new AbortController();
const timeout = setTimeout(() => controlador.abort(), pedido.timeoutMs);
try {
  const resposta = await fetch(pedido.url, {
    method: pedido.init.method,
    headers: pedido.init.headers,
    body: pedido.init.body,
    signal: controlador.signal,
  });
  const corpo = await resposta.arrayBuffer();
  const headers = {};
  resposta.headers.forEach((v, k) => { headers[k] = v; });
  process.stdout.write(JSON.stringify({
    status: resposta.status,
    headers,
    bodyBase64: Buffer.from(corpo).toString("base64"),
  }));
  process.exit(0);
} catch (erro) {
  process.stderr.write(erro instanceof Error ? erro.message : String(erro));
  process.exit(1);
} finally {
  clearTimeout(timeout);
}
`;

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

  const proc = Bun.spawn(["bun", "-e", WORKER_SRC], {
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
