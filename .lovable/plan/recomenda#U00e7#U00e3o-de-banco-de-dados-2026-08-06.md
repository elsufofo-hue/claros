# Recomendação de banco de dados

## Recomendação principal
Use **Supabase via Lovable Cloud** — ele já está ativo e configurado no projeto.

## Por que ele é a melhor escolha para este projeto
- **Já integrado**: O projeto está conectado ao Supabase, com as tabelas `clientes`, `faturas`, `pagamentos`, `profiles` e `user_roles` criadas e protegidas por RLS.
- **Autenticação nativa**: Login de administradores, redefinição de senha e controle de acesso já funcionam por meio do Lovable Cloud/Supabase Auth.
- **Custo inicial zero**: A instância atual é `Tiny` e não está pausada, permitindo testar e publicar sem gasto imediato.
- **Escalável**: Suporta dezenas de milhares de registros (a importação de planilha foi preparada para até 20 mil clientes) e pode crescer conforme a base aumentar.
- **Segurança**: Row Level Security (RLS) e políticas por papel (`admin`/`user`) já estão implementadas.
- **Publicação pronta**: O banco já está vinculado ao domínio `clarofatura.app`, que está no ar.

## Estado atual confirmado
- Backend: Lovable Cloud (Supabase gerenciado)
- Instância: Tiny
- Status: Ativo (não pausado)
- Projeto: já publicado em `https://clarofatura.app`

## Alternativas possíveis (caso queira migrar no futuro)
| Opção | Quando considerar |
| --- | --- |
| Supabase pago/maior instância | Quando a base crescer ou precisar de mais performance |
| PostgreSQL próprio | Quando quiser controle total da infraestrutura e tiver equipe técnica |
| Outro serviço gerenciado | Quando precisar de recursos específicos que o Supabase não ofereça |

## Próximos passos sugeridos
1. **Manter o Supabase/Lovable Cloud** como banco principal — nenhuma mudança de código é necessária.
2. **Monitorar o uso** e, quando aproximar do limite da instância Tiny, avaliar um upgrade no Cloud.
3. **Manter backups/exportações** via a opção de exportação de dados do Lovable Cloud.

## Decisão esperada
Confirmar que o Supabase via Lovable Cloud será o banco de dados oficial do sistema.
