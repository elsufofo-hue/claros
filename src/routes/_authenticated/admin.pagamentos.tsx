import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listarPagamentosRecebidos } from "@/lib/transacoes.functions";
import { formatarDataHora, formatarMoeda, formatarTelefone, somenteDigitos } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/pagamentos")({
  head: () => ({
    meta: [
      { title: "Pagamentos recebidos — Administração de Faturas" },
      {
        name: "description",
        content: "Quem pagou, por qual gateway e quando o pagamento foi confirmado.",
      },
      { property: "og:title", content: "Pagamentos recebidos — Administração de Faturas" },
      {
        property: "og:description",
        content: "Lista unificada de pagamentos confirmados em todas as gateways.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaginaPagamentos,
});

function PaginaPagamentos() {
  const [busca, setBusca] = useState("");
  const [gateway, setGateway] = useState("todas");
  const [dias, setDias] = useState("30");

  const buscar = useServerFn(listarPagamentosRecebidos);
  const { data: pagamentos = [], isLoading } = useQuery({
    queryKey: ["pagamentos-recebidos", gateway, dias],
    queryFn: () => buscar({ data: { gateway, dias: Number(dias) } }),
    refetchInterval: 15000,
  });

  const gateways = useMemo(
    () => [...new Set(pagamentos.map((p) => p.gateway_slug))],
    [pagamentos],
  );

  const termo = somenteDigitos(busca);
  const filtrados = pagamentos.filter((p) =>
    termo
      ? (p.cliente_telefone ?? "").includes(termo)
      : (p.cliente_nome ?? "").toLowerCase().includes(busca.trim().toLowerCase()),
  );

  const total = filtrados.reduce((soma, p) => soma + p.valor_centavos, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pagamentos recebidos</h1>
        <p className="text-sm text-muted-foreground">
          Quem pagou, por qual gateway e como o pagamento foi confirmado. Atualiza sozinho.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por telefone ou nome do cliente"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={gateway} onValueChange={setGateway}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as gateways</SelectItem>
            {gateways.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={dias} onValueChange={setDias}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Últimas 24 horas</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-card">
        <p className="text-sm text-muted-foreground">
          {filtrados.length} pagamento(s) confirmado(s) ·{" "}
          <span className="font-semibold text-foreground">{formatarMoeda(total / 100)}</span>
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="divide-y divide-border">
          {filtrados.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{p.cliente_nome ?? "—"}</p>
                <p className="text-sm text-muted-foreground">
                  {p.cliente_telefone ? formatarTelefone(p.cliente_telefone) : "—"} ·{" "}
                  {p.descricao ?? "Fatura"}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{p.gateway_slug}</Badge>
                  <Badge variant="secondary">
                    {p.confirmado_por === "webhook" ? "Confirmado por webhook" : "Confirmado por consulta"}
                  </Badge>
                  {p.status_fatura ? <Badge variant="outline">Fatura: {p.status_fatura}</Badge> : null}
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-success">{formatarMoeda(p.valor_centavos / 100)}</p>
                {p.valor_fatura_centavos != null &&
                p.valor_fatura_centavos !== p.valor_centavos ? (
                  <p className="text-xs text-muted-foreground">
                    Fatura: {formatarMoeda(p.valor_fatura_centavos / 100)}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">{formatarDataHora(p.pago_em)}</p>
              </div>
            </div>
          ))}
          {isLoading ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : null}
          {!isLoading && !filtrados.length ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhum pagamento confirmado no período.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
