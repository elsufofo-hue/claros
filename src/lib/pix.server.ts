/**
 * Gerador de payload PIX (BR Code / EMV) — usado enquanto o gateway
 * definitivo não está plugado. Quando o gateway for integrado, basta
 * substituir `gerarBrCode` pela chamada à API e manter o mesmo retorno.
 */

function tlv(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function limpar(texto: string, max: number): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .slice(0, max)
    .toUpperCase();
}

export function gerarBrCode(opcoes: {
  chave: string;
  valor: number;
  nome: string;
  cidade: string;
  txid: string;
}): string {
  const merchant =
    tlv("00", "br.gov.bcb.pix") + tlv("01", opcoes.chave);

  const semCrc =
    tlv("00", "01") +
    tlv("01", "12") +
    tlv("26", merchant) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", opcoes.valor.toFixed(2)) +
    tlv("58", "BR") +
    tlv("59", limpar(opcoes.nome, 25) || "RECEBEDOR") +
    tlv("60", limpar(opcoes.cidade, 15) || "SAO PAULO") +
    tlv("62", tlv("05", limpar(opcoes.txid, 25) || "***")) +
    "6304";

  return semCrc + crc16(semCrc);
}

export function novoTxid(): string {
  return `PIX${Date.now().toString(36).toUpperCase()}${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}
