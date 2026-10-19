#!/usr/bin/env bash
# register-webhook.sh
#
# Đăng ký webhook DIRECT_MESSAGE tới TikTok Business Messaging.
# Chạy 1 LẦN khi onboard app đầu tiên (cấp developer app, áp dụng cho
# mọi business đã authorize). KHÔNG chạy per-user.
#
# Việc 11 của plan `tiktok-business-messaging-integration.md`.
#
# Cách dùng:
#   1. Đảm bảo backend/.env đã có TIKTOK_APP_CLIENT_KEY,
#      TIKTOK_APP_CLIENT_SECRET, TIKTOK_WEBHOOK_CALLBACK_URL.
#   2. source backend/.env (hoặc set trực tiếp):
#        set -a; source backend/.env; set +a
#   3. Chạy: bash scripts/tiktok/register-webhook.sh
#
# Đăng ký lại (idempotent — ghi đè URL):
#   bash scripts/tiktok/register-webhook.sh --force
#
# Kiểm tra trạng thái webhook:
#   bash scripts/tiktok/register-webhook.sh --list

set -euo pipefail

# ── 1. Load env ────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/backend/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# ── 2. Validate required vars ─────────────────────────────────────
: "${TIKTOK_APP_CLIENT_KEY:?Lỗi: TIKTOK_APP_CLIENT_KEY chưa set trong $ENV_FILE}"
: "${TIKTOK_APP_CLIENT_SECRET:?Lỗi: TIKTOK_APP_CLIENT_SECRET chưa set trong $ENV_FILE}"
: "${TIKTOK_WEBHOOK_CALLBACK_URL:?Lỗi: TIKTOK_WEBHOOK_CALLBACK_URL chưa set trong $ENV_FILE}"
: "${TIKTOK_MESSAGE_API_BASE:=https://business-api.tiktok.com/open_api/v1.3}"

# ── 3. Parse args ─────────────────────────────────────────────────
ACTION="register"
[ "${1:-}" = "--list" ] && ACTION="list"
[ "${1:-}" = "--force" ] && ACTION="force"

# ── 4. Build request body ─────────────────────────────────────────
EVENT_TYPE="${TIKTOK_WEBHOOK_EVENT_TYPE:-DIRECT_MESSAGE}"

# ── 5. List mode ──────────────────────────────────────────────────
if [ "$ACTION" = "list" ]; then
  echo "==> List webhooks đã đăng ký trên TikTok:"
  curl -sS -X POST "${TIKTOK_MESSAGE_API_BASE}/business/webhook/get/" \
    -H 'Content-Type: application/json' \
    -d "{
      \"app_id\": \"$TIKTOK_APP_CLIENT_KEY\",
      \"secret\": \"$TIKTOK_APP_CLIENT_SECRET\"
    }" | (command -v jq >/dev/null && jq . || cat)
  exit 0
fi

# ── 5b. Preflight: kiểm tra URL webhook có reachable từ internet ──
echo "==> Preflight: kiểm tra $TIKTOK_WEBHOOK_CALLBACK_URL"
PREFLIGHT_BODY=$(curl -sS --max-time 10 \
  -X POST "$TIKTOK_WEBHOOK_CALLBACK_URL" \
  -H 'Content-Type: application/json' \
  -H 'TikTok-Signature: preflight' \
  -d '{"event":"DIRECT_MESSAGE","business_id":"preflight","content":"preflight check from register-webhook.sh","timestamp":'$(date +%s)'}' 2>/dev/null)
PREFLIGHT_CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 \
  -X POST "$TIKTOK_WEBHOOK_CALLBACK_URL" \
  -H 'Content-Type: application/json' \
  -H 'TikTok-Signature: preflight' \
  -d '{"event":"DIRECT_MESSAGE","business_id":"preflight","content":"preflight check from register-webhook.sh","timestamp":'$(date +%s)'}' 2>/dev/null || echo "000")

