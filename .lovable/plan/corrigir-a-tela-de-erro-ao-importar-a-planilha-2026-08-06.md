# Corrigir a tela de erro ao importar a planilha

## O que está acontecendo

O site publicado está no ar normalmente (todas as páginas respondem OK). A tela "This page didn't load" é a tela de falha do próprio aplicativo, e ela aparece durante a importação da planilha em `/admin/faturas`.

Causa provável identificada no código da importação: para cada cliente que **já possui** uma fatura em aberto, o servidor faz **uma chamada separada ao banco** para atualizar essa fatura. Em um lote de 500 linhas isso vira até 500 chamadas seguidas em uma única requisição — o servidor estoura o tempo/limite de execução, derruba a requisição e o navegador cai na tela de erro em vez de mostrar um aviso.

Observação honesta: não há registro de erro guardado no servidor da última hora, então a confirmação definitiva vem no passo 1 abaixo.

## Plano

1. **Confirmar o diagnóstico**: adicionar registro de erro detalhado na função de importação (quantidade de linhas, tempo gasto, erro exato do banco), reproduzir uma importação e ler o log.

2. **Tornar a gravação em massa** (correção principal):
   - Substituir o laço de atualizações uma-a-uma por **uma única operação em bloco** para as faturas existentes.
   - Manter uma só operação em bloco para clientes e outra para faturas novas.
   - Resultado: cada lote passa de centenas de chamadas ao banco para 3 ou 4.

3. **Reduzir o tamanho do lote** de 500 para 200 linhas por envio, com pequena pausa entre lotes. Fica bem abaixo dos limites do servidor e a barra de progresso atualiza com mais frequência.

4. **Nunca mais quebrar a tela**: se um lote falhar, a importação continua nos lotes seguintes e, ao final, mostra um resumo ("X importados, Y lotes com falha") com o motivo — em vez de interromper tudo e derrubar a página. Erros de rede/tempo esgotado ganham nova tentativa automática (até 2 vezes).

5. **Validar de ponta a ponta**: importar uma planilha de teste (algumas milhares de linhas, incluindo telefones repetidos que já tenham fatura) e conferir no banco que clientes e faturas foram gravados corretamente, sem tela de erro.

## Detalhes técnicos

- `src/lib/clientes.functions.ts`: remover o `for` com `supabase.from("faturas").update()` por linha; montar um array com `{ id, ...campos }` das faturas existentes e usar um único `upsert` por `id`; manter `insert` em bloco para as novas. Adicionar `console.error` com contexto nos pontos de falha.
- `src/components/importar-clientes.tsx`: `TAMANHO_LOTE` 500 → 200; trocar o `throw` dentro do laço por acumulação de falhas + retentativa; resumo final via toast e opção de baixar o relatório de lotes que falharam.
- Sem mudanças de schema no banco; nenhuma alteração na tela pública de consulta.
