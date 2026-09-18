#!/usr/bin/env bash
# Kiểm tra env thực sự trong container + mount points + history start.
set -uo pipefail

CONTAINER="uknow-campaign-backend"

echo "=== 1. Container details (mount + env) ==="
docker inspect "$CONTAINER" \
  --format '{{json .Mounts}}' \
  | head -100
echo ""

echo "=== 2. Env TELEGRAM_* thực sự trong container ==="
docker exec "$CONTAINER" sh -c 'env | grep -E "^TELEGRAM_" || echo "(no TELEGRAM_ env)"'
echo ""

echo "=== 3. dotenv đã load file nào? ==="
# App load qua 'dotenv/config' với default path .env (cwd của node).
# Trong container cwd là /app, và /app/.env được mount từ host.
# Kiểm tra:
docker exec "$CONTAINER" sh -c '
  if [ -f /app/.env ]; then
    echo "=== /app/.env exists, size ==="
    ls -la /app/.env
    echo "=== last 20 lines ==="
    tail -20 /app/.env
    echo "=== TELEGRAM_PROXY_URL in file ==="
    grep "^TELEGRAM_PROXY_URL" /app/.env || echo "(not found)"
  else
    echo "::error::/app/.env does NOT exist in container"
  fi
'
echo ""

echo "=== 4. Process tree + start command ==="
docker inspect "$CONTAINER" --format 'Cmd: {{json .Config.Cmd}}
Entrypoint: {{json .Config.Entrypoint}}
Image: {{.Config.Image}}
Created: {{.Created}}
Started: {{.State.StartedAt}}'
echo ""

echo "=== 5. So sánh MD5 host vs container ==="
HOST_MD5="$(md5sum /root/uknow/backend/.env 2>/dev/null | awk '{print $1}')"
CONTAINER_MD5="$(docker exec "$CONTAINER" sh -c 'md5sum /app/.env 2>/dev/null | awk "{print \$1}"' 2>/dev/null || echo "N/A")"
echo "Host   .env md5: $HOST_MD5"
echo "Container .env md5: $CONTAINER_MD5"
if [ "$HOST_MD5" = "$CONTAINER_MD5" ]; then
  echo "OK: file giống nhau"
else
  echo "::warning:: file KHÁC nhau — mount không đồng bộ?"
fi
echo ""

echo "=== 6. docker logs gần nhất (lọc TELEGRAM) ==="
docker logs "$CONTAINER" --tail 200 2>&1 | grep -iE "telegram|proxy|dotenv|env" | tail -30 || echo "(no relevant logs)"
