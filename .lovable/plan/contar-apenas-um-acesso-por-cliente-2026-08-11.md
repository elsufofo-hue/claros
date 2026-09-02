# Contar apenas um acesso por cliente

Hoje o painel conta cada visita: se o mesmo telefone consultar a fatura 5 vezes, aparecem 5 faturas visualizadas e o valor é somado 5 vezes. O objetivo é que cada cliente conte apenas uma vez.

## O que muda no dashboard

- **Total de faturas visualizadas**: passa a contar telefones únicos com consulta bem-sucedida (um por cliente, não importa quantas vezes ele volte).
- **Valor total visualizado**: soma o valor com desconto apenas da primeira consulta de cada telefone, eliminando a duplicação atual.
- **Clientes que acessaram a página**: continua igual (já é por telefone único).
- **Lista de acessos recentes** (quando exibida): mostra apenas o registro mais recente de cada telefone, sem repetições do mesmo cliente.

O histórico completo continua gravado no banco — a mudança é só na forma de contar e exibir. O botão "Limpar histórico" segue zerando tudo.

## Detalhes técnicos

- `src/lib/acessos.functions.ts`, handler `obterMetricasAcessos`:
  - remover a contagem por linha de `faturas_visualizadas_total` e `valor_visualizado_total`;
  - passar a incrementá-los dentro do bloco que já usa o `Set` `vistosTotal` (primeira ocorrência de cada telefone), usando `valor_desconto`;
  - montar `recentes` a partir da lista ordenada por `data_hora` desc, deduplicada por `telefone_consultado` (registros sem telefone permanecem individuais), limitando a 20.
- `src/routes/_authenticated/admin.index.tsx`: apenas ajustar as descrições dos cartões para deixar claro que a contagem é por cliente único. Nenhuma mudança de layout.
