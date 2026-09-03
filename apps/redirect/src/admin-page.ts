import type { RedirectConfig } from "./db.ts";

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

interface Opts {
  config?: RedirectConfig | null;
  ok?: string;
  erro?: string;
}

/** Página HTML mínima e sem dependências para editar o destino do redirect. */
export function paginaAdmin({ config, ok, erro }: Opts): string {
  const destino = config?.destino ?? "";
  const statusCode = config?.status_code ?? 302;
  const atualizado = config?.atualizado_em
    ? new Date(config.atualizado_em).toLocaleString("pt-BR")
    : "—";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Redirect — admin</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font: 15px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 34rem; margin: 3rem auto; padding: 0 1.25rem; }
  h1 { font-size: 1.25rem; margin-bottom: .25rem; }
  p.sub { color: #888; margin-top: 0; }
  label { display: block; font-weight: 600; margin: 1rem 0 .35rem; }
  input, select { width: 100%; padding: .55rem .7rem; font: inherit; border: 1px solid #8884; border-radius: .5rem; background: transparent; color: inherit; }
  button { margin-top: 1.5rem; padding: .6rem 1.2rem; font: inherit; font-weight: 600; border: 0; border-radius: .5rem; background: #2563eb; color: #fff; cursor: pointer; }
  button:hover { background: #1d4ed8; }
  .msg { padding: .6rem .8rem; border-radius: .5rem; margin: 1rem 0; }
  .ok { background: #16a34a22; border: 1px solid #16a34a55; }
  .err { background: #dc262622; border: 1px solid #dc262655; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: .25rem .75rem; color: #888; font-size: .9rem; margin-top: 2rem; }
  dt { font-weight: 600; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
</head>
<body>
  <h1>Redirect</h1>
  <p class="sub">Domínio único → destino único. A troca vale para todos em até 10s (cache).</p>

  ${ok ? `<div class="msg ok">${escapar(ok)}</div>` : ""}
  ${erro ? `<div class="msg err">${escapar(erro)}</div>` : ""}

  <form method="post" enctype="application/x-www-form-urlencoded">
    <label for="destino">Destino</label>
    <input id="destino" name="destino" type="url" required placeholder="https://site-de-destino.com"
           value="${escapar(destino)}">

    <label for="status_code">Tipo de redirect</label>
    <select id="status_code" name="status_code">
      <option value="302"${statusCode === 302 ? " selected" : ""}>302 — temporário (recomendado)</option>
      <option value="307"${statusCode === 307 ? " selected" : ""}>307 — temporário, preserva método</option>
      <option value="301"${statusCode === 301 ? " selected" : ""}>301 — permanente (cache agressivo)</option>
      <option value="308"${statusCode === 308 ? " selected" : ""}>308 — permanente, preserva método</option>
    </select>

    <button type="submit">Salvar</button>
  </form>

  <dl>
    <dt>Atual</dt><dd><code>${destino ? escapar(destino) : "não configurado"}</code></dd>
    <dt>Status</dt><dd><code>${statusCode}</code></dd>
    <dt>Atualizado</dt><dd>${escapar(atualizado)}</dd>
  </dl>
</body>
</html>`;
}
