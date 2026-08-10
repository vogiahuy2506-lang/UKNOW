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
