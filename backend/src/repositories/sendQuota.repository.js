import db from '../config/database.js';
import { EFFECTIVE_PLAN_ID_SQL } from '../utils/billingCycle.util.js';

/**
 * Valid state transitions for send_quota_reservations.
 * Terminal state: consumed.
 */
export const VALID_RESERVATION_TRANSITIONS = Object.freeze({
  reserved: Object.freeze(['sending', 'released']),
  sending: Object.freeze(['consumed', 'released', 'uncertain']),
  uncertain: Object.freeze(['consumed', 'released']),
  released: Object.freeze(['reserved']),
  consumed: Object.freeze([]),
});

/**
 * Active statuses that count towards workspace send quota.
 */
export const METERED_RESERVATION_STATUSES = Object.freeze([
  'reserved',
  'sending',
  'uncertain',
  'consumed',
]);

/**
 * Statuses that hold wallet top-up balance.
 */
export const WALLET_HOLD_STATUSES = Object.freeze([
  'reserved',
  'sending',
  'uncertain',
]);

/**
 * Technical fields allowlisted in response_snapshot (<= 4KB, zero-PII).
 */
export const ALLOWED_RESPONSE_SNAPSHOT_FIELDS = new Set([
  'messageId',
  'provider',
  'providerReference',
  'sentAt',
  'recipientHash',
  'status',
  'tracking',
  'deliveredAt',
  'bouncedAt',
]);

export const ALLOWED_TRACKING_FIELDS = new Set([
  'messageId',
  'openCount',
  'clickCount',
  'delivered',
  'tracked',
  'linkTrackingEnabled',
]);

export const ALLOWED_SOURCE_REF_KEYS = new Set([
  'campaignId',
  'nodeId',
  'runId',
  'step',
  'stepIndex',
  'messageId',
  'jobId',
  'outboundId',
  'batchId',
  'recipientId',
  'customerId',
  'userId',
  'inboxMessageId',
  'threadId',
  'providerMessageId',
  'templateId',
  'logicalStep',
]);

const SECRET_KEY_PATTERNS = /(?:token|secret|password|bearer|auth|apikey|privatekey|jwt)/i;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_PATTERN = /^(?:\+?84|0)[35789]\d{8}$/;

/**
 * Deep recursive validation to block any nested PII (email, phone) or secret tokens.
 * Handles both string and numeric phone-like representations without blocking technical IDs.
 * @param {any} val
 * @param {string} path
 */
export function assertNoPiiOrSecret(val, path = 'root') {
  if (val == null) return;
  if (typeof val === 'number') {
    const numStr = String(val);
    if (/^(?:84|0)[35789]\d{8}$/.test(numStr)) {
      const err = new Error(`PII detected in ${path}: numeric phone number not allowed`);
      err.status = 400;
      err.code = 'PII_DETECTED';
      throw err;
    }
    return;
  }
  if (typeof val === 'string') {
    if (EMAIL_PATTERN.test(val)) {
      const err = new Error(`PII detected in ${path}: email address not allowed`);
      err.status = 400;
      err.code = 'PII_DETECTED';
      throw err;
    }
    const cleanPhone = val.replace(/[\s.-]/g, '');
    if (PHONE_PATTERN.test(cleanPhone)) {
      const err = new Error(`PII detected in ${path}: phone number not allowed`);
      err.status = 400;
      err.code = 'PII_DETECTED';
      throw err;
    }
    if (/bearer\s+[a-zA-Z0-9._-]+/i.test(val)) {
      const err = new Error(`Secret detected in ${path}: bearer token not allowed`);
      err.status = 400;
      err.code = 'SECRET_DETECTED';
      throw err;
    }
    return;
  }
  if (Array.isArray(val)) {
    val.forEach((item, idx) => assertNoPiiOrSecret(item, `${path}[${idx}]`));
    return;
  }
  if (typeof val === 'object') {
    for (const [k, v] of Object.entries(val)) {
      if (SECRET_KEY_PATTERNS.test(k)) {
        const err = new Error(`Secret key detected in ${path}: '${k}' is prohibited`);
        err.status = 400;
        err.code = 'SECRET_KEY_PROHIBITED';
        throw err;
      }
      assertNoPiiOrSecret(v, `${path}.${k}`);
    }
  }
}

const CANONICAL_DIRECT_PREVIEW_QUICK = /^(?:direct|preview|quick):(email|zalo):(\d+):h_[0-9a-f]{20}:[0-9a-f]{16}$/;
const CANONICAL_CAMPAIGN = /^campaign:([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]{1,32}|h_[0-9a-f]{20}):(email|zalo):[0-9a-f]{16}:(\d+)$/;
const CANONICAL_INBOX = /^inbox:(zalo|email):([0-9]{1,18}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|h_[0-9a-f]{20})$/i;

/**
 * Validates reservationKey does not contain PII or unsafe characters, and fits VARCHAR(191).
 * Enforces canonical Zero-PII format (h_[0-9a-f]{20}) for direct, preview, and quick-send segments.
 * @param {string} key
 * @returns {string}
 */
