# Remover a seção final vermelha da página inicial

## O que muda

A faixa vermelha no fim da home — título "Quite suas faturas em atraso com até 70% de desconto!", o texto explicativo, o botão "Consultar gratuitamente" e a foto da mulher com o celular — será removida por completo.

Depois da mudança, a página inicial termina assim:

```text
Cabeçalho vermelho + busca por telefone
Benefícios
Como funciona
Perguntas frequentes
Rodapé
```

Nada mais da home é alterado: hero, campo de telefone, benefícios, "como funciona" e FAQ continuam iguais.

## Detalhes técnicos

- `src/routes/index.tsx`: excluir o bloco `{/* CTA FINAL */}` (a `<section className="bg-primary">` inteira, entre o FAQ e o `<footer>`).
- Remover o import agora sem uso de `mulher-sorrindo.jpg`.
- Esse bloco continha o único botão que chamava `document.getElementById("cpf")?.focus()` — referência antiga e quebrada, que sai junto.
- Verificação: typecheck e conferência da home renderizada no preview.
