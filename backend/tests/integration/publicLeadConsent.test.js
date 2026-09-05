/**
 * Integration tests cho PR-N1: Nghị định 330/2026/NĐ-CP
 * Ngừng tạo ra bản ghi đồng ý marketing sai sự thật trên form lead.
 *
 * 3 trạng thái của leads.marketing_consent:
 *   - TRUE:  form có ô tick, khách tick (hoặc gửi true / 'on' / '1')
 *   - FALSE: form có ô tick, khách KHÔNG tick (hoặc gửi false / '0') — CHO GỬI, KHÔNG 400
 *   - NULL:  form không có ô tick (không gửi consent) — CHO GỬI, ghi nhận là chưa hỏi
 */

import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';

let app;
let testUser;
const LP_SLUG = 'test-consent-slug';

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  testUser = await createUser({ username: 'owner_consent_test' });
  await db.query(
    `INSERT INTO landing_pages (id_user, workspace_owner_id, slug, title, is_published, custom_config)
     VALUES ($1, $1, $2, 'Trang Test Consent', true, '{}'::jsonb)`,
    [testUser.id, LP_SLUG]
  );
});

async function getLatestLead() {
  const { rows } = await db.query(
    `SELECT id, first_name, last_name, email, phone, marketing_consent, landing_page_slug
     FROM leads
     ORDER BY id DESC LIMIT 1`
  );
  return rows[0] || null;
}

describe('PR-N1 — Ghi nhận đồng ý marketing lead (Nghị định 330/2026)', () => {
  it('Nhánh 1: Form có ô tick, khách đã tick (marketingConsent: true) → lưu TRUE', async () => {
    const res = await request(app)
      .post('/api/public/leads')
      .send({
        firstName: 'An',
        lastName: 'Nguyen',
        email: 'an.tick@test.com',
        phone: '0901234567',
        landingPageSlug: LP_SLUG,
        marketingConsent: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const lead = await getLatestLead();
    expect(lead).toBeDefined();
    expect(lead.email).toBe('an.tick@test.com');
    expect(lead.marketing_consent).toBe(true);
  });

  it('Nhánh 2: Form có ô tick, khách KHÔNG tick (marketingConsent: false) → lưu FALSE, KHÔNG lỗi 400', async () => {
    const res = await request(app)
      .post('/api/public/leads')
      .send({
        firstName: 'Bình',
        lastName: 'Trần',
        email: 'binh.notick@test.com',
        phone: '0901234568',
        landingPageSlug: LP_SLUG,
        marketingConsent: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const lead = await getLatestLead();
    expect(lead).toBeDefined();
    expect(lead.email).toBe('binh.notick@test.com');
    expect(lead.marketing_consent).toBe(false);
  });

  it('Nhánh 3: Form KHÔNG có ô tick (không kèm marketingConsent) → lưu NULL (chưa hỏi)', async () => {
    const res = await request(app)
      .post('/api/public/leads')
      .send({
        firstName: 'Cường',
        lastName: 'Lê',
        email: 'cuong.notick@test.com',
        phone: '0901234569',
        landingPageSlug: LP_SLUG,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const lead = await getLatestLead();
    expect(lead).toBeDefined();
    expect(lead.email).toBe('cuong.notick@test.com');
    expect(lead.marketing_consent).toBeNull();
  });

  it('Nhánh 4: POST form-urlencoded với marketingConsent="on" (HTML checkbox mặc định) → lưu TRUE', async () => {
    const res = await request(app)
      .post('/api/public/leads')
      .type('form')
      .send({
        firstName: 'Dung',
        lastName: 'Phạm',
        email: 'dung.on@test.com',
        phone: '0901234570',
        landingPageSlug: LP_SLUG,
        marketingConsent: 'on',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const lead = await getLatestLead();
    expect(lead.email).toBe('dung.on@test.com');
    expect(lead.marketing_consent).toBe(true);
  });

  it('Nhánh 5: POST form-urlencoded với marketingConsent="false" (chuỗi) → lưu FALSE', async () => {
    const res = await request(app)
      .post('/api/public/leads')
      .type('form')
      .send({
        firstName: 'Em',
        lastName: 'Vũ',
        email: 'em.strfalse@test.com',
        phone: '0901234571',
        landingPageSlug: LP_SLUG,
        marketingConsent: 'false',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const lead = await getLatestLead();
    expect(lead.email).toBe('em.strfalse@test.com');
    expect(lead.marketing_consent).toBe(false);
  });

  it('Nhánh 6: POST với marketingConsent="ON" (chữ hoa) → chuẩn hoá và lưu TRUE', async () => {
    const res = await request(app)
      .post('/api/public/leads')
      .type('form')
      .send({
        firstName: 'Giang',
        lastName: 'Hoàng',
        email: 'giang.upperon@test.com',
        phone: '0901234572',
        landingPageSlug: LP_SLUG,
        marketingConsent: 'ON',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const lead = await getLatestLead();
    expect(lead.email).toBe('giang.upperon@test.com');
    expect(lead.marketing_consent).toBe(true);
  });

  it('Nhánh 7: Form dùng snake_case name="marketing_consent" với giá trị "false" → lưu FALSE', async () => {
    const res = await request(app)
      .post('/api/public/leads')
      .send({
        firstName: 'Huy',
        lastName: 'Đỗ',
        email: 'huy.snake@test.com',
        phone: '0901234573',
        landingPageSlug: LP_SLUG,
        marketing_consent: 'false',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const lead = await getLatestLead();
    expect(lead.email).toBe('huy.snake@test.com');
    expect(lead.marketing_consent).toBe(false);
  });
});
