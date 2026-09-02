import { useMutation } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  X,
  CalendarIcon,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { importarClientes } from "@/lib/clientes.functions";
import { somenteDigitos, formatarTelefone, formatarMoeda, STATUS_FATURA } from "@/lib/format";
import { cn } from "@/lib/utils";

type Campo = "telefone" | "nome" | "email" | "valorOriginal" | "valorDesconto" | "status";

type CelulaBruta = string | number | null | undefined;

type LinhaPlanilha = {
  nome: string;
  telefone: string;
  email: string | null;
  valorOriginal: number | null;
  valorDesconto: number | null;
  status: string | null;
  linha: number;
  erros: string[];
  avisos: string[];
};

const CAMPOS: { campo: Campo; rotulo: string; obrigatorio: boolean; chaves: string[] }[] = [
  {
    campo: "telefone",
    rotulo: "Telefone",
    obrigatorio: true,
    chaves: ["telefone", "tel", "celular", "phone", "whatsapp", "fone", "numero", "num"],
  },
  { campo: "nome", rotulo: "Nome", obrigatorio: false, chaves: ["nome", "name", "cliente"] },
  { campo: "email", rotulo: "E-mail", obrigatorio: false, chaves: ["email", "email", "mail"] },
  {
    campo: "valorOriginal",
    rotulo: "Valor em Aberto",
    obrigatorio: true,
    chaves: ["valororiginal", "valoremaberto", "valor", "valoraberto", "valordafatura", "valorfatura", "divida", "saldo"],
  },
  {
    campo: "valorDesconto",
    rotulo: "Valor com Desconto",
    obrigatorio: true,
    chaves: ["valorcomdesconto", "valordesconto", "desconto", "valorpromocional", "valoravista"],
  },
  { campo: "status", rotulo: "Status", obrigatorio: false, chaves: ["status", "situacao"] },
];

const STATUS_VALIDOS = Object.keys(STATUS_FATURA);

const SEM_COLUNA = "__nenhuma__";

/**
 * Aceita "1.200,50", "1200.50", "R$ 1.200", "1 200,50" e células numéricas.
 * Devolve null apenas quando o conteúdo não é reconhecível como número.
 */
function parseMoeda(valor: string): number | null {
  if (!valor.trim()) return null;
  let limpo = valor.replace(/[^\d,.-]/g, "");
  if (!/\d/.test(limpo)) return null;
  const temVirgula = limpo.includes(",");
  const temPonto = limpo.includes(".");
  if (temVirgula && temPonto) {
    // O último separador é o decimal.
    limpo =
      limpo.lastIndexOf(",") > limpo.lastIndexOf(".")
        ? limpo.replace(/\./g, "").replace(",", ".")
        : limpo.replace(/,/g, "");
  } else if (temVirgula) {
    limpo = limpo.replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".");
  } else if (temPonto) {
    limpo = limpo.replace(/\.(?=\d{3}(\D|$))/g, "");
  }
  const n = Number(limpo);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

