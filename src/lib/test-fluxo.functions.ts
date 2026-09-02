import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { criarCobrancaPix as gerarPixRouter } from "./payment-router.server";

export const testarFluxoCompleto = createServerFn({ method: "POST" })
  .handler(async () => {
    try {
      // 1. Pegar uma fatura aberta
      const { data: fatura } = await supabaseAdmin
        .from("faturas")
        .select("id, cliente_id, valor_desconto")
        .eq("status", "em_aberto")
        .limit(1)
        .maybeSingle();

      if (!fatura) return { success: false, error: "Nenhuma fatura em aberto encontrada para teste." };

      // 2. Pegar dados do cliente
      const { data: cliente } = await supabaseAdmin
        .from("clientes")
        .select("nome, telefone, email, documento")
        .eq("id", fatura.cliente_id)
        .maybeSingle();

      if (!cliente) return { success: false, error: "Cliente da fatura não encontrado." };

      // 3. Simular Pedido via Router
      const res = await gerarPixRouter({
        faturaId: fatura.id,
        clienteId: fatura.cliente_id,
        centavos: Math.round(Number(fatura.valor_desconto) * 100),
        nome: cliente.nome,
        telefone: cliente.telefone,
        email: cliente.email,
        documento: cliente.documento,
        descricao: "Teste ProPix",
        baseUrl: "http://localhost:8080",
        requestKey: "TESTE-ROUTER-" + Date.now()
      });

      return { success: true, result: res };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
