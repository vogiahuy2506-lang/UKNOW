#!/bin/bash
# ssl-provision-pending.sh
# Host-cron helper: provision Let's Encrypt SSL for active custom domains that
# are not Cloudflare-managed.

set -euo pipefail

LOG_FILE="${SSL_PROVISION_LOG:-/var/log/ssl-provision.log}"
BACKEND_ENV_FILE="${BACKEND_ENV_FILE:-/opt/uknow/backend/.env}"
SSL_AUTO_PROVISION_SCRIPT="${SSL_AUTO_PROVISION_SCRIPT:-/opt/uknow/ssl-auto-provision.sh}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$LOG_FILE" >&2
    exit 1
}

read_env_value() {
    local key="$1"
    local file="$2"
    local line value

    [[ -f "$file" ]] || return 0

    line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$file" | tail -n 1 || true)"
    [[ -n "$line" ]] || return 0

    value="${line#*=}"
    value="$(echo "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    if [[ "$value" == \"*\" ]]; then
        value="${value#\"}"
        value="${value%\"}"
    elif [[ "$value" == \'*\' ]]; then
        value="${value#\'}"
        value="${value%\'}"
    else
        value="$(echo "$value" | sed -E 's/[[:space:]]+#.*$//' | sed -e 's/[[:space:]]*$//')"
    fi
    printf '%s' "$value"
}

if [[ -f "$BACKEND_ENV_FILE" ]]; then
    log "Reading DB_* values from $BACKEND_ENV_FILE"
else
    log "Backend env file not found at $BACKEND_ENV_FILE; using current environment"
fi

DB_HOST_VALUE="${DB_HOST:-$(read_env_value DB_HOST "$BACKEND_ENV_FILE")}"
DB_CONTAINER="${DB_CONTAINER:-$(read_env_value DB_CONTAINER "$BACKEND_ENV_FILE")}"
DB_CONTAINER="${DB_CONTAINER:-$DB_HOST_VALUE}"
DB_USER="${DB_USER:-$(read_env_value DB_USER "$BACKEND_ENV_FILE")}"
DB_NAME="${DB_NAME:-$(read_env_value DB_NAME "$BACKEND_ENV_FILE")}"
DB_PASSWORD="${DB_PASSWORD:-$(read_env_value DB_PASSWORD "$BACKEND_ENV_FILE")}"

if [[ -z "$DB_CONTAINER" || "$DB_CONTAINER" == "localhost" || "$DB_CONTAINER" == "127.0.0.1" ]]; then
    error "Set DB_CONTAINER to the PostgreSQL container name in cron/env (current DB_CONTAINER/DB_HOST='$DB_CONTAINER')"
fi

if [[ -z "$DB_USER" || -z "$DB_NAME" ]]; then
    error "DB_USER and DB_NAME are required"
fi

if [[ ! -x "$SSL_AUTO_PROVISION_SCRIPT" ]]; then
    error "SSL auto provision script is not executable: $SSL_AUTO_PROVISION_SCRIPT"
fi

SQL="
SELECT DISTINCT LOWER(hostname)
FROM landing_page_domains
WHERE status = 'active'
  AND cf_managed IS NOT TRUE
  AND hostname IS NOT NULL
ORDER BY 1;
"

log "Scanning active non-CF landing domains from container: $DB_CONTAINER"

DOMAINS_RAW="$(
    docker exec -e PGPASSWORD="$DB_PASSWORD" "$DB_CONTAINER" \
        psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "$SQL"
)"

mapfile -t DOMAINS <<< "$DOMAINS_RAW"

PENDING_DOMAINS=()
for domain in "${DOMAINS[@]}"; do
    domain="$(echo "$domain" | tr -d '[:space:]')"
    [[ -n "$domain" ]] && PENDING_DOMAINS+=("$domain")
done

if [[ ${#PENDING_DOMAINS[@]} -eq 0 ]]; then
    log "No pending domains found"
    exit 0
fi

for domain in "${PENDING_DOMAINS[@]}"; do
    log "Provisioning SSL for pending domain: $domain"
    if "$SSL_AUTO_PROVISION_SCRIPT" "$domain"; then
        log "Provision completed for $domain"
    else
        log "Provision failed for $domain; continuing"
    fi
done

log "Pending SSL provision scan completed"
