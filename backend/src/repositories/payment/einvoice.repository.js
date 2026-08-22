import db from '../../config/database.js';

export const RETRYABLE_MATBAO_ERROR_CODES = new Set([
  '315', '321', '322', '325', '326', '329', '330',
  'timeout', 'network',
]);

/**
 * Mệnh đề phân loại hoá đơn kẹt, dùng chung cho cảnh báo (alert.repository.js) và
 * trang admin (adminEinvoice.repository.js). Một định nghĩa, hai nơi dùng — chép
 * lần hai thì khi RETRYABLE_MATBAO_ERROR_CODES đổi, hai chỗ sẽ báo hai con số khác nhau.
 *
 * Danh sách mã lỗi được nội suy thẳng vào chuỗi SQL: chúng là hằng số tĩnh trong
 * chính file này, KHÔNG phải dữ liệu người dùng, nên không có đường tiêm SQL. Nhờ vậy
 * mệnh đề chỉ còn đúng MỘT tham số và cắm được vào câu query nào cũng dễ.
 *
 * @param {string} staleHoursPlaceholder — vị trí tham số của caller, ví dụ '$1' hoặc '$5'
 */
export function stuckEinvoiceKindSql(staleHoursPlaceholder) {
  const codes = [...RETRYABLE_MATBAO_ERROR_CODES].map((c) => `'${c}'`).join(',');
  return `CASE
  WHEN e.status = 'cqt_rejected' THEN 'dead'
  WHEN e.status = 'failed'
    AND (e.error_code IS NULL OR NOT (e.error_code = ANY(ARRAY[${codes}]::text[]))) THEN 'dead'
  WHEN e.updated_at <= NOW() - (${staleHoursPlaceholder} || ' hours')::interval THEN 'stalled'
  ELSE NULL
END`;
}

const LEASE_MINUTES = () => {
  const n = Number(process.env.EINVOICE_PROCESSING_LEASE_MINUTES);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 15;
};

export async function findEinvoiceById(id, queryable = db) {
  const { rows } = await queryable.query(
    'SELECT * FROM einvoices WHERE id = $1 LIMIT 1',
    [id],
  );
  return rows[0] || null;
}

export async function findEinvoiceByOrderId(orderId, queryable = db) {
  const { rows } = await queryable.query(
    'SELECT * FROM einvoices WHERE order_id = $1 LIMIT 1',
    [orderId],
  );
  return rows[0] || null;
}

export async function findEinvoiceByMaTraCuu(maTraCuu, queryable = db) {
  const { rows } = await queryable.query(
    'SELECT * FROM einvoices WHERE ma_tra_cuu = $1 LIMIT 1',
    [maTraCuu],
  );
  return rows[0] || null;
}

export async function findEinvoiceByMaSoHdon(maSoHdon, queryable = db) {
  if (!maSoHdon) return null;
  const { rows } = await queryable.query(
    'SELECT * FROM einvoices WHERE ma_so_hdon = $1 LIMIT 1',
    [maSoHdon],
  );
  return rows[0] || null;
}

/**
 * Rank for forward-only CQT status transitions.
 * pending|processing < issued|failed < cqt_ok|cqt_rejected (terminals equal rank).
 */
export function einvoiceStatusRank(status) {
  switch (String(status || '')) {
    case 'pending':
    case 'processing': return 0;
    case 'failed': return 1;
    case 'issued': return 2;
    case 'cqt_ok':
    case 'cqt_rejected': return 3;
    default: return 0;
  }
}

/**
 * Map Mat Bao MaTTHDon → local status (docx).
 * 4 = Đã cấp mã/tiếp nhận → cqt_ok
 * 6 = Không đủ ĐK cấp mã → cqt_rejected
 * else → issued (promote from pending; never used to downgrade)
 */
export function mapMaTTHDonToStatus(statusCode) {
  const code = Number(statusCode);
  if (code === 4) return 'cqt_ok';
  if (code === 6) return 'cqt_rejected';
  return 'issued';
}

/**
 * Apply CQT webhook fields. Forward-only status. Fills ma_so_hdon from InvID when null.
 * @returns {Promise<object|null>}
 */
