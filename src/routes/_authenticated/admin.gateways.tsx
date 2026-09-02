import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Copy, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  atualizarGateway,
  lerRoteamento,
  listarGateways,
  removerGateway,
  salvarGateway,
  salvarRoteamento,
  usarSomente,
} from "@/lib/gateways.functions";
import type { GatewayConfig } from "@/lib/gateways.functions";
import { resumoWebhooksPorGateway } from "@/lib/transacoes.functions";


export const Route = createFileRoute("/_authenticated/admin/gateways")({
  head: () => ({
    meta: [
      { title: "Gateways de pagamento — Painel administrativo" },
      {
        name: "description",
        content:
          "Cadastre gateways PIX, defina prioridade, ambiente e a estratégia de roteamento das cobranças.",
      },
      { property: "og:title", content: "Gateways de pagamento — Painel administrativo" },
      {
        property: "og:description",
        content: "Controle de roteamento e failover das gateways PIX do sistema de faturas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaGateways,
});

type Formulario = {
  id?: string;
  slug: string;
  rotulo: string;
  adapter: string;
  api_url: string;
  ambiente: "producao" | "teste";
  prioridade: string;
  limite_diario: string;
  webhook_url: string;
  secret_names: string;
  observacoes: string;
  ativo: boolean;
};

const VAZIO: Formulario = {
  slug: "",
  rotulo: "",
  adapter: "generico",
  api_url: "",
  ambiente: "producao",
  prioridade: "50",
  limite_diario: "",
  webhook_url: "",
  secret_names: "",
  observacoes: "",
  ativo: false,
};

function paraFormulario(g: GatewayConfig): Formulario {
  return {
    id: g.id,
    slug: g.slug,
    rotulo: g.rotulo,
    adapter: g.adapter,
    api_url: g.api_url ?? "",
    ambiente: g.ambiente === "teste" ? "teste" : "producao",
    prioridade: String(g.prioridade),
    limite_diario: g.limite_diario == null ? "" : String(g.limite_diario),
    webhook_url: g.webhook_url ?? "",
    secret_names: g.secret_names.join(", "),
    observacoes: g.observacoes ?? "",
    ativo: g.ativo,
  };
}

function PaginaGateways() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(listarGateways);
  const buscarRoteamento = useServerFn(lerRoteamento);
  const salvarRota = useServerFn(salvarRoteamento);
  const salvar = useServerFn(atualizarGateway);
  const gravar = useServerFn(salvarGateway);
  const excluir = useServerFn(removerGateway);
  const exclusivo = useServerFn(usarSomente);

  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<Formulario>(VAZIO);

  const { data, isLoading } = useQuery({
    queryKey: ["gateways", "credential-status-live"],
    queryFn: () => buscar({ data: undefined }),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 10000,
  });
  const roteamento = useQuery({
    queryKey: ["roteamento"],
    queryFn: () => buscarRoteamento({ data: undefined }),
  });

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ["gateways"] });
    queryClient.invalidateQueries({ queryKey: ["roteamento"] });
  };

  const definirRota = useMutation({
    mutationFn: (vars: {
      estrategia: "prioridade" | "rodizio" | "fixa";
      gateway_fixa?: string | null;
      novo_pix_por_acesso?: boolean;
    }) => salvarRota({ data: vars }),
    onSuccess: () => {
      recarregar();
      toast.success("Estratégia atualizada.");
    },
    onError: () => toast.error("Não foi possível salvar a estratégia."),
  });

  const alternar = useMutation({
    mutationFn: (vars: { id: string; ativo: boolean }) => salvar({ data: vars }),
    onSuccess: () => {
      recarregar();
      toast.success("Configuração salva.");
    },
    onError: () => toast.error("Não foi possível salvar."),
  });

  const somente = useMutation({
    mutationFn: (id: string) => exclusivo({ data: { id } }),
    onSuccess: () => {
      recarregar();
      toast.success("Gateway definido como único ativo.");
    },
    onError: () => toast.error("Não foi possível ativar."),
  });

  const remover = useMutation({
    mutationFn: (id: string) => excluir({ data: { id } }),
    onSuccess: () => {
      recarregar();
      toast.success("Gateway removido.");
    },
    onError: () => toast.error("Não foi possível remover."),
  });

  const gravarGateway = useMutation({
    mutationFn: () =>
      gravar({
        data: {
          ...(form.id ? { id: form.id } : {}),
          slug: form.slug.trim().toLowerCase(),
          rotulo: form.rotulo.trim(),
          adapter: form.adapter.trim(),
          api_url: form.api_url.trim() || null,
          ambiente: form.ambiente,
          prioridade: Number(form.prioridade) || 50,
          limite_diario: form.limite_diario ? Number(form.limite_diario) : null,
          webhook_url: form.webhook_url.trim() || null,
          secret_names: form.secret_names
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean),
          observacoes: form.observacoes.trim() || null,
          ativo: form.ativo,
        },
      }),
    onSuccess: () => {
      setAberto(false);
      recarregar();
      toast.success("Gateway salvo.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const buscarResumo = useServerFn(resumoWebhooksPorGateway);
  const resumo = useQuery({
    queryKey: ["resumo-webhooks"],
    queryFn: () => buscarResumo({ data: undefined }),
    refetchInterval: 30000,
  });
  const porGateway = new Map((resumo.data ?? []).map((r) => [r.gateway_slug, r]));

  const lista = data ?? [];
  const ativos = lista.filter((g) => g.ativo).length;
  const estrategia = roteamento.data?.estrategia ?? "prioridade";
  const origem = typeof window === "undefined" ? "" : window.location.origin;


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gateways de pagamento</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre as gateways, defina prioridade e escolha como o sistema distribui as cobranças
            PIX. Se uma gateway falhar, a próxima ativa assume automaticamente.
          </p>
        </div>
        <Button
          onClick={() => {
            setForm(VAZIO);
            setAberto(true);
          }}
        >
          <Plus className="size-4" />
          Nova gateway
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Estratégia de roteamento</CardTitle>
          <CardDescription>
            {ativos === 0
              ? "Nenhuma gateway ativa — nenhum PIX será gerado."
              : `${ativos} gateway(s) ativa(s).`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select
            value={estrategia}
            onValueChange={(v) =>
              definirRota.mutate({
                estrategia: v as "prioridade" | "rodizio" | "fixa",
                gateway_fixa: roteamento.data?.gateway_fixa ?? null,
              })
            }
          >
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="prioridade">Prioridade (ordem fixa)</SelectItem>
              <SelectItem value="rodizio">Rodízio (round-robin)</SelectItem>
              <SelectItem value="fixa">Gateway específica</SelectItem>
            </SelectContent>
          </Select>

          {estrategia === "fixa" ? (
            <Select
              value={roteamento.data?.gateway_fixa ?? ""}
              onValueChange={(v) => definirRota.mutate({ estrategia: "fixa", gateway_fixa: v })}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Escolha a gateway" />
              </SelectTrigger>
              <SelectContent>
                {lista.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <div className="flex w-full items-start gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-3">
            <Switch
              id="novo-pix"
              checked={roteamento.data?.novo_pix_por_acesso ?? true}
              onCheckedChange={(v) =>
                definirRota.mutate({
                  estrategia: estrategia as "prioridade" | "rodizio" | "fixa",
                  gateway_fixa: roteamento.data?.gateway_fixa ?? null,
                  novo_pix_por_acesso: v,
                })
              }
            />
            <Label htmlFor="novo-pix" className="text-sm font-normal leading-snug">
              <span className="font-semibold">Gerar novo PIX a cada acesso</span>
              <span className="block text-muted-foreground">
                Ligado: cada visita à página de pagamento cria uma cobrança nova na gateway.
                Desligado: reaproveita a cobrança pendente enquanto ela estiver válida.
              </span>
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Como configurar o webhook na gateway</CardTitle>
          <CardDescription>Vale para qualquer gateway cadastrada aqui.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>1. Copie o endereço de webhook exibido no cartão da gateway abaixo.</p>
          <p>
            2. No painel da gateway, cole esse endereço no campo de webhook / postback / callback,
            com método <span className="font-medium text-foreground">POST</span>.
          </p>
          <p>3. Salve e faça um pagamento de teste.</p>
          <p>
            4. Confira em <span className="font-medium text-foreground">Logs → Webhooks recebidos</span>{" "}
            se a chamada chegou, e em{" "}
            <span className="font-medium text-foreground">Pagamentos recebidos</span> quem pagou.
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid gap-4">
          {lista.map((g) => {
            const webhook = g.webhook_url || `${origem}/api/public/webhooks/${g.slug}`;
            const hooks = porGateway.get(g.slug);
            return (
              <Card key={g.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-4 py-5">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{g.rotulo}</span>
                      {g.ativo ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                      <Badge variant="outline">Prioridade {g.prioridade}</Badge>
                      <Badge variant="outline">
                        {g.ambiente === "teste" ? "Teste" : "Produção"}
                      </Badge>
                      {g.limite_diario ? (
                        <Badge variant="outline">Limite {g.limite_diario}/dia</Badge>
                      ) : null}
                    </div>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {g.configurado ? (
                        <>
                          <CheckCircle2 className="size-3.5 text-emerald-600" />
                          Credenciais configuradas
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="size-3.5 text-amber-600" />
                          Credenciais pendentes — a gateway será ignorada
                        </>
                      )}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {hooks?.ultimo_em ? (
                        <>
                          <CheckCircle2 className="size-3.5 text-emerald-600" />
                          Último webhook em {new Date(hooks.ultimo_em).toLocaleString("pt-BR")} ·{" "}
                          {hooks.total_24h} nas últimas 24h
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="size-3.5 text-amber-600" />
                          Nenhum webhook recebido ainda desta gateway
                        </>
                      )}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">
                      Webhook: {webhook}
                      <button
                        type="button"
                        className="ml-2 inline-flex items-center gap-1 text-primary"
                        onClick={() => {
                          void navigator.clipboard.writeText(webhook);
                          toast.success("Endereço do webhook copiado.");
                        }}
                      >
                        <Copy className="size-3" /> copiar
                      </button>
                    </p>
                  </div>


                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setForm(paraFormulario(g));
                        setAberto(true);
                      }}
                    >
                      <Pencil className="size-4" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => somente.mutate(g.id)}
                      disabled={somente.isPending}
                    >
                      <Zap className="size-4" />
                      Usar somente esta
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Remover a gateway ${g.rotulo}?`)) remover.mutate(g.id);
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                    <Switch
                      checked={g.ativo}
                      onCheckedChange={(v) => alternar.mutate({ id: g.id, ativo: v })}
                      aria-label={`Ativar ${g.rotulo}`}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar gateway" : "Nova gateway"}</DialogTitle>
            <DialogDescription>
              As chaves nunca são gravadas aqui: informe apenas o NOME dos segredos guardados no
              backend (ex.: MINHAGW_TOKEN, MINHAGW_SECRET).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="rotulo">Nome</Label>
                <Input
                  id="rotulo"
                  value={form.rotulo}
                  onChange={(e) => setForm({ ...form, rotulo: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="slug">Identificador</Label>
                <Input
                  id="slug"
                  value={form.slug}
                  placeholder="minha-gateway"
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="adapter">Adaptador</Label>
                <Select
                  value={form.adapter}
                  onValueChange={(v) => setForm({ ...form, adapter: v })}
                >
                  <SelectTrigger id="adapter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generico">REST genérico</SelectItem>
                    <SelectItem value="cashinpay">CashinPay</SelectItem>
                    <SelectItem value="propix">ProPix</SelectItem>
                    <SelectItem value="m2pay">M2 Pay</SelectItem>
                    <SelectItem value="nowbanks">NowBanks</SelectItem>
                    
                    <SelectItem value="pix-estatico">PIX estático</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ambiente">Ambiente</Label>
                <Select
                  value={form.ambiente}
                  onValueChange={(v) =>
                    setForm({ ...form, ambiente: v as "producao" | "teste" })
                  }
                >
                  <SelectTrigger id="ambiente">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="producao">Produção</SelectItem>
                    <SelectItem value="teste">Teste</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="api_url">URL da API (criação de PIX)</Label>
              <Input
                id="api_url"
                value={form.api_url}
                placeholder="https://api.gateway.com/v1/pix"
                onChange={(e) => setForm({ ...form, api_url: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="prioridade">Prioridade</Label>
                <Input
                  id="prioridade"
                  inputMode="numeric"
                  value={form.prioridade}
                  onChange={(e) => setForm({ ...form, prioridade: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="limite">Limite diário (opcional)</Label>
                <Input
                  id="limite"
                  inputMode="numeric"
                  value={form.limite_diario}
                  onChange={(e) => setForm({ ...form, limite_diario: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="webhook">URL de webhook (opcional)</Label>
              <Input
                id="webhook"
                value={form.webhook_url}
                placeholder={`${origem}/api/public/webhooks/${form.slug || "slug"}`}
                onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="segredos">Nomes dos segredos (separados por vírgula)</Label>
              <Input
                id="segredos"
                value={form.secret_names}
                placeholder="MINHAGW_TOKEN, MINHAGW_SECRET"
                onChange={(e) => setForm({ ...form, secret_names: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="obs">Observações</Label>
              <Textarea
                id="obs"
                rows={2}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="ativo"
                checked={form.ativo}
                onCheckedChange={(v) => setForm({ ...form, ativo: v })}
              />
              <Label htmlFor="ativo">Gateway ativa</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={() => gravarGateway.mutate()} disabled={gravarGateway.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
