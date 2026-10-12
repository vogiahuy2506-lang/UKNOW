/**
 * GHIM migration 301 (chỉ mục cho chốt đồng ý PR-2, PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING PR-7b): migration, bootstrap, và BIỂU THỨC index phải khớp
 * từng chữ với mảnh SQL mà `campaignEmailSender.repository.js` dùng để tra — lệch một ký tự là Postgres quay về quét cả bảng cho TỪNG người nhận.
 * Đọc thẳng file nên lệch là đỏ, không cần CSDL. EXPLAIN trên Postgres thật nằm ở tests/integration/consentLookupIndexes.test.js.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../../config/database.js', () => ({ default: { query: jest.fn() } }));
const {
  CONSENT_FORM_EMAIL_MATCH_SQL,
  CONSENT_FORM_PHONE_MATCH_SQL,
  CONSENT_LEAD_PHONE_MATCH_SQL,
  CONSENT_LEAD_EMAIL_MATCH_SQL,
  buildNewestConsentSql,
} = await import('../../repositories/campaign/campaignEmailSender.repository.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../..');
const read = (rel) => readFileSync(path.join(backendDir, rel), 'utf8');

const migration = read('migrations/301_consent_lookup_indexes.sql');
const bootstrap = read('tests/integration/sql/bootstrap.sql');
const sqlOnly = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

/** Vế trái của `<biểu thức> = $2` — đúng thứ index phải bọc. */
const exprOf = (matchSql) => matchSql.replace(/\s*=\s*\$2\s*$/, '');

describe('migration 301 — chỉ mục cho chốt đồng ý', () => {
  it('chỉ CREATE INDEX IF NOT EXISTS — KHÔNG DROP / ALTER / SET NOT NULL / CONCURRENTLY, không tự BEGIN/COMMIT', () => {
    expect(sqlOnly).not.toMatch(/\bDROP\b|\bALTER\b|SET NOT NULL|CONCURRENTLY|\bBEGIN\b|\bCOMMIT\b/i);
    const creates = sqlOnly.match(/CREATE INDEX/g) || [];
    const guarded = sqlOnly.match(/CREATE INDEX IF NOT EXISTS/g) || [];
    expect(creates.length).toBe(4);
    expect(guarded.length).toBe(4);
  });

  it('form_submissions: (workspace_owner_id, LOWER(respondent_email)) và (workspace_owner_id, 9 số cuối SĐT) — biểu thức khớp truy vấn PR-2', () => {
    expect(CONSENT_FORM_EMAIL_MATCH_SQL).toBe('LOWER(respondent_email) = $2');
    expect(CONSENT_FORM_PHONE_MATCH_SQL).toBe("RIGHT(regexp_replace(respondent_phone, '[^0-9]', '', 'g'), 9) = $2");
    for (const sql of [migration, bootstrap]) {
      expect(sql).toContain(`idx_form_submissions_owner_email_key`);
      expect(sql).toContain(`ON form_submissions (workspace_owner_id, (${exprOf(CONSENT_FORM_EMAIL_MATCH_SQL)}))`);
      expect(sql).toContain(`idx_form_submissions_owner_phone_key`);
      expect(sql).toContain(`ON form_submissions (workspace_owner_id, (${exprOf(CONSENT_FORM_PHONE_MATCH_SQL)}))`);
    }
  });

  it('leads: index theo 9 số cuối SĐT khớp truy vấn PR-2; leads.email dùng idx_leads_email', () => {
    expect(CONSENT_LEAD_EMAIL_MATCH_SQL).toBe('email = $2');
    expect(CONSENT_LEAD_PHONE_MATCH_SQL).toBe("RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 9) = $2");
    for (const sql of [migration, bootstrap]) {
      expect(sql).toContain('idx_leads_phone_key');
      expect(sql).toContain(`ON leads ((${exprOf(CONSENT_LEAD_PHONE_MATCH_SQL)}))`);
    }
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);');
  });

  it('migration không đụng cột nên inventory (chỉ bảng + cột) không đổi — số bảng/cột giữ nguyên', () => {
    const inventory = JSON.parse(read('tests/integration/fixtures/productionSchemaInventory.json'));
    expect(Object.keys(inventory.tables).length).toBe(inventory._meta.tables);
    expect(sqlOnly).not.toMatch(/ADD COLUMN|CREATE TABLE/i);
  });

  it('buildNewestConsentSql ghép ĐÚNG các mảnh match vào cả hai nhánh (leads + form_submissions), tham số $1 chủ / $2 giá trị', () => {
    const sql = buildNewestConsentSql(CONSENT_LEAD_PHONE_MATCH_SQL, CONSENT_FORM_PHONE_MATCH_SQL);
    expect(sql).toContain(`AND ${CONSENT_LEAD_PHONE_MATCH_SQL}`);
    expect(sql).toContain(`AND ${CONSENT_FORM_PHONE_MATCH_SQL}`);
    expect(sql).toContain('FROM leads');
    expect(sql).toContain('FROM form_submissions');
    expect(sql).toContain('workspace_owner_id = $1');
  });
});
