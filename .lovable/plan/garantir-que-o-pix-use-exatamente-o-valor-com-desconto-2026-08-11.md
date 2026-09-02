# Garantir que o PIX use exatamente o valor com desconto

## Situação atual (verificada no código)

O código já envia `valor_desconto` ao gateway (`consulta.functions.ts` linha 165). Porém o PIX é reaproveitado sempre que a fatura já tem `pix_txid`/`pix_copia_cola` salvos — sem comparar se o valor daquele PIX ainda corresponde ao valor com desconto atual. Se o valor da fatura foi alterado (edição ou nova importação) depois do PIX ter sido gerado, o cliente continua vendo um QR Code com o valor antigo.

## O que será feito

1. **Registrar o valor do PIX gerado**: salvar, junto com o código PIX, o valor (em centavos) usado na geração.
2. **Regenerar automaticamente**: ao abrir a fatura, se o valor com desconto atual for diferente do valor do PIX salvo, o código antigo é descartado e um novo PIX é gerado com o valor correto.
3. **Arredondamento exato**: converter para centavos com arredondamento único (`Math.round(valor * 100)`) e usar esse mesmo número tanto no gateway quanto no registro de pagamento e na exibição da tela, evitando qualquer diferença de centavo.
4. **Fallback estático**: aplicar a mesma regra de valor quando o PIX estático (chave própria) é usado.
5. **Registro de pagamento**: o registro pendente em `pagamentos` passa a ser atualizado quando o valor muda, em vez de manter o valor antigo.

## Detalhes técnicos

- Migração: adicionar coluna `pix_valor_centavos integer` em `public.faturas`.
- `src/lib/consulta.functions.ts`: calcular `centavos = Math.round((valor_desconto || valor_original) * 100)`; condição de regeneração passa a ser `!txid || !copiaCola || fatura.pix_valor_centavos !== centavos`; gravar `pix_valor_centavos` no update; atualizar o pagamento pendente quando o valor divergir.
- `src/lib/cashinpay.server.ts`: aceitar valor já em centavos para evitar duplo arredondamento.
- Sem mudanças de layout na tela pública; apenas o valor exibido passa a derivar dos mesmos centavos enviados ao gateway.
