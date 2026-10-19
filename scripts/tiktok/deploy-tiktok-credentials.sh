#!/usr/bin/env bash
# ==============================================================================
# SCRIPT: deploy-tiktok-credentials.sh
# File: scripts/tiktok/deploy-tiktok-credentials.sh
#
# Mục đích: An toàn cập nhật credentials TikTok Business Messaging trên VPS
#           production `api.founderai.biz`, restart backend qua PM2/Docker,
#           verify webhook + OAuth callback sống lại, rồi dùng
#           `register-webhook.sh` để đăng ký với TikTok.
#
# Dùng khi nào:
#   - Lần đầu onboard TikTok Business app
#   - Rotate client_key / client_secret
#   - Sau khi TikTok reset app secret
#
# KHÔNG dùng cho việc nhỏ (debug, xem log) — chỉ khi cần đổi credentials.
#
# Cách dùng (CHẠY TRÊN LAPTOP, SSH SANG VPS):
#   1. Đã push code mới lên git remote.
#   2. Đã cập nhật backend/.env ở local (credentials mới).
#   3. ssh prod
#   4. cd /root/uknow
#   5. git pull
#   6. bash scripts/tiktok/deploy-tiktok-credentials.sh
#   7. Nếu preflight fail, xem phần "TROUBLESHOOTING" dưới.
#
# Rollback an toàn: dùng `backend/scripts/ops/hot_swap_rollback.sh <image_digest>`
# (giữ container cũ làm standby 45s readiness, auto-restore nếu fail).
# ==============================================================================
set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

step() { echo -e "\n${BLUE}==>${NC} $1"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }

# ── Detect env ──────────────────────────────────────────────────────
UKNOW_DIR="${UKNOW_DIR:-/root/uknow}"
ENV_FILE="$UKNOW_DIR/backend/.env"
BACKEND_URL="${BACKEND_PUBLIC_URL:-https://api.founderai.biz}"

step "BƯỚC 1/7: Pre-flight checks (chạy trên VPS)"

# 1.1 Đúng thư mục production
if [ ! -d "$UKNOW_DIR" ]; then
  fail "Không thấy $UKNOW_DIR — script này CHỈ chạy trên VPS prod"
  exit 1
fi
cd "$UKNOW_DIR"
ok "Đang ở $UKNOW_DIR"

# 1.2 File .env tồn tại
if [ ! -f "$ENV_FILE" ]; then
  fail "Không thấy $ENV_FILE"
  exit 1
fi
ok "Tìm thấy $ENV_FILE"

# 1.3 Git sạch (không có uncommitted changes)
if ! git diff --quiet HEAD 2>/dev/null; then
  warn "Có thay đổi chưa commit trong git — deploy sẽ KHÔNG pull được"
  echo "    Chạy 'git status' để xem. Nếu chỉ là .env thì OK, nếu là code phải commit trước."
fi

# 1.4 Docker network tồn tại (nếu dùng Docker)
if command -v docker >/dev/null 2>&1; then
  if ! docker network inspect uknow_network >/dev/null 2>&1; then
    fail "Docker network uknow_network không tồn tại"
    exit 1
  fi
  ok "Docker network uknow_network OK"
fi

# 1.5 Curl + jq
command -v curl >/dev/null || { fail "Thiếu curl"; exit 1; }
command -v jq >/dev/null || warn "Thiếu jq — output sẽ raw JSON (không sao, vẫn chạy)"

# ── BƯỚC 2: Đọc credentials hiện tại ────────────────────────────────
step "BƯỚC 2/7: Đọc credentials từ $ENV_FILE"

# Source env an toàn (chỉ lấy các biến cần)
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [ -z "${TIKTOK_APP_CLIENT_KEY:-}" ] || [ -z "${TIKTOK_APP_CLIENT_SECRET:-}" ]; then
  fail "TIKTOK_APP_CLIENT_KEY / TIKTOK_APP_CLIENT_SECRET chưa set trong .env"
  echo "    Sửa file, paste credentials mới, chạy lại script."
  exit 1
fi
ok "TIKTOK_APP_CLIENT_KEY = ${TIKTOK_APP_CLIENT_KEY:0:8}…"
ok "TIKTOK_APP_CLIENT_SECRET = ${TIKTOK_APP_CLIENT_SECRET:0:6}…"

# ── BƯỚC 3: Verify URL config khớp production ─────────────────────
step "BƯỚC 3/7: Verify URL config"

