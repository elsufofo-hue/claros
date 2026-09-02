# Auditoria: importação x consulta pública

Conclusão da verificação: **importação e consulta usam o mesmo banco e as mesmas tabelas**. Não há divergência de origem de dados — nenhuma unificação é necessária.

## 1. Onde a importação salva

Banco: Lovable Cloud (Postgres/Supabase), schema `public`.

- Tabela `clientes` — `nome`, `telefone` (chave de deduplicação), `email`, `documento`, `observacoes`
- Tabela `faturas` — `cliente_id`, `descricao`, `valor_original`, `valor_desconto`, `vencimento`, `status`, `pix_txid`, `pix_copia_cola`, `boleto_codigo`, `boleto_url`, `data_pagamento`

Fluxo: `src/components/importar-clientes.tsx` → `importarClientes` (`src/lib/clientes.functions.ts`, exige papel admin) → função no banco `importar_faturas_lote`, que faz upsert em `clientes` por telefone e cria/atualiza a fatura correspondente com o vencimento único escolhido no calendário.

## 2. De onde a consulta pública lê

- Página `/fatura/{telefone}` (`src/routes/fatura.$telefone.tsx`) → `consultarFaturas` (`src/lib/consulta.functions.ts`) → lê `clientes` por `telefone` e depois `faturas` por `cliente_id`.
- Endpoint `GET /api/public/faturas?telefone=...` → lê a visão `faturas_por_telefone`, que é apenas um join de `clientes` + `faturas` (uma linha por telefone, priorizando fatura em aberto/vencida).

## 3. Mesma origem?

Sim. Ambos apontam para as mesmas tabelas `public.clientes` e `public.faturas` no mesmo projeto de banco. A visão não duplica dados, apenas apresenta o join.

## 4. Resultado da consulta SQL direta

```text
telefone     | nome  | fatura                              | em aberto | com desconto | status    | vencimento
13991757780  | Lucas | (sem fatura)                        |         - |            - | -         | -
11991757780  | lucas | b6922603-2b85-4a11-a96a-b5fc14742119|   5600.00 |      2500.00 | em_aberto | 2026-08-06
```

Totais: 2 clientes, 1 fatura.

## 5. Teste da consulta pública

- API: `GET /api/public/faturas?telefone=11991757780` → 200, valores 5600 / 2500, status `em_aberto`, vencimento 2026-08-06.
- Página `/fatura/11991757780` → 200, exibindo "R$ 5.600,00" e "R$ 2.500,00" — idênticos ao banco.

## O que realmente merece ajuste

Só um ponto, e é de dados, não de código: o cliente `13991757780` (cadastro antigo, anterior à importação) não tem fatura, então a tela pública mostra "Nenhuma fatura encontrada" para ele. Opções:

1. Não fazer nada — o comportamento está correto.
2. Reimportar esse telefone na planilha com valores e vencimento, para que ele passe a ter fatura.
3. Remover o cadastro duplicado/antigo, se ele foi só um teste.

Se você escolher a opção 2 ou 3, faço a alteração de dados; nenhuma mudança de código é necessária.
