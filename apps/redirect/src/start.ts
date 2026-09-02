/**
 * Entrypoint de produção: roda as migrations pendentes e então sobe o servidor,
 * tudo no mesmo processo Bun (sem `sh -c`), para herdar as variáveis de
 * ambiente injetadas pelo Railway sem depender do shell.
 */
import { runMigrations } from "./migrate.ts";

await runMigrations();
await import("./server.ts");
