#!/usr/bin/env bash
# Fix A: Container KHÔNG tới được WARP qua gateway 172.19.0.1:40000
# nhưng tới được Telegram DC trực tiếp.
# Action: tắt proxy, để TELEGRAM_PROXY_URL rỗng.
set -uo pipefail

ENV_FILE="/root/uknow/backend/.env"
BACKUP_FILE="/root/uknow/backend/.env.bak.$(date +%Y%m%d-%H%M%S)"

cp -a "$ENV_FILE" "$BACKUP_FILE"
echo "Backup: $BACKUP_FILE"

# Comment dòng proxy đi (giữ lại làm template, không xóa hẳn).
sed -i 's|^TELEGRAM_PROXY_URL=.*|#TELEGRAM_PROXY_URL=|' "$ENV_FILE"
echo "Đã comment TELEGRAM_PROXY_URL"
grep '^#TELEGRAM_PROXY_URL\|^TELEGRAM_PROXY_URL' "$ENV_FILE"

# Restart container.
docker restart uknow-campaign-backend
sleep 3

echo ""
echo "=== Verify env trong container ==="
docker exec uknow-campaign-backend sh -c 'echo "PROXY=$TELEGRAM_PROXY_URL"'
echo ""
echo "Sẵn sàng thử lại QR login trên web."
