#!/usr/bin/env bash
# Monitor externo — RODE FORA DA VPS (outra máquina, um Pi, um free tier).
# Checa os dois domínios e avisa no Telegram / webhook quando algo cai ou volta.
#
# Guarda o último estado em /tmp para só alertar na MUDANÇA (não spammar).
#
# Config por env:
#   SITE_URL=https://portal.faturaclaros.com
#   REDIRECT_URL=https://fatura-claro.com
#   TELEGRAM_BOT_TOKEN=123:abc         (crie com @BotFather)
#   TELEGRAM_CHAT_ID=123456            (seu id — pergunte a @userinfobot)
#   ALERT_WEBHOOK=https://...          (alternativa/adicional ao Telegram)
#   FALHAS_P_ALERTA=2                  (checagens ruins seguidas antes de alertar)
#
# Cron sugerido (a cada minuto):
#   * * * * * SITE_URL=... TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... /caminho/healthcheck-externo.sh
set -uo pipefail

SITE_URL="${SITE_URL:-https://portal.faturaclaros.com}"
REDIRECT_URL="${REDIRECT_URL:-https://fatura-claro.com}"
FALHAS_P_ALERTA="${FALHAS_P_ALERTA:-2}"
STATE_DIR="${STATE_DIR:-/tmp/claros-healthcheck}"
mkdir -p "$STATE_DIR"

notificar() {
  local msg="$1"
  if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]]; then
    curl -s -m 10 -o /dev/null \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=${msg}" || true
  fi
  if [[ -n "${ALERT_WEBHOOK:-}" ]]; then
    curl -s -m 10 -o /dev/null -H 'content-type: application/json' \
      -d "{\"text\":$(printf '%s' "$msg" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}" \
      "$ALERT_WEBHOOK" || true
  fi
  echo "$(date '+%F %T')  ALERTA: $msg"
}

# $1 nome  $2 url  $3 modo (health|redirect|http)
checar() {
  local nome="$1" url="$2" modo="$3"
  local ok=1 detalhe=""
  case "$modo" in
    health)
      local body
      body="$(curl -s -m 15 "$url/api/health" || true)"
      if ! grep -q '"ok":true' <<<"$body"; then ok=0; detalhe="/api/health = ${body:-timeout}"; fi
      ;;
    redirect)
      local code
      code="$(curl -s -m 15 -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' -o /dev/null -w '%{http_code}' "$url/" || true)"
      if [[ "$code" != 30[128] ]]; then ok=0; detalhe="HTTP $code (esperado 30x)"; fi
      ;;
    http)
      local code
      code="$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$url/" || true)"
      if [[ "$code" != 200 ]]; then ok=0; detalhe="HTTP $code"; fi
      ;;
  esac

  local sf="$STATE_DIR/$nome.fails" ss="$STATE_DIR/$nome.state"
  local fails; fails="$(cat "$sf" 2>/dev/null || echo 0)"
  local estado; estado="$(cat "$ss" 2>/dev/null || echo up)"

  if [[ $ok -eq 1 ]]; then
    echo 0 > "$sf"
    if [[ "$estado" == down ]]; then
      echo up > "$ss"
      notificar "✅ $nome VOLTOU ($url)"
    fi
  else
    fails=$((fails + 1)); echo "$fails" > "$sf"
    if [[ "$estado" == up && $fails -ge $FALHAS_P_ALERTA ]]; then
      echo down > "$ss"
      notificar "🔴 $nome CAIU ($url) — $detalhe — $fails falhas seguidas"
    fi
  fi
}

checar "site"     "$SITE_URL"     health
checar "redirect" "$REDIRECT_URL" redirect
