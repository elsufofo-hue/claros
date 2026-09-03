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
    const { sql, primeira } = await import("@/db");

    // Variantes toleram cadastros gravados com/sem DDI e com/sem o 9 extra.
    const t = data.telefone;
    const variantes = new Set<string>([t, `55${t}`]);
    if (t.length === 11 && t[2] === "9") variantes.add(t.slice(0, 2) + t.slice(3));
    if (t.length === 10) variantes.add(`${t.slice(0, 2)}9${t.slice(2)}`);

    let cliente: { id: string; nome: string; telefone: string } | null;
    try {
      cliente = primeira(
        await sql`
          SELECT id, nome, telefone
          FROM clientes
          WHERE telefone IN ${sql([...variantes])}
          LIMIT 1
        `,
      );
    } catch {
      throw new Error("Não foi possível consultar no momento.");
    }

    // Registro de acesso (silencioso, invisível para o visitante).
    const registrar = async (
      sucesso: boolean,
      valorOriginal: number | null,
      valorDesconto: number | null,
    ) => {
      try {
        await sql`
          INSERT INTO acessos (pagina, telefone_consultado, sucesso, valor_original, valor_desconto)
          VALUES ('/fatura', ${t}, ${sucesso}, ${valorOriginal}, ${valorDesconto})
        `;
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

    let faturas: FaturaPublica[];
    try {
      faturas = (await sql`
        SELECT id, descricao, referencia,
               valor_original::float8 AS valor_original,
               valor_desconto::float8 AS valor_desconto,
               to_char(vencimento, 'YYYY-MM-DD') AS vencimento,
               status::text AS status
        FROM faturas
        WHERE cliente_id = ${cliente.id}
          AND status IN ('em_aberto', 'vencida', 'em_processamento', 'falhou', 'expirada')
          AND vencimento >= ${primeiroDia}
          AND vencimento <= ${ultimoDia}
        ORDER BY vencimento DESC
        LIMIT 1
      `) as unknown as FaturaPublica[];
    } catch {
      throw new Error("Não foi possível consultar no momento.");
    }

    const prim = faturas[0];
    await registrar(
      Boolean(prim),
      prim ? Number(prim.valor_original) : null,
      prim ? Number(prim.valor_desconto) || Number(prim.valor_original) : null,
    );

    return {
      encontrado: true,
      cliente: { nome: cliente.nome, telefone: cliente.telefone ?? "" },
      faturas: faturas.map((f) => ({
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
    const { sql, primeira } = await import("@/db");
    const { buscarTransacaoVigente, criarCobrancaPix } = await import(
      "@/lib/payment-router.server"
    );

    const fatura = primeira<{
      id: string;
      cliente_id: string;
      descricao: string;
      valor_original: number;
      valor_desconto: number;
      status: string;
    }>(
      await sql`
        SELECT id, cliente_id, descricao, valor_original, valor_desconto, status::text
        FROM faturas
        WHERE id = ${data.fatura_id}
      `,
    );

    if (!fatura) throw new Error("Fatura não encontrada.");
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
        status: fatura.status,
        disponivel: false,
        mensagem: "Esta fatura não possui um valor com desconto válido para pagamento.",
      };
    }
    const valor = centavos / 100;

    // Reaproveitamento só quando o painel permite E o cliente não pediu novo PIX.
    let transacao = null as Awaited<ReturnType<typeof criarCobrancaPix>>;
    if (!data.forcar) {
      const cfg = primeira<{ novo_pix_por_acesso: boolean }>(
        await sql`SELECT novo_pix_por_acesso FROM roteamento_config WHERE id = true`,
      );
      if (cfg?.novo_pix_por_acesso === false) {
        transacao = await buscarTransacaoVigente(fatura.id, centavos);
      }
    }

    const cliente = primeira<{
      nome: string;
      telefone: string;
      email: string | null;
      documento: string | null;
    }>(
      await sql`
        SELECT nome, telefone, email, documento
        FROM clientes
        WHERE id = ${fatura.cliente_id}
      `,
    );

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
        status: fatura.status,
        disponivel: false,
        mensagem: "Pagamento indisponível no momento. Tente novamente em alguns minutos.",
      };
    }

    // Mantém os campos legados da fatura em sincronia com a transação atual.
    await sql`
      UPDATE faturas
      SET pix_txid = ${transacao.transacao_gateway_id},
          pix_copia_cola = ${transacao.copia_cola},
          pix_valor_centavos = ${centavos},
          updated_at = now()
      WHERE id = ${fatura.id}
    `;

    const pendente = primeira<{ id: string }>(
      await sql`
        SELECT id FROM pagamentos
        WHERE fatura_id = ${fatura.id} AND status = 'pendente'
        LIMIT 1
      `,
    );

    if (!pendente) {
      await sql`
        INSERT INTO pagamentos (fatura_id, cliente_id, valor, metodo, status, gateway, gateway_payment_id)
        VALUES (
          ${fatura.id}, ${fatura.cliente_id}, ${valor}, 'pix', 'pendente',
          ${transacao.gateway_slug}, ${transacao.transacao_gateway_id}
        )
      `;
    } else {
      await sql`
        UPDATE pagamentos
        SET valor = ${valor}, gateway = ${transacao.gateway_slug},
            gateway_payment_id = ${transacao.transacao_gateway_id}, updated_at = now()
        WHERE id = ${pendente.id}
      `;
    }

    return {
      valor,
      copia_cola: transacao.copia_cola,
      txid: transacao.transacao_gateway_id ?? "",
      status: transacao.status === "pago" ? "paga" : fatura.status,
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
    const { sql, primeira } = await import("@/db");
    const { statusNaGateway, confirmarPagamento } = await import("@/lib/payment-router.server");

    const fatura = primeira<{ id: string; status: string }>(
      await sql`SELECT id, status::text FROM faturas WHERE id = ${data.fatura_id}`,
    );

    if (!fatura) return { status: "em_aberto" };
    if (fatura.status === "paga") return { status: "paga" };

    const transacao = primeira<{
      id: string;
      gateway_slug: string;
      transacao_gateway_id: string | null;
      valor_centavos: number;
      copia_cola: string | null;
      qrcode: string | null;
      status: string;
      expira_em: string | null;
    }>(
      await sql`
        SELECT id, gateway_slug, transacao_gateway_id, valor_centavos, copia_cola,
               qrcode, status, expira_em
        FROM transacoes_pix
        WHERE fatura_id = ${fatura.id}
        ORDER BY created_at DESC
        LIMIT 1
      `,
    );

    if (transacao) {
      if (transacao.status === "pago") return { status: "paga" };
      const pago = await statusNaGateway(transacao);
      if (pago) {
        await confirmarPagamento(transacao.id);
        return { status: "paga" };
      }
    }

    return { status: fatura.status ?? "em_aberto" };
  });

/**
 * A baixa do pagamento acontece EXCLUSIVAMENTE por confirmação do gateway:
 * webhook unificado (/api/public/webhooks/<gateway>) ou o
 * polling em consultarStatusFatura. Não existe confirmação manual pelo
 * visitante — isso permitiria marcar faturas como pagas sem pagamento real.
 */
