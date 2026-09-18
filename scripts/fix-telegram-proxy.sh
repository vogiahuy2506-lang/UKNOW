#!/usr/bin/env bash
# Fix Telegram proxy ECONNREFUSED 127.0.0.1:40000 trong container
# Root cause: backend container không nhìn thấy WARP SOCKS5 trên host VPS
# (127.0.0.1 trong container = container đó, không phải host).
#
# Chạy script này TRÊN VPS với quyền root (ssh root@<vps> rồi bash fix.sh).
set -euo pipefail

ENV_FILE="/root/uknow/backend/.env"
BACKUP_FILE="/root/uknow/backend/.env.bak.$(date +%Y%m%d-%H%M%S)"

if [ ! -f "$ENV_FILE" ]; then
  echo "::error::Không tìm thấy $ENV_FILE"
  exit 1
fi

echo "=== 1. Lấy gateway IP của uknow_network ==="
# User-defined bridge: gateway mặc định là .1 của subnet (vd 172.18.0.1/16).
# Container có thể đi qua gateway đó để tới host port.
GATEWAY_IP="$(docker network inspect uknow_network --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' | tr -d '[:space:]')"

if [ -z "$GATEWAY_IP" ]; then
  echo "::error::Không lấy được gateway IP (uknow_network có tồn tại không?)"
  echo "Liệt kê networks:"
  docker network ls | grep uknow || true
  exit 1
fi
echo "Gateway của uknow_network: $GATEWAY_IP"

echo ""
echo "=== 2. Kiểm tra WARP có listen ở 40000 trên host không ==="
if ss -tln 2>/dev/null | grep -q ':40000'; then
  echo "OK: port 40000 đang listen trên host"
else
  echo "::warning::port 40000 KHÔNG thấy listen — WARP có đang chạy không?"
  echo "  ss -tln | grep 40000"
  echo "  systemctl status warp-svc warp-taskbar  (hoặc service name bạn dùng)"
  echo ""
  read -rp "Bạn vẫn muốn tiếp tục đổi .env? [y/N] " ans
  case "$ans" in
    [yY]|[yY][eE][sS]) ;;
    *) echo "Hủy."; exit 1 ;;
  esac
fi

echo ""
echo "=== 3. Test tới WARP từ chính host (sanity check) ==="
if curl -sS -m 5 --socks5-hostname 127.0.0.1:40000 https://api.telegram.org >/dev/null 2>&1; then
  echo "OK: host tới được Telegram qua WARP"
else
  echo "::warning::host KHÔNG tới được Telegram qua WARP — kiểm tra WARP trước khi restart"
fi

echo ""
echo "=== 4. Backup .env hiện tại ==="
cp -a "$ENV_FILE" "$BACKUP_FILE"
echo "Backup: $BACKUP_FILE"

echo ""
echo "=== 5. Đổi TELEGRAM_PROXY_URL trong .env ==="
# Tìm dòng TELEGRAM_PROXY_URL=... rồi thay bằng IP gateway vừa lấy.
# Dùng delimiter khác '|' vì URL có '/'.
if grep -q '^TELEGRAM_PROXY_URL=' "$ENV_FILE"; then
  # sed -i in-place: thay nguyên dòng
  sed -i.bak "s|^TELEGRAM_PROXY_URL=.*|TELEGRAM_PROXY_URL=socks5://${GATEWAY_IP}:40000|" "$ENV_FILE"
  echo "Đã sửa TELEGRAM_PROXY_URL → socks5://${GATEWAY_IP}:40000"
else
  echo "::error::Không thấy dòng TELEGRAM_PROXY_URL trong $ENV_FILE"
  exit 1
fi

echo ""
echo "=== 6. Verify trước khi restart ==="
grep '^TELEGRAM_PROXY_URL=' "$ENV_FILE"

echo ""
echo "=== 7. Test từ trong container tới gateway:40000 ==="
# Chạy container tạm cùng network uknow_network để kiểm tra kết nối TCP.
if docker run --rm --network uknow_network alpine:latest \
     sh -c "nc -zv -w 3 $GATEWAY_IP 40000" 2>&1 | tee /tmp/proxy_test.log | grep -q -i 'open\|succeeded'; then
  echo "OK: container tới được ${GATEWAY_IP}:40000"
else
  echo "::error::Container KHÔNG tới được ${GATEWAY_IP}:40000"
  echo "Log:"
  cat /tmp/proxy_test.log
  echo ""
  echo "Khôi phục .env cũ:"
  cp -a "$BACKUP_FILE" "$ENV_FILE"
  exit 1
fi

echo ""
echo "=== 8. Restart container backend ==="
# Mirror logic của deploy-backend.yml: đổi tên + stop container cũ, start mới.
# Nhưng đây chỉ là đổi ENV → không cần swap cả image. Đơn giản nhất: recreate.
docker compose -f /root/uknow/docker-compose.yml up -d uknow-campaign-backend 2>/dev/null \
  || docker-compose -f /root/uknow/docker-compose.yml up -d uknow-campaign-backend 2>/dev/null \
  || {
    echo "Không tìm thấy docker-compose.yml — restart container thủ công:"
    echo "  docker restart uknow-campaign-backend"
    docker restart uknow-campaign-backend
  }

echo ""
echo "=== 9. Verify env trong container sau restart ==="
sleep 3
docker exec uknow-campaign-backend sh -c 'echo "TELEGRAM_PROXY_URL=$TELEGRAM_PROXY_URL"' \
  || echo "::warning::không exec được — container đang restart"

echo ""
echo "=== Hoàn tất ==="
echo "Thử lại trên web: Settings → Telegram → Start QR Login"
echo "Nếu vẫn 504, chạy:"
echo "  docker logs uknow-campaign-backend --tail 100 | grep -i 'proxy\\|telegram\\|504'"