export function validateReservationKey(key) {
  if (typeof key !== 'string' || !key.trim()) {
    const err = new Error('reservationKey must be a non-empty string');
    err.status = 400;
    err.code = 'INVALID_RESERVATION_KEY';
    throw err;
  }

  const trimmed = key.trim();
  if (trimmed.length > 191) {
    const err = new Error('reservationKey exceeds 191 chars');
    err.status = 400;
    err.code = 'INVALID_RESERVATION_KEY';
    throw err;
  }

  // Scan entire key for email (@) or embedded phone patterns
  if (trimmed.includes('@') || /(?:^|[:_])(?:\+?84|0)[35789]\d{8}(?:[:_]|$)/.test(trimmed)) {
    const err = new Error('PII detected in reservationKey');
    err.status = 400;
    err.code = 'PII_DETECTED';
    throw err;
  }

  // Segment format enforcement:
  if (trimmed.startsWith('direct:') || trimmed.startsWith('preview:') || trimmed.startsWith('quick:')) {
    if (!CANONICAL_DIRECT_PREVIEW_QUICK.test(trimmed)) {
      const err = new Error('reservationKey does not follow canonical Zero-PII format (expected h_[0-9a-f]{20} client segment)');
      err.status = 400;
      err.code = 'INVALID_RESERVATION_KEY';
      throw err;
    }
  } else if (trimmed.startsWith('campaign:')) {
    if (!CANONICAL_CAMPAIGN.test(trimmed)) {
      const err = new Error('reservationKey does not follow canonical campaign format');
      err.status = 400;
      err.code = 'INVALID_RESERVATION_KEY';
      throw err;
    }
  } else if (trimmed.startsWith('inbox:')) {
    if (!CANONICAL_INBOX.test(trimmed)) {
      const err = new Error('reservationKey does not follow canonical inbox format');
      err.status = 400;
      err.code = 'INVALID_RESERVATION_KEY';
      throw err;
    }
  } else if (process.env.NODE_ENV === 'test' && /^(?:test|res|emp_res)_[a-zA-Z0-9_-]{1,64}$/.test(trimmed)) {
    // Isolated test fixtures in NODE_ENV=test (e.g. res_sweeper_exp1_123)
    return trimmed;
  } else {
    const err = new Error(
      `reservationKey '${trimmed}' does not follow canonical runtime format (must start with direct:, preview:, quick:, campaign:, or inbox:)`
    );
    err.status = 400;
    err.code = 'INVALID_RESERVATION_KEY';
    throw err;
  }

  return trimmed;
}

/**
 * Validates providerReference does not contain PII or unsafe characters, and fits max 128 chars.
 * @param {string|null} ref
 * @returns {string|null}
 */
export function validateProviderReference(ref) {
  if (ref == null) return null;
  assertNoPiiOrSecret(ref, 'providerReference');
  const str = String(ref).trim();
  if (!/^[a-zA-Z0-9_.:/-]{1,128}$/.test(str)) {
    const err = new Error('providerReference contains invalid characters or exceeds 128 chars');
    err.status = 400;
    err.code = 'INVALID_PROVIDER_REFERENCE';
    throw err;
  }
  return str;
}

/**
 * Validates failureCode does not contain PII or unsafe characters, and fits max 64 chars.
 * @param {string|null} code
 * @returns {string|null}
 */
export function validateFailureCode(code) {
  if (code == null) return null;
  assertNoPiiOrSecret(code, 'failureCode');
  const str = String(code).trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(str)) {
    const err = new Error('failureCode contains invalid characters or exceeds 64 chars');
    err.status = 400;
    err.code = 'INVALID_FAILURE_CODE';
    throw err;
  }
  return str;
}

/**
 * Sanitizes and validates response_snapshot to ensure allowlisted fields and max 4KB size.
 * @param {object|null} snapshot
 * @returns {object|null}
 */
export function sanitizeResponseSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;

  // Deep assertion on tracking object if provided to prevent nested PII/secret leaks
  if (snapshot.tracking) {
    assertNoPiiOrSecret(snapshot.tracking, 'response_snapshot.tracking');
  }

  const sanitized = {};
  for (const key of ALLOWED_RESPONSE_SNAPSHOT_FIELDS) {
    if (snapshot[key] !== undefined) {
      if (key === 'recipientHash') {
        const hash = String(snapshot[key] || '').trim();
        if (!/^[0-9a-f]{16,64}$/i.test(hash)) {
          const err = new Error('recipientHash must be a valid hex hash (16-64 chars) with no PII');
          err.status = 400;
          err.code = 'INVALID_RECIPIENT_HASH';
          throw err;
        }
        sanitized.recipientHash = hash.toLowerCase();
      } else if (key === 'tracking') {
        if (snapshot.tracking && typeof snapshot.tracking === 'object' && !Array.isArray(snapshot.tracking)) {
          const cleanTracking = {};
          for (const [tk, tv] of Object.entries(snapshot.tracking)) {
            if (ALLOWED_TRACKING_FIELDS.has(tk)) {
              cleanTracking[tk] = tv;
            }
          }
          sanitized.tracking = cleanTracking;
        } else {
          sanitized.tracking = snapshot.tracking;
        }
      } else {
        sanitized[key] = snapshot[key];
      }
    }
  }

  // Double check sanitized output has no PII or secret
  assertNoPiiOrSecret(sanitized, 'response_snapshot');

  const serialized = JSON.stringify(sanitized);
  if (Buffer.byteLength(serialized, 'utf8') > 4096) {
    const err = new Error('response_snapshot exceeds 4KB limit');
    err.status = 400;
    err.code = 'RESPONSE_SNAPSHOT_TOO_LARGE';
    throw err;
  }
  return sanitized;
}

/**
 * Validates source_ref does not leak PII or secrets, and only uses allowlisted keys and scalar IDs.
 * @param {object|null} sourceRef
 */
