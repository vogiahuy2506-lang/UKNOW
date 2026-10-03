/**
 * Integration tests — update() landing KHÔNG được phá hàng `landing_page_domains` (03/10/2026).
 *
 * Sự cố production: 4 trang `domain_type='custom'` mất hàng `landing_page_domains` (landing 50, 76, 88, 105).
 * Gốc: PUT /api/admin/landing-pages/:id nhận body.domainType='custom' (modal Cài đặt trang cũ gửi nó khi bấm
 * "Lưu tên miền", mà backend bỏ qua hostname) → `removeSubdomain` xoá subdomain miễn phí, không đăng ký gì thay
 * thế. Đổi slug còn gọi `removeSubdomain` + `autoProvisionSubdomain` bất kể hàng domain là miễn phí hay riêng:
 * removeSubdomain xoá hàng theo landing_page_id và autoProvision upsert ĐÈ hàng đó → mất tên miền riêng của khách.
 *
 * Cloudflare không cấu hình trong môi trường test → cấp subdomain miễn phí ghi hàng `pending_verification`
 * `cf_managed=true` (không gọi mạng) — đủ để kiểm hàng miễn phí được cấp lại.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import cloudflareService from '../../src/services/cloudflare.service.js';
import { truncateAll, createUser, createPlan, assignPlanToUser } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Cloudflare giả: cấp subdomain thành công (`ok`) hoặc lỗi. Không gọi mạng thật. */
function mockCloudflare({ ok }) {
  jest.spyOn(cloudflareService, 'isConfigured').mockReturnValue(true);
  jest.spyOn(cloudflareService, 'setupLandingPageDNS').mockResolvedValue(
    ok
      ? { success: true, zoneId: 'zone-guard', recordId: 'rec-guard', message: 'ok' }
      : { success: false, message: 'Cloudflare giả lập lỗi' }
  );
  jest.spyOn(cloudflareService, 'deleteDnsRecord').mockResolvedValue({ success: true });
  jest.spyOn(cloudflareService, 'purgeLandingCache').mockResolvedValue({ success: true });
  jest.spyOn(cloudflareService, 'purgeUrls').mockResolvedValue({ success: true });
}

const BASE = process.env.LP_SUBDOMAIN_BASE || 'founderai.biz';
const HTML = '<!DOCTYPE html><html><head></head><body><h1>Trang thử</h1></body></html>';

async function loginAs(user) {
  const res = await request(app).post('/api/auth/login').send({
    username: user.username,
    password: user.plainPassword,
  });
  return res.body.data.accessToken;
}

async function setup(username) {
  const user = await createUser({ role: 'user', username });
  const plan = await createPlan();
  await assignPlanToUser(user.id, plan.id);
  const token = await loginAs(user);
  return { user, token };
}

