/**
 * Nome real do produto vendido, usado EXCLUSIVAMENTE no payload enviado às
 * gateways de pagamento (description na CashinPay/ProPix e items[].title na
 * M2 Pay). Nada disso é exibido ao cliente: as telas continuam usando
 * `faturas.descricao` (ex.: "Fatura importada").
 *
 * Pode ser sobrescrito pela variável de ambiente PRODUTO_NOME.
 */
export const PRODUTO_NOME_PADRAO = "Ebook Viver de Vendas";

export function nomeProdutoGateway(): string {
  const nome = (process.env["PRODUTO_NOME"] ?? "").trim();
  return nome || PRODUTO_NOME_PADRAO;
}
