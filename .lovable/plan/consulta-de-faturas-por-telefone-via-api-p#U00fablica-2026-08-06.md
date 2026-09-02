# Consulta de faturas por telefone via API pública

## Situação atual (verificada no banco)

Já existe uma tabela `faturas` no banco, mas com estrutura diferente da pedida: ela tem `cliente_id`, `valor_original`, `valor_desconto`, `vencimento`, `status`, dados de PIX, e se liga à tabela `clientes` (onde fica o `telefone`). Todo o site — home, página de fatura, área administrativa, importação de planilha e PIX — depende dessa estrutura.

Não é possível criar outra tabela com o mesmo nome `faturas`, e apagar a atual quebraria o sistema inteiro. A proposta abaixo entrega exatamente o que você quer consultar (telefone, valor em aberto, valor com desconto) sem quebrar nada.

## O que será feito

1. **Camada de leitura simplificada no banco**
   Criar uma visão chamada `faturas_por_telefone` que devolve, por telefone, exatamente três informações:
   - `telefone`
   - `valor_em_aberto` (soma das faturas em aberto/vencidas do cliente)
   - `valor_com_desconto` (soma dos valores com desconto correspondentes)

   Assim o telefone funciona como identificador único, como você pediu, e os dados continuam vindo do cadastro real de clientes e faturas.

2. **Endpoint público de consulta**
   Nova rota HTTP pública que aceita um telefone e devolve os valores em JSON, sem exigir login e sem expor nenhuma outra informação do banco.

3. **Entrega das informações finais**
   Depois de aplicado, eu te passo: a URL do endpoint com exemplo de chamada, a URL pública da página e a chave pública de acesso.

## Detalhes técnicos

- Migração: `CREATE VIEW public.faturas_por_telefone` agregando `clientes` + `faturas`, com `GRANT SELECT` para `anon` e `authenticated`.
- Endpoint: `src/routes/api/public/faturas.ts` (TanStack server route), método `GET` com parâmetro `?telefone=`, validação Zod (11 dígitos), leitura via cliente publishable (não usa service role), resposta:
  ```json
  { "telefone": "11999999999", "valor_em_aberto": 189.90, "valor_com_desconto": 89.90 }
  ```
  404 quando não houver registro.
- URL do endpoint: `https://claroemdia.lovable.app/api/public/faturas?telefone=11999999999`
- URL pública da página: `https://claroemdia.lovable.app` (também disponível em `https://www.clarofatura.app`)
- Chave pública (anon/publishable), segura para uso em front-end: `sb_publishable_j4cgIXSM9Mu-pCRxAdkLKQ_Xn8T5YHU`
- Nenhuma alteração nas páginas ou na área administrativa existentes.