# Phân tích kết quả:
# - 200: handler TikTok nhận OK, tiếp tục
# - 400/401/403/422: handler CÓ nhưng từ chối body rỗng/preflight → tiếp tục
# - 404: server chưa có route (hoặc chưa deploy code) → DỪNG
# - 502/503/000: server không reachable → DỪNG
case "$PREFLIGHT_CODE" in
  200|400|401|403|422)
    echo "    OK (server trả HTTP $PREFLIGHT_CODE — route có, handler đang sống)"
    ;;
  404)
    echo ""
    echo "❌ Preflight fail: server trả HTTP 404 — route /tiktok-business CHƯA CÓ."
    echo "   Nguyên nhân: backend production chưa deploy code mới (tiktokBusinessWebhookController)."
    echo ""
    echo "   Deploy trước, rồi chạy lại lệnh này:"
    echo "     ssh prod 'cd /path/to/UKNOW && git pull && npm run migrate up && pm2 restart all'"
    echo "   Sau đó verify:"
    echo "     curl -i -X POST $TIKTOK_WEBHOOK_CALLBACK_URL -H 'Content-Type: application/json' -d '{}'"
    echo "   (phải trả 4xx, KHÔNG phải 404)"
    exit 1
    ;;
  *)
    echo ""
    echo "❌ Preflight fail: $TIKTOK_WEBHOOK_CALLBACK_URL trả HTTP $PREFLIGHT_CODE"
    echo "   Body: $PREFLIGHT_BODY"
    echo "   Nguyên nhân thường gặp:"
    echo "   - DNS chưa trỏ về server (kiểm tra: dig $TIKTOK_WEBHOOK_CALLBACK_URL)"
    echo "   - HTTPS cert chưa valid"
    echo "   - Firewall chặn IP TikTok"
    echo "   - Server quá tải / down"
    exit 1
    ;;
esac
echo ""

# ── 6. Register / Update mode ─────────────────────────────────────
echo "==> Đăng ký webhook $EVENT_TYPE → $TIKTOK_WEBHOOK_CALLBACK_URL"
RESPONSE=$(curl -sS -X POST "${TIKTOK_MESSAGE_API_BASE}/business/webhook/update/" \
  -H 'Content-Type: application/json' \
  -d "{
    \"app_id\": \"$TIKTOK_APP_CLIENT_KEY\",
    \"secret\": \"$TIKTOK_APP_CLIENT_SECRET\",
    \"event_type\": \"$EVENT_TYPE\",
    \"callback_url\": \"$TIKTOK_WEBHOOK_CALLBACK_URL\"
  }")

# ── 7. Print + check ──────────────────────────────────────────────
echo "$RESPONSE" | (command -v jq >/dev/null && jq . || cat)

CODE=$(echo "$RESPONSE" | (command -v jq >/dev/null && jq -r '.code' || echo "" 2>/dev/null) || true)
if [ "$CODE" = "0" ]; then
  echo ""
  echo "✅ Webhook đã đăng ký thành công."
  echo "   URL:   $TIKTOK_WEBHOOK_CALLBACK_URL"
  echo "   Event: $EVENT_TYPE"
  echo ""
  echo "==> Verify ngay (khi user nhắn tin từ TikTok):"
  echo "   tail -f backend/logs/webhook.log | grep tiktok"
  echo "   # hoặc:"
  echo "   bash scripts/tiktok/register-webhook.sh --list"
else
  echo ""
  echo "❌ Đăng ký thất bại. Kiểm tra:"
  echo "   - $TIKTOK_WEBHOOK_CALLBACK_URL có trỏ tới server UKNOW (HTTPS, public)?"
  echo "   - TIKTOK_APP_CLIENT_KEY / SECRET đúng chưa?"
  echo "   - App trên TikTok Developers đã bật product 'Business Messaging API' chưa?"
  echo "   - Region app cho phép Business Messaging chưa (APAC/LATAM/METAP/NA)?"
  exit 1
fi
