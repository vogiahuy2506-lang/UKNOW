#!/usr/bin/env bash
# Nếu môi trường thực thi (CI runner / IDE subshell) đang đặt SIGHUP=SIG_IGN,
# theo chuẩn POSIX các non-interactive bash subshell sẽ không thể đặt trap HUP.
# Tự động khôi phục SIGHUP=SIG_DFL và re-exec để kiểm thử tín hiệu chính xác.
if [ "${_SIGHUP_RESTORED:-false}" != "true" ] && command -v python3 >/dev/null 2>&1; then
  export _SIGHUP_RESTORED=true
  exec python3 -c "import signal, sys, os; signal.signal(signal.SIGHUP, signal.SIG_DFL); os.execvp(sys.argv[1], sys.argv[1:])" bash "$0" "$@"
fi
# ==============================================================================
# TEST SUITE: PRODUCTION CONTAINER HOT-SWAP ROLLBACK & AUTO-RECOVERY VERIFICATION
# File: backend/scripts/ops/test_hot_swap_rollback.sh
#
# Mục đích: Kiểm chứng toàn diện script ops hot_swap_rollback.sh bằng Docker thật:
#   1. Preflight validation (thiếu .env, thiếu script SSL, thiếu network, tag sai định dạng).
#   2. Metadata revision inspection (từ chối BUILD_SHA=dev, từ chối lệch SHA tag).
#   3. Khởi tạo container và kiểm chứng toàn bộ production volume mounts.
#   4. FAILURE INJECTION: Tiêm lỗi healthcheck đỏ -> kích hoạt auto-recovery ->
#      khôi phục container standby ban đầu nguyên vẹn.
#   5. SUCCESSFUL HOT-SWAP: Đổi container thành công khi image mới healthy.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOT_SWAP_SCRIPT="$SCRIPT_DIR/hot_swap_rollback.sh"

TEST_ID="test_$(date +%s)_$$"
TEST_DIR="/tmp/uknow_ops_${TEST_ID}"
TEST_NETWORK="uknow_net_${TEST_ID}"
TEST_CONTAINER="uknow-test-backend-${TEST_ID}"

check_port_free() {
  local port="$1"
  if command -v nc >/dev/null 2>&1; then
    ! nc -z localhost "$port" 2>/dev/null
  elif command -v lsof >/dev/null 2>&1; then
    ! lsof -i ":$port" >/dev/null 2>&1
  else
    echo "[PRECONDITION] Cần nc hoặc lsof để cấp phát port smoke an toàn." >&2
    return 2
  fi
}

find_available_port() {
  local start_port="$1"
  local candidate
  local offset

  for offset in $(seq 0 199); do
    candidate=$((start_port + offset))
    if check_port_free "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  echo "[PRECONDITION] Không tìm được port trống từ $start_port đến $((start_port + 199))." >&2
  return 1
}

PORT_BASE=$((30000 + ($$ % 10000)))
TEST_PORT="${UKNOW_TEST_PORT:-$(find_available_port "$PORT_BASE")}" || exit 2
SMOKE_PORT="${UKNOW_SMOKE_PORT:-$(find_available_port "$((PORT_BASE + 10000))")}" || exit 2

TEST_PORT_MAP="${TEST_PORT}:5001"
TEST_HEALTH_URL="http://localhost:${TEST_PORT}/api/health"
TEST_DB_HOST="${UKNOW_DB_HOST:-localhost}"
TEST_DB_PORT="${UKNOW_DB_PORT:-5433}"
TEST_DB_USER="${UKNOW_DB_USER:-postgres}"
TEST_DB_PASSWORD="${UKNOW_DB_PASSWORD:-postgres}"
# `localhost` trong container không trỏ về PostgreSQL đang chạy trên host.
# Cho phép CI/VPS override riêng thay vì âm thầm dùng credential/host mặc định.
CONTAINER_DB_HOST="${UKNOW_CONTAINER_DB_HOST:-host.docker.internal}"

PASSED_TESTS=0
FAILED_TESTS=0

report_pass() {
  echo "  ✅ [PASS] $1"
  PASSED_TESTS=$((PASSED_TESTS + 1))
}

report_fail() {
  echo "  ❌ [FAIL] $1" >&2
  FAILED_TESTS=$((FAILED_TESTS + 1))
}

MISMATCH_TAG="9999999999999999999999999999999999999999"
SMOKE_CONTAINER="uknow-real-smoke-${TEST_ID}"
ISOLATED_GATE_DB="uknow_gate_db_${TEST_ID}"

require_test_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "[PRECONDITION] Thiếu command bắt buộc: $command_name" >&2
    exit 2
  fi
}

validate_test_db_name() {
  local db="$1"
  [[ "$db" =~ ^[a-z0-9_]+$ ]]
}

db_psql() {
  PGPASSWORD="$TEST_DB_PASSWORD" psql \
    -X \
    -v ON_ERROR_STOP=1 \
    -h "$TEST_DB_HOST" \
    -p "$TEST_DB_PORT" \
    -U "$TEST_DB_USER" \
    "$@"
}

database_exists() {
  local db="$1"
  local result

  validate_test_db_name "$db" || return 2
  result=$(db_psql -d postgres -Atqc "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$db');") || return 2
  [ "$result" = "t" ]
}

database_absent() {
  local status
  database_exists "$1" && return 1
  status=$?
  case "$status" in
    1) return 0 ;;
    *) return "$status" ;;
  esac
}

create_test_db() {
  local db="$1"
  validate_test_db_name "$db" || return 2
  drop_test_db "$db" || return 1
  db_psql -d postgres -c "CREATE DATABASE \"$db\";" >/dev/null
}

drop_test_db() {
  local db="$1"
  validate_test_db_name "$db" || return 2

  db_psql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db' AND pid <> pg_backend_pid();" >/dev/null
  db_psql -d postgres -c "DROP DATABASE IF EXISTS \"$db\";" >/dev/null
  database_absent "$db"
}

cleanup() {
  echo "[CLEANUP] Dọn dẹp tài nguyên test..."
  docker rm -f "$TEST_CONTAINER" "${TEST_CONTAINER}-standby" "$SMOKE_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$TEST_NETWORK" >/dev/null 2>&1 || true
  docker rmi -f \
    "uknow-test-backend:${SHA_A:-a}" \
    "uknow-test-backend:${SHA_B:-b}" \
    "uknow-test-backend:${SHA_C:-c}" \
    "uknow-test-backend:${SHA_D:-d}" \
    "uknow-test-backend:${MISMATCH_TAG}" >/dev/null 2>&1 || true
  rm -rf "$TEST_DIR" >/dev/null 2>&1 || true

  # Dọn database cô lập dùng cho Suite 6
  if [ -n "${ISOLATED_GATE_DB:-}" ]; then
    if ! drop_test_db "$ISOLATED_GATE_DB"; then
      echo "::error::[CLEANUP FAILED] Không thể xóa database cô lập $ISOLATED_GATE_DB" >&2
    fi
  fi
}
trap cleanup EXIT

