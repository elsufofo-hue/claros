import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Barcode,
  Fingerprint,
  Gavel,
  Globe2,
  Handshake,
  IdCard,
  Loader2,
  ReceiptText,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";

import { registrarAcesso } from "@/lib/acessos.functions";
import bannerCasal from "@/assets/banner-casal.jpg";
import logo from "@/assets/logo-claro.png";
const logoBranca = "https://www.claro.com.br/files/104379/x/4e0cdf35df/claro.svg?sq=75";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarTelefone, somenteDigitos } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fatura em Dia — Consulte e pague sua fatura" },
      {
        name: "description",
        content:
          "Consulte sua fatura pelo número de telefone, veja o valor com desconto, o vencimento e pague na hora. Consulta grátis, segura e 100% online.",
      },
      { property: "og:title", content: "Fatura em Dia — Consulta de faturas por telefone" },
      {
        property: "og:description",
        content: "Digite seu telefone e veja sua fatura: valor original, valor com desconto, vencimento e status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PaginaConsulta,
});

const beneficios = [
  { icone: Wifi, titulo: "Aproveite descontos imperdíveis 100% online" },
  { icone: Gavel, titulo: "Acordo sem burocracia" },
  { icone: Globe2, titulo: "Aproveite descontos imperdíveis onde e quando quiser" },
  { icone: Fingerprint, titulo: "Quitação ágil e segura" },
] as const;

const passos = [
  { icone: IdCard, texto: "Informe o seu telefone" },
  { icone: ReceiptText, texto: "Consulte os detalhes da sua fatura em aberto" },
  { icone: Handshake, texto: "Aproveite descontos imperdíveis disponíveis para você" },
  { icone: Barcode, texto: "Escolha pagar na hora com PIX" },
] as const;

const duvidas = [
  {
    p: "O que é o portal de consulta de faturas?",
    r: "É um portal que permite consultar e quitar suas faturas em aberto de forma online, segura, prática e sem complicações — no momento e no lugar que você quiser.",
  },
  {
    p: "Como consultar minha fatura?",
    r: "Basta digitar o seu telefone celular e clicar em Consultar Fatura. Você verá o nome do titular, o valor original, o valor com desconto, o vencimento e o status.",
  },
  {
    p: "Não lembro qual telefone está cadastrado. O que faço?",
    r: "No momento, a consulta é feita exclusivamente pelo número de telefone celular do cliente. Em caso de dúvida, entre em contato com o atendimento para confirmar o cadastro.",
  },
  {
    p: "Como funciona o pagamento?",
    r: "Ao clicar em Pagar Agora, sua solicitação é registrada e o pagamento é feito via PIX. O código copia e cola é gerado para você colar no aplicativo do seu banco.",
  },
  {
    p: "Posso pagar com cartão de crédito?",
    r: "No momento o pagamento é feito via PIX. Novas formas de pagamento poderão ser habilitadas futuramente.",
  },
] as const;


