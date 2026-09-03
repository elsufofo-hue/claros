import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

type GatewayRow = {
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
  secret_names: string[] | null;
  observacoes: string | null;
};

/** Confere apenas a PRESENÇA dos segredos — nenhum valor sai do servidor. */
function estaConfigurado(g: {
  adapter: string;
  slug: string;
  secret_names: string[] | null;
}): boolean {
  const chave = g.adapter || g.slug;
  if (chave === "cashinpay") return Boolean(process.env["CASHINPAY_SECRET_KEY"]);
  if (chave === "propix")
    return Boolean(process.env["PROPIX_CLIENT_ID"] && process.env["PROPIX_CLIENT_SECRET"]);
  if (chave === "m2pay") return Boolean(process.env["M2PAY_API_KEY"]);
  if (chave === "nowbanks")
    return Boolean(process.env["NOWBANKS_CLIENT_ID"] && process.env["NOWBANKS_CLIENT_SECRET"]);
  if (chave === "pix-estatico") return Boolean(process.env["PIX_CHAVE"]);
  const nomes = g.secret_names ?? [];
  return nomes.length > 0 && nomes.every((n) => Boolean(process.env[n]));
}

export const listarGateways = createServerFn({ method: "POST" }).handler(
  async (): Promise<GatewayConfig[]> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();
    const { sql } = await import("@/db");

    const linhas = (await sql`
      SELECT id, slug, rotulo, adapter, ativo, prioridade, api_url, ambiente,
             limite_diario, webhook_url, secret_names, observacoes
      FROM gateways_config
      ORDER BY prioridade ASC
    `) as unknown as GatewayRow[];

    return linhas.map((g) => ({
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
  },
);

export const lerRoteamento = createServerFn({ method: "POST" }).handler(
  async (): Promise<RoteamentoConfig> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();
    const { sql, primeira } = await import("@/db");

    const data = primeira<{
      estrategia: string | null;
      gateway_fixa: string | null;
      novo_pix_por_acesso: boolean | null;
    }>(
      await sql`
        SELECT estrategia, gateway_fixa, novo_pix_por_acesso
        FROM roteamento_config
        WHERE id = true
      `,
    );
    return {
      estrategia: data?.estrategia ?? "prioridade",
      gateway_fixa: data?.gateway_fixa ?? null,
      novo_pix_por_acesso: data?.novo_pix_por_acesso ?? true,
    };
  },
);

const roteamentoSchema = z.object({
  estrategia: z.enum(ESTRATEGIAS),
  gateway_fixa: z.string().uuid().nullable().optional(),
  novo_pix_por_acesso: z.boolean().optional(),
});

export const salvarRoteamento = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => roteamentoSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();
    const { sql } = await import("@/db");

    const gatewayFixa = data.estrategia === "fixa" ? (data.gateway_fixa ?? null) : null;
    if (typeof data.novo_pix_por_acesso === "boolean") {
      await sql`
        UPDATE roteamento_config
        SET estrategia = ${data.estrategia}, gateway_fixa = ${gatewayFixa},
            novo_pix_por_acesso = ${data.novo_pix_por_acesso}, updated_at = now()
        WHERE id = true
      `;
    } else {
      await sql`
        UPDATE roteamento_config
        SET estrategia = ${data.estrategia}, gateway_fixa = ${gatewayFixa}, updated_at = now()
        WHERE id = true
      `;
    }
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

export const salvarGateway = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => gatewaySchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();
    const { sql, pgArray } = await import("@/db");

    if (data.id) {
      await sql`
        UPDATE gateways_config SET
          slug = ${data.slug}, rotulo = ${data.rotulo}, adapter = ${data.adapter},
          api_url = ${data.api_url ?? null}, ambiente = ${data.ambiente},
          prioridade = ${data.prioridade}, limite_diario = ${data.limite_diario ?? null},
          webhook_url = ${data.webhook_url ?? null}, secret_names = ${pgArray(data.secret_names)},
          observacoes = ${data.observacoes ?? null}, ativo = ${data.ativo}, updated_at = now()
        WHERE id = ${data.id}
      `;
    } else {
      await sql`
        INSERT INTO gateways_config (
          slug, rotulo, adapter, api_url, ambiente, prioridade, limite_diario,
          webhook_url, secret_names, observacoes, ativo
        ) VALUES (
          ${data.slug}, ${data.rotulo}, ${data.adapter}, ${data.api_url ?? null},
          ${data.ambiente}, ${data.prioridade}, ${data.limite_diario ?? null},
          ${data.webhook_url ?? null}, ${pgArray(data.secret_names)}, ${data.observacoes ?? null},
          ${data.ativo}
        )
      `;
    }
    return { ok: true };
  });

const atualizarSchema = z.object({
  id: z.string().uuid(),
  ativo: z.boolean().optional(),
  prioridade: z.number().int().min(1).max(999).optional(),
});

export const atualizarGateway = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => atualizarSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();
    const { sql } = await import("@/db");

    if (typeof data.ativo === "boolean" && typeof data.prioridade === "number") {
      await sql`UPDATE gateways_config SET ativo = ${data.ativo}, prioridade = ${data.prioridade}, updated_at = now() WHERE id = ${data.id}`;
    } else if (typeof data.ativo === "boolean") {
      await sql`UPDATE gateways_config SET ativo = ${data.ativo}, updated_at = now() WHERE id = ${data.id}`;
    } else if (typeof data.prioridade === "number") {
      await sql`UPDATE gateways_config SET prioridade = ${data.prioridade}, updated_at = now() WHERE id = ${data.id}`;
    }
    return { ok: true };
  });

export const removerGateway = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();
    const { sql } = await import("@/db");
    await sql`DELETE FROM gateways_config WHERE id = ${data.id}`;
    return { ok: true };
  });

/** Define um único gateway ativo (modo exclusivo). */
export const usarSomente = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();
    const { sql } = await import("@/db");
    await sql`UPDATE gateways_config SET ativo = false, updated_at = now() WHERE id <> ${data.id}`;
    await sql`UPDATE gateways_config SET ativo = true, updated_at = now() WHERE id = ${data.id}`;
    return { ok: true };
  });

/** Ativa todos os gateways (modo rotação). */
export const ativarTodos = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true }> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();
    const { sql } = await import("@/db");
    await sql`UPDATE gateways_config SET ativo = true, updated_at = now()`;
    return { ok: true };
  },
);
