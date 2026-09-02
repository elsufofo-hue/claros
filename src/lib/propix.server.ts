/**
 * Integração com o gateway ProPix (https://api.propixbr.com/api/v1).
 */
import { registrarLog } from "./payment-router.server";
import { CLIENTE_EMAIL_GATEWAY, nomeClienteGateway } from "./gateways/cliente";
import { nomeProdutoGateway } from "./gateways/produto";

const BASE = "https://api.propixbr.com/api/v1";

function credenciais() {
  const clientId = process.env["PROPIX_CLIENT_ID"];
  const clientSecret = process.env["PROPIX_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    console.error("[propix] Erro de configuração. PROPIX_CLIENT_ID:", !!clientId, "PROPIX_CLIENT_SECRET:", !!clientSecret);
    throw new Error("Credenciais ProPix (CLIENT_ID/SECRET) não configuradas.");
  }
  return { clientId, clientSecret };
}

function headers() {
  const { clientId, clientSecret } = credenciais();
  return {
    "Content-Type": "application/json",
    "x-client-id": clientId,
    "x-client-secret": clientSecret,
  };
}

export type CobrancaPix = {
  id: string;
  copia_cola: string;
  qrcode: string | null;
  status: string;
};

/**
 * Cria uma cobrança PIX dinâmica na ProPix.
 */
export async function criarCobrancaPix(entrada: {
  centavos: number;
  nome: string;
  telefone: string;
  email?: string | null | undefined;
  documento?: string | null | undefined;
  descricao: string;
  referencia?: string | null | undefined;
  gateway?: any;
}): Promise<CobrancaPix | null> {
  const log = async (msg: string, status?: number) => {
    console.log(`[propix-debug] ${msg}`);
    await registrarLog({
      gateway_slug: "propix",
      fatura_id: entrada.referencia ?? null,
      nivel: status && status >= 400 ? "erro" : "info",
      http_status: status ?? null,
      mensagem: msg.slice(0, 500),
    }).catch(() => {});
  };

  await log(`Iniciando criarCobrancaPix para ${entrada.referencia}`);

  const reais = Number((entrada.centavos / 100).toFixed(2));
  // A ProPix pode exigir CPFs válidos; limpamos a formatação.
  const cpf = (entrada.documento ?? "").replace(/\D/g, "");

  const corpo = {
    amount: reais,
    description: nomeProdutoGateway().slice(0, 50),
    payerName: nomeClienteGateway(entrada.nome).slice(0, 50),
    payerEmail: CLIENTE_EMAIL_GATEWAY,
    payerDocument: cpf || "00000000000",
  };

  try {
    await log(`Payload: ${JSON.stringify(corpo)}`);
    const resposta = await fetch(`${BASE}/deposit`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(corpo),
    });

    const bruto = await resposta.text();
    await log(`Status: ${resposta.status}, Resposta: ${bruto}`, resposta.status);

    if (!resposta.ok) {
       return null;
    }

    const json = JSON.parse(bruto);

    if (!json.success) {
      return null;
    }

    // O QR Code vem com prefixo "base64:", que tratamos aqui
    let qrcode = json.qrcodeUrl || null;
    if (qrcode && qrcode.startsWith("base64:")) {
      qrcode = qrcode.replace("base64:", "");
    }

    return {
      id: String(json.transactionId),
      copia_cola: json.copyPaste,
      qrcode: qrcode,
      status: json.status || "PENDENTE",
    };
  } catch (e) {
    console.error("[propix] erro de rede/processamento:", e);
    await log(`Erro fatal: ${e instanceof Error ? e.message : String(e)}`, 500);
    return null;
  }
}

/**
 * Consulta o status de uma transação.
 */
export async function consultarTransacao(id: string): Promise<string | null> {
  try {
    const resposta = await fetch(`${BASE}/check`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ transactionId: id }),
    });

    const json = await resposta.json();
    if (!resposta.ok || !json.transaction) {
      console.error("[propix] erro ao consultar transação:", id, json);
      return null;
    }

    return json.transaction.transactionState; // Ex: "COMPLETO", "PENDENTE"
  } catch (e) {
    console.error("[propix] erro ao consultar status ProPix:", e);
    return null;
  }
}

/**
 * Normaliza status ProPix para boolean pago.
 */
export function pagoNoGateway(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  return ["COMPLETO", "APROVADO", "PAID", "SUCCESS"].includes(s);
}

