/**
 * Integração com o gateway M2 Pay (https://api.m2pay.pro/api).
 *
 * Diferenças importantes em relação a CashinPay/ProPix:
 *  - `amount` e `unitPrice` são em CENTAVOS;
 *  - `document` é um objeto { number, type };
 *  - `items` é obrigatório;
 *  - o copia-e-cola vem em `data.pix.emv` (não `copyPaste`).
 */
import { registrarLog } from "./payment-router.server";
import { CLIENTE_EMAIL_GATEWAY, nomeClienteGateway } from "./gateways/cliente";
import { nomeProdutoGateway } from "./gateways/produto";

const BASE = "https://api.m2pay.pro/api";

function apiKey(): string {
  const key = process.env["M2PAY_API_KEY"];
  if (!key) {
    console.error("[m2pay] M2PAY_API_KEY ausente.");
    throw new Error("Credencial M2 Pay (M2PAY_API_KEY) não configurada.");
  }
  return key;
}

function headers() {
  return {
    "Content-Type": "application/json",
    "X-API-Key": apiKey(),
  };
}

export type CobrancaPix = {
  id: string;
  copia_cola: string;
  qrcode: string | null;
  status: string;
  expira_em?: string | null;
};

async function log(
  mensagem: string,
  faturaId?: string | null,
  status?: number,
): Promise<void> {
  console.log(`[m2pay] ${mensagem}`);
  await registrarLog({
    gateway_slug: "m2pay",
    fatura_id: faturaId ?? null,
    nivel: status && status >= 400 ? "erro" : "info",
    http_status: status ?? null,
    mensagem: mensagem.slice(0, 500),
  }).catch(() => {});
}

/** Cria uma cobrança PIX na M2 Pay. */
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
  const centavos = Math.round(entrada.centavos);
  const cpfLimpo = (entrada.documento ?? "").replace(/\D/g, "");
  const cpf = cpfLimpo.length === 11 ? cpfLimpo : "00000000000";
  const telefone = (entrada.telefone ?? "").replace(/\D/g, "").slice(-11) || "11999999999";
  // O título de `items` é montado aqui, no último ponto antes do envio, para
  // nunca herdar `faturas.descricao` de fluxos antigos ou chamadas paralelas.
  const titulo = nomeProdutoGateway().slice(0, 100);
  const nome = nomeClienteGateway(entrada.nome).slice(0, 100);

  const corpo = {
    amount: centavos,
    paymentMethod: "pix",
    items: [
      { title: titulo, unitPrice: centavos, quantity: 1, tangible: false },
    ],
    customer: {
      name: nome,
      email: CLIENTE_EMAIL_GATEWAY,
      phone: telefone,
      document: { number: cpf, type: "cpf" },
    },
    postbackUrl: entrada.webhookUrl,
    externalRef: entrada.referencia,
  };

  try {
    // Registra somente os campos comerciais necessários para auditar o payload
    // efetivamente enviado, sem expor documento, telefone ou credenciais.
    await log(
      `create-transaction payload=${JSON.stringify({
        items: corpo.items.map(({ title }) => ({ title })),
        customer: { name: corpo.customer.name, email: corpo.customer.email },
      })}`,
      entrada.referencia,
    );
    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), 30_000);
    let resposta: Response;
    try {
      resposta = await fetch(`${BASE}/sales/create-transaction`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(corpo),
        signal: controlador.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const bruto = await resposta.text();
    await log(`create-transaction status=${resposta.status} resposta=${bruto}`, entrada.referencia, resposta.status);

    if (resposta.status === 401) {
      throw new Error("API Key da M2 Pay inválida ou expirada.");
    }
    if (!resposta.ok) return null;

    const json = JSON.parse(bruto);
    const dados = json?.data ?? json;
    if (json?.success === false || !dados) return null;

    const pix = dados.pix ?? {};
    const copiaCola: string = pix.emv ?? pix.copyPaste ?? "";
    if (!copiaCola) {
      await log("Resposta sem campo pix.emv (copia e cola).", entrada.referencia, 502);
      return null;
    }

    return {
      id: String(dados.transactionId ?? dados.id ?? ""),
      copia_cola: copiaCola,
      qrcode: pix.qrcode ?? null,
      status: String(dados.status ?? "PENDING"),
      expira_em: pix.expiresAt ?? null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log(`Falha ao criar cobrança: ${msg}`, entrada.referencia, 500);
    if (msg.includes("API Key")) throw e;
    return null;
  }
}

/** Consulta o status de uma transação (fallback/reconciliação). */
export async function consultarTransacao(id: string): Promise<string | null> {
  try {
    const resposta = await fetch(`${BASE}/sales/${encodeURIComponent(id)}/status`, {
      method: "GET",
      headers: headers(),
    });
    const bruto = await resposta.text();
    if (!resposta.ok) {
      await log(`status ${id}: HTTP ${resposta.status} ${bruto}`, null, resposta.status);
      return null;
    }
    const json = JSON.parse(bruto);
    const dados = json?.data ?? json;
    const status = dados?.status ?? dados?.transactionStatus ?? null;
    return status ? String(status) : null;
  } catch (e) {
    console.error("[m2pay] erro ao consultar status:", e);
    return null;
  }
}

/** PENDING | PAID | CANCELLED | REFUNDED */
export function pagoNoGateway(status: string | null | undefined): boolean {
  return (status ?? "").toString().trim().toUpperCase() === "PAID";
}
