import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import logo from "@/assets/logo-claro.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, verificarSessao } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Área administrativa — Consulta de Faturas" },
      { name: "description", content: "Acesso restrito para administradores do sistema de faturas." },
      { property: "og:title", content: "Área administrativa — Consulta de Faturas" },
      { property: "og:description", content: "Acesso restrito para administradores." },
      { name: "robots", content: "noindex" },
    ],
  }),
  ssr: false,
  component: PaginaAuth,
});

function PaginaAuth() {
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    void verificarSessao().then(({ autenticado }) => {
      if (autenticado) navigate({ to: "/admin", replace: true });
    });
  }, [navigate]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    try {
      const { ok } = await login({ data: { senha } });
      if (!ok) {
        toast.error("Senha incorreta");
        return;
      }
      navigate({ to: "/admin", replace: true });
    } catch {
      toast.error("Não foi possível entrar", {
        description: "Tente novamente em instantes.",
      });
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-soft-gradient px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex justify-center">
          <img src={logo} alt="Logo da operadora" width={180} height={50} className="h-11 w-auto" />
        </Link>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Lock className="size-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Área administrativa</h1>
              <p className="text-sm text-muted-foreground">Acesso restrito a administradores</p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={entrar}>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                required
                autoFocus
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={carregando}>
              {carregando ? <Loader2 className="size-4 animate-spin" /> : null}
              Entrar
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Voltar para a consulta de faturas
          </Link>
        </p>
      </div>
    </div>
  );
}