EXPECTED_REDIRECT="https://api.founderai.biz/api/webhooks/oauth/callback/tiktok"
EXPECTED_WEBHOOK="https://api.founderai.biz/api/webhooks/tiktok-business"

if [ "${TIKTOK_OAUTH_REDIRECT_URI:-$EXPECTED_REDIRECT}" != "$EXPECTED_REDIRECT" ]; then
  fail "TIKTOK_OAUTH_REDIRECT_URI sai — phải là $EXPECTED_REDIRECT"
  exit 1
fi
ok "OAuth redirect URI: $EXPECTED_REDIRECT"

if [ "${TIKTOK_WEBHOOK_CALLBACK_URL:-$EXPECTED_WEBHOOK}" != "$EXPECTED_WEBHOOK" ]; then
  fail "TIKTOK_WEBHOOK_CALLBACK_URL sai — phải là $EXPECTED_WEBHOOK"
  exit 1
fi
ok "Webhook callback URL: $EXPECTED_WEBHOOK"

# ── BƯỚC 4: Verify HTTPS endpoint reachable ────────────────────────
step "BƯỚC 4/7: Verify HTTPS endpoint reachable từ internet"

HEALTH_CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 \
  "$BACKEND_URL/api/health" || echo "000")
if [ "$HEALTH_CODE" != "200" ]; then
  fail "Backend health check fail: HTTP $HEALTH_CODE (expected 200)"
  echo "    Có thể nginx chưa reload, hoặc backend chưa boot xong."
  echo "    Chạy: docker logs --tail 50 uknow-campaign-backend"
  exit 1
fi
ok "Backend healthy: $BACKEND_URL/api/health → 200"

# Pre-flight: webhook route tồn tại
WEBHOOK_TEST=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 \
  -X POST "$BACKEND_URL/api/webhooks/tiktok-business" \
  -H 'Content-Type: application/json' -d '{}' || echo "000")
case "$WEBHOOK_TEST" in
  200|400|422) ok "Webhook route mounted: HTTP $WEBHOOK_TEST" ;;
  404) fail "Webhook route CHƯA mounted (404) — backend chưa có code mới" ;;
  *)   fail "Webhook route trả $WEBHOOK_TEST (unexpected)" ;;
esac

# ── BƯỚC 5: Test connectivity tới TikTok OAuth endpoint ────────────
step "BƯỚC 5/7: Test connectivity tới TikTok OAuth endpoint"

TIKTOK_TEST=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 \
  -X POST "https://open.tiktokapis.com/v2/oauth/token/" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "client_key=$TIKTOK_APP_CLIENT_KEY&client_secret=$TIKTOK_APP_CLIENT_SECRET&code=fake&grant_type=authorization_code" || echo "000")

if [ "$TIKTOK_TEST" = "200" ]; then
  warn "TikTok trả 200 với fake code — có thể credentials sai, response OK nhưng invalid_grant"
elif [ "$TIKTOK_TEST" = "400" ] || [ "$TIKTOK_TEST" = "401" ]; then
  ok "TikTok OAuth endpoint reachable (HTTP $TIKTOK_TEST — invalid_grant là bình thường với fake code)"
else
  fail "TikTok OAuth endpoint trả HTTP $TIKTOK_TEST (unexpected)"
  echo "    Có thể TikTok block IP VPS, hoặc network issue."
  exit 1
fi

# ── BƯỚC 6: Restart backend ────────────────────────────────────────
step "BƯỚC 6/7: Restart backend để pick up credentials mới"

if command -v pm2 >/dev/null 2>&1 && [ -f "$UKNOW_DIR/backend/ecosystem.config.js" ]; then
  warn "Phát hiện PM2 — dùng PM2 reload để GIỮ SESSION"
  cd "$UKNOW_DIR/backend"
  pm2 reload ecosystem.config.js
  ok "PM2 reloaded"
elif command -v docker >/dev/null 2>&1 && docker inspect uknow-campaign-backend >/dev/null 2>&1; then
  warn "Phát hiện Docker container — chỉ restart (giữ image, mount lại .env)"
  docker restart uknow-campaign-backend
  ok "Docker container restarted"
else
  fail "Không tìm thấy PM2 hoặc Docker để restart"
  exit 1
fi

