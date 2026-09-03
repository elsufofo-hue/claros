// Pool Postgres único da aplicação (substitui os 3 clients Supabase).
// Usa o driver nativo do Bun (`Bun.sql`). No Railway, `DATABASE_URL` é uma
// referência ao serviço Postgres.
import { SQL } from "bun";

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

let _sql: SQL | undefined;

/**
 * Cliente SQL (lazy — só conecta no primeiro uso, para não quebrar o bundle
 * nem o boot quando a env ainda não está disponível).
 *
 *   const linhas = await sql`SELECT * FROM clientes WHERE telefone = ${tel}`;
 *   await sql.begin(async (tx) => { ... });
 */
export const sql: SQL = new Proxy((() => {}) as unknown as SQL, {
  get(_t, prop) {
    if (!_sql) _sql = new SQL(resolverConnectionString());
    return Reflect.get(_sql as object, prop, _sql);
  },
  apply(_t, _thisArg, args) {
    if (!_sql) _sql = new SQL(resolverConnectionString());
    // template tag: sql`...`
    return (_sql as unknown as (...a: unknown[]) => unknown)(...args);
  },
});

/** Retorna a primeira linha, ou null. Equivalente ao `.maybeSingle()` do Supabase. */
export function primeira<T>(linhas: T[]): T | null {
  return linhas[0] ?? null;
}

/**
 * Fragmento SQL `ARRAY['a','b',...]::text[]` — o `Bun.sql` não serializa
 * arrays JS diretamente em INSERT/UPDATE de colunas `text[]`.
 */
export function pgArray(items: readonly string[]) {
  if (!items || items.length === 0) return sql`ARRAY[]::text[]`;
  let frag = sql`${items[0]}`;
  for (let i = 1; i < items.length; i++) frag = sql`${frag}, ${items[i]}`;
  return sql`ARRAY[${frag}]::text[]`;
}
