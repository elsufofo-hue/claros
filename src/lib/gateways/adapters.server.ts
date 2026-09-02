/**
 * Registro de adaptadores de gateway.
 * Cada adaptador implementa o contrato `GatewayAdapter` (types.ts).
 */
import { createHmac, timingSafeEqual } from "crypto";
import type {
  CriarPixEntrada,
  GatewayAdapter,
  GatewayRegistro,
  PixCriado,
  WebhookLido,
} from "./types";

/** Procura o código copia-e-cola em qualquer formato de resposta. */
export function extrairCopiaCola(valor: unknown, profundidade = 0): string {
  if (profundidade > 6 || valor == null) return "";
  if (typeof valor === "string") {
    return valor.replace(/\s/g, "").startsWith("00020") ? valor.trim() : "";
  }
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const achado = extrairCopiaCola(item, profundidade + 1);
      if (achado) return achado;
    }
    return "";
  }
  if (typeof valor === "object") {
    for (const item of Object.values(valor as Record<string, unknown>)) {
      const achado = extrairCopiaCola(item, profundidade + 1);
      if (achado) return achado;
    }
  }
  return "";
}

function busca(objeto: unknown, chaves: string[], profundidade = 0): string | null {
  if (profundidade > 6 || !objeto || typeof objeto !== "object") return null;
  const registro = objeto as Record<string, unknown>;
  for (const chave of chaves) {
    const v = registro[chave];
    if (v != null && typeof v !== "object") return String(v);
  }
  for (const v of Object.values(registro)) {
    const achado = busca(v, chaves, profundidade + 1);
    if (achado) return achado;
  }
  return null;
}

const PAGO = new Set([
  "pago",
  "paid",
  "approved",
  "completed",
  "success",
  "succeeded",
  "done",
  "confirmado",
  "realizado",
  "finalizado",
]);

function statusPago(status: string | null | undefined): boolean {
  return PAGO.has((status ?? "").toString().trim().toLowerCase());
}

// ---------------------------------------------------------------- CashinPay
const cashinpay: GatewayAdapter = {
  nome: "cashinpay",
  configurado: () => Boolean(process.env["CASHINPAY_SECRET_KEY"]),
  async criarPix(e: CriarPixEntrada): Promise<PixCriado> {
    const { criarCobrancaPix } = await import("@/lib/cashinpay.server");
    const c = await criarCobrancaPix({
      centavos: e.centavos,
      nome: e.nome,
      telefone: e.telefone,
      email: e.email ?? null,
      documento: e.documento ?? null,
      descricao: e.descricao,
      referencia: e.referencia,
      webhookUrl: e.webhookUrl,
    });
    if (!c) throw new Error("CashinPay não retornou a cobrança.");
    return { transacaoId: c.id, copiaCola: c.copia_cola, qrcode: c.qrcode, status: c.status };
  },
  async consultarStatus(id) {
    const { consultarTransacao } = await import("@/lib/cashinpay.server");
    return consultarTransacao(id);
  },
  pago: statusPago,
  async lerWebhook(request, corpoBruto): Promise<WebhookLido> {
    let corpo: any = null;
    try {
      corpo = JSON.parse(corpoBruto);
    } catch {
      return { valido: false, transacaoId: null, status: null, evento: null };
    }

    const signature = request.headers.get("X-CashinPay-Signature");
    const secret = process.env["CASHINPAY_WEBHOOK_SECRET"];
    let valido = true;

    if (secret && signature) {
      try {
        const hmac = createHmac("sha256", secret);
        const expected = hmac.update(corpoBruto).digest("hex");
        valido = timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
      } catch (e) {
        console.error("[cashinpay] erro ao validar assinatura:", e);
        valido = false;
      }
    }

    // Estrutura esperada: { "event": "transaction.paid", "data": { "id": "...", "status": "paid", ... } }
    const dados = corpo.data ?? corpo;
    return {
      valido,
      transacaoId: busca(dados, ["id", "transaction_id", "transactionId", "external_id"]),
      status: busca(dados, ["status", "payment_status"]),
      evento: busca(corpo, ["event", "type"]),
    };
  },
};