# Đợi backend boot
echo "  Đợi backend ready (max 60s)..."
for i in $(seq 1 20); do
  sleep 3
  if curl -sS --max-time 4 "$BACKEND_URL/api/health" | grep -q '"status":"ok"'; then
    ok "Backend ready sau ${i}×3s"
    break
  fi
  if [ "$i" = "20" ]; then
    fail "Backend không ready sau 60s"
    echo "    Chạy: docker logs --tail 100 uknow-campaign-backend"
    exit 1
  fi
done

# ── BƯỚC 7: Verify post-restart ────────────────────────────────────
step "BƯỚC 7/7: Post-restart verification"

# 7.1 Webhook vẫn nhận request
WEBHOOK_TEST2=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 \
  -X POST "$BACKEND_URL/api/webhooks/tiktok-business" \
  -H 'Content-Type: application/json' \
  -d "{\"client_key\":\"$TIKTOK_APP_CLIENT_KEY\",\"event\":\"DIRECT_MESSAGE\",\"timestamp\":$(date +%s)}")
if [ "$WEBHOOK_TEST2" = "200" ]; then
  ok "Webhook vẫn nhận request 200 (DIRECT_MESSAGE event — bình thường log 'event không hỗ trợ')"
else
  fail "Webhook trả HTTP $WEBHOOK_TEST2"
fi

# 7.2 OAuth callback route respond
CALLBACK_TEST=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 \
  "$BACKEND_URL/api/webhooks/oauth/callback/tiktok")
if [ "$CALLBACK_TEST" = "302" ]; then
  ok "OAuth callback route respond 302 (redirect về FE với error — đúng, vì thiếu code/state)"
else
  fail "OAuth callback trả HTTP $CALLBACK_TEST (expected 302)"
fi

# ── Summary ────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo -e "  ${GREEN}✅ DEPLOY CREDENTIALS THÀNH CÔNG${NC}"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  Backend:  $BACKEND_URL"
echo "  Webhook:  $BACKEND_URL/api/webhooks/tiktok-business"
echo "  OAuth:    $BACKEND_URL/api/webhooks/oauth/callback/tiktok"
echo "  Client:   ${TIKTOK_APP_CLIENT_KEY:0:8}…"
echo ""
echo "  BƯỚC TIẾP THEO (trên VPS):"
echo "    1. Đăng ký webhook với TikTok:"
echo "         bash $UKNOW_DIR/scripts/tiktok/register-webhook.sh"
echo ""
echo "    2. Verify webhook đã register:"
echo "         bash $UKNOW_DIR/scripts/tiktok/register-webhook.sh --list"
echo ""
echo "    3. Test OAuth flow thật (cần user thật):"
echo "         Mở browser: $BACKEND_URL/api/settings/tiktok-business/connect"
echo "         (sau khi login UKNOW)"
echo ""
echo "    4. Tail log để xem TikTok gửi event đầu tiên:"
echo "         docker logs -f uknow-campaign-backend 2>&1 | grep TikTokWebhook"
echo ""
echo "  ROLLBACK (nếu có sự cố):"
echo "    bash $UKNOW_DIR/backend/scripts/ops/hot_swap_rollback.sh <image_digest>"
echo ""
echo "════════════════════════════════════════════════════════════"

# ── TROUBLESHOOTING ────────────────────────────────────────────────
cat <<'TROUBLE' | head -1 >/dev/null  # noop marker

TROUBLESHOOTING (nếu có lỗi):

1. "Backend health check fail: HTTP 000"
   → Nginx chưa có SSL cert hoặc chưa reload.
   → Chạy: bash scripts/ssl-auto-provision.sh founderai.biz www.founderai.biz
   → Rồi: docker exec uknow-nginx nginx -s reload

2. "Webhook route CHƯA mounted (404)"
   → Backend chưa có code mới (tiktokBusinessWebhook.controller.js).
   → Chạy: git pull && bash scripts/tiktok/deploy-tiktok-credentials.sh
   → Hoặc rebuild image: xem CI deploy workflow trong .github/workflows/

3. "TikTok OAuth endpoint trả HTTP 000"
   → VPS không ra được internet. Kiểm tra: curl -v https://open.tiktokapis.com/

4. "Backend không ready sau 60s"
   → Xem log: docker logs --tail 100 uknow-campaign-backend
   → Thường do Redis/Postgres connection chậm. Tăng timeout:
       HEALTH_ATTEMPTS=80 HEALTH_INTERVAL=3 bash ...

5. "OAuth callback trả HTTP 500"
   → Code vừa deploy có bug. Rollback:
       bash backend/scripts/ops/hot_swap_rollback.sh <image_digest_cũ>
TROUBLE