export async function applyCqtWebhook(id, {
  maSoHdon = null,
  soHdon = null,
  cqtCode = null,
  statusCode = null,
  statusText = null,
  rawPayload = null,
} = {}, queryable = db) {
  if (!id) return null;
  const mapped = mapMaTTHDonToStatus(statusCode);
  const mappedRank = einvoiceStatusRank(mapped);

  const { rows } = await queryable.query(
    `UPDATE einvoices SET
       ma_so_hdon = COALESCE(ma_so_hdon, $2),
       so_hdon = COALESCE($3::text, so_hdon),
       cqt_code = COALESCE($4::text, cqt_code),
       status = CASE
         WHEN $5::int > CASE status
           WHEN 'pending' THEN 0
           WHEN 'processing' THEN 0
           WHEN 'failed' THEN 1
           WHEN 'issued' THEN 2
           WHEN 'cqt_ok' THEN 3
           WHEN 'cqt_rejected' THEN 3
           ELSE 0
         END THEN $6::text
         ELSE status
       END,
       response_payload = COALESCE($7::jsonb, response_payload),
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      maSoHdon || null,
      soHdon != null && soHdon !== '' ? String(soHdon) : null,
      cqtCode != null && cqtCode !== '' ? String(cqtCode) : null,
      mappedRank,
      mapped,
      rawPayload
        ? JSON.stringify({
          ...(typeof rawPayload === 'object' ? rawPayload : { raw: rawPayload }),
          _statusText: statusText || undefined,
        })
        : null,
    ],
  );
  return rows[0] || null;
}

/**
 * Owner-scoped invoice lookup by order_code.
 * Returns { order, einvoice } or null if not owner / missing order.
 */
export async function findOrderInvoiceForOwner(orderCode, userId, queryable = db) {
  if (orderCode == null || userId == null) return null;
  const { rows } = await queryable.query(
    `SELECT
       o.id AS order_id,
       o.order_code,
       o.user_id,
       o.user_email,
       o.amount AS order_amount,
       o.invoice_info,
       o.note AS order_note,
       e.id AS einvoice_id,
       e.status AS einvoice_status,
       e.ma_so_hdon,
       e.so_hdon,
       e.khhdon,
       e.ma_tra_cuu,
       e.cqt_code,
       e.pdf_url,
       e.issued_at,
       e.error_code,
       e.error_message,
       e.email_status,
       e.email_sent_at
     FROM orders o
     LEFT JOIN einvoices e ON e.order_id = o.id
     WHERE o.order_code = $1
       AND o.user_id = $2
     LIMIT 1`,
    [orderCode, userId],
  );
  return rows[0] || null;
}

/**
 * Insert pending row. Returns null on unique conflict (already exists).
 * New rows get email_status='pending' (legacy rows keep null).
 */
export async function insertPendingEinvoice({
  orderId,
  maTraCuu,
  mtchieu,
  khmshdon,
  khhdon,
  requestPayload = null,
  emailStatus = 'pending',
}, queryable = db) {
  try {
    const { rows } = await queryable.query(
      `INSERT INTO einvoices (
         order_id, ma_tra_cuu, mtchieu, khmshdon, khhdon,
         status, email_status, request_payload, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, 'pending', $7, $6, NOW(), NOW())
       ON CONFLICT (order_id) DO NOTHING
       RETURNING *`,
      [
        orderId,
        maTraCuu,
        mtchieu,
        khmshdon || null,
        khhdon || null,
        requestPayload ? JSON.stringify(requestPayload) : null,
        emailStatus,
      ],
    );
    return rows[0] || null;
  } catch (err) {
    if (err?.code === '23505') return null;
    throw err;
  }
}

export async function markEinvoiceIssued(id, {
  maSoHdon = null,
  soHdon = null,
  pdfUrl = null,
  responsePayload = null,
  requestPayload = null,
} = {}, queryable = db) {
  // Forward-only status: never downgrade cqt_ok / cqt_rejected → issued.
  const { rows } = await queryable.query(
    `UPDATE einvoices SET
       status = CASE
         WHEN status IN ('cqt_ok', 'cqt_rejected') THEN status
         ELSE 'issued'
       END,
       processing_started_at = NULL,
       next_attempt_at = NULL,
       ma_so_hdon = COALESCE($2, ma_so_hdon),
       so_hdon = COALESCE($3, so_hdon),
       pdf_url = COALESCE($4, pdf_url),
       error_code = NULL,
       error_message = NULL,
       response_payload = COALESCE($5, response_payload),
       request_payload = COALESCE($6, request_payload),
       issued_at = COALESCE(issued_at, NOW()),
       email_status = COALESCE(email_status, 'pending'),
       updated_at = NOW()
     WHERE id = $1
       AND status IN ('pending', 'processing', 'failed', 'issued', 'cqt_ok', 'cqt_rejected')
     RETURNING *`,
    [
      id,
      maSoHdon,
      soHdon,
      pdfUrl,
      responsePayload ? JSON.stringify(responsePayload) : null,
      requestPayload ? JSON.stringify(requestPayload) : null,
    ],
  );
  return rows[0] || null;
}

export async function markEinvoiceFailed(id, {
  errorCode = null,
  errorMessage = null,
  responsePayload = null,
  requestPayload = null,
  nextAttemptAt = null,
} = {}, queryable = db) {
  // Never overwrite issued / CQT terminal with failed (late error after success).
  const { rows } = await queryable.query(
    `UPDATE einvoices SET
       status = 'failed',
       processing_started_at = NULL,
       attempt_count = attempt_count + 1,
       next_attempt_at = $6,
       error_code = $2,
       error_message = $3,
       response_payload = COALESCE($4, response_payload),
       request_payload = COALESCE($5, request_payload),
       updated_at = NOW()
     WHERE id = $1
       AND status IN ('pending', 'processing')
     RETURNING *`,
    [
      id,
      errorCode != null ? String(errorCode) : null,
      errorMessage != null ? String(errorMessage).slice(0, 2000) : null,
      responsePayload ? JSON.stringify(responsePayload) : null,
      requestPayload ? JSON.stringify(requestPayload) : null,
      nextAttemptAt,
    ],
  );
  return rows[0] || null;
}

/**
 * Atomically claim a specific einvoice for Mat Bao create (fast-path or cron).
 * @returns {Promise<object|null>} claimed row or null if another worker holds it / not eligible
 */
export async function claimEinvoiceByIdForIssue(einvoiceId, queryable = db) {
  if (!einvoiceId) return null;
  const leaseMinutes = LEASE_MINUTES();
  const codes = [...RETRYABLE_MATBAO_ERROR_CODES];
  const { rows } = await queryable.query(
    `WITH candidate AS (
       SELECT e.id
       FROM einvoices e
       WHERE e.id = $1
         AND (
           (e.status = 'pending' AND (e.next_attempt_at IS NULL OR e.next_attempt_at <= NOW()))
           OR (
             e.status = 'failed'
             AND e.error_code = ANY($2::text[])
             AND (e.next_attempt_at IS NULL OR e.next_attempt_at <= NOW())
           )
           OR (
             e.status = 'processing'
             AND e.processing_started_at IS NOT NULL
             AND e.processing_started_at < NOW() - ($3 || ' minutes')::interval
           )
         )
       FOR UPDATE SKIP LOCKED
     )
     UPDATE einvoices e
        SET status = 'processing',
            processing_started_at = NOW(),
            attempt_count = attempt_count + 1,
            updated_at = NOW()
       FROM candidate
      WHERE e.id = candidate.id
      RETURNING e.*`,
    [einvoiceId, codes, String(leaseMinutes)],
  );
  return rows[0] || null;
}

/**
 * Atomically claim one dispatchable job → processing.
 */
export async function claimNextEinvoiceJob({ limit = 1 } = {}, queryable = db) {
  const leaseMinutes = LEASE_MINUTES();
  const codes = [...RETRYABLE_MATBAO_ERROR_CODES];
  const { rows } = await queryable.query(
    `WITH candidate AS (
       SELECT e.id
       FROM einvoices e
       WHERE (
         (e.status = 'pending' AND (e.next_attempt_at IS NULL OR e.next_attempt_at <= NOW()))
         OR (
           e.status = 'failed'
           AND e.error_code = ANY($2::text[])
           AND (e.next_attempt_at IS NULL OR e.next_attempt_at <= NOW())
         )
         OR (
           e.status = 'processing'
           AND e.processing_started_at IS NOT NULL
           AND e.processing_started_at < NOW() - ($3 || ' minutes')::interval
         )
       )
       ORDER BY COALESCE(e.next_attempt_at, e.updated_at) ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE einvoices e
        SET status = 'processing',
            processing_started_at = NOW(),
            attempt_count = attempt_count + 1,
            updated_at = NOW()
       FROM candidate
      WHERE e.id = candidate.id
      RETURNING e.*`,
    [Math.max(1, limit), codes, String(leaseMinutes)],
  );
  return rows;
}

export async function findEinvoiceJobWithOrder(einvoiceId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT e.*, o.order_code, o.invoice_info, o.amount, o.note, o.user_email, o.user_id,
            o.billing_period, p.name AS plan_name,
            -- orders.updated_at là TIMESTAMP *không* múi giờ, chứa giờ VN dạng trần
            -- (pool đặt timezone Asia/Ho_Chi_Minh). Container chạy UTC nên node-pg đọc
            -- chuỗi đó thành UTC → hoá đơn từng in lệch +7 tiếng. Phải quy về mốc thật
            -- trước khi COALESCE, đừng bỏ AT TIME ZONE đi.
            COALESCE(o.paid_at, o.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS paid_at,
            o.created_at
     FROM einvoices e
     JOIN orders o ON o.id = e.order_id
     LEFT JOIN plans p ON p.id = o.plan_id
     WHERE e.id = $1
     LIMIT 1`,
    [einvoiceId],
  );
  return rows[0] || null;
}

/**
 * Claim a specific email delivery job (fast-path after issue).
 */
export async function claimEinvoiceByIdForEmail(einvoiceId, queryable = db) {
  if (!einvoiceId) return null;
  const leaseMinutes = LEASE_MINUTES();
  const { rows } = await queryable.query(
    `WITH candidate AS (
       SELECT e.id
       FROM einvoices e
       WHERE e.id = $1
         AND e.status IN ('issued', 'cqt_ok')
         AND (
           (
             e.email_status = 'pending'
             AND (e.email_next_attempt_at IS NULL OR e.email_next_attempt_at <= NOW())
           )
           OR (
             e.email_status = 'failed'
             AND e.email_next_attempt_at IS NOT NULL
             AND e.email_next_attempt_at <= NOW()
           )
           OR (
             e.email_status = 'sending'
             AND e.email_last_attempt_at IS NOT NULL
             AND e.email_last_attempt_at < NOW() - ($2 || ' minutes')::interval
           )
         )
       FOR UPDATE SKIP LOCKED
     )
     UPDATE einvoices e
        SET email_status = 'sending',
            email_attempt_count = email_attempt_count + 1,
            email_last_attempt_at = NOW(),
            email_next_attempt_at = NULL,
            updated_at = NOW()
       FROM candidate
      WHERE e.id = candidate.id
      RETURNING e.*`,
    [einvoiceId, String(leaseMinutes)],
  );
  return rows[0] || null;
}

/**
 * Claim one email delivery job.
 * failed only retries when email_next_attempt_at is set (permanent fail keeps NULL).
 */
export async function claimNextEinvoiceEmailJob({ limit = 1 } = {}, queryable = db) {
  const leaseMinutes = LEASE_MINUTES();
  const { rows } = await queryable.query(
    `WITH candidate AS (
       SELECT e.id
       FROM einvoices e
       WHERE e.status IN ('issued', 'cqt_ok')
         AND (
           (
             e.email_status = 'pending'
             AND (e.email_next_attempt_at IS NULL OR e.email_next_attempt_at <= NOW())
           )
           OR (
             e.email_status = 'failed'
             AND e.email_next_attempt_at IS NOT NULL
             AND e.email_next_attempt_at <= NOW()
           )
           OR (
             e.email_status = 'sending'
             AND e.email_last_attempt_at IS NOT NULL
             AND e.email_last_attempt_at < NOW() - ($2 || ' minutes')::interval
           )
         )
       ORDER BY COALESCE(e.email_next_attempt_at, e.email_last_attempt_at, e.updated_at) ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE einvoices e
        SET email_status = 'sending',
            email_attempt_count = email_attempt_count + 1,
            email_last_attempt_at = NOW(),
            email_next_attempt_at = NULL,
            updated_at = NOW()
       FROM candidate
      WHERE e.id = candidate.id
      RETURNING e.*`,
    [Math.max(1, limit), String(leaseMinutes)],
  );
  return rows;
}

export async function markEinvoiceEmailSent(id, queryable = db) {
  const { rows } = await queryable.query(
    `UPDATE einvoices SET
       email_status = 'sent',
       email_sent_at = COALESCE(email_sent_at, NOW()),
       email_last_error = NULL,
       email_next_attempt_at = NULL,
       updated_at = NOW()
     WHERE id = $1
       AND email_status IS DISTINCT FROM 'sent'
     RETURNING *`,
    [id],
  );
  return rows[0] || null;
}

/**
 * Mark email failed. nextAttemptAt=null → permanent (no cron retry).
 * Never downgrades email_status='sent'.
 * Signature: (id, errorMessage, opts?, queryable?) — opts may be omitted; legacy 3rd arg queryable supported.
 */
export async function markEinvoiceEmailFailed(id, errorMessage, optsOrQueryable = {}, maybeQueryable = db) {
  let opts = optsOrQueryable;
  let queryable = maybeQueryable;
  if (optsOrQueryable && typeof optsOrQueryable.query === 'function') {
    queryable = optsOrQueryable;
    opts = {};
  }
  const nextAttemptAt = Object.prototype.hasOwnProperty.call(opts || {}, 'nextAttemptAt')
    ? opts.nextAttemptAt
    : null;

  const { rows } = await queryable.query(
    `UPDATE einvoices SET
       email_status = 'failed',
       email_last_error = $2,
       email_next_attempt_at = $3,
       updated_at = NOW()
     WHERE id = $1
       AND email_status IN ('pending', 'sending', 'failed')
     RETURNING *`,
    [
      id,
      errorMessage != null ? String(errorMessage).slice(0, 2000) : null,
      nextAttemptAt,
    ],
  );
  return rows[0] || null;
}

/**
 * Orders that requested invoice but have no einvoices row (repair candidates).
 */
export async function listMissingEinvoiceIntents({
  fromIso,
  limit = 20,
} = {}, queryable = db) {
  if (!fromIso) return [];
  const { rows } = await queryable.query(
    `SELECT o.id, o.order_code, o.invoice_info, o.amount, o.note, o.user_email, o.created_at
     FROM orders o
     LEFT JOIN einvoices e ON e.order_id = o.id
     WHERE o.status = 'success'
       AND o.created_at >= $1::timestamptz
       AND ((o.invoice_info->>'vatAmount')::numeric > 0 OR (o.invoice_info->>'wantInvoice') = 'true')
       AND e.id IS NULL
     ORDER BY o.created_at ASC
     LIMIT $2`,
    [fromIso, Math.max(1, limit)],
  );
  return rows;
}

/** @deprecated Prefer claimNextEinvoiceJob — kept for older tests. */
export async function listRetryableFailedEinvoices({ limit = 20 } = {}, queryable = db) {
  const codes = [...RETRYABLE_MATBAO_ERROR_CODES];
  const { rows } = await queryable.query(
    `SELECT e.*, o.order_code, o.invoice_info, o.amount, o.note, o.user_email
     FROM einvoices e
     JOIN orders o ON o.id = e.order_id
     WHERE e.status = 'failed'
       AND e.error_code = ANY($1::text[])
     ORDER BY e.updated_at ASC
     LIMIT $2`,
    [codes, limit],
  );
  return rows;
}

/** @deprecated Prefer claimNextEinvoiceJob */
export async function resetEinvoiceForRetry(id, queryable = db) {
  const { rows } = await queryable.query(
    `UPDATE einvoices SET
       status = 'pending',
       error_code = NULL,
       error_message = NULL,
       next_attempt_at = NULL,
       updated_at = NOW()
     WHERE id = $1 AND status = 'failed'
     RETURNING *`,
    [id],
  );
  return rows[0] || null;
}
