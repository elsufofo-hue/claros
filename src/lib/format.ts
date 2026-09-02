export function somenteDigitos(valor: string): string {
  return (valor ?? "").replace(/\D/g, "");
}

export function formatarTelefone(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function formatarCpf(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}


export function formatarMoeda(valor: number | string | null | undefined): string {
  const n = typeof valor === "string" ? Number(valor) : (valor ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(n) ? n : 0,
  );
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  if (!ano || !mes || !dia) return "—";
  return `${dia}/${mes}/${ano}`;
}

export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export const STATUS_FATURA: Record<string, string> = {
  em_aberto: "Em aberto",
  em_processamento: "Em processamento",
  paga: "Paga",
  vencida: "Vencida",
  expirada: "Expirada",
  falhou: "Pagamento falhou",
  cancelada: "Cancelada",
};

/** Estados em que o cliente ainda consegue pagar a fatura pela tela pública. */
export const STATUS_PAGAVEIS = ["em_aberto", "vencida"];

/** Mensagem clara exibida ao cliente para cada estado da fatura. */
export const MENSAGEM_STATUS: Record<string, string> = {
  em_aberto: "Esta fatura está em aberto. Pague com PIX e a confirmação é automática.",
  em_processamento:
    "Recebemos seu pagamento e ele está em processamento pelo banco. A confirmação aparece aqui em alguns instantes.",
  paga: "Pagamento confirmado — esta fatura está quitada. Nada mais a fazer.",
  vencida: "Esta fatura está vencida, mas ainda pode ser paga agora com o desconto à vista.",
  expirada:
    "O prazo desta oferta expirou e o código PIX não é mais válido. Aproveite descontos imperdíveis entrando em contato com o atendimento.",
  falhou:
    "A última tentativa de pagamento não foi concluída. Gere um novo código PIX ou fale com o atendimento.",
  cancelada: "Esta fatura foi cancelada e não precisa ser paga.",
};


export const STATUS_PAGAMENTO: Record<string, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  falhou: "Falhou",
  estornado: "Estornado",
};