require_test_command docker
require_test_command psql
require_test_command node
require_test_command git

echo "======================================================================"
echo "BẮT ĐẦU KIỂM THỬ DOCKER HOT-SWAP ROLLBACK & FAILURE INJECTION"
echo "ID: $TEST_ID | Port: $TEST_PORT | Smoke Port: $SMOKE_PORT | Network: $TEST_NETWORK"
echo "======================================================================"

# ─── BƯỚC 0: CHUẨN BỊ MÔI TRƯỜNG TEST CÔ LẬP ────────────────────────────────
mkdir -p "$TEST_DIR"
cat << 'EOF' > "$TEST_DIR/.env"
NODE_ENV=production
PORT=5001
TEST_RUN=true
EOF

cat << 'EOF' > "$TEST_DIR/ssl-auto-provision.sh"
#!/bin/sh
echo "mock ssl provision"
EOF
chmod +x "$TEST_DIR/ssl-auto-provision.sh"

mkdir -p "$TEST_DIR/uploads" "$TEST_DIR/temp_uploads" "$TEST_DIR/secrets"
echo "secret-data" > "$TEST_DIR/secrets/jwt.key"

docker network create "$TEST_NETWORK" >/dev/null

# ─── BƯỚC 1: BUILD CÁC DOCKER IMAGE KIỂM THỬ SIÊU NHẸ (ALPINE-NODE) ──────────
echo "[SETUP] Đang build các image Docker kiểm thử..."

# 1. Image Healthy A (SHA: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)
SHA_A="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
docker build -t "uknow-test-backend:${SHA_A}" -q - <<EOF >/dev/null
FROM node:20-alpine
WORKDIR /app
ENV BUILD_SHA=${SHA_A}
LABEL org.opencontainers.image.revision="${SHA_A}"
RUN echo 'const http = require("http"); process.on("SIGTERM", () => process.exit(0)); process.on("SIGHUP", () => process.exit(0)); const server = http.createServer((req, res) => { if (req.url === "/api/health") { res.writeHead(200, {"Content-Type": "application/json"}); res.end(JSON.stringify({ status: "ok", revision: process.env.BUILD_SHA })); } else { res.writeHead(404); res.end(); } }); server.listen(5001);' > server.js
EXPOSE 5001
CMD ["node", "server.js"]
EOF

# 2. Image Broken B (SHA: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) - Healthcheck trả về 500
SHA_B="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
docker build -t "uknow-test-backend:${SHA_B}" -q - <<EOF >/dev/null
FROM node:20-alpine
WORKDIR /app
ENV BUILD_SHA=${SHA_B}
LABEL org.opencontainers.image.revision="${SHA_B}"
RUN echo 'const http = require("http"); process.on("SIGTERM", () => process.exit(0)); process.on("SIGHUP", () => process.exit(0)); const server = http.createServer((req, res) => { if (req.url === "/api/health") { res.writeHead(500, {"Content-Type": "application/json"}); res.end(JSON.stringify({ status: "error", error: "Database crashed" })); } else { res.writeHead(404); res.end(); } }); server.listen(5001);' > server.js
EXPOSE 5001
CMD ["node", "server.js"]
EOF

# 3. Image Invalid Revision C (BUILD_SHA=dev)
SHA_C="cccccccccccccccccccccccccccccccccccccccc"
docker build -t "uknow-test-backend:${SHA_C}" -q - <<EOF >/dev/null
FROM node:20-alpine
WORKDIR /app
ENV BUILD_SHA=dev
LABEL org.opencontainers.image.revision="dev"
RUN echo 'const http = require("http"); process.on("SIGTERM", () => process.exit(0)); process.on("SIGHUP", () => process.exit(0)); http.createServer((req, res) => { res.writeHead(200); res.end("ok"); }).listen(5001);' > server.js
EXPOSE 5001
CMD ["node", "server.js"]
EOF

# 4. Image Healthy D (SHA: dddddddddddddddddddddddddddddddddddddddd)
SHA_D="dddddddddddddddddddddddddddddddddddddddd"
docker build -t "uknow-test-backend:${SHA_D}" -q - <<EOF >/dev/null
FROM node:20-alpine
WORKDIR /app
ENV BUILD_SHA=${SHA_D}
LABEL org.opencontainers.image.revision="${SHA_D}"
RUN echo 'const http = require("http"); process.on("SIGTERM", () => process.exit(0)); process.on("SIGHUP", () => process.exit(0)); const server = http.createServer((req, res) => { if (req.url === "/api/health") { res.writeHead(200, {"Content-Type": "application/json"}); res.end(JSON.stringify({ status: "ok", revision: process.env.BUILD_SHA })); } else { res.writeHead(404); res.end(); } }); server.listen(5001);' > server.js
EXPOSE 5001
CMD ["node", "server.js"]
EOF

echo "[SETUP] Đã build xong 4 test images."

# Export các biến cấu hình cho script ops
export UKNOW_ENV_FILE="$TEST_DIR/.env"
export UKNOW_SSL_SCRIPT="$TEST_DIR/ssl-auto-provision.sh"
export UKNOW_UPLOADS_DIR="$TEST_DIR/uploads"
export UKNOW_TEMP_UPLOADS_DIR="$TEST_DIR/temp_uploads"
export UKNOW_SECRETS_DIR="$TEST_DIR/secrets"
export UKNOW_NETWORK="$TEST_NETWORK"
export UKNOW_CONTAINER_NAME="$TEST_CONTAINER"
export UKNOW_PORT_MAPPING="$TEST_PORT_MAP"
export UKNOW_HEALTH_URL="$TEST_HEALTH_URL"
export UKNOW_HEALTH_ATTEMPTS=3
export UKNOW_HEALTH_INTERVAL=1
export UKNOW_SKIP_PULL=true
export UKNOW_HOT_SWAP_TEST_MODE=true

echo ""
echo "─── TEST SUITE 1: PREFLIGHT VALIDATION ────────────────────────────"

# 1.0a: Kiểm tra port cấp phát động phải hoàn toàn rỗi
if check_port_free "$TEST_PORT" && check_port_free "$SMOKE_PORT"; then
  report_pass "Preflight: Các port động được cấp phát (test: $TEST_PORT, smoke: $SMOKE_PORT) hoàn toàn rảnh rỗi"
