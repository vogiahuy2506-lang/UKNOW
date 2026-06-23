/**
 * Integration tests cho Landing CMS — Batch C.
 *
 * Phạm vi:
 *   - `/api/admin/landing-pages` (CRUD)
 *   - `/api/admin/landing-featured-courses` (CRUD, `requireRole('admin','user')`)
 *   - `/api/admin/landing-testimonials` (CRUD, `requireRole('admin','user')`)
 *   - `/api/public/landing-pages/:slug` (đọc HTML)
 *   - `/api/public/landing-analytics/view` (POST view event)
 *   - `/api/public/landing-track/go` (GET redirect 302)
 *   - `/api/public/landing-featured-courses` (list active only)
 *   - `/api/public/landing-testimonials` (list active only)
 *   - `/api/public/leads` (form submission)
 *
 * KHÔNG cover:
 *   - Upload ảnh qua `imageTempId` (cần mock fs / S3 helper).
 *     Mọi test dùng `imageUrl: 'https://...'` để bỏ qua side-effect.
 *   - HTML transformation chi tiết trong `prepareLandingHtmlOnSave` (đã có
 *     unit test riêng cho util).
 *
 * Quirks đã pin theo behavior hiện tại:
 *   - Slug `l` bị reject ở `assertNotReservedSlug` (CMS không quản).
 *   - `landingPageAdminService.list/getById/remove` truyền `roleCode:` cho
 *     scope nhưng repository đọc `scope.role` → role admin không được bypass
 *     ở 3 endpoint này (chỉ thấy workspace).
 *   - `featuredCourse` / `testimonial` update+remove check owner (cross-user → 404);
 *     superadmin bypass qua `isAdminRole`.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan, assignPlanToUser } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function loginAs(user) {
  const res = await request(app).post('/api/auth/login').send({
    username: user.username,
    password: user.plainPassword,
  });
  return res.body.data.accessToken;
}

/**
 * Tạo user role='user' kèm plan active (vượt qua `requireActivePlan`).
 * Mặc định gán plan dùng chung; truyền `planOverrides` nếu cần limit khác.
 *
 * @param {object} [opts]
 * @param {object} [opts.userOverrides]
 * @param {object} [opts.planOverrides]
 */
async function createUserWithPlan({ userOverrides = {}, planOverrides = {} } = {}) {
  const user = await createUser({ role: 'user', ...userOverrides });
  const plan = await createPlan(planOverrides);
  await assignPlanToUser(user.id, plan.id);
  return user;
}

async function insertLandingPage({ idUser, slug, title = 'Title', html = '<p>x</p>', isPublished = true }) {
  const { rows } = await db.query(
    `INSERT INTO landing_pages (id_user, slug, title, html_content, is_published, published_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN NOW() ELSE NULL END)
     RETURNING id, slug, title, is_published, id_user`,
    [idUser, slug, title, html, isPublished]
  );
  return rows[0];
}

async function insertFeaturedCourse({ idUser, sortOrder = 0, titleVi = 'Khoá VI', titleEn = 'Course EN', isActive = true, linkUrl = 'https://uknow.vn/c' }) {
  const { rows } = await db.query(
    `INSERT INTO landing_featured_courses (id_user, sort_order, title_vi, title_en, link_url, is_active)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [idUser, sortOrder, titleVi, titleEn, linkUrl, isActive]
  );
  return rows[0];
}

async function insertTestimonial({ idUser, sortOrder = 0, quoteVi = 'Tuyệt vời', quoteEn = 'Great', nameVi = 'Nam', nameEn = 'Nam', starRating = 5, isActive = true }) {
  const { rows } = await db.query(
    `INSERT INTO landing_testimonials (id_user, sort_order, quote_vi, quote_en, name_vi, name_en, star_rating, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [idUser, sortOrder, quoteVi, quoteEn, nameVi, nameEn, starRating, isActive]
  );
  return rows[0];
}

// ═══════════════════════════════════════════════════════════════════════
// Admin: landing-pages
// ═══════════════════════════════════════════════════════════════════════
describe('GET /api/admin/landing-pages', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/admin/landing-pages');
    expect(res.status).toBe(401);
  });

  it('role=employee → 403 (requireRole)', async () => {
    const u = await createUser({ username: 'lp-emp', role: 'employee' });
    const token = await loginAs(u);
    const res = await request(app).get('/api/admin/landing-pages').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('user chưa có plan → 403 NO_ACTIVE_PLAN', async () => {
    const u = await createUser({ username: 'lp-noplan', role: 'user' });
    const token = await loginAs(u);
    const res = await request(app).get('/api/admin/landing-pages').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NO_ACTIVE_PLAN');
  });

  it('trả danh sách trong workspace của user (loại bỏ slug=l)', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-me' } });
    const other = await createUserWithPlan({ userOverrides: { username: 'lp-other' } });
    await insertLandingPage({ idUser: me.id, slug: 'promo-1' });
    await insertLandingPage({ idUser: me.id, slug: 'l' });
    await insertLandingPage({ idUser: other.id, slug: 'foreign' });

    const token = await loginAs(me);
    const res = await request(app).get('/api/admin/landing-pages').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.slug).sort()).toEqual(['promo-1']);
  });
});