export function validateSourceRef(sourceRef) {
  if (!sourceRef || typeof sourceRef !== 'object') return;

  assertNoPiiOrSecret(sourceRef, 'source_ref');

  for (const [key, value] of Object.entries(sourceRef)) {
    if (!ALLOWED_SOURCE_REF_KEYS.has(key)) {
      const err = new Error(`source_ref contains unauthorized key '${key}'`);
      err.status = 400;
      err.code = 'UNAUTHORIZED_SOURCE_REF_KEY';
      throw err;
    }
    if (value == null) continue;
    if (typeof value === 'number') {
      if (!Number.isInteger(value) || value < 0) {
        const err = new Error(`source_ref['${key}'] must be a non-negative integer ID`);
        err.status = 400;
        err.code = 'INVALID_SOURCE_REF_VALUE';
        throw err;
      }
    } else if (typeof value === 'string') {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(value)) {
        const err = new Error(`source_ref['${key}'] contains invalid characters or exceeds 64 chars`);
        err.status = 400;
        err.code = 'INVALID_SOURCE_REF_VALUE';
        throw err;
      }
    } else if (typeof value !== 'boolean') {
      const err = new Error(`source_ref['${key}'] must be a scalar string or integer`);
      err.status = 400;
      err.code = 'INVALID_SOURCE_REF_VALUE';
      throw err;
    }
  }
}

/**
 * Acquire workspace send quota transaction advisory lock.
 * @param {import('pg').PoolClient} client
 * @param {number|string} workspaceId
 */
export async function acquireWorkspaceQuotaLock(client, workspaceId) {
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2))',
    ['send_quota_workspace', String(workspaceId)]
  );
}

/**
 * Acquire workspace wallet transaction advisory lock.
 * @param {import('pg').PoolClient} client
 * @param {number|string} workspaceId
 * @param {string} itemKey
 */
export async function acquireWorkspaceWalletLock(client, workspaceId, itemKey) {
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2))',
    [`topup_wallet:${workspaceId}`, String(itemKey)]
  );
}

/**
 * Insert a new quota reservation with strict invariant validation.
 * @param {import('pg').PoolClient} client
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createReservation(client, data) {
  const {
    reservationKey,
    requestFingerprint,
    fingerprintVersion = 'v1',
    billingUserId,
    actorUserId = null,
    membershipId = null,
    channel,
    quantity,
    isMetered = true,
    walletItemKey = null,
    walletQuantity = 0,
    sourceType,
    sourceRef = {},
    status = 'reserved',
    vnDayStart,
    vnDayEnd,
    cycleStart = null,
    cycleEnd = null,
    expiresAt = null,
    responseSnapshot = null,
    providerReference = null,
    failureCode = null,
  } = data;

  // Validation 0: reservationKey format and Zero-PII
  const cleanReservationKey = validateReservationKey(reservationKey);

  // Validation 1: requestFingerprint must be 64-char lowercase hex SHA-256
  const cleanFingerprint = String(requestFingerprint || '').trim();
  if (!/^[0-9a-f]{64}$/.test(cleanFingerprint)) {
    const err = new Error('request_fingerprint must be a valid 64-character lowercase hex SHA-256 string');
    err.status = 400;
    err.code = 'INVALID_REQUEST_FINGERPRINT';
    throw err;
  }

  // Validation 2: walletQuantity invariants
  if (!isMetered && walletQuantity > 0) {
    const err = new Error('Non-metered reservations cannot hold wallet quota (wallet_quantity must be 0)');
    err.status = 400;
    err.code = 'INVALID_METERED_WALLET_QUANTITY';
    throw err;
  }
  if (walletQuantity > 0) {
    if (!walletItemKey || !['emails', 'zalo_messages'].includes(walletItemKey)) {
      const err = new Error('wallet_quantity > 0 requires a valid wallet_item_key (emails or zalo_messages)');
      err.status = 400;
      err.code = 'INVALID_WALLET_ITEM_KEY';
      throw err;
    }
    if (walletQuantity > quantity) {
      const err = new Error('wallet_quantity cannot exceed total quantity');
      err.status = 400;
      err.code = 'INVALID_WALLET_QUANTITY';
      throw err;
    }
  }

  // Validation 3: Zero-PII in source_ref
  validateSourceRef(sourceRef);

  // Validation 4: Sanitized responseSnapshot, providerReference, failureCode
  const sanitizedSnapshot = sanitizeResponseSnapshot(responseSnapshot);
  const cleanProviderRef = validateProviderReference(providerReference);
  const cleanFailure = validateFailureCode(failureCode);

  const { rows } = await client.query(
    `INSERT INTO send_quota_reservations (
      reservation_key,
      request_fingerprint,
      fingerprint_version,
      billing_user_id,
      actor_user_id,
      membership_id,
      channel,
      quantity,
      is_metered,
      wallet_item_key,
      wallet_quantity,
      source_type,
      source_ref,
      status,
      vn_day_start,
      vn_day_end,
      cycle_start,
      cycle_end,
      expires_at,
      response_snapshot,
      provider_reference,
      failure_code
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22
    ) RETURNING *`,
    [
      cleanReservationKey,
      cleanFingerprint,
      fingerprintVersion,
      billingUserId,
      actorUserId,
      membershipId,
      channel,
      quantity,
      isMetered,
      walletItemKey,
      walletQuantity,
      sourceType,
      JSON.stringify(sourceRef || {}),
      status,
      vnDayStart,
      vnDayEnd,
      cycleStart,
      cycleEnd,
      expiresAt,
      sanitizedSnapshot ? JSON.stringify(sanitizedSnapshot) : null,
      cleanProviderRef,
      cleanFailure,
    ]
  );

  return rows[0];
}

/**
 * Find reservation by reservation_key.
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {string} reservationKey
 * @returns {Promise<object|null>}
 */
