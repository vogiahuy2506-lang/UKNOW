/**
 * Integration tests cho `/api/leads` — quản trị lead landing.
 *
 * Phạm vi cover:
 *   - Authorization (token required cho mọi endpoint).
 *   - GET /api/leads/preview: filter (date range, occupations, interests,
 *     landingSlugs), trả `items` + `pagination.total`.
 *   - GET /api/leads: phân trang (page/pageSize, totalPages), filter.
 *   - GET /api/leads/export: xuất .xlsx + header `Content-Disposition`,
 *     `X-Export-Total`, `X-Export-Count`, `X-Export-Truncated`.
 *
 * KHÔNG cover:
 *   - createPublicLead (gắn vào `leadPublic.routes` → `publicLeadController`, không thuộc `/api/leads`).
 *   - File buffer của .xlsx (chỉ verify header + size > 0).
 *
 * NOTE: Lead list/preview/export lọc theo `id_user` của workspace (owner).
 * Integration seed phải gắn `id_user` của user đang login.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

async function insertLead({
  idUser,
  lastName = 'Nguyen',
  firstName = 'A',
  email = `${Math.random().toString(36).slice(2)}@test.local`,
  phone = '0900000000',
  occupation = 'developer',
  interestArea = 'tech',
  landingPageSlug = 'home',
  createdAt = null,
}) {
  const params = [
    lastName, firstName, email, phone, occupation, interestArea, true, landingPageSlug, idUser,
  ];
  if (createdAt) {
    params.push(createdAt);
    const { rows } = await db.query(
      `INSERT INTO leads (last_name, first_name, email, phone, occupation, interest_area, marketing_consent, landing_page_slug, id_user, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      params
    );
    return rows[0];
  }
  const { rows } = await db.query(
    `INSERT INTO leads (last_name, first_name, email, phone, occupation, interest_area, marketing_consent, landing_page_slug, id_user)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    params
  );
  return rows[0];
}

// ===========================================================================
// AUTHORIZATION
// ===========================================================================

describe('Authorization — /api/leads', () => {
  it('không token → 401', async () => {
    const responses = await Promise.all([
      request(app).get('/api/leads'),
      request(app).get('/api/leads/preview'),
      request(app).get('/api/leads/export'),
    ]);
    responses.forEach((r) => expect(r.status).toBe(401));
  });
});

// ===========================================================================
// GET /api/leads/preview
// ===========================================================================

describe('GET /api/leads/preview', () => {
  it('trả về toàn bộ lead (không filter) + pagination meta', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    await insertLead({ idUser: o.id, email: 'a@test.local' });
    await insertLead({ idUser: o.id, email: 'b@test.local' });

    const t = await loginAs(o);
    const res = await request(app).get('/api/leads/preview').set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.pagination).toMatchObject({ total: 2, fetched: 2 });
  });

  it('filter theo occupation', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    await insertLead({ idUser: o.id, email: 'a@test.local', occupation: 'developer' });
    await insertLead({ idUser: o.id, email: 'b@test.local', occupation: 'designer' });
    await insertLead({ idUser: o.id, email: 'c@test.local', occupation: 'designer' });

    const t = await loginAs(o);
    const res = await request(app)
      .get('/api/leads/preview')
      .query({ landingLeadsOccupations: JSON.stringify(['designer']) })
      .set('Authorization', `Bearer ${t}`);

    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items.every((x) => x.occupation === 'designer')).toBe(true);
  });

  it('filter theo interest_area', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    await insertLead({ idUser: o.id, email: 'a@test.local', interestArea: 'tech' });
    await insertLead({ idUser: o.id, email: 'b@test.local', interestArea: 'marketing' });

    const t = await loginAs(o);
    const res = await request(app)
      .get('/api/leads/preview')
      .query({ landingLeadsInterests: JSON.stringify(['marketing']) })
      .set('Authorization', `Bearer ${t}`);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].interestArea).toBe('marketing');
  });

  it('filter theo landingSlugs', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    await insertLead({ idUser: o.id, email: 'a@test.local', landingPageSlug: 'home' });
    await insertLead({ idUser: o.id, email: 'b@test.local', landingPageSlug: 'about' });

    const t = await loginAs(o);
    const res = await request(app)
      .get('/api/leads/preview')
      .query({ landingLeadsSlugs: JSON.stringify(['home']) })
      .set('Authorization', `Bearer ${t}`);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].landingPageSlug).toBe('home');
  });

  it('filter theo khoảng ngày (landingLeadsUseDateRange=true)', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    await insertLead({ idUser: o.id, email: 'old@test.local', createdAt: '2024-01-15T00:00:00Z' });
    await insertLead({ idUser: o.id, email: 'mid@test.local', createdAt: '2025-06-15T00:00:00Z' });
    await insertLead({ idUser: o.id, email: 'new@test.local', createdAt: '2025-12-15T00:00:00Z' });

    const t = await loginAs(o);
    const res = await request(app)
      .get('/api/leads/preview')
      .query({
        landingLeadsUseDateRange: 'true',
        landingLeadsDateFrom: '2025-01-01',
        landingLeadsDateTo: '2025-12-31',
      })
      .set('Authorization', `Bearer ${t}`);

    expect(res.body.data.items.map((x) => x.email).sort()).toEqual([
      'mid@test.local',
      'new@test.local',
    ]);
  });

  it('combine nhiều filter (occupation + interest)', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    await insertLead({ idUser: o.id, email: 'a@test.local', occupation: 'dev', interestArea: 'tech' });
    await insertLead({ idUser: o.id, email: 'b@test.local', occupation: 'dev', interestArea: 'mkt' });
    await insertLead({ idUser: o.id, email: 'c@test.local', occupation: 'designer', interestArea: 'tech' });

    const t = await loginAs(o);
    const res = await request(app)
      .get('/api/leads/preview')
      .query({
        landingLeadsOccupations: JSON.stringify(['dev']),
        landingLeadsInterests: JSON.stringify(['tech']),
      })
      .set('Authorization', `Bearer ${t}`);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].email).toBe('a@test.local');
  });

  it('item shape có leadId/fullName/email/phone/occupation/interestArea/landingPageSlug/createdAt', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    await insertLead({ idUser: o.id,
      lastName: 'Nguyen',
      firstName: 'Van A',
      email: 'a@test.local',
      phone: '0901234567',
      occupation: 'developer',
      interestArea: 'tech',
      landingPageSlug: 'home',
    });

    const t = await loginAs(o);
    const res = await request(app).get('/api/leads/preview').set('Authorization', `Bearer ${t}`);

    const item = res.body.data.items[0];
    expect(item).toMatchObject({
      lastName: 'Nguyen',
      firstName: 'Van A',
      fullName: 'Nguyen Van A',
      email: 'a@test.local',
      phone: '0901234567',
      occupation: 'developer',
      interestArea: 'tech',
      landingPageSlug: 'home',
    });
    expect(item.leadId).toBeTruthy();
    expect(item.createdAt).toBeTruthy();
  });
});

// ===========================================================================
// GET /api/leads (admin list with pagination)
// ===========================================================================

describe('GET /api/leads', () => {
  it('pagination: page/pageSize/totalPages', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    for (let i = 0; i < 5; i += 1) {
      await insertLead({ idUser: o.id, email: `lead${i}@test.local` });
    }

    const t = await loginAs(o);
    const res = await request(app)
      .get('/api/leads?page=2&pageSize=2')
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.pagination).toMatchObject({
      total: 5,
      page: 2,
      pageSize: 2,
      totalPages: 3,
    });
  });

  it('pageSize bị clamp xuống 100', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const t = await loginAs(o);
    const res = await request(app)
      .get('/api/leads?pageSize=99999')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.pageSize).toBe(100);
  });

  it('sort DESC theo created_at', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    await insertLead({ idUser: o.id, email: 'old@test.local', createdAt: '2024-01-01T00:00:00Z' });
    await insertLead({ idUser: o.id, email: 'mid@test.local', createdAt: '2024-06-01T00:00:00Z' });
    await insertLead({ idUser: o.id, email: 'new@test.local', createdAt: '2025-01-01T00:00:00Z' });

    const t = await loginAs(o);
    const res = await request(app).get('/api/leads').set('Authorization', `Bearer ${t}`);
    expect(res.body.data.items.map((x) => x.email)).toEqual([
      'new@test.local',
      'mid@test.local',
      'old@test.local',
    ]);
  });
});

// ===========================================================================
// GET /api/leads/export
// ===========================================================================

describe('GET /api/leads/export', () => {
  it('xuất xlsx với header đúng + non-empty body', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    await insertLead({ idUser: o.id, email: 'a@test.local' });
    await insertLead({ idUser: o.id, email: 'b@test.local' });

    const t = await loginAs(o);
    const res = await request(app).get('/api/leads/export').set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(
      /openxmlformats-officedocument.spreadsheetml.sheet/i
    );
    expect(res.headers['content-disposition']).toMatch(/attachment.*\.xlsx/i);
    expect(res.headers['x-export-total']).toBe('2');
    expect(res.headers['x-export-count']).toBe('2');
    expect(res.headers['x-export-truncated']).toBeUndefined();
    // Body là binary xlsx — supertest mặc định không buffer cho octet-stream-like,
    // dựa vào content-length / header export-count để verify đã gửi đủ data.
    expect(Number(res.headers['content-length'])).toBeGreaterThan(0);
  });

  it('zero leads → vẫn 200, count=0', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    const t = await loginAs(o);
    const res = await request(app).get('/api/leads/export').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.headers['x-export-total']).toBe('0');
    expect(res.headers['x-export-count']).toBe('0');
  });

  it('export tôn trọng filter slug', async () => {
    const o = await createUser({ role: 'user', username: 'u' });
    await insertLead({ idUser: o.id, email: 'home1@test.local', landingPageSlug: 'home' });
    await insertLead({ idUser: o.id, email: 'home2@test.local', landingPageSlug: 'home' });
    await insertLead({ idUser: o.id, email: 'about1@test.local', landingPageSlug: 'about' });

    const t = await loginAs(o);
    const res = await request(app)
      .get('/api/leads/export')
      .query({ landingLeadsSlugs: JSON.stringify(['home']) })
      .set('Authorization', `Bearer ${t}`);

    expect(res.headers['x-export-total']).toBe('2');
    expect(res.headers['x-export-count']).toBe('2');
  });
});
