import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "./db.ts";

/**
 * Runner de migrations mínimo: aplica em ordem alfabética todos os `.sql`
 * de `migrations/` que ainda não constam em `schema_migrations`.
 */
const MIGRATIONS_DIR = join(import.meta.dir, "..", "migrations");

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nome text PRIMARY KEY,
      aplicada_em timestamptz NOT NULL DEFAULT now()
    )
  `;

  const arquivos = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const aplicadas = new Set(
    (
      await sql<{ nome: string }[]>`SELECT nome FROM schema_migrations`
    ).map((r) => r.nome),
  );

  let novas = 0;
  for (const arquivo of arquivos) {
    if (aplicadas.has(arquivo)) continue;
    const conteudo = await Bun.file(join(MIGRATIONS_DIR, arquivo)).text();
    console.log(`→ aplicando ${arquivo}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(conteudo);
      await tx`INSERT INTO schema_migrations (nome) VALUES (${arquivo})`;
    });
    novas++;
  }

  console.log(
    novas === 0
      ? "Nada a migrar — banco já está atualizado."
      : `${novas} migration(s) aplicada(s).`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
