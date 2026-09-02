import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        status: z.string().optional(),
        limite: z.number().int().min(1).max(500).optional(),
        agrupar: z.boolean().optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<TransacaoAdmin[]> => {
    const agrupar = data.agrupar ?? true;
    const limite = data.limite ?? 100;

    let consulta = context.supabase
      .from("transacoes_pix")
      .select(
        "id, fatura_id, cliente_id, gateway_slug, transacao_gateway_id, valor_centavos, status, created_at, expira_em, pago_em, clientes(nome)",
      )
      .order("created_at", { ascending: false })
      .limit(agrupar ? 500 : limite);

    if (data.status && data.status !== "todos" && !agrupar) {
      consulta = consulta.eq("status", data.status);
    }

    const { data: linhas, error } = await consulta;
    if (error) throw new Error("Não foi possível carregar as transações.");

    type Linha = NonNullable<typeof linhas>[number];
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
      cliente_nome: (t as unknown as { clientes?: { nome: string } | null }).clientes?.nome ?? null,
      tentativas: 1,
    });

    if (!agrupar) return (linhas ?? []).map(mapear);

    const vigentes = new Map<string, TransacaoAdmin>();
    for (const linha of linhas ?? []) {
      const chave = (linha as { cliente_id: string | null }).cliente_id ?? linha.fatura_id;
      const existente = vigentes.get(chave);
      if (existente) existente.tentativas += 1;
      else vigentes.set(chave, mapear(linha));
    }

    let lista = [...vigentes.values()];
    if (data.status && data.status !== "todos") {
      lista = lista.filter((t) => t.status === data.status);
    }
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

export const listarLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{ pagamentos: LogPagamento[]; webhooks: LogWebhook[] }> => {
      const [{ data: pagamentos }, { data: webhooks }] = await Promise.all([
        context.supabase
          .from("pagamentos_log")
          .select("id, gateway_slug, nivel, http_status, mensagem, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        context.supabase
          .from("webhooks_log")
          .select("id, gateway_slug, evento, transacao_gateway_id, assinatura_valida, resumo, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const ids = [
        ...new Set(
          (webhooks ?? [])
            .map((w) => w.transacao_gateway_id)
            .filter((v): v is string => Boolean(v)),
        ),
      ];

      const porTransacao = new Map<
        string,
        { nome: string | null; telefone: string | null; valor: number; status: string }
      >();

      if (ids.length) {
        const { data: transacoes } = await context.supabase
          .from("transacoes_pix")
          .select("transacao_gateway_id, valor_centavos, status, clientes(nome, telefone)")
          .in("transacao_gateway_id", ids);

        for (const t of transacoes ?? []) {
          if (!t.transacao_gateway_id) continue;
          const c = (t as unknown as { clientes?: { nome: string; telefone: string } | null }).clientes;
          porTransacao.set(t.transacao_gateway_id, {
            nome: c?.nome ?? null,
            telefone: c?.telefone ?? null,
            valor: t.valor_centavos,
            status: t.status,
          });
        }
      }

      return {
        pagamentos: (pagamentos ?? []) as LogPagamento[],
        webhooks: (webhooks ?? []).map((w) => {
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
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        gateway: z.string().optional(),
        dias: z.number().int().min(1).max(365).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<PagamentoRecebido[]> => {
    const desde = new Date(Date.now() - (data.dias ?? 30) * 86400000).toISOString();

    let consulta = context.supabase
      .from("transacoes_pix")
      .select(
        "id, gateway_slug, transacao_gateway_id, valor_centavos, valor_pago_centavos, pago_em, clientes(nome, telefone), faturas(descricao, status, valor_desconto)",
      )
      .not("pago_em", "is", null)
      .gte("pago_em", desde)
      .order("pago_em", { ascending: false })
      .limit(300);

    if (data.gateway && data.gateway !== "todas") {
      consulta = consulta.eq("gateway_slug", data.gateway);
    }

    const { data: linhas, error } = await consulta;
    if (error) throw new Error("Não foi possível carregar os pagamentos recebidos.");

    const ids = [
      ...new Set(
        (linhas ?? []).map((l) => l.transacao_gateway_id).filter((v): v is string => Boolean(v)),
      ),
    ];

    const viaWebhook = new Set<string>();
    if (ids.length) {
      const { data: hooks } = await context.supabase
        .from("webhooks_log")
        .select("transacao_gateway_id")
        .in("transacao_gateway_id", ids);
      for (const h of hooks ?? []) {
        if (h.transacao_gateway_id) viaWebhook.add(h.transacao_gateway_id);
      }
    }

    return (linhas ?? []).map((l) => {
      const c = (l as unknown as { clientes?: { nome: string; telefone: string } | null }).clientes;
      const f = (
        l as unknown as {
          faturas?: { descricao: string; status: string; valor_desconto: number } | null;
        }
      ).faturas;
      return {
        id: l.id,
        cliente_nome: c?.nome ?? null,
        cliente_telefone: c?.telefone ?? null,
        gateway_slug: l.gateway_slug,
        valor_centavos: l.valor_pago_centavos ?? l.valor_centavos,
        valor_fatura_centavos: f ? Math.round(Number(f.valor_desconto) * 100) : null,
        pago_em: l.pago_em as string,
        confirmado_por:
          l.transacao_gateway_id && viaWebhook.has(l.transacao_gateway_id) ? "webhook" : "consulta",
        status_fatura: f?.status ?? null,
        descricao: f?.descricao ?? null,
      };
    });
  });

export type ResumoWebhookGateway = {
  gateway_slug: string;
  ultimo_em: string | null;
  total_24h: number;
};

export const resumoWebhooksPorGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ResumoWebhookGateway[]> => {
    const { data } = await context.supabase
      .from("webhooks_log")
      .select("gateway_slug, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);

    const limite = Date.now() - 86400000;
    const mapa = new Map<string, ResumoWebhookGateway>();
    for (const l of data ?? []) {
      const atual = mapa.get(l.gateway_slug) ?? {
        gateway_slug: l.gateway_slug,
        ultimo_em: null,
        total_24h: 0,
      };
      if (!atual.ultimo_em) atual.ultimo_em = l.created_at;
      if (new Date(l.created_at).getTime() >= limite) atual.total_24h += 1;
      mapa.set(l.gateway_slug, atual);
    }
    return [...mapa.values()];
  });

