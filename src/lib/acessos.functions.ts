import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const acessoSchema = z.object({
  pagina: z.string().min(1).max(120),
  telefone_consultado: z.string().max(20).optional().nullable(),
  sucesso: z.boolean().optional(),
  valor_original: z.number().optional().nullable(),
  valor_desconto: z.number().optional().nullable(),
});

export type RegistroAcesso = z.infer<typeof acessoSchema>;

/** Grava um acesso da página pública. Nunca lança erro para o visitante. */
export const registrarAcesso = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => acessoSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    try {
      const { sql } = await import("@/db");
      await sql`
        INSERT INTO acessos (pagina, telefone_consultado, sucesso, valor_original, valor_desconto)
        VALUES (
          ${data.pagina}, ${data.telefone_consultado ?? null}, ${data.sucesso ?? false},
          ${data.valor_original ?? null}, ${data.valor_desconto ?? null}
        )
      `;
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

export type AcessoRecente = {
  id: string;
  data_hora: string;
  pagina: string;
  telefone_consultado: string | null;
  sucesso: boolean;
  valor_desconto: number | null;
};

export type MetricasAcessos = {
  clientes_total: number;
  clientes_hoje: number;
  clientes_mes: number;
  valor_desconto_total: number;
  valor_desconto_hoje: number;
  valor_desconto_mes: number;
  valor_aberto_total: number;
  valor_aberto_hoje: number;
  valor_aberto_mes: number;
  acessos_hoje: number;
  acessos_mes: number;
  acessos_total: number;
  consultas_total: number;
  consultas_hoje: number;
  faturas_visualizadas_total: number;
  valor_visualizado_total: number;
  recentes: AcessoRecente[];
};

/** Início do dia/mês no fuso de São Paulo, em ISO UTC. */
function limites() {
  const agora = new Date();
  const sp = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const offsetMs = agora.getTime() - sp.getTime();
  const inicioDiaSp = new Date(sp.getFullYear(), sp.getMonth(), sp.getDate());
  const inicioMesSp = new Date(sp.getFullYear(), sp.getMonth(), 1);
  return {
    inicioDia: new Date(inicioDiaSp.getTime() + offsetMs),
    inicioMes: new Date(inicioMesSp.getTime() + offsetMs),
  };
}

/** Métricas do painel — apenas administradores autenticados. */
export const obterMetricasAcessos = createServerFn({ method: "GET" }).handler(
  async (): Promise<MetricasAcessos> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();

    const { sql } = await import("@/db");
    const { inicioDia, inicioMes } = limites();

    let registros: {
      id: string;
      data_hora: string;
      pagina: string;
      telefone_consultado: string | null;
      sucesso: boolean;
      valor_original: number | null;
      valor_desconto: number | null;
    }[];
    try {
      registros = (await sql`
        SELECT id, data_hora, pagina, telefone_consultado, sucesso, valor_original, valor_desconto
        FROM acessos
        ORDER BY data_hora DESC
        LIMIT 50000
      `) as unknown as typeof registros;
    } catch {
      throw new Error("Não foi possível carregar as métricas.");
    }
    const m: MetricasAcessos = {
      clientes_total: 0,
      clientes_hoje: 0,
      clientes_mes: 0,
      valor_desconto_total: 0,
      valor_desconto_hoje: 0,
      valor_desconto_mes: 0,
      valor_aberto_total: 0,
      valor_aberto_hoje: 0,
      valor_aberto_mes: 0,
      acessos_hoje: 0,
      acessos_mes: 0,
      acessos_total: registros.length,
      consultas_total: 0,
      consultas_hoje: 0,
      faturas_visualizadas_total: 0,
      valor_visualizado_total: 0,
      recentes: [],
    };

    // Últimos acessos: um registro por telefone (o mais recente).
    const telefonesRecentes = new Set<string>();
    for (const r of registros) {
      if (m.recentes.length >= 20) break;
      if (r.telefone_consultado) {
        if (telefonesRecentes.has(r.telefone_consultado)) continue;
        telefonesRecentes.add(r.telefone_consultado);
      }
      m.recentes.push({
        id: r.id,
        data_hora: r.data_hora,
        pagina: r.pagina,
        telefone_consultado: r.telefone_consultado,
        sucesso: r.sucesso,
        valor_desconto: r.valor_desconto === null ? null : Number(r.valor_desconto),
      });
    }


    // Percorre do mais antigo para o mais recente: a primeira consulta
    // bem-sucedida de cada telefone é a que conta no período.
    const vistosTotal = new Set<string>();
    const vistosDia = new Set<string>();
    const vistosMes = new Set<string>();

    for (let i = registros.length - 1; i >= 0; i--) {
      const r = registros[i]!;
      const quando = new Date(r.data_hora);
      const noDia = quando >= inicioDia;
      const noMes = quando >= inicioMes;

      if (noDia) m.acessos_hoje++;
      if (noMes) m.acessos_mes++;

      if (r.telefone_consultado) {
        m.consultas_total++;
        if (noDia) m.consultas_hoje++;
      }

      if (!r.sucesso || !r.telefone_consultado) continue;
      const tel = r.telefone_consultado;
      const desconto = Number(r.valor_desconto ?? 0);
      const aberto = Number(r.valor_original ?? 0);

      if (!vistosTotal.has(tel)) {
        vistosTotal.add(tel);
        m.clientes_total++;
        m.faturas_visualizadas_total++;
        m.valor_visualizado_total += desconto;
        m.valor_desconto_total += desconto;
        m.valor_aberto_total += aberto;
      }

      if (noMes && !vistosMes.has(tel)) {
        vistosMes.add(tel);
        m.clientes_mes++;
        m.valor_desconto_mes += desconto;
        m.valor_aberto_mes += aberto;
      }
      if (noDia && !vistosDia.has(tel)) {
        vistosDia.add(tel);
        m.clientes_hoje++;
        m.valor_desconto_hoje += desconto;
        m.valor_aberto_hoje += aberto;
      }
    }

    return m;
  },
);

/** Total de clientes cadastrados — apenas administradores. */
export const contarClientes = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ total: number }> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();

    const { sql, primeira } = await import("@/db");
    const row = primeira<{ n: number }>(
      await sql`SELECT count(*)::int AS n FROM clientes`,
    );
    return { total: row?.n ?? 0 };
  },
);

/** Apaga todo o histórico de acessos/consultas — apenas administradores. */
export const limparAcessos = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ removidos: number }> => {
    const { exigirAdmin } = await import("./auth.server");
    exigirAdmin();

    const { sql, primeira } = await import("@/db");
    const row = primeira<{ n: number }>(
      await sql`WITH d AS (DELETE FROM acessos RETURNING 1) SELECT count(*)::int AS n FROM d`,
    );
    return { removidos: row?.n ?? 0 };
  },
);