async function createLanding(token, slug, extra = {}) {
  const res = await request(app)
    .post('/api/admin/landing-pages')
    .set('Authorization', `Bearer ${token}`)
    .send({ slug, title: `Landing ${slug}`, htmlContent: HTML, isPublished: true, ...extra });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

function putLanding(token, id, body) {
  return request(app)
    .put(`/api/admin/landing-pages/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Landing', htmlContent: HTML, isPublished: true, ...body });
}

async function domainRows(landingId) {
  const res = await db.query(
    `SELECT hostname, cf_managed AS "cfManaged", status, is_apex_domain AS "isApex"
     FROM landing_page_domains WHERE landing_page_id = $1`,
    [landingId]
  );
  return res.rows;
}

async function landingRow(landingId) {
  const res = await db.query(
    'SELECT slug, domain_type AS "domainType", domain_subtype AS "domainSubtype" FROM landing_pages WHERE id = $1',
    [landingId]
  );
  return res.rows[0];
}

/** Dựng trạng thái trang có tên miền riêng đúng như setHostname để lại: hàng cf_managed=false + domain_type='custom'. */
async function convertToCustomDomain(landingId, { hostname, apex = false }) {
  await db.query('DELETE FROM landing_page_domains WHERE landing_page_id = $1', [landingId]);
  await db.query(
    `INSERT INTO landing_page_domains
       (landing_page_id, hostname, verification_token, status, cf_managed, is_apex_domain, verified_at)
     VALUES ($1, $2, 'tok-guard', 'active', FALSE, $3, NOW())`,
    [landingId, hostname, apex]
  );
  await db.query('UPDATE landing_pages SET domain_type = $2, domain_subtype = $3 WHERE id = $1', [
    landingId,
    'custom',
    apex ? 'apex' : 'subdomain',
  ]);
}

describe('PUT /api/admin/landing-pages/:id — body.domainType="custom" không còn xoá subdomain miễn phí', () => {
  it('(i) trang miễn phí: update với domainType="custom" → hàng domain miễn phí còn nguyên, domain_type vẫn "system"', async () => {
    const { token } = await setup('guard-i');
    const id = await createLanding(token, 'guard-free');
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: `guard-free.${BASE}`, cfManaged: true }),
    ]);

    const res = await putLanding(token, id, {
      slug: 'guard-free',
      domainType: 'custom',
      customDomainHostname: 'lp.example.com',
      customDomainIsApex: false,
    });

    expect(res.status).toBe(200);
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: `guard-free.${BASE}`, cfManaged: true }),
    ]);
    expect(await landingRow(id)).toMatchObject({ domainType: 'system', domainSubtype: null });
  });
});

describe('PUT /api/admin/landing-pages/:id — đổi slug không đụng hàng tên miền riêng', () => {
  it('(ii) trang có tên miền riêng: đổi slug (kèm domainType="custom" như frontend gửi) → hàng tên miền riêng còn nguyên, domain_type/subtype giữ nguyên', async () => {
    const { token } = await setup('guard-ii');
    const id = await createLanding(token, 'guard-custom');
    await convertToCustomDomain(id, { hostname: 'guard-example.com', apex: true });

    const res = await putLanding(token, id, { slug: 'guard-custom-moi', domainType: 'custom' });

    expect(res.status).toBe(200);
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: 'guard-example.com', cfManaged: false, status: 'active', isApex: true }),
    ]);
    // slug vẫn đổi được; domain_type + domain_subtype (apex) không bị ghi đè thành 'subdomain' như trước.
    expect(await landingRow(id)).toMatchObject({ slug: 'guard-custom-moi', domainType: 'custom', domainSubtype: 'apex' });
  });

  it('(ii-b) trang có tên miền riêng: đổi slug mà KHÔNG gửi domainType → hàng tên miền riêng còn nguyên', async () => {
    const { token } = await setup('guard-iib');
    const id = await createLanding(token, 'guard-custom-b');
    await convertToCustomDomain(id, { hostname: 'guard-b.example.com' });

    const res = await putLanding(token, id, { slug: 'guard-custom-b2' });

    expect(res.status).toBe(200);
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: 'guard-b.example.com', cfManaged: false }),
    ]);
    expect(await landingRow(id)).toMatchObject({ domainType: 'custom' });
  });

  it('(iii) trang miễn phí: đổi slug → vẫn gỡ subdomain cũ và cấp lại theo slug mới (hành vi cũ)', async () => {
    const { token } = await setup('guard-iii');
    const id = await createLanding(token, 'guard-cu');

    const res = await putLanding(token, id, { slug: 'guard-moi', domainType: 'system' });

    expect(res.status).toBe(200);
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: `guard-moi.${BASE}`, cfManaged: true }),
    ]);
    expect(await landingRow(id)).toMatchObject({ slug: 'guard-moi', domainType: 'system' });
  });

  it('(iii-b) trang miễn phí đổi slug mà không gửi domainType → cũng cấp lại subdomain theo slug mới', async () => {
    const { token } = await setup('guard-iiib');
    const id = await createLanding(token, 'guard-cu-b');

    const res = await putLanding(token, id, { slug: 'guard-moi-b' });

    expect(res.status).toBe(200);
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: `guard-moi-b.${BASE}`, cfManaged: true }),
    ]);
  });
});

describe('PUT /api/admin/landing-pages/:id — custom → system (không còn giao diện nào gửi, giữ cho client API)', () => {
  it('(iv) có slug: cấp subdomain miễn phí THAY hàng tên miền riêng trong một câu lệnh rồi mới đổi domain_type', async () => {
    const { token } = await setup('guard-iv');
    const id = await createLanding(token, 'guard-iv-slug');
    await convertToCustomDomain(id, { hostname: 'guard-iv.example.com' });
    mockCloudflare({ ok: true });

    const res = await putLanding(token, id, { slug: 'guard-iv-slug', domainType: 'system' });

    expect(res.status).toBe(200);
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: `guard-iv-slug.${BASE}`, cfManaged: true, status: 'active' }),
    ]);
    expect(await landingRow(id)).toMatchObject({ domainType: 'system', domainSubtype: null });
  });

  it('(iv-c) có slug nhưng CLOUDFLARE LỖI khi cấp subdomain miễn phí: KHÔNG ghi hàng pending đè tên miền riêng, giữ domain_type="custom"', async () => {
    const { token } = await setup('guard-ivc');
    const id = await createLanding(token, 'guard-ivc-slug');
    await convertToCustomDomain(id, { hostname: 'guard-ivc.example.com' });
    mockCloudflare({ ok: false });

    const res = await putLanding(token, id, { slug: 'guard-ivc-slug', domainType: 'system' });

    expect(res.status).toBe(200);
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: 'guard-ivc.example.com', cfManaged: false, status: 'active' }),
    ]);
    expect(await landingRow(id)).toMatchObject({ domainType: 'custom', domainSubtype: 'subdomain' });
  });

  it('(iv-b) có slug nhưng CẤP subdomain miễn phí THẤT BẠI: giữ tên miền riêng và domain_type="custom" (không để trang rơi về system mà không còn link miễn phí)', async () => {
    const { token } = await setup('guard-ivb');
    const otherId = await createLanding(token, 'guard-ivb-other');
    const id = await createLanding(token, 'guard-ivb-slug');
    await convertToCustomDomain(id, { hostname: 'guard-ivb.example.com' });
    // Trang khác đã giữ đúng hostname miễn phí mà trang này cần → cấp subdomain không thể thành công.
    await db.query('UPDATE landing_page_domains SET hostname = $2 WHERE landing_page_id = $1', [
      otherId,
      `guard-ivb-slug.${BASE}`,
    ]);

    const res = await putLanding(token, id, { slug: 'guard-ivb-slug', domainType: 'system' });

    expect(res.status).toBe(200);
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: 'guard-ivb.example.com', cfManaged: false }),
    ]);
    expect(await landingRow(id)).toMatchObject({ domainType: 'custom', domainSubtype: 'subdomain' });
  });

});

/**
 * Migration 086 cho phép `landing_pages.slug` NULL (trang chỉ chạy bằng tên miền riêng) nhưng bootstrap.sql của
 * integration còn NOT NULL → tạm bỏ ràng buộc trong suite này đúng như production, trả lại khi xong.
 */
describe('PUT /api/admin/landing-pages/:id — trang không slug, chỉ chạy bằng tên miền riêng', () => {
  beforeAll(async () => {
    await db.query('ALTER TABLE landing_pages ALTER COLUMN slug DROP NOT NULL');
  });

  afterAll(async () => {
    await truncateAll();
    await db.query('ALTER TABLE landing_pages ALTER COLUMN slug SET NOT NULL');
  });

  it('(v) custom → system khi trang KHÔNG có slug: không cấp được subdomain → BỎ QUA yêu cầu, giữ tên miền riêng và domain_type="custom"', async () => {
    const { token } = await setup('guard-v');
    const id = await createLanding(token, null, { domainType: 'custom' });
    await convertToCustomDomain(id, { hostname: 'guard-v.example.com' });

    const res = await putLanding(token, id, { slug: null, domainType: 'system' });

    expect(res.status).toBe(200);
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: 'guard-v.example.com', cfManaged: false, status: 'active' }),
    ]);
    expect(await landingRow(id)).toMatchObject({ slug: null, domainType: 'custom' });
  });

  it('(v-b) lưu trang không slug (frontend gửi domainType="custom") → hàng tên miền riêng còn nguyên', async () => {
    const { token } = await setup('guard-vb');
    const id = await createLanding(token, null, { domainType: 'custom' });
    await convertToCustomDomain(id, { hostname: 'guard-vb.example.com' });

    const res = await putLanding(token, id, { slug: null, title: 'Đổi tiêu đề', domainType: 'custom' });

    expect(res.status).toBe(200);
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: 'guard-vb.example.com', cfManaged: false }),
    ]);
  });
});