// ------------------------------------------------------------- PIX estático
const pixEstatico: GatewayAdapter = {
  nome: "pix-estatico",
  configurado: () => Boolean(process.env["PIX_CHAVE"]),
  async criarPix(e: CriarPixEntrada): Promise<PixCriado> {
    const chave = process.env["PIX_CHAVE"];
    if (!chave) throw new Error("PIX_CHAVE não configurada.");
    const { gerarBrCode, novoTxid } = await import("@/lib/pix.server");
    const txid = novoTxid();
    return {
      transacaoId: txid,
      copiaCola: gerarBrCode({
        chave,
        valor: e.centavos / 100,
        nome: process.env["PIX_RECEBEDOR"] ?? process.env["PIX_NOME"] ?? "FATURA MOVEL",
        cidade: process.env["PIX_CIDADE"] ?? "SAO PAULO",
        txid,
      }),
      status: "pendente",
    };
  },
  // O PIX estático não tem consulta de status: a baixa só ocorre manualmente
  // ou por outro gateway.
  consultarStatus: async () => null,
  pago: statusPago,
  lerWebhook: (): WebhookLido => ({
    valido: false,
    transacaoId: null,
    status: null,
    evento: null,
  }),
};

// ------------------------------------------------------------ REST genérico
/**
 * Adaptador genérico para gateways REST que ainda serão contratadas.
 * Usa a URL cadastrada no painel e os segredos informados em `secret_names`
 * (o primeiro é o token/API key, o segundo o secret, quando houver).
 */
const generico: GatewayAdapter = {
  nome: "generico",
  configurado: (gw) =>
    Boolean(gw.api_url) &&
    gw.secret_names.length > 0 &&
    gw.secret_names.every((n) => Boolean(process.env[n])),
  async criarPix(e: CriarPixEntrada): Promise<PixCriado> {
    const gw = e.gateway;
    if (!gw.api_url) throw new Error("URL da API não configurada.");
    const token = gw.secret_names[0] ? process.env[gw.secret_names[0]] : undefined;
    const secret = gw.secret_names[1] ? process.env[gw.secret_names[1]] : undefined;
    if (!token) throw new Error("Credencial não configurada.");

    const resposta = await fetch(gw.api_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(secret ? { "x-secret-key": secret } : {}),
      },
      body: JSON.stringify({
        amount: Number((e.centavos / 100).toFixed(2)),
        amount_cents: e.centavos,
        method_pay: "pix",
        payment_method: "pix",
        description: e.descricao,
        external_id: e.referencia,
        postback: e.webhookUrl,
        webhook_url: e.webhookUrl,
        customer: {
          name: e.nome || "Cliente",
          email: e.email || `${e.telefone || "cliente"}@clarofatura.app`,
          phone: e.telefone,
          document: e.documento ?? "",
        },
      }),
    });

    const texto = await resposta.text();
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    let dados: unknown = null;
    try {
      dados = JSON.parse(texto);
    } catch {
      throw new Error("Resposta inválida da gateway.");
    }
    const copiaCola = extrairCopiaCola(dados);
    const id = busca(dados, ["idTransaction", "transaction_id", "transactionId", "id"]);
    if (!copiaCola || !id) throw new Error("Gateway não devolveu o código PIX.");
    return {
      transacaoId: id,
      copiaCola,
      qrcode: busca(dados, ["qrcode_image", "qr_code_base64", "qrCodeImage"]),
      status: busca(dados, ["status"]) ?? "pendente",
      expiraEm: busca(dados, ["expires_at", "expiration", "expiraEm"]),
    };
  },
  async consultarStatus() {
    return null;
  },
  pago: statusPago,
  async lerWebhook(request, corpoBruto, gw): Promise<WebhookLido> {
    let corpo: unknown = null;
    try {
      corpo = JSON.parse(corpoBruto);
    } catch {
      return { valido: false, transacaoId: null, status: null, evento: null };
    }
    // Quando houver um segredo de webhook cadastrado, exige o cabeçalho.
    const nomeSegredo = gw.secret_names.find((n) => n.toUpperCase().includes("WEBHOOK"));
    const esperado = nomeSegredo ? process.env[nomeSegredo] : undefined;
    const enviado =
      request.headers.get("x-webhook-secret") ?? request.headers.get("x-signature") ?? "";
    const valido = esperado ? enviado === esperado : true;
    return {
      valido,
      transacaoId: busca(corpo, ["idTransaction", "transaction_id", "transactionId", "id"]),
      status: busca(corpo, ["status", "payment_status"]),
      evento: busca(corpo, ["event", "type"]),
    };
  },
};

