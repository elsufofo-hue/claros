import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
  .inputValidator((input) => importarClientesSchema.parse(input))
  .handler(async ({ data }) => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();
    const { sql } = await import("@/db");

    const PENDENTES = ["em_aberto", "vencida", "expirada", "falhou", "em_processamento"];

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

    let importados = 0;
    let faturasCriadas = 0;
    let faturasAtualizadas = 0;

    await sql.begin(async (tx) => {
      // 1) Clientes: upsert por telefone.
      const idPorTelefone = new Map<string, string>();
      for (const r of registros) {
        const linha = (
          await tx`
            INSERT INTO clientes (nome, telefone, email, documento, observacoes)
            VALUES (${r.nome}, ${r.telefone}, ${r.email}, ${r.documento}, ${r.observacoes})
            ON CONFLICT (telefone) DO UPDATE SET
              nome = EXCLUDED.nome,
              email = EXCLUDED.email,
              documento = EXCLUDED.documento,
              observacoes = EXCLUDED.observacoes,
              updated_at = now()
            RETURNING id, telefone
          `
        )[0] as { id: string; telefone: string } | undefined;
        if (linha) {
          idPorTelefone.set(linha.telefone, linha.id);
          importados++;
        }
      }

      // 2) Faturas: atualiza a fatura pendente mais recente de cada cliente, ou cria nova.
      const clienteIds = [...idPorTelefone.values()];
      const pendentes = (
        clienteIds.length === 0
          ? []
          : ((await tx`
              SELECT id, cliente_id, vencimento
              FROM faturas
              WHERE cliente_id IN ${tx(clienteIds)} AND status IN ${tx(PENDENTES)}
              ORDER BY vencimento DESC
            `) as { id: string; cliente_id: string; vencimento: string }[])
      );

      const faturaPorCliente = new Map<string, string>();
      for (const f of pendentes) {
        if (!faturaPorCliente.has(f.cliente_id)) faturaPorCliente.set(f.cliente_id, f.id);
      }

      for (const r of registros) {
        const clienteId = idPorTelefone.get(r.telefone);
        if (!clienteId) {
          rejeitados.push(r.telefone);
          continue;
        }
        const faturaId = faturaPorCliente.get(clienteId);
        if (faturaId) {
          await tx`
            UPDATE faturas SET
              descricao = 'Fatura importada',
              valor_original = ${r.valor_original},
              valor_desconto = ${r.valor_desconto},
              vencimento = ${data.vencimento_global},
              status = ${r.status}::fatura_status,
              updated_at = now()
            WHERE id = ${faturaId}
          `;
          faturasAtualizadas++;
        } else {
          await tx`
            INSERT INTO faturas (cliente_id, descricao, valor_original, valor_desconto, vencimento, status)
            VALUES (${clienteId}, 'Fatura importada', ${r.valor_original}, ${r.valor_desconto},
                    ${data.vencimento_global}, ${r.status}::fatura_status)
          `;
          faturasCriadas++;
        }
      }
    });

    return { importados, faturasCriadas, faturasAtualizadas, rejeitados };
  });

/**
 * Apaga TODA a base: pagamentos -> faturas -> clientes (ordem das FKs).
 * Restrito a administradores. Não remove registros de acessos (métricas).
 */
export const apagarTudo = createServerFn({ method: "POST" }).handler(async () => {
  const { exigirAdmin } = await import("./auth.server");
  exigirAdmin();
  const { sql, primeira } = await import("@/db");

  let pagamentos = 0;
  let faturas = 0;
  let clientes = 0;

  await sql.begin(async (tx) => {
    pagamentos =
      primeira<{ n: number }>(
        await tx`WITH d AS (DELETE FROM pagamentos RETURNING 1) SELECT count(*)::int AS n FROM d`,
      )?.n ?? 0;
    faturas =
      primeira<{ n: number }>(
        await tx`WITH d AS (DELETE FROM faturas RETURNING 1) SELECT count(*)::int AS n FROM d`,
      )?.n ?? 0;
    clientes =
      primeira<{ n: number }>(
        await tx`WITH d AS (DELETE FROM clientes RETURNING 1) SELECT count(*)::int AS n FROM d`,
      )?.n ?? 0;
  });

  return { pagamentos, faturas, clientes };
});
