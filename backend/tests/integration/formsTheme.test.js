/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-4a — backend giao diện biểu mẫu: chuẩn hoá
 * `theme`, upload ảnh (banner/logo), vòng đời khoá kho, trả ra API. PR-3 đã lên origin/main
 * (f71c60ad). Frontend (PR-4b), MoMo, PR-7 không thuộc phạm vi PR-4a.
 *
 * Local storage backend giống tests/integration/fileStorage.test.js — POST /api/uploads/temp và
 * POST /api/forms/assets ghi file thật, phải trỏ sang thư mục tmp riêng của suite này, không
 * phải <cwd>/uploads thật.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import uploadController from '../../src/controllers/upload.controller.js';
import {
  setStorageBackendInstance,
  resetStorageBackendForTest,
} from '../../src/services/storage/storageBackend.js';
import { LocalStorageBackend } from '../../src/services/storage/localStorageBackend.js';
import { truncateAll, createUser } from './helpers/db.js';

const TEST_ROOT = path.join(os.tmpdir(), `uknow-forms-theme-${process.pid}-${Date.now()}`);
const TEST_TEMP_DIR = path.join(TEST_ROOT, 'temp_uploads');
const TEST_UPLOADS_DIR = path.join(TEST_ROOT, 'uploads');

let app;

