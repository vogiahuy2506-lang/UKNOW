/**
 * Integration tests — tên miền riêng của landing CHẠY THẬT (PLAN_TEN_MIEN_RIENG_VA_BIEU_MAU_LIEN_KET_LANDING, PR-D).
 *
 * Trước đây PUT /:id/custom-domain xoá subdomain miễn phí NGAY rồi ghi hàng `pending_verification` dù DNS của khách
 * chưa trỏ → trang mất link vô thời hạn (production: 3 hàng pending từ tháng 6). Nay: kết nối CHỈ KHI DNS đã đúng;
 * `POST /:id/custom-domain/check` xem trước không ghi gì; `DELETE /:id/custom-domain` trả trang về link miễn phí.
 *
 * KHÔNG gọi Cloudflare / DNS thật: spy trên singleton cloudflareService (isConfigured/setupLandingPageDNS/
 * deleteDnsRecord/purge*) và trên `dns/promises` (resolve/resolve4) — beforeEach đặt mặc định "DNS chưa có bản ghi".
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import dns from 'dns/promises';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import cloudflareService from '../../src/services/cloudflare.service.js';
import { truncateAll, createUser } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

const BASE = process.env.LP_SUBDOMAIN_BASE || 'founderai.biz';
const HTML = '<!DOCTYPE html><html><head></head><body><h1>Trang thử</h1></body></html>';
const APEX_IP = '203.0.113.9';

let cfSetupSpy;
let cfDeleteSpy;
let savedApexIp;

function dnsNotFound() {
  return Object.assign(new Error('queryCname ENOTFOUND'), { code: 'ENOTFOUND' });
}

/** DNS của khách đã trỏ đúng: subdomain → CNAME founderai.biz (LP_CNAME_TARGET mặc định). */
function dnsPointsToUs() {
  dns.resolve.mockResolvedValue(['founderai.biz']);
}

beforeEach(async () => {
  await truncateAll();
  savedApexIp = process.env.LP_APEX_FIXED_IP;
  delete process.env.LP_CNAME_TARGET;
  process.env.LP_APEX_FIXED_IP = APEX_IP;

  jest.spyOn(cloudflareService, 'isConfigured').mockReturnValue(true);
  cfSetupSpy = jest.spyOn(cloudflareService, 'setupLandingPageDNS').mockResolvedValue({
    success: true,
    zoneId: 'zone-test',
    recordId: 'rec-test',
    message: 'ok',
  });
  cfDeleteSpy = jest.spyOn(cloudflareService, 'deleteDnsRecord').mockResolvedValue({ success: true });
  jest.spyOn(cloudflareService, 'purgeLandingCache').mockResolvedValue({ success: true });
  jest.spyOn(cloudflareService, 'purgeUrls').mockResolvedValue({ success: true });
  // Mặc định: chưa có bản ghi DNS nào. Ca nào cần DNS đúng gọi dnsPointsToUs() / đặt resolve4 riêng.
  jest.spyOn(dns, 'resolve').mockRejectedValue(dnsNotFound());
  jest.spyOn(dns, 'resolve4').mockRejectedValue(dnsNotFound());
});

