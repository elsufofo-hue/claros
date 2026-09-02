# Vencimento único na importação, endpoint por telefone e preparo para gateway

## Situação atual (verificada)

- O título da aba já está como **"Fatura em Dia — Consulte e pague sua fatura"** (`src/routes/__root.tsx`). Nada a fazer no item 1.
- Já existe a tabela `faturas` no banco, ligada à tabela `clientes` (o telefone fica em `clientes`). Ela já tem: valores original e com desconto, vencimento, status, PIX (copia e cola e txid) e a tabela `pagamentos` com data de pagamento. Falta apenas o campo de **boleto**.
- A importação de planilha já cria/atualiza faturas, mas o vencimento vem da planilha (ou cai num padrão de 7 dias) — ainda não dá para escolher uma data única no calendário.
- Já existe o endpoint `GET /api/public/faturas?telefone=...` criado agora há pouco, mas ele devolve só os valores somados.

Recriar a tabela `faturas` do zero, no formato solicitado, apagaria os dados e quebraria home, página de fatura, área administrativa, PIX e importação. A proposta abaixo entrega o mesmo resultado prático, aproveitando o que já funciona.

## O que será feito

### 1. Banco de dados
- Adicionar à tabela `faturas` os campos que faltam: `boleto_codigo` (opcional), `boleto_url` (opcional) e `data_pagamento`.
- Atualizar a visão de consulta para expor por telefone: valor em aberto, valor com desconto, status, data de vencimento, PIX copia e cola, código do boleto e data de pagamento.

### 2. Tela de importação com data de vencimento
- No painel administrativo, no diálogo "Importar Planilha", adicionar um **calendário** para escolher a data de vencimento.
- Ao confirmar, **todas** as faturas importadas naquele arquivo recebem essa mesma data, ignorando a coluna de vencimento da planilha.
- A data é obrigatória antes de concluir a importação, com aviso claro na tela.

### 3. Endpoint de consulta por telefone
- Ampliar `GET /api/public/faturas?telefone=...` para devolver a fatura completa: telefone, nome, valor em aberto, valor com desconto, status, data de vencimento, PIX copia e cola, boleto e data de pagamento.

### 4. Preparo para gateway de pagamento
- Criar um endpoint `POST /api/public/cobranca` que recebe o telefone (ou o id da fatura) e devolve/gera o PIX e o boleto da fatura pendente.
- Estruturar o código com um "adaptador de gateway": hoje ele gera o PIX estático já existente e devolve boleto vazio; quando você escolher Asaas, Stripe ou Mercado Pago, basta preencher a chave de API e trocar apenas esse arquivo — nada mais muda.
- O valor enviado ao gateway continua sendo sempre o **valor com desconto**.

### 5. Entrega final
Ao terminar, envio: link público, endereço do banco, chave pública de acesso, endpoint de consulta por telefone e endpoint de geração de PIX/boleto.

## Detalhes técnicos

- Migração: `ALTER TABLE public.faturas ADD COLUMN boleto_codigo text, boleto_url text, data_pagamento timestamptz;` e `CREATE OR REPLACE VIEW public.faturas_por_telefone` (security_invoker) com os campos ampliados; grants para `authenticated` e `service_role`.
- `src/components/importar-clientes.tsx`: novo `Popover` + `Calendar` (shadcn, com `pointer-events-auto`), estado `vencimentoGlobal`, botão de importar desabilitado sem data.
- `src/lib/clientes.functions.ts`: novo campo `vencimento_global` no schema; quando presente, sobrepõe o vencimento de todas as linhas.
- `src/routes/api/public/faturas.ts`: resposta ampliada (sem PII além de nome e telefone consultado), CORS mantido.
- `src/routes/api/public/cobranca.ts`: `POST` com validação Zod, busca a fatura em aberto, chama `src/lib/gateway.server.ts` (interface `GatewayPagamento` com `gerarPix` e `gerarBoleto`), persiste `pix_copia_cola` / `boleto_codigo` e retorna ao cliente.
- Nenhuma quebra nas telas existentes; sem remoção de tabelas ou colunas.
