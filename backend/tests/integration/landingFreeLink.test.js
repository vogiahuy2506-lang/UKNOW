/**
 * Integration tests — "Dùng lại link miễn phí" cho trang landing mất link (PLAN_DUNG_LAI_LINK_MIEN_PHI_2026-10-03).
 *
 * Production có 4 trang `domain_type='custom'` mà KHÔNG còn hàng `landing_page_domains` (landing 50, 76, 88, 105 — gốc là
 * lỗi "Lưu tên miền" cũ, đã chặn); trang 76 còn không có slug. Khách tự cấp lại link `<slug>.founderai.biz` qua
 * POST /api/admin/landing-pages/:id/free-link — endpoint này KHÔNG BAO GIỜ đụng hàng tên miền riêng.
 *
 * KHÔNG gọi Cloudflare thật: spy trên singleton cloudflareService (như landingCustomDomain / landingDomainUpdateGuard).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import cloudflareService from '../../src/services/cloudflare.service.js';
import { truncateAll, createUser } from './helpers/db.js';

let app;
let cfSetupSpy;
let cfDeleteSpy;

const BASE = process.env.LP_SUBDOMAIN_BASE || 'founderai.biz';
const HTML = '<!DOCTYPE html><html><head></head><body><h1>Trang thử</h1></body></html>';

beforeAll(() => {
  app = createApp();
});

/** Cloudflare giả: cấp subdomain thành công (mặc định) hoặc lỗi. Không gọi mạng thật. */
function mockCloudflare({ ok = true } = {}) {
  jest.spyOn(cloudflareService, 'isConfigured').mockReturnValue(true);
  cfSetupSpy = jest.spyOn(cloudflareService, 'setupLandingPageDNS').mockResolvedValue(
    ok
      ? { success: true, zoneId: 'zone-fl', recordId: 'rec-fl', message: 'ok' }
      : { success: false, message: 'Cloudflare giả lập lỗi' }
  );
  cfDeleteSpy = jest.spyOn(cloudflareService, 'deleteDnsRecord').mockResolvedValue({ success: true });
  jest.spyOn(cloudflareService, 'purgeLandingCache').mockResolvedValue({ success: true });
  jest.spyOn(cloudflareService, 'purgeUrls').mockResolvedValue({ success: true });
}

beforeEach(async () => {
  await truncateAll();
  mockCloudflare({ ok: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function loginAs(user) {
  const res = await request(app).post('/api/auth/login').send({
    username: user.username,
    password: user.plainPassword,
  });
  expect(res.status).toBe(200);
  return res.body.data.accessToken;
}

async function setup(username) {
  const user = await createUser({ role: 'user', username });
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

const postFreeLink = (token, id, body) =>
  request(app)
    .post(`/api/admin/landing-pages/${id}/free-link`)
    .set('Authorization', `Bearer ${token}`)
    .send(body ?? {});

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
    `SELECT slug, domain_type AS "domainType", domain_subtype AS "domainSubtype", html_content AS "html"
     FROM landing_pages WHERE id = $1`,
    [landingId]
  );
  return res.rows[0];
}

/** Dựng trang hỏng đúng như production: domain_type='custom' mà không còn hàng landing_page_domains nào. */
async function makeBroken(landingId) {
  await db.query('DELETE FROM landing_page_domains WHERE landing_page_id = $1', [landingId]);
  await db.query(`UPDATE landing_pages SET domain_type = 'custom', domain_subtype = 'subdomain' WHERE id = $1`, [landingId]);
}

/** Trang có tên miền riêng đúng như setHostname để lại: hàng cf_managed=false + domain_type='custom'. */
async function convertToCustomDomain(landingId, { hostname, status = 'active' }) {
  await db.query('DELETE FROM landing_page_domains WHERE landing_page_id = $1', [landingId]);
  await db.query(
    `INSERT INTO landing_page_domains
       (landing_page_id, hostname, verification_token, status, cf_managed, is_apex_domain, verified_at)
     VALUES ($1, $2, 'tok-fl', $3, FALSE, FALSE, NOW())`,
    [landingId, hostname, status]
  );
  await db.query(`UPDATE landing_pages SET domain_type = 'custom', domain_subtype = 'subdomain' WHERE id = $1`, [landingId]);
}

describe('POST /api/admin/landing-pages/:id/free-link — trang mất link, có slug', () => {
  it('(1) trang custom không hàng, có slug → hàng miễn phí `active`, domain_type="system"', async () => {
    const { token } = await setup('fl-1');
    const id = await createLanding(token, 'fl-mat-link');
    await makeBroken(id);
    cfSetupSpy.mockClear();

    const res = await postFreeLink(token, id, {});

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: Number(id), // id landing là bigint → pg trả chuỗi; phản hồi trả số
      slug: 'fl-mat-link',
      domainType: 'system',
      restored: true,
      provisioned: true,
      message: null,
    });
    expect(res.body.data.domain).toMatchObject({ configured: true, hostname: `fl-mat-link.${BASE}`, status: 'active', cfManaged: true });
    expect(cfSetupSpy).toHaveBeenCalledWith(`fl-mat-link.${BASE}`, expect.any(String));
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: `fl-mat-link.${BASE}`, cfManaged: true, status: 'active' }),
    ]);
    expect(await landingRow(id)).toMatchObject({ slug: 'fl-mat-link', domainType: 'system', domainSubtype: null });
  });

  it('(1-b) body có slug khác slug hiện tại → slug được ghi, hàng miễn phí theo slug MỚI, HTML mang data-slug mới', async () => {
    const { token } = await setup('fl-1b');
    const id = await createLanding(token, 'fl-slug-cu');
    await makeBroken(id);

    const res = await postFreeLink(token, id, { slug: '  FL-Slug-Moi ' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ slug: 'fl-slug-moi', domainType: 'system', restored: true });
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: `fl-slug-moi.${BASE}`, cfManaged: true, status: 'active' }),
    ]);
    const lp = await landingRow(id);
    expect(lp).toMatchObject({ slug: 'fl-slug-moi', domainType: 'system' });
    // Slug ghi vào HTML (script theo dõi / thu form mang data-slug) như mọi lần lưu trang: không còn slug cũ.
    expect(lp.html).toContain('data-slug="fl-slug-moi"');
    expect(lp.html).not.toContain('fl-slug-cu');
    expect(lp.html).toContain('Trang thử'); // nội dung trang giữ nguyên
  });
});

