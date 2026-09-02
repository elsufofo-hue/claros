import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const setupProPix = createServerFn({ method: "POST" })
  .handler(async () => {
    const { data: existing } = await supabaseAdmin
      .from("gateways_config")
      .select("id")
      .eq("adapter", "propix")
      .maybeSingle();

    if (existing) {
      return { success: true, message: "ProPix já existe no banco." };
    }

    const { error } = await supabaseAdmin
      .from("gateways_config")
      .insert({
        slug: "propix",
        rotulo: "ProPix",
        adapter: "propix",
        ativo: false,
        prioridade: 2,
        secret_names: ["PROPIX_CLIENT_ID", "PROPIX_CLIENT_SECRET"],
        ambiente: "producao"
      });

    if (error) {
      console.error("Erro ao inserir ProPix:", error);
      throw new Error(error.message);
    }

    return { success: true, message: "ProPix inserido com sucesso." };
  });
