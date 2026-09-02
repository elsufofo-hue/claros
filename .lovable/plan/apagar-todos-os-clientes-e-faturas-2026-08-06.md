# Apagar todos os clientes e faturas

Adicionar, na tela **Clientes e Faturas** do painel administrativo, um botão para limpar toda a base de clientes e faturas de uma vez.

## O que muda na tela

- Novo botão **"Apagar tudo"** (estilo vermelho/destrutivo) ao lado de "Importar Planilha".
- Ao clicar, abre uma janela de confirmação explicando que a ação é irreversível e que apagará **todos os clientes, faturas e pagamentos**.
- Para confirmar, é preciso digitar a palavra `APAGAR` — evita cliques acidentais.
- Enquanto executa, o botão fica em "Apagando..." e ao final mostra um aviso com a quantidade de clientes e faturas removidos, atualizando a lista automaticamente.

## Detalhes técnicos

- Nova função de servidor `apagarTudo` em `src/lib/clientes.functions.ts`, protegida por `requireSupabaseAuth` + verificação do papel `admin` (chamada via `has_role`); usuários sem permissão recebem erro.
- A exclusão respeita as chaves estrangeiras, na ordem: `pagamentos` → `faturas` → `clientes`. Registros de `acessos` (métricas) não são apagados.
- Retorna a contagem de linhas removidas para exibir no aviso de sucesso.
- Em `src/routes/_authenticated/admin.faturas.tsx`: botão + `Dialog` de confirmação, `useMutation` chamando a função via `useServerFn`, e invalidação das queries da listagem e do dashboard.
