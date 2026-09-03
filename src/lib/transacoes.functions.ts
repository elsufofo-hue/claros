import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type TransacaoAdmin = {
  id: string;
  fatura_id: string;
  gateway_slug: string;
  transacao_gateway_id: string | null;
  valor_centavos: number;
  status: string;
  created_at: string;
  expira_em: string | null;
  pago_em: string | null;
  cliente_nome: string | null;
  tentativas: number;
};

export const listarTransacoes = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        status: z.string().optional(),
        limite: z.number().int().min(1).max(500).optional(),
        agrupar: z.boolean().optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }): Promise<TransacaoAdmin[]> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();
    const { sql } = await import("@/db");

    const agrupar = data.agrupar ?? true;
    const limite = data.limite ?? 100;
    const filtrarStatus = data.status && data.status !== "todos" ? data.status : null;

    type Linha = {
      id: string;
      fatura_id: string;
      cliente_id: string | null;
      gateway_slug: string;
      transacao_gateway_id: string | null;
      valor_centavos: number;
      status: string;
      created_at: string;
      expira_em: string | null;
      pago_em: string | null;
      cliente_nome: string | null;
    };

    const linhas = (await sql`
      SELECT t.id, t.fatura_id, t.cliente_id, t.gateway_slug, t.transacao_gateway_id,
             t.valor_centavos, t.status, t.created_at, t.expira_em, t.pago_em,
             c.nome AS cliente_nome
      FROM transacoes_pix t
      LEFT JOIN clientes c ON c.id = t.cliente_id
      ${filtrarStatus && !agrupar ? sql`WHERE t.status = ${filtrarStatus}` : sql``}
      ORDER BY t.created_at DESC
      LIMIT ${agrupar ? 500 : limite}
    `) as unknown as Linha[];

    const mapear = (t: Linha): TransacaoAdmin => ({
      id: t.id,
      fatura_id: t.fatura_id,
      gateway_slug: t.gateway_slug,
      transacao_gateway_id: t.transacao_gateway_id,
      valor_centavos: t.valor_centavos,
      status: t.status,
      created_at: t.created_at,
      expira_em: t.expira_em,
      pago_em: t.pago_em,
      cliente_nome: t.cliente_nome,
      tentativas: 1,
    });

    if (!agrupar) return linhas.map(mapear);

    const vigentes = new Map<string, TransacaoAdmin>();
    for (const linha of linhas) {
      const chave = linha.cliente_id ?? linha.fatura_id;
      const existente = vigentes.get(chave);
      if (existente) existente.tentativas += 1;
      else vigentes.set(chave, mapear(linha));
    }

    let lista = [...vigentes.values()];
    if (filtrarStatus) lista = lista.filter((t) => t.status === filtrarStatus);
    return lista.slice(0, limite);
  });

export type LogPagamento = {
  id: string;
  gateway_slug: string;
  nivel: string;
  http_status: number | null;
  mensagem: string;
  created_at: string;
};

export type LogWebhook = {
  id: string;
  gateway_slug: string;
  evento: string | null;
  transacao_gateway_id: string | null;
  assinatura_valida: boolean;
  resumo: string | null;
  created_at: string;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  valor_centavos: number | null;
  status_transacao: string | null;
  reconhecido: boolean;
};

export const listarLogs = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ pagamentos: LogPagamento[]; webhooks: LogWebhook[] }> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();
    const { sql } = await import("@/db");

    const [pagamentos, webhooks] = await Promise.all([
      sql`
        SELECT id, gateway_slug, nivel, http_status, mensagem, created_at
        FROM pagamentos_log
        ORDER BY created_at DESC
        LIMIT 100
      ` as unknown as Promise<LogPagamento[]>,
      sql`
        SELECT id, gateway_slug, evento, transacao_gateway_id, assinatura_valida, resumo, created_at
        FROM webhooks_log
        ORDER BY created_at DESC
        LIMIT 100
      ` as unknown as Promise<
        Omit<LogWebhook, "cliente_nome" | "cliente_telefone" | "valor_centavos" | "status_transacao" | "reconhecido">[]
      >,
    ]);

    const ids = [
      ...new Set(
        webhooks.map((w) => w.transacao_gateway_id).filter((v): v is string => Boolean(v)),
      ),
    ];

    const porTransacao = new Map<
      string,
      { nome: string | null; telefone: string | null; valor: number; status: string }
    >();

    if (ids.length) {
      const transacoes = (await sql`
        SELECT t.transacao_gateway_id, t.valor_centavos, t.status,
               c.nome AS cliente_nome, c.telefone AS cliente_telefone
        FROM transacoes_pix t
        LEFT JOIN clientes c ON c.id = t.cliente_id
        WHERE t.transacao_gateway_id IN ${sql(ids)}
      `) as unknown as {
        transacao_gateway_id: string | null;
        valor_centavos: number;
        status: string;
        cliente_nome: string | null;
        cliente_telefone: string | null;
      }[];

      for (const t of transacoes) {
        if (!t.transacao_gateway_id) continue;
        porTransacao.set(t.transacao_gateway_id, {
          nome: t.cliente_nome,
          telefone: t.cliente_telefone,
          valor: t.valor_centavos,
          status: t.status,
        });
      }
    }

    return {
      pagamentos,
      webhooks: webhooks.map((w) => {
        const t = w.transacao_gateway_id ? porTransacao.get(w.transacao_gateway_id) : undefined;
        return {
          ...w,
          cliente_nome: t?.nome ?? null,
          cliente_telefone: t?.telefone ?? null,
          valor_centavos: t?.valor ?? null,
          status_transacao: t?.status ?? null,
          reconhecido: Boolean(t),
        } as LogWebhook;
      }),
    };
  },
);

