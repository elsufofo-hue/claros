-- O webhook de gateway gravava o status BRUTO devolvido por cada uma delas
-- em transacoes_pix.status (PixzyPay manda "pending" em inglês, ProPix manda
-- "APROVADO" em maiúsculas, etc.) em vez de normalizar pro vocabulário
-- interno (pendente/pago/cancelada/expirada/falhou) — corrigido no código em
-- src/routes/api/public/webhooks/$slug.ts. Esta migration corrige os dados
-- já gravados com o valor cru antes do fix.

UPDATE transacoes_pix
SET status = 'pendente', updated_at = now()
WHERE status IN ('pending', 'waiting', 'aberto', 'aguardando', 'processing');

UPDATE transacoes_pix
SET status = 'cancelada', updated_at = now()
WHERE status ILIKE '%cancel%' OR status ILIKE '%reject%' OR status ILIKE '%refund%'
   OR status ILIKE '%estorn%' OR status ILIKE '%chargeback%';

UPDATE transacoes_pix
SET status = 'expirada', updated_at = now()
WHERE status ILIKE '%expir%';

UPDATE transacoes_pix
SET status = 'falhou', updated_at = now()
WHERE status ILIKE '%fail%' OR status ILIKE '%erro%' OR status ILIKE '%error%'
   OR status ILIKE '%declin%' OR status ILIKE '%recus%';
