export const CLIENTE_EMAIL_GATEWAY = "cliente@emagrecersecreto.com";

export function nomeClienteGateway(nome: string | null | undefined): string {
  const nomeReal = (nome ?? "").trim();
  return nomeReal || "Cliente";
}