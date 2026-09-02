# Corrigir a importação da planilha (dados somem depois de importar)

## O que está acontecendo

Verifiquei o banco agora: existem apenas 4 clientes e 4 faturas — só os registros de teste. Ou seja, as linhas da sua planilha estão sendo descartadas antes de chegar ao banco, mesmo com a tela dizendo que carregou.

Hoje a importação descarta uma linha em silêncio quando:

- o campo **Nome** está vazio (hoje é obrigatório);
- o telefone tem menos de 10 ou mais de 11 dígitos (números com "+55", ramal, ou sem DDD caem fora);
- **Valor em Aberto** ou **Valor com Desconto** não são reconhecidos como número (célula em texto, "R$ 1.200,50", campo vazio);
- o valor com desconto é maior que o valor em aberto;
- e, no servidor, linhas com os dois valores zerados não geram fatura — o cliente entra na lista, mas a consulta pública não acha nada.

## O que vou fazer

1. **Mostrar por que cada linha foi rejeitada.** Painel com a contagem de válidas/rejeitadas, o motivo linha a linha e um botão para baixar a planilha de erros. Nada mais será descartado em silêncio.
2. **Aceitar mais formatos de telefone.** Limpeza de "+55", zeros à esquerda, espaços e traços; aceitar 10 a 13 dígitos e gravar sempre no mesmo padrão (DDD + número).
3. **Nome deixa de ser obrigatório.** Sem nome, o sistema usa o próprio telefone como identificação.
4. **Leitura de valores mais tolerante.** "1.200,50", "1200.50", "R$ 1.200", células numéricas do Excel e campos vazios (tratados como zero) passam a ser aceitos.
5. **Aviso quando a linha não gera fatura.** Se os dois valores forem zero, a linha é sinalizada antes da importação, e não depois.
6. **Consulta pública tolerante ao formato.** A busca por telefone passa a comparar apenas os dígitos, com ou sem DDI, para não falhar por causa de formatação.
7. **Teste real ponta a ponta.** Importo a sua planilha, confiro no banco com consulta SQL e testo a busca na tela pública com um dos números importados.

## Preciso da sua planilha

Anexe o arquivo .xlsx/.csv na próxima mensagem. Com ele eu valido o formato real das colunas e ajusto a leitura ao seu arquivo, em vez de adivinhar.

## Sobre o acesso ao banco

Este projeto usa o banco de dados gerenciado pelo Lovable Cloud — não há painel externo para acessar nem login separado. Toda a visualização de tabelas, usuários e dados é feita pelo botão **Ver Backend** aqui dentro do próprio projeto, e eu consulto e corrijo os dados diretamente por aqui quando você pedir.

## Detalhes técnicos

- `src/components/importar-clientes.tsx`: normalização de telefone/valores, relatório de rejeições com export, `nome` opcional, aviso de linha sem valores.
- `src/lib/clientes.functions.ts`: schema Zod aceitando telefone de 10 a 13 dígitos e nome nulo.
- Função `public.importar_faturas_lote`: alinhar o filtro de telefone e o critério de criação de fatura ao novo comportamento (migração).
- `src/lib/consulta.functions.ts`: busca por telefone comparando somente dígitos, com fallback sem DDI.
