-- Configuração do redirect. Domínio único, destino único:
-- a tabela guarda no máximo uma linha "ativa" (id = 1).
CREATE TABLE IF NOT EXISTS redirect_config (
  id          integer PRIMARY KEY DEFAULT 1,
  destino     text        NOT NULL,
  status_code integer     NOT NULL DEFAULT 302,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT redirect_config_singleton CHECK (id = 1),
  CONSTRAINT redirect_config_status_code CHECK (status_code IN (301, 302, 307, 308)),
  CONSTRAINT redirect_config_destino_url CHECK (destino ~* '^https?://')
);

-- Semente inicial: só cria a linha se ainda não existir.
-- Troque o destino depois via /_admin (com REDIRECT_ADMIN_TOKEN) ou direto no banco.
INSERT INTO redirect_config (id, destino, status_code)
VALUES (1, 'https://example.com', 302)
ON CONFLICT (id) DO NOTHING;