afterEach(() => {
  jest.restoreAllMocks();
  if (savedApexIp === undefined) delete process.env.LP_APEX_FIXED_IP;
  else process.env.LP_APEX_FIXED_IP = savedApexIp;
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

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const putDomain = (token, id, body) =>
  request(app).put(`/api/admin/landing-pages/${id}/custom-domain`).set(auth(token)).send(body);
const checkDomain = (token, id, body) =>
  request(app).post(`/api/admin/landing-pages/${id}/custom-domain/check`).set(auth(token)).send(body);
const deleteDomain = (token, id) =>
  request(app).delete(`/api/admin/landing-pages/${id}/custom-domain`).set(auth(token));

async function domainRows(landingId) {
  const res = await db.query(
    `SELECT hostname, cf_managed AS "cfManaged", status, is_apex_domain AS "isApex", cf_record_id AS "cfRecordId"
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

/** Trạng thái "trang vừa tạo": một hàng subdomain miễn phí đang chạy + domain_type='system'. */
async function expectFreeLinkIntact(landingId, slug) {
  expect(await domainRows(landingId)).toEqual([
    expect.objectContaining({ hostname: `${slug}.${BASE}`, cfManaged: true, status: 'active' }),
  ]);
  expect(await landingRow(landingId)).toMatchObject({ domainType: 'system', domainSubtype: null });
}

/** Dựng trạng thái trang có tên miền riêng đúng như setHostname để lại: hàng cf_managed=false + domain_type='custom'. */
async function convertToCustomDomain(landingId, { hostname, status = 'active', apex = false }) {
  await db.query('DELETE FROM landing_page_domains WHERE landing_page_id = $1', [landingId]);
  await db.query(
    `INSERT INTO landing_page_domains
       (landing_page_id, hostname, verification_token, status, cf_managed, is_apex_domain, verified_at)
     VALUES ($1, $2, 'tok-custom', $3, FALSE, $4, NOW())`,
    [landingId, hostname, status, apex]
  );
  await db.query('UPDATE landing_pages SET domain_type = $2, domain_subtype = $3 WHERE id = $1', [
    landingId,
    'custom',
    apex ? 'apex' : 'subdomain',
  ]);
}

describe('PUT /api/admin/landing-pages/:id/custom-domain — chỉ kết nối khi DNS đã đúng', () => {
  it('(1) DNS CHƯA đúng → 422 kèm bảng bản ghi cần thêm; hàng miễn phí còn nguyên, domain_type vẫn system, không đụng Cloudflare', async () => {
    const { token } = await setup('cd-1');
    const id = await createLanding(token, 'cd-free');
    await expectFreeLinkIntact(id, 'cd-free');
    cfSetupSpy.mockClear();

    const res = await putDomain(token, id, { hostname: 'lp.example.com', isApexDomain: false });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/lp\.example\.com/);
    expect(res.body.data).toMatchObject({
      verified: false,
      hostname: 'lp.example.com',
      isApexDomain: false,
      cnameTarget: 'founderai.biz',
      dnsRecords: [expect.objectContaining({ type: 'CNAME', host: 'lp', value: 'founderai.biz' })],
    });
    await expectFreeLinkIntact(id, 'cd-free');
    expect(cfDeleteSpy).not.toHaveBeenCalled();
    expect(cfSetupSpy).not.toHaveBeenCalled();
  });

  it('(1b) DNS trỏ SAI chỗ (CNAME khác) cũng 422 và không ghi gì', async () => {
    const { token } = await setup('cd-1b');
    const id = await createLanding(token, 'cd-wrong');
    dns.resolve.mockResolvedValue(['nhaquangcao.vn']);

    const res = await putDomain(token, id, { hostname: 'lp.example.com', isApexDomain: false });

    expect(res.status).toBe(422);
    expect(res.body.data).toMatchObject({ verified: false, reason: 'wrong_target', found: ['nhaquangcao.vn'] });
    await expectFreeLinkIntact(id, 'cd-wrong');
  });

  it('(2) DNS đúng → hàng tên miền riêng active THAY hàng miễn phí, domain_type=custom, dọn bản ghi DNS Cloudflare cũ', async () => {
    const { token } = await setup('cd-2');
    const id = await createLanding(token, 'cd-ok');
    dnsPointsToUs();

    const res = await putDomain(token, id, { hostname: 'LP.Example.com', isApexDomain: false });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      configured: true,
      hostname: 'lp.example.com',
      status: 'active',
      cfManaged: false,
      isApexDomain: false,
    });
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: 'lp.example.com', cfManaged: false, status: 'active', isApex: false }),
    ]);
    expect(await landingRow(id)).toMatchObject({ domainType: 'custom', domainSubtype: 'subdomain' });
    expect(cfDeleteSpy).toHaveBeenCalledWith('zone-test', 'rec-test');
  });

  it('(2b) tên miền chính (apex) + A trỏ đúng IP hệ thống → kết nối, domain_subtype=apex', async () => {
    const { token } = await setup('cd-2b');
    const id = await createLanding(token, 'cd-apex');
    dns.resolve4.mockResolvedValue([APEX_IP]);

    const res = await putDomain(token, id, { hostname: 'example.com', isApexDomain: true });

    expect(res.status).toBe(200);
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: 'example.com', cfManaged: false, status: 'active', isApex: true }),
    ]);
    expect(await landingRow(id)).toMatchObject({ domainType: 'custom', domainSubtype: 'apex' });
  });

  it('(2c) apex mà A chưa trỏ về IP hệ thống → 422 với bản ghi A cần thêm; không ghi gì', async () => {
    const { token } = await setup('cd-2c');
    const id = await createLanding(token, 'cd-apex-wrong');
    dns.resolve4.mockResolvedValue(['198.51.100.7']);

    const res = await putDomain(token, id, { hostname: 'example.com', isApexDomain: true });

    expect(res.status).toBe(422);
    expect(res.body.data).toMatchObject({
      verified: false,
      isApexDomain: true,
      currentIp: '198.51.100.7',
      dnsRecords: [{ type: 'A', host: '@', value: APEX_IP, ttl: 3600 }],
    });
    await expectFreeLinkIntact(id, 'cd-apex-wrong');
  });

  it('(5) hostname đã dùng cho trang khác → 409, trang này giữ nguyên link miễn phí', async () => {
    const { token } = await setup('cd-5');
    const idA = await createLanding(token, 'cd-a');
    const idB = await createLanding(token, 'cd-b');
    dnsPointsToUs();
    expect((await putDomain(token, idA, { hostname: 'lp.example.com' })).status).toBe(200);

    const res = await putDomain(token, idB, { hostname: 'lp.example.com' });

    expect(res.status).toBe(409);
    await expectFreeLinkIntact(idB, 'cd-b');
    // Hàng của trang A không bị đụng.
    expect(await domainRows(idA)).toEqual([expect.objectContaining({ hostname: 'lp.example.com', cfManaged: false })]);
  });

  it('trang chưa xuất bản → 400, không ghi gì', async () => {
    const { token } = await setup('cd-draft');
    const id = await createLanding(token, 'cd-draft-lp', { isPublished: false });
    dnsPointsToUs();

    const res = await putDomain(token, id, { hostname: 'lp.example.com' });

    expect(res.status).toBe(400);
    expect(await landingRow(id)).toMatchObject({ domainType: 'system' });
  });

  it('hostname không hợp lệ / bị chặn → 400', async () => {
    const { token } = await setup('cd-bad');
    const id = await createLanding(token, 'cd-bad-lp');
    expect((await putDomain(token, id, { hostname: 'khong hop le' })).status).toBe(400);
    expect((await putDomain(token, id, { hostname: 'founderai.biz' })).status).toBe(400);
    await expectFreeLinkIntact(id, 'cd-bad-lp');
  });
});

describe('POST /api/admin/landing-pages/:id/custom-domain/check — xem trước DNS, KHÔNG ghi gì', () => {
  it('DNS chưa đúng → 200 verified=false + bảng bản ghi + hướng dẫn; mọi dữ liệu y nguyên', async () => {
    const { token } = await setup('chk-1');
    const id = await createLanding(token, 'chk-free');
    cfSetupSpy.mockClear();

    const res = await checkDomain(token, id, { hostname: 'lp.example.com', isApexDomain: false });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      verified: false,
      reason: 'not_found',
      hostname: 'lp.example.com',
      dnsRecords: [expect.objectContaining({ type: 'CNAME', host: 'lp', value: 'founderai.biz' })],
    });
    expect(typeof res.body.data.message).toBe('string');
    await expectFreeLinkIntact(id, 'chk-free');
    expect(cfDeleteSpy).not.toHaveBeenCalled();
    expect(cfSetupSpy).not.toHaveBeenCalled();
  });

  it('DNS đã đúng → verified=true nhưng VẪN không ghi gì (chỉ PUT mới kết nối)', async () => {
    const { token } = await setup('chk-2');
    const id = await createLanding(token, 'chk-ok');
    dnsPointsToUs();

    const res = await checkDomain(token, id, { hostname: 'lp.example.com', isApexDomain: false });

    expect(res.status).toBe(200);
    expect(res.body.data.verified).toBe(true);
    await expectFreeLinkIntact(id, 'chk-ok');
    expect(cfDeleteSpy).not.toHaveBeenCalled();
  });

  it('hostname đã dùng cho trang khác → 409 ngay ở bước kiểm tra (khách khỏi cài DNS vô ích)', async () => {
    const { token } = await setup('chk-3');
    const idA = await createLanding(token, 'chk-a');
    const idB = await createLanding(token, 'chk-b');
    dnsPointsToUs();
    expect((await putDomain(token, idA, { hostname: 'lp.example.com' })).status).toBe(200);

    const res = await checkDomain(token, idB, { hostname: 'lp.example.com' });

    expect(res.status).toBe(409);
  });

  it('trang của workspace khác → 404', async () => {
    const { token } = await setup('chk-4a');
    const other = await setup('chk-4b');
    const id = await createLanding(token, 'chk-own');

    const res = await checkDomain(other.token, id, { hostname: 'lp.example.com' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/landing-pages/:id/custom-domain — gỡ tên miền riêng, trang quay về link miễn phí', () => {
  it('(3) sau khi kết nối rồi gỡ → hàng miễn phí được cấp lại theo slug, domain_type=system', async () => {
    const { token } = await setup('del-3');
    const id = await createLanding(token, 'del-ok');
    dnsPointsToUs();
    expect((await putDomain(token, id, { hostname: 'lp.example.com' })).status).toBe(200);
    expect(await landingRow(id)).toMatchObject({ domainType: 'custom' });
    cfSetupSpy.mockClear();

    const res = await deleteDomain(token, id);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ok: true, hostname: `del-ok.${BASE}`, cfManaged: true });
    expect(cfSetupSpy).toHaveBeenCalledWith(`del-ok.${BASE}`, 'founderai.biz');
    await expectFreeLinkIntact(id, 'del-ok');
  });

  it('(3b) trang có hàng tên miền riêng `pending_verification` cũ (từ trước) → gỡ cũng cấp lại link miễn phí', async () => {
    const { token } = await setup('del-3b');
    const id = await createLanding(token, 'del-pending');
    await convertToCustomDomain(id, { hostname: 'cu.example.com', status: 'pending_verification' });

    const res = await deleteDomain(token, id);

    expect(res.status).toBe(200);
    await expectFreeLinkIntact(id, 'del-pending');
  });

  it('(3c) cấp link miễn phí THẤT BẠI (Cloudflare từ chối) → 502, GIỮ tên miền riêng + domain_type=custom, không ghi hàng pending đè', async () => {
    const { token } = await setup('del-3c');
    const id = await createLanding(token, 'del-cf-fail');
    await convertToCustomDomain(id, { hostname: 'giu.example.com' });
    cfSetupSpy.mockResolvedValue({ success: false, message: 'CF từ chối' });

    const res = await deleteDomain(token, id);

    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/giữ nguyên/);
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: 'giu.example.com', cfManaged: false, status: 'active' }),
    ]);
    expect(await landingRow(id)).toMatchObject({ domainType: 'custom' });
  });

  it('(3d) trang đang dùng link miễn phí (không có tên miền riêng) → 400, KHÔNG xoá link miễn phí', async () => {
    const { token } = await setup('del-3d');
    const id = await createLanding(token, 'del-free');

    const res = await deleteDomain(token, id);

    expect(res.status).toBe(400);
    await expectFreeLinkIntact(id, 'del-free');
  });

  it('(3e) trang không có hàng tên miền nào → 404', async () => {
    const { token } = await setup('del-3e');
    const id = await createLanding(token, 'del-none');
    await db.query('DELETE FROM landing_page_domains WHERE landing_page_id = $1', [id]);

    const res = await deleteDomain(token, id);

    expect(res.status).toBe(404);
  });
});

/**
 * Migration 086 cho phép `landing_pages.slug` NULL (trang chỉ chạy bằng tên miền riêng) nhưng bootstrap.sql của
 * integration còn NOT NULL → tạm bỏ ràng buộc trong suite này đúng như production, trả lại khi xong.
 */
describe('DELETE /api/admin/landing-pages/:id/custom-domain — trang không có slug', () => {
  beforeAll(async () => {
    await db.query('ALTER TABLE landing_pages ALTER COLUMN slug DROP NOT NULL');
  });

  afterAll(async () => {
    await truncateAll();
    await db.query('ALTER TABLE landing_pages ALTER COLUMN slug SET NOT NULL');
  });

  it('(4) không có slug → 400 "cần đường dẫn (slug)"; tên miền riêng còn nguyên, không cấp gì', async () => {
    const { token } = await setup('del-4');
    const id = await createLanding(token, null, { domainType: 'custom' });
    await convertToCustomDomain(id, { hostname: 'khong-slug.example.com' });
    cfSetupSpy.mockClear();

    const res = await deleteDomain(token, id);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/slug/);
    expect(await domainRows(id)).toEqual([
      expect.objectContaining({ hostname: 'khong-slug.example.com', cfManaged: false, status: 'active' }),
    ]);
    expect(await landingRow(id)).toMatchObject({ domainType: 'custom' });
    expect(cfSetupSpy).not.toHaveBeenCalled();
  });
});

describe('quyền: nhân viên không có quyền landing_pages → 403', () => {
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
      owner,
      ownerToken,
      employeeHeaders: { Authorization: `Bearer ${employeeToken}`, 'X-Owner-Context': String(owner.id) },
    };
  }

  it('(6) PUT / DELETE / check / verify đều 403 PERMISSION_DENIED; dữ liệu không đổi', async () => {
    const { ownerToken, employeeHeaders } = await employeeWithPermission(false, 'deny');
    const id = await createLanding(ownerToken, 'perm-lp');
    dnsPointsToUs();

    const results = await Promise.all([
      request(app).put(`/api/admin/landing-pages/${id}/custom-domain`).set(employeeHeaders).send({ hostname: 'lp.example.com' }),
      request(app).delete(`/api/admin/landing-pages/${id}/custom-domain`).set(employeeHeaders),
      request(app).post(`/api/admin/landing-pages/${id}/custom-domain/check`).set(employeeHeaders).send({ hostname: 'lp.example.com' }),
      request(app).post(`/api/admin/landing-pages/${id}/custom-domain/verify`).set(employeeHeaders),
    ]);

    for (const res of results) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    }
    await expectFreeLinkIntact(id, 'perm-lp');
  });

  it('nhân viên CÓ quyền landing_pages kết nối được tên miền cho trang của chủ', async () => {
    const { ownerToken, employeeHeaders } = await employeeWithPermission(true, 'allow');
    const id = await createLanding(ownerToken, 'perm-ok-lp');
    dnsPointsToUs();

    const res = await request(app)
      .put(`/api/admin/landing-pages/${id}/custom-domain`)
      .set(employeeHeaders)
      .send({ hostname: 'lp.example.com' });

    expect(res.status).toBe(200);
    expect(await landingRow(id)).toMatchObject({ domainType: 'custom' });
  });
});
