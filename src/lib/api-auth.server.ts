import { requestAutenticado } from "@/lib/auth.server";

/**
 * Valida a sessão admin de uma rota HTTP (`/api/public/*`).
 * A sessão vem no cookie assinado (mesmo mecanismo do painel).
 * Retorna `"admin"` quando autorizado, ou `null`.
 */
export async function requireAdminFromRequest(request: Request): Promise<string | null> {
  return requestAutenticado(request) ? "admin" : null;
}
