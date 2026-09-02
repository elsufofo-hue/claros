import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STATUS_VALIDOS = [
  "em_aberto",
  "paga",
  "vencida",
  "cancelada",
  "expirada",
  "falhou",
  "em_processamento",
] as const;

const clienteImportSchema = z.object({
  // Nome é opcional: planilhas com apenas telefone + valores são aceitas.
  nome: z.string().nullable().optional(),
  telefone: z.string().min(10).max(15),
  email: z.string().email().nullable().optional(),
  documento: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  valor_original: z.number().nonnegative().nullable().optional(),
  valor_desconto: z.number().nonnegative().nullable().optional(),
  status: z.enum(STATUS_VALIDOS).nullable().optional(),
});


const importarClientesSchema = z.object({
  // Lotes de até 500 linhas por chamada — o cliente divide a planilha.
  clientes: z.array(clienteImportSchema).min(1).max(500),
  // Data de vencimento única escolhida no calendário: vale para TODAS as faturas.
  vencimento_global: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const importarClientes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => importarClientesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roleRow, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roleRow) {
      throw new Error("Apenas administradores podem importar clientes.");
    }

    const PENDENTES = [
      "em_aberto",
      "vencida",
      "expirada",
      "falhou",
      "em_processamento",
    ] as const;

    // Normaliza telefones (remove DDI 55 e zeros à esquerda) e descarta inválidos.
    const vistos = new Set<string>();
    const registros: {
      nome: string;
      telefone: string;
      email: string | null;
      documento: string | null;
      observacoes: string | null;
      valor_original: number;
      valor_desconto: number;
      status: (typeof STATUS_VALIDOS)[number];
    }[] = [];
    const rejeitados: string[] = [];

    for (const c of data.clientes) {
      let tel = c.telefone.replace(/\D/g, "");
      if ((tel.length === 12 || tel.length === 13) && tel.startsWith("55")) tel = tel.slice(2);
      while (tel.length > 11 && tel.startsWith("0")) tel = tel.slice(1);
      if (tel.length < 10 || tel.length > 11 || vistos.has(tel)) {
        rejeitados.push(c.telefone);
        continue;
      }
      vistos.add(tel);

      const original = c.valor_original ?? 0;
      const desconto = c.valor_desconto ?? 0;
      registros.push({
        nome: c.nome?.trim() || tel,
        telefone: tel,
        email: c.email?.trim() || null,
        documento: c.documento?.trim() || null,
        observacoes: c.observacoes?.trim() || null,
        valor_original: Math.max(original, desconto),
        valor_desconto: desconto,
        status: c.status ?? "em_aberto",
      });
    }

    if (!registros.length) {
      return { importados: 0, faturasCriadas: 0, faturasAtualizadas: 0, rejeitados };
    }

    // 1) Clientes: upsert por telefone.
    const { data: clientesSalvos, error: erroClientes } = await supabase
      .from("clientes")
      .upsert(
        registros.map((r) => ({
          nome: r.nome,
          telefone: r.telefone,
          email: r.email,
          documento: r.documento,
          observacoes: r.observacoes,
        })),
        { onConflict: "telefone" },
      )
      .select("id, telefone");

    if (erroClientes) {
      console.error("[importarClientes] falha ao salvar clientes", {
        quantidade: registros.length,
        erro: erroClientes.message,
        detalhe: erroClientes.details,
      });
      throw new Error(`Erro ao salvar clientes: ${erroClientes.message}`);
    }


    const idPorTelefone = new Map((clientesSalvos ?? []).map((c) => [c.telefone, c.id]));

    // 2) Faturas: atualiza a fatura pendente mais recente ou cria uma nova.
    const clienteIds = [...idPorTelefone.values()];
    const { data: pendentes, error: erroPendentes } = await supabase
      .from("faturas")
      .select("id, cliente_id, vencimento")
      .in("cliente_id", clienteIds)
      .in("status", PENDENTES)
      .order("vencimento", { ascending: false });

    if (erroPendentes) throw new Error(`Erro ao ler faturas: ${erroPendentes.message}`);

    const faturaPorCliente = new Map<string, string>();
    for (const f of pendentes ?? []) {
      if (!faturaPorCliente.has(f.cliente_id)) faturaPorCliente.set(f.cliente_id, f.id);
    }

    type FaturaLinha = {
      id?: string;
      cliente_id: string;
      descricao: string;
      valor_original: number;
      valor_desconto: number;
      vencimento: string;
      status: (typeof STATUS_VALIDOS)[number];
    };

    const existentes: FaturaLinha[] = [];
    const novas: FaturaLinha[] = [];

    for (const r of registros) {
      const clienteId = idPorTelefone.get(r.telefone);
      if (!clienteId) {
        rejeitados.push(r.telefone);
        continue;
      }
      const faturaId = faturaPorCliente.get(clienteId);
      const linha: FaturaLinha = {
        cliente_id: clienteId,
        descricao: "Fatura importada",
        valor_original: r.valor_original,
        valor_desconto: r.valor_desconto,
        vencimento: data.vencimento_global,
        status: r.status,
      };
      if (faturaId) existentes.push({ ...linha, id: faturaId });
      else novas.push(linha);
    }

    // Atualiza TODAS as faturas existentes em uma única chamada (evita centenas
    // de round-trips por lote, que estouravam o tempo limite do servidor).
    let faturasAtualizadas = 0;
    if (existentes.length) {
      const { data: atualizadas, error } = await supabase
        .from("faturas")
        .upsert(existentes, { onConflict: "id" })
        .select("id");
      if (error) {
        console.error("[importarClientes] falha ao atualizar faturas", {
          quantidade: existentes.length,
          erro: error.message,
          detalhe: error.details,
        });
        throw new Error(`Erro ao atualizar faturas: ${error.message}`);
      }
      faturasAtualizadas = atualizadas?.length ?? 0;
    }

    let faturasCriadas = 0;
    if (novas.length) {
      const { data: criadas, error } = await supabase.from("faturas").insert(novas).select("id");
      if (error) {
        console.error("[importarClientes] falha ao criar faturas", {
          quantidade: novas.length,
          erro: error.message,
          detalhe: error.details,
        });
        throw new Error(`Erro ao criar faturas: ${error.message}`);
      }
      faturasCriadas = criadas?.length ?? 0;
    }


    return {
      importados: clientesSalvos?.length ?? 0,
      faturasCriadas,
      faturasAtualizadas,
      rejeitados,
    };
  });

/**
 * Apaga TODA a base: pagamentos -> faturas -> clientes (ordem das FKs).
 * Restrito a administradores. Não remove registros de acessos (métricas).
 */
export const apagarTudo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: roleRow, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roleRow) {
      throw new Error("Apenas administradores podem apagar todos os registros.");
    }

    const nunca = "00000000-0000-0000-0000-000000000000";

    const { data: pagamentos, error: erroPag } = await supabase
      .from("pagamentos")
      .delete()
      .neq("id", nunca)
      .select("id");
    if (erroPag) throw new Error(`Erro ao apagar pagamentos: ${erroPag.message}`);

    const { data: faturas, error: erroFat } = await supabase
      .from("faturas")
      .delete()
      .neq("id", nunca)
      .select("id");
    if (erroFat) throw new Error(`Erro ao apagar faturas: ${erroFat.message}`);

    const { data: clientes, error: erroCli } = await supabase
      .from("clientes")
      .delete()
      .neq("id", nunca)
      .select("id");
    if (erroCli) throw new Error(`Erro ao apagar clientes: ${erroCli.message}`);

    return {
      pagamentos: pagamentos?.length ?? 0,
      faturas: faturas?.length ?? 0,
      clientes: clientes?.length ?? 0,
    };
  });
