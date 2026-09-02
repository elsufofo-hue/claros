# Remix of Fatura Fácil Claro

Quero criar um sistema web completo em português do Brasil.

O sistema será de consulta de faturas e pagamentos.

A consulta será feita exclusivamente pelo número de telefone do cliente.

Página inicial:

Design moderno, profissional e responsivo.

Espaço para adicionar minha logo.

Campo para o cliente digitar o número de telefone.

Botão “Consultar Fatura”.

Após a consulta, exibir:

Nome do cliente.

Número de telefone.

Valor original da fatura.

Valor com desconto.

Data de vencimento.

Status (Em aberto ou Paga).

Botão “Pagar Agora”.

Área administrativa:

Login com e-mail e senha.

Dashboard com resumo de clientes, faturas e pagamentos.

Cadastro, edição e exclusão de clientes.

Cadastro e edição de faturas.

Pesquisa pelo número de telefone.

Alteração do status da fatura.

Histórico de pagamentos.

Banco de dados:

Criar todas as tabelas necessárias para clientes, faturas, usuários administradores e pagamentos.

O sistema deve ser preparado para integração futura com um gateway de pagamento via PIX.

Quero uma interface profissional, rápida, segura, responsiva e pronta para publicação na internet. Sempre que concluir uma etapa, continue automaticamente para a próxima até o sistema ficar completo.



Emolementa na página inicia logo da empresa operadora claro

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7dac5f16-732d-4f7b-9ad5-61589a87c8f6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need [Bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`).

```sh
git clone <this-repository-url>
cd <repository-name>
bun install
bun dev
```

## Deploy (Railway)

Runtime de produção é o Bun. O build usa o preset `bun` do Nitro (`vite.config.ts`),
que gera `.output/server/index.mjs`, executado com `bun run .output/server/index.mjs`.

O Railway builda pelo `Dockerfile` (multi-stage `oven/bun:1`). Variáveis
necessárias em produção: as `VITE_SUPABASE_*` / `SUPABASE_*` (ver `.env`), além de
`PORT` e `HOST` (o Railway define `PORT` automaticamente).
