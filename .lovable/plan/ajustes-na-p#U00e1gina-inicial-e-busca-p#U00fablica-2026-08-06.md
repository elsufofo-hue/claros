# Ajustes na página inicial e busca pública

## Problemas
1. O subtítulo principal na hero não está agradando. O usuário quer reforçar pagamento em dia + descontos.
2. A busca pública está por CPF, mas o identificador real do cadastro é o número de telefone celular. É preciso voltar a consultar pelo telefone.

## Solução

### 1. Subtítulo da home
Em `src/routes/index.tsx`, trocar o texto do subtítulo (linha ~142) de:

```
Aproveite descontos imperdíveis. Consulta grátis e segura.
```

para:

```
Pague sua fatura em dia e garanta descontos imperdíveis.
```

### 2. Busca pública por telefone celular
Reverter a consulta de CPF para telefone:

- `src/routes/index.tsx`:
  - Substituir estado `cpf` por `telefone` e máscara/formatador por `formatarTelefone`.
  - Trocar rótulo "Consulta pelo CPF" → "Consulta pelo telefone".
  - Trocar placeholder "Digite seu CPF" → "Digite seu número de celular".
  - Validar 11 dígitos (DDD + celular).
  - Navegar para `/fatura/$telefone` com os dígitos.
  - Atualizar meta tags para refletir telefone.

- `src/routes/fatura.$cpf.tsx`:
  - Renomear arquivo para `src/routes/fatura.$telefone.tsx`.
  - Trocar parâmetro de rota de `cpf` para `telefone`.
  - Chamar `consultarFaturas` passando `telefone`.
  - Trocar todas as mensagens de "CPF" para "telefone".
  - Exibir o número formatado com `formatarTelefone`.

- `src/lib/consulta.functions.ts`:
  - Trocar schema de `cpf` para `telefone` com validação de 11 dígitos.
  - Alterar consulta no Supabase de `.eq("documento", ...)` para `.eq("telefone", ...)`.
  - Retornar `telefone` no lugar de `documento` no resultado.

- `src/components/fatura-card.tsx`:
  - Receber e exibir `telefone` em vez de `documento`.
  - Usar `formatarTelefone` para apresentação.
  - Trocar rótulo "CPF" para "Telefone".

- Outros ajustes menores:
  - Atualizar textos de FAQ e CTAs que mencionam "CPF" para "telefone".
  - Atualizar meta tags da página de fatura para "telefone".

## Escopo
- Alterações somente em frontend: textos, formulário, rota e componente de fatura.
- Nenhuma mudança no banco de dados é necessária (a coluna `telefone` já existe).
- Nenhuma alteração no painel administrativo.
