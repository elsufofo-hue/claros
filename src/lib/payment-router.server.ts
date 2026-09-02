/**
 * Payment Router — escolhe a gateway de cada cobrança PIX e cria a transação.
 *
 * Estratégias (public.roteamento_config.estrategia):
 *  - "prioridade": sempre na ordem de prioridade (menor número primeiro)
 *  - "rodizio":    alterna entre as gateways ativas (round-robin)
 *  - "fixa":       usa somente a gateway escolhida no painel
 *
 * Em qualquer estratégia há failover: se a gateway falhar, a próxima ativa é
 * tentada e cada falha é registrada em public.pagamentos_log.
 */
import { adaptadorDe } from "./gateways/adapters.server";
import { nomeProdutoGateway } from "./gateways/produto";
import type { Estrategia, GatewayRegistro } from "./gateways/types";

export type TransacaoPix = {
  id: string;
  gateway_slug: string;
  transacao_gateway_id: string | null;
  valor_centavos: number;
  copia_cola: string | null;
  qrcode: string | null;
  status: string;
  expira_em: string | null;
};

type SolicitacaoPix = {
  id: string;
  status: string;
  transacao_id: string | null;
};

const MINUTOS_EXPIRACAO = Number(process.env["PIX_EXPIRACAO_MINUTOS"] ?? 30) || 30;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function reservarSolicitacao(
  requestKey: string,
  faturaId: string,
): Promise<{ criada: boolean; solicitacao: SolicitacaoPix }> {
  const db = await admin();
  const tabela = (db as any).from("pix_generation_requests");
  const { data, error } = await tabela
    .insert({ request_key: requestKey, fatura_id: faturaId })
    .select("id, status, transacao_id")
    .single();
  if (!error && data) return { criada: true, solicitacao: data as SolicitacaoPix };
  if (error?.code !== "23505") throw new Error("Não foi possível iniciar a geração do PIX.");

  const { data: existente, error: erroLeitura } = await (db as any)
    .from("pix_generation_requests")
    .select("id, status, transacao_id")
    .eq("request_key", requestKey)
    .single();
  if (erroLeitura || !existente) throw new Error("Não foi possível recuperar a solicitação do PIX.");
  return { criada: false, solicitacao: existente as SolicitacaoPix };
}

async function concluirSolicitacao(id: string, transacaoId: string): Promise<void> {
  const db = await admin();
  await (db as any)
    .from("pix_generation_requests")
    .update({ status: "concluida", transacao_id: transacaoId, erro: null })
    .eq("id", id);
}

async function falharSolicitacao(id: string, mensagem: string): Promise<void> {
  const db = await admin();
  await (db as any)
    .from("pix_generation_requests")
    .update({ status: "falhou", erro: mensagem.slice(0, 500) })
    .eq("id", id);
}

async function transacaoDaSolicitacao(
  solicitacao: SolicitacaoPix,
): Promise<TransacaoPix | null> {
  if (solicitacao.status !== "concluida" || !solicitacao.transacao_id) return null;
  const db = await admin();
  const { data } = await db
    .from("transacoes_pix")
    .select("id, gateway_slug, transacao_gateway_id, valor_centavos, copia_cola, qrcode, status, expira_em")
    .eq("id", solicitacao.transacao_id)
    .maybeSingle();
  return (data as unknown as TransacaoPix | null) ?? null;
}

export async function registrarLog(entrada: {
  gateway_slug: string;
  fatura_id?: string | null;
  nivel?: string;
  http_status?: number | null;
  mensagem: string;
}): Promise<void> {
  try {
    const db = await admin();
    await db.from("pagamentos_log").insert({
      gateway_slug: entrada.gateway_slug,
      fatura_id: entrada.fatura_id ?? null,
      nivel: entrada.nivel ?? "erro",
      http_status: entrada.http_status ?? null,
      mensagem: entrada.mensagem.slice(0, 500),
    });
  } catch {
    /* log nunca interrompe o pagamento */
  }
}

async function carregarAtivos(): Promise<GatewayRegistro[]> {
  const db = await admin();
  const { data } = await db
    .from("gateways_config")
    .select(
      "id, slug, rotulo, adapter, ativo, prioridade, api_url, ambiente, limite_diario, webhook_url, secret_names, observacoes",
    )
    .eq("ativo", true)
    .order("prioridade", { ascending: true });
  return (data ?? []) as unknown as GatewayRegistro[];
}

async function config(): Promise<{ estrategia: Estrategia; gateway_fixa: string | null; ponteiro: number }> {
  const db = await admin();
  const { data } = await db
    .from("roteamento_config")
    .select("estrategia, gateway_fixa, ponteiro")
    .eq("id", true)
    .maybeSingle();
  return {
    estrategia: ((data?.estrategia as Estrategia) ?? "prioridade") as Estrategia,
    gateway_fixa: data?.gateway_fixa ?? null,
    ponteiro: data?.ponteiro ?? 0,
  };
}

