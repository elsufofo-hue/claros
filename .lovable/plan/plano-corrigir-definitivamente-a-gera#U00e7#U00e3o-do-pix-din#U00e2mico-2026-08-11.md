# Plano: corrigir definitivamente a geração do PIX dinâmico

## Objetivo
Garantir que cada geração solicitada crie uma cobrança real e independente na gateway, sempre pelo valor com desconto, mantendo o histórico e respeitando prioridade, rodízio, gateway fixa e failover.

## Diagnóstico confirmado
- O fluxo público principal já usa `gerarPixFatura` e o Payment Router, grava uma nova linha em `transacoes_pix` e possui a opção administrativa `novo_pix_por_acesso`.
- O banco já contém exemplos da mesma fatura com `transaction_id` diferentes e o mesmo valor com desconto.
- Ainda existe um fluxo legado usado pela administração (`/api/public/cobranca`) que ignora o Payment Router, gera PIX estático e sobrescreve os campos da fatura sem criar histórico em `transacoes_pix`.
- Os webhooks legados localizam somente `faturas.pix_txid`; assim, uma confirmação atrasada de uma transação anterior pode não encontrar a cobrança correta. O webhook unificado já consulta `transacoes_pix`, mas os caminhos antigos ainda coexistem.
- A proteção atual contra duplicidade consulta cobranças criadas nos últimos 8 segundos. Duas requisições realmente simultâneas ainda podem passar antes da primeira gravação, e o botão forçado ignora essa proteção por completo.
- A chave gravada como `idempotency_key` é única no banco, mas não é o identificador enviado à gateway; a referência enviada e o registro local são gerados separadamente.
- O polling consulta apenas a transação mais recente. Uma transação anterior ainda válida que for paga depois de substituída depende exclusivamente do webhook para ser confirmada.
- A expiração é atualizada no banco apenas quando a rotina de reaproveitamento consulta a transação; com “novo PIX por acesso” ligado, registros antigos podem permanecer como pendentes após o horário de expiração.

## Implementação

### 1. Unificar toda criação no Payment Router
- Fazer a ação administrativa de gerar cobrança usar o mesmo serviço central do fluxo público.
- Remover o gerador estático e o roteador duplicado dos caminhos ativos, eliminando qualquer criação que sobrescreva somente `faturas.pix_*`.
- Manter `faturas.pix_*` apenas como espelho de compatibilidade da transação atual; a fonte de verdade será `transacoes_pix`.

### 2. Idempotência e concorrência no backend
- Criar um identificador único por solicitação de geração e reutilizá-lo como referência externa/idempotency key enviada ao adaptador e gravada em `transacoes_pix`.
- Adicionar uma trava transacional no banco por fatura + solicitação, para impedir cobranças duplicadas causadas por duplo clique, chamadas simultâneas ou repetição da mesma requisição.
- Uma nova ação intencional do botão receberá uma nova chave e criará uma nova cobrança; a repetição acidental da mesma ação devolverá o resultado já criado.
- Validar novamente o status da fatura dentro da operação e bloquear geração quando ela já estiver paga.

### 3. Valor exato com desconto
- Centralizar o cálculo em centavos inteiros: usar `valor_desconto` quando for positivo e recorrer ao original somente quando não houver desconto válido.
- Passar os mesmos centavos ao adaptador, ao histórico, ao pagamento pendente e à resposta para o frontend.
- Rejeitar valores inválidos ou menores que um centavo, em vez de gerar cobrança divergente.

### 4. Roteamento e failover
- Executar o Payment Router em toda nova geração.
- Preservar prioridade, rodízio, gateway fixa, limites e failover entre gateways ativas.
- Tornar o avanço do rodízio seguro para chamadas concorrentes e validar que a estratégia fixa tenha uma gateway ativa selecionada.
- Cada tentativa de failover terá referência própria e log associado, sem transformar uma cobrança antiga em nova.

### 5. Histórico, vigência e expiração
- Inserir uma linha nova em `transacoes_pix` após cada criação bem-sucedida, sem apagar ou sobrescrever as anteriores.
- Marcar a transação anterior como substituída somente depois que a nova estiver salva com sucesso.
- Atualizar transações pendentes vencidas para `expirada` ao consultar, gerar ou verificar status.
- Quando a opção “Gerar novo PIX a cada acesso” estiver desligada, reutilizar apenas a última transação vigente, não substituída, com o mesmo valor e dentro da validade.

### 6. Webhooks e confirmação do pagamento
- Consolidar CashinPay, AfiliaxPay e demais gateways no webhook unificado por adaptador.
- Localizar a linha exata por gateway + `transacao_gateway_id`, inclusive quando for uma transação anterior/substituída.
- Validar assinatura ou confirmar o status diretamente na API da gateway antes da baixa.
- Em uma operação idempotente: marcar a transação exata como paga, registrar `pago_em` e `valor_pago_centavos`, marcar a fatura como paga e cancelar as demais transações pendentes.
- Fazer o registro em `pagamentos` representar a transação efetivamente liquidada, sem reatribuir silenciosamente um pagamento antigo.

### 7. Frontend público e painel
- Manter a geração automática ao abrir a página, respeitando `novo_pix_por_acesso` no backend.
- Fazer “Gerar novo PIX” criar uma nova intenção com chave própria, desabilitar o botão durante a solicitação e substituir QR Code, copia-e-cola, identificador e contador somente após sucesso.
- Ao expirar, bloquear cópia/uso visual do código vencido e liberar claramente a criação de outro PIX.
- Manter no painel o controle “Gerar novo PIX a cada acesso” e impedir configuração de gateway fixa sem uma gateway válida.

## Validação
- Testar a mesma fatura duas vezes e comprovar no banco e na resposta:
  - duas linhas distintas em `transacoes_pix`;
  - `transaction_id`/`charge_id`, referência e copia-e-cola diferentes;
  - mesmo `valor_centavos`, igual ao valor com desconto;
  - primeira transação preservada no histórico e segunda vigente.
- Testar duplo clique/repetição da mesma solicitação e confirmar que apenas uma cobrança é criada.
- Testar prioridade, rodízio, gateway fixa e falha da primeira gateway com failover.
- Testar configuração ligada e desligada, expiração, bloqueio após pagamento e confirmação de uma transação anterior pelo webhook.
- Verificar a tela pública em desktop e celular, incluindo QR Code e reinício correto da contagem regressiva.

## Detalhes técnicos
- Alterações concentradas no Payment Router, adaptadores, funções de consulta, webhooks, endpoint administrativo, componente da fatura e uma migração para a trava/idempotência transacional.
- Nenhuma credencial será exposta no navegador; criação e confirmação continuarão exclusivamente no backend.