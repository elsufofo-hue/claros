/**
 * Normaliza o status vindo de QUALQUER gateway pro vocabulário interno da
 * coluna `transacoes_pix.status`.
 *
 * Cada gateway devolve um valor diferente pro mesmo estado — PixzyPay manda
 * "pending"/"expired"/"failed" em inglês, CashinPay "pending"/"approved"/
 * "completed", ProPix "COMPLETO"/"APROVADO" em maiúsculas, M2Pay
 * "PENDING"/"CANCELLED"/"REFUNDED", NowBanks "COMPLETED". Gravar isso cru no
 * banco (como o webhook fazia antes) deixa a coluna com uma mistura de
 * idiomas/capitalizações — a mesma transação "ainda não paga" aparece como
 * "pending" pra uma gateway e "pendente" pra outra na mesma tela.
 *
 * Vocabulário interno: pago | pendente | cancelada | expirada | falhou.
 * "pago" nunca é decidido aqui — o webhook handler já usa `adaptador.pago()`
 * (que tem a lógica específica de cada gateway) pra isso; esta função só
 * cobre os estados que NÃO são pago.
 */
const CANCELADA = /cancel|reject|refund|estorn|chargeback/i;
const EXPIRADA = /expir/i;
const FALHOU = /fail|error|erro|declin|recus/i;

export function normalizarStatusNaoPago(statusBruto: string | null | undefined): string {
  const s = (statusBruto ?? "").toString().trim().toLowerCase();
  if (!s) return "pendente";
  if (CANCELADA.test(s)) return "cancelada";
  if (EXPIRADA.test(s)) return "expirada";
  if (FALHOU.test(s)) return "falhou";
  // pending, waiting, aguardando, aberto, etc. — qualquer coisa que não
  // caiu nos casos acima é tratada como "ainda pendente".
  return "pendente";
}
