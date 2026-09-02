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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { adaptadorDe } = await import("@/lib/gateways/adapters.server");
        const { confirmarPagamento, statusNaGateway } = await import("@/lib/payment-router.server");

        const { data } = await supabaseAdmin
          .from("gateways_config")
          .select(
            "id, slug, rotulo, adapter, ativo, prioridade, api_url, ambiente, limite_diario, webhook_url, secret_names, observacoes",
          )
          .eq("slug", slug)
          .maybeSingle();

        if (!data) return new Response("Gateway desconhecida", { status: 404 });

        const gw = data as unknown as GatewayRegistro;
        const leitura = await adaptadorDe(gw).lerWebhook(request, corpoBruto, gw);

        await supabaseAdmin.from("webhooks_log").insert({
          gateway_slug: slug,
          evento: leitura.evento,
          transacao_gateway_id: leitura.transacaoId,
          assinatura_valida: leitura.valido,
          resumo: `status=${leitura.status ?? "-"}`,
        });

        if (!leitura.valido) return new Response("Assinatura inválida", { status: 401 });
        if (!leitura.transacaoId) return new Response("Transação ausente", { status: 400 });

        const { data: transacao } = await supabaseAdmin
          .from("transacoes_pix")
          .select("id, gateway_slug, transacao_gateway_id, valor_centavos, copia_cola, qrcode, status, expira_em")
          .eq("gateway_slug", slug)
          .eq("transacao_gateway_id", leitura.transacaoId)
          .maybeSingle();

        if (!transacao) return new Response("Transação não encontrada", { status: 404 });

        if (adaptadorDe(gw).pago(leitura.status)) {
          const confirmadoNaGateway = await statusNaGateway(transacao);
          if (!confirmadoNaGateway) {
            return new Response("Pagamento ainda não confirmado pela gateway", { status: 202 });
          }
          await confirmarPagamento(transacao.id);
        } else if (leitura.status) {
          await supabaseAdmin
            .from("transacoes_pix")
            .update({ status: leitura.status.toLowerCase() })
            .eq("id", transacao.id);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
