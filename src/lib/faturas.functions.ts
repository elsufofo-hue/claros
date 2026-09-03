import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const STATUS_FATURA = [
  "em_aberto",
  "em_processamento",
  "paga",
  "vencida",
  "expirada",
  "falhou",
  "cancelada",
] as const;

export type FaturaAdmin = {
  id: string;
  cliente_id: string;
  descricao: string;
  valor_original: number;
  valor_desconto: number;
  vencimento: string;
  status: string;
  pix_copia_cola: string | null;
  boleto_codigo: string | null;
  clientes: { nome: string; telefone: string } | null;
};

const listarSchema = z.object({
  termo: z.string().trim().max(120).optional(),
  pagina: z.number().int().min(0).max(100000).optional(),
  porPagina: z.number().int().min(1).max(200).optional(),
});

/** Lista paginada de faturas com o cliente, filtrável por telefone/nome. */
export const listarFaturas = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => listarSchema.parse(data ?? {}))
  .handler(async ({ data }): Promise<{ linhas: FaturaAdmin[]; total: number }> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();
    const { sql, primeira } = await import("@/db");

    const porPagina = data.porPagina ?? 50;
    const offset = (data.pagina ?? 0) * porPagina;
    const termo = data.termo?.trim() ?? "";
    const digitos = termo.replace(/\D/g, "");

    // Filtro: >= 3 dígitos → busca por telefone; senão por nome.
    const filtro =
      termo === ""
        ? sql``
        : digitos.length >= 3
          ? sql`WHERE c.telefone ILIKE ${"%" + digitos + "%"}`
          : sql`WHERE c.nome ILIKE ${"%" + termo + "%"}`;

    const linhas = (await sql`
      SELECT f.id, f.cliente_id, f.descricao,
             f.valor_original::float8 AS valor_original,
             f.valor_desconto::float8 AS valor_desconto,
             to_char(f.vencimento, 'YYYY-MM-DD') AS vencimento,
             f.status::text AS status, f.pix_copia_cola, f.boleto_codigo,
             c.nome AS cliente_nome, c.telefone AS cliente_telefone
      FROM faturas f
      JOIN clientes c ON c.id = f.cliente_id
      ${filtro}
      ORDER BY f.vencimento DESC
      LIMIT ${porPagina} OFFSET ${offset}
    `) as unknown as (Omit<FaturaAdmin, "clientes"> & {
      cliente_nome: string;
      cliente_telefone: string;
    })[];

    const totalRow = primeira<{ n: number }>(
      await sql`
        SELECT count(*)::int AS n
        FROM faturas f
        JOIN clientes c ON c.id = f.cliente_id
        ${filtro}
      `,
    );

    return {
      linhas: linhas.map((f) => ({
        id: f.id,
        cliente_id: f.cliente_id,
        descricao: f.descricao,
        valor_original: Number(f.valor_original),
        valor_desconto: Number(f.valor_desconto),
        vencimento: f.vencimento,
        status: f.status,
        pix_copia_cola: f.pix_copia_cola,
        boleto_codigo: f.boleto_codigo,
        clientes: { nome: f.cliente_nome, telefone: f.cliente_telefone },
      })),
      total: totalRow?.n ?? 0,
    };
  });

const editarSchema = z.object({
  fatura_id: z.string().uuid(),
  cliente_id: z.string().uuid(),
  nome: z.string().trim().max(120),
  telefone: z.string().trim().max(20),
  valor_original: z.number().nonnegative(),
  valor_desconto: z.number().nonnegative(),
  vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(STATUS_FATURA),
});

/** Edita cliente + fatura em uma transação. */
export const editarFatura = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => editarSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();
    const { sql } = await import("@/db");

    const tel = data.telefone.replace(/\D/g, "");
    await sql.begin(async (tx) => {
      await tx`
        UPDATE clientes
        SET nome = ${data.nome.trim() || tel}, telefone = ${tel}, updated_at = now()
        WHERE id = ${data.cliente_id}
      `;
      await tx`
        UPDATE faturas SET
          valor_original = ${data.valor_original},
          valor_desconto = ${data.valor_desconto},
          vencimento = ${data.vencimento},
          status = ${data.status}::fatura_status,
          updated_at = now()
        WHERE id = ${data.fatura_id}
      `;
    });
    return { ok: true };
  });

const statusSchema = z.object({
  fatura_id: z.string().uuid(),
  status: z.enum(STATUS_FATURA),
});

/** Altera o status da fatura. Ao marcar "paga", registra um pagamento manual. */
export const alterarStatusFatura = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => statusSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();
    const { sql, primeira } = await import("@/db");

    await sql.begin(async (tx) => {
      await tx`
        UPDATE faturas SET status = ${data.status}::fatura_status, updated_at = now()
        WHERE id = ${data.fatura_id}
      `;
      if (data.status === "paga") {
        const f = primeira<{
          cliente_id: string;
          valor_desconto: number;
          valor_original: number;
        }>(
          await tx`
            SELECT cliente_id, valor_desconto, valor_original
            FROM faturas WHERE id = ${data.fatura_id}
          `,
        );
        if (f) {
          await tx`
            INSERT INTO pagamentos (fatura_id, cliente_id, valor, metodo, status, pago_em)
            VALUES (
              ${data.fatura_id}, ${f.cliente_id},
              ${Number(f.valor_desconto) || Number(f.valor_original)},
              'manual', 'confirmado', now()
            )
          `;
        }
      }
    });
    return { ok: true };
  });
