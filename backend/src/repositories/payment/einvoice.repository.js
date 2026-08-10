import db from '../../config/database.js';

export const RETRYABLE_MATBAO_ERROR_CODES = new Set([
  '315', '321', '322', '325', '326', '329', '330',
  'timeout', 'network',
]);

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
 * pending < issued|failed < cqt_ok|cqt_rejected (terminals equal rank).
 */
export function einvoiceStatusRank(status) {
  switch (String(status || '')) {
    case 'pending': return 0;
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
       o.amount AS order_amount,
       o.invoice_info,
       o.note AS order_note,
       e.id AS einvoice_id,
       e.status AS einvoice_status,
       e.ma_so_hdon,
       e.so_hdon,
       e.khhdon,
       e.cqt_code,
       e.pdf_url,
       e.issued_at,
       e.error_code,
       e.error_message
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
 */
export async function insertPendingEinvoice({
  orderId,
  maTraCuu,
  mtchieu,
  khmshdon,
  khhdon,
  requestPayload = null,
}, queryable = db) {
  try {
    const { rows } = await queryable.query(
      `INSERT INTO einvoices (
         order_id, ma_tra_cuu, mtchieu, khmshdon, khhdon,
         status, request_payload, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW(), NOW())
       RETURNING *`,
      [
        orderId,
        maTraCuu,
        mtchieu,
        khmshdon || null,
        khhdon || null,
        requestPayload ? JSON.stringify(requestPayload) : null,
      ],
    );
    return rows[0];
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
  const { rows } = await queryable.query(
    `UPDATE einvoices SET
       status = 'issued',
       ma_so_hdon = COALESCE($2, ma_so_hdon),
       so_hdon = COALESCE($3, so_hdon),
       pdf_url = COALESCE($4, pdf_url),
       error_code = NULL,
       error_message = NULL,
       response_payload = COALESCE($5, response_payload),
       request_payload = COALESCE($6, request_payload),
       issued_at = COALESCE(issued_at, NOW()),
       updated_at = NOW()
     WHERE id = $1
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
} = {}, queryable = db) {
  const { rows } = await queryable.query(
    `UPDATE einvoices SET
       status = 'failed',
       error_code = $2,
       error_message = $3,
       response_payload = COALESCE($4, response_payload),
       request_payload = COALESCE($5, request_payload),
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      errorCode != null ? String(errorCode) : null,
      errorMessage != null ? String(errorMessage).slice(0, 2000) : null,
      responsePayload ? JSON.stringify(responsePayload) : null,
      requestPayload ? JSON.stringify(requestPayload) : null,
    ],
  );
  return rows[0] || null;
}

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

export async function resetEinvoiceForRetry(id, queryable = db) {
  const { rows } = await queryable.query(
    `UPDATE einvoices SET
       status = 'pending',
       error_code = NULL,
       error_message = NULL,
       updated_at = NOW()
     WHERE id = $1 AND status = 'failed'
     RETURNING *`,
    [id],
  );
  return rows[0] || null;
}