describe('GET /api/admin/landing-pages/:id', () => {
  it('id không phải số → 400', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-bad' } });
    const token = await loginAs(me);
    const res = await request(app).get('/api/admin/landing-pages/abc').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('id không thuộc scope → 404', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-getme' } });
    const other = await createUserWithPlan({ userOverrides: { username: 'lp-getother' } });
    const row = await insertLandingPage({ idUser: other.id, slug: 'foreign' });
    const token = await loginAs(me);
    const res = await request(app).get(`/api/admin/landing-pages/${row.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('lấy đúng landing của mình', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-getown' } });
    const row = await insertLandingPage({ idUser: me.id, slug: 'my-page', title: 'Hello' });
    const token = await loginAs(me);
    const res = await request(app).get(`/api/admin/landing-pages/${row.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ slug: 'my-page', title: 'Hello' });
  });
});

describe('POST /api/admin/landing-pages', () => {
  it('slug không hợp lệ → 400', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-c1' } });
    const token = await loginAs(me);
    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'BAD slug!' });
    expect(res.status).toBe(400);
  });

  it('slug reserved `l` → 400', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-c2' } });
    const token = await loginAs(me);
    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'l', title: 'oops' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/landing cố định|reserved|"l"/i);
  });

  it('slug đã tồn tại → 409', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-c3' } });
    await insertLandingPage({ idUser: me.id, slug: 'taken' });
    const token = await loginAs(me);
    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'taken', title: 'new' });
    expect(res.status).toBe(409);
  });

  it('happy path → 201, lưu htmlContent + slug lowercase', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-c4' } });
    const token = await loginAs(me);
    const res = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'MY-Slug', title: 'Hello', htmlContent: '<div>X</div>', isPublished: false });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('my-slug');
    expect(res.body.data.isPublished).toBe(false);
  });

  it('vượt max_landing_pages → 400 resource limit', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-c5' } });
    await db.query(`UPDATE users SET max_landing_pages = 1 WHERE id = $1`, [me.id]);
    const token = await loginAs(me);

    const r1 = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'first', title: 't1' });
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post('/api/admin/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'second', title: 't2' });
    expect(r2.status).toBe(400);
    expect(r2.body.message).toMatch(/giới hạn|limit/i);
  });
});

