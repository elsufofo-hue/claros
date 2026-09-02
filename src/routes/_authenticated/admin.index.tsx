import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { FileText, Trash2, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { limparAcessos, obterMetricasAcessos } from "@/lib/acessos.functions";
import { formatarMoeda } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Administração de Faturas" },
      { name: "description", content: "Clientes que acessaram a página e total de clientes cadastrados." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const queryClient = useQueryClient();

  const { data: totalClientes, isLoading } = useQuery({
    queryKey: ["dashboard-clientes"],
    queryFn: async () => {
      const { count } = await supabase
        .from("clientes")
        .select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: metricas, isLoading: carregandoMetricas } = useQuery({
    queryKey: ["metricas-acessos"],
    queryFn: () => obterMetricasAcessos(),
    refetchInterval: 30000,
  });

  // Atualização em tempo real conforme novos acessos chegam.
  useEffect(() => {
    const canal = supabase
      .channel("acessos-dashboard")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "acessos" }, () => {
        queryClient.invalidateQueries({ queryKey: ["metricas-acessos"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [queryClient]);

  const limpar = useMutation({
    mutationFn: () => limparAcessos(),
    onSuccess: (res) => {
      toast.success(`Histórico limpo: ${res.removidos} registro(s) removido(s).`);
      queryClient.invalidateQueries({ queryKey: ["metricas-acessos"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível limpar o histórico."),
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Clientes, faturas visualizadas e valor total visualizado.
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          disabled={limpar.isPending}
          onClick={() => {
            if (
              window.confirm(
                "Apagar todo o histórico de consultas e visitas do site? Esta ação é irreversível.",
              )
            ) {
              limpar.mutate();
            }
          }}
        >
          <Trash2 className="size-4" />
          {limpar.isPending ? "Limpando..." : "Limpar histórico"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao
          titulo="Clientes que acessaram a página"
          valor={(metricas?.clientes_total ?? 0).toLocaleString("pt-BR")}
          descricao="Telefones únicos que consultaram a fatura"
          icone={UserCheck}
          carregando={carregandoMetricas}
        />
        <Cartao
          titulo="Clientes no banco de dados"
          valor={(totalClientes ?? 0).toLocaleString("pt-BR")}
          descricao="Total de clientes cadastrados"
          icone={Users}
          carregando={isLoading}
        />
        <Cartao
          titulo="Total de faturas visualizadas"
          valor={(metricas?.faturas_visualizadas_total ?? 0).toLocaleString("pt-BR")}
          descricao="Um registro por cliente, mesmo com vários acessos"
          icone={FileText}
          carregando={carregandoMetricas}
        />
        <Cartao
          titulo="Valor total visualizado"
          valor={formatarMoeda(metricas?.valor_visualizado_total ?? 0)}
          descricao="Soma do valor com desconto do primeiro acesso de cada cliente"
          icone={FileText}
          carregando={carregandoMetricas}
        />

      </div>
    </div>
  );
}

function Cartao({
  titulo,
  valor,
  descricao,
  icone: Icone,
  carregando,
}: {
  titulo: string;
  valor: string;
  descricao?: string;
  icone: React.ComponentType<{ className?: string }>;
  carregando?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{titulo}</p>
        <Icone className="size-5 text-primary" />
      </div>
      <p className="mt-3 text-3xl font-bold text-foreground">{carregando ? "…" : valor}</p>
      {descricao ? <p className="mt-1 text-xs text-muted-foreground">{descricao}</p> : null}
    </div>
  );
}
