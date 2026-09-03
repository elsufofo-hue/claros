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

        const { sql, primeira } = await import("@/db");
        const { criarCobrancaPix } = await import("@/lib/payment-router.server");

        let faturaId = parsed.data.fatura_id ?? null;
        let nomeCliente = "Cliente";
        let telefone = parsed.data.telefone ?? "";

        if (!faturaId && parsed.data.telefone) {
          const cliente = primeira<{ id: string; nome: string; telefone: string }>(
            await sql`
              SELECT id, nome, telefone FROM clientes
              WHERE telefone = ${parsed.data.telefone}
            `,
          );

          if (!cliente) {
            return Response.json(
              { erro: "Nenhuma fatura encontrada para este telefone." },
              { status: 404, headers: cors },
            );
          }

          nomeCliente = cliente.nome;
          telefone = cliente.telefone;

          const fat = primeira<{ id: string }>(
            await sql`
              SELECT id FROM faturas
              WHERE cliente_id = ${cliente.id} AND status IN ('em_aberto', 'vencida')
              ORDER BY vencimento ASC
              LIMIT 1
            `,
          );

          if (!fat) {
            return Response.json(
              { erro: "Nenhuma fatura pendente para este telefone." },
              { status: 404, headers: cors },
            );
          }
          faturaId = fat.id;
        }

        const fatura = primeira<{
          id: string;
          cliente_id: string;
          valor_desconto: number;
          valor_original: number;
          vencimento: string;
          status: string;
          pix_copia_cola: string | null;
          boleto_codigo: string | null;
          boleto_url: string | null;
        }>(
          await sql`
            SELECT id, cliente_id, valor_desconto, valor_original, vencimento, status::text,
                   pix_copia_cola, boleto_codigo, boleto_url
            FROM faturas
            WHERE id = ${faturaId!}
          `,
        );

        if (!fatura) {
          return Response.json({ erro: "Fatura não encontrada." }, { status: 404, headers: cors });
        }

        if (!["em_aberto", "vencida"].includes(fatura.status)) {
          return Response.json(
            { erro: "Esta fatura não está pendente de pagamento." },
            { status: 409, headers: cors },
          );
        }

        // Valor cobrado é SEMPRE o valor com desconto.
        const valor = Number(fatura.valor_desconto);
        if (!Number.isFinite(valor) || valor <= 0) {
          return Response.json(
            { erro: "A fatura não possui um valor com desconto válido." },
            { status: 422, headers: cors },
          );
        }

        const clienteCompleto = primeira<{
          nome: string;
          telefone: string;
          email: string | null;
          documento: string | null;
        }>(
          await sql`
            SELECT nome, telefone, email, documento FROM clientes
            WHERE id = ${fatura.cliente_id}
          `,
        );
        if (!telefone) {
          nomeCliente = clienteCompleto?.nome ?? nomeCliente;
          telefone = clienteCompleto?.telefone ?? "";
        }

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
