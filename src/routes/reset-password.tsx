import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Lock, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import logo from "@/assets/logo-claro.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — Área administrativa" },
      { name: "description", content: "Defina uma nova senha para acessar a área administrativa." },
      { property: "og:title", content: "Redefinir senha — Área administrativa" },
      { property: "og:description", content: "Defina uma nova senha para acessar a área administrativa." },
      { name: "robots", content: "noindex" },
    ],
  }),
  ssr: false,
  component: PaginaRedefinirSenha,
});

function PaginaRedefinirSenha() {
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [hashProcessado, setHashProcessado] = useState(false);
  const [tipoRecuperacao, setTipoRecuperacao] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace(/^#/, ""));

    if (params.get("type") === "recovery") {
      setTipoRecuperacao("recovery");
    }
    setHashProcessado(true);
  }, []);

  async function redefinir(e: React.FormEvent) {
    e.preventDefault();

    if (senha.length < 6) {
      toast.error("Senha muito curta", { description: "A senha deve ter pelo menos 6 caracteres." });
      return;
    }

    if (senha !== confirmarSenha) {
      toast.error("Senhas não coincidem", { description: "Digite a mesma senha nos dois campos." });
      return;
    }

    setCarregando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setCarregando(false);

    if (error) {
      toast.error("Não foi possível redefinir a senha", { description: error.message });
      return;
    }

    toast.success("Senha redefinida", {
      description: "Sua nova senha foi salva. Faça login para continuar.",
    });

    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
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
              <h1 className="text-lg font-semibold text-foreground">Nova senha</h1>
              <p className="text-sm text-muted-foreground">Crie uma senha forte para sua conta</p>
            </div>
          </div>

          {hashProcessado && tipoRecuperacao !== "recovery" ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Este link não é válido para redefinição de senha. Solicite um novo link através da tela de login.
              </p>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/forgot-password">Solicitar novo link</Link>
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={redefinir}>
              <div className="space-y-2">
                <Label htmlFor="senha">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="senha"
                    type={mostrarSenha ? "text" : "password"}
                    minLength={6}
                    required
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {mostrarSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmarSenha">Confirmar nova senha</Label>
                <Input
                  id="confirmarSenha"
                  type="password"
                  minLength={6}
                  required
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={carregando}>
                {carregando ? <Loader2 className="size-4 animate-spin" /> : null}
                Salvar nova senha
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/auth" className="inline-flex items-center gap-1 hover:text-primary">
            <ArrowLeft className="size-4" />
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  );
}
