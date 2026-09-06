#!/usr/bin/env bash
# ==============================================================================
# SCRIPT: PRODUCTION CONTAINER HOT-SWAP ROLLBACK WITH STANDBY FAIL-SAFE & AUTO-RECOVERY
# File: backend/scripts/ops/hot_swap_rollback.sh
#
# Mục đích: Hoàn nguyên container backend khẩn cấp trên VPS mà không chạy
#           migration bundle cũ. Tự động sao lưu container đang chạy vào standby,
#           kiểm tra preflight nghiêm ngặt, bẫy tín hiệu/lỗi qua trap ERR/INT/TERM,
#           thăm dò readiness /api/health, và TỰ ĐỘNG PHỤC HỒI (auto-restore)
#           kèm kiểm chứng sức khỏe container cũ nếu container mới gặp sự cố.
#
# Cách dùng trên VPS:
#   bash backend/scripts/ops/hot_swap_rollback.sh <IMAGE_OR_DIGEST>
#
# Ví dụ:
#   # Dùng immutable registry digest (khuyến nghị cho production):
#   bash backend/scripts/ops/hot_swap_rollback.sh founderai/uknow-backend@sha256:<digest>
#
#   # Không dùng SHA tag cho production: Docker registry tag không phải
#   # content-addressed. Chỉ dùng digest được CI ghi nhận khi deploy.
#
# Đang cháy, cần fail nhanh hơn 120s mặc định?
#   Mặc định HEALTH_ATTEMPTS=40 × HEALTH_INTERVAL=3s = 120s trước khi script tự
#   bỏ cuộc và auto-restore container cũ — cố ý dài để không bỏ dở một image tốt
#   chỉ vì Redis/BullMQ chậm kết nối lúc khởi động (worst case ~120s cho 2 queue).
#   Nếu đang giữa sự cố thật và muốn script quyết định nhanh hơn, hạ ngân sách qua
#   env (đừng sửa default trong file — default đang bảo vệ ca bình thường):
#     UKNOW_HEALTH_ATTEMPTS=10 bash backend/scripts/ops/hot_swap_rollback.sh <IMAGE_OR_DIGEST>
# ==============================================================================
set -euo pipefail

# Cấu hình đường dẫn production (cho phép ghi đè qua env vars khi kiểm thử tự động)
UKNOW_DIR="${UKNOW_DIR:-/root/uknow}"
ENV_FILE="${UKNOW_ENV_FILE:-$UKNOW_DIR/backend/.env}"
SSL_SCRIPT="${UKNOW_SSL_SCRIPT:-$UKNOW_DIR/scripts/ssl-auto-provision.sh}"
UPLOADS_DIR="${UKNOW_UPLOADS_DIR:-$UKNOW_DIR/backend/uploads}"
TEMP_UPLOADS_DIR="${UKNOW_TEMP_UPLOADS_DIR:-$UKNOW_DIR/backend/temp_uploads}"
SECRETS_DIR="${UKNOW_SECRETS_DIR:-$UKNOW_DIR/secrets}"
DOCKER_NETWORK="${UKNOW_NETWORK:-uknow_network}"
CONTAINER_NAME="${UKNOW_CONTAINER_NAME:-uknow-campaign-backend}"
STANDBY_NAME="${CONTAINER_NAME}-standby"
PORT_MAPPING="${UKNOW_PORT_MAPPING:-5001:5001}"
HEALTH_URL="${UKNOW_HEALTH_URL:-http://localhost:5001/api/health}"
DOCKER_SOCK="${UKNOW_DOCKER_SOCK:-/var/run/docker.sock}"
# 40×3s=120s (không phải 60s cũ): outboundMessageQueue và kbDocumentQueue mỗi cái
# có connectTimeout Redis mặc định 60s trước khi markRuntimeReady() được gọi (xem
# runtimeReadiness.util.js) — một lần Redis chậm-nhưng-vẫn-lên có thể chiếm gần hết
# 60s của MỘT queue, không còn margin cho DB connect/validate/scheduler init chạy
# trước đó. Ngân sách phải khớp deploy-backend.yml (đã đồng bộ 40×3s) để hai đường
# hot-swap không rollback lệch nhau trên cùng một hành vi khởi động thật.
HEALTH_ATTEMPTS="${UKNOW_HEALTH_ATTEMPTS:-40}"
HEALTH_INTERVAL="${UKNOW_HEALTH_INTERVAL:-3}"