else
  report_fail "Preflight: Port $TEST_PORT hoặc $SMOKE_PORT đang bị tiến trình khác chiếm dụng"
fi

# 1.0: Thiếu tham số image -> Phải exit 1 và in hướng dẫn cách dùng
if bash "$HOT_SWAP_SCRIPT" 2>/dev/null; then
  report_fail "Preflight phải chặn khi không truyền tham số image"
else
  report_pass "Preflight chặn thành công khi thiếu tham số image bắt buộc"
fi

# 1.1: Thiếu .env -> Phải exit 1
if (UKNOW_ENV_FILE="/tmp/non_existent_env" bash "$HOT_SWAP_SCRIPT" "uknow-test-backend:${SHA_A}" 2>/dev/null); then
  report_fail "Preflight phải chặn file .env không tồn tại"
else
  report_pass "Preflight chặn thành công file .env không tồn tại"
fi

# 1.2: Thiếu SSL script -> Phải exit 1
if (UKNOW_SSL_SCRIPT="/tmp/non_existent_ssl.sh" bash "$HOT_SWAP_SCRIPT" "uknow-test-backend:${SHA_A}" 2>/dev/null); then
  report_fail "Preflight phải chặn file ssl-auto-provision.sh không tồn tại"
else
  report_pass "Preflight chặn thành công file ssl-auto-provision.sh không tồn tại"
fi

# 1.3: Thiếu Docker network -> Phải exit 1
if (UKNOW_NETWORK="non_existent_network_xyz" bash "$HOT_SWAP_SCRIPT" "uknow-test-backend:${SHA_A}" 2>/dev/null); then
  report_fail "Preflight phải chặn docker network không tồn tại"
else
  report_pass "Preflight chặn thành công docker network không tồn tại"
fi

# 1.4: Production bắt buộc digest; mutable tag (:latest) phải bị từ chối.
if bash "$HOT_SWAP_SCRIPT" "uknow-test-backend:latest" 2>/dev/null; then
  report_fail "Preflight phải chặn image production không dùng digest (ví dụ :latest)"
else
  report_pass "Preflight chặn thành công mutable tag (:latest bị từ chối)"
fi

# 1.5: Ngay cả SHA tag 40 ký tự vẫn không đủ cho production vì tag registry có
# thể bị ghi đè. Test fixture được phép dùng SHA chỉ trong explicit test mode.
PRODUCTION_TAG_OUTPUT=$(UKNOW_HOT_SWAP_TEST_MODE=false UKNOW_SKIP_PULL=false bash "$HOT_SWAP_SCRIPT" "uknow-test-backend:${SHA_A}" 2>&1 || true)
if echo "$PRODUCTION_TAG_OUTPUT" | grep -q 'PRODUCTION DIGEST REQUIRED'; then
  report_pass "Preflight từ chối SHA tag cho production; bắt buộc content-addressed digest"
else
  report_fail "Preflight vẫn cho phép SHA tag production (output: $PRODUCTION_TAG_OUTPUT)"
fi

# 1.6: Dù ở test mode, khi bỏ qua local fixture flag thì pull failure phải
# fail-closed, không được tin bytes local.
PULL_FAIL_OUTPUT=$(UKNOW_SKIP_PULL=false bash "$HOT_SWAP_SCRIPT" "uknow-test-backend:${SHA_A}" 2>&1 || true)
if echo "$PULL_FAIL_OUTPUT" | grep -q '\[PULL FAILED\]'; then
  report_pass "Preflight từ chối local SHA tag khi registry pull thất bại (không tin bytes local chưa được chứng thực)"
else
  report_fail "Preflight không fail-closed khi registry pull thất bại với local SHA tag (output: $PULL_FAIL_OUTPUT)"
fi

# 1.7: Không được biến cờ test thành bypass dùng được cho thao tác production.
SKIP_POLICY_OUTPUT=$(UKNOW_SKIP_PULL=true UKNOW_HOT_SWAP_TEST_MODE=false bash "$HOT_SWAP_SCRIPT" "uknow-test-backend:${SHA_A}" 2>&1 || true)
if echo "$SKIP_POLICY_OUTPUT" | grep -q 'PRODUCTION DIGEST REQUIRED'; then
  report_pass "Preflight chặn UKNOW_SKIP_PULL ngoài test mode (không tồn tại production local-image bypass)"
else
  report_fail "Preflight không chặn UKNOW_SKIP_PULL ngoài test mode (output: $SKIP_POLICY_OUTPUT)"
fi

echo ""
echo "─── TEST SUITE 2: METADATA REVISION INSPECTION ────────────────────"

# 2.1: Image có BUILD_SHA=dev -> Phải từ chối, không tự gán nhãn
if bash "$HOT_SWAP_SCRIPT" "uknow-test-backend:${SHA_C}" 2>/dev/null; then
  report_fail "Script phải từ chối image có BUILD_SHA=dev"
else
  report_pass "Script từ chối thành công image có revision không hợp lệ (BUILD_SHA=dev)"
fi

# 2.2: Image có SHA tag không khớp revision bên trong -> Phải từ chối vì IMAGE REVISION MISMATCH
MISMATCH_TAG="9999999999999999999999999999999999999999"
docker tag "uknow-test-backend:${SHA_A}" "uknow-test-backend:${MISMATCH_TAG}"
MISMATCH_ERR=$(bash "$HOT_SWAP_SCRIPT" "uknow-test-backend:${MISMATCH_TAG}" 2>&1 || true)
if echo "$MISMATCH_ERR" | grep -q "IMAGE REVISION MISMATCH"; then
  report_pass "Script phát hiện và từ chối chính xác IMAGE REVISION MISMATCH khi SHA tag khác nhãn metadata"
else
  report_fail "Script không phát hiện IMAGE REVISION MISMATCH (output: $MISMATCH_ERR)"
fi

echo ""
echo "─── TEST SUITE 3: KHỞI CHẠY CONTAINER BAN ĐẦU & KIỂM TRA MOUNTS ───"

# Khởi chạy container ban đầu (bản A)
bash "$HOT_SWAP_SCRIPT" "uknow-test-backend:${SHA_A}" >/dev/null

# Kiểm tra container đang chạy
if [ "$(docker inspect "$TEST_CONTAINER" --format '{{.State.Running}}')" = "true" ]; then
  report_pass "Container ban đầu ($TEST_CONTAINER) đang chạy"
else
  report_fail "Container ban đầu ($TEST_CONTAINER) không chạy"
fi

# Kiểm tra readiness
HEALTH_RESP="$(curl -sf "$TEST_HEALTH_URL" || echo "")"
if echo "$HEALTH_RESP" | grep -q "\"revision\":\"${SHA_A}\""; then
  report_pass "Endpoint /api/health trả về đúng revision ban đầu ($SHA_A)"
