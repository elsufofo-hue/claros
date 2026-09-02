/**
 * Contrato único de gateway de pagamento PIX.
 *
 * Para adicionar uma nova gateway basta criar um adaptador que implemente
 * `GatewayAdapter`, registrá-lo em `adapters.server.ts` e cadastrar a linha
 * correspondente em `gateways_config` pelo painel administrativo.
 * Nenhum outro arquivo da aplicação precisa mudar.
 */

export type Ambiente = "producao" | "teste";

export type GatewayRegistro = {
  id: string;
  slug: string;
  rotulo: string;
  adapter: string;
  ativo: boolean;
  prioridade: number;
  api_url: string | null;
  ambiente: string;
  limite_diario: number | null;
  webhook_url: string | null;
  secret_names: string[];
  observacoes: string | null;
};

export type CriarPixEntrada = {
  gateway: GatewayRegistro;
  centavos: number;
  nome: string;
  telefone: string;
  email?: string | null;
  documento?: string | null;
  descricao: string;
  referencia: string;
  webhookUrl: string;
};

export type PixCriado = {
  transacaoId: string;
  copiaCola: string;
  qrcode?: string | null;
  status: string;
  expiraEm?: string | null;
};

export type WebhookLido = {
  valido: boolean;
  transacaoId: string | null;
  status: string | null;
  evento: string | null;
};

export interface GatewayAdapter {
  /** Identificador do adaptador (coluna `adapter` em gateways_config). */
  nome: string;
  /** Indica se as credenciais necessárias estão presentes no ambiente. */
  configurado(gw: GatewayRegistro): boolean;
  /** Cria a cobrança PIX. Deve lançar erro quando a gateway falhar. */
  criarPix(entrada: CriarPixEntrada): Promise<PixCriado>;
  /** Consulta o status da transação na gateway. */
  consultarStatus(transacaoId: string, gw: GatewayRegistro): Promise<string | null>;
  /** Traduz o status da gateway para "pago". */
  pago(status: string | null | undefined): boolean;
  /** Valida e interpreta o webhook recebido. */
  lerWebhook(
    request: Request,
    corpoBruto: string,
    gw: GatewayRegistro,
  ): Promise<WebhookLido> | WebhookLido;
}

export const ESTRATEGIAS = ["prioridade", "rodizio", "fixa"] as const;
export type Estrategia = (typeof ESTRATEGIAS)[number];