describe('POST /api/admin/landing-pages/:id/free-link — kiểm slug đúng luật update()', () => {
  it('(4) slug trùng trang khác → 409 "Slug đã được dùng cho landing khác", không đổi gì (slug, hàng, domain_type)', async () => {
    const { token } = await setup('fl-4');
    await createLanding(token, 'fl-da-co-chu');
    const id = await createLanding(token, 'fl-trang-hong');
    await makeBroken(id);
    cfSetupSpy.mockClear();

    const res = await postFreeLink(token, id, { slug: 'fl-da-co-chu' });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Slug đã được dùng cho landing khác');
    expect(await domainRows(id)).toEqual([]);
    expect(await landingRow(id)).toMatchObject({ slug: 'fl-trang-hong', domainType: 'custom' });
    expect(cfSetupSpy).not.toHaveBeenCalled();
  });

  it('slug sai định dạng / slug dành riêng "l" → 400, không đổi gì', async () => {
    const { token } = await setup('fl-fmt');
    const id = await createLanding(token, 'fl-fmt-lp');
    await makeBroken(id);

    const bad = await postFreeLink(token, id, { slug: 'Sai Dinh Dang!' });
    const reserved = await postFreeLink(token, id, { slug: 'l' });

    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/Slug không hợp lệ/);
    expect(reserved.status).toBe(400);
    expect(reserved.body.message).toMatch(/Slug "l" dành cho landing cố định/);
    expect(await domainRows(id)).toEqual([]);
    expect(await landingRow(id)).toMatchObject({ slug: 'fl-fmt-lp', domainType: 'custom' });
  });
});

/**
 * Migration 086 cho phép `landing_pages.slug` NULL (trang chỉ chạy bằng tên miền riêng) nhưng bootstrap.sql của
 * integration còn NOT NULL → tạm bỏ ràng buộc trong suite này đúng như production (giống landingDomainUpdateGuard).
 */