function PaginaConsulta() {
  const [telefone, setTelefone] = useState("");
  const [aceite, setAceite] = useState(false);
  const navigate = useNavigate();

  // Contabiliza a visita à página pública (invisível para o visitante).
  useEffect(() => {
    void registrarAcesso({ data: { pagina: "/" } }).catch(() => {});
  }, []);


  const mutation = useMutation({
    mutationFn: async () => {
      const digitos = somenteDigitos(telefone);
      if (digitos.length < 10 || digitos.length > 11) throw new Error("Telefone inválido");
      await navigate({ to: "/fatura/$telefone", params: { telefone: digitos } });
    },
    onError: () => toast.error("Informe um telefone válido."),
  });

  const digitos = somenteDigitos(telefone);
  const podeConsultar = digitos.length >= 10 && digitos.length <= 11 && aceite && !mutation.isPending;


  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-primary">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <img
            src={logoBranca}
            alt="Logo da operadora Claro"
            width={140}
            height={38}
            className="h-9 w-auto px-3"
          />
        </div>
      </header>

      {/* HERO */}
      <section className="bg-primary">
        <div className="grid lg:grid-cols-2">
          <div className="relative min-h-[320px] lg:min-h-[480px]">
            <img
              src={bannerCasal}
              alt="Casal sorrindo observando a tela de um laptop"
              width={1280}
              height={912}
              className="absolute inset-0 size-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[oklch(0.15_0_0/0.15)] via-[oklch(0.12_0_0/0.55)] to-[oklch(0.1_0_0/0.95)]" />
            <div className="relative flex h-full items-center justify-end px-6 py-12 sm:px-10">

              <div className="max-w-md text-primary-foreground drop-shadow-lg lg:ml-auto">
                <h1 className="text-2xl font-extrabold uppercase leading-tight sm:text-4xl">
                  Fatura em Dia
                </h1>
                <p className="mt-4 text-base leading-relaxed sm:text-lg">
                  Pague sua fatura em dia e garanta descontos imperdíveis.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center px-6 py-12 sm:px-10">
            <form
              className="w-full max-w-md"
              onSubmit={(e) => {
                e.preventDefault();
                if (podeConsultar) mutation.mutate();
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-foreground underline underline-offset-4">
                Consulta pelo telefone
              </p>
              <label htmlFor="telefone" className="sr-only">
                Digite seu telefone
              </label>
              <Input
                id="telefone"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Digite seu número de celular"
                value={telefone}
                onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                className="mt-4 h-14 rounded-full border-0 bg-card px-6 text-base shadow-card"
              />

              <label className="mt-4 flex items-start gap-2 text-sm text-primary-foreground">
                <input
                  type="checkbox"
                  checked={aceite}
                  onChange={(e) => setAceite(e.target.checked)}
                  className="mt-1 size-4 accent-[oklch(0.99_0_0)]"
                />
                <span>
                  Li e aceito os <span className="font-bold underline">Termos de Uso e Política de Privacidade.</span>
                </span>
              </label>

              <Button
                type="submit"
                size="lg"
                disabled={!podeConsultar}
                className="mt-6 h-14 w-full rounded-full bg-cta text-base font-bold text-cta-foreground hover:bg-cta/90"
              >
                {mutation.isPending ? <Loader2 className="size-5 animate-spin" /> : null}
                Consultar Fatura
              </Button>
              <p className="mt-3 flex items-center gap-2 text-xs text-primary-foreground/85">
                <ShieldCheck className="size-4" />
                Mostramos apenas os dados vinculados ao telefone informado.
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* BENEFÍCIOS */}
      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:grid-cols-2 lg:grid-cols-4">
        {beneficios.map((b) => (
          <div
            key={b.titulo}
            className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-primary/40 bg-card px-6 py-10 text-center shadow-card"
          >
            <b.icone className="size-12 text-primary" strokeWidth={2.2} />
            <h2 className="text-xl font-bold leading-tight text-primary">{b.titulo}</h2>
          </div>
        ))}
      </section>

      {/* COMO FUNCIONA */}
      <section className="mx-auto max-w-7xl px-4 pb-16">
        <div className="relative rounded-3xl bg-primary px-6 pb-12 pt-14 text-primary-foreground sm:px-12">
          <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold">
            Veja como funciona:
          </span>
          <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {passos.map((p, i) => (
              <li key={p.texto} className="flex flex-col items-center gap-4 text-center">
                <p.icone className="size-12" strokeWidth={1.8} />
                <p className="text-base font-medium leading-snug">
                  <span className="mr-1 font-bold">{i + 1}.</span>
                  {p.texto}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* TEXTO INSTITUCIONAL */}
      <section className="mx-auto max-w-4xl px-4 pb-16">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Bem-vindo ao Portal Fatura em Dia!</h2>
        <p className="mt-4 font-semibold text-foreground">Aqui você pode:</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {["Consultar sua fatura", "Ver o valor com desconto", "Solicitar a 2ª via", "Pagar sua fatura por PIX"].map(
            (i) => (
              <li key={i} className="flex items-center gap-2 text-muted-foreground">
                <BadgeCheck className="size-5 shrink-0 text-primary" />
                {i}
              </li>
            ),
          )}
        </ul>
        <p className="mt-6 leading-relaxed text-muted-foreground">
          O portal é uma plataforma online que permite consultar e quitar faturas de forma simples, rápida, segura e
          com os melhores descontos. Você acessa com o seu telefone celular, vê os detalhes da sua fatura — valor
          original, valor com desconto, vencimento e status — e paga na hora, sem precisar de atendente ou ligação
          telefônica.
        </p>
      </section>

      {/* FAQ */}
      <section className="bg-secondary/60 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Perguntas frequentes</h2>
          <p className="mt-2 text-muted-foreground">
            Ainda com dúvidas? Consulte abaixo as principais perguntas de outros clientes.
          </p>
          <div className="mt-8 space-y-3">
            {duvidas.map((d) => (
              <details key={d.p} className="group rounded-xl border border-border bg-card px-5 py-4 shadow-card">
                <summary className="cursor-pointer list-none text-base font-semibold text-foreground marker:hidden">
                  {d.p}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{d.r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>


      <footer className="bg-card py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 text-center text-sm text-muted-foreground">
          <img src={logo} alt="Logo da operadora Claro" width={120} height={33} loading="lazy" className="h-7 w-auto" />
          <p>Consulta de faturas e pagamento por PIX · Atendimento 100% online.</p>
        </div>
      </footer>
    </div>
  );
}
