import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import logo from "@/assets/logo-claro.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

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
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function ehAdmin(userId: string) {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    return Boolean(data);
  }

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      if (data.user && (await ehAdmin(data.user.id))) {
        navigate({ to: "/admin", replace: true });
      }
    });
  }, [navigate]);

  async function concluirAcesso(userId: string) {
    if (await ehAdmin(userId)) {
      setCarregando(false);
      navigate({ to: "/admin", replace: true });
      return;
    }
    await supabase.auth.signOut();
    setCarregando(false);
    toast.error("Acesso restrito", {
      description: "Esta conta não tem permissão de administrador.",
    });
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error || !data.user) {
      setCarregando(false);
      toast.error("Não foi possível entrar", { description: "Verifique o e-mail e a senha." });
      return;
    }
    await concluirAcesso(data.user.id);
  }


  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { emailRedirectTo: window.location.origin, data: { nome } },
    });
    if (error) {
      setCarregando(false);
      toast.error("Não foi possível cadastrar", { description: error.message });
      return;
    }
    if (data.session && data.user) {
        await concluirAcesso(data.user.id);
    } else {
      setCarregando(false);
      toast.success("Cadastro criado", {
        description: "Confirme o e-mail enviado para ativar o acesso.",
      });
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

          <p className="mb-5 flex items-center gap-2 rounded-xl border border-success/25 bg-success/10 px-3 py-2 text-xs font-medium text-success">
            <ShieldCheck className="size-4 shrink-0" />
            Banco de dados e autenticação conectados — nenhuma configuração adicional é necessária.
          </p>

          <Tabs defaultValue="entrar">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="entrar">Entrar</TabsTrigger>
              <TabsTrigger value="criar">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="entrar">
              <form className="space-y-4 pt-4" onSubmit={entrar}>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="senha">Senha</Label>
                    <Link
                      to="/forgot-password"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Esqueci minha senha
                    </Link>
                  </div>
                  <Input
                    id="senha"
                    type="password"
                    required
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={carregando}>
                  {carregando ? <Loader2 className="size-4 animate-spin" /> : null}
                  Entrar
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="criar">
              <form className="space-y-4 pt-4" onSubmit={cadastrar}>
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome</Label>
                  <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email2">E-mail</Label>
                  <Input
                    id="email2"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="senha2">Senha</Label>
                  <Input
                    id="senha2"
                    type="password"
                    required
                    minLength={6}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={carregando}>
                  {carregando ? <Loader2 className="size-4 animate-spin" /> : null}
                  Criar conta de administrador
                </Button>
              </form>
            </TabsContent>
          </Tabs>
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
