#!/bin/bash
# backup-offsite.sh — chép bản pg_dump mới nhất ra GCS (ngoài VPS).
# Chạy trên host, cài bằng tay sau deploy. Cron dự kiến (sau backup-db.sh lúc 02:00):
#   30 2 * * * /root/uknow/backup-offsite.sh
# Không chứa bí mật: khoá GCS nằm trong env của container backend.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/uknow-db}"
CONTAINER="${BACKEND_CONTAINER:-uknow-campaign-backend}"
LOG_FILE="${LOG_FILE:-/root/uknow/logs/backup-offsite.log}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"

mkdir -p "$(dirname "$LOG_FILE")"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

latest="$(ls -1t "$BACKUP_DIR"/*.dump 2>/dev/null | head -n 1 || true)"
if [[ -z "$latest" ]]; then
  log "ERROR: khong tim thay file .dump trong $BACKUP_DIR"
  exit 1
fi

now="$(date +%s)"
mtime="$(stat -c %Y "$latest")"
age_hours=$(( (now - mtime) / 3600 ))
if (( age_hours > MAX_AGE_HOURS )); then
  log "ERROR: ban moi nhat $(basename "$latest") da ${age_hours}h (> ${MAX_AGE_HOURS}h) - backup-db.sh co the da hong"
  exit 1
fi

name="$(basename "$latest")"
log "Day $name len GCS..."
if result="$(docker exec -i "$CONTAINER" node -r dotenv/config scripts/uploadDbBackupToGcs.mjs "$name" < "$latest" 2>&1)"; then
  log "OK: $result"
else
  log "ERROR: upload that bai: $result"
  exit 1
fi
