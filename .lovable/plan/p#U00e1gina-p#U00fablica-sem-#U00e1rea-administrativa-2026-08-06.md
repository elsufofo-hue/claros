# Página pública sem área administrativa

## Situação verificada

Li o código da página inicial pública (`src/routes/index.tsx`) e do layout raiz. Não há mais nenhum elemento administrativo nela:

- O link "Área administrativa" no canto direito do cabeçalho já foi removido na alteração anterior.
- Não existe sidebar, nem botões de importar/editar/gerenciar, nem qualquer texto com "Administrador" nessa página.
- O cabeçalho hoje tem apenas a logo; o restante é hero (título "Fatura em Dia", subtítulo, formulário de telefone, checkbox de Termos, botão "Consultar Fatura"), benefícios, como funciona, texto institucional, FAQ e rodapé.

O que ainda aparece no canto inferior direito do preview é o selo de edição do Lovable, que não faz parte do site publicado (já foi ocultado na publicação).

## O que farei

1. Revisar a página pública e a página de resultado da consulta (`/fatura/:telefone`) para garantir que nenhum link, botão ou texto administrativo apareça em nenhuma delas.
2. Remover blocos institucionais/extras somente se você quiser a página ainda mais enxuta — por padrão mantenho benefícios, como funciona e FAQ, já que os benefícios foram pedidos explicitamente.
3. Confirmar no navegador (preview em 440px e desktop) que o lado direito do cabeçalho fica apenas com espaço vazio e nada clicável de admin.

## Detalhes técnicos

- Arquivos envolvidos: `src/routes/index.tsx`, `src/routes/fatura.$telefone.tsx`.
- A área administrativa continua existindo em `/auth` e `/admin`, apenas sem qualquer link a partir das páginas públicas.
