# Corrigir a geração do PIX dinâmico

Hoje, ao abrir a página de pagamento, o backend reaproveita a cobrança anterior: `criarCobrancaPix` procura uma transação com a chave `fatura:<id>:<centavos>` e, se existir e não estiver vencida, devolve o mesmo copia-e-cola, o mesmo QR Code e o mesmo `transaction_id` — sem chamar a gateway. Além disso, o frontend guarda esse resultado com cache infinito e não tem botão para pedir outro PIX. O valor já é o valor com desconto (isso está correto e será mantido).

## O que muda

### 1. Cada geração cria uma cobrança nova de verdade
- O Payment Router deixa de "procurar transação existente antes de criar". Toda chamada de geração roda o roteador, escolhe a gateway conforme a estratégia (prioridade / rodízio / fixa, com failover) e chama a API da gateway.
- A chave de idempotência passa a ser **por tentativa** (identificador único gerado a cada pedido), nunca mais por fatura+valor. Assim nunca uma transação antiga é devolvida como se fosse nova.
- A referência enviada à gateway continua única por tentativa, garantindo `transaction_id` diferente a cada geração.

### 2. Histórico preservado
- Cada geração grava uma **nova linha** em transações PIX (fatura, gateway, valor, status, expiração). Nada é sobrescrito.
- Ao criar uma nova transação, as anteriores ainda pendentes daquela fatura passam a "substituída/expirada", para que o painel e o polling saibam qual é a vigente.
- A fatura continua guardando os campos legados (txid e copia-e-cola) apontando sempre para a transação mais recente.

### 3. Configuração no painel: "Gerar novo PIX a cada acesso"
- Nova opção no painel de Gateways, junto da estratégia de roteamento.
- **Ligada (padrão):** todo acesso à página de pagamento gera uma cobrança nova na gateway.
- **Desligada:** se existir uma transação pendente ainda dentro da validade, ela é reaproveitada; caso contrário, gera uma nova.
- O botão "Gerar novo PIX" ignora essa configuração e sempre cria uma cobrança nova.

### 4. Tela do cliente
- Botão **"Gerar novo PIX"** abaixo do código, que chama o backend, cria nova cobrança, e atualiza QR Code, copia-e-cola e contagem regressiva.
- A contagem regressiva passa a usar a expiração daquela transação específica; ao chegar a zero, a tela mostra "PIX expirado" e o botão de gerar novo fica em destaque.
- O cache infinito da consulta é removido; o pedido inicial passa a ser uma chamada controlada ao backend (uma única vez por carregamento, mesmo com recarga automática de foco).

### 5. Proteção contra duplo clique e cobranças acidentais
- Botão bloqueado enquanto a criação estiver em andamento.
- Trava no backend por fatura: pedidos repetidos em uma janela curta (poucos segundos) recebem a transação recém-criada em vez de disparar outra cobrança na gateway.
- Fatura já paga nunca gera nova cobrança (retorno imediato de "paga").

### 6. Webhook e confirmação
- O webhook continua casando pelo `transaction_id` da transação específica; ao confirmar, marca aquela transação como paga, registra data e valor pagos, marca a fatura como paga e cancela/expira as demais transações pendentes da mesma fatura.
- Depois de paga, novas gerações ficam bloqueadas.

## Detalhes técnicos

- **Banco (migração):**
  - `roteamento_config`: nova coluna `novo_pix_por_acesso boolean not null default true`.
  - `transacoes_pix`: coluna `valor_pago_centavos integer` e `substituida_em timestamptz`; a restrição única de `idempotency_key` é mantida, mas a chave passa a ser única por tentativa.
- **`src/lib/payment-router.server.ts`:** remover `transacaoVigente` do caminho de criação; adicionar `criarCobrancaPix({ forcarNova })` e `buscarTransacaoVigente()` separada, usada só quando a configuração permite reaproveitar. `confirmarPagamento` passa a gravar valor pago e expirar as irmãs pendentes.
- **`src/lib/consulta.functions.ts`:** `gerarPixFatura` recebe `forcar?: boolean`; lê a flag `novo_pix_por_acesso`; devolve `transacao_id`, `expira_em` e `gateway`.
- **`src/lib/gateways.functions.ts`:** `lerRoteamento` / `salvarRoteamento` passam a incluir `novo_pix_por_acesso`.
- **`src/routes/_authenticated/admin.gateways.tsx`:** switch "Gerar novo PIX a cada acesso" no cartão de estratégia.
- **`src/components/fatura-card.tsx`:** mutation "Gerar novo PIX", estado de expiração por transação, remoção do `staleTime: Infinity`.

## Verificação

Após implementar, gerar o PIX duas vezes para a mesma fatura e conferir no painel de Transações PIX que existem duas linhas com `transaction_id` diferentes, ambas com o valor com desconto, e que a estratégia de rodízio alterna a gateway entre elas.
