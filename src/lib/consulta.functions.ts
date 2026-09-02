import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Normaliza para o padrão gravado no banco: DDD + número (10 ou 11 dígitos). */
function normalizarTelefone(valor: string): string {
  let d = valor.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  while (d.length > 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

const consultaSchema = z.object({
  telefone: z
    .string()
    .transform(normalizarTelefone)
    .refine((v) => v.length === 10 || v.length === 11, {
      message: "Informe um telefone válido.",
    }),
});

export type FaturaPublica = {
  id: string;
  descricao: string;
  referencia: string | null;
  valor_original: number;
  valor_desconto: number;
  vencimento: string;
  status: string;
};

export type ConsultaResultado = {
  encontrado: boolean;
  cliente?: { nome: string; telefone: string };
  faturas?: FaturaPublica[];
};

/**
 * Consulta pública por telefone. Roda apenas no servidor e devolve
 * somente os campos necessários — nenhuma tabela é exposta ao público.
 */
export const consultarFaturas = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => consultaSchema.parse(data))
  .handler(async ({ data }): Promise<ConsultaResultado> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Variantes toleram cadastros gravados com/sem DDI e com/sem o 9 extra.
    const t = data.telefone;
    const variantes = new Set<string>([t, `55${t}`]);
    if (t.length === 11 && t[2] === "9") variantes.add(t.slice(0, 2) + t.slice(3));
    if (t.length === 10) variantes.add(`${t.slice(0, 2)}9${t.slice(2)}`);

    const { data: clientes, error: erroCliente } = await supabaseAdmin
      .from("clientes")
      .select("id, nome, telefone")
      .in("telefone", [...variantes])
      .limit(1);


    if (erroCliente) throw new Error("Não foi possível consultar no momento.");
    const cliente = clientes?.[0];

    // Registro de acesso (silencioso, invisível para o visitante).
    const registrar = async (
      sucesso: boolean,
      valorOriginal: number | null,
      valorDesconto: number | null,
    ) => {
      try {
        await supabaseAdmin.from("acessos").insert({
          pagina: "/fatura",
          telefone_consultado: t,
          sucesso,
          valor_original: valorOriginal,
          valor_desconto: valorDesconto,
        });
      } catch {
        /* nunca interrompe a consulta do cliente */
      }
    };

    if (!cliente) {
      await registrar(false, null, null);
      return { encontrado: false };
    }

    // Apenas a fatura pendente do mês corrente — faturas pagas/canceladas
    // e de outros meses não são exibidas na consulta pública.
    const hoje = new Date();
    const primeiroDia = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
    const ultimoDia = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);

    const { data: faturas, error: erroFaturas } = await supabaseAdmin
      .from("faturas")
      .select("id, descricao, referencia, valor_original, valor_desconto, vencimento, status")
      .eq("cliente_id", cliente.id)
      .in("status", ["em_aberto", "vencida", "em_processamento", "falhou", "expirada"])
      .gte("vencimento", primeiroDia)
      .lte("vencimento", ultimoDia)
      .order("vencimento", { ascending: false })
      .limit(1);

    if (erroFaturas) throw new Error("Não foi possível consultar no momento.");

    const primeira = faturas?.[0];
    await registrar(
      Boolean(primeira),
      primeira ? Number(primeira.valor_original) : null,
      primeira ? Number(primeira.valor_desconto) || Number(primeira.valor_original) : null,
    );

    return {
      encontrado: true,
      cliente: { nome: cliente.nome, telefone: cliente.telefone ?? "" },
      faturas: (faturas ?? []).map((f) => ({
        id: f.id,
        descricao: f.descricao,
        referencia: f.referencia,
        valor_original: Number(f.valor_original),
        valor_desconto: Number(f.valor_desconto),
        vencimento: f.vencimento,
        status: f.status as string,
      })),
    };
  });


const pagamentoSchema = z.object({ fatura_id: z.string().uuid() });
const geracaoSchema = z.object({
  fatura_id: z.string().uuid(),
  request_key: z.string().uuid(),
  /** true = botão "Gerar novo PIX": ignora qualquer cobrança anterior. */
  forcar: z.boolean().optional(),
});

export type PixGerado = {
  valor: number;
  copia_cola: string;
  txid: string;
  status: string;
  disponivel: boolean;
  transacao_id?: string;
  gateway?: string;
  expira_em?: string | null;
  mensagem?: string;
};

/**
 * Gera a cobrança PIX da fatura através do Payment Router. Por padrão cria uma
 * NOVA cobrança na gateway a cada acesso; só reaproveita uma cobrança pendente
 * e válida quando o painel desativa "Gerar novo PIX a cada acesso" e o cliente
 * não pediu explicitamente um novo código. O valor é SEMPRE o valor com desconto.
 */
