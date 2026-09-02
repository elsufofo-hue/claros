# Mostrar apenas a fatura em aberto do mês atual

## O que está acontecendo (verificado no banco)

O telefone 21988888888 tem duas faturas com o mesmo vencimento (06/08/2026): uma `paga` e outra `em_aberto`. A consulta pública hoje lista **todas** as faturas do cliente, por isso as duas aparecem.

Observação: no banco o status de fatura pendente se chama `em_aberto` (não existe `pendente`), e a data se chama `vencimento`. O filtro usará esses nomes reais.

## Correção

Em `src/lib/consulta.functions.ts`, na função `consultarFaturas`:

- Filtrar somente faturas pendentes de pagamento: `status in ('em_aberto', 'vencida', 'em_processamento', 'falhou', 'expirada')` — ou seja, nunca `paga` nem `cancelada`.
- Filtrar somente o mês corrente: `vencimento >= primeiro dia do mês` e `vencimento <= último dia do mês`.
- Retornar no máximo 1 fatura (a mais recente do mês).

Em `src/routes/fatura.$telefone.tsx`:

- Quando não houver fatura no resultado, exibir a mensagem: **"Nenhuma fatura em aberto para este mês"**, com o botão de nova consulta.

## Escopo

- Nenhuma mudança no banco de dados.
- Nenhuma mudança na área administrativa (lá continuam visíveis todas as faturas, inclusive as pagas).
- O endpoint `/api/public/faturas` não é alterado nesta etapa.