const propix: GatewayAdapter = {
  nome: "propix",
  configurado: () => Boolean(process.env["PROPIX_CLIENT_ID"] && process.env["PROPIX_CLIENT_SECRET"]),
  async criarPix(e: CriarPixEntrada): Promise<PixCriado> {
    const { criarCobrancaPix } = await import("@/lib/propix.server");
    const c = await criarCobrancaPix({
      centavos: e.centavos,
      nome: e.nome,
      telefone: e.telefone,
      email: e.email ?? null,
      documento: e.documento,
      descricao: e.descricao,
      referencia: e.referencia,
    });
    if (!c) throw new Error("ProPix não retornou a cobrança.");
    return { transacaoId: c.id, copiaCola: c.copia_cola, qrcode: c.qrcode, status: c.status };
  },
  async consultarStatus(id) {
    const { consultarTransacao } = await import("@/lib/propix.server");
    return consultarTransacao(id);
  },
  pago: (s) => ["COMPLETO", "APROVADO", "PAID", "SUCCESS"].includes((s ?? "").toString().toUpperCase()),
  async lerWebhook(request, corpoBruto): Promise<WebhookLido> {
    let corpo: any = null;
    try {
      corpo = JSON.parse(corpoBruto);
    } catch {
      return { valido: false, transacaoId: null, status: null, evento: null };
    }

    // ProPix não tem assinatura documentada. 
    // A segurança é feita via double-check no statusNaGateway do $slug.ts
    // que chama o consultarStatus acima.
    
    const transacaoId = corpo.transactionId || (corpo.transaction && corpo.transaction.transactionId);
    const status = corpo.status || (corpo.transaction && corpo.transaction.transactionState);
    const evento = corpo.event || (status === "COMPLETO" ? "DEPOSITO_COMPLETO" : null);

    return {
      valido: true, // Confiamos inicialmente, mas o router fará o double-check
      transacaoId: transacaoId ? String(transacaoId) : null,
      status: status ? String(status) : null,
      evento: evento ? String(evento) : null,
    };
  },
};

