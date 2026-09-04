-- Renomeia o texto exibido ao cliente em /fatura/$telefone (CardFatura usa
-- faturas.descricao direto). O import de faturas em massa gravava
-- 'Fatura importada' — trocado para 'Fatura Atual' em clientes.functions.ts;
-- esta migration corrige os dados já gravados com o texto antigo.

UPDATE faturas
SET descricao = 'Fatura Atual', updated_at = now()
WHERE descricao = 'Fatura importada';
