# Mapeamento manual de colunas na importação

## O que muda na tela de importação

Hoje o sistema tenta adivinhar as colunas pelo nome do cabeçalho e recusa o arquivo se não encontrar "telefone". Passa a existir um passo de mapeamento manual:

1. Você seleciona a planilha.
2. O sistema lê o cabeçalho e mostra a **prévia** com as primeiras linhas do arquivo, exatamente como estão nele.
3. Abaixo da prévia aparece o painel de mapeamento, com um menu suspenso por campo listando todas as colunas da planilha:

```text
Telefone (obrigatório):        [ selecionar coluna v ]
Nome (obrigatório):            [ selecionar coluna v ]
E-mail (opcional):             [ selecionar coluna v ]
Valor em Aberto (obrigatório): [ selecionar coluna v ]
Valor com Desconto (obrig.):   [ selecionar coluna v ]
Status (opcional):             [ selecionar coluna v ]
```

4. Os menus já vêm pré-preenchidos com o palpite automático atual (quando o nome da coluna é reconhecido), mas você pode trocar qualquer um. Cada campo opcional tem a opção "Não importar".
5. Com os obrigatórios preenchidos, a prévia passa a mostrar os dados já interpretados (telefone formatado, valores em reais) e a contagem de linhas válidas e com erro.
6. O botão "Importar" só habilita depois do mapeamento completo e da data de vencimento escolhida.

O calendário de vencimento único continua igual, aplicado a todas as linhas.

## Sobre o campo Status

A coluna de status pode ser mapeada e será convertida para os status do sistema (em aberto, paga, vencida, cancelada, expirada, falhou, em processamento), aceitando variações de escrita. Linhas com um status não reconhecido entram como "em aberto". Isso exige uma pequena alteração no gravador de lote no banco, que hoje sempre grava "em aberto".

## Detalhes técnicos

- `src/components/importar-clientes.tsx`: guardar cabeçalhos + linhas cruas no estado; novo bloco de `Select` (shadcn) por campo; o parsing das linhas passa a ser derivado do mapa escolhido (recalcula ao trocar um dropdown); nome vira obrigatório na validação, conforme pedido.
- `src/lib/clientes.functions.ts`: aceitar `status` opcional por registro no schema Zod e repassar no payload do RPC.
- Migração: `importar_faturas_lote` passa a usar o status enviado por registro, com `em_aberto` como padrão.
