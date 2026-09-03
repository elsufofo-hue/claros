// Autenticação do painel admin — senha única via env, sessão em cookie assinado.
// Substitui o Supabase Auth (signIn/signUp/getUser/getClaims).
//
// Envs:
//   - ADMIN_PASSWORD  : senha do painel (obrigatória para o login funcionar)
//   - SESSION_SECRET   : segredo HMAC do cookie (obrigatória; >= 16 chars)
import { createHmac, timingSafeEqual } from "node:crypto";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";

const COOKIE_NOME = "claros_admin";
const DURACAO_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

function segredo(): string {
  const s = process.env["SESSION_SECRET"];
  if (!s || s.length < 16) {
    throw new Error(
      "SESSION_SECRET ausente ou muito curta (mín. 16 chars). Defina no ambiente.",
    );
  }
  return s;
}

function assinar(payload: string): string {
  return createHmac("sha256", segredo()).update(payload).digest("base64url");
}

function comparar(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Confere a senha informada contra ADMIN_PASSWORD (tempo constante). */
export function senhaConfere(informada: string): boolean {
  const esperada = process.env["ADMIN_PASSWORD"];
  if (!esperada) {
    throw new Error("ADMIN_PASSWORD não configurada no ambiente.");
  }
  return comparar(informada, esperada);
}

/** Valor do cookie: "<expiraEm>.<assinatura>". */
function novoToken(): string {
  const payload = String(Date.now() + DURACAO_MS);
  return `${payload}.${assinar(payload)}`;
}

function tokenValido(valor: string | undefined | null): boolean {
  if (!valor) return false;
  const ponto = valor.lastIndexOf(".");
  if (ponto <= 0) return false;
  const payload = valor.slice(0, ponto);
  const assinatura = valor.slice(ponto + 1);
  if (!comparar(assinatura, assinar(payload))) return false;
  const expiraEm = Number(payload);
  return Number.isFinite(expiraEm) && expiraEm > Date.now();
}

/** Emite o cookie de sessão (chamar dentro de um handler de server function). */
export function emitirSessao(): void {
  setCookie(COOKIE_NOME, novoToken(), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: Math.floor(DURACAO_MS / 1000),
  });
}

/** Limpa o cookie de sessão. */
export function encerrarSessao(): void {
  deleteCookie(COOKIE_NOME, { path: "/" });
}

/** true se o request atual tem sessão admin válida. */
export function sessaoAtiva(): boolean {
  return tokenValido(getCookie(COOKIE_NOME));
}

/**
 * Lança se não houver sessão admin. Usar no início de toda server function
 * que exige admin (substitui o `requireSupabaseAuth` + `exigirAdmin`).
 */
export function exigirAdmin(): void {
  if (!sessaoAtiva()) {
    throw new Error("Acesso restrito a administradores.");
  }
}

/** Versão para rotas HTTP (`/api/public/*`) que recebem o Request na mão. */
export function requestAutenticado(request: Request | null | undefined): boolean {
  const cookie = request?.headers?.get("cookie");
  if (!cookie) return false;
  for (const parte of cookie.split(/;\s*/)) {
    if (parte.startsWith(`${COOKIE_NOME}=`)) {
      return tokenValido(parte.slice(COOKIE_NOME.length + 1));
    }
  }
  return false;
}
