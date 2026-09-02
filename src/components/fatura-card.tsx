import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, Copy, Loader2, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

const logoBranca = "https://www.claro.com.br/files/104379/x/4e0cdf35df/claro.svg?sq=75";

import { Button } from "@/components/ui/button";
import { consultarStatusFatura, gerarPixFatura } from "@/lib/consulta.functions";
import type { FaturaPublica, PixGerado } from "@/lib/consulta.functions";
import {
  formatarData,
  formatarMoeda,
  formatarTelefone,
  MENSAGEM_STATUS,
  STATUS_FATURA,
  STATUS_PAGAVEIS,
} from "@/lib/format";


export function StatusBadge({ status }: { status: string }) {
  const estilos: Record<string, string> = {
    paga: "bg-success/12 text-success border-success/25",
    em_aberto: "bg-warning/15 text-warning-foreground border-warning/40",
    em_processamento: "bg-warning/15 text-warning-foreground border-warning/40",
    vencida: "bg-destructive/10 text-destructive border-destructive/25",
    expirada: "bg-destructive/10 text-destructive border-destructive/25",
    falhou: "bg-destructive/10 text-destructive border-destructive/25",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
        estilos[status] ?? "bg-muted text-muted-foreground border-border"
      }`}
    >
      {STATUS_FATURA[status] ?? status}
    </span>
  );
}


export function Campo({
  rotulo,
  valor,
  destaque,
  riscado,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
  riscado?: boolean;
}) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      <dd
        className={
          destaque
            ? "mt-1 text-2xl font-bold text-primary"
            : riscado
              ? "mt-1 text-lg font-medium text-muted-foreground line-through"
              : "mt-1 text-lg font-semibold text-foreground"
        }
      >
        {valor}
      </dd>
    </div>
  );
}

export function CardFatura({
  fatura,
  nome,
  telefone,
}: {
  fatura: FaturaPublica;
  nome: string;
  telefone: string;
}) {
  const gerarPix = useServerFn(gerarPixFatura);
  const verStatus = useServerFn(consultarStatusFatura);
  

  const [status, setStatus] = useState<string>(fatura.status);
  const [qr, setQr] = useState<string | null>(null);
  const [pixManual, setPixManual] = useState<PixGerado | null>(null);

  const valorPagar = useMemo(
    () => (fatura.valor_desconto > 0 ? fatura.valor_desconto : fatura.valor_original),
    [fatura.valor_desconto, fatura.valor_original],
  );
  const economia = fatura.valor_original - valorPagar;
  const paga = status === "paga";
  const pagavel = STATUS_PAGAVEIS.includes(status);
  const emProcessamento = status === "em_processamento";
  const mensagem = MENSAGEM_STATUS[status] ?? "Não foi possível determinar a situação desta fatura.";
  const [requestKeyInicial] = useState(() => crypto.randomUUID());

  // Gera o PIX automaticamente ao abrir a fatura (menos um passo para o cliente).
  // Uma única chamada ao backend por carregamento da página — o backend decide
  // se cria uma cobrança nova (padrão) ou reaproveita uma ainda válida.
  const pixInicial = useQuery({
    queryKey: ["pix", fatura.id],
    queryFn: () => gerarPix({ data: { fatura_id: fatura.id, request_key: requestKeyInicial } }),
    enabled: pagavel,
    gcTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  // "Gerar novo PIX": sempre cria uma cobrança nova na gateway.
  const novoPix = useMutation({
    mutationFn: () =>
      gerarPix({ data: { fatura_id: fatura.id, forcar: true, request_key: crypto.randomUUID() } }),
    onSuccess: (r) => {
      setPixManual(r);
      if (r.disponivel) toast.success("Novo código PIX gerado.");
      else toast.error(r.mensagem ?? "Pagamento indisponível no momento.");
    },
    onError: () => toast.error("Não foi possível gerar um novo PIX agora."),
  });

  const pix = {
    data: pixManual ?? pixInicial.data,
    isPending: pixInicial.isPending || novoPix.isPending,
    error: pixInicial.error,
  };

  // Polling: confirma o pagamento no gateway e atualiza a tela sem recarregar.
  useQuery({
    queryKey: ["status-fatura", fatura.id],
    queryFn: async () => {
      const r = await verStatus({ data: { fatura_id: fatura.id } });
      setStatus(r.status);
      return r;
    },
    enabled: (pagavel && Boolean(pix.data?.copia_cola)) || emProcessamento,
    refetchInterval: 5000,
  });


  const copiaCola = pix.data?.copia_cola ?? "";

  useEffect(() => {
    if (!copiaCola) return;
    void QRCode.toDataURL(copiaCola, { width: 480, margin: 1 }).then(setQr).catch(() => setQr(null));
  }, [copiaCola]);

  // Contagem regressiva de validade do PIX.
  const expiraEm = pix.data?.expira_em ?? null;
  const [restante, setRestante] = useState<number | null>(null);
  useEffect(() => {
    if (!expiraEm) {
      setRestante(null);
      return;
    }
    const alvo = new Date(expiraEm).getTime();
    const tick = () => setRestante(Math.max(0, Math.floor((alvo - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiraEm]);

  const tempo =
    restante == null
      ? null
      : `${String(Math.floor(restante / 60)).padStart(2, "0")}:${String(restante % 60).padStart(2, "0")}`;

  const copiar = useMutation({
    mutationFn: async () => {
      await navigator.clipboard.writeText(copiaCola);
    },
    onSuccess: () => toast.success("Código PIX copiado!", { description: "Cole no app do seu banco." }),
    onError: () => toast.error("Não foi possível copiar. Selecione o código manualmente."),
  });





  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
      <header className="bg-primary">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/">
            <img
              src={logoBranca}
              alt="Logo da operadora Claro"
              width={140}
              height={38}
              className="h-9 w-auto px-3"
            />
          </Link>
        </div>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border bg-secondary/60 px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cliente</p>
          <p className="truncate text-base font-semibold text-foreground">{nome}</p>
          <p className="text-sm text-muted-foreground">{formatarTelefone(telefone)}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="px-5 pb-1 pt-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {fatura.descricao}
          {fatura.referencia ? ` · ${fatura.referencia}` : ""}
        </p>
        <p className="mt-2 text-4xl font-black tracking-tight text-foreground">{formatarMoeda(valorPagar)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {economia > 0 ? (
            <>
              <span className="text-muted-foreground line-through">{formatarMoeda(fatura.valor_original)}</span>
              <span className="rounded-full bg-success/12 px-2.5 py-0.5 text-xs font-semibold text-success">
                economia de {formatarMoeda(economia)}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
        <Campo rotulo="Valor original" valor={formatarMoeda(fatura.valor_original)} riscado />
        <Campo rotulo="Valor com desconto à vista" valor={formatarMoeda(valorPagar)} destaque />
        <Campo rotulo="Vencimento" valor={formatarData(fatura.vencimento)} />
        <Campo rotulo="Telefone" valor={formatarTelefone(telefone)} />
      </dl>

      <div className="space-y-5 px-5 py-6">
        {paga ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-success/10 px-4 py-4 text-center text-success">
            <CheckCircle2 className="size-5 shrink-0" />
            <span className="text-sm font-bold">{mensagem}</span>
          </div>
        ) : emProcessamento ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-warning/10 px-4 py-4 text-center">
            <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">{mensagem}</span>
          </div>
        ) : !pagavel ? (
          <div className="space-y-3 rounded-2xl border border-border bg-secondary/40 px-5 py-6 text-center">
            <AlertCircle className="mx-auto size-6 text-destructive" />
            <p className="text-sm font-bold text-foreground">{STATUS_FATURA[status] ?? status}</p>
            <p className="text-sm text-muted-foreground">{mensagem}</p>
          </div>
        ) : (
          <>
            <p className="rounded-2xl bg-secondary/40 px-4 py-3 text-center text-sm text-muted-foreground">
              {mensagem}
            </p>

            <div className="rounded-2xl border border-border bg-secondary/40 p-5 text-center">
              <p className="flex items-center justify-center gap-2 text-sm font-bold text-foreground">
                <QrCode className="size-4" />
                Pague com PIX
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Escaneie o QR Code ou copie o código no app do seu banco.
              </p>

              <div className="mx-auto mt-4 grid size-56 place-items-center rounded-2xl border border-border bg-card p-3">
                {pix.isPending ? (
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                ) : qr ? (
                  <img src={qr} alt="QR Code para pagamento PIX da fatura" className="size-full" />
                ) : (
                  <p className="px-4 text-xs text-muted-foreground">
                    {pix.data?.mensagem ??
                      (pix.error
                        ? "Pagamento indisponível no momento. Tente novamente em alguns minutos."
                        : "Não foi possível gerar o QR Code agora.")}
                  </p>
                )}
              </div>

              {copiaCola ? (
                <p className="mx-auto mt-4 max-w-full break-all rounded-xl bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                  {copiaCola}
                </p>
              ) : null}


              <Button
                size="lg"
                className="mt-4 h-14 w-full rounded-full bg-cta text-base font-bold text-cta-foreground hover:bg-cta/90"
                onClick={() => copiar.mutate()}
                disabled={!copiaCola}
              >
                <Copy className="size-5" />
                Copiar código PIX
              </Button>

              <Button
                variant={restante === 0 ? "default" : "outline"}
                size="lg"
                className="mt-3 h-12 w-full rounded-full text-sm font-semibold"
                onClick={() => novoPix.mutate()}
                disabled={novoPix.isPending}
              >
                {novoPix.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Gerar novo PIX
              </Button>




              {tempo ? (
                <p className="mt-4 text-xs font-semibold text-foreground">
                  {restante === 0
                    ? "Este código PIX expirou. Toque em \u201cGerar novo PIX\u201d."
                    : `Este código PIX expira em ${tempo}`}
                </p>
              ) : null}

              <p className="mt-2 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Aguardando confirmação do pagamento…
              </p>
            </div>


            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4" />
              A confirmação é automática assim que o banco liquidar o PIX.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