describe('POST /api/admin/landing-pages/:id/free-link — trang KHÔNG có slug (như landing 76)', () => {
  beforeAll(async () => {
    await db.query('ALTER TABLE landing_pages ALTER COLUMN slug DROP NOT NULL');
  });

  afterAll(async () => {
    await truncateAll();
    await db.query('ALTER TABLE landing_pages ALTER COLUMN slug SET NOT NULL');
  });

  it('(2) không slug + body có slug → slug được ghi (kèm HTML có data-slug) + hàng miễn phí + domain_type="system"', async () => {
    const { token } = await setup('fl-2');
    const id = await createLanding(token, null, { domainType: 'custom' });
    expect(await landingRow(id)).toMatchObject({ slug: null, domainType: 'custom' });
    expect(await domainRows(id)).toEqual([]);

    const res = await postFreeLink(token, id, { slug: 'fl-76-moi' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ slug: 'fl-76-moi', domainType: 'system', restored: true, provisioned: true });
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: `fl-76-moi.${BASE}`, cfManaged: true, status: 'active' }),
    ]);
    const lp = await landingRow(id);
    expect(lp).toMatchObject({ slug: 'fl-76-moi', domainType: 'system', domainSubtype: null });
    expect(lp.html).toContain('data-slug="fl-76-moi"');
  });

  it('(3) không slug và body rỗng → 400 "Cần đặt đường dẫn (slug) trước", KHÔNG đổi gì', async () => {
    const { token } = await setup('fl-3');
    const id = await createLanding(token, null, { domainType: 'custom' });
    cfSetupSpy.mockClear();

    const res = await postFreeLink(token, id, {});
    const blank = await postFreeLink(token, id, { slug: '   ' });

    for (const r of [res, blank]) {
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/Cần đặt đường dẫn \(slug\) trước/);
    }
    expect(await domainRows(id)).toEqual([]);
    expect(await landingRow(id)).toMatchObject({ slug: null, domainType: 'custom' });
    expect(cfSetupSpy).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/landing-pages/:id/free-link — không bao giờ đụng tên miền riêng', () => {
  it.each([
    ['đang chạy', 'active'],
    ['chờ xác minh', 'pending_verification'],
  ])('(5) trang có tên miền riêng %s → 409, hàng tên miền riêng + domain_type="custom" còn NGUYÊN', async (_label, status) => {
    const { token } = await setup(`fl-5-${status}`);
    const id = await createLanding(token, `fl-rieng-${status.slice(0, 3)}`);
    await convertToCustomDomain(id, { hostname: `khach-${status.slice(0, 3)}.example.com`, status });
    cfSetupSpy.mockClear();

    const res = await postFreeLink(token, id, { slug: 'fl-slug-khac' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/tên miền riêng/);
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: `khach-${status.slice(0, 3)}.example.com`, cfManaged: false, status }),
    ]);
    // Không ghi slug mới, không đổi domain_type, không chạm Cloudflare.
    expect(await landingRow(id)).toMatchObject({ slug: `fl-rieng-${status.slice(0, 3)}`, domainType: 'custom', domainSubtype: 'subdomain' });
    expect(cfSetupSpy).not.toHaveBeenCalled();
    expect(cfDeleteSpy).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/landing-pages/:id/free-link — gọi lại không hại', () => {
  it('(6) trang đã có link miễn phí đang chạy → 200 restored=false, không đổi gì, không gọi Cloudflare', async () => {
    const { token } = await setup('fl-6');
    const id = await createLanding(token, 'fl-da-co-link');
    const before = await domainRows(id);
    cfSetupSpy.mockClear();

    const res = await postFreeLink(token, id, { slug: 'fl-khong-duoc-doi' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ slug: 'fl-da-co-link', domainType: 'system', restored: false, provisioned: true });
    expect(await domainRows(id)).toEqual(before);
    expect(await landingRow(id)).toMatchObject({ slug: 'fl-da-co-link', domainType: 'system' });
    expect(cfSetupSpy).not.toHaveBeenCalled();
  });

  it('bấm hai lần liên tiếp trên trang hỏng: lần hai là no-op (không cấp lại)', async () => {
    const { token } = await setup('fl-6b');
    const id = await createLanding(token, 'fl-hai-lan');
    await makeBroken(id);

    const first = await postFreeLink(token, id, {});
    cfSetupSpy.mockClear();
    const second = await postFreeLink(token, id, {});

    expect(first.body.data.restored).toBe(true);
    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({ restored: false, provisioned: true });
    expect(cfSetupSpy).not.toHaveBeenCalled();
    expect(await domainRows(id)).toHaveLength(1);
  });

  it('lần trước lệch giữa chừng (hàng miễn phí đã chạy nhưng domain_type còn "custom") → chỉ sửa nốt domain_type, không cấp lại', async () => {
    const { token } = await setup('fl-6c');
    const id = await createLanding(token, 'fl-lech-giua');
    await db.query(`UPDATE landing_pages SET domain_type = 'custom', domain_subtype = 'subdomain' WHERE id = $1`, [id]);
    cfSetupSpy.mockClear();

    const res = await postFreeLink(token, id, {});

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ restored: true, domainType: 'system' });
    expect(cfSetupSpy).not.toHaveBeenCalled();
    expect(await landingRow(id)).toMatchObject({ domainType: 'system', domainSubtype: null });
    expect(await domainRows(id)).toHaveLength(1);
  });
});