export async function findReservationByKey(queryable, reservationKey) {
  const cleanKey = validateReservationKey(reservationKey);
  const { rows } = await queryable.query(
    'SELECT * FROM send_quota_reservations WHERE reservation_key = $1 LIMIT 1',
    [cleanKey]
  );
  return rows[0] || null;
}

/**
 * Find reservation by ID.
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {number|string} id
 * @param {{ forUpdate?: boolean }} [options]
 * @returns {Promise<object|null>}
 */
export async function findReservationById(queryable, id, { forUpdate = false } = {}) {
  const sql = forUpdate
    ? 'SELECT * FROM send_quota_reservations WHERE id = $1 FOR UPDATE'
    : 'SELECT * FROM send_quota_reservations WHERE id = $1';
  const { rows } = await queryable.query(sql, [id]);
  return rows[0] || null;
}

/**
 * Sum active wallet holds for a workspace and item.
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {number|string} billingUserId
 * @param {string} walletItemKey
 * @returns {Promise<number>}
 */
export async function getActiveWalletHolds(queryable, billingUserId, walletItemKey) {
  const { rows } = await queryable.query(
    `SELECT COALESCE(SUM(wallet_quantity), 0)::int AS total
     FROM send_quota_reservations
     WHERE billing_user_id = $1
       AND wallet_item_key = $2
       AND wallet_quantity > 0
       AND status IN ('reserved', 'sending', 'uncertain')`,
    [billingUserId, walletItemKey]
  );
  return Number(rows[0]?.total || 0);
}

/**
 * Transition quota reservation state with strict transition rules and audit timestamps.
 *
 * @param {import('pg').PoolClient} client
 * @param {number|string} reservationId
 * @param {string} fromStatus
 * @param {string} toStatus
 * @param {object} [updates]
 * @returns {Promise<object>}
 */
export async function transitionReservationState(client, reservationId, fromStatus, toStatus, updates = {}) {
  // Step 1: Read current row with lock if not already held
  const row = await findReservationById(client, reservationId, { forUpdate: true });
  if (!row) {
    const err = new Error(`Reservation #${reservationId} not found`);
    err.status = 404;
    err.code = 'RESERVATION_NOT_FOUND';
    throw err;
  }

  // Idempotent duplicate call
  if (row.status === toStatus) {
    return row;
  }

  const allowedNext = VALID_RESERVATION_TRANSITIONS[row.status] || [];
  if (!allowedNext.includes(toStatus)) {
    const err = new Error(
      `Cannot transition reservation #${reservationId} from '${row.status}' to '${toStatus}'`
    );
    err.status = 409;
    err.code = 'INVALID_RESERVATION_TRANSITION';
    err.currentStatus = row.status;
    err.targetStatus = toStatus;
    throw err;
  }

  // Optional: check caller's fromStatus precondition if provided
  if (fromStatus && row.status !== fromStatus) {
    const err = new Error(
      `Precondition failed: reservation #${reservationId} is '${row.status}', expected '${fromStatus}'`
    );
    err.status = 409;
    err.code = 'INVALID_RESERVATION_TRANSITION';
    err.currentStatus = row.status;
    err.targetStatus = toStatus;
    throw err;
  }

  const setClauses = ['status = $2', 'updated_at = NOW()'];
  const values = [reservationId, toStatus];

  if (toStatus === 'sending') {
    setClauses.push('sending_at = NOW()');
  } else if (toStatus === 'consumed') {
    setClauses.push('consumed_at = NOW()');
  } else if (toStatus === 'released') {
    setClauses.push('released_at = NOW()');
  } else if (toStatus === 'uncertain') {
    setClauses.push('uncertain_at = NOW()');
  } else if (toStatus === 'reserved') {
    // Retry transition released -> reserved: clear previous release/failure
    setClauses.push('released_at = NULL', 'failure_code = NULL');
    if (updates.vnDayStart) {
      values.push(updates.vnDayStart);
      setClauses.push(`vn_day_start = $${values.length}`);
    }
    if (updates.vnDayEnd) {
      values.push(updates.vnDayEnd);
      setClauses.push(`vn_day_end = $${values.length}`);
    }
    if (updates.cycleStart !== undefined) {
      values.push(updates.cycleStart);
      setClauses.push(`cycle_start = $${values.length}`);
    }
    if (updates.cycleEnd !== undefined) {
      values.push(updates.cycleEnd);
      setClauses.push(`cycle_end = $${values.length}`);
    }
    if (updates.expiresAt !== undefined) {
      values.push(updates.expiresAt);
      setClauses.push(`expires_at = $${values.length}`);
    }
    if (updates.walletItemKey !== undefined) {
      values.push(updates.walletItemKey);
      setClauses.push(`wallet_item_key = $${values.length}`);
    }
    if (updates.walletQuantity !== undefined) {
      values.push(Number(updates.walletQuantity) || 0);
      setClauses.push(`wallet_quantity = $${values.length}`);
    }
  }

  if (updates.providerReference !== undefined) {
    const cleanRef = validateProviderReference(updates.providerReference);
    values.push(cleanRef);
    setClauses.push(`provider_reference = $${values.length}`);
  }

  if (updates.failureCode !== undefined) {
    const cleanFailure = validateFailureCode(updates.failureCode);
    values.push(cleanFailure);
    setClauses.push(`failure_code = $${values.length}`);
  }

  if (updates.responseSnapshot !== undefined) {
    const sanitized = sanitizeResponseSnapshot(updates.responseSnapshot);
    values.push(sanitized ? JSON.stringify(sanitized) : null);
    setClauses.push(`response_snapshot = $${values.length}`);
  }

  const { rows } = await client.query(
    `UPDATE send_quota_reservations
     SET ${setClauses.join(', ')}
     WHERE id = $1
     RETURNING *`,
    values
  );

  return rows[0];
}