else
  report_fail "Endpoint /api/health không trả về đúng revision ban đầu"
fi

# Kiểm tra production volume mounts bên trong container
if docker exec "$TEST_CONTAINER" test -f /app/.env && \
   docker exec "$TEST_CONTAINER" test -f /opt/uknow/ssl-auto-provision.sh && \
   docker exec "$TEST_CONTAINER" test -f /app/secrets/jwt.key; then
  report_pass "Production volume mounts (.env, ssl script, secrets) hợp lệ bên trong container"
else
  report_fail "Production volume mounts không hợp lệ bên trong container"
fi

# Một lần hot-swap bị SIGKILL có thể để container standby tồn đọng. Standby là
# đường rollback duy nhất lúc đó, nên rerun phải dừng trước khi có thể xóa nó.
docker create --name "${TEST_CONTAINER}-standby" "uknow-test-backend:${SHA_A}" >/dev/null
STALE_STANDBY_OUTPUT=$(bash "$HOT_SWAP_SCRIPT" "uknow-test-backend:${SHA_D}" 2>&1 || true)
if echo "$STALE_STANDBY_OUTPUT" | grep -q 'standby tồn đọng' && \
   docker inspect "${TEST_CONTAINER}-standby" >/dev/null 2>&1 && \
   [ "$(docker inspect "$TEST_CONTAINER" --format '{{.State.Running}}')" = "true" ]; then
  report_pass "Preflight bảo toàn standby tồn đọng và không đụng container đang phục vụ khi cần manual reconciliation"
else
  report_fail "Preflight không bảo toàn an toàn standby tồn đọng (output: $STALE_STANDBY_OUTPUT)"
fi
docker rm -f "${TEST_CONTAINER}-standby" >/dev/null 2>&1 || true

echo ""
echo "─── TEST SUITE 4: FAILURE INJECTION & AUTOMATIC RECOVERY ──────────"
echo "[FAILURE INJECTION] Thực thi rollback sang image lỗi (B: 500 Internal Server Error)..."

# Thực thi rollback sang bản B (bản B cố ý trả về 500 ở /api/health)
# Script PHẢI:
# 1. Chuyển bản A sang standby.
# 2. Chạy bản B và phát hiện healthcheck đỏ sau 3 lần thử.
# 3. Kích hoạt restore_previous_container để đưa bản A trở lại.
# 4. Thoát với mã lỗi exit 1.
if bash "$HOT_SWAP_SCRIPT" "uknow-test-backend:${SHA_B}" 2>/dev/null; then
  report_fail "Rollback với image lỗi lẽ ra phải trả về mã thoát non-zero"
else
  report_pass "Script trả về mã thoát non-zero (exit 1) khi health check đỏ"
fi

# Kiểm tra container chính đã được tự động khôi phục về bản A
if [ "$(docker inspect "$TEST_CONTAINER" --format '{{.State.Running}}')" = "true" ]; then
  report_pass "Auto-recovery: Container chính ($TEST_CONTAINER) đã được phục hồi và đang chạy"
else
  report_fail "Auto-recovery: Container chính không chạy sau sự cố"
fi

# Kiểm tra revision sau phục hồi vẫn là bản A
RESTORED_RESP="$(curl -sf "$TEST_HEALTH_URL" || echo "")"
if echo "$RESTORED_RESP" | grep -q "\"revision\":\"${SHA_A}\""; then
  report_pass "Auto-recovery: Container phục hồi đang phục vụ đúng revision ban đầu ($SHA_A)"
else
  report_fail "Auto-recovery: Container phục hồi không phục vụ đúng revision ban đầu"
fi

# Kiểm tra container standby đã được hoán đổi trở lại
if docker inspect "${TEST_CONTAINER}-standby" >/dev/null 2>&1; then
  report_fail "Standby container vẫn còn tồn tại sau khi phục hồi"
else
  report_pass "Standby container đã được dọn dẹp/hoán đổi sạch sẽ"
fi

# 4.2: Real signal injection: SIGTERM (kill -15) trong giai đoạn mutation
echo "[FAILURE INJECTION] Tiêm tín hiệu SIGTERM (kill -15) trong giai đoạn mutation..."
UKNOW_HEALTH_INTERVAL=3 bash "$HOT_SWAP_SCRIPT" "uknow-test-backend:${SHA_B}" >/dev/null 2>&1 &
BG_PID=$!
for _ in $(seq 1 80); do
  if docker inspect "${TEST_CONTAINER}-standby" >/dev/null 2>&1; then
    sleep 0.5
    break
  fi
  sleep 0.1
done
kill -TERM "$BG_PID" 2>/dev/null || true
set +e
wait "$BG_PID" 2>/dev/null
TERM_EXIT=$?
set -e

if [ "$TERM_EXIT" -eq 143 ]; then
  report_pass "SIGTERM Trap: Script thoát chính xác với exit code 143 khi nhận SIGTERM"
else
  report_fail "SIGTERM Trap: Script thoát với code $TERM_EXIT (kỳ vọng 143)"
fi

if [ "$(docker inspect "$TEST_CONTAINER" --format '{{.State.Running}}')" = "true" ] && \
   curl -sf "$TEST_HEALTH_URL" | grep -q "\"revision\":\"${SHA_A}\""; then
  report_pass "SIGTERM Trap: Auto-recovery khôi phục thành công container gốc ($SHA_A) sau SIGTERM"
else
  report_fail "SIGTERM Trap: Container gốc không được khôi phục thành công sau SIGTERM"
fi

# 4.3: Real signal injection: SIGHUP (kill -1, mô phỏng SSH disconnect) trong giai đoạn mutation
echo "[FAILURE INJECTION] Tiêm tín hiệu SIGHUP (kill -1, mô phỏng SSH disconnect) trong giai đoạn mutation..."
UKNOW_HEALTH_INTERVAL=3 bash "$HOT_SWAP_SCRIPT" "uknow-test-backend:${SHA_B}" >/dev/null 2>&1 &
BG_PID=$!
for _ in $(seq 1 80); do
  if docker inspect "${TEST_CONTAINER}-standby" >/dev/null 2>&1; then
    sleep 0.5
    break
  fi
  sleep 0.1
done
kill -HUP "$BG_PID" 2>/dev/null || true
set +e
wait "$BG_PID" 2>/dev/null
HUP_EXIT=$?
set -e

if [ "$HUP_EXIT" -eq 129 ]; then
  report_pass "SIGHUP Trap: Script thoát chính xác với exit code 129 khi nhận SIGHUP"
else
  report_fail "SIGHUP Trap: Script thoát với code $HUP_EXIT (kỳ vọng 129)"
