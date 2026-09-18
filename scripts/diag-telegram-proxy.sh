#!/usr/bin/env bash
# Diagnose trạng thái sau khi script trước bị ngắt giữa chừng.
set -uo pipefail

ENV_FILE="/root/uknow/backend/.env"
BACKUP_FILE_GLOB='/root/uknow/backend/.env.bak.*'

echo "=== 1. .env hiện tại ==="
grep -E '^TELEGRAM_PROXY_URL|^TELEGRAM_CONNECT_TIMEOUT_MS|^TELEGRAM_DC_WHITELIST' "$ENV_FILE" || echo "(missing)"
echo ""

echo "=== 2. Backup files ==="
ls -la $BACKUP_FILE_GLOB 2>/dev/null || echo "(no backups)"
echo ""

echo "=== 3. WARP có còn listen không ==="
ss -tln 2>/dev/null | grep ':40000' || echo "::error::port 40000 không listen"
echo ""

echo "=== 4. Container đang chạy + env đang nhận ==="
docker ps --filter "name=uknow-campaign-backend" --format 'table {{.Names}}\t{{.Status}}'
docker exec uknow-campaign-backend sh -c 'echo "PROXY=$TELEGRAM_PROXY_URL"' 2>&1 || echo "(exec fail — container có thể đang down)"
echo ""

echo "=== 5. Test TCP từ container tới gateway 172.19.0.1:40000 ==="
# Dùng Python3 (có sẵn trong node:20 alpine base) — không cần Alpine riêng.
docker exec uknow-campaign-backend sh -c '
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "import socket,sys; s=socket.socket(); s.settimeout(3)
try:
  s.connect((\"172.19.0.1\", 40000)); print(\"OK: connected to 172.19.0.1:40000\"); s.close()
except Exception as e:
  print(\"FAIL:\", e); sys.exit(1)"
  else
    echo "(no python3)"
  fi
' 2>&1
echo ""

echo "=== 6. Test TCP từ container tới Telegram DC trực tiếp (để biết có cần proxy không) ==="
docker exec uknow-campaign-backend sh -c '
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "import socket,sys; s=socket.socket(); s.settimeout(5)
try:
  s.connect((\"149.154.167.50\", 443)); print(\"OK: direct to 149.154.167.50:443\"); s.close()
except Exception as e:
  print(\"FAIL:\", e)"
  else
    echo "(no python3)"
  fi
' 2>&1
echo ""

echo "=== 7. Route từ container tới 172.19.0.1 ==="
docker exec uknow-campaign-backend sh -c 'ip route get 172.19.0.1 2>&1 || route -n 2>&1 | head -5'
echo ""

echo "=== Kết luận gợi ý ==="
echo "- Nếu (5) OK: .env phải trỏ về 172.19.0.1:40000 rồi restart container."
echo "- Nếu (5) FAIL và (6) OK: bỏ proxy, để TELEGRAM_PROXY_URL rỗng."
echo "- Nếu cả (5) FAIL và (6) FAIL: VPS bị firewall block cả WARP lẫn direct."
