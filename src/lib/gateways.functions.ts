import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ESTRATEGIAS } from "@/lib/gateways/types";

export type GatewayConfig = {
  id: string;
  slug: string;
  rotulo: string;
  adapter: string;
  ativo: boolean;
  prioridade: number;
  api_url: string | null;
  ambiente: string;
  limite_diario: number | null;
  webhook_url: string | null;
  secret_names: string[];
  observacoes: string | null;
  configurado: boolean;
};

export type RoteamentoConfig = {
  estrategia: string;
  gateway_fixa: string | null;
  novo_pix_por_acesso: boolean;
};

const COLUNAS =
  "id, slug, rotulo, adapter, ativo, prioridade, api_url, ambiente, limite_diario, webhook_url, secret_names, observacoes";

/** Confere apenas a PRESENÇA dos segredos — nenhum valor sai do servidor. */
function estaConfigurado(g: {
  adapter: string;
  slug: string;
  secret_names: string[] | null;
}): boolean {
  const chave = g.adapter || g.slug;
  if (chave === "cashinpay") return Boolean(process.env["CASHINPAY_SECRET_KEY"]);
  if (chave === "propix") return Boolean(process.env["PROPIX_CLIENT_ID"] && process.env["PROPIX_CLIENT_SECRET"]);
  if (chave === "m2pay") return Boolean(process.env["M2PAY_API_KEY"]);
  if (chave === "nowbanks")
    return Boolean(process.env["NOWBANKS_CLIENT_ID"] && process.env["NOWBANKS_CLIENT_SECRET"]);
  if (chave === "pix-estatico") return Boolean(process.env["PIX_CHAVE"]);
  const nomes = g.secret_names ?? [];
  return nomes.length > 0 && nomes.every((n) => Boolean(process.env[n]));
}

export const listarGateways = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GatewayConfig[]> => {
    const { data, error } = await context.supabase
      .from("gateways_config")
      .select(COLUNAS)
      .order("prioridade", { ascending: true });

    if (error) throw new Error("Não foi possível carregar os gateways.");

    return (data ?? []).map((g) => ({
      id: g.id,
      slug: g.slug,
      rotulo: g.rotulo,
      adapter: g.adapter,
      ativo: g.ativo,
      prioridade: g.prioridade,
      api_url: g.api_url,
      ambiente: g.ambiente,
      limite_diario: g.limite_diario,
      webhook_url: g.webhook_url,
      secret_names: g.secret_names ?? [],
      observacoes: g.observacoes,
      configurado: estaConfigurado(g),
    }));
  });

export const lerRoteamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RoteamentoConfig> => {
    const { data } = await context.supabase
      .from("roteamento_config")
      .select("estrategia, gateway_fixa, novo_pix_por_acesso")
      .eq("id", true)
      .maybeSingle();
    return {
      estrategia: data?.estrategia ?? "prioridade",
      gateway_fixa: data?.gateway_fixa ?? null,
      novo_pix_por_acesso: data?.novo_pix_por_acesso ?? true,
    };
  });

const roteamentoSchema = z.object({
  estrategia: z.enum(ESTRATEGIAS),
  gateway_fixa: z.string().uuid().nullable().optional(),
  novo_pix_por_acesso: z.boolean().optional(),
});

export const salvarRoteamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => roteamentoSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await exigirAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("roteamento_config")
      .update({
        estrategia: data.estrategia,
        gateway_fixa: data.estrategia === "fixa" ? (data.gateway_fixa ?? null) : null,
        ...(typeof data.novo_pix_por_acesso === "boolean"
          ? { novo_pix_por_acesso: data.novo_pix_por_acesso }
          : {}),
      })
      .eq("id", true);
    if (error) throw new Error("Não foi possível salvar a estratégia.");
    return { ok: true };
  });

const gatewaySchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen."),
  rotulo: z.string().trim().min(2).max(80),
  adapter: z.string().trim().min(2).max(40),
  api_url: z.string().trim().url().max(300).nullable().optional(),
  ambiente: z.enum(["producao", "teste"]),
  prioridade: z.number().int().min(1).max(999),
  limite_diario: z.number().int().min(0).max(1_000_000).nullable().optional(),
  webhook_url: z.string().trim().url().max(300).nullable().optional(),
  secret_names: z.array(z.string().trim().regex(/^[A-Z_][A-Z0-9_]*$/)).max(6),
  observacoes: z.string().trim().max(500).nullable().optional(),
  ativo: z.boolean(),
});

/** Somente administradores podem alterar gateways. */
async function exigirAdmin(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Acesso restrito a administradores.");
}

export const salvarGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => gatewaySchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await exigirAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const registro = {
      slug: data.slug,
      rotulo: data.rotulo,
      adapter: data.adapter,
      api_url: data.api_url ?? null,
      ambiente: data.ambiente,
      prioridade: data.prioridade,
      limite_diario: data.limite_diario ?? null,
      webhook_url: data.webhook_url ?? null,
      secret_names: data.secret_names,
      observacoes: data.observacoes ?? null,
      ativo: data.ativo,
      updated_at: new Date().toISOString(),
    };

    const { error } = data.id
      ? await supabaseAdmin.from("gateways_config").update(registro).eq("id", data.id)
      : await supabaseAdmin.from("gateways_config").insert(registro);

    if (error) throw new Error("Não foi possível salvar o gateway.");
    return { ok: true };
  });

const atualizarSchema = z.object({
  id: z.string().uuid(),
  ativo: z.boolean().optional(),
  prioridade: z.number().int().min(1).max(999).optional(),
});

export const atualizarGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => atualizarSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const patch: { updated_at: string; ativo?: boolean; prioridade?: number } = {
      updated_at: new Date().toISOString(),
    };
    if (typeof data.ativo === "boolean") patch.ativo = data.ativo;
    if (typeof data.prioridade === "number") patch.prioridade = data.prioridade;

    const { error } = await context.supabase
      .from("gateways_config")
      .update(patch)
      .eq("id", data.id);

    if (error) throw new Error("Não foi possível salvar a alteração.");
    return { ok: true };
  });

export const removerGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await exigirAdmin(context.userId);
    const { error } = await context.supabase.from("gateways_config").delete().eq("id", data.id);
    if (error) throw new Error("Não foi possível remover o gateway.");
    return { ok: true };
  });

/** Define um único gateway ativo (modo exclusivo). */
export const usarSomente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await context.supabase.from("gateways_config").update({ ativo: false }).neq("id", data.id);
    const { error } = await context.supabase
      .from("gateways_config")
      .update({ ativo: true })
      .eq("id", data.id);
    if (error) throw new Error("Não foi possível ativar o gateway.");
    return { ok: true };
  });

/** Ativa todos os gateways (modo rotação). */
export const ativarTodos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("gateways_config")
      .update({ ativo: true })
      .neq("slug", "");
    if (error) throw new Error("Não foi possível ativar os gateways.");
    return { ok: true };
  });
