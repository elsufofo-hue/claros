# Tela única de Faturas + importação em massa

## O que muda

### 1. Título da aba
Já está como `Fatura em Dia — Consulte e pague sua fatura`. Confirmo em todas as páginas do painel para ficar consistente.

### 2. Uma tela só: "Clientes e Faturas"
Hoje o painel tem duas telas separadas (Clientes e Faturas). Vira uma única tela `/admin/faturas`:

```text
[ Buscar por telefone ou nome......... ]  [ Importar Planilha ]

Telefone        Nome        Em aberto   Com desconto   Vencimento   Status    Ações
(11) 9....      Maria       R$ 189,90   R$ 89,90       10/09/2026   Pendente  [editar] [gerar PIX]
```

- Uma linha por cliente/fatura, com os dois valores lado a lado.
- Busca única por telefone ou nome (filtra no banco, não na tela — funciona com 20 mil registros).
- Paginação de 50 em 50.
- Editar valores, vencimento e status direto na linha.
- O menu antigo "Clientes" passa a apontar para essa tela; a rota antiga redireciona.

### 3. Importação de planilha (20 mil linhas)
- Botão "Importar Planilha" aceita `.xlsx`, `.xls` e `.csv`.
- Reconhecimento automático de colunas, incluindo exatamente `telefone`, `valor_em_aberto` e `valor_com_desconto` (além das variações já suportadas hoje: "valor em aberto", "valor", "celular", etc.).
- Nome deixa de ser obrigatório: se a planilha só tiver telefone e valores, o cliente é criado com o próprio telefone como nome provisório.
- Envio em lotes de 500 linhas com barra de progresso ("3.500 de 20.000 importados"), para não estourar limite de requisição.
- Telefone repetido atualiza o registro existente em vez de duplicar.
- Ao final: resumo com quantos foram criados, atualizados e quantas linhas foram ignoradas com o motivo.

### 4. Data de vencimento única
O campo de calendário na tela de importação já existe e é obrigatório. A data escolhida se aplica a todas as linhas do arquivo, ignorando qualquer coluna de vencimento da planilha.

### 5. Banco de dados
A tabela `faturas` já tem todos os campos pedidos (`id`, valores, `status`, vencimento, `pix_copia_e_cola`, `boleto_codigo`, `data_pagamento`). O telefone único vive na tabela `clientes`, ligada à fatura — mantenho esse desenho porque o site público inteiro depende dele, e a leitura "uma linha por telefone" continua disponível pela camada `faturas_por_telefone`.

Ajustes necessários:
- Índices para busca rápida por telefone e nome com 20 mil linhas.
- Uma função no banco que grava um lote inteiro de clientes+faturas de uma vez (hoje é linha a linha, o que levaria minutos com 20 mil registros).

### 6. Busca e consulta
- No painel: busca por telefone ou nome mostrando em aberto, com desconto, status e vencimento.
- No site público: continua a consulta por telefone, sem mudança.

### 7. Gateway de pagamento
O adaptador (`gatewayAtual`) e o endpoint de cobrança já estão prontos. Acrescento na tela unificada um botão "Gerar PIX/boleto" por linha e uma ação em massa para gerar cobrança de todas as faturas pendentes.

## Detalhes técnicos
- `src/routes/_authenticated/admin.faturas.tsx`: tela unificada com busca server-side, paginação e edição inline.
- `src/routes/_authenticated/admin.clientes.tsx`: vira redirect para a tela unificada.
- `src/lib/clientes.functions.ts`: limite sobe de 1.000 para 500 por chamada em lote, nome opcional, upsert por telefone via RPC.
- `src/components/importar-clientes.tsx`: envio em lotes com progresso, aliases `valor_em_aberto` / `valor_com_desconto`, vencimento global obrigatório.
- Migração: índices em `clientes.telefone`, `clientes.nome`, `faturas.cliente_id` e função de upsert em lote.

## Ao final entrego
Link público, URL do banco, chave pública e os endpoints de consulta e de geração de PIX/boleto.
