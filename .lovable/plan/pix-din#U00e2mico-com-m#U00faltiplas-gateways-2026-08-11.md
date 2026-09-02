# PIX dinâmico com múltiplas gateways

Hoje o sistema já tem: tabela `gateways_config` (slug, rótulo, ativo, prioridade), um roteador simples por prioridade (`gateway-router.server.ts`), adaptadores CashinPay, AfiliaxPay e PIX estático, webhooks em `/api/public/*`, e a tela Admin → Gateways com liga/desliga. Falta o restante do que você pediu: cadastro completo de gateway, estratégias de roteamento, tabela de transações PIX, logs, expiração e as telas administrativas de acompanhamento.

## O que será feito

### 1. Banco de dados
- Ampliar `gateways_config`: nome, api_url, ambiente (producao/teste), limite diário de uso, url de webhook, observações, e nome dos segredos usados (nunca a chave em si).
- Nova tabela `transacoes_pix`: cobrança/fatura, gateway usada, id da transação na gateway, valor em centavos, copia-e-cola, status, criado em, expira em, pago em, chave de idempotência.
- Nova tabela `webhooks_log`: gateway, evento, id da transação, assinatura válida (sim/não), recebido em, resumo do payload (sem dados sensíveis).
- Nova tabela `pagamentos_log`: erros e tentativas por gateway (mensagem curta, código HTTP, momento) para a tela de logs.
- Nova configuração de sistema: estratégia de roteamento escolhida (rodízio, prioridade, gateway fixa) e ponteiro do rodízio.
- Todas com permissões e regras de acesso somente para administradores autenticados; gravação feita pelo servidor.

### 2. Payment Router
Serviço único no backend que decide a gateway de cada cobrança:
- **Prioridade** (menor número primeiro), **Rodízio** (alterna entre as ativas), **Gateway específica** (fixa uma) — escolhido no painel.
- **Failover**: se a gateway retornar erro/indisponibilidade, tenta a próxima ativa; cada tentativa vira registro em `pagamentos_log`.
- Respeita limite de uso diário e ambiente configurado.
- Registra em `transacoes_pix` qual gateway atendeu.

### 3. Adaptador padrão de gateway
Interface única (`criarPix`, `consultarStatus`, `validarWebhook`) que todo adaptador implementa. Adicionar uma gateway nova passa a ser: criar um arquivo de adaptador + cadastrar a linha no painel + salvar as credenciais como segredos. Nada mais muda na aplicação. CashinPay, AfiliaxPay e PIX estático serão migrados para essa interface. Fica preparado um adaptador genérico "REST/PIX" que lê api_url e credenciais do cadastro, para a próxima gateway que você escolher.

### 4. PIX exclusivo por cobrança + idempotência
- Cada fatura gera um PIX próprio, com chave de idempotência (fatura + valor em centavos). Se o valor mudar, novo PIX; se não mudar e ainda estiver válido, reaproveita o mesmo.
- Expiração gravada na transação (padrão 30 minutos); expirado gera um novo automaticamente.
- Confirmação de pagamento só via webhook validado ou consulta ao gateway — nunca pelo cliente.

### 5. Webhooks
- Uma rota de webhook por gateway em `/api/public/`, validando assinatura quando a gateway oferece, e com verificação de segredo caso contrário.
- Toda chamada é registrada em `webhooks_log`; pagamentos duplicados são ignorados pela idempotência.
- Ao confirmar, atualiza transação, pagamento e fatura para "paga".

### 6. Página do cliente
Ajustes na tela de fatura: título "Pagamento via PIX", valor, QR Code, botão "Copiar código PIX", contador regressivo de expiração e status ao vivo ("PIX aguardando pagamento" → "Pagamento confirmado"), com atualização automática sem recarregar (a consulta periódica atual passa a usar a transação).

### 7. Painel administrativo
- **Gateways**: cadastrar, editar, ativar/desativar, prioridade, ambiente, limite, URL da API, URL de webhook (copiável), e indicação de credenciais configuradas. Escolha da estratégia de roteamento no topo.
- **Transações**: lista com fatura, gateway usada, valor, status, criação/expiração/pagamento, filtro por status (aprovados, pendentes, recusados/expirados).
- **Logs**: erros de gateway e webhooks recebidos.

## Segurança
Credenciais continuam apenas como segredos do backend (o cadastro guarda só o nome do segredo, nunca o valor) e nada de chave chega ao frontend. Toda comunicação com gateway é server-side, webhooks são validados, e os logs guardam apenas mensagem e código de erro.

## Detalhes técnicos
Migrações SQL para as tabelas acima com RLS + GRANTs; `src/lib/gateways/*.ts` com a interface `GatewayAdapter` e um adaptador por provedor; `src/lib/payment-router.server.ts` substituindo `gateway-router.server.ts`; server functions em `src/lib/gateways.functions.ts` e `src/lib/transacoes.functions.ts`; rotas de webhook em `src/routes/api/public/webhooks/$slug.ts`; telas `admin.gateways.tsx`, `admin.transacoes.tsx` e `admin.logs.tsx`.