function normalizarChave(chave: string): string {
  return chave
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function parseStatus(valor: string): string | null {
  if (!valor) return null;
  const n = normalizarChave(valor);
  const direto = STATUS_VALIDOS.find((s) => normalizarChave(s) === n);
  if (direto) return direto;
  const apelidos: Record<string, string> = {
    aberto: "em_aberto",
    pendente: "em_aberto",
    ematraso: "vencida",
    atrasada: "vencida",
    atrasado: "vencida",
    pago: "paga",
    quitada: "paga",
    quitado: "paga",
    cancelado: "cancelada",
    expirado: "expirada",
    falha: "falhou",
    processando: "em_processamento",
  };
  return apelidos[n] ?? null;
}

function calcularCabecalhos(raw: CelulaBruta[][], semCabecalho: boolean): string[] {
  const primeira = raw[0];
  if (!primeira) return [];
  const largura = raw.reduce((max, l) => Math.max(max, l.length), 0);
  return Array.from({ length: largura }, (_, i) =>
    semCabecalho ? `Coluna ${i + 1}` : String(primeira[i] ?? "").trim() || `Coluna ${i + 1}`,
  );
}

function mapeamentoAutomatico(cabecalhos: string[]): Record<Campo, number | null> {
  const mapa = {} as Record<Campo, number | null>;
  for (const c of CAMPOS) {
    const idx = cabecalhos.findIndex((h) => c.chaves.includes(normalizarChave(h)));
    mapa[c.campo] = idx >= 0 ? idx : null;
  }
  return mapa;
}

function extrairValor(linha: CelulaBruta[], idx: number | null): string {
  if (idx === null || idx === undefined) return "";
  const val = linha[idx];
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function normalizarTelefone(valor: string): string {
  let digitos = somenteDigitos(String(valor));
  // Remove código do país (+55) quando presente.
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) {
    digitos = digitos.slice(2);
  }
  // Remove zero de operadora/DDD à esquerda.
  while (digitos.length > 11 && digitos.startsWith("0")) digitos = digitos.slice(1);
  if (digitos.length === 11 && digitos.startsWith("0")) digitos = digitos.slice(1);
  return digitos;
}

function validarLinha(
  linha: CelulaBruta[],
  mapa: Record<Campo, number | null>,
  numeroLinha: number,
): LinhaPlanilha {
  const nome = extrairValor(linha, mapa.nome);
  const telefoneBruto = extrairValor(linha, mapa.telefone);
  const telefone = normalizarTelefone(telefoneBruto);
  const email = extrairValor(linha, mapa.email) || null;
  const brutoOriginal = extrairValor(linha, mapa.valorOriginal);
  const brutoDesconto = extrairValor(linha, mapa.valorDesconto);
  const parsedOriginal = parseMoeda(brutoOriginal);
  const parsedDesconto = parseMoeda(brutoDesconto);
  const statusBruto = extrairValor(linha, mapa.status);
  const status = parseStatus(statusBruto);
  const erros: string[] = [];
  const avisos: string[] = [];

  if (!telefoneBruto) {
    erros.push("Telefone não informado.");
  } else if (telefone.length < 10 || telefone.length > 11) {
    erros.push(`Telefone inválido ("${telefoneBruto}") — informe DDD + número.`);
  }

  if (brutoOriginal && parsedOriginal === null) erros.push(`Valor em aberto inválido ("${brutoOriginal}").`);
  if (brutoDesconto && parsedDesconto === null) erros.push(`Valor com desconto inválido ("${brutoDesconto}").`);

  const valorOriginal = parsedOriginal ?? 0;
  const valorDesconto = parsedDesconto ?? 0;

  if (!nome) avisos.push("Sem nome — será usado o telefone.");
  if (!brutoOriginal) avisos.push("Valor em aberto vazio — considerado R$ 0,00.");
  if (!brutoDesconto) avisos.push("Valor com desconto vazio — considerado R$ 0,00.");
  if (valorOriginal === 0 && valorDesconto === 0) avisos.push("Fatura será criada com valor zero.");
  if (statusBruto && !status) avisos.push(`Status "${statusBruto}" não reconhecido — usando "Em aberto".`);
  if (valorDesconto > valorOriginal) avisos.push("Desconto maior que o valor em aberto — o maior será usado.");

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    avisos.push("E-mail inválido — não será importado.");
  }

  return {
    nome,
    telefone,
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    valorOriginal,
    valorDesconto,
    status,
    linha: numeroLinha,
    erros,
    avisos,
  };
}

