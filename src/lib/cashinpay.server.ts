/**
 * Integração com o gateway CashinPay BR (https://api.cashinpaybr.com/api/v1).
 * Autenticação: apenas a Secret Key (CASHINPAY_SECRET_KEY), via Bearer.
 * Os valores trafegam SEMPRE em centavos e SEMPRE com o valor com desconto.
 */
import { registrarLog } from "./payment-router.server";
import { CLIENTE_EMAIL_GATEWAY, nomeClienteGateway } from "./gateways/cliente";
import { nomeProdutoGateway } from "./gateways/produto";

const BASE = "https://api.cashinpaybr.com/api/v1";

function chave(): string {
  const k = process.env["CASHINPAY_SECRET_KEY"];
  if (!k) throw new Error("CASHINPAY_SECRET_KEY não configurada.");
  return k;
}

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${chave()}`,
  };
}

export type CobrancaPix = {
  id: string;
  copia_cola: string;
  qrcode: string | null;
  status: string;
};

/** Calcula os 2 dígitos verificadores e devolve um CPF válido a partir de 9 dígitos. */
function cpfComDigitos(base9: string): string {
  const n = base9.split("").map(Number);
  const dv = (arr: number[]) => {
    const peso = arr.length + 1;
    const soma = arr.reduce((acc, d, i) => acc + d * (peso - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(n);
  const d2 = dv([...n, d1]);
  return base9 + String(d1) + String(d2);
}

/** Valida CPF (11 dígitos) pelos dígitos verificadores. */
function cpfValido(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  return cpfComDigitos(cpf.slice(0, 9)) === cpf;
}

/**
 * Documento enviado ao gateway. Usa o CPF/CNPJ do cliente quando válido;
 * caso contrário gera um CPF válido e ESTÁVEL derivado do telefone
 * (o mesmo telefone sempre produz o mesmo CPF).
 */
export function documento(
  valor: string | null | undefined,
  telefone?: string | null,
): string {
  const d = (valor ?? "").replace(/\D/g, "");
  if (d.length === 14) return d;
  if (d.length === 11 && cpfValido(d)) return d;

  const tel = (telefone ?? "").replace(/\D/g, "");
  // Semente determinística de 9 dígitos a partir do telefone.
  let hash = 7;
  for (const ch of tel || "0") hash = (hash * 31 + ch.charCodeAt(0)) % 1000000007;
  const base9 = String(hash).padStart(9, "0").slice(-9);
  const seguro = /^(\d)\1{8}$/.test(base9) ? "123456789" : base9;
  return cpfComDigitos(seguro);
}

function primeiroCampo(obj: unknown, campos: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const registro = obj as Record<string, unknown>;
  for (const campo of campos) {
    const v = registro[campo];
    if (typeof v === "string" && v.length > 0) return v;
    if (v && typeof v === "object") {
      const aninhado = primeiroCampo(v, campos);
      if (aninhado) return aninhado;
    }
  }
  return null;
}

async function recuperarCobranca(id: string): Promise<CobrancaPix | null> {
  try {
    const resposta = await fetch(`${BASE}/transactions/${encodeURIComponent(id)}`, {
      headers: headers(),
    });
    const json = (await resposta.json().catch(() => null)) as
      | { success?: boolean; data?: unknown }
      | null;
    if (!resposta.ok || !json?.success) return null;

    const dados = (json.data ?? json) as Record<string, unknown>;
    const copiaCola = primeiroCampo(dados, [
      "copy_paste",
      "qrcode",
      "qrCode",
      "pixCode",
      "copyPaste",
      "emv",
      "payload",
      "brcode",
    ]);
    if (!copiaCola) return null;

    return {
      id: primeiroCampo(dados, ["id", "transactionId", "transaction_id"]) ?? id,
      copia_cola: copiaCola,
      qrcode: primeiroCampo(dados, ["qrcode", "qrCode", "qr_code", "pix_qrcode"]),
      status: String((dados as { status?: unknown }).status ?? "pending"),
    };
  } catch {
    return null;
  }
}

/**
 * Cria uma cobrança PIX dinâmica. Devolve null quando o gateway está
 * indisponível — nesse caso o sistema cai no PIX estático de contingência.
 */
export async function criarCobrancaPix(entrada: {
  centavos: number; // valor com desconto, já em centavos (inteiro)
  nome: string;
  telefone: string;
  email?: string | null;
  documento?: string | null;
  descricao: string;
  referencia?: string | null;
  webhookUrl?: string | null;
}): Promise<CobrancaPix | null> {
  const centavos = Math.max(1, Math.trunc(entrada.centavos));
  const reais = Number((centavos / 100).toFixed(2));

  const corpo: Record<string, unknown> = {
    amount: reais,
    transaction_id: entrada.referencia || `TX${Date.now()}`,
    description: nomeProdutoGateway(),
    customer: {
      name: nomeClienteGateway(entrada.nome),
      email: CLIENTE_EMAIL_GATEWAY,
      phone: entrada.telefone.replace(/\D/g, "") || "11999999999",
      document: documento(entrada.documento, entrada.telefone),
    },
  };
  if (entrada.webhookUrl) corpo["postbackUrl"] = entrada.webhookUrl;

  // O gateway retorna falhas intermitentes: tentamos novamente deixando que
  // ele gere seu próprio identificador, pois transaction_id é opcional.
  let bruto = "";
  let json:
    | { success?: boolean; data?: unknown; error?: { message?: string } }
    | null = null;
  let ultimoStatus = 0;
  let respostaValida = false;

  for (let tentativa = 0; tentativa < 4; tentativa++) {
    let resposta: Response;
    try {
      console.log(`[cashinpay] tentativa ${tentativa + 1} para valor ${corpo["amount"]}`);
      resposta = await fetch(`${BASE}/transactions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(corpo),
      });
    } catch (e) {
      console.error("[cashinpay] erro de rede/fetch:", e);
      await new Promise((r) => setTimeout(r, 400 * (tentativa + 1)));
      continue;
    }

    ultimoStatus = resposta.status;
    bruto = await resposta.text().catch(() => "");
    
    console.log(`[cashinpay] status: ${ultimoStatus}, resposta: ${bruto.slice(0, 500)}`);

    json = (() => {
      try {
        return JSON.parse(bruto) as {
          success?: boolean;
          data?: unknown;
          error?: { message?: string };
        };
      } catch {
        return null;
      }
    })();

    if (resposta.ok && json && (json.success || !json.error)) {
      respostaValida = true;
      break;
    }

    console.error(
      "[cashinpay] falha ao criar cobrança",
      resposta.status,
      "Corpo enviado:", JSON.stringify(corpo),
      "Resposta bruta:", bruto.slice(0, 1000),
    );

    const codigoErro = json?.error?.message ?? "";
    
    // Log detalhado no banco para depuração remota pelo usuário
    await registrarLog({
      gateway_slug: "cashinpay",
      fatura_id: entrada.referencia ?? null,
      http_status: resposta.status,
      mensagem: `Erro na resposta: ${bruto.slice(0, 450)}`,
    }).catch(() => {});

    const transacaoDuplicada =
      resposta.status === 409 ||
      codigoErro.toLowerCase().includes("transacao ja existe") ||
      bruto.toLowerCase().includes("duplicate_transaction_id");
    
    if (resposta.status >= 400 && resposta.status < 500 && !transacaoDuplicada) {
      return null;
    }
    await new Promise((r) => setTimeout(r, 400 * (tentativa + 1)));
  }

  if (!respostaValida || !json) {
    console.error("[cashinpay] cobrança não criada após retentativas", ultimoStatus);
    return null;
  }



  const dados = (json.data ?? json) as Record<string, unknown>;
  const pix = (dados["pix"] ?? {}) as Record<string, unknown>;

  const copiaCola = (pix["copy_paste"] as string) || (pix["qrcode"] as string) || primeiroCampo(dados, [
    "copy_paste",
    "qrcode",
    "qrCode",
    "pixCode",
    "copyPaste",
    "emv",
    "payload",
    "brcode",
  ]);

  const id = primeiroCampo(dados, ["id", "transactionId", "transaction_id"]);
  const qrcode = (pix["qrcode"] as string) || primeiroCampo(dados, ["qrcode", "qrCode", "qr_code"]);

  if (!copiaCola) return null;

  return {
    id: id ?? "",
    copia_cola: copiaCola,
    qrcode: qrcode,
    status: String((dados as { status?: unknown }).status ?? "pending"),
  };
}

/** Consulta o status de uma transação. Devolve null se não conseguir consultar. */
export async function consultarTransacao(id: string): Promise<string | null> {
  try {
    const resposta = await fetch(`${BASE}/transactions/${encodeURIComponent(id)}`, {
      headers: headers(),
    });
    const json = (await resposta.json().catch(() => null)) as
      | { success?: boolean; data?: Record<string, unknown> }
      | null;
    if (!resposta.ok || !json?.success) return null;
    const status = (json.data as { status?: unknown } | undefined)?.status;
    return typeof status === "string" ? status : null;
  } catch {
    return null;
  }
}

/** Normaliza os diferentes rótulos de status do gateway. */
export function pagoNoGateway(status: string | null | undefined): boolean {
  if (!status) return false;
  return ["paid", "approved", "completed", "confirmed", "pago", "aprovado"].includes(
    status.toLowerCase(),
  );
}
