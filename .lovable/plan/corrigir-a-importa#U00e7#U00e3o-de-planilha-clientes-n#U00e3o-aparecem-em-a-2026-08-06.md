# Corrigir a importação de planilha (clientes não aparecem em /admin/faturas)

## O que foi verificado agora

- O banco tem apenas **5 clientes e 5 faturas**. Ou seja, a planilha realmente **não está sendo gravada** — não é um problema de filtro ou de exibição da tela.
- A tela `/admin/faturas` lista faturas direto do banco, sem filtro de mês; ela mostraria os registros se eles existissem.
- A importação hoje depende de uma função interna do banco (`importar_faturas_lote`) que foi alterada no ajuste de segurança mais recente. O site publicado ainda roda a versão antiga do código, que chama essa função no formato antigo — chamada que não existe mais e falha.

## O que será feito

1. **Trocar a importação para gravação direta nas tabelas**
   A importação passará a inserir/atualizar `clientes` e `faturas` diretamente, usando a sessão do administrador logado (as regras de acesso do banco já permitem isso apenas para administradores). Isso elimina a dependência da função interna e o risco de a importação quebrar de novo por permissão.

2. **Mostrar erros em vez de falhar em silêncio**
   Se um lote falhar, a tela exibirá a mensagem exata do erro, quantas linhas entraram e quantas foram rejeitadas, com opção de baixar as linhas rejeitadas.

3. **Atualizar a lista automaticamente**
   Após a importação, a listagem volta para a primeira página, limpa a busca e recarrega, para os registros aparecerem imediatamente.

4. **Teste real de ponta a ponta**
   Importar um arquivo de exemplo, conferir no banco que as linhas foram gravadas e que aparecem na tela.

5. **Publicar** para que o site em clarofatura.app fique igual ao preview (hoje ele está com a versão antiga).

## Detalhes técnicos

- `src/lib/clientes.functions.ts`: substituir a chamada `supabaseAdmin.rpc("importar_faturas_lote", ...)` por operações com `context.supabase` (bearer do admin): `upsert` em `clientes` por `telefone` e, para cada cliente, `upsert`/`update` da fatura em aberto com o vencimento escolhido. Retornar contadores e a lista de telefones rejeitados.
- Manter o lote de 500 linhas por chamada e o indicador de progresso em `src/components/importar-clientes.tsx`.
- `src/routes/_authenticated/admin.faturas.tsx`: no `onSuccess` da importação, resetar `busca`/`pagina` e invalidar a query `faturas-unificado`.
- A função `importar_faturas_lote` deixa de ser usada; pode ser removida em migração posterior (não é necessário para o funcionamento).
