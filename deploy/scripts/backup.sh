#!/usr/bin/env bash
# Backup dos dois bancos (claros + redirect) para /root/backups, com rotação.
# Opcionalmente envia off-site por rclone se RCLONE_REMOTE estiver setado.
#
# Uso: deploy/scripts/backup.sh
# Cron sugerido (a cada 6h):
#   0 */6 * * * /root/claros/deploy/scripts/backup.sh >> /root/backups/backup.log 2>&1
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/claros-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"
cd "$DEPLOY_DIR"

# pg_dumpall pega os dois bancos + roles numa tacada.
docker compose exec -T db pg_dumpall -U claros | gzip > "$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"
echo "$(date '+%F %T')  ok  $FILE  ($SIZE)"

# Rotação local.
find "$BACKUP_DIR" -name 'claros-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

# Off-site opcional (rclone). Configure um remote e exporte:
#   RCLONE_REMOTE="b2:claros-backups"   (ou s3:, drive:, etc.)
if [[ -n "${RCLONE_REMOTE:-}" ]] && command -v rclone >/dev/null; then
  rclone copy "$FILE" "$RCLONE_REMOTE/" --quiet \
    && echo "$(date '+%F %T')  off-site ok  $RCLONE_REMOTE/$(basename "$FILE")" \
    || echo "$(date '+%F %T')  off-site FALHOU"
fi