describe('POST /api/admin/landing-pages/:id/free-link — Cloudflare lỗi', () => {
  it('(7) Cloudflare lỗi → hàng `pending_verification` cf_managed=true, domain_type="system", báo provisioned=false kèm lý do; không mất gì', async () => {
    const { token } = await setup('fl-7');
    const id = await createLanding(token, 'fl-cf-loi');
    await makeBroken(id);
    mockCloudflare({ ok: false });

    const res = await postFreeLink(token, id, {});

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ slug: 'fl-cf-loi', domainType: 'system', restored: true, provisioned: false });
    expect(res.body.data.message).toMatch(/Cloudflare giả lập lỗi/);
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: `fl-cf-loi.${BASE}`, cfManaged: true, status: 'pending_verification' }),
    ]);
    expect(await landingRow(id)).toMatchObject({ slug: 'fl-cf-loi', domainType: 'system' });
  });

  it('thử lại sau khi Cloudflare ổn lại: hàng chờ được cấp lại thành `active`', async () => {
    const { token } = await setup('fl-7b');
    const id = await createLanding(token, 'fl-thu-lai');
    await makeBroken(id);
    mockCloudflare({ ok: false });
    expect((await postFreeLink(token, id, {})).body.data.provisioned).toBe(false);

    mockCloudflare({ ok: true });
    const retry = await postFreeLink(token, id, {});

    expect(retry.status).toBe(200);
    expect(retry.body.data).toMatchObject({ restored: true, provisioned: true, message: null });
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: `fl-thu-lai.${BASE}`, cfManaged: true, status: 'active' }),
    ]);
  });
});

describe('POST /api/admin/landing-pages/:id/free-link — phạm vi workspace', () => {
  it('(8) trang của workspace khác → 404, trang đó không đổi', async () => {
    const { token: ownerToken } = await setup('fl-8-own');
    const { token: otherToken } = await setup('fl-8-other');
    const id = await createLanding(ownerToken, 'fl-cua-nguoi-khac');
    await makeBroken(id);

    const res = await postFreeLink(otherToken, id, {});

    expect(res.status).toBe(404);
    expect(await domainRows(id)).toEqual([]);
    expect(await landingRow(id)).toMatchObject({ slug: 'fl-cua-nguoi-khac', domainType: 'custom' });
  });

  it('không đăng nhập → 401', async () => {
    const res = await request(app).post('/api/admin/landing-pages/1/free-link').send({});
    expect(res.status).toBe(401);
  });

  it('id không phải số → 400', async () => {
    const { token } = await setup('fl-id');
    const res = await postFreeLink(token, 'abc', {});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/landing-pages/:id/free-link — quyền nhân viên', () => {
  async function employeeWithPermission(landingPagesPermission, suffix) {
    const owner = await createUser({ role: 'user', username: `own-${suffix}` });
    const employee = await createUser({ role: 'user', username: `emp-${suffix}` });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status)
       VALUES ($1, $2, $3::jsonb, 'active')`,
      [owner.id, employee.id, JSON.stringify({ landing_pages: landingPagesPermission })]
    );
    const ownerToken = await loginAs(owner);
    const employeeToken = await loginAs(employee);
    return {
      ownerToken,
      employeeHeaders: { Authorization: `Bearer ${employeeToken}`, 'X-Owner-Context': String(owner.id) },
    };
  }

  it('nhân viên KHÔNG có quyền landing_pages → 403 PERMISSION_DENIED, dữ liệu không đổi', async () => {
    const { ownerToken, employeeHeaders } = await employeeWithPermission(false, 'fl-deny');
    const id = await createLanding(ownerToken, 'fl-perm-lp');
    await makeBroken(id);

    const res = await request(app).post(`/api/admin/landing-pages/${id}/free-link`).set(employeeHeaders).send({});

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
    expect(await domainRows(id)).toEqual([]);
    expect(await landingRow(id)).toMatchObject({ domainType: 'custom' });
  });

  it('nhân viên CÓ quyền landing_pages cấp lại được link cho trang của chủ', async () => {
    const { ownerToken, employeeHeaders } = await employeeWithPermission(true, 'fl-allow');
    const id = await createLanding(ownerToken, 'fl-perm-ok');
    await makeBroken(id);

    const res = await request(app).post(`/api/admin/landing-pages/${id}/free-link`).set(employeeHeaders).send({});

    expect(res.status).toBe(200);
    expect(await landingRow(id)).toMatchObject({ domainType: 'system' });
    expect(await domainRows(id)).toEqual([expect.objectContaining({ hostname: `fl-perm-ok.${BASE}`, cfManaged: true })]);
  });
});
