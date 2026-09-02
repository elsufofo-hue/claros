import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const querySchema = z.object({
  telefone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 11, { message: "Informe um telefone válido com DDD (11 dígitos)." }),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export const Route = createFileRoute("/api/public/faturas")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request }) => {
        const { requireAdminFromRequest } = await import("@/lib/api-auth.server");
        const adminId = await requireAdminFromRequest(request);
        if (!adminId) {
          return Response.json({ erro: "Não autorizado." }, { status: 401, headers: cors });
        }

        const url = new URL(request.url);
        const parsed = querySchema.safeParse({ telefone: url.searchParams.get("telefone") ?? "" });


        if (!parsed.success) {
          return Response.json(
            { erro: parsed.error.issues[0]?.message ?? "Parâmetro inválido." },
            { status: 400, headers: cors },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data, error } = await supabaseAdmin
          .from("faturas_por_telefone")
          .select(
            "telefone, nome, fatura_id, valor_em_aberto, valor_com_desconto, status, data_vencimento, pix_copia_e_cola, boleto_codigo, boleto_url, data_pagamento",
          )
          .eq("telefone", parsed.data.telefone)
          .maybeSingle();

        if (error) {
          return Response.json(
            { erro: "Não foi possível consultar no momento." },
            { status: 500, headers: cors },
          );
        }

        if (!data) {
          return Response.json(
            { erro: "Nenhuma fatura encontrada para este telefone." },
            { status: 404, headers: cors },
          );
        }

        return Response.json(
          {
            telefone: data.telefone,
            nome: data.nome,
            fatura_id: data.fatura_id,
            valor_em_aberto: Number(data.valor_em_aberto ?? 0),
            valor_com_desconto: Number(data.valor_com_desconto ?? 0),
            status: data.status,
            data_vencimento: data.data_vencimento,
            pix_copia_e_cola: data.pix_copia_e_cola,
            boleto_codigo: data.boleto_codigo,
            boleto_url: data.boleto_url,
            data_pagamento: data.data_pagamento,
          },
          { headers: cors },
        );
      },
    },
  },
});
