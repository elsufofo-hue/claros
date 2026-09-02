# Plano de Integração: Gateway ProPix

Este plano descreve a integração completa da gateway ProPix como uma segunda opção de pagamento PIX no sistema.

## Alterações Técnicas

### 1. Configurações e Segurança
- Adicionar os segredos `PROPIX_CLIENT_ID` e `PROPIX_CLIENT_SECRET` via ferramenta de gerenciamento de segredos.
- Garantir que todas as chamadas sejam feitas exclusivamente no lado do servidor (Edge functions).

### 2. Implementação do Adaptador (Backend)
- Criar o arquivo `src/lib/propix.server.ts` para lidar com a comunicação direta com a API da ProPix.
  - Implementar `criarCobrancaPix`: POST `/api/v1/deposit` com cabeçalhos `x-client-id` e `x-client-secret`.
  - Implementar `consultarTransacao`: POST `/api/v1/check` para consulta de status.
- Atualizar `src/lib/gateways/adapters.server.ts`:
  - Registrar o novo adaptador `propix`.
  - Implementar a lógica de leitura de webhook (`lerWebhook`) com validação extra via consulta de status (double-check), já que a ProPix não utiliza assinatura HMAC.
- Atualizar `src/lib/gateways.functions.ts` para incluir a verificação de configuração do adaptador `propix`.

### 3. Painel Administrativo
- Atualizar `src/routes/_authenticated/admin.gateways.tsx` para incluir "ProPix" na lista de adaptadores disponíveis no formulário de criação/edição.

### 4. Webhook e Fluxo de Pagamento
- Utilizar a rota de webhook genérica existente (`/api/public/webhooks/$slug`).
- A URL do webhook para configuração na ProPix será: `{DOMINIO}/api/public/webhooks/propix`.
- No `lerWebhook` do ProPix, implementar uma verificação de segurança adicional chamando a API de `/check` antes de confirmar o pagamento.

### 5. Frontend e Polling
- O frontend utilizará o fluxo de polling já existente que consome o `status` da transação no banco de dados, que será atualizado pelo servidor ou pelo webhook.

## User Review Required

> [!IMPORTANT]
> A ProPix não envia uma assinatura de segurança (HMAC) nos webhooks. Para garantir a segurança, implementaremos uma verificação manual (double-check) na API deles antes de dar baixa em qualquer fatura.

Você deseja que eu prossiga com a implementação completa agora?