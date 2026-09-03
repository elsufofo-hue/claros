import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, FileText, LogOut, QrCode, Receipt, ScrollText, Shuffle } from "lucide-react";

import logo from "@/assets/logo-claro.png";
import { Button } from "@/components/ui/button";
import { logout, verificarSessao } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { autenticado } = await verificarSessao();
    if (!autenticado) throw redirect({ to: "/auth" });
  },
  component: LayoutAdmin,
  errorComponent: ErroAdmin,
});

function ErroAdmin() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Não foi possível abrir o painel</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sua sessão pode ter expirado. Entre novamente para continuar.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
          <Button variant="outline" asChild>
            <a href="/auth">Entrar novamente</a>
          </Button>
        </div>
      </div>
    </div>
  );
}



const itens = [
  { to: "/admin", label: "Dashboard", icon: BarChart3, exact: true },
  { to: "/admin/faturas", label: "Clientes e Faturas", icon: FileText, exact: false },
  { to: "/admin/pagamentos", label: "Pagamentos", icon: Receipt, exact: false },
  { to: "/admin/gateways", label: "Gateways", icon: Shuffle, exact: false },
  { to: "/admin/transacoes", label: "Transações PIX", icon: QrCode, exact: false },
  { to: "/admin/logs", label: "Logs", icon: ScrollText, exact: false },

] as const;

function LayoutAdmin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await logout();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="shrink-0">
            <img src={logo} alt="Logo da operadora" width={140} height={38} className="h-8 w-auto" />
          </Link>
          <Button variant="ghost" size="sm" onClick={sair}>
            <LogOut className="size-4" />
            Sair
          </Button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {itens.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-accent text-accent-foreground hover:bg-accent" }}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
