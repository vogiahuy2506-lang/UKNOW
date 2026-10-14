/**
 * PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-7b — chỉ mục cho chốt đồng ý (migration 301).
 *
 * Chốt đồng ý PR-2 tra `form_submissions` + `leads` cho TỪNG người nhận trong vòng gửi. Không đo thời gian (chập chờn theo máy): chạy EXPLAIN
 * trên CHÍNH câu truy vấn mà `campaignEmailSender.repository.js` gửi (dựng bằng `buildNewestConsentSql`, cùng các mảnh `CONSENT_*_MATCH_SQL`) với
 * `enable_seqscan = off` rồi khẳng định `Index Cond` của đúng index chứa BIỂU THỨC được tra (không chỉ "kế hoạch có nhắc tên index": index
 * (workspace_owner_id, biểu_thức) vẫn có thể được chọn chỉ để lọc workspace_owner_id, còn biểu thức rơi xuống Filter = quét hết workspace).
 * Biểu thức index lệch một ký tự so với truy vấn → biểu thức không vào Index Cond → test đỏ. Có ca đối chứng để chứng minh phép kiểm đủ nhạy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from '@jest/globals';
import db from '../../src/config/database.js';
import {
  CONSENT_LEAD_EMAIL_MATCH_SQL,
  CONSENT_FORM_EMAIL_MATCH_SQL,
  CONSENT_LEAD_PHONE_MATCH_SQL,
  CONSENT_FORM_PHONE_MATCH_SQL,
  buildNewestConsentSql,
} from '../../src/repositories/campaign/campaignEmailSender.repository.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_301 = path.resolve(here, '..', '..', 'migrations', '301_consent_lookup_indexes.sql');

const NEW_INDEXES = [
  'idx_form_submissions_owner_email_key',
  'idx_form_submissions_owner_phone_key',
  'idx_leads_phone_key',
  'idx_leads_email',
];

/** Dòng `Index Cond` ngay dưới node dùng `indexName` (null nếu index không được dùng / không có điều kiện). */
function indexCondOf(plan, indexName) {
  const lines = plan.split('\n');
  const at = lines.findIndex((l) => l.includes(indexName));
  if (at === -1) return null;
  for (let i = at + 1; i < lines.length; i += 1) {
    if (lines[i].includes('->')) break; // sang node kế
    const m = lines[i].match(/Index Cond:\s*(.*)$/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Nạp dữ liệu XÁC ĐỊNH trong chính transaction EXPLAIN (ROLLBACK xong là mất, không để rác cho suite khác):
 * một workspace có SEED_ROWS bài nộp + SEED_ROWS lead, mỗi dòng một email/SĐT khác nhau, rồi ANALYZE.
 *
 * Vì sao cần (13/10/2026, Deploy Backend 38376434108, shard 1/8): bảng gần rỗng thì `idx_form_submissions_owner`
 * (chỉ workspace_owner_id) và index biểu thức có chi phí gần bằng nhau, thống kê lại tuỳ dữ liệu suite trước trong cùng
 * shard để lại → planner lúc chọn index này lúc chọn index kia → `formCond` null, đỏ chập chờn. Với một workspace đông
 * dòng, lọc theo workspace phải đọc cả nghìn dòng còn index biểu thức trúng ~1 dòng → kế hoạch ổn định, và gần đúng
 * hình dạng production (workspace nhiều bài nộp) hơn bảng rỗng.
 *
 * @returns {Promise<number>} id workspace để truyền làm $1
 */
const SEED_ROWS = 2000;
async function seedOneBusyWorkspace(client) {
  const { rows: [owner] } = await client.query(
    `INSERT INTO users (username, email, password_hash, full_name, status, is_verified, role, created_at, updated_at)
     VALUES ('consent_idx_owner', 'consent_idx_owner@test.local', 'x', 'consent idx', 'active', TRUE, 'user', NOW(), NOW())
     RETURNING id`
  );
  const { rows: [form] } = await client.query(
    "INSERT INTO forms (workspace_owner_id, public_key, title) VALUES ($1, 'consentidxform', 'consent idx') RETURNING id",
    [owner.id]
  );
  await client.query(
    `INSERT INTO form_submissions (form_id, workspace_owner_id, access_token, respondent_email, respondent_phone, marketing_consent)
     SELECT $1, $2, 'consent-idx-' || i, 'r' || i || '@seed.test', '09' || lpad(i::text, 8, '0'), (i % 2 = 0)
       FROM generate_series(1, ${SEED_ROWS}) AS i`,
    [form.id, owner.id]
  );
  await client.query(
    `INSERT INTO leads (workspace_owner_id, id_user, email, phone, marketing_consent)
     SELECT $1, $1, 'l' || i || '@seed.test', '08' || lpad(i::text, 8, '0'), (i % 2 = 0)
       FROM generate_series(1, ${SEED_ROWS}) AS i`,
    [owner.id]
  );
  await client.query('ANALYZE form_submissions');
  await client.query('ANALYZE leads');
  return Number(owner.id);
}

/** EXPLAIN `sql` với $1 = workspace đông dòng vừa nạp, $2 = `matchValue`. */
async function explain(sql, matchValue) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const ownerId = await seedOneBusyWorkspace(client);
    await client.query('SET LOCAL enable_seqscan = off');
    const result = await client.query(`EXPLAIN ${sql}`, [ownerId, matchValue]);
    await client.query('ROLLBACK');
    return result.rows.map((r) => r['QUERY PLAN']).join('\n');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

describe('migration 301 — chạy file thật trên Postgres', () => {
  const migrationSql = fs.readFileSync(MIGRATION_301, 'utf8');

  it('bootstrap (lược đồ test) đã mirror migration: index có sẵn trước khi chạy file migration', async () => {
    // PHẢI chạy TRƯỚC ca chạy file migration (ca đó có thể tự tạo index). bootstrap.sql dựng lược đồ test cho mọi suite khác.
    const { rows } = await db.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname LIKE 'idx_form_submissions_owner_%_key'"
    );
    expect(rows.map((r) => r.indexname).sort()).toEqual([
      'idx_form_submissions_owner_email_key',
      'idx_form_submissions_owner_phone_key',
    ]);
  });

  it('chạy file migration thật HAI lần không lỗi (IF NOT EXISTS) và đủ 4 index có mặt', async () => {
    await db.query(migrationSql);
    await db.query(migrationSql);

    const { rows } = await db.query(
      'SELECT indexname, tablename FROM pg_indexes WHERE schemaname = current_schema() AND indexname = ANY($1::text[])',
      [NEW_INDEXES]
    );
    const byName = Object.fromEntries(rows.map((r) => [r.indexname, r.tablename]));
    expect(byName).toEqual({
      idx_form_submissions_owner_email_key: 'form_submissions',
      idx_form_submissions_owner_phone_key: 'form_submissions',
      idx_leads_phone_key: 'leads',
      idx_leads_email: 'leads',
    });
  });
});

describe('EXPLAIN câu truy vấn chốt đồng ý PR-2 (enable_seqscan = off, workspace đông dòng)', () => {
  it('theo EMAIL: biểu thức LOWER(respondent_email) nằm trong Index Cond của idx_form_submissions_owner_email_key; leads dùng idx_leads_email', async () => {
    const plan = await explain(buildNewestConsentSql(CONSENT_LEAD_EMAIL_MATCH_SQL, CONSENT_FORM_EMAIL_MATCH_SQL), 'a@x.com');

    const formCond = indexCondOf(plan, 'idx_form_submissions_owner_email_key');
    expect(formCond).not.toBeNull();
    expect(formCond).toMatch(/workspace_owner_id/);
    expect(formCond).toMatch(/lower\(\(respondent_email\)::text\) = 'a@x\.com'/);

    const leadCond = indexCondOf(plan, 'idx_leads_email');
    expect(leadCond).not.toBeNull();
    expect(leadCond).toMatch(/\(email\)::text = 'a@x\.com'/);
  });

  it('theo SĐT (9 số cuối): biểu thức RIGHT(regexp_replace(...), 9) nằm trong Index Cond của idx_form_submissions_owner_phone_key và idx_leads_phone_key', async () => {
    const plan = await explain(buildNewestConsentSql(CONSENT_LEAD_PHONE_MATCH_SQL, CONSENT_FORM_PHONE_MATCH_SQL), '901234567');

    const formCond = indexCondOf(plan, 'idx_form_submissions_owner_phone_key');
    expect(formCond).not.toBeNull();
    expect(formCond).toMatch(/workspace_owner_id/);
    expect(formCond).toMatch(/respondent_phone/);
    expect(formCond).toMatch(/'901234567'/);

    const leadCond = indexCondOf(plan, 'idx_leads_phone_key');
    expect(leadCond).not.toBeNull();
    expect(leadCond).toMatch(/\(phone\)::text/);
    expect(leadCond).toMatch(/'901234567'/);
  });

  it('ĐỐI CHỨNG: biểu thức lệch (TRIM + LOWER / 8 số cuối) → biểu thức KHÔNG vào Index Cond (chỉ còn lọc workspace) và idx_leads_phone_key không được dùng', async () => {
    const wrongEmail = await explain(
      buildNewestConsentSql(CONSENT_LEAD_EMAIL_MATCH_SQL, 'LOWER(TRIM(respondent_email)) = $2'),
      'a@x.com'
    );
    expect(indexCondOf(wrongEmail, 'idx_form_submissions_owner_email_key') ?? '').not.toMatch(/respondent_email/);

    const wrongPhone = await explain(
      buildNewestConsentSql(
        "RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 8) = $2",
        "RIGHT(regexp_replace(respondent_phone, '[^0-9]', '', 'g'), 8) = $2"
      ),
      '01234567'
    );
    expect(indexCondOf(wrongPhone, 'idx_form_submissions_owner_phone_key') ?? '').not.toMatch(/respondent_phone/);
    expect(wrongPhone).not.toContain('idx_leads_phone_key');
  });
});
