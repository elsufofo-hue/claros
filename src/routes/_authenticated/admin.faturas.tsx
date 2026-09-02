import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, QrCode, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { ImportarClientesDialog } from "@/components/importar-clientes";
import { supabase } from "@/integrations/supabase/client";
import { apagarTudo } from "@/lib/clientes.functions";
import { STATUS_FATURA, formatarData, formatarMoeda, formatarTelefone, somenteDigitos } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/faturas")({
  head: () => ({
    meta: [
      { title: "Clientes e Faturas — Fatura em Dia" },
      { name: "description", content: "Importação de planilha, busca por telefone e gestão das faturas." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaginaFaturas,
});

type StatusFatura = "em_aberto" | "em_processamento" | "paga" | "vencida" | "expirada" | "falhou" | "cancelada";

type Fatura = {
  id: string;
  cliente_id: string;
  descricao: string;
  valor_original: number;
  valor_desconto: number;
  vencimento: string;
  status: string;
  pix_copia_cola: string | null;
  boleto_codigo: string | null;
  clientes: { nome: string; telefone: string } | null;
};

const POR_PAGINA = 50;

const vazio = {
  nome: "",
  telefone: "",
  valor_original: "",
  valor_desconto: "",
  vencimento: "",
  status: "em_aberto",
};

function PaginaFaturas() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [editando, setEditando] = useState<Fatura | null>(null);
  const [form, setForm] = useState(vazio);
  const [confirmandoApagar, setConfirmandoApagar] = useState(false);
  const [confirmacaoTexto, setConfirmacaoTexto] = useState("");
  const executarApagarTudo = useServerFn(apagarTudo);

  const apagarTodos = useMutation({
    mutationFn: async () => executarApagarTudo({}),
    onSuccess: (r) => {
      toast.success(
        `Base limpa: ${r.clientes} cliente(s), ${r.faturas} fatura(s) e ${r.pagamentos} pagamento(s) removidos.`,
      );
      setConfirmandoApagar(false);
      setConfirmacaoTexto("");
      setBusca("");
      setPagina(0);
      void queryClient.invalidateQueries({ queryKey: ["faturas-unificado"] });
      void queryClient.invalidateQueries({ queryKey: ["pagamentos"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-metricas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const termo = busca.trim();
  const digitos = somenteDigitos(termo);

  const { data, isLoading } = useQuery({
    queryKey: ["faturas-unificado", termo, pagina],
    queryFn: async () => {
      let q = supabase
        .from("faturas")
        .select("*, clientes!inner(nome, telefone)", { count: "exact" })
        .order("vencimento", { ascending: false })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);

      if (termo) {
        const filtro = digitos.length >= 3 ? `telefone.ilike.%${digitos}%` : `nome.ilike.%${termo}%`;
        q = q.or(filtro, { referencedTable: "clientes" });
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { linhas: (data ?? []) as unknown as Fatura[], total: count ?? 0 };
    },
  });

  const faturas = data?.linhas ?? [];
  const total = data?.total ?? 0;

  const salvar = useMutation({
    mutationFn: async () => {
      if (!editando) return;
      if (!form.vencimento) throw new Error("Informe a data de vencimento.");

      const { error: erroCliente } = await supabase
        .from("clientes")
        .update({ nome: form.nome.trim() || form.telefone, telefone: somenteDigitos(form.telefone) })
        .eq("id", editando.cliente_id);
      if (erroCliente) throw new Error(erroCliente.message);

      const { error } = await supabase
        .from("faturas")
        .update({
          valor_original: Number(form.valor_original) || 0,
          valor_desconto: Number(form.valor_desconto) || 0,
          vencimento: form.vencimento,
          status: form.status as StatusFatura,
        })
        .eq("id", editando.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Registro atualizado.");
      setEditando(null);
      setForm(vazio);
      void queryClient.invalidateQueries({ queryKey: ["faturas-unificado"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alterarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: StatusFatura }) => {
      const { error } = await supabase.from("faturas").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
      if (status === "paga") {
        const fatura = faturas.find((f) => f.id === id);
        if (fatura) {
          await supabase.from("pagamentos").insert({
            fatura_id: fatura.id,
            cliente_id: fatura.cliente_id,
            valor: Number(fatura.valor_desconto) || Number(fatura.valor_original),
            metodo: "manual",
            status: "confirmado",
            pago_em: new Date().toISOString(),
          });
        }
      }
    },
    onSuccess: () => {
      toast.success("Status atualizado.");
      void queryClient.invalidateQueries({ queryKey: ["faturas-unificado"] });
      void queryClient.invalidateQueries({ queryKey: ["pagamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const gerarCobranca = useMutation({
    mutationFn: async (faturaId: string) => {
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente.");
      const resposta = await fetch("/api/public/cobranca", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fatura_id: faturaId }),
      });

      const json = (await resposta.json()) as { erro?: string };
      if (!resposta.ok) throw new Error(json.erro ?? "Não foi possível gerar a cobrança.");
    },
    onSuccess: () => {
      toast.success("PIX gerado para esta fatura.");
      void queryClient.invalidateQueries({ queryKey: ["faturas-unificado"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function abrirEdicao(f: Fatura) {
    setEditando(f);
    setForm({
      nome: f.clientes?.nome ?? "",
      telefone: f.clientes?.telefone ?? "",
      valor_original: String(f.valor_original),
      valor_desconto: String(f.valor_desconto),
      vencimento: f.vencimento,
      status: f.status,
    });
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes e Faturas</h1>
          <p className="text-sm text-muted-foreground">
            Importe a planilha, pesquise por telefone ou nome e gerencie os valores em uma única tela.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ImportarClientesDialog
            onSuccess={() => {
              setBusca("");
              setPagina(0);
              void queryClient.invalidateQueries({ queryKey: ["faturas-unificado"] });
            }}
          >
            <Button size="lg" className="gap-2">
              <Upload className="size-5" />
              Importar Planilha
            </Button>
          </ImportarClientesDialog>
          <Button
            size="lg"
            variant="destructive"
            className="gap-2"
            onClick={() => {
              setConfirmacaoTexto("");
              setConfirmandoApagar(true);
            }}
          >
            <Trash2 className="size-5" />
            Apagar tudo
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmandoApagar}
        onOpenChange={(aberto) => {
          if (apagarTodos.isPending) return;
          setConfirmandoApagar(aberto);
          if (!aberto) setConfirmacaoTexto("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar todos os clientes e faturas?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Esta ação é <strong>irreversível</strong> e removerá <strong>todos os clientes, faturas e
              pagamentos</strong> do banco de dados. Os registros de acessos (métricas) são mantidos.
            </p>
            <div className="space-y-2">
              <Label htmlFor="confirmar-apagar">
                Para confirmar, digite <strong>APAGAR</strong>
              </Label>
              <Input
                id="confirmar-apagar"
                value={confirmacaoTexto}
                onChange={(e) => setConfirmacaoTexto(e.target.value)}
                placeholder="APAGAR"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmandoApagar(false)}
              disabled={apagarTodos.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={confirmacaoTexto.trim().toUpperCase() !== "APAGAR" || apagarTodos.isPending}
              onClick={() => apagarTodos.mutate()}
            >
              {apagarTodos.isPending ? "Apagando..." : "Apagar tudo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por telefone ou nome do cliente"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setPagina(0);
          }}
          className="pl-10"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="divide-y divide-border">
          {faturas.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-[180px]">
                <p className="font-medium text-foreground">
                  {f.clientes ? formatarTelefone(f.clientes.telefone) : "—"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {f.clientes?.nome ?? "—"} · vence {formatarData(f.vencimento)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Em aberto</p>
                <p className="text-sm text-muted-foreground line-through">{formatarMoeda(f.valor_original)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Com desconto</p>
                <p className="font-semibold text-primary">
                  {formatarMoeda(Number(f.valor_desconto) || Number(f.valor_original))}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={f.status}
                  onValueChange={(v) => alterarStatus.mutate({ id: f.id, status: v as StatusFatura })}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_FATURA).map(([valor, rotulo]) => (
                      <SelectItem key={valor} value={valor}>
                        {rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  title="Gerar PIX / boleto"
                  disabled={gerarCobranca.isPending}
                  onClick={() => gerarCobranca.mutate(f.id)}
                >
                  <QrCode className="size-4" />
                </Button>
                <Button variant="outline" size="sm" title="Editar" onClick={() => abrirEdicao(f)}>
                  <Pencil className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          {isLoading ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : null}
          {!isLoading && !faturas.length ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhum registro encontrado. Use "Importar Planilha" para carregar sua base.
            </p>
          ) : null}
        </div>
      </div>

      {total > POR_PAGINA && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString("pt-BR")} registros · página {pagina + 1} de {totalPaginas}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina + 1 >= totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar cliente e fatura</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tel">Telefone</Label>
              <Input id="tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vo">Valor em aberto (R$)</Label>
              <Input
                id="vo"
                type="number"
                step="0.01"
                value={form.valor_original}
                onChange={(e) => setForm({ ...form, valor_original: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vd">Valor com desconto (R$)</Label>
              <Input
                id="vd"
                type="number"
                step="0.01"
                value={form.valor_desconto}
                onChange={(e) => setForm({ ...form, valor_desconto: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="venc">Vencimento</Label>
              <Input
                id="venc"
                type="date"
                value={form.vencimento}
                onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_FATURA).map(([valor, rotulo]) => (
                    <SelectItem key={valor} value={valor}>
                      {rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
