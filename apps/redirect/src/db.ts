import { SQL } from "bun";

/**
 * Conexão Postgres via driver nativo do Bun (`Bun.sql`).
 * O Railway injeta `DATABASE_URL` quando o serviço é ligado a um Postgres.
 */
const connectionString =
  process.env["DATABASE_URL"] ?? process.env["POSTGRES_URL"] ?? "";

if (!connectionString) {
  throw new Error(
    "DATABASE_URL não configurada. Ligue este serviço a um Postgres no Railway (Variables → Reference).",
  );
}

export const sql = new SQL(connectionString);

export interface RedirectConfig {
  id: number;
  destino: string;
  status_code: number;
  atualizado_em: string;
}

/** Lê a única linha de config (id = 1). Retorna null se a tabela estiver vazia. */
export async function lerConfig(): Promise<RedirectConfig | null> {
  const linhas = await sql<
    RedirectConfig[]
  >`SELECT id, destino, status_code, atualizado_em FROM redirect_config WHERE id = 1`;
  return linhas[0] ?? null;
}

/** Grava (upsert) o destino e o status code. */
export async function salvarConfig(
  destino: string,
  statusCode: number,
): Promise<RedirectConfig> {
  const linhas = await sql<RedirectConfig[]>`
    INSERT INTO redirect_config (id, destino, status_code, atualizado_em)
    VALUES (1, ${destino}, ${statusCode}, now())
    ON CONFLICT (id) DO UPDATE
      SET destino = EXCLUDED.destino,
          status_code = EXCLUDED.status_code,
          atualizado_em = now()
    RETURNING id, destino, status_code, atualizado_em
  `;
  return linhas[0]!;
}