async function dentroDoLimite(gw: GatewayRegistro): Promise<boolean> {
  if (!gw.limite_diario || gw.limite_diario <= 0) return true;
  const db = await admin();
  const inicio = new Date();
  inicio.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from("transacoes_pix")
    .select("id", { count: "exact", head: true })
    .eq("gateway_slug", gw.slug)
    .gte("created_at", inicio.toISOString());
  return (count ?? 0) < gw.limite_diario;
}

/** Ordem de tentativa conforme a estratégia configurada. */
async function ordemDeTentativa(): Promise<GatewayRegistro[]> {
  const ativos = await carregarAtivos();
  if (ativos.length === 0) return [];
  const cfg = await config();

  if (cfg.estrategia === "fixa" && cfg.gateway_fixa) {
    const fixa = ativos.find((g) => g.id === cfg.gateway_fixa);
    return fixa ? [fixa] : [];
  }

  if (cfg.estrategia === "rodizio") {
    const db = await admin();
    const { data: posicao } = await (db as any).rpc("avancar_ponteiro_gateway", {
      p_total: ativos.length,
    });
    const inicio = Math.abs(Number(posicao ?? cfg.ponteiro ?? 0)) % ativos.length;
    return [...ativos.slice(inicio), ...ativos.slice(0, inicio)];
  }

  return ativos;
}

export type PedidoCobranca = {
  faturaId: string;
  clienteId: string | null;
  centavos: number;
  nome: string;
  telefone: string;
  email?: string | null;
  documento?: string | null;
  descricao: string;
  baseUrl: string;
  /** Identifica uma ação do usuário; retries da mesma ação reutilizam seu resultado. */
  requestKey: string;
};

const COLUNAS_TRANSACAO =
  "id, gateway_slug, transacao_gateway_id, valor_centavos, copia_cola, qrcode, status, expira_em";

