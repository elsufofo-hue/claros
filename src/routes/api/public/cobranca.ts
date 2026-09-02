import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z
  .object({
    telefone: z
      .string()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v.length === 11, { message: "Informe um telefone válido com DDD (11 dígitos)." })
      .optional(),
    fatura_id: z.string().uuid().optional(),
  })
  .refine((v) => v.telefone || v.fatura_id, {
    message: "Informe telefone ou fatura_id.",
  });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export const Route = createFileRoute("/api/public/cobranca")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const { requireAdminFromRequest } = await import("@/lib/api-auth.server");
        const adminId = await requireAdminFromRequest(request);
        if (!adminId) {
          return Response.json({ erro: "Não autorizado." }, { status: 401, headers: cors });
        }

        let corpo: unknown;
        try {
          corpo = await request.json();
        } catch {
          return Response.json({ erro: "Corpo inválido." }, { status: 400, headers: cors });
        }

        const parsed = bodySchema.safeParse(corpo);

        if (!parsed.success) {
          return Response.json(
            { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." },
            { status: 400, headers: cors },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { criarCobrancaPix } = await import("@/lib/payment-router.server");

        let faturaId = parsed.data.fatura_id ?? null;
        let nomeCliente = "Cliente";
        let telefone = parsed.data.telefone ?? "";

        if (!faturaId && parsed.data.telefone) {
          const { data: cliente } = await supabaseAdmin
            .from("clientes")
            .select("id, nome, telefone")
            .eq("telefone", parsed.data.telefone)
            .maybeSingle();

          if (!cliente) {
            return Response.json(
              { erro: "Nenhuma fatura encontrada para este telefone." },
              { status: 404, headers: cors },
            );
          }

          nomeCliente = cliente.nome;
          telefone = cliente.telefone;

          const { data: fatura } = await supabaseAdmin
            .from("faturas")
            .select("id")
            .eq("cliente_id", cliente.id)
            .in("status", ["em_aberto", "vencida"])
            .order("vencimento", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (!fatura) {
            return Response.json(
              { erro: "Nenhuma fatura pendente para este telefone." },
              { status: 404, headers: cors },
            );
          }
          faturaId = fatura.id;
        }

        const { data: fatura, error } = await supabaseAdmin
          .from("faturas")
          .select("id, cliente_id, valor_desconto, valor_original, vencimento, status, pix_copia_cola, boleto_codigo, boleto_url")
          .eq("id", faturaId!)
          .maybeSingle();

        if (error || !fatura) {
          return Response.json({ erro: "Fatura não encontrada." }, { status: 404, headers: cors });
        }

        if (!["em_aberto", "vencida"].includes(fatura.status)) {
          return Response.json(
            { erro: "Esta fatura não está pendente de pagamento." },
            { status: 409, headers: cors },
          );
        }

        if (!telefone) {
          const { data: cliente } = await supabaseAdmin
            .from("clientes")
            .select("nome, telefone, email, documento")
            .eq("id", fatura.cliente_id)
            .maybeSingle();
          nomeCliente = cliente?.nome ?? nomeCliente;
          telefone = cliente?.telefone ?? "";
        }

        // Valor cobrado é SEMPRE o valor com desconto.
        const valor = Number(fatura.valor_desconto);
        if (!Number.isFinite(valor) || valor <= 0) {
          return Response.json(
            { erro: "A fatura não possui um valor com desconto válido." },
            { status: 422, headers: cors },
          );
        }

        const { data: clienteCompleto } = await supabaseAdmin
          .from("clientes")
          .select("nome, telefone, email, documento")
          .eq("id", fatura.cliente_id)
          .maybeSingle();

        const centavos = Math.round(valor * 100);
        const cobranca = await criarCobrancaPix({
          faturaId: fatura.id,
          clienteId: fatura.cliente_id,
          centavos,
          nome: clienteCompleto?.nome ?? nomeCliente,
          telefone: clienteCompleto?.telefone ?? telefone,
          email: clienteCompleto?.email ?? null,
          documento: clienteCompleto?.documento ?? null,
          descricao: "Fatura",
          requestKey: crypto.randomUUID(),
          baseUrl: new URL(request.url).origin,
        });
        if (!cobranca?.copia_cola) {
          return Response.json(
            { erro: "Não foi possível gerar a cobrança agora." },
            { status: 503, headers: cors },
          );
        }

        return Response.json(
          {
            fatura_id: fatura.id,
            valor_cobrado: valor,
            data_vencimento: fatura.vencimento,
            pix_copia_e_cola: cobranca.copia_cola,
            transaction_id: cobranca.transacao_gateway_id,
            gateway: cobranca.gateway_slug,
          },
          { headers: cors },
        );
      },
    },
  },
});
