/**
 * PLAN_VA_CO_LAP_DU_LIEU_TENANT_DOT2 PR-D (D2) — API công khai của CMS landing không còn gộp dữ liệu mọi tài khoản.
 *
 * `GET /api/public/landing-featured-courses` và `/landing-testimonials` bắt buộc `?slug=<slug landing đã xuất bản>`
 * và chỉ trả dòng ĐANG HIỂN THỊ của đúng chủ landing đó. Thiếu slug / slug không tồn tại / chưa xuất bản -> `data: []`.
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

async function insertLandingPage({ idUser, slug, isPublished = true, workspaceOwnerId = null }) {
  const { rows } = await db.query(
    `INSERT INTO landing_pages (id_user, workspace_owner_id, slug, title, html_content, is_published)
     VALUES ($1, $2, $3, 'Title', '<p>x</p>', $4) RETURNING id`,
    [idUser, workspaceOwnerId, slug, isPublished]
  );
  return rows[0];
}

async function insertFeaturedCourse(idUser, titleVi, { isActive = true, sortOrder = 0 } = {}) {
  await db.query(
    `INSERT INTO landing_featured_courses (id_user, sort_order, title_vi, title_en, link_url, is_active)
     VALUES ($1, $2, $3, $3, 'https://uknow.vn/c', $4)`,
    [idUser, sortOrder, titleVi, isActive]
  );
}

async function insertTestimonial(idUser, nameVi, { isActive = true, sortOrder = 0 } = {}) {
  await db.query(
    `INSERT INTO landing_testimonials (id_user, sort_order, quote_vi, quote_en, name_vi, name_en, star_rating, is_active)
     VALUES ($1, $2, 'Tuyệt vời', 'Great', $3, $3, 5, $4)`,
    [idUser, sortOrder, nameVi, isActive]
  );
}

const featured = (query = '') => request(app).get(`/api/public/landing-featured-courses${query}`);
const testimonials = (query = '') => request(app).get(`/api/public/landing-testimonials${query}`);

async function seedTwoTenants() {
  const a = await createUser({ username: 'cms_a', role: 'user' });
  const b = await createUser({ username: 'cms_b', role: 'user' });
  await insertLandingPage({ idUser: a.id, slug: 'trang-a' });
  await insertLandingPage({ idUser: b.id, slug: 'trang-b' });
  await insertFeaturedCourse(a.id, 'Khoa cua A 2', { sortOrder: 2 });
  await insertFeaturedCourse(a.id, 'Khoa cua A 1', { sortOrder: 1 });
  await insertFeaturedCourse(a.id, 'Khoa A da tat', { isActive: false });
  await insertFeaturedCourse(b.id, 'Khoa cua B');
  await insertTestimonial(a.id, 'Khach cua A');
  await insertTestimonial(a.id, 'Khach A da tat', { isActive: false });
  await insertTestimonial(b.id, 'Khach cua B');
  return { a, b };
}

describe('GET /api/public/landing-featured-courses', () => {
  it('không slug -> data: [] (không gộp dòng của bất kỳ tài khoản nào)', async () => {
    await seedTwoTenants();
    const res = await featured();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [] });
  });

  it('?slug= landing đã xuất bản của A -> chỉ dòng ACTIVE của A, đúng thứ tự sort_order', async () => {
    await seedTwoTenants();
    const res = await featured('?slug=trang-a');
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.titleVi)).toEqual(['Khoa cua A 1', 'Khoa cua A 2']);
    expect(JSON.stringify(res.body)).not.toContain('Khoa cua B');
  });

  it('?slug= landing của B -> chỉ dòng của B', async () => {
    await seedTwoTenants();
    const res = await featured('?slug=trang-b');
    expect(res.body.data.map((r) => r.titleVi)).toEqual(['Khoa cua B']);
  });

  it('slug không tồn tại / chưa xuất bản / sai dạng -> data: []', async () => {
    const { a } = await seedTwoTenants();
    await insertLandingPage({ idUser: a.id, slug: 'trang-nhap', isPublished: false });
    for (const query of ['?slug=khong-co', '?slug=trang-nhap', '?slug=', '?slug=a%20b', '?slug[]=trang-a', '?slug=trang-a&slug=trang-b']) {
      const res = await featured(query);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    }
  });

  it('landing thuộc workspace của chủ (workspace_owner_id) -> lấy dòng của CHỦ workspace', async () => {
    const owner = await createUser({ username: 'cms_owner', role: 'user' });
    const employee = await createUser({ username: 'cms_emp', role: 'user' });
    await insertLandingPage({ idUser: employee.id, workspaceOwnerId: owner.id, slug: 'trang-nhan-vien' });
    await insertFeaturedCourse(owner.id, 'Khoa cua chu');
    await insertFeaturedCourse(employee.id, 'Khoa rieng cua nhan vien');

    const res = await featured('?slug=trang-nhan-vien');

    expect(res.body.data.map((r) => r.titleVi)).toEqual(['Khoa cua chu']);
  });
});

describe('GET /api/public/landing-testimonials', () => {
  it('không slug -> data: []', async () => {
    await seedTwoTenants();
    const res = await testimonials();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [] });
  });

  it('?slug= landing đã xuất bản của A -> chỉ dòng ACTIVE của A', async () => {
    await seedTwoTenants();
    const res = await testimonials('?slug=trang-a');
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.nameVi)).toEqual(['Khach cua A']);
    expect(JSON.stringify(res.body)).not.toContain('Khach cua B');
  });

  it('slug không tồn tại / chưa xuất bản -> data: []', async () => {
    const { a } = await seedTwoTenants();
    await insertLandingPage({ idUser: a.id, slug: 'trang-nhap', isPublished: false });
    for (const query of ['?slug=khong-co', '?slug=trang-nhap']) {
      const res = await testimonials(query);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    }
  });
});
