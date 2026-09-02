# Plano de Acesso ao Painel Administrativo

Para que você possa acessar o painel administrativo deste projeto (um remix), é necessário criar sua própria conta e atribuir a si mesmo a função de administrador diretamente no banco de dados, já que este é um ambiente novo e seguro.

## Passos para Acesso

1.  **Criar Conta**: Acesse a página de login em `/auth`, clique na aba "Criar conta" e realize o seu cadastro com e-mail e senha.
2.  **Atribuir Permissão**: Como o sistema é restrito, sua conta recém-criada não terá acesso automático. Eu irei executar um comando para tornar o seu usuário um administrador no banco de dados assim que você concluir o cadastro.
3.  **Acessar o Painel**: Após a permissão ser concedida, você poderá fazer o login normalmente em `/auth` e será redirecionado para o painel em `/admin`.

## Detalhes Técnicos

-   **Autenticação**: O projeto utiliza o sistema de autenticação nativo da Lovable Cloud.
-   **Controle de Acesso**: As permissões são gerenciadas pela tabela `public.user_roles`.
-   **Segurança**: Não existem logins padrão "admin/admin". Cada administrador deve ter sua própria conta vinculada ao seu e-mail.

---

**Aguardando Cadastro**: Por favor, me avise assim que terminar de criar sua conta no link `/auth` (pode usar o e-mail que preferir) para que eu possa te dar acesso de administrador.
