import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatarMoeda } from "@/lib/format";
import { listarTransacoes } from "@/lib/transacoes.functions";

export const Route = createFileRoute("/_authenticated/admin/transacoes")({
  head: () => ({
    meta: [
      { title: "Transações PIX — Painel administrativo" },
      {
        name: "description",
        content: "Acompanhe as cobranças PIX geradas, a gateway utilizada e o status de cada pagamento.",
      },
      { property: "og:title", content: "Transações PIX — Painel administrativo" },
      {
        property: "og:description",
        content: "Histórico de cobranças PIX por gateway, com status e datas de pagamento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaTransacoes,
});

const CORES: Record<string, string> = {
  pago: "bg-emerald-600 text-white hover:bg-emerald-600",
  pendente: "bg-amber-500 text-white hover:bg-amber-500",
  expirada: "bg-muted text-muted-foreground",
};

function dataHora(valor: string | null): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleString("pt-BR");
}

function PaginaTransacoes() {
  const [status, setStatus] = useState("todos");
  const [historico, setHistorico] = useState(false);
  const buscar = useServerFn(listarTransacoes);

  const { data, isLoading } = useQuery({
    queryKey: ["transacoes", status, historico],
    queryFn: () => buscar({ data: { status, agrupar: !historico } }),
    refetchInterval: 15000,
  });

  const lista = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Transações PIX</h1>
          <p className="text-sm text-muted-foreground">
            Uma cobrança vigente por cliente até o pagamento ser confirmado.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch id="historico" checked={historico} onCheckedChange={setHistorico} />
          <Label htmlFor="historico" className="text-sm">Mostrar histórico completo</Label>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pendente">Aguardando pagamento</SelectItem>
            <SelectItem value="pago">Pagos</SelectItem>
            <SelectItem value="expirada">Expirados</SelectItem>
            <SelectItem value="falhou">Recusados</SelectItem>
          </SelectContent>
        </Select>
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Gateway</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead>Expira em</TableHead>
                <TableHead>Paga em</TableHead>
                <TableHead>ID na gateway</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              ) : lista.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Nenhuma transação encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                lista.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.cliente_nome ?? "—"}</TableCell>
                    <TableCell>{t.gateway_slug}</TableCell>
                    <TableCell>{formatarMoeda(t.valor_centavos / 100)}</TableCell>
                    <TableCell>
                      <Badge className={CORES[t.status] ?? ""} variant={CORES[t.status] ? "default" : "secondary"}>
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{t.tentativas}</TableCell>
                    <TableCell className="whitespace-nowrap">{dataHora(t.created_at)}</TableCell>
                    <TableCell className="whitespace-nowrap">{dataHora(t.expira_em)}</TableCell>
                    <TableCell className="whitespace-nowrap">{dataHora(t.pago_em)}</TableCell>
                    <TableCell className="max-w-40 truncate text-xs text-muted-foreground">
                      {t.transacao_gateway_id ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