/**
 * Đếm tổng Email đã gửi trong ngày VN (kết hợp legacy rows + ledger active reservations).
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {number|string} billingUserId
 * @param {Date} dayStart
 * @param {Date} dayEnd
 * @returns {Promise<number>}
 */
export async function countEmailSentTodayWithLedger(queryable, billingUserId, dayStart, dayEnd) {
  const { rows } = await queryable.query(
    `SELECT (
      COALESCE((
        SELECT COUNT(*)
        FROM email_messages em
        JOIN campaigns c ON c.id = em.id_campaign
        WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1
          AND em.quota_reservation_id IS NULL
          AND em.status IN ('sent', 'delivered', 'bounced')
          AND NOT em.is_preview
          AND em.sent_at >= $2 AND em.sent_at < $3
      ), 0)
      +
      COALESCE((
        SELECT SUM(delta)
        FROM usage_logs
        WHERE id_user = $1
          AND quota_reservation_id IS NULL
          AND resource_type = 'email_direct_send'
          AND created_at >= $2 AND created_at < $3
      ), 0)
      +
      COALESCE((
        SELECT SUM(quantity)
        FROM send_quota_reservations
        WHERE billing_user_id = $1
          AND channel = 'email'
          AND is_metered = true
          AND status IN ('reserved', 'sending', 'uncertain', 'consumed')
          AND vn_day_start = $2 AND vn_day_end = $3
      ), 0)
    )::int AS total`,
    [billingUserId, dayStart, dayEnd]
  );
  return Number(rows[0]?.total || 0);
}

/**
 * Đếm tổng Zalo đã gửi trong ngày VN (kết hợp legacy campaign + legacy personal inbox + usage_logs + ledger).
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {number|string} billingUserId
 * @param {Date} dayStart
 * @param {Date} dayEnd
 * @returns {Promise<number>}
 */
export async function countZaloSentTodayWithLedger(queryable, billingUserId, dayStart, dayEnd) {
  const { rows } = await queryable.query(
    `SELECT (
      COALESCE((
        SELECT COUNT(*)
        FROM zalo_messages zm
        JOIN campaigns c ON c.id = zm.id_campaign
        WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1
          AND zm.quota_reservation_id IS NULL
          AND zm.tracking_metadata->>'status' = 'sent'
          AND NOT zm.is_preview
          AND zm.sent_at >= $2 AND zm.sent_at < $3
      ), 0)
      +
      COALESCE((
        SELECT COUNT(*)
        FROM zalo_personal_messages zpm
        WHERE (zpm.id_user = $1 OR zpm.id_user IN (
          SELECT um.employee_id FROM user_members um
          WHERE um.owner_id = $1 AND um.status = 'active'
        ))
          AND zpm.role = 'agent'
          AND zpm.metadata->>'source' = 'manual_inbox'
          AND zpm.quota_reservation_id IS NULL
          AND zpm.created_at >= $2 AND zpm.created_at < $3
      ), 0)
      +
      COALESCE((
        SELECT SUM(delta)
        FROM usage_logs
        WHERE id_user = $1
          AND quota_reservation_id IS NULL
          AND resource_type = 'zalo_direct_send'
          AND created_at >= $2 AND created_at < $3
      ), 0)
      +
      COALESCE((
        SELECT SUM(quantity)
        FROM send_quota_reservations
        WHERE billing_user_id = $1
          AND channel = 'zalo'
          AND is_metered = true
          AND status IN ('reserved', 'sending', 'uncertain', 'consumed')
          AND vn_day_start = $2 AND vn_day_end = $3
      ), 0)
    )::int AS total`,
    [billingUserId, dayStart, dayEnd]
  );
  return Number(rows[0]?.total || 0);
}

/**
 * Đếm tổng Email trong kỳ (kết hợp legacy rows + ledger active reservations).
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {number|string} billingUserId
 * @param {Date} cycleStart
 * @param {Date} cycleEnd
 * @returns {Promise<number>}
 */
export async function countEmailSentInCycleWithLedger(queryable, billingUserId, cycleStart, cycleEnd) {
  const { rows } = await queryable.query(
    `SELECT (
      COALESCE((
        SELECT COUNT(*)
        FROM email_messages em
        JOIN campaigns c ON c.id = em.id_campaign
        WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1
          AND em.quota_reservation_id IS NULL
          AND em.status IN ('sent', 'delivered', 'bounced')
          AND NOT em.is_preview
          AND em.sent_at >= $2 AND em.sent_at < $3
      ), 0)
      +
      COALESCE((
        SELECT SUM(delta)
        FROM usage_logs
        WHERE id_user = $1
          AND quota_reservation_id IS NULL
          AND resource_type = 'email_direct_send'
          AND created_at >= $2 AND created_at < $3
      ), 0)
      +
      COALESCE((
        SELECT SUM(quantity)
        FROM send_quota_reservations
        WHERE billing_user_id = $1
          AND channel = 'email'
          AND is_metered = true
          AND status IN ('reserved', 'sending', 'uncertain', 'consumed')
          AND cycle_start = $2 AND cycle_end = $3
      ), 0)
    )::int AS total`,
    [billingUserId, cycleStart, cycleEnd]
  );
  return Number(rows[0]?.total || 0);
}

