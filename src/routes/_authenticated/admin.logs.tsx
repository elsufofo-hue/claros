import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listarLogs } from "@/lib/transacoes.functions";

export const Route = createFileRoute("/_authenticated/admin/logs")({
  head: () => ({
    meta: [
      { title: "Logs de pagamento e webhooks — Painel administrativo" },
      {
        name: "description",
        content:
          "Auditoria das chamadas às gateways de pagamento e dos webhooks recebidos, com status e mensagens.",
      },
      { property: "og:title", content: "Logs de pagamento e webhooks — Painel administrativo" },
      {
        property: "og:description",
        content: "Registros técnicos das cobranças PIX para diagnóstico rápido de falhas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaLogs,
});

function dataHora(valor: string): string {
  return new Date(valor).toLocaleString("pt-BR");
}

function PaginaLogs() {
  const buscar = useServerFn(listarLogs);
  const { data, isLoading } = useQuery({
    queryKey: ["logs"],
    queryFn: () => buscar({ data: undefined }),
    refetchInterval: 20000,
  });

  const [gateway, setGateway] = useState("todas");
  const [resultado, setResultado] = useState("todos");

  const webhooks = data?.webhooks ?? [];
  const gateways = [...new Set(webhooks.map((w) => w.gateway_slug))];

  const webhooksFiltrados = webhooks.filter((w) => {
    if (gateway !== "todas" && w.gateway_slug !== gateway) return false;
    if (resultado === "aceito") return w.assinatura_valida && w.reconhecido;
    if (resultado === "invalido") return !w.assinatura_valida;
    if (resultado === "sem-transacao") return w.assinatura_valida && !w.reconhecido;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Logs</h1>
        <p className="text-sm text-muted-foreground">
          Últimos 100 registros de chamadas às gateways e de webhooks recebidos.
        </p>
      </div>

      <Tabs defaultValue="webhooks">
        <TabsList>
          <TabsTrigger value="webhooks">Webhooks recebidos</TabsTrigger>
          <TabsTrigger value="pagamentos">Cobranças</TabsTrigger>
        </TabsList>

        <TabsContent value="pagamentos" className="space-y-3 pt-4">
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
          {(data?.pagamentos ?? []).map((l) => (
            <Card key={l.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={l.nivel === "erro" ? "destructive" : "secondary"}>{l.nivel}</Badge>
                  <span>{l.gateway_slug}</span>
                  {l.http_status ? <Badge variant="outline">HTTP {l.http_status}</Badge> : null}
                </CardTitle>
                <CardDescription>{dataHora(l.created_at)}</CardDescription>
              </CardHeader>
              <CardContent className="break-words text-xs text-muted-foreground">
                {l.mensagem}
              </CardContent>
            </Card>
          ))}
          {!isLoading && (data?.pagamentos ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum registro.</p>
          ) : null}
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center gap-3">
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

            <Select value={resultado} onValueChange={setResultado}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os resultados</SelectItem>
                <SelectItem value="aceito">Aceitos</SelectItem>
                <SelectItem value="invalido">Assinatura inválida</SelectItem>
                <SelectItem value="sem-transacao">Transação não encontrada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {webhooksFiltrados.map((l) => (
            <Card key={l.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={l.assinatura_valida ? "secondary" : "destructive"}>
                    {l.assinatura_valida ? "assinatura válida" : "assinatura inválida"}
                  </Badge>
                  <span>{l.gateway_slug}</span>
                  {l.evento ? <Badge variant="outline">{l.evento}</Badge> : null}
                  {l.assinatura_valida && !l.reconhecido ? (
                    <Badge variant="destructive">transação não encontrada</Badge>
                  ) : null}
                  {l.status_transacao ? (
                    <Badge variant="outline">transação: {l.status_transacao}</Badge>
                  ) : null}
                </CardTitle>
                <CardDescription>{dataHora(l.created_at)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 break-words text-xs text-muted-foreground">
                {l.reconhecido ? (
                  <p className="text-foreground">
                    {l.cliente_nome ?? "Cliente"}
                    {l.cliente_telefone ? ` · ${l.cliente_telefone}` : ""}
                    {l.valor_centavos != null
                      ? ` · ${(l.valor_centavos / 100).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}`
                      : ""}
                  </p>
                ) : (
                  <p>Este webhook não bateu com nenhuma cobrança registrada.</p>
                )}
                <p>
                  {l.transacao_gateway_id ? `ID: ${l.transacao_gateway_id} — ` : ""}
                  {l.resumo ?? "—"}
                </p>
              </CardContent>
            </Card>
          ))}
          {!isLoading && webhooksFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum registro.</p>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

