/**
 * Webhook genérico por gateway: /api/public/webhooks/<slug>
 *
 * A validação da assinatura fica a cargo do adaptador da gateway.
 * Toda chamada é registrada em public.webhooks_log; pagamentos repetidos
 * são ignorados pela idempotência de `confirmarPagamento`.
 */
import { createFileRoute } from "@tanstack/react-router";

import type { GatewayRegistro } from "@/lib/gateways/types";

export const Route = createFileRoute("/api/public/webhooks/$slug")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const slug = params.slug;
        const corpoBruto = await request.text();

        const { sql, primeira } = await import("@/db");
        const { adaptadorDe } = await import("@/lib/gateways/adapters.server");
        const { confirmarPagamento, statusNaGateway } = await import("@/lib/payment-router.server");

        const data = primeira(
          await sql`
            SELECT id, slug, rotulo, adapter, ativo, prioridade, api_url, ambiente,
                   limite_diario, webhook_url, secret_names, observacoes
            FROM gateways_config
            WHERE slug = ${slug}
            LIMIT 1
          `,
        );

        if (!data) return new Response("Gateway desconhecida", { status: 404 });

        const gw = data as unknown as GatewayRegistro;
        const leitura = await adaptadorDe(gw).lerWebhook(request, corpoBruto, gw);

        await sql`
          INSERT INTO webhooks_log (gateway_slug, evento, transacao_gateway_id, assinatura_valida, resumo)
          VALUES (${slug}, ${leitura.evento ?? null}, ${leitura.transacaoId ?? null},
                  ${leitura.valido}, ${`status=${leitura.status ?? "-"}`})
        `;

        if (!leitura.valido) return new Response("Assinatura inválida", { status: 401 });
        if (!leitura.transacaoId) return new Response("Transação ausente", { status: 400 });

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
            WHERE gateway_slug = ${slug} AND transacao_gateway_id = ${leitura.transacaoId}
            LIMIT 1
          `,
        );

        if (!transacao) return new Response("Transação não encontrada", { status: 404 });

        if (adaptadorDe(gw).pago(leitura.status)) {
          const confirmadoNaGateway = await statusNaGateway(transacao);
          if (!confirmadoNaGateway) {
            return new Response("Pagamento ainda não confirmado pela gateway", { status: 202 });
          }
          await confirmarPagamento(transacao.id);
        } else if (leitura.status) {
          await sql`
            UPDATE transacoes_pix SET status = ${leitura.status.toLowerCase()}, updated_at = now()
            WHERE id = ${transacao.id}
          `;
        }

        return Response.json({ ok: true });
      },
    },
  },
});
