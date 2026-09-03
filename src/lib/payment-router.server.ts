/**
 * Payment Router — escolhe a gateway de cada cobrança PIX e cria a transação.
 *
 * Estratégias (roteamento_config.estrategia):
 *  - "prioridade": sempre na ordem de prioridade (menor número primeiro)
 *  - "rodizio":    alterna entre as gateways ativas (round-robin)
 *  - "fixa":       usa somente a gateway escolhida no painel
 *
 * Em qualquer estratégia há failover: se a gateway falhar, a próxima ativa é
 * tentada e cada falha é registrada em pagamentos_log.
 */
import { sql, primeira } from "@/db";
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

const COLUNAS_GATEWAY = sql`
  id, slug, rotulo, adapter, ativo, prioridade, api_url, ambiente,
  limite_diario, webhook_url, secret_names, observacoes
`;

const COLUNAS_TRANSACAO = sql`
  id, gateway_slug, transacao_gateway_id, valor_centavos, copia_cola, qrcode, status, expira_em
`;

async function reservarSolicitacao(
  requestKey: string,
  faturaId: string,
): Promise<{ criada: boolean; solicitacao: SolicitacaoPix }> {
  try {
    const nova = primeira<SolicitacaoPix>(
      await sql`
        INSERT INTO pix_generation_requests (request_key, fatura_id)
        VALUES (${requestKey}, ${faturaId})
        RETURNING id, status, transacao_id
      `,
    );
    if (nova) return { criada: true, solicitacao: nova };
  } catch (erro) {
    // 23505 = unique_violation (request_key já existe)
    const code = (erro as { code?: string })?.code;
    if (code !== "23505") {
      throw new Error("Não foi possível iniciar a geração do PIX.");
    }
  }

  const existente = primeira<SolicitacaoPix>(
    await sql`
      SELECT id, status, transacao_id
      FROM pix_generation_requests
      WHERE request_key = ${requestKey}
    `,
  );
  if (!existente) throw new Error("Não foi possível recuperar a solicitação do PIX.");
  return { criada: false, solicitacao: existente };
}

async function concluirSolicitacao(id: string, transacaoId: string): Promise<void> {
  await sql`
    UPDATE pix_generation_requests
    SET status = 'concluida', transacao_id = ${transacaoId}, erro = NULL, updated_at = now()
    WHERE id = ${id}
  `;
}

async function falharSolicitacao(id: string, mensagem: string): Promise<void> {
  await sql`
    UPDATE pix_generation_requests
    SET status = 'falhou', erro = ${mensagem.slice(0, 500)}, updated_at = now()
    WHERE id = ${id}
  `;
}

async function transacaoDaSolicitacao(
  solicitacao: SolicitacaoPix,
): Promise<TransacaoPix | null> {
  if (solicitacao.status !== "concluida" || !solicitacao.transacao_id) return null;
  return primeira<TransacaoPix>(
    await sql`
      SELECT ${COLUNAS_TRANSACAO}
      FROM transacoes_pix
      WHERE id = ${solicitacao.transacao_id}
    `,
  );
}

export async function registrarLog(entrada: {
  gateway_slug: string;
  fatura_id?: string | null;
  nivel?: string;
  http_status?: number | null;
  mensagem: string;
}): Promise<void> {
  try {
    await sql`
      INSERT INTO pagamentos_log (gateway_slug, fatura_id, nivel, http_status, mensagem)
      VALUES (
        ${entrada.gateway_slug},
        ${entrada.fatura_id ?? null},
        ${entrada.nivel ?? "erro"},
        ${entrada.http_status ?? null},
        ${entrada.mensagem.slice(0, 500)}
      )
    `;
  } catch {
    /* log nunca interrompe o pagamento */
  }
}

async function carregarAtivos(): Promise<GatewayRegistro[]> {
  return (await sql`
    SELECT ${COLUNAS_GATEWAY}
    FROM gateways_config
    WHERE ativo = true
    ORDER BY prioridade ASC
  `) as unknown as GatewayRegistro[];
}

async function config(): Promise<{
  estrategia: Estrategia;
  gateway_fixa: string | null;
  ponteiro: number;
}> {
  const data = primeira<{
    estrategia: string | null;
    gateway_fixa: string | null;
    ponteiro: number | null;
  }>(
    await sql`
      SELECT estrategia, gateway_fixa, ponteiro
      FROM roteamento_config
      WHERE id = true
    `,
  );
  return {
    estrategia: ((data?.estrategia as Estrategia) ?? "prioridade") as Estrategia,
    gateway_fixa: data?.gateway_fixa ?? null,
    ponteiro: data?.ponteiro ?? 0,
  };
}

