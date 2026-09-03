// Pool Postgres único da aplicação (substitui os 3 clients Supabase).
// Usa `postgres` (postgres.js) — funciona tanto no Node (dev via Vite) quanto
// no Bun (produção/SSR). No Railway, `DATABASE_URL` é uma referência ao
// serviço Postgres.
import postgres, { type Sql } from "postgres";

function resolverConnectionString(): string {
  const cs =
    process.env["DATABASE_URL"] ??
    process.env["POSTGRES_URL"] ??
    process.env["DATABASE_PRIVATE_URL"] ??
    "";

  if (!cs) {
    const candidatas = Object.keys(process.env)
      .filter((k) => /DATABASE|POSTGRES|PG/i.test(k))
      .sort();
    throw new Error(
      "DATABASE_URL não configurada. Ligue este serviço a um Postgres.\n" +
        `Envs relacionadas no runtime: ${candidatas.length ? candidatas.join(", ") : "(nenhuma)"}`,
    );
  }
  if (cs.includes("${{")) {
    throw new Error(
      `DATABASE_URL veio como referência não-resolvida (${cs}). ` +
        "Verifique o nome do serviço Postgres e o ambiente no Railway.",
    );
  }
  return cs;
}

let _sql: Sql | undefined;

/**
 * Cliente SQL (lazy — só conecta no primeiro uso).
 *
 *   const linhas = await sql`SELECT * FROM clientes WHERE telefone = ${tel}`;
 *   await sql.begin(async (tx) => { ... });
 *   sql([...])            // helper para `IN`
 *   sql.array([...])      // literal de array para colunas text[]
 */
export const sql: Sql = new Proxy((() => {}) as unknown as Sql, {
  get(_t, prop) {
    if (!_sql) _sql = postgres(resolverConnectionString());
    return Reflect.get(_sql as object, prop, _sql);
  },
  apply(_t, _thisArg, args) {
    if (!_sql) _sql = postgres(resolverConnectionString());
    return (_sql as unknown as (...a: unknown[]) => unknown)(...args);
  },
});

/** Retorna a primeira linha, ou null. Equivalente ao `.maybeSingle()` do Supabase. */
export function primeira<T>(linhas: readonly T[]): T | null {
  return linhas[0] ?? null;
}

/** Literal `text[]` para INSERT/UPDATE — postgres.js aceita `sql.array()`. */
export function pgArray(items: readonly string[]) {
  return sql.array([...items]);
}
