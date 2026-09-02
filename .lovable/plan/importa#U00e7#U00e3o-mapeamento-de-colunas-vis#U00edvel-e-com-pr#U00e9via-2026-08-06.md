# Importação: mapeamento de colunas visível e com prévia

O mapeamento manual já existe, mas fica escondido no fim de um diálogo longo (depois do calendário, da área de upload e da tabela de prévia), então muita gente não chega até ele. A ideia é transformar a importação em passos claros e mostrar exemplos de dados dentro de cada seletor.

## O que muda

**1. Diálogo em passos numerados**
- Passo 1: enviar a planilha
- Passo 2: relacionar as colunas (aparece logo após o upload, no topo da área rolável, com rolagem automática até ele)
- Passo 3: data de vencimento (calendário sai do topo e vai para cá)
- Passo 4: conferir e importar

**2. Mapeamento mais claro**
- Cada campo do sistema (Telefone, Nome, E-mail, Valor em aberto, Valor com desconto, Status) fica em uma linha com seu seletor de coluna.
- Abaixo do seletor, aparece um exemplo real: as 2 primeiras linhas daquela coluna da planilha (ex.: "Ex.: 11999999999, 21988888888").
- Dentro da lista de opções, cada coluna mostra o nome do cabeçalho e um exemplo do primeiro valor, para escolher sem errar.
- Campos obrigatórios ainda faltando ganham destaque em vermelho e um aviso fixo com quais faltam.
- Colunas já usadas em outro campo aparecem marcadas como "já usada", evitando duplicidade.

**3. Planilha sem cabeçalho**
- Uma opção "A primeira linha já é um dado (sem cabeçalho)". Ao marcar, as colunas passam a se chamar "Coluna 1, Coluna 2..." e a primeira linha entra na importação em vez de virar título.

**4. Prévia da planilha**
- Continua existindo, mas com destaque visual nas colunas já relacionadas a um campo do sistema (cabeçalho colorido + nome do campo abaixo), para bater o olho e conferir.

## Detalhes técnicos

Tudo em `src/components/importar-clientes.tsx` (frontend apenas, sem mudança no banco ou na lógica de gravação em `src/lib/clientes.functions.ts`):
- Reordenar as seções do `DialogContent` e envolvê-las em blocos de passo com título.
- Novo estado `semCabecalho: boolean`, que troca a origem de `cabecalhos`/`brutas` a partir do `raw` já lido (guardar o `raw` completo em estado para permitir alternar sem reenviar o arquivo).
- Derivar `exemplos: string[][]` (2 primeiros valores não vazios por coluna) para alimentar os textos de exemplo nos `Select`.
- `ref` na seção de mapeamento + `scrollIntoView` após o upload concluir.
- Manter `mapeamentoAutomatico`, validação e o fluxo de importação em lotes exatamente como estão.
