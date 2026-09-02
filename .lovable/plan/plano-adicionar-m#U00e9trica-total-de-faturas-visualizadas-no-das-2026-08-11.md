# Plano: Adicionar métrica "Total de faturas visualizadas" no dashboard

## Objetivo
Incluir no painel administrativo um terceiro número que mostre quantas faturas foram visualizadas pelos clientes, ao lado das métricas já existentes.

## Alterações previstas

### 1. Backend — métricas de acesso
- Arquivo: `src/lib/acessos.functions.ts`
- Adicionar o campo `faturas_visualizadas` (ou `faturas_visualizadas_total`) ao tipo `MetricasAcessos`.
- No handler `obterMetricasAcessos`, calcular o total de registros de acesso onde `sucesso = true` e `telefone_consultado` não é nulo. Isso representa cada vez que um cliente digitou um telefone e a fatura foi exibida.

### 2. Frontend — dashboard
- Arquivo: `src/routes/_authenticated/admin.index.tsx`
- Alterar o grid de 2 para 3 colunas (`sm:grid-cols-3`).
- Adicionar um novo cartão com:
  - Título: "Total de faturas visualizadas"
  - Valor: `metricas.faturas_visualizadas_total`
  - Descrição: "Faturas consultadas com sucesso"
  - Ícone: `FileText` (do lucide-react)
- Atualizar o subtítulo da página para refletir as três métricas.

### 3. Validação
- A métrica deve refletir em tempo real via Supabase Realtime (já configurado para a tabela `acessos`).
- Após limpar o histórico, o número deve zerar junto com os demais.