beforeAll(async () => {
  await fs.mkdir(TEST_TEMP_DIR, { recursive: true });
  await fs.mkdir(TEST_UPLOADS_DIR, { recursive: true });
  uploadController.tempDir = TEST_TEMP_DIR;
  uploadController.uploadsRootDir = TEST_UPLOADS_DIR;
  setStorageBackendInstance(new LocalStorageBackend({
    uploadsRootDir: TEST_UPLOADS_DIR,
    tempDir: TEST_TEMP_DIR,
  }));
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  // truncateAll() RESTART IDENTITY -> owner.id (BIGSERIAL) lặp lại số nhỏ giữa các test, nhưng
  // chỉ xoá DB — file thật trên đĩa từ lượt trước (vd owner id=1 upload thành công) vẫn còn nếu
  // không dọn ở đây, làm lẫn với owner id=1 của lượt SAU (bẫy phát hiện lúc viết ca "hạn mức dung
  // lượng hết ... không còn file": tìm thấy file thừa từ lượt trước, không phải lượt đang chạy).
  await fs.rm(TEST_TEMP_DIR, { recursive: true, force: true }).catch(() => {});
  await fs.rm(TEST_UPLOADS_DIR, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(TEST_TEMP_DIR, { recursive: true });
  await fs.mkdir(TEST_UPLOADS_DIR, { recursive: true });
});

afterAll(async () => {
  resetStorageBackendForTest();
  await fs.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

async function addEmployeeMembership(ownerId, employeeId, permissions = {}) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status)
     VALUES ($1, $2, $3::jsonb, 'active')`,
    [ownerId, employeeId, JSON.stringify(permissions)]
  );
}

async function createForm(token, overrides = {}, ownerHeader = null) {
  const req = request(app)
    .post('/api/forms')
    .set('Authorization', `Bearer ${token}`);
  if (ownerHeader) req.set('X-Owner-Context', String(ownerHeader));
  const res = await req.send({
    title: 'Form Giao Diện Test',
    fields: [{ label: 'Email', type: 'email', required: false, role: 'email' }],
    ...overrides,
  });
  return res;
}

async function publishForm(token, id) {
  const res = await request(app)
    .put(`/api/forms/${id}/publish`)
    .set('Authorization', `Bearer ${token}`)
    .send({ isPublished: true });
  expect(res.status).toBe(200);
  return res.body.data;
}

// Magic bytes PNG thật (89 50 4E 47 0D 0A 1A 0A) + phần đuôi bất kỳ — validateFile chỉ so khớp
// magic bytes đầu, không đòi cấu trúc PNG đầy đủ.
const FAKE_PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-png-body-padding-bytes-for-test'),
]);
// Magic bytes PDF thật ("%PDF") — dùng để giả file đổi đuôi .png.
const FAKE_PDF_AS_PNG = Buffer.concat([
  Buffer.from([0x25, 0x50, 0x44, 0x46]),
  Buffer.from('-1.4 fake pdf body'),
]);

async function uploadTempFile(token, buffer, filename, contentType) {
  const res = await request(app)
    .post('/api/uploads/temp')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', buffer, { filename, contentType });
  expect(res.status).toBe(200);
  return res.body.data;
}

async function uploadFormAsset(token, tempData, ownerHeader = null) {
  const req = request(app)
    .post('/api/forms/assets')
    .set('Authorization', `Bearer ${token}`);
  if (ownerHeader) req.set('X-Owner-Context', String(ownerHeader));
  return req.send({
    tempId: tempData.tempId,
    originalName: tempData.originalName,
    contentType: tempData.contentType,
    size: tempData.size,
  });
}

async function findStorageRow(storageKey) {
  const { rows } = await db.query(`SELECT * FROM storage_objects WHERE storage_key = $1`, [storageKey]);
  return rows[0] || null;
}

// ═══════════════════════════════════════════════════════════════════════
// Theme — validate qua POST/PUT /api/forms
// ═══════════════════════════════════════════════════════════════════════
describe('Theme biểu mẫu — chuẩn hoá + xác thực qua POST/PUT /api/forms', () => {
  it('primaryColor "red;background:url(x)" -> 400 INVALID_FORM_THEME', async () => {
    const owner = await createUser({ username: 'theme-color-bad' });
    const token = await loginAs(owner);
    const res = await createForm(token, { theme: { primaryColor: 'red;background:url(x)' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FORM_THEME');
  });

  it('fontFamily "Comic Sans MS" (ngoài whitelist) -> 400', async () => {
    const owner = await createUser({ username: 'theme-font-bad' });
    const token = await loginAs(owner);
    const res = await createForm(token, { theme: { fontFamily: 'Comic Sans MS' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FORM_THEME');
  });

  it('bannerKey là URL ngoài (https://evil.example/a.png) -> 400', async () => {
    const owner = await createUser({ username: 'theme-url-ngoai' });
    const token = await loginAs(owner);
    const res = await createForm(token, { theme: { bannerKey: 'https://evil.example/a.png' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FORM_THEME');
  });

  it('bannerKey của CHỦ KHÁC — đường dẫn mang id ownerB (khoá có thật, tồn tại trong storage_objects) -> 400 ngay ở lớp định dạng (regex nhúng id chủ)', async () => {
    const ownerA = await createUser({ username: 'theme-owner-a' });
    const ownerB = await createUser({ username: 'theme-owner-b' });
    const tokenA = await loginAs(ownerA);

    // Khoá THẬT thuộc ownerB, đúng category/state — không phải khoá bịa.
    const otherKey = `uploads/${ownerB.id}/forms/1234_aaaaaaaa_real.png`;
    await db.query(
      `INSERT INTO storage_objects (pool_type, owner_user_id, actor_user_id, storage_key, category, state, size_bytes)
       VALUES ('workspace', $1, $1, $2, 'form_asset', 'active', 100)`,
      [ownerB.id, otherKey]
    );

    const res = await createForm(tokenA, { theme: { bannerKey: otherKey } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FORM_THEME');
  });

  it('bannerKey ĐÚNG DẠNG (đường dẫn mang id ownerA, qua được lớp regex) nhưng dòng sổ storage_objects thực tế owner_user_id=ownerB -> 400 ở LỚP KIỂM DB (nguồn sự thật độc lập với chuỗi khoá, phòng dữ liệu lệch)', async () => {
    const ownerA = await createUser({ username: 'theme-owner-a2' });
    const ownerB = await createUser({ username: 'theme-owner-b2' });
    const tokenA = await loginAs(ownerA);

    // Đường dẫn khớp regex của ownerA (chủ đang tạo form) — nhưng owner_user_id THẬT trong sổ
    // lại là ownerB. Trạng thái lệch này không xảy ra qua luồng bình thường (mỗi upload luôn ghi
    // đúng owner_user_id của người upload); dựng bằng SQL trực tiếp để kiểm lớp DB ĐỘC LẬP khỏi
    // lớp regex — nếu chỉ còn lớp regex (đã qua vì đường dẫn khớp ownerA), request sẽ SAI lọt qua.
    const key = `uploads/${ownerA.id}/forms/5678_bbbbbbbb_tampered.png`;
    await db.query(
      `INSERT INTO storage_objects (pool_type, owner_user_id, actor_user_id, storage_key, category, state, size_bytes)
       VALUES ('workspace', $1, $1, $2, 'form_asset', 'active', 100)`,
      [ownerB.id, key]
    );

    const res = await createForm(tokenA, { theme: { bannerKey: key } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FORM_THEME');
  });

  it('bannerKey đúng dạng (đúng chủ) nhưng KHÔNG có dòng sổ storage_objects -> 400', async () => {
    const owner = await createUser({ username: 'theme-no-ledger' });
    const token = await loginAs(owner);
    const ghostKey = `uploads/${owner.id}/forms/9999_ffffffff_ghost.png`;
    const res = await createForm(token, { theme: { bannerKey: ghostKey } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FORM_THEME');
  });

  it('theme: { hack: 1, primaryColor: "#112233" } -> lưu đúng { primaryColor: "#112233" }, khoá lạ bị bỏ', async () => {
    const owner = await createUser({ username: 'theme-whitelist' });
    const token = await loginAs(owner);
    const res = await createForm(token, { theme: { hack: 1, primaryColor: '#112233' } });
    expect(res.status).toBe(201);
    expect(res.body.data.theme).toEqual({ primaryColor: '#112233' });
  });

  it('PUT không gửi theme -> theme cũ giữ nguyên (khác paymentConfig/bookingConfig cùng quy ước undefined=giữ nguyên)', async () => {
    const owner = await createUser({ username: 'theme-put-keep' });
    const token = await loginAs(owner);
    const createRes = await createForm(token, { theme: { primaryColor: '#aabbcc', layout: 'wide' } });
    expect(createRes.status).toBe(201);
    const formId = createRes.body.data.id;

    const putRes = await request(app)
      .put(`/api/forms/${formId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Đổi tiêu đề, không đụng theme' });
    expect(putRes.status).toBe(200);
    expect(putRes.body.data.theme).toEqual({ primaryColor: '#aabbcc', layout: 'wide' });

    const getRes = await request(app).get(`/api/forms/${formId}`).set('Authorization', `Bearer ${token}`);
    expect(getRes.body.data.theme).toEqual({ primaryColor: '#aabbcc', layout: 'wide' });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Upload ảnh biểu mẫu — POST /api/forms/assets
// ═══════════════════════════════════════════════════════════════════════
describe('POST /api/forms/assets — upload banner/logo', () => {
  it('không token -> 401', async () => {
    const res = await request(app).post('/api/forms/assets').send({ tempId: 'x' });
    expect(res.status).toBe(401);
  });

  it('temp -> POST /api/forms/assets ảnh PNG thật -> 200, dòng sổ category=form_asset state=temp', async () => {
    const owner = await createUser({ username: 'asset-happy' });
    const token = await loginAs(owner);
    const temp = await uploadTempFile(token, FAKE_PNG, 'banner.png', 'image/png');

    const res = await uploadFormAsset(token, temp);
    expect(res.status).toBe(200);
    expect(res.body.data.storageKey).toMatch(new RegExp(`^uploads/${owner.id}/forms/.+\\.png$`));
    expect(res.body.data.url).toContain(`/lp-assets/${res.body.data.storageKey}`);
    expect(res.body.data.sizeBytes).toBe(FAKE_PNG.length);

    const row = await findStorageRow(res.body.data.storageKey);
    expect(row).toBeTruthy();
    expect(row.category).toBe('form_asset');
    expect(row.state).toBe('temp');
    // users.id là BIGSERIAL -> driver pg trả owner_user_id dạng chuỗi, ép cả hai vế về Number.
    expect(Number(row.owner_user_id)).toBe(Number(owner.id));
    expect(row.expires_at).toBeTruthy();
  });

  it('tệp đổi đuôi .png nhưng thật ra là PDF (magic bytes không khớp) -> 400', async () => {
    const owner = await createUser({ username: 'asset-pdf-disguise' });
    const token = await loginAs(owner);
    const temp = await uploadTempFile(token, FAKE_PDF_AS_PNG, 'evil.png', 'image/png');

    const res = await uploadFormAsset(token, temp);
    expect(res.status).toBe(400);

    // Không lưu kho, không ghi sổ cho tệp bị từ chối.
    const { rows } = await db.query(
      `SELECT * FROM storage_objects WHERE owner_user_id = $1 AND category = 'form_asset'`,
      [owner.id]
    );
    expect(rows).toHaveLength(0);
  });

  it('hạn mức dung lượng hết -> 413 STORAGE_QUOTA_EXCEEDED, không có dòng sổ, không còn file', async () => {
    const owner = await createUser({ username: 'asset-quota' });
    await db.query(`UPDATE users SET storage_quota_override_bytes = 10 WHERE id = $1`, [owner.id]);
    const token = await loginAs(owner);
    const temp = await uploadTempFile(token, FAKE_PNG, 'banner.png', 'image/png');

    process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED = 'true';
    let res;
    try {
      res = await uploadFormAsset(token, temp);
    } finally {
      delete process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED;
    }

    expect(res.status).toBe(413);
    expect(res.body.code).toBe('STORAGE_QUOTA_EXCEEDED');

    const { rows } = await db.query(
      `SELECT * FROM storage_objects WHERE owner_user_id = $1 AND category = 'form_asset'`,
      [owner.id]
    );
    expect(rows).toHaveLength(0);

    // "Không còn file": key được tính trước nhưng chưa từng được insert vào sổ (không biết
    // storageKey chính xác từ response 413), nên xác nhận qua thư mục uploads/<id>/forms/ rỗng.
    const formsDir = path.join(TEST_UPLOADS_DIR, String(owner.id), 'forms');
    const exists = await fs.stat(formsDir).then(() => true).catch(() => false);
    if (exists) {
      const files = await fs.readdir(formsDir);
      expect(files).toHaveLength(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Vòng đời khoá kho ảnh — activate khi lưu form, release khi đổi/xoá
// ═══════════════════════════════════════════════════════════════════════
describe('Vòng đời khoá ảnh biểu mẫu', () => {
  it('lưu form với bannerKey vừa upload -> dòng sổ chuyển active, reference_type=form, reference_id=id form', async () => {
    const owner = await createUser({ username: 'lifecycle-activate' });
    const token = await loginAs(owner);
    const temp = await uploadTempFile(token, FAKE_PNG, 'banner.png', 'image/png');
    const uploadRes = await uploadFormAsset(token, temp);
    const bannerKey = uploadRes.body.data.storageKey;

    const createRes = await createForm(token, { theme: { bannerKey } });
    expect(createRes.status).toBe(201);
    const formId = createRes.body.data.id;

    const row = await findStorageRow(bannerKey);
    expect(row.state).toBe('active');
    expect(row.reference_type).toBe('form');
    // forms.id là BIGSERIAL -> cả row.reference_id lẫn formId (từ JSON) có thể là chuỗi, ép Number.
    expect(Number(row.reference_id)).toBe(Number(formId));
    expect(row.expires_at).toBeNull();
  });

  it('đổi sang banner khác -> khoá cũ deleted, khoá mới active', async () => {
    const owner = await createUser({ username: 'lifecycle-swap' });
    const token = await loginAs(owner);

    const temp1 = await uploadTempFile(token, FAKE_PNG, 'banner1.png', 'image/png');
    const upload1 = await uploadFormAsset(token, temp1);
    const bannerKey1 = upload1.body.data.storageKey;

    const createRes = await createForm(token, { theme: { bannerKey: bannerKey1 } });
    const formId = createRes.body.data.id;

    const temp2 = await uploadTempFile(token, FAKE_PNG, 'banner2.png', 'image/png');
    const upload2 = await uploadFormAsset(token, temp2);
    const bannerKey2 = upload2.body.data.storageKey;

    const putRes = await request(app)
      .put(`/api/forms/${formId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ theme: { bannerKey: bannerKey2 } });
    expect(putRes.status).toBe(200);

    const row1 = await findStorageRow(bannerKey1);
    const row2 = await findStorageRow(bannerKey2);
    expect(row1.state).toBe('deleted');
    expect(row2.state).toBe('active');
    expect(Number(row2.reference_id)).toBe(Number(formId));
  });

  it('xoá form có banner + logo -> cả hai khoá chuyển deleted', async () => {
    const owner = await createUser({ username: 'lifecycle-delete-form' });
    const token = await loginAs(owner);

    const tempBanner = await uploadTempFile(token, FAKE_PNG, 'banner.png', 'image/png');
    const bannerKey = (await uploadFormAsset(token, tempBanner)).body.data.storageKey;
    const tempLogo = await uploadTempFile(token, FAKE_PNG, 'logo.png', 'image/png');
    const logoKey = (await uploadFormAsset(token, tempLogo)).body.data.storageKey;

    const createRes = await createForm(token, { theme: { bannerKey, logoKey } });
    const formId = createRes.body.data.id;

    const delRes = await request(app).delete(`/api/forms/${formId}`).set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(200);

    const bannerRow = await findStorageRow(bannerKey);
    const logoRow = await findStorageRow(logoKey);
    expect(bannerRow.state).toBe('deleted');
    expect(logoRow.state).toBe('deleted');
  });

  it('gỡ ảnh (bannerKey: null) -> khoá cũ deleted, theme không còn bannerKey', async () => {
    const owner = await createUser({ username: 'lifecycle-remove' });
    const token = await loginAs(owner);
    const temp = await uploadTempFile(token, FAKE_PNG, 'banner.png', 'image/png');
    const bannerKey = (await uploadFormAsset(token, temp)).body.data.storageKey;
    const createRes = await createForm(token, { theme: { bannerKey } });
    const formId = createRes.body.data.id;

    const putRes = await request(app)
      .put(`/api/forms/${formId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ theme: { bannerKey: null } });
    expect(putRes.status).toBe(200);
    // normalizeFormTheme giữ bannerKey: null tường minh (tín hiệu "đã gỡ", khác "chưa từng gửi").
    expect(putRes.body.data.theme.bannerKey).toBeNull();

    const row = await findStorageRow(bannerKey);
    expect(row.state).toBe('deleted');
  });

  // ─── Review 15/09, Việc 1: khoá ảnh còn được form KHÁC dùng thì KHÔNG được giải phóng ───

  it('P1 — form B dùng CHUNG bannerKey với form A; xoá B -> khoá vẫn active (A còn dùng); xoá tiếp A -> khoá mới deleted', async () => {
    const owner = await createUser({ username: 'lifecycle-shared-p1' });
    const token = await loginAs(owner);
    const temp = await uploadTempFile(token, FAKE_PNG, 'banner.png', 'image/png');
    const bannerKey = (await uploadFormAsset(token, temp)).body.data.storageKey;

    const formA = (await createForm(token, { title: 'Form A', theme: { bannerKey } })).body.data;
    const formB = (await createForm(token, { title: 'Form B', theme: { bannerKey } })).body.data;
    expect(formB.theme.bannerKey).toBe(bannerKey);

    const delB = await request(app).delete(`/api/forms/${formB.id}`).set('Authorization', `Bearer ${token}`);
    expect(delB.status).toBe(200);

    // A còn tham chiếu -> khoá KHÔNG bị giải phóng.
    const rowAfterB = await findStorageRow(bannerKey);
    expect(rowAfterB.state).toBe('active');
    const lpResAfterB = await request(app).get(`/lp-assets/${bannerKey}`);
    expect(lpResAfterB.status).toBe(200);

    const delA = await request(app).delete(`/api/forms/${formA.id}`).set('Authorization', `Bearer ${token}`);
    expect(delA.status).toBe(200);

    // Không còn form nào tham chiếu -> giờ mới giải phóng.
    const rowAfterA = await findStorageRow(bannerKey);
    expect(rowAfterA.state).toBe('deleted');
  });

  it('P2 — bannerKey và logoKey CỦA CÙNG MỘT FORM trỏ chung 1 khoá; gỡ banner -> khoá vẫn active (logo còn dùng); gỡ nốt logo -> khoá mới deleted', async () => {
    const owner = await createUser({ username: 'lifecycle-shared-p2' });
    const token = await loginAs(owner);
    const temp = await uploadTempFile(token, FAKE_PNG, 'shared.png', 'image/png');
    const key = (await uploadFormAsset(token, temp)).body.data.storageKey;

    const createRes = await createForm(token, { theme: { bannerKey: key, logoKey: key } });
    const formId = createRes.body.data.id;

    // Gỡ banner (payload chỉ còn logoKey) — theme full-replace nên bannerKey vắng mặt trong lần gửi này.
    const putRemoveBanner = await request(app)
      .put(`/api/forms/${formId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ theme: { logoKey: key } });
    expect(putRemoveBanner.status).toBe(200);
    expect(putRemoveBanner.body.data.theme).not.toHaveProperty('bannerKey');
    expect(putRemoveBanner.body.data.theme.logoKey).toBe(key);

    // logo vẫn dùng khoá này -> chưa giải phóng.
    const rowAfterBannerGone = await findStorageRow(key);
    expect(rowAfterBannerGone.state).toBe('active');

    // Gỡ nốt logo -> giờ mới giải phóng.
    const putRemoveLogo = await request(app)
      .put(`/api/forms/${formId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ theme: {} });
    expect(putRemoveLogo.status).toBe(200);

    const rowAfterAll = await findStorageRow(key);
    expect(rowAfterAll.state).toBe('deleted');
  });

  it('Việc 2 — khoá đã bị giải phóng (state=deleted) rồi bị form KHÁC cố dùng lại -> 400 INVALID_FORM_THEME (kiểm state vẫn còn tác dụng)', async () => {
    const owner = await createUser({ username: 'lifecycle-reuse-deleted' });
    const token = await loginAs(owner);
    const temp = await uploadTempFile(token, FAKE_PNG, 'banner.png', 'image/png');
    const bannerKey = (await uploadFormAsset(token, temp)).body.data.storageKey;

    const createRes = await createForm(token, { theme: { bannerKey } });
    const formId = createRes.body.data.id;

    // Đổi sang banner khác -> khoá cũ không còn form nào dùng -> giải phóng (state=deleted).
    const temp2 = await uploadTempFile(token, FAKE_PNG, 'other.png', 'image/png');
    const otherKey = (await uploadFormAsset(token, temp2)).body.data.storageKey;
    const putRes = await request(app)
      .put(`/api/forms/${formId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ theme: { bannerKey: otherKey } });
    expect(putRes.status).toBe(200);
    expect((await findStorageRow(bannerKey)).state).toBe('deleted');

    // Form KHÁC cố dùng lại chính khoá đã deleted đó -> phải bị chặn.
    const reuseRes = await createForm(token, { theme: { bannerKey } });
    expect(reuseRes.status).toBe(400);
    expect(reuseRes.body.code).toBe('INVALID_FORM_THEME');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Trả ra API — public GET + trạng thái công khai
// ═══════════════════════════════════════════════════════════════════════
describe('Trả theme ra API — public GET + trạng thái công khai', () => {
  it('public GET form có banner -> theme.bannerUrl kết thúc bằng /lp-assets/<khoá>, KHÔNG có bannerKey', async () => {
    const owner = await createUser({ username: 'public-theme' });
    const token = await loginAs(owner);
    const temp = await uploadTempFile(token, FAKE_PNG, 'banner.png', 'image/png');
    const bannerKey = (await uploadFormAsset(token, temp)).body.data.storageKey;
    const createRes = await createForm(token, { theme: { bannerKey, primaryColor: '#123456' } });
    const form = await publishForm(token, createRes.body.data.id);

    const publicRes = await request(app).get(`/api/public/forms/${form.publicKey}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.theme.bannerUrl).toBeTruthy();
    expect(publicRes.body.data.theme.bannerUrl.endsWith(`/lp-assets/${bannerKey}`)).toBe(true);
    expect(publicRes.body.data.theme.primaryColor).toBe('#123456');
    expect(publicRes.body.data.theme).not.toHaveProperty('bannerKey');
  });

  it('owner GET (private) trả cả bannerKey lẫn bannerUrl', async () => {
    const owner = await createUser({ username: 'owner-theme-get' });
    const token = await loginAs(owner);
    const temp = await uploadTempFile(token, FAKE_PNG, 'banner.png', 'image/png');
    const bannerKey = (await uploadFormAsset(token, temp)).body.data.storageKey;
    const createRes = await createForm(token, { theme: { bannerKey } });

    const getRes = await request(app).get(`/api/forms/${createRes.body.data.id}`).set('Authorization', `Bearer ${token}`);
    expect(getRes.body.data.theme.bannerKey).toBe(bannerKey);
    expect(getRes.body.data.theme.bannerUrl.endsWith(`/lp-assets/${bannerKey}`)).toBe(true);
  });

  it('trạng thái công khai (submission status) trả theme cùng dạng public để trang QR khớp giao diện form', async () => {
    const owner = await createUser({ username: 'status-theme' });
    const token = await loginAs(owner);
    const temp = await uploadTempFile(token, FAKE_PNG, 'banner.png', 'image/png');
    const bannerKey = (await uploadFormAsset(token, temp)).body.data.storageKey;
    const createRes = await createForm(token, { theme: { bannerKey, layout: 'wide' } });
    const form = await publishForm(token, createRes.body.data.id);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { [createRes.body.data.fields[0].key]: 'a@b.com' } });
    expect(submitRes.status).toBe(201);

    const statusRes = await request(app).get(
      `/api/public/forms/${form.publicKey}/submissions/${submitRes.body.data.accessToken}`
    );
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.theme.layout).toBe('wide');
    expect(statusRes.body.data.theme.bannerUrl.endsWith(`/lp-assets/${bannerKey}`)).toBe(true);
    expect(statusRes.body.data.theme).not.toHaveProperty('bannerKey');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Nhân viên có quyền `forms` — được đổi theme (không chạm tiền)
// ═══════════════════════════════════════════════════════════════════════
describe('Nhân viên quyền forms — upload + lưu theme', () => {
  it('nhân viên (activeContext employee, quyền forms) upload ảnh + tạo form kèm theme -> 200/201', async () => {
    const owner = await createUser({ username: 'emp-theme-owner' });
    const employee = await createUser({ username: 'emp-theme-emp' });
    await addEmployeeMembership(owner.id, employee.id, { forms: true });
    const employeeToken = await loginAs(employee);

    const temp = await uploadTempFile(employeeToken, FAKE_PNG, 'banner.png', 'image/png');
    const uploadRes = await uploadFormAsset(employeeToken, temp, owner.id);
    expect(uploadRes.status).toBe(200);
    // Khoá ghi theo ownerId của WORKSPACE (chủ), không phải id nhân viên.
    expect(uploadRes.body.data.storageKey).toMatch(new RegExp(`^uploads/${owner.id}/forms/`));

    const createRes = await createForm(
      employeeToken,
      { theme: { bannerKey: uploadRes.body.data.storageKey, primaryColor: '#654321' } },
      owner.id
    );
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.theme.primaryColor).toBe('#654321');
  });
});