async function dentroDoLimite(gw: GatewayRegistro): Promise<boolean> {
  if (!gw.limite_diario || gw.limite_diario <= 0) return true;
  const inicio = new Date();
  inicio.setUTCHours(0, 0, 0, 0);
  const linha = primeira<{ total: number }>(
    await sql`
      SELECT count(*)::int AS total
      FROM transacoes_pix
      WHERE gateway_slug = ${gw.slug} AND created_at >= ${inicio.toISOString()}
    `,
  );
  return (linha?.total ?? 0) < gw.limite_diario;
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
    const linha = primeira<{ pos: number }>(
      await sql`SELECT avancar_ponteiro_gateway(${ativos.length}) AS pos`,
    );
    const inicio =
      Math.abs(Number(linha?.pos ?? cfg.ponteiro ?? 0)) % ativos.length;
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

/** Transação pendente ainda dentro da validade (só usada quando o reaproveitamento é permitido). */
export async function buscarTransacaoVigente(
  faturaId: string,
  centavos: number,
): Promise<TransacaoPix | null> {
  const t = primeira<TransacaoPix>(
    await sql`
      SELECT ${COLUNAS_TRANSACAO}
      FROM transacoes_pix
      WHERE fatura_id = ${faturaId}
        AND status = 'pendente'
        AND substituida_em IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
  );

  if (!t) return null;
  if (!t.copia_cola) return null;
  if (t.valor_centavos !== centavos) return null;
  if (t.expira_em && new Date(t.expira_em).getTime() <= Date.now()) {
    await sql`UPDATE transacoes_pix SET status = 'expirada', updated_at = now() WHERE id = ${t.id}`;
    return null;
  }
  return t;
}

/** Marca as cobranças pendentes anteriores da fatura como substituídas. */
async function substituirAnteriores(faturaId: string, exceto: string): Promise<void> {
  await sql`
    UPDATE transacoes_pix
    SET status = 'substituida', substituida_em = ${new Date().toISOString()}, updated_at = now()
    WHERE fatura_id = ${faturaId} AND status = 'pendente' AND id <> ${exceto}
  `;
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
    const fatura = primeira<{ status: string }>(
      await sql`SELECT status FROM faturas WHERE id = ${pedido.faturaId}`,
    );
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

        const inserida = primeira<TransacaoPix>(
          await sql`
            INSERT INTO transacoes_pix (
              fatura_id, cliente_id, gateway_slug, gateway_id, transacao_gateway_id,
              valor_centavos, copia_cola, qrcode, status, idempotency_key, expira_em
            ) VALUES (
              ${pedido.faturaId}, ${pedido.clienteId}, ${gw.slug}, ${gw.id},
              ${criado.transacaoId}, ${pedido.centavos}, ${criado.copiaCola},
              ${criado.qrcode ?? null}, 'pendente', ${pedido.requestKey}, ${expira}
            )
            RETURNING ${COLUNAS_TRANSACAO}
          `,
        );

        if (!inserida) throw new Error("Falha ao gravar a transação.");

        // A partir de agora só a transação nova é a vigente.
        await substituirAnteriores(pedido.faturaId, inserida.id);

        await registrarLog({
          gateway_slug: gw.slug,
          fatura_id: pedido.faturaId,
          nivel: "info",
          mensagem: `PIX criado (${pedido.centavos} centavos).`,
        });

        await concluirSolicitacao(reserva.solicitacao.id, inserida.id);
        return inserida;
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
  const data = primeira(
    await sql`
      SELECT ${COLUNAS_GATEWAY}
      FROM gateways_config
      WHERE slug = ${transacao.gateway_slug}
    `,
  );
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
  const agora = new Date().toISOString();

  const data = primeira<{
    id: string;
    fatura_id: string;
    status: string;
    transacao_gateway_id: string | null;
    valor_centavos: number;
    cliente_id: string | null;
    gateway_slug: string;
  }>(
    await sql`
      SELECT id, fatura_id, status, transacao_gateway_id, valor_centavos, cliente_id, gateway_slug
      FROM transacoes_pix
      WHERE id = ${transacaoId}
    `,
  );
  if (!data || data.status === "pago") return;

  await sql`
    UPDATE transacoes_pix
    SET status = 'pago', pago_em = ${agora}, valor_pago_centavos = ${data.valor_centavos},
        updated_at = now()
    WHERE id = ${data.id}
  `;
  // Nenhuma outra cobrança da mesma fatura continua válida.
  await sql`
    UPDATE transacoes_pix
    SET status = 'cancelada', substituida_em = ${agora}, updated_at = now()
    WHERE fatura_id = ${data.fatura_id} AND status = 'pendente' AND id <> ${data.id}
  `;
  await sql`
    UPDATE faturas
    SET status = 'paga', data_pagamento = ${agora}, updated_at = now()
    WHERE id = ${data.fatura_id}
  `;

  const pagamento = primeira<{ id: string }>(
    await sql`
      SELECT id FROM pagamentos
      WHERE fatura_id = ${data.fatura_id} AND status = 'pendente'
      LIMIT 1
    `,
  );

  if (pagamento) {
    await sql`
      UPDATE pagamentos
      SET status = 'confirmado', pago_em = ${agora}, updated_at = now()
      WHERE id = ${pagamento.id}
    `;
  } else {
    await sql`
      INSERT INTO pagamentos (
        fatura_id, cliente_id, valor, metodo, status, gateway, gateway_payment_id, pago_em
      ) VALUES (
        ${data.fatura_id}, ${data.cliente_id}, ${data.valor_centavos / 100}, 'pix',
        'confirmado', ${data.gateway_slug}, ${data.transacao_gateway_id}, ${agora}
      )
    `;
  }
}
