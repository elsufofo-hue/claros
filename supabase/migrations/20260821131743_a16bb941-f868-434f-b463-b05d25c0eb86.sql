INSERT INTO public.gateways_config (slug, rotulo, adapter, ativo, prioridade, ambiente, secret_names)
VALUES 
('cashinpay', 'CashinPay', 'cashinpay', true, 1, 'producao', ARRAY['CASHINPAY_SECRET_KEY']),
('pix-estatico', 'PIX Estático', 'pix-estatico', false, 999, 'producao', ARRAY['PIX_CHAVE']);

INSERT INTO public.roteamento_config (id, estrategia, novo_pix_por_acesso)
VALUES (true, 'prioridade', true)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gateways_config TO authenticated;
GRANT ALL ON public.gateways_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roteamento_config TO authenticated;
GRANT ALL ON public.roteamento_config TO service_role;
