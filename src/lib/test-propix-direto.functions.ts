import { createServerFn } from "@tanstack/react-start";
import { criarCobrancaPix } from "./propix.server";

export const testarProPixDireto = createServerFn({ method: "POST" })
  .handler(async () => {
    try {
      console.log("[debug-propix] Iniciando teste direto...");
      const res = await criarCobrancaPix({
        centavos: 100,
        nome: "Teste Diagnostico",
        telefone: "11999999999",
        documento: "12345678909",
        descricao: "Teste de Diagnostico ProPix",
        referencia: "DIAG-" + Date.now()
      });
      console.log("[debug-propix] Resultado do teste:", JSON.stringify(res));
      return { success: true, result: res };
    } catch (error: any) {
      console.error("[debug-propix] Erro no teste direto:", error);
      return { success: false, error: error.message };
    }
  });
