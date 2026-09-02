# Transações PIX: uma linha por cliente

Hoje a tela de Transações lista todas as cobranças geradas. Como cada acesso do cliente à página de pagamento cria uma nova cobrança, o mesmo cliente aparece várias vezes (no banco há 2 transações pendentes e 19 marcadas como "substituída").

## O que muda

- A lista passa a mostrar **apenas a transação mais recente de cada cliente** — normalmente a pendente/vigente — e ela permanece na tela até o pagamento ser confirmado, quando a linha passa a "pago".
- As cobranças antigas do mesmo cliente (substituídas/expiradas) deixam de poluir a lista.
- Uma coluna "Tentativas" mostra quantas cobranças já foram geradas para aquele cliente, para não perder a noção do histórico.
- Novo botão/alternância **"Mostrar histórico completo"**: quando ligado, volta a listar todas as transações como hoje.
- O filtro de status continua funcionando: ele é aplicado sobre a transação vigente de cada cliente (ex.: "Aguardando pagamento" mostra só clientes com cobrança pendente).

## Detalhes técnicos

- `src/lib/transacoes.functions.ts`: `listarTransacoes` recebe `agrupar?: boolean` (padrão true). Busca as transações ordenadas por `created_at` desc e reduz para a primeira ocorrência por `cliente_id` (fallback `fatura_id` quando não houver cliente), acrescentando `tentativas` ao tipo `TransacaoAdmin`. Filtro de status aplicado após a redução quando agrupado.
- `src/routes/_authenticated/admin.transacoes.tsx`: switch "Mostrar histórico completo" ao lado do filtro de status, coluna "Tentativas" e chave de query incluindo o novo parâmetro.

Sem mudanças no banco de dados nem na geração de PIX.
