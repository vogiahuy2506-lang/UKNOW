import db from '../../config/database.js';
import { stuckEinvoiceKindSql } from '../payment/einvoice.repository.js';

export async function findEinvoices({
  status,
  search,
  dateFrom,
  dateTo,
  page = 1,
  limit = 20,
  staleHours = 6,
} = {}) {
  const conditions = ['1=1'];
  const params = [];
  let p = 1;

  if (status === 'stuck') {
    conditions.push(`(${stuckEinvoiceKindSql(`$${p++}`)}) IS NOT NULL`);
    params.push(String(staleHours));
  } else if (status) {
    conditions.push(`e.status = $${p++}`);
    params.push(status);
  }

  if (dateFrom) {
    conditions.push(`e.created_at >= $${p++}`);
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push(`e.created_at < $${p++}`);
    params.push(dateTo);
  }
  if (search) {
    conditions.push(`(o.user_email ILIKE $${p} OR CAST(o.order_code AS TEXT) ILIKE $${p} OR e.so_hdon ILIKE $${p})`);
    params.push(`%${search}%`);
    p++;
  }

  const where = conditions.join(' AND ');
  const offset = (page - 1) * limit;

  const [rowsRes, countRes] = await Promise.all([
    db.query(
      `SELECT
         e.id,
         e.status,
         e.error_code AS "errorCode",
         e.error_message AS "errorMessage",
         e.so_hdon AS "soHdon",
         e.khhdon,
         e.cqt_code AS "cqtCode",
         e.email_status AS "emailStatus",
         e.attempt_count AS "attemptCount",
         e.email_attempt_count AS "emailAttemptCount",
         e.issued_at AS "issuedAt",
         e.created_at AS "createdAt",
         e.updated_at AS "updatedAt",
         o.order_code AS "orderCode",
         o.amount,
         o.user_email AS "userEmail",
         u.full_name AS "userFullName"
       FROM einvoices e
       JOIN orders o ON o.id = e.order_id
       LEFT JOIN users u ON u.id = o.user_id
       WHERE ${where}
       ORDER BY e.created_at DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      [...params, limit, offset],
    ),
    db.query(
      `SELECT COUNT(*)
       FROM einvoices e
       JOIN orders o ON o.id = e.order_id
       LEFT JOIN users u ON u.id = o.user_id
       WHERE ${where}`,
      params,
    ),
  ]);

  return {
    rows: rowsRes.rows,
    total: Number(countRes.rows[0]?.count || 0),
  };
}

export async function resetEinvoiceForAdminRetry(id, queryable = db) {
  const { rows } = await queryable.query(
    `UPDATE einvoices
     SET status = 'pending',
         error_code = NULL,
         error_message = NULL,
         next_attempt_at = NULL,
         processing_started_at = NULL,
         updated_at = NOW()
     WHERE id = $1 AND status IN ('failed', 'cqt_rejected')
     RETURNING *`,
    [id],
  );
  return rows[0] || null;
}

export async function resetEinvoiceEmailForAdminResend(id, queryable = db) {
  const { rows } = await queryable.query(
    `UPDATE einvoices
     SET email_status = 'pending',
         email_next_attempt_at = NULL,
         updated_at = NOW()
     WHERE id = $1 AND status IN ('issued', 'cqt_ok')
     RETURNING *`,
    [id],
  );
  return rows[0] || null;
}

export async function findEinvoiceById(id, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT e.*, o.order_code AS "orderCode", o.user_email AS "userEmail"
     FROM einvoices e
     JOIN orders o ON o.id = e.order_id
     WHERE e.id = $1
     LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}
