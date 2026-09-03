-- Gateway PixzyPay (https://docs.pixzypay.com/).
-- Cadastra a linha em gateways_config para o gateway aparecer no painel /admin.
-- Vem DESATIVADO (ativo = false) e sem prioridade competitiva — o operador
-- ativa e ordena pelo painel depois de setar PIXZYPAY_TOKEN no ambiente.

INSERT INTO gateways_config (slug, rotulo, adapter, ativo, prioridade, api_url, ambiente, webhook_url, secret_names, observacoes)
VALUES ('pixzypay', 'PixzyPay', 'pixzypay', false, 40, 'https://app.pixzypay.com/api', 'producao',
        NULL, ARRAY['PIXZYPAY_TOKEN'],
        'Gateway PIX PixzyPay. Bearer token. Valores em centavos (mín. 500). Copia-e-cola vem em data.br_code. Webhook sem assinatura — baixa via double-check GET /transactions/{id}.')
ON CONFLICT (slug) DO NOTHING;
