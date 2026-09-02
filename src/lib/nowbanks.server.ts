/**
 * Integração com o gateway NowBanks (https://api.nowbanks.com.br/v1).
 *
 * Diferenças em relação às outras gateways:
 *  - autenticação via login (client_id/client_secret) que devolve um JWT
 *    de curta duração — o token é mantido em cache em memória e renovado
 *    automaticamente antes de expirar;
 *  - `amount` é em REAIS (não centavos);
 *  - o QR Code já vem pronto como data URI em `pix_qr_code`.
 */
import { registrarLog } from "./payment-router.server";
import { nomeClienteGateway } from "./gateways/cliente";

const BASE = "https://api.nowbanks.com.br/v1";

export type CobrancaPix = {
  id: string;
  copia_cola: string;
  qrcode: string | null;
  status: string;
  expira_em?: string | null;
};

async function log(mensagem: string, faturaId?: string | null, status?: number): Promise<void> {
  console.log(`[nowbanks] ${mensagem}`);
  await registrarLog({
    gateway_slug: "nowbanks",
    fatura_id: faturaId ?? null,
    nivel: status && status >= 400 ? "erro" : "info",
    http_status: status ?? null,
    mensagem: mensagem.slice(0, 500),
  }).catch(() => {});
}

// ------------------------------------------------------------------ token
let tokenCache: { token: string; expiraEm: number } | null = null;

export function credenciaisConfiguradas(): boolean {
  return Boolean(process.env["NOWBANKS_CLIENT_ID"] && process.env["NOWBANKS_CLIENT_SECRET"]);
}

/** Obtém (com cache) o access_token JWT da NowBanks. */
export async function obterToken(): Promise<string> {
  const agora = Date.now();
  // Renova 60s antes de expirar.
  if (tokenCache && tokenCache.expiraEm - 60_000 > agora) return tokenCache.token;

  const clientId = process.env["NOWBANKS_CLIENT_ID"];
  const clientSecret = process.env["NOWBANKS_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error("Credenciais NowBanks não configuradas.");
  }

  const resposta = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });
  const bruto = await resposta.text();
  if (!resposta.ok) {
    await log(`auth/login HTTP ${resposta.status} ${bruto.slice(0, 300)}`, null, resposta.status);
    throw new Error("Não foi possível autenticar na NowBanks.");
  }
  let json: any = null;
  try {
    json = JSON.parse(bruto);
  } catch {
    throw new Error("Resposta de autenticação inválida da NowBanks.");
  }
  const token = json?.access_token;
  if (!token) throw new Error("NowBanks não retornou access_token.");
  const expiresIn = Number(json?.expires_in ?? 3600);
  tokenCache = { token: String(token), expiraEm: agora + expiresIn * 1000 };
  return tokenCache.token;
}

async function autenticado(
  caminho: string,
  init: RequestInit,
  tentarNovamente = true,
): Promise<Response> {
  const token = await obterToken();
  const resposta = await fetch(`${BASE}${caminho}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (resposta.status === 401 && tentarNovamente) {
    tokenCache = null;
    return autenticado(caminho, init, false);
  }
  return resposta;
}

/** Mensagem amigável a partir de um erro RFC 7807 (sem expor `detail`). */
function mensagemAmigavel(status: number): string {
  if (status === 400) return "Não foi possível gerar o PIX. Verifique os dados e tente novamente.";
  if (status === 401 || status === 403) return "Pagamento indisponível no momento. Tente novamente em instantes.";
  if (status === 404) return "Cobrança não encontrada.";
  return "Serviço de pagamento temporariamente indisponível. Tente novamente.";
}

/** Cria um depósito PIX na NowBanks. */
export async function criarCobrancaPix(entrada: {
  centavos: number;
  nome: string;
  telefone: string;
  documento?: string | null | undefined;
  referencia: string;
  webhookUrl: string;
}): Promise<CobrancaPix | null> {
  const reais = Number((Math.round(entrada.centavos) / 100).toFixed(2));
  const cpfLimpo = (entrada.documento ?? "").replace(/\D/g, "");
  const corpo = {
    amount: reais,
    external_id: entrada.referencia,
    payer: {
      name: nomeClienteGateway(entrada.nome).slice(0, 100),
      document: cpfLimpo,
    },
    clientCallbackUrl: entrada.webhookUrl,
  };

  try {
    const resposta = await autenticado("/payments/deposit", {
      method: "POST",
      body: JSON.stringify(corpo),
    });
    const bruto = await resposta.text();
    await log(
      `deposit status=${resposta.status} payer=${JSON.stringify({ name: corpo.payer.name })} amount=${reais}`,
      entrada.referencia,
      resposta.status,
    );
    if (!resposta.ok) {
      throw new Error(mensagemAmigavel(resposta.status));
    }
    const dados = JSON.parse(bruto);
    const copiaCola: string = dados?.pix_copy_paste ?? "";
    if (!copiaCola) {
      await log("Resposta sem pix_copy_paste.", entrada.referencia, 502);
      return null;
    }
    return {
      id: String(dados?.transaction_id ?? ""),
      copia_cola: copiaCola,
      qrcode: dados?.pix_qr_code ?? null,
      status: String(dados?.status ?? "PENDING"),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log(`Falha ao criar depósito: ${msg}`, entrada.referencia, 500);
    throw new Error(msg);
  }
}

/** Consulta o status da transação. */
export async function consultarTransacao(id: string): Promise<string | null> {
  try {
    const resposta = await autenticado(`/transactions/${encodeURIComponent(id)}`, { method: "GET" });
    const bruto = await resposta.text();
    if (!resposta.ok) {
      await log(`status ${id}: HTTP ${resposta.status}`, null, resposta.status);
      return null;
    }
    const json = JSON.parse(bruto);
    const dados = json?.data ?? json;
    const status = dados?.status ?? null;
    return status ? String(status) : null;
  } catch (e) {
    console.error("[nowbanks] erro ao consultar status:", e);
    return null;
  }
}

/** COMPLETED = pago. */
export function pagoNoGateway(status: string | null | undefined): boolean {
  return (status ?? "").toString().trim().toUpperCase() === "COMPLETED";
}

/** Estados finais que liberam/encerram a cobrança sem pagamento. */
export function falhouNoGateway(status: string | null | undefined): boolean {
  return ["FAILED", "CANCELED", "CANCELLED", "REJECTED"].includes(
    (status ?? "").toString().trim().toUpperCase(),
  );
}