# Bắt buộc truyền tham số image rollback (không hardcode default SHA để tránh mâu thuẫn vòng lặp Git)
if [ -z "${1:-}" ]; then
  echo "::error::[PREFLIGHT FAILED] Bắt buộc truyền registry image digest cho rollback!" >&2
  echo "Cách dùng: bash backend/scripts/ops/hot_swap_rollback.sh <IMAGE_OR_DIGEST>" >&2
  echo "Ví dụ:     bash backend/scripts/ops/hot_swap_rollback.sh founderai/uknow-backend@sha256:<digest>" >&2
  exit 1
fi
BACKEND_IMAGE="$1"

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [HOT-SWAP] Bắt đầu quy trình rollback container: $BACKEND_IMAGE"

# ─── BƯỚC 1: PREFLIGHT CHECKS ──────────────────────────────────────────────────
echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [PREFLIGHT] Kiểm tra cấu hình và tài nguyên hệ thống..."

if [ ! -f "$ENV_FILE" ]; then
  echo "::error::[PREFLIGHT FAILED] File môi trường không tồn tại: $ENV_FILE" >&2
  exit 1
fi

if [ ! -f "$SSL_SCRIPT" ]; then
  echo "::error::[PREFLIGHT FAILED] Script SSL không tồn tại: $SSL_SCRIPT" >&2
  exit 1
fi

if ! docker network inspect "$DOCKER_NETWORK" >/dev/null 2>&1; then
  echo "::error::[PREFLIGHT FAILED] Docker network không tồn tại: $DOCKER_NETWORK" >&2
  exit 1
fi

# Nếu một lần hot-swap trước bị SIGKILL/mất điện sau khi đổi tên container cũ,
# cả container chính và standby có thể cùng tồn tại. Standby khi đó là bản cứu
# hộ duy nhất đã biết là tốt; tuyệt đối không xóa nó tự động ở một lần chạy sau.
if docker inspect "$STANDBY_NAME" >/dev/null 2>&1; then
  echo "::error::[PREFLIGHT FAILED] Phát hiện standby tồn đọng: $STANDBY_NAME. Dừng để bảo toàn container rollback; kiểm tra và reconcile thủ công trước khi chạy lại." >&2
  exit 1
fi

# Docker image tag theo commit vẫn có thể bị CI/build lại với cùng metadata.
# Production phải dùng digest content-addressed. SHA tag chỉ được phép cho
# fixture local của suite test, bị khóa đồng thời bởi test-mode + namespace.
IS_TEST_FIXTURE=false
if [ "${UKNOW_HOT_SWAP_TEST_MODE:-false}" = "true" ] && [[ "$BACKEND_IMAGE" =~ ^uknow-test-backend:[a-f0-9]{40}$ ]]; then
  IS_TEST_FIXTURE=true
fi
if ! [[ "$BACKEND_IMAGE" =~ @sha256:[a-f0-9]{64}$ ]] && [ "$IS_TEST_FIXTURE" != "true" ]; then
  echo "::error::[PREFLIGHT FAILED] PRODUCTION DIGEST REQUIRED: Image rollback phải dùng registry digest @sha256:<64-hex>. Commit SHA tag chỉ được phép cho fixture uknow-test-backend trong test mode. Nhận được: $BACKEND_IMAGE" >&2
  exit 1
fi

mkdir -p "$UPLOADS_DIR" "$TEMP_UPLOADS_DIR" "$SECRETS_DIR"

