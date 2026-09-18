#!/usr/bin/env bash
# Fix B: Container tới được WARP qua gateway nhưng .env chưa được áp dụng.
# Action: set .env đúng + restart.
set -uo pipefail

ENV_FILE="/root/uknow/backend/.env"
BACKUP_FILE="/root/uknow/backend/.env.bak.$(date +%Y%m%d-%H%M%S)"

cp -a "$ENV_FILE" "$BACKUP_FILE"
echo "Backup: $BACKUP_FILE"

GATEWAY_IP="$(docker network inspect uknow_network --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' | tr -d '[:space:]')"
echo "Gateway: $GATEWAY_IP"

sed -i "s|^TELEGRAM_PROXY_URL=.*|TELEGRAM_PROXY_URL=socks5://${GATEWAY_IP}:40000|" "$ENV_FILE"
sed -i "s|^#TELEGRAM_PROXY_URL=.*|TELEGRAM_PROXY_URL=socks5://${GATEWAY_IP}:40000|" "$ENV_FILE"
echo "Set TELEGRAM_PROXY_URL=socks5://${GATEWAY_IP}:40000"
grep '^TELEGRAM_PROXY_URL=' "$ENV_FILE"

docker restart uknow-campaign-backend
sleep 3

echo ""
echo "=== Verify env trong container ==="
docker exec uknow-campaign-backend sh -c 'echo "PROXY=$TELEGRAM_PROXY_URL"'
echo ""
echo "Sẵn sàng thử lại QR login trên web."
