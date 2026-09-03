// Pool Postgres único da aplicação (substitui os 3 clients Supabase).
// Usa o driver nativo do Bun (`Bun.sql`). No Railway, `DATABASE_URL` é uma
// referência ao serviço Postgres.
import { SQL } from "bun";

const connectionString =
  process.env["DATABASE_URL"] ??
  process.env["POSTGRES_URL"] ??
  process.env["DATABASE_PRIVATE_URL"] ??
  "";

if (!connectionString) {
  const candidatas = Object.keys(process.env)
    .filter((k) => /DATABASE|POSTGRES|PG/i.test(k))
    .sort();
  throw new Error(
    "DATABASE_URL não configurada. Ligue este serviço a um Postgres.\n" +
      `Envs relacionadas no runtime: ${candidatas.length ? candidatas.join(", ") : "(nenhuma)"}`,
  );
}

if (connectionString.includes("${{")) {
  throw new Error(
    `DATABASE_URL veio como referência não-resolvida (${connectionString}). ` +
      "Verifique o nome do serviço Postgres e o ambiente no Railway.",
  );
}

/**
 * Cliente SQL. Uso:
 *   const linhas = await sql`SELECT * FROM clientes WHERE telefone = ${tel}`;
 *   await sql`INSERT INTO acessos ${sql(obj)}`;
 * Transações:
 *   await sql.begin(async (tx) => { ... });
 */
export const sql = new SQL(connectionString);

/** Retorna a primeira linha, ou null. Equivalente ao `.maybeSingle()` do Supabase. */
export function primeira<T>(linhas: T[]): T | null {
  return linhas[0] ?? null;
}