# ─── BƯỚC 2: PULL VÀ KIỂM CHỨNG METADATA REVISION TRONG IMAGE ────────────────
echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [PULL] Tải image rollback: $BACKEND_IMAGE..."
if [ "${UKNOW_SKIP_PULL:-false}" = "true" ]; then
  # Bypass chỉ tồn tại để suite test dùng image fixture không nằm trên registry.
  # Không cho phép thao tác production vô tình tin local SHA-tag có thể bị retag.
  if [ "${UKNOW_HOT_SWAP_TEST_MODE:-false}" != "true" ] || [[ "$BACKEND_IMAGE" != uknow-test-backend:* ]]; then
    echo "::error::[PULL POLICY FAILED] UKNOW_SKIP_PULL chỉ hợp lệ cho image fixture uknow-test-backend:* khi UKNOW_HOT_SWAP_TEST_MODE=true. Production phải pull registry digest." >&2
    exit 1
  fi
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [PULL SKIP] Bỏ qua pull remote theo cờ UKNOW_SKIP_PULL=true (sử dụng image local daemon)."
elif ! docker pull "$BACKEND_IMAGE"; then
  # SHA tag có thể bị retag trong local daemon. Chỉ digest content-addressed mới
  # được phép dùng bản local khi registry tạm thời không truy cập được.
  if [[ "$BACKEND_IMAGE" == *@sha256:* ]] && docker image inspect "$BACKEND_IMAGE" >/dev/null 2>&1; then
    echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [PULL NOTICE] Registry không phản hồi; tiếp tục bằng image local cùng immutable digest."
  else
    echo "::error::[PULL FAILED] Không thể tải image. Từ chối dùng local SHA-tag vì không chứng minh được bytes artifact; dùng registry digest hoặc xử lý registry trước khi retry." >&2
    exit 1
  fi
fi

IMAGE_ID=$(docker image inspect "$BACKEND_IMAGE" --format '{{.Id}}' 2>/dev/null || echo "")
if [ -z "$IMAGE_ID" ]; then
  echo "::error::[IMAGE ERROR] Không thể inspect image: $BACKEND_IMAGE" >&2
  exit 1
fi
echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [IMAGE OK] Image ID: $IMAGE_ID"

