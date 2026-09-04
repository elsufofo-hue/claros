/**
 * Integração com o gateway PixzyPay (https://app.pixzypay.com/api).
 * Docs: https://docs.pixzypay.com/
 *
 * Características:
 *  - Autenticação: Bearer <token> (PIXZYPAY_TOKEN), header Authorization.
 *  - Valores SEMPRE em centavos (mínimo 500).
 *  - Cria a cobrança em POST /transactions; o copia-e-cola vem em `data.br_code`.
 *  - Consulta em GET /transactions/{id} (aceita o UUID retornado na criação).
 *  - Webhook (POST no `webhook_url`): { event, transaction:{ id, status, ... } }.
 *    A PixzyPay NÃO documenta assinatura HMAC — a segurança vem do double-check
 *    (consultarTransacao) feito pelo router antes de dar baixa, igual a m2pay/propix.
 *  - Status: pending | paid | expired | failed. "pago" = paid.
 */
import { registrarLog } from "./payment-router.server";
import { CLIENTE_EMAIL_GATEWAY, nomeClienteGateway } from "./gateways/cliente";
import { nomeProdutoGateway } from "./gateways/produto";
import { documento } from "./cashinpay.server";
import { fetchComTimeout } from "./gateways/http";

const BASE = "https://app.pixzypay.com/api";

function token(): string {
  const t = process.env["PIXZYPAY_TOKEN"];
  if (!t) {
    console.error("[pixzypay] PIXZYPAY_TOKEN ausente.");
    throw new Error("Credencial PixzyPay (PIXZYPAY_TOKEN) não configurada.");
  }
  return t;
}

function headers() {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token()}`,
  };
}

export type CobrancaPix = {
  id: string;
  copia_cola: string;
  qrcode: string | null;
  status: string;
};

async function log(mensagem: string, faturaId?: string | null, status?: number): Promise<void> {
  console.log(`[pixzypay] ${mensagem}`);
  await registrarLog({
    gateway_slug: "pixzypay",
    fatura_id: faturaId ?? null,
    nivel: status && status >= 400 ? "erro" : "info",
    http_status: status ?? null,
    mensagem: mensagem.slice(0, 500),
  }).catch(() => {});
}

function busca(obj: unknown, campos: string[], profundidade = 0): string | null {
  if (profundidade > 6 || !obj || typeof obj !== "object") return null;
  const registro = obj as Record<string, unknown>;
  for (const campo of campos) {
    const v = registro[campo];
    if (v != null && typeof v !== "object") return String(v);
  }
  for (const v of Object.values(registro)) {
    const achado = busca(v, campos, profundidade + 1);
    if (achado) return achado;
  }
  return null;
}

/**
 * Cria uma cobrança PIX dinâmica. Devolve null quando o gateway está
 * indisponível — nesse caso o router cai para o próximo gateway / PIX estático.
 */
export async function criarCobrancaPix(entrada: {
  centavos: number;
  nome: string;
  telefone: string;
  email?: string | null | undefined;
  documento?: string | null | undefined;
  descricao: string;
  referencia: string;
  webhookUrl: string;
}): Promise<CobrancaPix | null> {
  // Mínimo documentado é 500 centavos (R$ 5,00).
  const centavos = Math.max(500, Math.round(entrada.centavos));
  const cpf = documento(entrada.documento, entrada.telefone);
  const telefone = (entrada.telefone ?? "").replace(/\D/g, "").slice(-11) || "11999999999";
  const nome = nomeClienteGateway(entrada.nome).slice(0, 100);

  const corpo: Record<string, unknown> = {
    amount: centavos,
    client_name: nome,
    client_email: CLIENTE_EMAIL_GATEWAY,
    client_doc: cpf,
    client_phone: telefone,
    webhook_url: entrada.webhookUrl,
    metadata: { ref: entrada.referencia },
    items: [{ name: nomeProdutoGateway().slice(0, 100), price: centavos, quantity: 1 }],
  };

  try {
    await log(
      `create-transaction payload=${JSON.stringify({
        amount: centavos,
        client_name: nome,
        items: corpo.items,
      })}`,
      entrada.referencia,
    );

    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), 30_000);
    let resposta: Response;
    try {
      resposta = await fetch(`${BASE}/transactions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(corpo),
        signal: controlador.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const bruto = await resposta.text();
    await log(
      `create-transaction status=${resposta.status} resposta=${bruto.slice(0, 800)}`,
      entrada.referencia,
      resposta.status,
    );

    if (resposta.status === 401 || resposta.status === 403) {
      throw new Error("Token da PixzyPay inválido ou expirado.");
    }
    if (!resposta.ok) return null;

    let json: unknown = null;
    try {
      json = JSON.parse(bruto);
    } catch {
      await log("Resposta não é JSON.", entrada.referencia, 502);
      return null;
    }

    const raiz = json as { status?: unknown; data?: unknown };
    if (raiz?.status === "error") return null;
    const dados = (raiz?.data ?? raiz) as Record<string, unknown>;

    const copiaCola = busca(dados, ["br_code", "brcode", "copy_paste", "copyPaste", "emv", "payload"]);
    if (!copiaCola) {
      await log("Resposta sem br_code (copia e cola).", entrada.referencia, 502);
      return null;
    }
    const id = busca(dados, ["transaction_id", "transactionId", "id"]);
    if (!id) {
      await log("Resposta sem id de transação.", entrada.referencia, 502);
      return null;
    }

    return {
      id: String(id),
      copia_cola: copiaCola,
      qrcode: busca(dados, ["qr_code", "qrcode", "qrCode", "qr_code_base64"]),
      status: String((dados as { status?: unknown }).status ?? "pending"),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log(`Falha ao criar cobrança: ${msg}`, entrada.referencia, 500);
    if (msg.includes("Token")) throw e;
    return null;
  }
}

/** Consulta o status de uma transação (double-check antes da baixa / reconciliação). */
export async function consultarTransacao(id: string): Promise<string | null> {
  try {
    const resposta = await fetchComTimeout(`${BASE}/transactions/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: headers(),
    });
    const bruto = await resposta.text();
    if (!resposta.ok) {
      await log(`status ${id}: HTTP ${resposta.status} ${bruto.slice(0, 300)}`, null, resposta.status);
      return null;
    }
    let json: unknown = null;
    try {
      json = JSON.parse(bruto);
    } catch {
      return null;
    }
    const raiz = json as { data?: unknown };
    const dados = (raiz?.data ?? json) as Record<string, unknown>;
    const status = dados?.["status"];
    return typeof status === "string" ? status : null;
  } catch (e) {
    console.error("[pixzypay] erro ao consultar status:", e);
    return null;
  }
}

/** pending | paid | expired | failed */
export function pagoNoGateway(status: string | null | undefined): boolean {
  return (status ?? "").toString().trim().toLowerCase() === "paid";
}