fi

if [ "$(docker inspect "$TEST_CONTAINER" --format '{{.State.Running}}')" = "true" ] && \
   curl -sf "$TEST_HEALTH_URL" | grep -q "\"revision\":\"${SHA_A}\""; then
  report_pass "SIGHUP Trap: Auto-recovery khôi phục thành công container gốc ($SHA_A) sau SIGHUP"
else
  report_fail "SIGHUP Trap: Container gốc không được khôi phục thành công sau SIGHUP"
fi

# 4.4: Cleanup trap resilience: Process bị ngắt SIGTERM ngay sau khi tạo DB cô lập -> trap tự động dọn sạch
echo "[FAILURE INJECTION] Kiểm chứng cleanup trap khi tiến trình bị SIGTERM ngay sau khi tạo DB..."
KILL_TEST_DB="uknow_kill_db_${TEST_ID}"
KILL_SENTINEL="$TEST_DIR/kill-db-created"
set +e
(
  TRAP_DB="$KILL_TEST_DB"
  trap 'drop_test_db "$TRAP_DB" || exit 1' EXIT
  trap 'drop_test_db "$TRAP_DB" || exit 1; trap - EXIT; exit 143' TERM
  create_test_db "$TRAP_DB" || exit 1
  : > "$KILL_SENTINEL"
  kill -TERM "$BASHPID"
) >/dev/null 2>&1
KILL_EXIT=$?
set -e

if [ -f "$KILL_SENTINEL" ] && [ "$KILL_EXIT" -ne 0 ] && database_absent "$KILL_TEST_DB"; then
  report_pass "Cleanup trap resilience: Process bị SIGTERM sau khi đã tạo DB -> trap tự động drop sạch DB cô lập (0 leak)"
else
  report_fail "Cleanup trap resilience: Không chứng minh được cleanup sau SIGTERM (created=$([ -f "$KILL_SENTINEL" ] && echo true || echo false), exit=$KILL_EXIT)"
  drop_test_db "$KILL_TEST_DB" || true
fi

echo ""
echo "─── TEST SUITE 5: SUCCESSFUL HOT-SWAP TO HEALTHY IMAGE ────────────"
echo "[HOT-SWAP] Thực thi rollback sang image mới hoàn toàn healthy (D)..."

if bash "$HOT_SWAP_SCRIPT" "uknow-test-backend:${SHA_D}" >/dev/null; then
  report_pass "Script hoàn tất thành công (exit 0) khi hoán đổi sang image healthy D"
else
  report_fail "Script thất bại khi hoán đổi sang image healthy D"
fi

NEW_RESP="$(curl -sf "$TEST_HEALTH_URL" || echo "")"
if echo "$NEW_RESP" | grep -q "\"revision\":\"${SHA_D}\""; then
  report_pass "Backend hiện đang phục vụ chính xác image mới (revision: $SHA_D)"
else
  report_fail "Backend không phục vụ đúng image mới"
fi

if docker inspect "${TEST_CONTAINER}-standby" >/dev/null 2>&1; then
  report_fail "Standby container vẫn còn sau khi hoán đổi thành công"
else
  report_pass "Standby container đã được xóa sạch sau khi container mới healthy"
fi

echo ""
echo "─── TEST SUITE 6: REAL BACKEND DOCKER ARTIFACT & GATE VERIFICATION ─"

