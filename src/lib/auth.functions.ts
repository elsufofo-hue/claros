import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const loginSchema = z.object({ senha: z.string().min(1).max(200) });

/** Faz login com a senha única. Emite o cookie de sessão em caso de sucesso. */
export const login = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => loginSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { senhaConfere, emitirSessao } = await import("./auth.server");
    if (!senhaConfere(data.senha)) {
      // atraso pequeno pra dificultar brute-force
      await new Promise((r) => setTimeout(r, 400));
      return { ok: false };
    }
    emitirSessao();
    return { ok: true };
  });

/** Encerra a sessão. */
export const logout = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true }> => {
    const { encerrarSessao } = await import("./auth.server");
    encerrarSessao();
    return { ok: true };
  },
);

/** Consulta se a sessão atual é válida. Usada nos guards de rota (`beforeLoad`). */
export const verificarSessao = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ autenticado: boolean }> => {
    const { sessaoAtiva } = await import("./auth.server");
    return { autenticado: sessaoAtiva() };
  },
);
