import db from '../config/database.js';
import { EFFECTIVE_PLAN_ID_SQL } from '../utils/billingCycle.util.js';

export const COUNTED_KB_STATUSES = ['pending', 'queued', 'processing', 'ready'];

export async function acquireKbQuotaLock(client, ownerUserId) {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
    [`kb:${ownerUserId}`, 'kb_quota']
  );
}

export async function getEffectiveKbLimits(ownerUserId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT p.max_kb_documents AS "maxDocuments",
            p.max_kb_extracted_chars AS "maxExtractedChars"
       FROM users u
       LEFT JOIN plans p ON p.id = (${EFFECTIVE_PLAN_ID_SQL})
      WHERE u.id = $1
      LIMIT 1`,
    [ownerUserId]
  );
  return rows[0] || null;
}

export async function getKbUsage(ownerUserId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT
       (
         SELECT COUNT(*) FROM kb_documents
          WHERE id_user = $1 AND status = ANY($2::varchar[])
       ) + (
         SELECT COUNT(*) FROM custom_chatbot_documents
          WHERE owner_user_id = $1 AND status = ANY($2::varchar[])
       ) AS "documentCount",
       (
         SELECT COALESCE(SUM(extracted_chars), 0) FROM kb_documents
          WHERE id_user = $1 AND status = ANY($2::varchar[])
       ) + (
         SELECT COALESCE(SUM(extracted_chars), 0) FROM custom_chatbot_documents
          WHERE owner_user_id = $1 AND status = ANY($2::varchar[])
       ) AS "extractedChars"`,
    [ownerUserId, COUNTED_KB_STATUSES]
  );
  return rows[0] || { documentCount: '0', extractedChars: '0' };
}

export async function countInvalidActivePlanKbLimits(queryable = db) {
  const { rows } = await queryable.query(
    `SELECT COUNT(*)::integer AS count
       FROM plans
      WHERE is_active = TRUE
        AND (max_kb_documents IS NULL OR max_kb_documents <= 0
          OR max_kb_extracted_chars IS NULL OR max_kb_extracted_chars <= 0)`
  );
  return rows[0]?.count || 0;
}