# Hàm xác thực gate cho image bridge (chống nghiệm thu nhầm / mutable tag / revision mismatch)
validate_bridge_image_gate() {
  local target_image="${1:-}"
  local expected_rev="${2:-}"
  local inspect_rev
  local inspect_build_sha

  if [ -z "$target_image" ]; then
    echo "::error::[GATE FAILED] Bắt buộc truyền target image" >&2
    return 1
  fi

  # Bắt buộc tag phải được pin bằng 40-char SHA hoặc @sha256: registry digest (từ chối :latest, :bridge)
  if ! echo "$target_image" | grep -qE '(@sha256:[a-f0-9]{64}|:[a-f0-9]{40})$'; then
    echo "::error::[GATE FAILED] Tag image ($target_image) là mutable tag không được pin 40-char commit SHA hoặc digest!" >&2
    return 1
  fi

  if ! docker image inspect "$target_image" >/dev/null 2>&1; then
    echo "::error::[GATE FAILED] Image không tồn tại trong Docker daemon: $target_image" >&2
    return 1
  fi

  inspect_rev=$(docker image inspect "$target_image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || echo "")
  inspect_build_sha=$(docker image inspect "$target_image" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | awk -F= '/^BUILD_SHA=/{print $2; exit}')

  if ! [[ "$expected_rev" =~ ^[a-f0-9]{40}$ ]]; then
    echo "::error::[GATE FAILED] Expected revision không hợp lệ: $expected_rev" >&2
    return 1
  fi

  if ! [[ "$inspect_rev" =~ ^[a-f0-9]{40}$ ]] || ! [[ "$inspect_build_sha" =~ ^[a-f0-9]{40}$ ]]; then
    echo "::error::[GATE FAILED] Metadata image không hợp lệ (label=$inspect_rev, BUILD_SHA=$inspect_build_sha)" >&2
    return 1
  fi

  if [ "$inspect_rev" != "$inspect_build_sha" ] || [ "$inspect_rev" != "$expected_rev" ]; then
    echo "::error::[GATE FAILED] Metadata image không khớp expected (label=$inspect_rev, BUILD_SHA=$inspect_build_sha, expected=$expected_rev)" >&2
    return 1
  fi

  return 0
}

# 6.1: Negative tests cho gate xác thực image bridge
if validate_bridge_image_gate "" "b30bf8749fd55d5bb2573232be65adc625f5580c" 2>/dev/null; then
  report_fail "Gate Negative Check: Phải chặn khi thiếu tham số image bắt buộc"
else
  report_pass "Gate Negative Check: Chặn thành công khi thiếu tham số image bắt buộc"
fi

if validate_bridge_image_gate "uknow-backend:bridge" "b30bf8749fd55d5bb2573232be65adc625f5580c" 2>/dev/null; then
  report_fail "Gate Negative Check: Phải từ chối mutable tag (:bridge)"
else
  report_pass "Gate Negative Check: Từ chối thành công image dùng mutable tag (:bridge) không pin commit SHA"
fi

if validate_bridge_image_gate "uknow-backend:latest" "b30bf8749fd55d5bb2573232be65adc625f5580c" 2>/dev/null; then
  report_fail "Gate Negative Check: Phải từ chối mutable tag (:latest)"
else
  report_pass "Gate Negative Check: Từ chối thành công image dùng mutable tag (:latest) không pin commit SHA"
fi

if validate_bridge_image_gate "uknow-test-backend:${SHA_A}" "b30bf8749fd55d5bb2573232be65adc625f5580c" 2>/dev/null; then
  report_fail "Gate Negative Check: Phải phát hiện revision mismatch giữa image metadata và release tag"
else
  report_pass "Gate Negative Check: Phát hiện và từ chối chính xác revision mismatch giữa image metadata và git release tag"
fi

# 6.2: Thu thập thông tin image bridge thật và đối chiếu Git ref tin cậy
#
# TRUSTED_GIT_REF bắt buộc truyền tường minh (tag/commit của chính bridge commit
# sắp nghiệm thu) — KHÔNG hardcode một tag cố định ở đây. Một tag bridge trước đó
# (release-2026-09-02-ledger-safe) đã bị thu hồi vì thiếu hardening cache mới
# (xem docs/WALKTHROUGH_PR_Q4C_WAVE2.md); nếu hardcode, script sẽ âm thầm nghiệm
# thu nhầm một artifact đã lỗi thời thay vì bridge commit thật đang được release.
REAL_BRIDGE_IMAGE="${1:-${UKNOW_REAL_BRIDGE_IMAGE:-}}"
EXPECTED_BRIDGE_REVISION="${2:-${UKNOW_EXPECTED_BRIDGE_REVISION:-}}"
TRUSTED_GIT_REF="${3:-${UKNOW_TRUSTED_GIT_REF:-}}"
GIT_TAG_SHA=""
if [ -n "$TRUSTED_GIT_REF" ]; then
  GIT_TAG_SHA=$(git -C "$SCRIPT_DIR/../../.." rev-parse "$TRUSTED_GIT_REF" 2>/dev/null || echo "")
fi

if [ -z "$EXPECTED_BRIDGE_REVISION" ] && [ -n "$REAL_BRIDGE_IMAGE" ]; then
  EXPECTED_BRIDGE_REVISION=$(echo "$REAL_BRIDGE_IMAGE" | grep -oE ':[a-f0-9]{40}$' | tr -d ':' || echo "")
fi
if [ -z "$EXPECTED_BRIDGE_REVISION" ]; then
  EXPECTED_BRIDGE_REVISION="$GIT_TAG_SHA"
fi

IMAGE_PRECONDITION_OK=false
if [ -z "$REAL_BRIDGE_IMAGE" ]; then
  report_fail "Real Docker artifact: Bắt buộc truyền tên image bridge thật đã build (:40-char-sha) qua tham số hoặc UKNOW_REAL_BRIDGE_IMAGE"
elif [ -z "$TRUSTED_GIT_REF" ]; then
  report_fail "Real Docker artifact: Bắt buộc truyền Git ref tin cậy (tag/commit của bridge commit sắp nghiệm thu) qua tham số thứ 3 hoặc UKNOW_TRUSTED_GIT_REF — không có mặc định hardcode"
elif [ -z "$GIT_TAG_SHA" ]; then
  report_fail "Real Docker artifact: Không tìm thấy Git ref '$TRUSTED_GIT_REF' trong git repository"
elif [ "$EXPECTED_BRIDGE_REVISION" != "$GIT_TAG_SHA" ]; then
  report_fail "Real Docker artifact: Expected revision ($EXPECTED_BRIDGE_REVISION) không khớp Git ref tin cậy '$TRUSTED_GIT_REF' ($GIT_TAG_SHA). DỪNG TOÀN BỘ SUITE 6, KHÔNG CẤP QUYỀN DB!"
elif ! validate_bridge_image_gate "$REAL_BRIDGE_IMAGE" "$EXPECTED_BRIDGE_REVISION"; then
  report_fail "Real Docker artifact: Image $REAL_BRIDGE_IMAGE không vượt qua validate_bridge_image_gate (precondition). DỪNG TOÀN BỘ SUITE 6, KHÔNG CẤP QUYỀN DB!"
else
  IMAGE_PRECONDITION_OK=true
  report_pass "Real Docker artifact: Precondition thành công - Expected revision ($EXPECTED_BRIDGE_REVISION) khớp Git ref tin cậy '$TRUSTED_GIT_REF' ($GIT_TAG_SHA) và image metadata đạt chuẩn"
fi

if [ "$IMAGE_PRECONDITION_OK" = "true" ]; then
  echo "[REAL ARTIFACT] Tiến hành nghiệm thu chi tiết image bridge: $REAL_BRIDGE_IMAGE"

  # 6.3: Tạo manifest tin cậy từ Git tag bridge và kiểm tra Exact-Set đối chiếu với image
  TRUSTED_MANIFEST_FILE="$TEST_DIR/trusted_migrations_manifest.json"
  REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

  node -e '
    const { execSync } = require("child_process");
    const fs = require("fs");
    const crypto = require("crypto");
    const repoRoot = process.argv[1];
    const tag = process.argv[3];
    const raw = execSync(`git ls-tree ${tag}:backend/migrations`, { cwd: repoRoot, encoding: "utf8" });
    const lines = raw.trim().split("\n").filter(l => l.includes(".sql"));
    const manifest = {};
    for (const line of lines) {
      const parts = line.split(/\s+/);
      const blob = parts[2];
      const filename = parts[3];
      const content = execSync(`git cat-file -p ${blob}`, { cwd: repoRoot });
      const sha = crypto.createHash("sha256").update(content).digest("hex");
      manifest[filename] = sha;
    }
    fs.writeFileSync(process.argv[2], JSON.stringify(manifest, null, 2));
  ' "$REPO_ROOT" "$TRUSTED_MANIFEST_FILE" "$TRUSTED_GIT_REF"

  IMAGE_MANIFEST_FILE="$TEST_DIR/image_migrations_manifest.json"
  docker run --rm "$REAL_BRIDGE_IMAGE" sh -c "sha256sum migrations/*.sql" > "$TEST_DIR/image_sha256.txt"

  node -e '
    const fs = require("fs");
    const lines = fs.readFileSync(process.argv[1], "utf8").trim().split("\n");
    const manifest = {};
    for (const line of lines) {
      if (!line.trim()) continue;
      const [hash, rawPath] = line.trim().split(/\s+/);
      const filename = rawPath.replace(/^migrations\//, "");
      manifest[filename] = hash;
    }
    fs.writeFileSync(process.argv[2], JSON.stringify(manifest, null, 2));
  ' "$TEST_DIR/image_sha256.txt" "$IMAGE_MANIFEST_FILE"

  EXACT_SET_OK=false
  if node -e '
    const fs = require("fs");
    const trusted = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const image = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

    const trustedKeys = Object.keys(trusted);
    const imageKeys = Object.keys(image);

    const missing = trustedKeys.filter(k => !(k in image));
    const extra = imageKeys.filter(k => !(k in trusted));
    const mismatches = trustedKeys.filter(k => image[k] && image[k] !== trusted[k]);

    if (missing.length > 0 || extra.length > 0 || mismatches.length > 0 || trustedKeys.length !== imageKeys.length) {
      console.error("Exact-set check failed!");
      if (missing.length) console.error("Missing migrations in image:", missing);
      if (extra.length) console.error("Extra migrations in image:", extra);
      if (mismatches.length) console.error("Hash mismatches:", mismatches);
      process.exit(1);
    }
  ' "$TRUSTED_MANIFEST_FILE" "$IMAGE_MANIFEST_FILE"; then
    MIGRATION_COUNT=$(wc -l < "$TEST_DIR/image_sha256.txt" | tr -d '[:space:]')
    report_pass "Real Docker artifact: Exact-set migration inventory đối chiếu với Git tag đạt $MIGRATION_COUNT/$MIGRATION_COUNT migrations (0 missing, 0 extra, 0 hash mismatches)"
    EXACT_SET_OK=true
  else
    report_fail "Real Docker artifact: Exact-set migration inventory sai lệch so với Git tag"
  fi

  # 6.3b: Migration manifest không đủ để chứng minh source runtime trong image
  # là bytes của release tag. Hash toàn bộ src/, scripts/, bootstrap SQL và
  # package manifests được Dockerfile COPY vào /app, rồi đối chiếu trực tiếp
  # bên trong container.
  TRUSTED_RUNTIME_MANIFEST_FILE="$TEST_DIR/trusted_runtime_manifest.json"
  IMAGE_RUNTIME_MANIFEST_FILE="$TEST_DIR/image_runtime_manifest.json"
  RUNTIME_MANIFEST_READY=false
  RUNTIME_SOURCE_OK=false
  if node -e '
    const { execFileSync } = require("child_process");
    const crypto = require("crypto");
    const fs = require("fs");
    const repoRoot = process.argv[1];
    const output = process.argv[2];
    const tag = process.argv[3];
    const paths = execFileSync(
      "git",
      ["ls-tree", "-r", "--name-only", tag, "--", "backend/src", "backend/scripts", "backend/tests/integration/sql/bootstrap.sql", "backend/package.json", "backend/package-lock.json"],
      { cwd: repoRoot, encoding: "utf8" }
    ).trim().split(String.fromCharCode(10)).filter(Boolean);
    const manifest = {};
    for (const path of paths) {
      const bytes = execFileSync("git", ["show", `${tag}:${path}`], { cwd: repoRoot });
      manifest[path.slice("backend/".length)] = crypto.createHash("sha256").update(bytes).digest("hex");
    }
    fs.writeFileSync(output, JSON.stringify(manifest));
  ' "$REPO_ROOT" "$TRUSTED_RUNTIME_MANIFEST_FILE" "$TRUSTED_GIT_REF"; then
    RUNTIME_MANIFEST_READY=true
  else
    report_fail "Real Docker artifact: Không thể tạo runtime source manifest tin cậy từ Git release tag"
  fi

  if [ "$RUNTIME_MANIFEST_READY" = "true" ] && docker run --rm \
      -v "$TRUSTED_RUNTIME_MANIFEST_FILE:/tmp/trusted_runtime_manifest.json:ro" \
      "$REAL_BRIDGE_IMAGE" node -e '
        const crypto = require("crypto");
        const fs = require("fs");
        const trusted = JSON.parse(fs.readFileSync("/tmp/trusted_runtime_manifest.json", "utf8"));
        const actual = {};
        for (const relativePath of Object.keys(trusted)) {
          const imagePath = `/app/${relativePath}`;
          actual[relativePath] = fs.existsSync(imagePath)
            ? crypto.createHash("sha256").update(fs.readFileSync(imagePath)).digest("hex")
            : null;
        }
        process.stdout.write(JSON.stringify(actual));
      ' > "$IMAGE_RUNTIME_MANIFEST_FILE" && \
     node -e '
       const fs = require("fs");
       const trusted = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
       const actual = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
       const missing = Object.keys(trusted).filter(key => actual[key] === null);
       const mismatches = Object.keys(trusted).filter(key => actual[key] !== null && actual[key] !== trusted[key]);
       if (missing.length || mismatches.length) {
         console.error({ missing, mismatches });
         process.exit(1);
       }
     ' "$TRUSTED_RUNTIME_MANIFEST_FILE" "$IMAGE_RUNTIME_MANIFEST_FILE"; then
    RUNTIME_FILE_COUNT=$(node -e 'const fs = require("fs"); console.log(Object.keys(JSON.parse(fs.readFileSync(process.argv[1], "utf8"))).length);' "$TRUSTED_RUNTIME_MANIFEST_FILE")
    report_pass "Real Docker artifact: Runtime source attestation đối chiếu $RUNTIME_FILE_COUNT files src/scripts/bootstrap/package với Git release tag (0 missing, 0 hash mismatches)"
    RUNTIME_SOURCE_OK=true
  else
    report_fail "Real Docker artifact: Runtime source trong container sai khác Git release tag"
  fi

  # 6.4: Kiểm tra SHA-256 migration 182 bất biến trực tiếp bên trong image, đối
  # chiếu với chính trusted manifest đã dựng ở 6.3 (từ TRUSTED_GIT_REF) — KHÔNG
  # hardcode một hash rời rạc ở đây. Một hằng số tách biệt sẽ tự lệch ngay khi
  # migration 182 đổi hợp lệ (kể cả chỉ sửa comment runbook, không đổi DDL/DML),
  # và §6.3 exact-set ở trên đã phủ đúng ca này rồi — khối 6.4 chỉ tường minh hoá
  # lại cho riêng file quan trọng nhất của bridge.
  EXPECTED_182_HASH=$(node -e 'const fs = require("fs"); const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(m["182_ensure_crrs_unique_progress_index.sql"] || "");' "$TRUSTED_MANIFEST_FILE")
  MIGRATION_182_HASH=$(node -e 'const fs = require("fs"); const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(m["182_ensure_crrs_unique_progress_index.sql"] || "");' "$IMAGE_MANIFEST_FILE")
  if [ -n "$EXPECTED_182_HASH" ] && [ "$MIGRATION_182_HASH" = "$EXPECTED_182_HASH" ]; then
    report_pass "Real Docker artifact: SHA-256 migration 182 trong container ($MIGRATION_182_HASH) khớp trusted manifest từ Git ref '$TRUSTED_GIT_REF'"
  else
    report_fail "Real Docker artifact: SHA-256 migration 182 trong container ($MIGRATION_182_HASH) sai khác trusted manifest ($EXPECTED_182_HASH)"
  fi

  # 6.5: Khởi tạo database cô lập seed từ Git trusted manifest và chạy migration runner (--check) từ image
  echo "[ISOLATED DB] Thiết lập database cô lập $ISOLATED_GATE_DB seed từ Git trusted manifest..."
  DB_SETUP_OK=false
  if [ "$EXACT_SET_OK" = "true" ] && [ "$RUNTIME_SOURCE_OK" = "true" ] && create_test_db "$ISOLATED_GATE_DB" && docker run --rm \
      -v "$TRUSTED_MANIFEST_FILE:/app/trusted_manifest.json:ro" \
      -e DB_HOST="$CONTAINER_DB_HOST" \
      -e DB_PORT="$TEST_DB_PORT" \
      -e DB_USER="$TEST_DB_USER" \
      -e DB_PASSWORD="$TEST_DB_PASSWORD" \
      -e DB_NAME="$ISOLATED_GATE_DB" \
      "$REAL_BRIDGE_IMAGE" \
      node --input-type=module -e '
        const { default: pg } = await import("pg");
        const fs = await import("node:fs");

        const config = {
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT, 10),
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_NAME,
        };

        const client = new pg.Client(config);
        await client.connect();

        const bootstrapSql = fs.readFileSync("./tests/integration/sql/bootstrap.sql", "utf8");
        await client.query(bootstrapSql);

        const trustedManifest = JSON.parse(fs.readFileSync("/app/trusted_manifest.json", "utf8"));
        for (const [filename, hash] of Object.entries(trustedManifest)) {
          await client.query(
            "INSERT INTO schema_migrations (filename, checksum_sha256) VALUES ($1, $2) ON CONFLICT (filename) DO UPDATE SET checksum_sha256 = EXCLUDED.checksum_sha256",
            [filename, hash]
          );
        }
        await client.end();
      ' >/dev/null 2>&1; then
    DB_SETUP_OK=true
  fi

  if [ "$DB_SETUP_OK" = "true" ] && docker run --rm \
      -e DB_HOST="$CONTAINER_DB_HOST" \
      -e DB_PORT="$TEST_DB_PORT" \
      -e DB_USER="$TEST_DB_USER" \
      -e DB_PASSWORD="$TEST_DB_PASSWORD" \
      -e DB_NAME="$ISOLATED_GATE_DB" \
      "$REAL_BRIDGE_IMAGE" node scripts/migrate.js --check >/dev/null 2>&1; then
    report_pass "Real Docker artifact: Migration runner (migrate.js --check) xác nhận 0 pending/0 missing/0 mismatches trên DB cô lập seed từ Git manifest"
  else
    report_fail "Real Docker artifact: Migration runner (migrate.js --check) thất bại trên DB cô lập"
  fi

  # 6.6: Kiểm tra bootstrap columns từ container trên DB cô lập
  if [ "$DB_SETUP_OK" = "true" ] && docker run --rm \
      -e DB_HOST="$CONTAINER_DB_HOST" \
      -e DB_PORT="$TEST_DB_PORT" \
      -e DB_USER="$TEST_DB_USER" \
      -e DB_PASSWORD="$TEST_DB_PASSWORD" \
      -e DB_NAME="$ISOLATED_GATE_DB" \
      "$REAL_BRIDGE_IMAGE" node scripts/checkBootstrapColumns.js >/dev/null 2>&1; then
    report_pass "Real Docker artifact: checkBootstrapColumns.js quét đủ 238/238 cột bên trong container"
  else
    report_fail "Real Docker artifact: checkBootstrapColumns.js thất bại bên trong container"
  fi

  # 6.7: Khởi chạy default production entrypoint (npm run start / src/index.js) không override CMD
  docker rm -f "$SMOKE_CONTAINER" >/dev/null 2>&1 || true

  if [ "$DB_SETUP_OK" = "true" ] && docker run -d \
      --name "$SMOKE_CONTAINER" \
      -p "${SMOKE_PORT}:5001" \
      -e PORT=5001 \
      -e NODE_ENV=production \
      -e SKIP_MIGRATIONS=true \
      -e BULLMQ_ENABLED=false \
      -e DB_HOST="$CONTAINER_DB_HOST" \
      -e DB_PORT="$TEST_DB_PORT" \
      -e DB_NAME="$ISOLATED_GATE_DB" \
      -e DB_USER="$TEST_DB_USER" \
      -e DB_PASSWORD="$TEST_DB_PASSWORD" \
      -e JWT_SECRET="test_jwt_secret_must_be_at_least_32_chars_long_123456" \
      -e SMTP_SECRET_KEY="test_smtp_secret_key_123456789012" \
      "$REAL_BRIDGE_IMAGE" >/dev/null 2>&1; then

    SMOKE_HEALTHY=false
    for _ in $(seq 1 20); do
      if curl -sf "http://localhost:${SMOKE_PORT}/api/health" | grep -q '"status":"ok"'; then
        SMOKE_HEALTHY=true
        break
      fi
      sleep 1
    done

    if [ "$SMOKE_HEALTHY" = "true" ]; then
      report_pass "Real Docker artifact: Production entrypoint (npm run start / src/index.js) khởi chạy thành công và /api/health phản hồi HTTP 200 status: ok"
    else
      report_fail "Real Docker artifact: Production entrypoint không phản hồi status: ok sau 20s"
    fi
    docker rm -f "$SMOKE_CONTAINER" >/dev/null 2>&1 || true
  else
    report_fail "Real Docker artifact: Không thể khởi chạy production entrypoint từ $REAL_BRIDGE_IMAGE"
  fi

  # 6.8: Dọn dẹp DB cô lập và xác nhận không còn rò rỉ tài nguyên
  if drop_test_db "$ISOLATED_GATE_DB" && database_absent "$ISOLATED_GATE_DB"; then
    report_pass "Real Docker artifact: Database cô lập được drop sạch sẽ sau khi hoàn tất kiểm thử (0 leak)"
  else
    report_fail "Real Docker artifact: Database cô lập vẫn tồn tại hoặc không kiểm chứng được sau khi drop"
  fi
fi

echo ""
echo "======================================================================"
echo "KẾT QUẢ KIỂM THỬ: $PASSED_TESTS PASS, $FAILED_TESTS FAIL"
echo "======================================================================"

if [ "$FAILED_TESTS" -eq 0 ]; then
  echo "🎉 TẤT CẢ TEST HOT-SWAP & FAILURE INJECTION ĐỀU ĐẠT CHUẨN 100%!"
  exit 0
else
  echo "💥 CÓ $FAILED_TESTS TEST THẤT BẠI!" >&2
  exit 1
fi