# Dockerfile production phải nướng cả label OCI và BUILD_SHA. Kiểm tra cả hai
# tránh một metadata đơn lẻ bị tự khai báo sai.
IMAGE_LABEL_REVISION=$(docker image inspect "$BACKEND_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || echo "")
IMAGE_BUILD_SHA=$(docker image inspect "$BACKEND_IMAGE" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | awk -F= '/^BUILD_SHA=/{print $2; exit}')
if ! [[ "$IMAGE_LABEL_REVISION" =~ ^[a-f0-9]{40}$ ]] || ! [[ "$IMAGE_BUILD_SHA" =~ ^[a-f0-9]{40}$ ]] || [ "$IMAGE_LABEL_REVISION" != "$IMAGE_BUILD_SHA" ]; then
  echo "::error::[IMAGE REVISION FAILED] Metadata image không hợp lệ hoặc không đồng nhất (label=$IMAGE_LABEL_REVISION, BUILD_SHA=$IMAGE_BUILD_SHA). Cần hai SHA-40 giống hệt được nướng lúc CI build." >&2
  exit 1
fi
IMAGE_REVISION="$IMAGE_LABEL_REVISION"

# Fixture test dùng SHA tag để test revision mismatch; production đã bị buộc
# dùng digest ở preflight phía trên.
REQUESTED_TAG_SHA=$(echo "$BACKEND_IMAGE" | grep -oE ':[a-f0-9]{40}$' | tr -d ':' || echo "")
if [ -n "$REQUESTED_TAG_SHA" ] && [ "$IMAGE_REVISION" != "$REQUESTED_TAG_SHA" ]; then
  echo "::error::[IMAGE REVISION MISMATCH] Revision nhúng bên trong image ($IMAGE_REVISION) không khớp với SHA trong image tag ($REQUESTED_TAG_SHA)!" >&2
  exit 1
fi

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [IMAGE REVISION VERIFIED] Revision bên trong image: $IMAGE_REVISION"

# ─── BƯỚC 3: ĐỊNH NGHĨA AUTO-RECOVERY VÀ TRAP BẢO VỆ TIẾN TRÌNH ──────────────
PREV_CONTAINER_EXISTS=false
PREV_IMAGE=""
PREV_REVISION="unknown"
MUTATION_IN_PROGRESS=false

if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  PREV_CONTAINER_EXISTS=true
  PREV_IMAGE=$(docker inspect "$CONTAINER_NAME" --format '{{.Config.Image}}')
  PREV_REVISION=$(docker inspect "$CONTAINER_NAME" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || echo "unknown")
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [STANDBY] Phát hiện container đang chạy: image=$PREV_IMAGE, revision=$PREV_REVISION"
fi

# Hàm phục hồi container cũ tự động khi có bất kỳ sự cố nào xảy ra
restore_previous_container() {
  local reason="${1:-unknown error}"
  echo "::error::[ALERT] Rollback container thất bại ($reason)! Bắt đầu tự động khôi phục container cũ..." >&2

  # Dọn container mới hỏng
  docker update --restart=no "$CONTAINER_NAME" 2>/dev/null || true
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

  if [ "$PREV_CONTAINER_EXISTS" = "true" ] && docker inspect "$STANDBY_NAME" >/dev/null 2>&1; then
    echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [RECOVERY] Đang đổi tên và khởi động lại $STANDBY_NAME -> $CONTAINER_NAME..." >&2
    docker rename "$STANDBY_NAME" "$CONTAINER_NAME" 2>/dev/null || true
    docker update --restart=unless-stopped "$CONTAINER_NAME" || true
    docker start "$CONTAINER_NAME"
  elif [ "$PREV_CONTAINER_EXISTS" = "true" ] && docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [RECOVERY] Đang khôi phục restart policy và start lại $CONTAINER_NAME..." >&2
    docker update --restart=unless-stopped "$CONTAINER_NAME" || true
    docker start "$CONTAINER_NAME" 2>/dev/null || true
  else
    echo "::error::[RECOVERY FAILED] Không tìm thấy container standby để khôi phục!" >&2
    return 1
  fi

  # Kiểm tra sức khỏe (/api/health) của container được phục hồi
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [RECOVERY HEALTHCHECK] Thăm dò endpoint readiness: $HEALTH_URL..." >&2
  local restored_healthy=false
  for r in $(seq 1 "$HEALTH_ATTEMPTS"); do
    if curl --connect-timeout 2 --max-time 4 -sf "$HEALTH_URL" | grep -q '"status":"ok"'; then
      restored_healthy=true
      break
    fi
    sleep "$HEALTH_INTERVAL"
  done

  if [ "$restored_healthy" = "true" ]; then
    echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [RECOVERY] ✅ Đã phục hồi và kiểm chứng thành công container ban đầu ($PREV_IMAGE)!" >&2
    return 0
  else
    echo "::error::[RECOVERY CRITICAL] Container ban đầu đã khởi động lại nhưng endpoint $HEALTH_URL không phản hồi healthy!" >&2
    return 1
  fi
}

cleanup_mutation_traps() {
  trap - ERR INT TERM HUP EXIT
}

on_mutation_err() {
  local exit_code="$1"
  local line_no="$2"
  cleanup_mutation_traps
  if [ "$MUTATION_IN_PROGRESS" = "true" ]; then
    echo "::error::[TRAP ERR] Bắt được lỗi tại dòng $line_no (exit code $exit_code). Tự động phục hồi container cũ..." >&2
    MUTATION_IN_PROGRESS=false
    restore_previous_container "caught command error at line $line_no (code $exit_code)" || true
  fi
  local final_code="${exit_code:-1}"
  if [ "$final_code" -eq 0 ]; then final_code=1; fi
  exit "$final_code"
}

on_mutation_int() {
  cleanup_mutation_traps
  if [ "$MUTATION_IN_PROGRESS" = "true" ]; then
    echo "::error::[TRAP INT] Bắt được tín hiệu SIGINT (Ctrl+C). Tự động phục hồi container cũ..." >&2
    MUTATION_IN_PROGRESS=false
    restore_previous_container "caught SIGINT" || true
  fi
  exit 130
}

on_mutation_term() {
  cleanup_mutation_traps
  if [ "$MUTATION_IN_PROGRESS" = "true" ]; then
    echo "::error::[TRAP TERM] Bắt được tín hiệu SIGTERM. Tự động phục hồi container cũ..." >&2
    MUTATION_IN_PROGRESS=false
    restore_previous_container "caught SIGTERM" || true
  fi
  exit 143
}

on_mutation_hup() {
  cleanup_mutation_traps
  if [ "$MUTATION_IN_PROGRESS" = "true" ]; then
    echo "::error::[TRAP HUP] Bắt được tín hiệu SIGHUP (SSH disconnect). Tự động phục hồi container cũ..." >&2
    MUTATION_IN_PROGRESS=false
    restore_previous_container "caught SIGHUP" || true
  fi
  exit 129
}

on_mutation_exit() {
  local exit_code="$1"
  cleanup_mutation_traps
  if [ "$MUTATION_IN_PROGRESS" = "true" ]; then
    echo "::error::[TRAP EXIT] Tiến trình thoát khi mutation chưa hoàn tất (code $exit_code). Tự động phục hồi container cũ..." >&2
    MUTATION_IN_PROGRESS=false
    restore_previous_container "abnormal exit before completion (code $exit_code)" || true
    local final_code="${exit_code:-1}"
    if [ "$final_code" -eq 0 ]; then final_code=1; fi
    exit "$final_code"
  fi
}

# ─── BƯỚC 4: CHUYỂN CONTAINER HIỆN TẠI VÀO STANDBY (DƯỚI SỰ BẢO VỆ CỦA TRAP) ─
if [ "$PREV_CONTAINER_EXISTS" = "true" ]; then
  # Cài đặt trap bảo vệ toàn diện ngay trước khi bắt đầu mutation container
  MUTATION_IN_PROGRESS=true
  trap 'on_mutation_err $? $LINENO' ERR
  trap 'on_mutation_int' INT
  trap 'on_mutation_term' TERM
  trap 'on_mutation_hup' HUP
  trap 'on_mutation_exit $?' EXIT

  # Dừng container hiện tại và đổi tên thành standby
  docker update --restart=no "$CONTAINER_NAME" || true
  docker stop "$CONTAINER_NAME" >/dev/null
  docker rename "$CONTAINER_NAME" "$STANDBY_NAME"
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [STANDBY] Đã chuyển container cũ sang standby: $STANDBY_NAME"
fi

# ─── BƯỚC 5: KHỞI CHẠY CONTAINER ROLLBACK VỚI ĐẦY ĐỦ CỜ PRODUCTION ───────────
DOCKER_GID="$(stat -c '%g' "$DOCKER_SOCK" 2>/dev/null || stat -f '%g' "$DOCKER_SOCK" 2>/dev/null || echo 0)"
if [ -z "$DOCKER_GID" ]; then DOCKER_GID=0; fi

DOCKER_SOCK_MOUNT=()
if [ -S "$DOCKER_SOCK" ] || [ -e "$DOCKER_SOCK" ]; then
  DOCKER_SOCK_MOUNT=(-v "$DOCKER_SOCK":/var/run/docker.sock:ro)
fi

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [START] Khởi chạy container rollback $CONTAINER_NAME..."

if ! docker run -d \
  --name "$CONTAINER_NAME" \
  --network "$DOCKER_NETWORK" \
  --group-add "$DOCKER_GID" \
  --label org.opencontainers.image.revision="$IMAGE_REVISION" \
  --restart unless-stopped \
  -e SKIP_MIGRATIONS=true \
  -p "$PORT_MAPPING" \
  -v "$ENV_FILE":/app/.env \
  "${DOCKER_SOCK_MOUNT[@]}" \
  -v "$UPLOADS_DIR":/app/uploads \
  -v "$TEMP_UPLOADS_DIR":/app/temp_uploads \
  -v "$SECRETS_DIR":/app/secrets:ro \
  -v "$SSL_SCRIPT":/opt/uknow/ssl-auto-provision.sh:ro \
  "$BACKEND_IMAGE"; then
  MUTATION_IN_PROGRESS=false
  cleanup_mutation_traps
  restore_previous_container "docker run failed" || true
  exit 1
fi

# ─── BƯỚC 6: READINESS POLLING & KIỂM CHỨNG SỨC KHỎE ─────────────────────────
echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [HEALTHCHECK] Thăm dò endpoint readiness: $HEALTH_URL..."
READY=false
START_TIME=$(date +%s)
for i in $(seq 1 "$HEALTH_ATTEMPTS"); do
  if curl --connect-timeout 2 --max-time 4 -sf "$HEALTH_URL" | grep -q '"status":"ok"'; then
    READY=true
    ELAPSED=$(( $(date +%s) - START_TIME ))
    echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [HEALTHCHECK OK] Backend healthy sau ${ELAPSED}s (lần thử $i/$HEALTH_ATTEMPTS)!"
    break
  fi
  sleep "$HEALTH_INTERVAL"
done

if [ "$READY" != "true" ]; then
  ELAPSED=$(( $(date +%s) - START_TIME ))
  echo "::error::[HEALTHCHECK FAILED] Endpoint $HEALTH_URL không phản hồi healthy sau ${ELAPSED}s (${HEALTH_ATTEMPTS} attempts)!" >&2
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Log 50 dòng cuối của container hỏng:" >&2
  docker logs --tail 50 "$CONTAINER_NAME" >&2 || true
  MUTATION_IN_PROGRESS=false
  cleanup_mutation_traps
  if ! restore_previous_container "readiness check timed out"; then
    echo "::error::[RECOVERY FAILED] Phục hồi container cũ thất bại!" >&2
    exit 1
  fi
  exit 1
fi

# Endpoint chỉ báo ready sau post-listen startup, nhưng giữ standby thêm một
# khoảng polling để phát hiện crash ngay sau readiness trước khi xóa đường cứu hộ.
sleep "$HEALTH_INTERVAL"
if ! docker inspect "$CONTAINER_NAME" --format '{{.State.Running}}' 2>/dev/null | grep -qx 'true' \
   || ! curl --connect-timeout 2 --max-time 4 -sf "$HEALTH_URL" | grep -q '"status":"ok"'; then
  echo "::error::[HEALTHCHECK FAILED] Container mất readiness trong cửa sổ ổn định sau khởi động." >&2
  MUTATION_IN_PROGRESS=false
  cleanup_mutation_traps
  if ! restore_previous_container "readiness lost during stability window"; then
    echo "::error::[RECOVERY FAILED] Phục hồi container cũ thất bại!" >&2
  fi
  exit 1
fi

# ─── BƯỚC 7: DỌN DẸP STANDBY SAU KHI CONTAINER MỚI ĐÃ HEALTHY HOÀN TOÀN ───────
# Container mới đã healthy: gỡ toàn bộ trap và dọn dẹp standby
MUTATION_IN_PROGRESS=false
cleanup_mutation_traps

if [ "$PREV_CONTAINER_EXISTS" = "true" ] && docker inspect "$STANDBY_NAME" >/dev/null 2>&1; then
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [CLEANUP] Container mới đã hoạt động hoàn hảo. Dọn dẹp standby container..."
  docker rm -f "$STANDBY_NAME" >/dev/null 2>&1 || true
fi

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [SUCCESS] Hoàn nguyên container thành công! Backend đang chạy bản $IMAGE_REVISION."