/**
 * Đếm tổng Zalo trong kỳ (kết hợp legacy campaign + legacy personal inbox + usage_logs + ledger).
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {number|string} billingUserId
 * @param {Date} cycleStart
 * @param {Date} cycleEnd
 * @returns {Promise<number>}
 */
export async function countZaloSentInCycleWithLedger(queryable, billingUserId, cycleStart, cycleEnd) {
  const { rows } = await queryable.query(
    `SELECT (
      COALESCE((
        SELECT COUNT(*)
        FROM zalo_messages zm
        JOIN campaigns c ON c.id = zm.id_campaign
        WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1
          AND zm.quota_reservation_id IS NULL
          AND zm.tracking_metadata->>'status' = 'sent'
          AND NOT zm.is_preview
          AND zm.sent_at >= $2 AND zm.sent_at < $3
      ), 0)
      +
      COALESCE((
        SELECT COUNT(*)
        FROM zalo_personal_messages zpm
        WHERE (zpm.id_user = $1 OR zpm.id_user IN (
          SELECT um.employee_id FROM user_members um
          WHERE um.owner_id = $1 AND um.status = 'active'
        ))
          AND zpm.role = 'agent'
          AND zpm.metadata->>'source' = 'manual_inbox'
          AND zpm.quota_reservation_id IS NULL
          AND zpm.created_at >= $2 AND zpm.created_at < $3
      ), 0)
      +
      COALESCE((
        SELECT SUM(delta)
        FROM usage_logs
        WHERE id_user = $1
          AND quota_reservation_id IS NULL
          AND resource_type = 'zalo_direct_send'
          AND created_at >= $2 AND created_at < $3
      ), 0)
      +
      COALESCE((
        SELECT SUM(quantity)
        FROM send_quota_reservations
        WHERE billing_user_id = $1
          AND channel = 'zalo'
          AND is_metered = true
          AND status IN ('reserved', 'sending', 'uncertain', 'consumed')
          AND cycle_start = $2 AND cycle_end = $3
      ), 0)
    )::int AS total`,
    [billingUserId, cycleStart, cycleEnd]
  );
  return Number(rows[0]?.total || 0);
}

/**
 * Đếm tổng tin gửi của riêng nhân viên trong ngày VN.
 * Dùng campaigns.created_by cho legacy campaign, zalo_personal_messages.id_user cho inbox,
 * và actor_user_id cho usage_logs và reservations.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {number|string} ownerId
 * @param {number|string} employeeId
 * @param {string} channel
 * @param {Date} dayStart
 * @param {Date} dayEnd
 * @returns {Promise<number>}
 */
export async function countEmployeeSentTodayWithLedger(
  queryable,
  ownerId,
  employeeId,
  channel,
  dayStart,
  dayEnd
) {
  if (channel === 'email') {
    const { rows } = await queryable.query(
      `SELECT (
        COALESCE((
          SELECT COUNT(*)
          FROM email_messages em
          JOIN campaigns c ON c.id = em.id_campaign
          WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1
            AND c.created_by = $2
            AND em.quota_reservation_id IS NULL
            AND em.status IN ('sent', 'delivered', 'bounced')
            AND NOT em.is_preview
            AND em.sent_at >= $3 AND em.sent_at < $4
        ), 0)
        +
        COALESCE((
          SELECT SUM(delta)
          FROM usage_logs ul
          WHERE ul.id_user = $1
            AND (ul.actor_user_id = $2 OR (ul.metadata->>'actorUserId')::bigint = $2)
            AND ul.quota_reservation_id IS NULL
            AND ul.resource_type = 'email_direct_send'
            AND ul.created_at >= $3 AND ul.created_at < $4
        ), 0)
        +
        COALESCE((
          SELECT SUM(quantity)
          FROM send_quota_reservations
          WHERE billing_user_id = $1
            AND actor_user_id = $2
            AND channel = 'email'
            AND is_metered = true
            AND status IN ('reserved', 'sending', 'uncertain', 'consumed')
            AND vn_day_start = $3 AND vn_day_end = $4
        ), 0)
      )::int AS total`,
      [ownerId, employeeId, dayStart, dayEnd]
    );
    return Number(rows[0]?.total || 0);
  }

  // channel === 'zalo'
  const { rows } = await queryable.query(
    `SELECT (
      COALESCE((
        SELECT COUNT(*)
        FROM zalo_messages zm
        JOIN campaigns c ON c.id = zm.id_campaign
        WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1
          AND c.created_by = $2
          AND zm.quota_reservation_id IS NULL
          AND zm.tracking_metadata->>'status' = 'sent'
          AND NOT zm.is_preview
          AND zm.sent_at >= $3 AND zm.sent_at < $4
      ), 0)
      +
      COALESCE((
        SELECT COUNT(*)
        FROM zalo_personal_messages zpm
        WHERE zpm.id_user = $2
          AND zpm.role = 'agent'
          AND zpm.metadata->>'source' = 'manual_inbox'
          AND zpm.quota_reservation_id IS NULL
          AND zpm.created_at >= $3 AND zpm.created_at < $4
      ), 0)
      +
      COALESCE((
        SELECT SUM(delta)
        FROM usage_logs ul
        WHERE ul.id_user = $1
          AND (ul.actor_user_id = $2 OR (ul.metadata->>'actorUserId')::bigint = $2)
          AND ul.quota_reservation_id IS NULL
          AND ul.resource_type = 'zalo_direct_send'
          AND ul.created_at >= $3 AND ul.created_at < $4
      ), 0)
      +
      COALESCE((
        SELECT SUM(quantity)
        FROM send_quota_reservations
        WHERE billing_user_id = $1
          AND actor_user_id = $2
          AND channel = 'zalo'
          AND is_metered = true
          AND status IN ('reserved', 'sending', 'uncertain', 'consumed')
          AND vn_day_start = $3 AND vn_day_end = $4
      ), 0)
    )::int AS total`,
    [ownerId, employeeId, dayStart, dayEnd]
  );
  return Number(rows[0]?.total || 0);
}

