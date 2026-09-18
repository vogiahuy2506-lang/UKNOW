#!/usr/bin/env bash
# Pull entrypoint/Dockerfile từ image đang chạy để xem env handling.
set -uo pipefail
CONTAINER="uknow-campaign-backend"
IMG="$(docker inspect "$CONTAINER" --format '{{.Config.Image}}')"

echo "=== Image: $IMG ==="
echo ""
echo "=== 1. History của image (REQUIRES docker hub / registry auth) ==="
docker history "$IMG" --no-trunc 2>&1 | head -40
echo ""
echo "=== 2. Entrypoint + Cmd trong image config ==="
docker inspect "$IMG" --format 'Entrypoint: {{json .Config.Entrypoint}}
Cmd: {{json .Config.Cmd}}
Env (TELEGRAM only): {{json (index .Config.Env)}}
WorkingDir: {{.Config.WorkingDir}}
User: {{.Config.User}}'
echo ""
echo "=== 3. Tạo container tạm để đọc entrypoint script ==="
TMP_CID=$(docker create "$IMG" 2>&1)
echo "Temp container: $TMP_CID"
if docker ps -a --format '{{.ID}}' | grep -q "$TMP_CID"; then
  echo "--- docker-entrypoint.sh content (image) ---"
  docker cp "$TMP_CID:/docker-entrypoint.sh" - 2>/dev/null | head -50 || echo "(no /docker-entrypoint.sh)"
  echo ""
  echo "--- list / in image ---"
  docker run --rm --entrypoint sh "$IMG" -c 'ls -la / | head -30'
  echo ""
  echo "--- start.sh / entrypoint scripts ---"
  docker run --rm --entrypoint sh "$IMG" -c 'find / -maxdepth 3 -name "*entrypoint*" -o -name "start.sh" 2>/dev/null'
  docker rm -f "$TMP_CID" >/dev/null 2>&1 || true
fi
echo ""
echo "=== 4. Test thử load dotenv bằng node inline ==="
docker exec "$CONTAINER" sh -c 'node -e "require(\"dotenv\").config({override:true}); console.log(\"PROXY=\" + process.env.TELEGRAM_PROXY_URL)"'
echo ""
echo "=== 5. Test thử require dotenv/config + print ==="
docker exec "$CONTAINER" sh -c 'node -r dotenv/config -e "console.log(\"PROXY=[\" + (process.env.TELEGRAM_PROXY_URL||\"EMPTY\") + \"]\")"'
echo ""
echo "=== 6. Liệt kê env bắt đầu bằng 'T' ==="
docker exec "$CONTAINER" sh -c 'env | grep -E "^T" | sort'
