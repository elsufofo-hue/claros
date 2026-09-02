# Contagem de acessos e dashboard de métricas

Registrar cada visita à página pública e cada consulta por telefone, e exibir os indicadores apenas no painel administrativo.

## O que será feito

1. **Nova tabela `acessos`** no banco, com: identificador, telefone consultado (opcional), data/hora do acesso, página acessada e — quando a consulta encontra fatura — os valores da fatura vista (valor em aberto e valor com desconto) e se a consulta teve sucesso.
2. **Registro automático**:
   - ao abrir a página inicial pública, grava um acesso (sem telefone);
   - ao consultar um telefone, grava um acesso com o telefone digitado, a página e, se a fatura foi encontrada, os valores dela.
   O registro é silencioso: se falhar, a página do cliente continua funcionando normalmente. Nada é exibido ao cliente.
3. **Dashboard de métricas no painel administrativo**, em uma seção nova:
   - 🧑 Total de clientes que acessaram (telefones únicos com consulta bem-sucedida), com recortes de hoje e do mês
   - 💰 Total em faturas visualizadas (soma do valor com desconto), com totais de hoje e do mês
   - 📊 Total em aberto das faturas consultadas (soma do valor original), exibido separadamente
   - 📅 Acessos hoje, acessos no mês e total de consultas realizadas
   - Lista dos últimos 20 acessos com data/hora, página e telefone (quando houver)
4. **Regras de contagem**: só entram nas somas as consultas bem-sucedidas; cada telefone conta uma única vez nos totais de clientes (e uma vez por dia/mês nos recortes), somando o valor da fatura vista apenas na primeira consulta daquele telefone no período.
5. **Tempo real**: os cards se atualizam sozinhos conforme novos acessos chegam, sem precisar recarregar a página.
6. **Visibilidade**: todos esses números existem apenas no painel administrativo, nunca na página pública.

## Detalhes técnicos

- Migração `public.acessos`: `id uuid pk default gen_random_uuid()`, `telefone_consultado text null`, `data_hora timestamptz not null default now()`, `pagina text not null`, `sucesso boolean not null default false`, `valor_original numeric null`, `valor_desconto numeric null`, `created_at`. Índices em `data_hora` e `telefone_consultado`. GRANT `SELECT` para `authenticated` e `ALL` para `service_role` (sem `anon`); RLS habilitada com política de leitura só para admin via `private.has_role(auth.uid(),'admin')`. Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.acessos`.
- Gravação: `src/lib/acessos.functions.ts` com `registrarAcesso` (`createServerFn`, validação Zod, `supabaseAdmin` carregado dentro do handler). Chamada em `useEffect` na home (`src/routes/index.tsx`) e dentro do fluxo de consulta em `src/lib/consulta.functions.ts` / `fatura.$telefone.tsx`, sempre com `catch` silencioso.
- Agregação: função SQL `security definer` `public.metricas_acessos()` restrita a admin, retornando os totais em um único JSON (clientes únicos total/hoje/mês, somas de desconto e em aberto por telefone distinto, contagens de acessos e consultas) — evita trazer milhares de linhas ao navegador.
- Painel: nova seção em `src/routes/_authenticated/admin.index.tsx` com os cards e a tabela dos últimos acessos, via TanStack Query (`useQuery`) + assinatura Realtime em `useEffect` que invalida a query a cada novo registro.