/** Transação pendente ainda dentro da validade (só usada quando o reaproveitamento é permitido). */
export async function buscarTransacaoVigente(
  faturaId: string,
  centavos: number,
): Promise<TransacaoPix | null> {
  const db = await admin();
  const { data } = await db
    .from("transacoes_pix")
    .select(COLUNAS_TRANSACAO)
    .eq("fatura_id", faturaId)
    .eq("status", "pendente")
    .is("substituida_em", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const t = data as unknown as TransacaoPix;
  if (!t.copia_cola) return null;
  if (t.valor_centavos !== centavos) return null;
  if (t.expira_em && new Date(t.expira_em).getTime() <= Date.now()) {
    await db.from("transacoes_pix").update({ status: "expirada" }).eq("id", t.id);
    return null;
  }
  return t;
}

/** Marca as cobranças pendentes anteriores da fatura como substituídas. */
async function substituirAnteriores(faturaId: string, exceto: string): Promise<void> {
  const db = await admin();
  await db
    .from("transacoes_pix")
    .update({ status: "substituida", substituida_em: new Date().toISOString() })
    .eq("fatura_id", faturaId)
    .eq("status", "pendente")
    .neq("id", exceto);
}

export async function criarCobrancaPix(pedido: PedidoCobranca): Promise<TransacaoPix | null> {
  const reserva = await reservarSolicitacao(pedido.requestKey, pedido.faturaId);
  if (!reserva.criada) {
    const existente = await transacaoDaSolicitacao(reserva.solicitacao);
    if (existente) return existente;
    if (reserva.solicitacao.status === "processando") {
      throw new Error("Esta solicitação PIX já está sendo processada.");
    }
    throw new Error("Esta solicitação PIX já foi utilizada.");
  }

  try {
    const db = await admin();
    const { data: fatura } = await db
      .from("faturas")
      .select("status")
      .eq("id", pedido.faturaId)
      .maybeSingle();
    if (!fatura || fatura.status === "paga") {
      const mensagem = fatura ? "A fatura já está paga." : "Fatura não encontrada.";
      await falharSolicitacao(reserva.solicitacao.id, mensagem);
      throw new Error(mensagem);
    }
    const ordem = await ordemDeTentativa();
    if (ordem.length === 0) {
      await registrarLog({
        gateway_slug: "-",
        fatura_id: pedido.faturaId,
        mensagem: "Nenhuma gateway ativa disponível.",
      });
      await falharSolicitacao(reserva.solicitacao.id, "Nenhuma gateway ativa disponível.");
      return null;
    }

    const referencia = pedido.requestKey;

    for (const gw of ordem) {
    const adaptador = adaptadorDe(gw);

    if (!adaptador.configurado(gw)) {
      await registrarLog({
        gateway_slug: gw.slug,
        fatura_id: pedido.faturaId,
        nivel: "aviso",
        mensagem: "Credenciais ausentes — gateway ignorada.",
      });
      continue;
    }
    if (!(await dentroDoLimite(gw))) {
      await registrarLog({
        gateway_slug: gw.slug,
        fatura_id: pedido.faturaId,
        nivel: "aviso",
        mensagem: "Limite diário atingido — gateway ignorada.",
      });
      continue;
    }

    try {
      const criado = await adaptador.criarPix({
        gateway: gw,
        centavos: pedido.centavos,
        nome: pedido.nome,
        telefone: pedido.telefone,
        email: pedido.email ?? null,
        documento: pedido.documento ?? null,
        // Somente o payload da gateway usa o nome real do produto; as telas do
        // cliente continuam com pedido.descricao (faturas.descricao).
        descricao: nomeProdutoGateway(),
        referencia,
        webhookUrl: gw.webhook_url || `${pedido.baseUrl}/api/public/webhooks/${gw.slug}`,
      });

      const expira =
        criado.expiraEm ?? new Date(Date.now() + MINUTOS_EXPIRACAO * 60_000).toISOString();

      const { data: inserida, error } = await db
        .from("transacoes_pix")
        .insert({
          fatura_id: pedido.faturaId,
          cliente_id: pedido.clienteId,
          gateway_slug: gw.slug,
          gateway_id: gw.id,
          transacao_gateway_id: criado.transacaoId,
          valor_centavos: pedido.centavos,
          copia_cola: criado.copiaCola,
          qrcode: criado.qrcode ?? null,
          status: "pendente",
          idempotency_key: pedido.requestKey,
          expira_em: expira,
        })
        .select(
          "id, gateway_slug, transacao_gateway_id, valor_centavos, copia_cola, qrcode, status, expira_em",
        )
        .maybeSingle();

      if (error || !inserida) {
        throw new Error(error?.message ?? "Falha ao gravar a transação.");
      }

      // A partir de agora só a transação nova é a vigente.
      await substituirAnteriores(pedido.faturaId, (inserida as unknown as TransacaoPix).id);

      await registrarLog({
        gateway_slug: gw.slug,
        fatura_id: pedido.faturaId,
        nivel: "info",
        mensagem: `PIX criado (${pedido.centavos} centavos).`,
      });

      const transacao = inserida as unknown as TransacaoPix;
      await concluirSolicitacao(reserva.solicitacao.id, transacao.id);
      return transacao;
    } catch (erro) {
      await registrarLog({
        gateway_slug: gw.slug,
        fatura_id: pedido.faturaId,
        mensagem: erro instanceof Error ? erro.message : "Falha desconhecida na gateway.",
      });
    }
    }

    await falharSolicitacao(reserva.solicitacao.id, "Nenhum gateway conseguiu gerar o PIX.");
    return null;
  } catch (erro) {
    await falharSolicitacao(
      reserva.solicitacao.id,
      erro instanceof Error ? erro.message : "Falha desconhecida ao gerar o PIX.",
    );
    throw erro;
  }
}

/** Consulta o status da transação diretamente na gateway que a criou. */
export async function statusNaGateway(transacao: TransacaoPix): Promise<boolean> {
  if (!transacao.transacao_gateway_id) return false;
  const db = await admin();
  const { data } = await db
    .from("gateways_config")
    .select(
      "id, slug, rotulo, adapter, ativo, prioridade, api_url, ambiente, limite_diario, webhook_url, secret_names, observacoes",
    )
    .eq("slug", transacao.gateway_slug)
    .maybeSingle();
  if (!data) return false;
  const gw = data as unknown as GatewayRegistro;
  const adaptador = adaptadorDe(gw);
  try {
    const status = await adaptador.consultarStatus(transacao.transacao_gateway_id, gw);
    return adaptador.pago(status);
  } catch (erro) {
    await registrarLog({
      gateway_slug: gw.slug,
      mensagem: erro instanceof Error ? erro.message : "Falha ao consultar status.",
    });
    return false;
  }
}

/** Marca a transação, o pagamento e a fatura como pagos (idempotente). */
export async function confirmarPagamento(transacaoId: string): Promise<void> {
  const db = await admin();
  const agora = new Date().toISOString();

  const { data } = await db
    .from("transacoes_pix")
    .select("id, fatura_id, status, transacao_gateway_id, valor_centavos, cliente_id, gateway_slug")
    .eq("id", transacaoId)
    .maybeSingle();
  if (!data || data.status === "pago") return;

  await db
    .from("transacoes_pix")
    .update({ status: "pago", pago_em: agora, valor_pago_centavos: data.valor_centavos })
    .eq("id", data.id);
  // Nenhuma outra cobrança da mesma fatura continua válida.
  await db
    .from("transacoes_pix")
    .update({ status: "cancelada", substituida_em: agora })
    .eq("fatura_id", data.fatura_id)
    .eq("status", "pendente")
    .neq("id", data.id);
  await db
    .from("faturas")
    .update({ status: "paga", data_pagamento: agora })
    .eq("id", data.fatura_id);

  const { data: pagamento } = await db
    .from("pagamentos")
    .select("id")
    .eq("fatura_id", data.fatura_id)
    .eq("status", "pendente")
    .limit(1)
    .maybeSingle();

  if (pagamento) {
    await db
      .from("pagamentos")
      .update({ status: "confirmado", pago_em: agora })
      .eq("id", pagamento.id);
  } else {
    await db.from("pagamentos").insert({
      fatura_id: data.fatura_id,
      cliente_id: data.cliente_id,
      valor: data.valor_centavos / 100,
      metodo: "pix",
      status: "confirmado",
      gateway: data.gateway_slug,
      gateway_payment_id: data.transacao_gateway_id,
      pago_em: agora,
    });
  }
}
