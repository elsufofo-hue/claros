-- ============================================================================
-- Schema inicial do claros — reconstruído a partir de
-- src/integrations/supabase/types.ts (o Supabase original não versionou o DDL).
--
-- Convenções:
--   - IDs uuid com gen_random_uuid() (extensão pgcrypto)
--   - timestamps timestamptz com default now()
--   - valores monetários em numeric(12,2), exceto *_centavos que são integer
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fatura_status AS ENUM (
    'em_aberto', 'paga', 'vencida', 'cancelada',
    'expirada', 'falhou', 'em_processamento'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pagamento_status AS ENUM (
    'pendente', 'confirmado', 'falhou', 'estornado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- clientes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  telefone    text NOT NULL,
  documento   text,
  email       text,
  observacoes text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clientes_telefone_idx ON clientes (telefone);

-- ---------------------------------------------------------------------------
-- faturas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS faturas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id         uuid NOT NULL REFERENCES clientes (id) ON DELETE CASCADE,
  descricao          text NOT NULL DEFAULT '',
  referencia         text,
  valor_original     numeric(12,2) NOT NULL DEFAULT 0,
  valor_desconto     numeric(12,2) NOT NULL DEFAULT 0,
  vencimento         date NOT NULL,
  status             fatura_status NOT NULL DEFAULT 'em_aberto',
  data_pagamento     timestamptz,
  boleto_codigo      text,
  boleto_url         text,
  pix_copia_cola     text,
  pix_txid           text,
  pix_valor_centavos integer,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS faturas_cliente_id_idx ON faturas (cliente_id);
CREATE INDEX IF NOT EXISTS faturas_status_idx ON faturas (status);
CREATE INDEX IF NOT EXISTS faturas_vencimento_idx ON faturas (vencimento);

-- ---------------------------------------------------------------------------
-- gateways_config
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gateways_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  rotulo        text NOT NULL,
  adapter       text NOT NULL DEFAULT 'generico',
  ativo         boolean NOT NULL DEFAULT false,
  prioridade    integer NOT NULL DEFAULT 100,
  ambiente      text NOT NULL DEFAULT 'producao',
  api_url       text,
  limite_diario integer,
  webhook_url   text,
  secret_names  text[] NOT NULL DEFAULT '{}',
  observacoes   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- roteamento_config  (singleton — id boolean, sempre true)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roteamento_config (
  id                  boolean PRIMARY KEY DEFAULT true,
  estrategia          text NOT NULL DEFAULT 'prioridade',
  gateway_fixa        uuid REFERENCES gateways_config (id) ON DELETE SET NULL,
  novo_pix_por_acesso boolean NOT NULL DEFAULT true,
  ponteiro            integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roteamento_config_singleton CHECK (id = true)
);

-- ---------------------------------------------------------------------------
-- pagamentos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagamentos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id          uuid NOT NULL REFERENCES faturas (id) ON DELETE CASCADE,
  cliente_id         uuid REFERENCES clientes (id) ON DELETE SET NULL,
  valor              numeric(12,2) NOT NULL DEFAULT 0,
  metodo             text NOT NULL DEFAULT 'pix',
  status             pagamento_status NOT NULL DEFAULT 'pendente',
  gateway            text,
  gateway_payment_id text,
  pago_em            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pagamentos_fatura_id_idx ON pagamentos (fatura_id);
CREATE INDEX IF NOT EXISTS pagamentos_cliente_id_idx ON pagamentos (cliente_id);
CREATE INDEX IF NOT EXISTS pagamentos_status_idx ON pagamentos (status);

-- ---------------------------------------------------------------------------
-- pagamentos_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagamentos_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_slug text NOT NULL,
  fatura_id    uuid REFERENCES faturas (id) ON DELETE SET NULL,
  nivel        text NOT NULL DEFAULT 'info',
  mensagem     text NOT NULL,
  http_status  integer,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pagamentos_log_gateway_slug_idx ON pagamentos_log (gateway_slug);
CREATE INDEX IF NOT EXISTS pagamentos_log_created_at_idx ON pagamentos_log (created_at DESC);

-- ---------------------------------------------------------------------------
-- transacoes_pix
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transacoes_pix (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id            uuid NOT NULL REFERENCES faturas (id) ON DELETE CASCADE,
  cliente_id           uuid REFERENCES clientes (id) ON DELETE SET NULL,
  gateway_slug         text NOT NULL,
  gateway_id           uuid REFERENCES gateways_config (id) ON DELETE SET NULL,
  idempotency_key      text NOT NULL,
  transacao_gateway_id text,
  status               text NOT NULL DEFAULT 'pendente',
  valor_centavos       integer NOT NULL,
  valor_pago_centavos  integer,
  copia_cola           text,
  qrcode               text,
  expira_em            timestamptz,
  pago_em              timestamptz,
  substituida_em       timestamptz,
  webhook_id           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS transacoes_pix_idempotency_key_idx
  ON transacoes_pix (idempotency_key);
CREATE INDEX IF NOT EXISTS transacoes_pix_fatura_id_idx ON transacoes_pix (fatura_id);
CREATE INDEX IF NOT EXISTS transacoes_pix_status_idx ON transacoes_pix (status);
CREATE INDEX IF NOT EXISTS transacoes_pix_gateway_txid_idx
  ON transacoes_pix (transacao_gateway_id);

-- ---------------------------------------------------------------------------
-- pix_generation_requests  (idempotência da geração de PIX)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pix_generation_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id    uuid NOT NULL REFERENCES faturas (id) ON DELETE CASCADE,
  request_key  text NOT NULL,
  status       text NOT NULL DEFAULT 'pendente',
  transacao_id uuid REFERENCES transacoes_pix (id) ON DELETE SET NULL,
  erro         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pix_generation_requests_request_key_idx
  ON pix_generation_requests (request_key);

-- ---------------------------------------------------------------------------
-- webhooks_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhooks_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_slug         text NOT NULL,
  evento               text,
  transacao_gateway_id text,
  assinatura_valida    boolean NOT NULL DEFAULT false,
  resumo               text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhooks_log_gateway_slug_idx ON webhooks_log (gateway_slug);
CREATE INDEX IF NOT EXISTS webhooks_log_created_at_idx ON webhooks_log (created_at DESC);

-- ---------------------------------------------------------------------------
-- acessos  (log de acessos à consulta pública)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acessos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pagina              text NOT NULL,
  data_hora           timestamptz NOT NULL DEFAULT now(),
  sucesso             boolean NOT NULL DEFAULT false,
  telefone_consultado text,
  valor_original      numeric(12,2),
  valor_desconto      numeric(12,2),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS acessos_data_hora_idx ON acessos (data_hora DESC);

-- ---------------------------------------------------------------------------
-- profiles  (mantida por compat; espelhava auth.users do Supabase)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL DEFAULT '',
  nome       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- user_roles  (mantida por compat; a auth nova usa senha única via env)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  role       app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- ---------------------------------------------------------------------------
-- View: faturas_por_telefone
-- Une faturas + clientes e renomeia colunas para a consulta pública.
-- Uma linha por telefone: a fatura mais relevante (não paga primeiro, depois
-- vencimento mais recente).
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS faturas_por_telefone;
CREATE VIEW faturas_por_telefone AS
SELECT DISTINCT ON (c.telefone)
  c.telefone                                   AS telefone,
  c.nome                                       AS nome,
  f.id                                         AS fatura_id,
  f.valor_original::float8                      AS valor_em_aberto,
  f.valor_desconto::float8                      AS valor_com_desconto,
  f.status::text                               AS status,
  to_char(f.vencimento, 'YYYY-MM-DD')          AS data_vencimento,
  f.pix_copia_cola                             AS pix_copia_e_cola,
  f.boleto_codigo                              AS boleto_codigo,
  f.boleto_url                                 AS boleto_url,
  f.data_pagamento                             AS data_pagamento
FROM clientes c
JOIN faturas f ON f.cliente_id = c.id
ORDER BY
  c.telefone,
  (f.status = 'paga') ASC,   -- não pagas primeiro
  f.vencimento DESC;

-- ---------------------------------------------------------------------------
-- Function: avancar_ponteiro_gateway(p_total int) -> int
-- Round-robin: incrementa o ponteiro do roteamento (mod p_total) e devolve
-- a posição ANTERIOR (a que deve ser usada nesta chamada).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION avancar_ponteiro_gateway(p_total integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_atual integer;
BEGIN
  IF p_total IS NULL OR p_total <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE roteamento_config
     SET ponteiro = (ponteiro + 1) % p_total,
         updated_at = now()
   WHERE id = true
  RETURNING (ponteiro - 1 + p_total) % p_total INTO v_atual;

  IF v_atual IS NULL THEN
    -- roteamento_config ainda não existe: cria e usa posição 0
    INSERT INTO roteamento_config (id, ponteiro) VALUES (true, 1 % p_total)
    ON CONFLICT (id) DO NOTHING;
    RETURN 0;
  END IF;

  RETURN v_atual;
END;
$$;

-- ---------------------------------------------------------------------------
-- Seeds  (das migrations Supabase originais)
-- ---------------------------------------------------------------------------
INSERT INTO gateways_config (slug, rotulo, adapter, ativo, prioridade, ambiente, secret_names)
VALUES
  ('cashinpay', 'CashinPay', 'cashinpay', true, 1, 'producao', ARRAY['CASHINPAY_SECRET_KEY']),
  ('pix-estatico', 'PIX Estático', 'pix-estatico', false, 999, 'producao', ARRAY['PIX_CHAVE'])
ON CONFLICT (slug) DO NOTHING;

INSERT INTO gateways_config (slug, rotulo, adapter, ativo, prioridade, api_url, ambiente, webhook_url, secret_names, observacoes)
VALUES ('m2pay', 'M2 Pay', 'm2pay', false, 30, 'https://api.m2pay.pro/api', 'producao',
        NULL, ARRAY['M2PAY_API_KEY'],
        'Gateway PIX M2 Pay. Valores em centavos. Copia-e-cola vem em data.pix.emv.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO roteamento_config (id, estrategia, novo_pix_por_acesso)
VALUES (true, 'prioridade', true)
ON CONFLICT (id) DO NOTHING;
