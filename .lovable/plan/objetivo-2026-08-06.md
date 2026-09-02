Alteração do título da aba do site

## Objetivo
Trocar o título exibido na aba do navegador para:
**Fatura em Dia — Consulte e pague sua fatura**

## Onde o título da aba é definido
- `src/routes/__root.tsx` — meta title padrão aplicado a todas as rotas.
- `src/routes/index.tsx` — head title específico da página inicial (`/`).

## Ações
1. Atualizar o meta title em `src/routes/__root.tsx` para "Fatura em Dia — Consulte e pague sua fatura".
2. Atualizar o head title em `src/routes/index.tsx` para "Fatura em Dia — Consulte e pague sua fatura".
3. Manter `og:title` e `description` alinhados com a nova identidade (ex.: "Fatura em Dia — Consulta de faturas por telefone").
4. Executar build para garantir que não há erros.

## Arquivos que serão alterados
- `src/routes/__root.tsx`
- `src/routes/index.tsx`

## Critério de conclusão
- A aba do navegador mostra "Fatura em Dia — Consulte e pague sua fatura" ao acessar `/`.
- Build passa sem erros.