describe('PUT /api/admin/landing-pages/:id', () => {
  it('id không thuộc workspace → 404', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-u1' } });
    const other = await createUserWithPlan({ userOverrides: { username: 'lp-other-u' } });
    const row = await insertLandingPage({ idUser: other.id, slug: 'foreign-u' });
    const token = await loginAs(me);
    const res = await request(app)
      .put(`/api/admin/landing-pages/${row.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'foreign-u', title: 'updated' });
    expect(res.status).toBe(404);
  });

  it('update slug + title → 200, DB persisted', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-u2' } });
    const row = await insertLandingPage({ idUser: me.id, slug: 'old-slug', title: 'Old' });
    const token = await loginAs(me);

    const res = await request(app)
      .put(`/api/admin/landing-pages/${row.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'new-slug', title: 'New Title', htmlContent: '<div>v2</div>', isPublished: true });
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('new-slug');
    expect(res.body.data.title).toBe('New Title');
    expect(res.body.data.isPublished).toBe(true);
  });

  it('update slug trùng với landing khác → 409', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-u3' } });
    const row1 = await insertLandingPage({ idUser: me.id, slug: 'one' });
    await insertLandingPage({ idUser: me.id, slug: 'two' });
    const token = await loginAs(me);

    const res = await request(app)
      .put(`/api/admin/landing-pages/${row1.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'two', title: 't' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/admin/landing-pages/:id', () => {
  it('id không thuộc workspace → 404, row vẫn còn', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-d1' } });
    const other = await createUserWithPlan({ userOverrides: { username: 'lp-other-d' } });
    const row = await insertLandingPage({ idUser: other.id, slug: 'foreign-d' });
    const token = await loginAs(me);
    const res = await request(app).delete(`/api/admin/landing-pages/${row.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    const after = await db.query(`SELECT 1 FROM landing_pages WHERE id = $1`, [row.id]);
    expect(after.rows).toHaveLength(1);
  });

  it('xóa landing của mình → 200, row biến mất', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'lp-d2' } });
    const row = await insertLandingPage({ idUser: me.id, slug: 'to-delete' });
    const token = await loginAs(me);
    const res = await request(app).delete(`/api/admin/landing-pages/${row.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const after = await db.query(`SELECT 1 FROM landing_pages WHERE id = $1`, [row.id]);
    expect(after.rows).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Admin: landing-featured-courses
// ═══════════════════════════════════════════════════════════════════════
describe('Featured courses authorization', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/admin/landing-featured-courses');
    expect(res.status).toBe(401);
  });

  it('role=employee → 403', async () => {
    const u = await createUser({ username: 'fc-emp', role: 'employee' });
    const token = await loginAs(u);
    const res = await request(app).get('/api/admin/landing-featured-courses').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/landing-featured-courses', () => {
  it('trả danh sách của user (kèm cả inactive), sort_order ASC', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'fc-list' } });
    const other = await createUserWithPlan({ userOverrides: { username: 'fc-other' } });
    await insertFeaturedCourse({ idUser: me.id, sortOrder: 2, titleVi: 'B' });
    await insertFeaturedCourse({ idUser: me.id, sortOrder: 1, titleVi: 'A', isActive: false });
    await insertFeaturedCourse({ idUser: other.id, sortOrder: 0, titleVi: 'Foreign' });

    const token = await loginAs(me);
    const res = await request(app).get('/api/admin/landing-featured-courses').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.titleVi)).toEqual(['A', 'B']);
    expect(res.body.data.some((r) => r.isActive === false)).toBe(true);
  });
});

describe('POST /api/admin/landing-featured-courses', () => {
  it('thiếu titleVi → 400', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'fc-c1' } });
    const token = await loginAs(me);
    const res = await request(app)
      .post('/api/admin/landing-featured-courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ titleEn: 'EN only', linkUrl: 'https://uknow.vn' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/titleVi/);
  });

  it('linkUrl không phải http/https → 400', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'fc-c2' } });
    const token = await loginAs(me);
    const res = await request(app)
      .post('/api/admin/landing-featured-courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ titleVi: 'VI', titleEn: 'EN', linkUrl: 'ftp://bad' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/http/i);
  });

  it('imageUrl không http(s) → 400', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'fc-c3' } });
    const token = await loginAs(me);
    const res = await request(app)
      .post('/api/admin/landing-featured-courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ titleVi: 'VI', titleEn: 'EN', linkUrl: 'https://uknow.vn', imageUrl: 'not-a-url' });
    expect(res.status).toBe(400);
  });

  it('happy path → 201, idUser gắn đúng', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'fc-c4' } });
    const token = await loginAs(me);
    const res = await request(app)
      .post('/api/admin/landing-featured-courses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        titleVi: 'Khoá VI',
        titleEn: 'Course EN',
        linkUrl: 'https://uknow.vn/c1',
        imageUrl: 'https://uknow.vn/img.png',
        sortOrder: 5,
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      titleVi: 'Khoá VI',
      titleEn: 'Course EN',
      linkUrl: 'https://uknow.vn/c1',
      sortOrder: 5,
      isActive: true,
    });
    const { rows } = await db.query(`SELECT id_user FROM landing_featured_courses WHERE id = $1`, [res.body.data.id]);
    expect(Number(rows[0].id_user)).toBe(Number(me.id));
  });
});

describe('PUT /api/admin/landing-featured-courses/:id', () => {
  it('id không tồn tại → 404', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'fc-u1' } });
    const token = await loginAs(me);
    const res = await request(app)
      .put('/api/admin/landing-featured-courses/99999')
      .set('Authorization', `Bearer ${token}`)
      .send({ titleVi: 'x', titleEn: 'x', linkUrl: 'https://x.test' });
    expect(res.status).toBe(404);
  });

  it('update merge giữ field cũ + cập nhật field mới', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'fc-u2' } });
    const row = await insertFeaturedCourse({ idUser: me.id, titleVi: 'Old VI', titleEn: 'Old EN' });
    const token = await loginAs(me);

    const res = await request(app)
      .put(`/api/admin/landing-featured-courses/${row.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ titleVi: 'New VI', linkUrl: 'https://uknow.vn/new' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      titleVi: 'New VI',
      titleEn: 'Old EN',
      linkUrl: 'https://uknow.vn/new',
    });
  });

  it('update của user khác → 404', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'fc-u3' } });
    const other = await createUserWithPlan({ userOverrides: { username: 'fc-u3-other' } });
    const row = await insertFeaturedCourse({ idUser: other.id });
    const token = await loginAs(me);
    const res = await request(app)
      .put(`/api/admin/landing-featured-courses/${row.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ titleVi: 'Hacked', linkUrl: 'https://evil.test' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/landing-featured-courses/:id', () => {
  it('id không tồn tại → 404', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'fc-d1' } });
    const token = await loginAs(me);
    const res = await request(app)
      .delete('/api/admin/landing-featured-courses/99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('xóa của mình → 200 + row biến mất', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'fc-d2' } });
    const row = await insertFeaturedCourse({ idUser: me.id });
    const token = await loginAs(me);
    const res = await request(app)
      .delete(`/api/admin/landing-featured-courses/${row.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const after = await db.query(`SELECT 1 FROM landing_featured_courses WHERE id = $1`, [row.id]);
    expect(after.rows).toHaveLength(0);
  });

  it('xóa của user khác → 404 (IDOR guard)', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'fc-d3' } });
    const other = await createUserWithPlan({ userOverrides: { username: 'fc-d3-other' } });
    const row = await insertFeaturedCourse({ idUser: other.id });
    const token = await loginAs(me);
    const res = await request(app)
      .delete(`/api/admin/landing-featured-courses/${row.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    const after = await db.query(`SELECT 1 FROM landing_featured_courses WHERE id = $1`, [row.id]);
    expect(after.rows).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Admin: landing-testimonials
// ═══════════════════════════════════════════════════════════════════════
describe('Testimonials authorization', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/admin/landing-testimonials');
    expect(res.status).toBe(401);
  });

  it('role=employee → 403', async () => {
    const u = await createUser({ username: 'ts-emp', role: 'employee' });
    const token = await loginAs(u);
    const res = await request(app).get('/api/admin/landing-testimonials').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/landing-testimonials', () => {
  it('thiếu quoteVi → 400', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'ts-c1' } });
    const token = await loginAs(me);
    const res = await request(app)
      .post('/api/admin/landing-testimonials')
      .set('Authorization', `Bearer ${token}`)
      .send({ quoteEn: 'Q', nameVi: 'N', nameEn: 'N', starRating: 5 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/quoteVi/);
  });

  it('starRating ngoài 1-5 → 400', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'ts-c2' } });
    const token = await loginAs(me);
    const res = await request(app)
      .post('/api/admin/landing-testimonials')
      .set('Authorization', `Bearer ${token}`)
      .send({ quoteVi: 'Q', quoteEn: 'Q', nameVi: 'N', nameEn: 'N', starRating: 6 });
    expect(res.status).toBe(400);
  });

  it('happy path → 201 với starRating + idUser', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'ts-c3' } });
    const token = await loginAs(me);
    const res = await request(app)
      .post('/api/admin/landing-testimonials')
      .set('Authorization', `Bearer ${token}`)
      .send({
        quoteVi: 'Tuyệt vời',
        quoteEn: 'Great',
        nameVi: 'Nam',
        nameEn: 'Nam',
        starRating: 4,
        sortOrder: 2,
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      starRating: 4,
      quoteVi: 'Tuyệt vời',
      sortOrder: 2,
    });
    expect(Number(res.body.data.idUser)).toBe(Number(me.id));
  });
});

describe('GET /api/admin/landing-testimonials', () => {
  it('chỉ trả testimonial của workspace, sort_order ASC', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'ts-l1' } });
    const other = await createUserWithPlan({ userOverrides: { username: 'ts-l1-other' } });
    await insertTestimonial({ idUser: me.id, sortOrder: 2, nameVi: 'B' });
    await insertTestimonial({ idUser: me.id, sortOrder: 1, nameVi: 'A', isActive: false });
    await insertTestimonial({ idUser: other.id, sortOrder: 0, nameVi: 'X' });
    const token = await loginAs(me);
    const res = await request(app).get('/api/admin/landing-testimonials').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.map((r) => r.nameVi)).toEqual(['A', 'B']);
  });
});

describe('PUT /api/admin/landing-testimonials/:id', () => {
  it('id không tồn tại → 404', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'ts-u1' } });
    const token = await loginAs(me);
    const res = await request(app)
      .put('/api/admin/landing-testimonials/99999')
      .set('Authorization', `Bearer ${token}`)
      .send({ quoteVi: 'x' });
    expect(res.status).toBe(404);
  });

  it('update merge — sửa quoteVi + giữ các field còn lại', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'ts-u2' } });
    const row = await insertTestimonial({ idUser: me.id, quoteVi: 'Old', nameVi: 'Tên cũ' });
    const token = await loginAs(me);
    const res = await request(app)
      .put(`/api/admin/landing-testimonials/${row.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quoteVi: 'Mới' });
    expect(res.status).toBe(200);
    expect(res.body.data.quoteVi).toBe('Mới');
    expect(res.body.data.nameVi).toBe('Tên cũ');
  });
});

