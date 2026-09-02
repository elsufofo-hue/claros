---
name: Integração CashinPay PIX
description: Integração completa do gateway CashinPay PIX, incluindo criação de transação, consulta de status e webhook com validação de assinatura.
type: feature
---

# Plano de Implementação: Integração CashinPay PIX

Este plano descreve as etapas para integrar o gateway CashinPay PIX substituindo a lógica atual, garantindo que o fluxo de checkout e confirmação de pagamento funcione de ponta a ponta.

## Mudanças Propostas

### Backend (Server Functions e Helpers)

1.  **Refatorar `src/lib/cashinpay.server.ts`**:
    *   Ajustar a criação de transação para seguir o formato exato da API CashinPay (conforme as instruções do usuário).
    *   Garantir que o `amount` seja enviado em reais (centavos / 100).
    *   Implementar a captura correta dos campos `data.pix.qrcode` e `data.pix.copy_paste`.
    *   Melhorar o tratamento de erros para reportar mensagens amigáveis ao invés de apenas `null`.

2.  **Atualizar Adaptador em `src/lib/gateways/adapters.server.ts`**:
    *   Ajustar a função `lerWebhook` para implementar a validação de assinatura HMAC-SHA256 usando o cabeçalho `X-CashinPay-Signature` e o segredo `CASHINPAY_WEBHOOK_SECRET`.

### Banco de Dados (Configuração)

1.  **Registrar Secrets**:
    *   Solicitar ao usuário as chaves `CASHINPAY_API_KEY` (usada no código como `CASHINPAY_SECRET_KEY`) e `CASHINPAY_WEBHOOK_SECRET`.

### Verificação

1.  **Logs e Testes**:
    *   Utilizar os logs já existentes em `pagamentos_log` para verificar se a API está respondendo 201 Created.
    *   Testar a geração do PIX no front-end após as correções.

## Detalhes Técnicos

*   **Endpoint de Transação**: `POST https://api.cashinpaybr.com/api/v1/transactions`
*   **Assinatura Webhook**: `crypto.createHmac('sha256', secret).update(body).digest('hex')` comparado com o cabeçalho `X-CashinPay-Signature`.
*   **Mapeamento de Dados**:
    *   `data.pix.qrcode` -> `qrcode` (imagem)
    *   `data.pix.copy_paste` -> `copia_cola` (código para o botão copiar)

## Perguntas
1. Você já possui a `CASHINPAY_WEBHOOK_SECRET` gerada no painel da CashinPay ou deseja que eu use uma chave genérica para você configurar lá depois?
