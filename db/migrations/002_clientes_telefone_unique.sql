-- A importação de clientes faz upsert por telefone (ON CONFLICT (telefone)),
-- que exige um índice único. A 001 criou só um índice comum.
DROP INDEX IF EXISTS clientes_telefone_idx;

-- Remove duplicatas de telefone antes de criar o índice único
-- (mantém a linha mais antiga de cada telefone).
DELETE FROM clientes a
USING clientes b
WHERE a.telefone = b.telefone
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS clientes_telefone_key ON clientes (telefone);
