import { createServerFn } from "@tanstack/react-start";

export const setupProPix = createServerFn({ method: "POST" }).handler(async () => {
  const { exigirAdmin } = await import("./auth.server");
  exigirAdmin();
  const { sql, primeira } = await import("@/db");

  const existing = primeira(
    await sql`SELECT id FROM gateways_config WHERE adapter = 'propix' LIMIT 1`,
  );

  if (existing) {
    return { success: true, message: "ProPix já existe no banco." };
  }

  await sql`
    INSERT INTO gateways_config (slug, rotulo, adapter, ativo, prioridade, secret_names, ambiente)
    VALUES ('propix', 'ProPix', 'propix', false, 2,
            ARRAY['PROPIX_CLIENT_ID', 'PROPIX_CLIENT_SECRET'], 'producao')
  `;

  return { success: true, message: "ProPix inserido com sucesso." };
});
