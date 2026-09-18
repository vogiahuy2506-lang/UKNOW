#!/usr/bin/env bash
# Fix C: Sửa .env trỏ về gateway IP của uknow_network + restart.
# Đây là bước SỬA CUỐI CÙNG sau khi đã diagnose:
#   - WARP listen 127.0.0.1:40000 trên host (OK)
#   - Container CẦN trỏ về gateway IP của docker network để tới host loopback
#   - Gateway = 172.19.0.1 (đã verify)
#
# KHÔNG dùng `set -e` để mọi lỗi đều in ra rõ ràng, không thoát giữa chừng.

ENV_FILE="/root/uknow/backend/.env"
BACKUP_FILE="/root/uknow/backend/.env.bak.$(date +%Y%m%d-%H%M%S)"
CONTAINER="uknow-campaign-backend"

echo "=== Bước 1: Lấy gateway IP ==="
GATEWAY_IP="$(docker network inspect uknow_network --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' | tr -d '[:space:]')"
if [ -z "$GATEWAY_IP" ]; then
  echo "FAIL: không lấy được gateway IP"
  exit 1
fi
echo "Gateway = $GATEWAY_IP"
echo ""

echo "=== Bước 2: Backup .env ==="
if ! cp -a "$ENV_FILE" "$BACKUP_FILE"; then
  echo "FAIL: backup thất bại"
  exit 1
fi
echo "Backup tại: $BACKUP_FILE"
echo ""

echo "=== Bước 3: Sửa TELEGRAM_PROXY_URL trong .env ==="
NEW_URL="socks5://${GATEWAY_IP}:40000"
# Dùng sed -i trên file, không pipe (an toàn hơn)
sed -i "s|^TELEGRAM_PROXY_URL=.*|TELEGRAM_PROXY_URL=${NEW_URL}|" "$ENV_FILE"
echo "Sau khi sửa:"
grep "^TELEGRAM_PROXY_URL" "$ENV_FILE" || echo "(missing — check manually!)"
echo ""

echo "=== Bước 4: Restart container (stop + start để re-read env) ==="
docker stop "$CONTAINER"
sleep 2
docker start "$CONTAINER"
echo "Đợi 10s cho container sẵn sàng..."
sleep 10
echo ""

echo "=== Bước 5: Verify env trong container ==="
echo "--- env | grep TELEGRAM_PROXY_URL ---"
docker exec "$CONTAINER" sh -c 'env | grep TELEGRAM_PROXY_URL || echo "(not in env)"'
echo ""
echo "--- dotenv load test ---"
docker exec "$CONTAINER" sh -c 'node -e "require(\"dotenv\").config({override:false}); console.log(\"dotenv-loaded-PROXY=[\" + (process.env.TELEGRAM_PROXY_URL||\"EMPTY\") + \"]\")"'
echo ""

echo "=== Bước 6: Sanity check từ container tới gateway:40000 ==="
docker exec "$CONTAINER" sh -c '
  node -e "
    const net = require(\"net\");
    const s = net.connect({ host: \"'"$GATEWAY_IP"'\", port: 40000, timeout: 5000 });
    s.on(\"connect\", () => { console.log(\"OK: container reached gateway 40000\"); s.end(); });
    s.on(\"timeout\", () => { console.log(\"FAIL: timeout 5s\"); s.destroy(); });
    s.on(\"error\", (e) => { console.log(\"FAIL:\", e.code, e.message); });
  "
'
echo ""

echo "=== Bước 7: Container status ==="
docker ps --filter "name=$CONTAINER" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo ""

echo "=== DONE — giờ thử lại QR login trên web ==="
