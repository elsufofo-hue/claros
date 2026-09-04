/**
 * Worker de `fetchComTimeout` executado via `Bun.spawn` (ver `proxy-fetch.ts`).
 *
 * Roda como subprocesso porque o Bun não respeita `ProxyAgent`/`dispatcher`
 * do `undici` no `fetch()` — a env var `HTTPS_PROXY` só é lida por um
 * processo Bun quando setada ANTES dele subir. Rodar isto num subprocesso
 * próprio, com `HTTPS_PROXY` só no `env` daquele spawn, isola o proxy da
 * chamada específica sem afetar o `fetch` do processo principal (que os
 * outros gateways continuam usando direto, sem proxy).
 *
 * Protocolo: lê um JSON de {url, init, timeoutMs} no stdin, faz o fetch,
 * escreve um JSON de {status, headers, body} (body em base64) no stdout.
 * Erros: stderr recebe a mensagem e o processo sai com código 1.
 */

type Pedido = {
  url: string;
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string; // texto puro — os adapters de gateway só mandam JSON
  };
  timeoutMs: number;
};

type Resposta = {
  status: number;
  headers: Record<string, string>;
  bodyBase64: string;
};

async function main() {
  const bruto = await new Response(Bun.stdin).text();
  const pedido = JSON.parse(bruto) as Pedido;

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
    const headers: Record<string, string> = {};
    resposta.headers.forEach((v, k) => {
      headers[k] = v;
    });

    const saida: Resposta = {
      status: resposta.status,
      headers,
      bodyBase64: Buffer.from(corpo).toString("base64"),
    };
    process.stdout.write(JSON.stringify(saida));
    process.exit(0);
  } catch (erro) {
    process.stderr.write(erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
  } finally {
    clearTimeout(timeout);
  }
}

main();