export const gerarPixFatura = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => geracaoSchema.parse(data))
  .handler(async ({ data }): Promise<PixGerado> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buscarTransacaoVigente, criarCobrancaPix } = await import(
      "@/lib/payment-router.server"
    );

    const { data: fatura, error } = await supabaseAdmin
      .from("faturas")
      .select("id, cliente_id, descricao, valor_original, valor_desconto, status")
      .eq("id", data.fatura_id)
      .maybeSingle();

    if (error || !fatura) throw new Error("Fatura não encontrada.");
    if (fatura.status === "paga") {
      return { valor: 0, copia_cola: "", txid: "", status: "paga", disponivel: false };
    }

    // Valor exato com desconto, convertido uma única vez para centavos.
    const bruto = Number(fatura.valor_desconto);
    const centavos = Math.round(bruto * 100);
    if (!Number.isFinite(centavos) || centavos <= 0) {
      return {
        valor: 0,
        copia_cola: "",
        txid: "",
        status: fatura.status as string,
        disponivel: false,
        mensagem: "Esta fatura não possui um valor com desconto válido para pagamento.",
      };
    }
    const valor = centavos / 100;

    // Reaproveitamento só quando o painel permite E o cliente não pediu novo PIX.
    let transacao = null as Awaited<ReturnType<typeof criarCobrancaPix>>;
    if (!data.forcar) {
      const { data: cfg } = await supabaseAdmin
        .from("roteamento_config")
        .select("novo_pix_por_acesso")
        .eq("id", true)
        .maybeSingle();
      if (cfg?.novo_pix_por_acesso === false) {
        transacao = await buscarTransacaoVigente(fatura.id, centavos);
      }
    }

    const { data: cliente } = await supabaseAdmin
      .from("clientes")
      .select("nome, telefone, email, documento")
      .eq("id", fatura.cliente_id)
      .maybeSingle();

    transacao ??= await criarCobrancaPix({
      faturaId: fatura.id,
      clienteId: fatura.cliente_id,
      centavos,
      nome: cliente?.nome ?? "Cliente",
      telefone: cliente?.telefone ?? "",
      email: cliente?.email ?? null,
      documento: cliente?.documento ?? null,
      descricao: fatura.descricao || "Fatura",
      requestKey: data.request_key,
      baseUrl: process.env["SITE_URL"] ?? "https://clarofatura.app",
    });

    if (!transacao || !transacao.copia_cola) {
      return {
        valor,
        copia_cola: "",
        txid: "",
        status: fatura.status as string,
        disponivel: false,
        mensagem: "Pagamento indisponível no momento. Tente novamente em alguns minutos.",
      };
    }

    // Mantém os campos legados da fatura em sincronia com a transação atual.
    await supabaseAdmin
      .from("faturas")
      .update({
        pix_txid: transacao.transacao_gateway_id,
        pix_copia_cola: transacao.copia_cola,
        pix_valor_centavos: centavos,
      })
      .eq("id", fatura.id);

    const { data: pendente } = await supabaseAdmin
      .from("pagamentos")
      .select("id, valor")
      .eq("fatura_id", fatura.id)
      .eq("status", "pendente")
      .limit(1)
      .maybeSingle();

    if (!pendente) {
      await supabaseAdmin.from("pagamentos").insert({
        fatura_id: fatura.id,
        cliente_id: fatura.cliente_id,
        valor,
        metodo: "pix",
        status: "pendente",
        gateway: transacao.gateway_slug,
        gateway_payment_id: transacao.transacao_gateway_id,
      });
    } else {
      await supabaseAdmin
        .from("pagamentos")
        .update({
          valor,
          gateway: transacao.gateway_slug,
          gateway_payment_id: transacao.transacao_gateway_id,
        })
        .eq("id", pendente.id);
    }

    return {
      valor,
      copia_cola: transacao.copia_cola,
      txid: transacao.transacao_gateway_id ?? "",
      status: transacao.status === "pago" ? "paga" : (fatura.status as string),
      disponivel: true,
      transacao_id: transacao.id,
      gateway: transacao.gateway_slug,
      expira_em: transacao.expira_em,
    };
  });

/**
 * Consulta leve usada pelo polling da tela — devolve o status atual da fatura
 * para atualizar a interface sem recarregar a página.
 */
export const consultarStatusFatura = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => pagamentoSchema.parse(data))
  .handler(async ({ data }): Promise<{ status: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { statusNaGateway, confirmarPagamento } = await import("@/lib/payment-router.server");

    const { data: fatura } = await supabaseAdmin
      .from("faturas")
      .select("id, status")
      .eq("id", data.fatura_id)
      .maybeSingle();

    if (!fatura) return { status: "em_aberto" };
    if (fatura.status === "paga") return { status: "paga" };

    const { data: transacao } = await supabaseAdmin
      .from("transacoes_pix")
      .select(
        "id, gateway_slug, transacao_gateway_id, valor_centavos, copia_cola, qrcode, status, expira_em",
      )
      .eq("fatura_id", fatura.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (transacao) {
      if (transacao.status === "pago") return { status: "paga" };
      const pago = await statusNaGateway(transacao);
      if (pago) {
        await confirmarPagamento(transacao.id);
        return { status: "paga" };
      }
    }

    return { status: (fatura.status as string) ?? "em_aberto" };
  });


/**
 * A baixa do pagamento acontece EXCLUSIVAMENTE por confirmação do gateway:
 * webhook unificado (/api/public/webhooks/<gateway>) ou o
 * polling em consultarStatusFatura. Não existe confirmação manual pelo
 * visitante — isso permitiria marcar faturas como pagas sem pagamento real.
 */