// ------------------------------------------------------------------ M2 Pay
const m2pay: GatewayAdapter = {
  nome: "m2pay",
  configurado: () => Boolean(process.env["M2PAY_API_KEY"]),
  async criarPix(e: CriarPixEntrada): Promise<PixCriado> {
    const { criarCobrancaPix } = await import("@/lib/m2pay.server");
    const c = await criarCobrancaPix({
      centavos: e.centavos,
      nome: e.nome,
      telefone: e.telefone,
      email: e.email ?? null,
      documento: e.documento ?? null,
      descricao: e.descricao,
      referencia: e.referencia,
      webhookUrl: e.webhookUrl,
    });
    if (!c) throw new Error("M2 Pay não retornou a cobrança.");
    return {
      transacaoId: c.id,
      copiaCola: c.copia_cola,
      qrcode: c.qrcode,
      status: c.status,
      expiraEm: c.expira_em ?? null,
    };
  },
  async consultarStatus(id) {
    const { consultarTransacao } = await import("@/lib/m2pay.server");
    return consultarTransacao(id);
  },
  pago: (s) => (s ?? "").toString().trim().toUpperCase() === "PAID",
  async lerWebhook(request, corpoBruto): Promise<WebhookLido> {
    let corpo: any = null;
    try {
      corpo = JSON.parse(corpoBruto);
    } catch {
      return { valido: false, transacaoId: null, status: null, evento: null };
    }
    // A M2 Pay não documenta assinatura: a segurança vem do double-check
    // feito por statusNaGateway (GET /api/sales/{id}/status) antes da baixa.
    const dados = corpo?.data ?? corpo;
    return {
      valido: true,
      transacaoId: busca(dados, ["transactionId", "transaction_id", "id"]),
      status: busca(dados, ["status", "transactionStatus"]),
      evento: busca(corpo, ["event", "type"]),
    };
  },
};

// ---------------------------------------------------------------- NowBanks
const nowbanks: GatewayAdapter = {
  nome: "nowbanks",
  configurado: () =>
    Boolean(process.env["NOWBANKS_CLIENT_ID"] && process.env["NOWBANKS_CLIENT_SECRET"]),
  async criarPix(e: CriarPixEntrada): Promise<PixCriado> {
    const { criarCobrancaPix } = await import("@/lib/nowbanks.server");
    const c = await criarCobrancaPix({
      centavos: e.centavos,
      nome: e.nome,
      telefone: e.telefone,
      documento: e.documento ?? null,
      referencia: e.referencia,
      webhookUrl: e.webhookUrl,
    });
    if (!c) throw new Error("NowBanks não retornou a cobrança.");
    return { transacaoId: c.id, copiaCola: c.copia_cola, qrcode: c.qrcode, status: c.status };
  },
  async consultarStatus(id) {
    const { consultarTransacao } = await import("@/lib/nowbanks.server");
    return consultarTransacao(id);
  },
  pago: (s) => (s ?? "").toString().trim().toUpperCase() === "COMPLETED",
  async lerWebhook(request, corpoBruto): Promise<WebhookLido> {
    let corpo: any = null;
    try {
      corpo = JSON.parse(corpoBruto);
    } catch {
      return { valido: false, transacaoId: null, status: null, evento: null };
    }

    // Assinatura HMAC-SHA256 do corpo bruto, header X-Signature.
    const segredo = process.env["NOWBANKS_WEBHOOK_SECRET"];
    const enviada = (
      request.headers.get("X-Signature") ??
      request.headers.get("x-signature") ??
      ""
    )
      .replace(/^sha256=/i, "")
      .trim();
    let valido = true;
    if (segredo) {
      try {
        const esperada = createHmac("sha256", segredo).update(corpoBruto).digest("hex");
        const a = Buffer.from(enviada);
        const b = Buffer.from(esperada);
        valido = a.length === b.length && timingSafeEqual(a, b);
      } catch (err) {
        console.error("[nowbanks] erro ao validar assinatura:", err);
        valido = false;
      }
    }

    const dados = corpo?.data ?? corpo;
    return {
      valido,
      transacaoId: busca(dados, ["transaction_id", "transactionId", "id"]),
      status: busca(dados, ["status"]),
      evento: busca(corpo, ["event", "type"]),
    };
  },
};

const REGISTRO: Record<string, GatewayAdapter> = {
  cashinpay,
  propix,
  m2pay,
  nowbanks,
  "pix-estatico": pixEstatico,
  generico,
};

export function adaptadorDe(gw: GatewayRegistro): GatewayAdapter {
  return REGISTRO[gw.adapter] ?? REGISTRO[gw.slug] ?? generico;
}

export const ADAPTADORES = Object.keys(REGISTRO);