/**
 * Đếm tổng tin gửi của riêng nhân viên trong kỳ billing [cycleStart, cycleEnd).
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {number|string} ownerId
 * @param {number|string} employeeId
 * @param {string} channel
 * @param {Date|string} cycleStart
 * @param {Date|string} cycleEnd
 * @returns {Promise<number>}
 */
export async function countEmployeeSentInCycleWithLedger(
  queryable,
  ownerId,
  employeeId,
  channel,
  cycleStart,
  cycleEnd
) {
  if (channel === 'email') {
    const { rows } = await queryable.query(
      `SELECT (
        COALESCE((
          SELECT COUNT(*)
          FROM email_messages em
          JOIN campaigns c ON c.id = em.id_campaign
          WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1
            AND c.created_by = $2
            AND em.quota_reservation_id IS NULL
            AND em.status IN ('sent', 'delivered', 'bounced')
            AND NOT em.is_preview
            AND em.sent_at >= $3 AND em.sent_at < $4
        ), 0)
        +
        COALESCE((
          SELECT SUM(delta)
          FROM usage_logs ul
          WHERE ul.id_user = $1
            AND (ul.actor_user_id = $2 OR (ul.metadata->>'actorUserId')::bigint = $2)
            AND ul.quota_reservation_id IS NULL
            AND ul.resource_type = 'email_direct_send'
            AND ul.created_at >= $3 AND ul.created_at < $4
        ), 0)
        +
        COALESCE((
          SELECT SUM(quantity)
          FROM send_quota_reservations
          WHERE billing_user_id = $1
            AND actor_user_id = $2
            AND channel = 'email'
            AND is_metered = true
            AND status IN ('reserved', 'sending', 'uncertain', 'consumed')
            AND cycle_start = $3 AND cycle_end = $4
        ), 0)
      )::int AS total`,
      [ownerId, employeeId, cycleStart, cycleEnd]
    );
    return Number(rows[0]?.total || 0);
  }

  // channel === 'zalo'
  const { rows } = await queryable.query(
    `SELECT (
      COALESCE((
        SELECT COUNT(*)
        FROM zalo_messages zm
        JOIN campaigns c ON c.id = zm.id_campaign
        WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1
          AND c.created_by = $2
          AND zm.quota_reservation_id IS NULL
          AND zm.tracking_metadata->>'status' = 'sent'
          AND NOT zm.is_preview
          AND zm.sent_at >= $3 AND zm.sent_at < $4
      ), 0)
      +
      COALESCE((
        SELECT COUNT(*)
        FROM zalo_personal_messages zpm
        WHERE zpm.id_user = $2
          AND zpm.role = 'agent'
          AND zpm.metadata->>'source' = 'manual_inbox'
          AND zpm.quota_reservation_id IS NULL
          AND zpm.created_at >= $3 AND zpm.created_at < $4
      ), 0)
      +
      COALESCE((
        SELECT SUM(delta)
        FROM usage_logs ul
        WHERE ul.id_user = $1
          AND (ul.actor_user_id = $2 OR (ul.metadata->>'actorUserId')::bigint = $2)
          AND ul.quota_reservation_id IS NULL
          AND ul.resource_type = 'zalo_direct_send'
          AND ul.created_at >= $3 AND ul.created_at < $4
      ), 0)
      +
      COALESCE((
        SELECT SUM(quantity)
        FROM send_quota_reservations
        WHERE billing_user_id = $1
          AND actor_user_id = $2
          AND channel = 'zalo'
          AND is_metered = true
          AND status IN ('reserved', 'sending', 'uncertain', 'consumed')
          AND cycle_start = $3 AND cycle_end = $4
      ), 0)
    )::int AS total`,
    [ownerId, employeeId, cycleStart, cycleEnd]
  );
  return Number(rows[0]?.total || 0);
}

/**
 * Đếm tổng tin Email + Zalo trong kỳ của workspace (cho messages_per_period).
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {number|string} billingUserId
 * @param {Date} cycleStart
 * @param {Date} cycleEnd
 * @returns {Promise<number>}
 */
export async function countCombinedSentInCycleWithLedger(queryable, billingUserId, cycleStart, cycleEnd) {
  const emailCount = await countEmailSentInCycleWithLedger(queryable, billingUserId, cycleStart, cycleEnd);
  const zaloCount = await countZaloSentInCycleWithLedger(queryable, billingUserId, cycleStart, cycleEnd);
  return emailCount + zaloCount;
}

/**
 * Dò các reservation 'reserved' quá hạn lease.
 * Dùng FOR UPDATE SKIP LOCKED để sweeper worker chạy đồng thời an toàn.
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {number} [limit=50]
 * @returns {Promise<Array<object>>}
 */