describe('DELETE /api/admin/landing-testimonials/:id', () => {
  it('id không tồn tại → 404', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'ts-d1' } });
    const token = await loginAs(me);
    const res = await request(app)
      .delete('/api/admin/landing-testimonials/99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('xóa của mình → 200 + biến mất', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'ts-d2' } });
    const row = await insertTestimonial({ idUser: me.id });
    const token = await loginAs(me);
    const res = await request(app)
      .delete(`/api/admin/landing-testimonials/${row.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const after = await db.query(`SELECT 1 FROM landing_testimonials WHERE id = $1`, [row.id]);
    expect(after.rows).toHaveLength(0);
  });

  it('xóa của user khác → 404 (IDOR guard)', async () => {
    const me = await createUserWithPlan({ userOverrides: { username: 'ts-d3' } });
    const other = await createUserWithPlan({ userOverrides: { username: 'ts-d3-other' } });
    const row = await insertTestimonial({ idUser: other.id });
    const token = await loginAs(me);
    const res = await request(app)
      .delete(`/api/admin/landing-testimonials/${row.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    const after = await db.query(`SELECT 1 FROM landing_testimonials WHERE id = $1`, [row.id]);
    expect(after.rows).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Public: landing-pages, view, track/go
// ═══════════════════════════════════════════════════════════════════════
describe('GET /api/public/landing-pages/:slug', () => {
  it('slug không tồn tại / chưa publish → 404', async () => {
    const me = await createUser({ username: 'lp-pub-1' });
    await insertLandingPage({ idUser: me.id, slug: 'draft-only', isPublished: false });
    const r1 = await request(app).get('/api/public/landing-pages/missing');
    expect(r1.status).toBe(404);
    const r2 = await request(app).get('/api/public/landing-pages/draft-only');
    expect(r2.status).toBe(404);
  });

  it('slug đã publish → trả title + htmlContent', async () => {
    const me = await createUser({ username: 'lp-pub-2' });
    await insertLandingPage({ idUser: me.id, slug: 'pub', title: 'Hello', html: '<p>BODY</p>', isPublished: true });
    const res = await request(app).get('/api/public/landing-pages/pub');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: 'Hello', htmlContent: '<p>BODY</p>' });
  });
});

describe('POST /api/public/landing-analytics/view', () => {
  it('slug không hợp lệ → 400', async () => {
    const res = await request(app).post('/api/public/landing-analytics/view').send({ slug: '!!' });
    expect(res.status).toBe(400);
  });

  it('slug chưa publish → 404, không ghi event', async () => {
    const me = await createUser({ username: 'lp-v1' });
    await insertLandingPage({ idUser: me.id, slug: 'draft-v', isPublished: false });
    const res = await request(app).post('/api/public/landing-analytics/view').send({ slug: 'draft-v' });
    expect(res.status).toBe(404);
    const evt = await db.query(`SELECT 1 FROM landing_page_events WHERE landing_page_slug = 'draft-v'`);
    expect(evt.rows).toHaveLength(0);
  });

  it('slug=l (landing cố định) → 201 + ghi event không cần bản ghi DB', async () => {
    const res = await request(app)
      .post('/api/public/landing-analytics/view')
      .send({ slug: 'l', visitorId: 'v1', utmSource: 'src' });
    expect(res.status).toBe(201);
    const { rows } = await db.query(`SELECT event_type, visitor_id FROM landing_page_events WHERE landing_page_slug = 'l'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_type: 'view', visitor_id: 'v1' });
  });

  it('slug đã publish → 201 + ghi event view', async () => {
    const me = await createUser({ username: 'lp-v2' });
    await insertLandingPage({ idUser: me.id, slug: 'pub-v', isPublished: true });
    const res = await request(app)
      .post('/api/public/landing-analytics/view')
      .send({ slug: 'pub-v', utmCampaign: 'launch', visitorId: 'v9' });
    expect(res.status).toBe(201);
    const { rows } = await db.query(
      `SELECT event_type, utm_campaign FROM landing_page_events WHERE landing_page_slug = 'pub-v'`
    );
    expect(rows[0]).toMatchObject({ event_type: 'view', utm_campaign: 'launch' });
  });
});

describe('GET /api/public/landing-track/go', () => {
  it('thiếu/url không hợp lệ → 400', async () => {
    const me = await createUser({ username: 'lp-g0' });
    await insertLandingPage({ idUser: me.id, slug: 'go-pub', isPublished: true });
    const r1 = await request(app).get('/api/public/landing-track/go?slug=go-pub');
    expect(r1.status).toBe(400);
    const r2 = await request(app).get('/api/public/landing-track/go?slug=go-pub&u=ftp://x');
    expect(r2.status).toBe(400);
  });

  it('slug chưa publish → 404', async () => {
    const me = await createUser({ username: 'lp-g1' });
    await insertLandingPage({ idUser: me.id, slug: 'go-draft', isPublished: false });
    const url = encodeURIComponent('https://uknow.vn/dest');
    const res = await request(app).get(`/api/public/landing-track/go?slug=go-draft&u=${url}`);
    expect(res.status).toBe(404);
  });

  it('slug đã publish → 302 với utm_source/utm_medium được append, ghi click event', async () => {
    const me = await createUser({ username: 'lp-g2' });
    await insertLandingPage({ idUser: me.id, slug: 'pub-go', isPublished: true });
    const url = encodeURIComponent('https://uknow.vn/dest');
    const res = await request(app).get(`/api/public/landing-track/go?slug=pub-go&u=${url}`);
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.location);
    expect(loc.origin + loc.pathname).toBe('https://uknow.vn/dest');
    expect(loc.searchParams.get('utm_source')).toBe('landing_page');
    expect(loc.searchParams.get('utm_medium')).toBe('pub-go');
    const evt = await db.query(`SELECT event_type, target_url FROM landing_page_events WHERE landing_page_slug = 'pub-go'`);
    expect(evt.rows[0].event_type).toBe('click');
    expect(evt.rows[0].target_url).toMatch(/utm_source=landing_page/);
  });

  it('slug=l (cố định) → 302 không cần bản ghi DB', async () => {
    const url = encodeURIComponent('https://example.com/x?a=1');
    const res = await request(app).get(`/api/public/landing-track/go?slug=l&u=${url}`);
    expect(res.status).toBe(302);
  });

  it('URL đích đã có utm_source → giữ nguyên (không bị ghi đè)', async () => {
    const me = await createUser({ username: 'lp-g3' });
    await insertLandingPage({ idUser: me.id, slug: 'pub-go2', isPublished: true });
    const url = encodeURIComponent('https://uknow.vn/dest?utm_source=existing&foo=bar');
    const res = await request(app).get(`/api/public/landing-track/go?slug=pub-go2&u=${url}`);
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.location);
    expect(loc.searchParams.get('utm_source')).toBe('existing');
    expect(loc.searchParams.get('foo')).toBe('bar');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Public: featured courses / testimonials
// ═══════════════════════════════════════════════════════════════════════
describe('GET /api/public/landing-featured-courses', () => {
  it('không yêu cầu auth, chỉ trả active', async () => {
    const me = await createUser({ username: 'fc-pub' });
    await insertFeaturedCourse({ idUser: me.id, sortOrder: 1, titleVi: 'Active', isActive: true });
    await insertFeaturedCourse({ idUser: me.id, sortOrder: 2, titleVi: 'Inactive', isActive: false });
    const res = await request(app).get('/api/public/landing-featured-courses');
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.titleVi)).toEqual(['Active']);
  });
});

describe('GET /api/public/landing-testimonials', () => {
  it('không yêu cầu auth, chỉ trả active', async () => {
    const me = await createUser({ username: 'ts-pub' });
    await insertTestimonial({ idUser: me.id, sortOrder: 1, nameVi: 'Active', isActive: true });
    await insertTestimonial({ idUser: me.id, sortOrder: 2, nameVi: 'Inactive', isActive: false });
    const res = await request(app).get('/api/public/landing-testimonials');
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.nameVi)).toEqual(['Active']);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Public: leads
// ═══════════════════════════════════════════════════════════════════════
describe('POST /api/public/leads', () => {
  const baseLead = {
    lastName: 'Nguyen',
    firstName: 'A',
    email: 'a@u.local',
    phone: '0901234567',
    occupation: 'CEO',
    interestArea: 'AI',
    marketingConsent: true,
  };

  it('thiếu lastName/firstName → 400', async () => {
    const res = await request(app).post('/api/public/leads').send({ ...baseLead, lastName: '', firstName: '' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Họ và Tên/i);
  });

  it('email không hợp lệ → 400', async () => {
    const res = await request(app).post('/api/public/leads').send({ ...baseLead, email: 'bad' });
    expect(res.status).toBe(400);
  });

  it('phone quá ngắn → 400', async () => {
    const res = await request(app).post('/api/public/leads').send({ ...baseLead, phone: '123' });
    expect(res.status).toBe(400);
  });

  it('marketingConsent=false → 400', async () => {
    const res = await request(app).post('/api/public/leads').send({ ...baseLead, marketingConsent: false });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/đồng ý/i);
  });

  it('happy path không có slug → 201, lead có id_user=1 (default), KHÔNG ghi submit event', async () => {
    const res = await request(app).post('/api/public/leads').send(baseLead);
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeTruthy();
    const lead = await db.query(`SELECT id_user FROM leads WHERE id = $1`, [res.body.data.id]);
    expect(Number(lead.rows[0].id_user)).toBe(1);
    const evt = await db.query(`SELECT 1 FROM landing_page_events WHERE event_type = 'submit'`);
    expect(evt.rows).toHaveLength(0);
  });

  it('có landingPageSlug đã publish → 201 + lead.id_user = chủ landing + ghi submit event', async () => {
    const owner = await createUser({ username: 'lead-owner' });
    await insertLandingPage({ idUser: owner.id, slug: 'pub-lead', isPublished: true });
    const res = await request(app)
      .post('/api/public/leads')
      .send({ ...baseLead, landingPageSlug: 'pub-lead', utmSource: 'fb' });
    expect(res.status).toBe(201);
    const lead = await db.query(
      `SELECT id_user, landing_page_slug FROM leads WHERE id = $1`,
      [res.body.data.id]
    );
    expect(Number(lead.rows[0].id_user)).toBe(Number(owner.id));
    expect(lead.rows[0].landing_page_slug).toBe('pub-lead');

    const evt = await db.query(
      `SELECT event_type, utm_source FROM landing_page_events WHERE landing_page_slug = 'pub-lead' AND event_type = 'submit'`
    );
    expect(evt.rows).toHaveLength(1);
    expect(evt.rows[0].utm_source).toBe('fb');
  });

  it('landingPageSlug chưa publish → 201 nhưng id_user fallback về 1 (admin)', async () => {
    const owner = await createUser({ username: 'lead-owner-draft' });
    await insertLandingPage({ idUser: owner.id, slug: 'draft-lead', isPublished: false });
    const res = await request(app)
      .post('/api/public/leads')
      .send({ ...baseLead, landingPageSlug: 'draft-lead' });
    expect(res.status).toBe(201);
    const lead = await db.query(`SELECT id_user FROM leads WHERE id = $1`, [res.body.data.id]);
    expect(Number(lead.rows[0].id_user)).toBe(1);
  });
});