export function gerarModeloPlanilha() {
  const dados = [
    ["telefone", "nome", "email", "valor_em_aberto", "valor_com_desconto", "status"],
    ["11999999999", "Maria Silva", "maria@email.com", 1200.5, 499.9, "em aberto"],
    ["21988888888", "Joao Souza", "", 800, 350, "paga"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Clientes");
  XLSX.writeFile(wb, "modelo-clientes.xlsx");
}

export function ImportarClientesDialog({
  onSuccess,
  children,
}: {
  onSuccess: () => void;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [raw, setRaw] = useState<CelulaBruta[][]>([]);
  const [semCabecalho, setSemCabecalho] = useState(false);
  const [mapa, setMapa] = useState<Record<Campo, number | null> | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [carregandoLeitura, setCarregandoLeitura] = useState(false);
  const [vencimentoGlobal, setVencimentoGlobal] = useState<Date | undefined>();
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapeamentoRef = useRef<HTMLDivElement>(null);

  const cabecalhos = useMemo(() => calcularCabecalhos(raw, semCabecalho), [raw, semCabecalho]);
  const brutas = useMemo(() => (semCabecalho ? raw : raw.slice(1)), [raw, semCabecalho]);

  // Dois primeiros valores preenchidos de cada coluna, para exibir como exemplo.
  const exemplos = useMemo(
    () =>
      cabecalhos.map((_, col) => {
        const vals: string[] = [];
        for (const linha of brutas) {
          const v = String(linha[col] ?? "").trim();
          if (v) vals.push(v);
          if (vals.length === 2) break;
        }
        return vals;
      }),
    [cabecalhos, brutas],
  );

  const faltando = CAMPOS.filter((c) => c.obrigatorio && (!mapa || mapa[c.campo] === null));
  const mapeamentoCompleto = !!mapa && faltando.length === 0;

  const linhas = useMemo<LinhaPlanilha[]>(() => {
    if (!mapa || !mapeamentoCompleto) return [];
    const offset = semCabecalho ? 1 : 2;
    return brutas
      .filter((linha) => linha.some((c) => String(c ?? "").trim() !== ""))
      .map((linha, idx) => validarLinha(linha, mapa, idx + offset));
  }, [brutas, mapa, mapeamentoCompleto, semCabecalho]);

  const validas = linhas.filter((l) => l.erros.length === 0);
  const invalidas = linhas.filter((l) => l.erros.length > 0);
  const comAviso = validas.filter((l) => l.avisos.length > 0);

  function baixarRejeitadas() {
    const dados = [
      ["linha_da_planilha", "nome", "telefone", "valor_em_aberto", "valor_com_desconto", "motivo"],
      ...invalidas.map((l) => [
        l.linha,
        l.nome,
        l.telefone,
        l.valorOriginal ?? "",
        l.valorDesconto ?? "",
        l.erros.join(" | "),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rejeitadas");
    XLSX.writeFile(wb, "linhas-rejeitadas.xlsx");
  }


  const importar = useMutation({
    mutationFn: async () => {
      if (!validas.length) throw new Error("Nenhuma linha válida para importar.");
      if (!vencimentoGlobal) throw new Error("Escolha a data de vencimento das faturas.");

      const vencimento = format(vencimentoGlobal, "yyyy-MM-dd");
      const TAMANHO_LOTE = 200;
      const totais = { importados: 0, faturasCriadas: 0, faturasAtualizadas: 0, rejeitados: 0 };
      const falhas: { lote: number; de: number; ate: number; motivo: string }[] = [];

      setProgresso({ feitos: 0, total: validas.length });

      for (let i = 0; i < validas.length; i += TAMANHO_LOTE) {
        const lote = validas.slice(i, i + TAMANHO_LOTE).map((l) => ({
          nome: l.nome || null,
          telefone: l.telefone,
          email: l.email,
          valor_original: l.valorOriginal,
          valor_desconto: l.valorDesconto,
          status: l.status,
        }));

        let ultimoErro = "";
        let ok = false;

        // Até 3 tentativas por lote: falhas de rede/tempo limite são temporárias.
        for (let tentativa = 1; tentativa <= 3 && !ok; tentativa++) {
          try {
            const res = await importarClientes({
              data: { clientes: lote, vencimento_global: vencimento },
            });
            totais.importados += res.importados;
            totais.faturasCriadas += res.faturasCriadas;
            totais.faturasAtualizadas += res.faturasAtualizadas;
            totais.rejeitados += res.rejeitados?.length ?? 0;
            ok = true;
          } catch (erro) {
            ultimoErro = erro instanceof Error ? erro.message : "Falha desconhecida";
            if (tentativa < 3) await new Promise((r) => setTimeout(r, 800 * tentativa));
          }
        }

        if (!ok) {
          falhas.push({
            lote: Math.floor(i / TAMANHO_LOTE) + 1,
            de: i + 1,
            ate: Math.min(i + TAMANHO_LOTE, validas.length),
            motivo: ultimoErro,
          });
        }

        setProgresso({ feitos: Math.min(i + TAMANHO_LOTE, validas.length), total: validas.length });
        // Pequena pausa entre lotes para não sobrecarregar o servidor.
        await new Promise((r) => setTimeout(r, 60));
      }

      return { ...totais, falhas };
    },
    onSuccess: (res) => {
      const partes = [`${res.importados} clientes importados`];
      if (res.faturasCriadas) partes.push(`${res.faturasCriadas} faturas criadas`);
      if (res.faturasAtualizadas) partes.push(`${res.faturasAtualizadas} faturas atualizadas`);
      if (res.rejeitados) partes.push(`${res.rejeitados} linhas rejeitadas`);

      setProgresso(null);

      if (res.falhas.length) {
        const primeira = res.falhas[0];
        toast.warning(`${partes.join(" · ")}.`, {
          description: `${res.falhas.length} lote(s) falharam (ex.: linhas ${primeira?.de}–${primeira?.ate}: ${primeira?.motivo}). Baixe o relatório e reimporte apenas essas linhas.`,
          duration: 15000,
          action: {
            label: "Baixar relatório",
            onClick: () => baixarRelatorioFalhas(res.falhas),
          },
        });
        onSuccess();
        return;
      }

      toast.success(`${partes.join(" · ")}.`);
      limpar();
      setAberto(false);
      onSuccess();
    },
    onError: (e: Error) => {
      setProgresso(null);
      toast.error("Erro na importação", { description: e.message, duration: 12000 });
    },
  });

  function baixarRelatorioFalhas(
    falhas: { lote: number; de: number; ate: number; motivo: string }[],
  ) {
    const dados = [
      ["lote", "linha_inicial", "linha_final", "motivo"],
      ...falhas.map((f) => [f.lote, f.de, f.ate, f.motivo]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lotes com falha");
    XLSX.writeFile(wb, "lotes-com-falha.xlsx");
  }


  function processarArquivo(file: File) {
    setCarregandoLeitura(true);
    setNomeArquivo(file.name);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
        if (!sheet) {
          toast.error("Não foi possível ler a aba da planilha.");
          setRaw([]);
          setMapa(null);
          setCarregandoLeitura(false);
          return;
        }

        const linhasRaw = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          blankrows: false,
        }) as CelulaBruta[][];

        if (!linhasRaw.length) {
          toast.error("A planilha está vazia.");
          setRaw([]);
          setMapa(null);
          setCarregandoLeitura(false);
          return;
        }

        // Sem cabeçalho quando a primeira linha já parece um dado (telefone/valores).
        const primeira = linhasRaw[0] ?? [];
        const pareceDado =
          primeira.filter((c) => somenteDigitos(String(c ?? "")).length >= 6).length >= 1 &&
          primeira.every((c) => !/[a-zA-Z]{4,}/.test(String(c ?? "")));
        const semCab = linhasRaw.length === 1 ? true : pareceDado;

        setRaw(linhasRaw);
        setSemCabecalho(semCab);
        setMapa(mapeamentoAutomatico(calcularCabecalhos(linhasRaw, semCab)));
        setTimeout(
          () => mapeamentoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
          120,
        );
      } catch {
        toast.error("Erro ao ler planilha. Verifique o formato e tente novamente.");
      } finally {
        setCarregandoLeitura(false);
      }
    };

    reader.onerror = () => {
      toast.error("Não foi possível ler o arquivo.");
      setCarregandoLeitura(false);
    };

    reader.readAsArrayBuffer(file);
  }

  function alternarCabecalho(valor: boolean) {
    setSemCabecalho(valor);
    setMapa(mapeamentoAutomatico(calcularCabecalhos(raw, valor)));
  }

  function limpar() {
    setRaw([]);
    setSemCabecalho(false);
    setMapa(null);
    setNomeArquivo(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar clientes</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Passo 1 — arquivo */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">1. Envie a planilha</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" onClick={gerarModeloPlanilha}>
                <Download className="mr-2 size-4" />
                Baixar modelo
              </Button>
              <p className="text-xs text-muted-foreground">
                .xlsx, .xls ou .csv. Depois do upload você escolhe qual coluna vai em cada campo.
              </p>
            </div>

            <div
              className="rounded-2xl border-2 border-dashed border-border bg-muted/40 p-8 text-center transition-colors hover:bg-muted/60"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) processarArquivo(file);
              }}
            >
              <FileSpreadsheet className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-foreground">
                Arraste uma planilha ou clique para selecionar
              </p>
              <p className="text-xs text-muted-foreground">.xlsx, .xls, .csv</p>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) processarArquivo(file);
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => inputRef.current?.click()}
                disabled={carregandoLeitura}
              >
                <Upload className="mr-2 size-4" />
                Selecionar arquivo
              </Button>
            </div>

            {nomeArquivo && (
              <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm">
                <span className="truncate pr-4">{nomeArquivo}</span>
                <button onClick={limpar} className="text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              </div>
            )}
          </div>

          {cabecalhos.length > 0 && (
            <>
              {/* Passo 2 — mapeamento */}
              <div
                ref={mapeamentoRef}
                className="scroll-mt-4 space-y-4 rounded-2xl border-2 border-primary/40 bg-card p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    2. Relacione as colunas da sua planilha
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Para cada campo do sistema, escolha a coluna correspondente. Os exemplos mostram
                    dados reais do seu arquivo.
                  </p>
                </div>

                <label className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    className="size-4 accent-[hsl(var(--primary))]"
                    checked={semCabecalho}
                    onChange={(e) => alternarCabecalho(e.target.checked)}
                  />
                  A primeira linha já é um dado (minha planilha não tem cabeçalho)
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  {CAMPOS.map((c) => {
                    const indice = mapa?.[c.campo] ?? null;
                    const faltante = c.obrigatorio && indice === null;
                    return (
                      <div key={c.campo} className="space-y-1.5">
                        <Label
                          className={cn("text-xs", faltante && "text-destructive")}
                        >
                          {c.rotulo}{" "}
                          <span className="text-muted-foreground">
                            ({c.obrigatorio ? "obrigatório" : "opcional"})
                          </span>
                        </Label>
                        <Select
                          value={indice === null ? SEM_COLUNA : String(indice)}
                          onValueChange={(v) =>
                            setMapa((m) =>
                              m ? { ...m, [c.campo]: v === SEM_COLUNA ? null : Number(v) } : m,
                            )
                          }
                        >
                          <SelectTrigger className={cn(faltante && "border-destructive")}>
                            <SelectValue placeholder="Selecionar coluna" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SEM_COLUNA}>Não importar</SelectItem>
                            {cabecalhos.map((h, i) => {
                              const usadoPor = CAMPOS.find(
                                (o) => o.campo !== c.campo && mapa?.[o.campo] === i,
                              );
                              return (
                                <SelectItem key={i} value={String(i)}>
                                  {h}
                                  {exemplos[i]?.[0] ? ` — ex.: ${exemplos[i]?.[0]}` : ""}
                                  {usadoPor ? ` (já usada em ${usadoPor.rotulo})` : ""}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <p className="truncate text-xs text-muted-foreground">
                          {indice === null
                            ? "Nenhuma coluna escolhida"
                            : exemplos[indice]?.length
                              ? `Ex.: ${exemplos[indice]?.join(", ")}`
                              : "Coluna sem dados nas primeiras linhas"}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {!mapeamentoCompleto && (
                  <p className="text-xs font-medium text-destructive">
                    Falta escolher: {faltando.map((c) => c.rotulo).join(", ")}.
                  </p>
                )}
              </div>

              {/* Passo 3 — vencimento */}
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-sm font-semibold text-foreground">
                  3. Data de vencimento das faturas
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Todas as faturas desta importação receberão esta mesma data.
                </p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "mt-3 w-full justify-start text-left font-normal sm:w-72",
                        !vencimentoGlobal && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 size-4" />
                      {vencimentoGlobal
                        ? format(vencimentoGlobal, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                        : "Escolher data no calendário"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={vencimentoGlobal}
                      onSelect={setVencimentoGlobal}
                      locale={ptBR}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Prévia bruta da planilha */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Prévia da planilha</p>
                <div className="max-h-56 overflow-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-left text-xs font-medium uppercase text-muted-foreground">
                      <tr>
                        {cabecalhos.map((h, i) => {
                          const campo = CAMPOS.find((c) => mapa?.[c.campo] === i);
                          return (
                            <th
                              key={i}
                              className={cn(
                                "whitespace-nowrap px-3 py-2 align-top",
                                campo && "text-primary",
                              )}
                            >
                              {h}
                              <span className="block text-[10px] font-normal normal-case text-muted-foreground">
                                {campo ? campo.rotulo : "não usada"}
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {brutas.slice(0, 5).map((linha, i) => (
                        <tr key={i}>
                          {cabecalhos.map((_, c) => (
                            <td key={c} className="whitespace-nowrap px-3 py-2">
                              {String(linha[c] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Mostrando as primeiras linhas de {brutas.length.toLocaleString("pt-BR")} do arquivo.
                </p>
              </div>
            </>
          )}

          {linhas.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">4. Confira e importe</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-3 text-sm">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-green-600" />
                  {validas.length.toLocaleString("pt-BR")} de {linhas.length.toLocaleString("pt-BR")} linhas serão
                  importadas
                </span>
                {comAviso.length > 0 && (
                  <span className="text-amber-600">{comAviso.length.toLocaleString("pt-BR")} com aviso</span>
                )}
                {invalidas.length > 0 && (
                  <>
                    <span className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="size-4" />
                      {invalidas.length.toLocaleString("pt-BR")} rejeitadas
                    </span>
                    <Button variant="outline" size="sm" onClick={baixarRejeitadas}>
                      <Download className="mr-2 size-4" />
                      Baixar linhas rejeitadas
                    </Button>
                  </>
                )}
              </div>


              <div className="max-h-64 overflow-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left text-xs font-medium uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Nome</th>
                      <th className="px-3 py-2">Telefone</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Em aberto</th>
                      <th className="px-3 py-2">Com desconto</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {linhas.slice(0, 50).map((l, idx) => (
                      <tr key={idx} className={l.erros.length > 0 ? "bg-destructive/10" : ""}>
                        <td className="px-3 py-2">{l.nome || "—"}</td>
                        <td className="px-3 py-2">{formatarTelefone(l.telefone)}</td>
                        <td className="px-3 py-2">{l.email || "—"}</td>
                        <td className="px-3 py-2">
                          {l.valorOriginal !== null ? formatarMoeda(l.valorOriginal) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {l.valorDesconto !== null ? formatarMoeda(l.valorDesconto) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {l.status ? STATUS_FATURA[l.status as keyof typeof STATUS_FATURA] : "Em aberto"}
                        </td>
                        <td className="px-3 py-2">
                          {l.erros.length > 0 ? (
                            <span className="text-xs text-destructive" title={l.erros.join(" ")}>
                              {l.erros.join(" ")}
                            </span>
                          ) : l.avisos.length > 0 ? (
                            <span className="text-xs text-amber-600" title={l.avisos.join(" ")}>
                              {l.avisos.join(" ")}
                            </span>
                          ) : (
                            <CheckCircle2 className="size-4 text-green-600" />
                          )}
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
                {linhas.length > 50 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Exibindo 50 de {linhas.length} registros. Todas as linhas válidas serão importadas.
                  </p>
                )}
              </div>

              {!vencimentoGlobal && (
                <p className="text-xs text-destructive">
                  Escolha a data de vencimento acima para liberar a importação.
                </p>
              )}
              {progresso && (
                <div className="space-y-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.round((progresso.feitos / progresso.total) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {progresso.feitos.toLocaleString("pt-BR")} de {progresso.total.toLocaleString("pt-BR")} importados
                  </p>
                </div>
              )}
              <Button
                className="w-full"
                disabled={!validas.length || !vencimentoGlobal || importar.isPending}
                onClick={() => importar.mutate()}
              >
                {importar.isPending
                  ? "Importando..."
                  : `Importar ${validas.length.toLocaleString("pt-BR")} clientes`}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