export type PagamentoRecebido = {
  id: string;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  gateway_slug: string;
  valor_centavos: number;
  valor_fatura_centavos: number | null;
  pago_em: string;
  confirmado_por: "webhook" | "consulta";
  status_fatura: string | null;
  descricao: string | null;
};

export const listarPagamentosRecebidos = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        gateway: z.string().optional(),
        dias: z.number().int().min(1).max(365).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }): Promise<PagamentoRecebido[]> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();
    const { sql } = await import("@/db");

    const desde = new Date(Date.now() - (data.dias ?? 30) * 86400000).toISOString();
    const filtrarGw = data.gateway && data.gateway !== "todas" ? data.gateway : null;

    const linhas = (await sql`
      SELECT t.id, t.gateway_slug, t.transacao_gateway_id, t.valor_centavos,
             t.valor_pago_centavos, t.pago_em,
             c.nome AS cliente_nome, c.telefone AS cliente_telefone,
             f.descricao AS fatura_descricao, f.status::text AS fatura_status,
             f.valor_desconto AS fatura_valor_desconto
      FROM transacoes_pix t
      LEFT JOIN clientes c ON c.id = t.cliente_id
      LEFT JOIN faturas f ON f.id = t.fatura_id
      WHERE t.pago_em IS NOT NULL AND t.pago_em >= ${desde}
      ${filtrarGw ? sql`AND t.gateway_slug = ${filtrarGw}` : sql``}
      ORDER BY t.pago_em DESC
      LIMIT 300
    `) as unknown as {
      id: string;
      gateway_slug: string;
      transacao_gateway_id: string | null;
      valor_centavos: number;
      valor_pago_centavos: number | null;
      pago_em: string;
      cliente_nome: string | null;
      cliente_telefone: string | null;
      fatura_descricao: string | null;
      fatura_status: string | null;
      fatura_valor_desconto: number | null;
    }[];

    const ids = [
      ...new Set(
        linhas.map((l) => l.transacao_gateway_id).filter((v): v is string => Boolean(v)),
      ),
    ];

    const viaWebhook = new Set<string>();
    if (ids.length) {
      const hooks = (await sql`
        SELECT DISTINCT transacao_gateway_id
        FROM webhooks_log
        WHERE transacao_gateway_id IN ${sql(ids)}
      `) as unknown as { transacao_gateway_id: string | null }[];
      for (const h of hooks) {
        if (h.transacao_gateway_id) viaWebhook.add(h.transacao_gateway_id);
      }
    }

    return linhas.map((l) => ({
      id: l.id,
      cliente_nome: l.cliente_nome,
      cliente_telefone: l.cliente_telefone,
      gateway_slug: l.gateway_slug,
      valor_centavos: l.valor_pago_centavos ?? l.valor_centavos,
      valor_fatura_centavos:
        l.fatura_valor_desconto != null
          ? Math.round(Number(l.fatura_valor_desconto) * 100)
          : null,
      pago_em: l.pago_em,
      confirmado_por:
        l.transacao_gateway_id && viaWebhook.has(l.transacao_gateway_id)
          ? "webhook"
          : "consulta",
      status_fatura: l.fatura_status,
      descricao: l.fatura_descricao,
    }));
  });

export type ResumoWebhookGateway = {
  gateway_slug: string;
  ultimo_em: string | null;
  total_24h: number;
};

export const resumoWebhooksPorGateway = createServerFn({ method: "POST" }).handler(
  async (): Promise<ResumoWebhookGateway[]> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();
    const { sql } = await import("@/db");

    const linhas = (await sql`
      SELECT gateway_slug,
             max(created_at) AS ultimo_em,
             count(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS total_24h
      FROM webhooks_log
      GROUP BY gateway_slug
    `) as unknown as ResumoWebhookGateway[];

    return linhas;
  },
);
