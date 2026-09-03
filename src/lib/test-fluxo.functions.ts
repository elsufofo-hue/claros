import { createServerFn } from "@tanstack/react-start";
import { criarCobrancaPix as gerarPixRouter } from "./payment-router.server";

export const testarFluxoCompleto = createServerFn({ method: "POST" }).handler(async () => {
  const { exigirAdmin } = await import("./auth.server");
  exigirAdmin();
  const { sql, primeira } = await import("@/db");

  try {
    // 1. Pegar uma fatura aberta
    const fatura = primeira<{ id: string; cliente_id: string; valor_desconto: number }>(
      await sql`
        SELECT id, cliente_id, valor_desconto
        FROM faturas
        WHERE status = 'em_aberto'
        LIMIT 1
      `,
    );

    if (!fatura)
      return { success: false, error: "Nenhuma fatura em aberto encontrada para teste." };

    // 2. Pegar dados do cliente
    const cliente = primeira<{
      nome: string;
      telefone: string;
      email: string | null;
      documento: string | null;
    }>(
      await sql`
        SELECT nome, telefone, email, documento
        FROM clientes
        WHERE id = ${fatura.cliente_id}
      `,
    );

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
      requestKey: "TESTE-ROUTER-" + Date.now(),
    });

    return { success: true, result: res };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});
