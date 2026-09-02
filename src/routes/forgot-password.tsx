import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import logo from "@/assets/logo-claro.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Recuperar senha — Área administrativa" },
      { name: "description", content: "Solicite o link para redefinir sua senha de administrador." },
      { property: "og:title", content: "Recuperar senha — Área administrativa" },
      { property: "og:description", content: "Solicite o link para redefinir sua senha de administrador." },
      { name: "robots", content: "noindex" },
    ],
  }),
  ssr: false,
  component: PaginaEsqueciSenha,
});

function PaginaEsqueciSenha() {
  const [email, setEmail] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setCarregando(false);

    if (error) {
      toast.error("Não foi possível enviar o link", { description: error.message });
      return;
    }

    setEnviado(true);
    toast.success("Link enviado", {
      description: "Verifique sua caixa de entrada para redefinir a senha.",
    });
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
              <Mail className="size-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Recuperar senha</h1>
              <p className="text-sm text-muted-foreground">Enviamos um link seguro para o seu e-mail</p>
            </div>
          </div>

          {enviado ? (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <CheckCircle2 className="size-12 text-success" />
              </div>
              <p className="text-sm text-muted-foreground">
                Se houver uma conta cadastrada com <strong className="text-foreground">{email}</strong>, você
                receberá um e-mail com instruções para redefinir a senha.
              </p>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/auth">Voltar para o login</Link>
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={enviar}>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail cadastrado</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@empresa.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={carregando}>
                {carregando ? <Loader2 className="size-4 animate-spin" /> : null}
                Enviar link de redefinição
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
