# Webhooks das gateways e painel "quem pagou"

Hoje o sistema já recebe webhooks em `/api/public/webhooks/<slug>` — vale para qualquer gateway cadastrada, basta colar esse endereço no painel da gateway (a tela Gateways já mostra e copia o endereço). O que falta é ver com clareza, no painel, **quem pagou** e **quais webhooks chegaram**, do mesmo jeito para todas as gateways.

## O que será feito

### 1. Tela "Pagamentos recebidos" (quem pagou)
Reformular a tela de Pagamentos para mostrar, em uma lista única com todas as gateways:
- Nome e telefone do cliente
- Valor pago e valor da fatura
- Gateway que recebeu o pagamento
- Data/hora da confirmação e como foi confirmado (webhook ou consulta na gateway)
- Situação da fatura depois do pagamento

Com busca por nome/telefone, filtro por gateway e por período, e atualização automática a cada poucos segundos (pagamento novo aparece sozinho na tela).

### 2. Tela de webhooks recebidos
Melhorar a aba de webhooks nos Logs para responder "chegou ou não chegou":
- Lista dos últimos webhooks com gateway, evento, se a assinatura foi válida, ID da transação e horário
- Ligação com o cliente/fatura correspondente quando a transação for reconhecida
- Filtro por gateway e por resultado (aceito, assinatura inválida, transação não encontrada)
- Aviso quando o webhook chegou mas não bateu com nenhuma transação

### 3. Situação do webhook por gateway
No topo da tela de Gateways, para cada gateway: endereço do webhook (com botão copiar, já apontando para o site publicado), data/hora do último webhook recebido e quantos chegaram nas últimas 24 horas. Assim dá para saber, de relance, se a gateway está mesmo enviando.

### 4. Passo a passo de configuração
Um bloco curto na tela de Gateways explicando o que colar no painel de cada gateway (URL do webhook, método POST) e como conferir se funcionou.

## Detalhes técnicos
- Enriquecer `webhooks_log` na leitura (join com `transacoes_pix` → fatura/cliente) dentro de `listarLogs` em `src/lib/transacoes.functions.ts`; nova server function `listarPagamentosRecebidos` com join cliente/fatura/gateway.
- Nova server function `resumoWebhooksPorGateway` (último recebido + contagem 24h) consumida por `admin.gateways.tsx`.
- Ajustes de UI em `admin.pagamentos.tsx`, `admin.logs.tsx` e `admin.gateways.tsx`. A rota de webhook e o roteador de gateways continuam como estão.
- Sem mudança de banco: as tabelas `pagamentos`, `transacoes_pix` e `webhooks_log` já têm os dados necessários.