export async function findExpiredReservations(queryable, limit = 50) {
  const { rows } = await queryable.query(
    `SELECT * FROM send_quota_reservations
     WHERE status = 'reserved'
       AND expires_at IS NOT NULL
       AND expires_at < NOW()
     ORDER BY expires_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [limit]
  );
  return rows;
}

/**
 * Dò các reservation 'sending' treo quá lâu (cần chuyển sang uncertain).
 * Dùng FOR UPDATE SKIP LOCKED để sweeper worker chạy đồng thời an toàn.
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {number} [staleSeconds=120]
 * @param {number} [limit=50]
 * @returns {Promise<Array<object>>}
 */
export async function findStaleSendingReservations(queryable, staleSeconds = 120, limit = 50) {
  const { rows } = await queryable.query(
    `SELECT * FROM send_quota_reservations
     WHERE status = 'sending'
       AND (
         (sending_at IS NOT NULL AND sending_at < NOW() - make_interval(secs => $1))
         OR
         (sending_at IS NULL AND created_at < NOW() - make_interval(secs => $1))
       )
     ORDER BY COALESCE(sending_at, created_at) ASC
     LIMIT $2
     FOR UPDATE SKIP LOCKED`,
    [staleSeconds, limit]
  );
  return rows;
}

/**
 * Lấy giới hạn plan và trạng thái subscription trực tiếp trong transaction client.
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {number|string} billingUserId
 * @returns {Promise<object|null>}
 */
export async function getWorkspacePlanLimits(queryable, billingUserId) {
  const { rows } = await queryable.query(
    `SELECT
       p.id AS plan_id,
       p.name AS plan_name,
       p.daily_email_limit,
       p.monthly_email_limit,
       p.daily_zalo_limit,
       p.monthly_zalo_limit,
       p.messages_per_period,
       COALESCE(p.grace_period_days, 0)::int AS grace_period_days,
       u.subscription_expires_at,
       (${EFFECTIVE_PLAN_ID_SQL}) AS effective_plan_id
     FROM users u
     LEFT JOIN plans p ON p.id = (${EFFECTIVE_PLAN_ID_SQL})
     WHERE u.id = $1
     LIMIT 1`,
    [billingUserId]
  );
  const row = rows[0];
  if (!row || !row.effective_plan_id) {
    return {
      has_plan: false,
      is_subscription_expired: false,
    };
  }

  const graceDays = Number(row.grace_period_days) || 0;
  const expiresAt = row.subscription_expires_at ? new Date(row.subscription_expires_at) : null;
  let graceUntil = null;
  if (expiresAt) {
    graceUntil = new Date(expiresAt);
    graceUntil.setUTCDate(graceUntil.getUTCDate() + graceDays);
  }

  const now = Date.now();
  const isExpired = expiresAt != null && graceUntil != null && now > graceUntil.getTime();

  return {
    has_plan: true,
    plan_id: row.plan_id,
    plan_name: row.plan_name,
    daily_email_limit: row.daily_email_limit,
    monthly_email_limit: row.monthly_email_limit,
    daily_zalo_limit: row.daily_zalo_limit,
    monthly_zalo_limit: row.monthly_zalo_limit,
    messages_per_period: row.messages_per_period,
    subscription_expires_at: expiresAt,
    is_subscription_expired: isExpired,
  };
}

/**
 * Lấy giới hạn hạn mức của nhân viên trực tiếp trong transaction client.
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {number|string} ownerId
 * @param {number|string} employeeId
 * @returns {Promise<object|null>}
 */
export async function getEmployeeSendLimits(queryable, ownerId, employeeId) {
  const { rows } = await queryable.query(
    `SELECT
       status,
       daily_email_limit,
       monthly_email_limit,
       daily_zalo_limit,
       monthly_zalo_limit
     FROM user_members
     WHERE owner_id = $1 AND employee_id = $2
     LIMIT 1`,
    [ownerId, employeeId]
  );
  return rows[0] || null;
}

/**
 * Tính số dư ví mua thêm khả dụng (granted - debited - active_holds) trong transaction client.
 * @param {import('pg').Pool|import('pg').PoolClient} queryable
 * @param {number|string} billingUserId
 * @param {string} walletItemKey
 * @returns {Promise<{ granted: number, debited: number, activeHolds: number, available: number }>}
 */
export async function getWalletAvailableBalance(queryable, billingUserId, walletItemKey) {
  const { rows } = await queryable.query(
    `SELECT
       (SELECT COALESCE(SUM(qty), 0)::int
        FROM topup_grants
        WHERE user_id = $1 AND item_key = $2 AND cycle_end IS NULL) AS granted,
       (SELECT COALESCE(SUM(qty), 0)::int
        FROM topup_debits
        WHERE user_id = $1 AND item_key = $2) AS debited,
       (SELECT COALESCE(SUM(wallet_quantity), 0)::int
        FROM send_quota_reservations
        WHERE billing_user_id = $1 AND wallet_item_key = $2 AND wallet_quantity > 0 AND status IN ('reserved', 'sending', 'uncertain')) AS active_holds`,
    [billingUserId, walletItemKey]
  );
  const row = rows[0] || {};
  const granted = Number(row.granted || 0);
  const debited = Number(row.debited || 0);
  const activeHolds = Number(row.active_holds || 0);
  const available = Math.max(0, granted - debited - activeHolds);

  return {
    granted,
    debited,
    activeHolds,
    available,
  };
}
