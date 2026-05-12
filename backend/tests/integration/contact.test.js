/**
 * Integration tests cho `/api/contact` — public form submission.
 *
 * Endpoint không yêu cầu auth (lead capture từ landing page),
 * nên test tập trung vào:
 *   - Validator (name/email/phone/companySize/message length).
 *   - Rate limit chống spam (3 submissions / 5 phút / email).
 *   - DB side-effect: contact_submissions row + normalize email (lowercase),
 *     ip_address từ X-Forwarded-For hoặc req.ip.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

/** Body hợp lệ tối thiểu — các test có thể override field. */
function validBody(overrides = {}) {
  return {
    name: 'Nguyễn Văn A',
    email: 'lead@test.local',
    message: 'Tôi muốn tìm hiểu thêm về gói doanh nghiệp.',
    ...overrides,
  };
}

describe('POST /api/contact', () => {
  it('happy path → 201 + row được lưu, email normalize về lowercase', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send(validBody({ email: 'LEAD@Test.Local' }));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      id: expect.anything(),
      name: 'Nguyễn Văn A',
      email: 'lead@test.local',
    });

    const { rows } = await db.query(
      `SELECT name, email, message, status FROM contact_submissions ORDER BY id DESC LIMIT 1`
    );
    expect(rows[0]).toMatchObject({
      email: 'lead@test.local',
      name: 'Nguyễn Văn A',
      status: 'new',
    });
  });

  it('lưu đủ các field optional (phone, company, companySize)', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send(
        validBody({
          phone: '0901-234 567',
          company: 'ACME Co',
          companySize: '11-50',
        })
      );

    expect(res.status).toBe(201);
    const { rows } = await db.query(
      `SELECT phone, company, company_size FROM contact_submissions WHERE email = $1`,
      ['lead@test.local']
    );
    expect(rows[0]).toEqual({
      phone: '0901-234 567',
      company: 'ACME Co',
      company_size: '11-50',
    });
  });

  it('ip_address ưu tiên lấy từ X-Forwarded-For header (đứng sau proxy)', async () => {
    const res = await request(app)
      .post('/api/contact')
      .set('X-Forwarded-For', '203.0.113.5, 10.0.0.1')
      .send(validBody({ email: 'fwd@test.local' }));

    expect(res.status).toBe(201);
    const { rows } = await db.query(
      `SELECT ip_address FROM contact_submissions WHERE email = $1`,
      ['fwd@test.local']
    );
    expect(rows[0].ip_address).toBe('203.0.113.5');
  });

  // ─── Validators ─────────────────────────────────────────────────────
  it('thiếu name → 400', async () => {
    const res = await request(app).post('/api/contact').send(validBody({ name: '' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/họ tên/i);
  });

  it('name < 2 ký tự → 400', async () => {
    const res = await request(app).post('/api/contact').send(validBody({ name: 'A' }));
    expect(res.status).toBe(400);
  });

  it('email sai format → 400', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send(validBody({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });

  it('phone chứa ký tự không hợp lệ → 400', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send(validBody({ phone: 'gọi-tôi-nha' }));
    expect(res.status).toBe(400);
  });

  it('companySize không nằm trong whitelist → 400', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send(validBody({ companySize: '9999' }));
    expect(res.status).toBe(400);
  });

  it('message < 10 ký tự → 400', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send(validBody({ message: 'short' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/10 ký tự/i);
  });

  it('message > 5000 ký tự → 400', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send(validBody({ message: 'x'.repeat(5001) }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/5000/);
  });

  // ─── Rate limit ─────────────────────────────────────────────────────
  it('rate limit: submission thứ 4 trong 5 phút từ cùng email → 429', async () => {
    const body = validBody({ email: 'spam@test.local' });

    for (let i = 0; i < 3; i++) {
      const ok = await request(app).post('/api/contact').send(body);
      expect(ok.status).toBe(201);
    }

    const blocked = await request(app).post('/api/contact').send(body);
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/quá nhiều|thử lại/i);

    // DB chỉ có 3 row — submission thứ 4 không được lưu
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM contact_submissions WHERE email = $1`,
      ['spam@test.local']
    );
    expect(rows[0].n).toBe(3);
  });

  it('rate limit tính theo email — 2 email khác nhau không chặn nhau', async () => {
    const r1 = await request(app)
      .post('/api/contact')
      .send(validBody({ email: 'a@test.local' }));
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post('/api/contact')
      .send(validBody({ email: 'b@test.local' }));
    expect(r2.status).toBe(201);
  });
});
