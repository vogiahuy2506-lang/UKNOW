/**
 * Integration: trường `file` (khách tải tệp) của Biểu mẫu — PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-4b, QĐ7.
 *
 * Đi qua HTTP thật + DB thật + LocalStorageBackend (thư mục tạm riêng): cờ FORM_FILE_UPLOAD_ENABLED, chuẩn hoá khi lưu, xin URL
 * (đúng/sai loại/sai cỡ), PUT cục bộ có trần, nộp bài xác nhận tệp (cỡ THẬT, chữ ký, form/trường khác, đã dùng, hết hạn),
 * sổ dung lượng của chủ, chủ hết dung lượng (vẫn nhận bài + chuông), tải về (workspace khác 404), xoá biểu mẫu xoá tệp, dọn tệp tạm,
 * rollback khi INSERT bài nộp lỗi, hai bài nộp đua nhau cùng một uploadId.
 * Phần GCS (URL ký V4) được ghim ở src/services/storage/__tests__/gcsStorageBackend.formUpload.spec.js.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import formRepository from '../../src/repositories/form.repository.js';
import { cleanupFormFileUploads } from '../../src/services/formFileUpload.service.js';
import { getStorageUsage } from '../../src/services/storage/storageQuota.service.js';
import {
  setStorageBackendInstance,
  resetStorageBackendForTest,
} from '../../src/services/storage/storageBackend.js';
import { LocalStorageBackend } from '../../src/services/storage/localStorageBackend.js';
import { truncateAll, createUser } from './helpers/db.js';

const TEST_ROOT = path.join(os.tmpdir(), `uknow-forms-file-${process.pid}-${Date.now()}`);
const TEST_UPLOADS_DIR = path.join(TEST_ROOT, 'uploads');
const TEST_TEMP_DIR = path.join(TEST_ROOT, 'temp_uploads');
const MB = 1024 * 1024;

let app;
const savedEnv = {};

function setEnv(name, value) {
  if (!(name in savedEnv)) savedEnv[name] = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeAll(async () => {
  await fs.mkdir(TEST_UPLOADS_DIR, { recursive: true });
  await fs.mkdir(TEST_TEMP_DIR, { recursive: true });
  setStorageBackendInstance(new LocalStorageBackend({ uploadsRootDir: TEST_UPLOADS_DIR, tempDir: TEST_TEMP_DIR }));
  app = createApp();
});

beforeEach(async () => {
  setEnv('FORM_FILE_UPLOAD_ENABLED', 'true');
  setEnv('STORAGE_QUOTA_ENFORCEMENT_ENABLED', undefined);
  await truncateAll();
  // truncateAll() RESTART IDENTITY → id chủ lặp lại giữa các test; file thật của lượt trước phải dọn kẻo lẫn.
  await fs.rm(TEST_UPLOADS_DIR, { recursive: true, force: true }).catch(() => {});
  await fs.rm(TEST_TEMP_DIR, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(TEST_UPLOADS_DIR, { recursive: true });
  await fs.mkdir(TEST_TEMP_DIR, { recursive: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetStorageBackendForTest();
  await fs.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
});

// ─── Mẫu byte ──────────────────────────────────────────────────────────────────────────────────────

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png-body-bytes-for-test')]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jpeg-body-bytes-for-test')]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.from([0x90, 0, 3, 0]), Buffer.from('this program cannot be run in DOS mode')]);

// ─── Helper HTTP / DB ──────────────────────────────────────────────────────────────────────────────

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

const NAME_FIELD = { label: 'Họ tên', type: 'short_text', required: true, role: 'name' };
const FILE_LABEL = 'Hồ sơ đính kèm';

function fileField(overrides = {}) {
  return {
    label: FILE_LABEL,
    type: 'file',
    required: true,
    fileConfig: { kinds: ['image', 'pdf'], maxBytes: 1 * MB, maxFiles: 2 },
    ...overrides,
  };
}

async function createForm(token, fields = [NAME_FIELD, fileField()], extra = {}) {
  return request(app)
    .post('/api/forms')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Form có tệp', fields, ...extra });
}

async function createAndPublish(token, fields = [NAME_FIELD, fileField()]) {
  const createRes = await createForm(token, fields);
  expect(createRes.status).toBe(201);
  const form = createRes.body.data;
  const publishRes = await request(app)
    .put(`/api/forms/${form.id}/publish`)
    .set('Authorization', `Bearer ${token}`)
    .send({ isPublished: true });
  expect(publishRes.status).toBe(200);
  return form;
}

const fileKeyOf = (form) => form.fields.find((f) => f.type === 'file').key;
const nameKeyOf = (form) => form.fields.find((f) => f.label === 'Họ tên').key;

const requestUpload = (form, body) =>
  request(app).post(`/api/public/forms/${form.publicKey}/uploads`).send(body);

const putBytes = (uploadUrl, buffer, contentType) =>
  request(app).put(uploadUrl).set('Content-Type', contentType).send(buffer);

/** Xin URL + PUT tệp; trả dữ liệu phiên. */
async function uploadFile(form, { fileName, contentType, buffer, fieldKey = fileKeyOf(form), declaredSize = buffer.length }) {
  const res = await requestUpload(form, { fieldKey, fileName, size: declaredSize, contentType });
  expect(res.status).toBe(201);
  const put = await putBytes(res.body.data.uploadUrl, buffer, res.body.data.headers['Content-Type']);
  expect(put.status).toBe(200);
  return res.body.data;
}

const submit = (form, answers, extraBody = {}) =>
  request(app).post(`/api/public/forms/${form.publicKey}/submissions`).send({ answers, ...extraBody });

async function getSubmissionRows(formId) {
  const { rows } = await db.query('SELECT * FROM form_submissions WHERE form_id = $1 ORDER BY id', [formId]);
  return rows;
}

const diskPath = (key) => path.join(TEST_UPLOADS_DIR, key.replace(/^uploads\//, ''));
const existsOnDisk = (key) => fs.access(diskPath(key)).then(() => true, () => false);

async function sessionRow(uploadId) {
  const { rows } = await db.query('SELECT * FROM form_file_uploads WHERE id = $1', [uploadId]);
  return rows[0] || null;
}

async function ledgerRows(ownerId) {
  const { rows } = await db.query(
    `SELECT * FROM storage_objects WHERE owner_user_id = $1 AND category = 'form_file' ORDER BY id`,
    [ownerId]
  );
  return rows;
}

async function setup(opts = {}) {
  const owner = await createUser({ username: opts.username || 'owner_ff' });
  const token = await loginAs(owner);
  const form = await createAndPublish(token, opts.fields);
  return { owner, token, form };
}

// ─── Cờ tính năng ──────────────────────────────────────────────────────────────────────────────────

describe('cờ FORM_FILE_UPLOAD_ENABLED', () => {
  it('GET /api/forms/capabilities phản ánh cờ (đọc lúc gọi); mặc định TẮT khi chưa đặt biến', async () => {
    const owner = await createUser({ username: 'owner_ff_cap' });
    const token = await loginAs(owner);
    const get = () => request(app).get('/api/forms/capabilities').set('Authorization', `Bearer ${token}`);

    expect((await get()).body.data).toEqual({ fileUploadsEnabled: true });
    setEnv('FORM_FILE_UPLOAD_ENABLED', 'false');
    expect((await get()).body.data).toEqual({ fileUploadsEnabled: false });
    setEnv('FORM_FILE_UPLOAD_ENABLED', undefined);
    expect((await get()).body.data).toEqual({ fileUploadsEnabled: false });
  });

  it('cờ tắt: lưu biểu mẫu MỚI có trường file → 400 FILE_UPLOAD_DISABLED; biểu mẫu không có trường file vẫn lưu bình thường', async () => {
    setEnv('FORM_FILE_UPLOAD_ENABLED', 'false');
    const owner = await createUser({ username: 'owner_ff_off1' });
    const token = await loginAs(owner);

    const bad = await createForm(token);
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('FILE_UPLOAD_DISABLED');

    const ok = await createForm(token, [NAME_FIELD]);
    expect(ok.status).toBe(201);

    // Thêm trường file vào biểu mẫu đã có khi cờ tắt cũng bị chặn.
    const put = await request(app)
      .put(`/api/forms/${ok.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fields: [NAME_FIELD, fileField()] });
    expect(put.status).toBe(400);
    expect(put.body.code).toBe('FILE_UPLOAD_DISABLED');
  });

  it('cờ tắt SAU khi biểu mẫu đã có trường file: vẫn sửa/lưu lại được (cùng key), khách thấy fileUploads.enabled=false, xin URL → 403, nộp bài KHÔNG bị chặn bởi trường file bắt buộc', async () => {
    const { token, form } = await setup({ username: 'owner_ff_off2' });
    setEnv('FORM_FILE_UPLOAD_ENABLED', 'false');

    const put = await request(app)
      .put(`/api/forms/${form.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Đổi tiêu đề', fields: form.fields });
    expect(put.status).toBe(200);
    expect(put.body.data.fields.find((f) => f.type === 'file').fileConfig).toEqual({
      kinds: ['image', 'pdf'], maxBytes: 1 * MB, maxFiles: 2,
    });

    const pub = await request(app).get(`/api/public/forms/${form.publicKey}`);
    expect(pub.body.data.fileUploads).toEqual({ enabled: false });

    const upload = await requestUpload(form, { fieldKey: fileKeyOf(form), fileName: 'a.png', size: PNG.length, contentType: 'image/png' });
    expect(upload.status).toBe(403);
    expect(upload.body.code).toBe('FILE_UPLOAD_DISABLED');

    const res = await submit(form, { [nameKeyOf(form)]: 'Lan' });
    expect(res.status).toBe(201);
    const [row] = await getSubmissionRows(form.id);
    expect(Object.keys(row.answers)).toEqual([nameKeyOf(form)]);
  });

  it('cờ bật: GET công khai của biểu mẫu có trường file mang fileUploads.enabled=true và fileConfig; biểu mẫu không có trường file thì không có khoá fileUploads', async () => {
    const { form } = await setup({ username: 'owner_ff_pub' });
    const pub = await request(app).get(`/api/public/forms/${form.publicKey}`);
    expect(pub.body.data.fileUploads).toEqual({ enabled: true });
    expect(pub.body.data.fields.find((f) => f.type === 'file').fileConfig.maxFiles).toBe(2);

    const owner2 = await createUser({ username: 'owner_ff_pub2' });
    const token2 = await loginAs(owner2);
    const plain = await createAndPublish(token2, [NAME_FIELD]);
    const pub2 = await request(app).get(`/api/public/forms/${plain.publicKey}`);
    expect(pub2.body.data).not.toHaveProperty('fileUploads');
  });
});

// ─── Chuẩn hoá khi lưu ─────────────────────────────────────────────────────────────────────────────

describe('lưu biểu mẫu có trường file', () => {
  it('không gửi fileConfig → mặc định (Ảnh + PDF, 10 MB, 1 tệp); file không nhận role', async () => {
    const owner = await createUser({ username: 'owner_ff_norm' });
    const token = await loginAs(owner);
    const res = await createForm(token, [NAME_FIELD, { label: 'Tệp', type: 'file', role: 'name' }]);
    expect(res.status).toBe(201);
    const field = res.body.data.fields.find((f) => f.type === 'file');
    expect(field.fileConfig).toEqual({ kinds: ['image', 'pdf'], maxBytes: 10 * MB, maxFiles: 1 });
    expect(field.role).toBeNull();
  });

  it.each([
    ['nhóm svg', { kinds: ['svg'] }],
    ['nhóm exe', { kinds: ['exe'] }],
    ['nhóm html', { kinds: ['image', 'html'] }],
    ['dung lượng < 1 MB', { maxBytes: 1000 }],
    ['dung lượng > 1 GB', { maxBytes: 1024 * MB + 1 }],
    ['0 tệp', { maxFiles: 0 }],
    ['11 tệp', { maxFiles: 11 }],
  ])('cấu hình sai (%s) → 400', async (_name, fileConfig) => {
    const owner = await createUser({ username: `owner_ff_bad_${_name.replace(/\W/g, '')}` });
    const token = await loginAs(owner);
    const res = await createForm(token, [NAME_FIELD, { label: 'Tệp', type: 'file', fileConfig }]);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FORM_DEFINITION');
  });
});

// ─── Bước 1: xin URL ───────────────────────────────────────────────────────────────────────────────

describe('POST /api/public/forms/:key/uploads', () => {
  it('đúng: 201 + uploadId + đường dẫn PUT cục bộ + header Content-Type chuẩn + phiên pending, khoá tạm dưới tiền tố tmp của form', async () => {
    const { owner, form } = await setup({ username: 'owner_ff_req1' });
    const res = await requestUpload(form, {
      fieldKey: fileKeyOf(form), fileName: '  ../Hồ sơ  xin việc.PNG ', size: PNG.length, contentType: 'image/png',
    });
    expect(res.status).toBe(201);
    const data = res.body.data;
    expect(data.uploadId).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.uploadUrl).toBe(`/api/public/forms/${form.publicKey}/uploads/${data.uploadId}/content`);
    expect(data.method).toBe('PUT');
    expect(data.headers).toEqual({ 'Content-Type': 'image/png' });
    expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(data.fileName).toBe('Hồ sơ xin việc.PNG');

    const row = await sessionRow(data.uploadId);
    expect(row).toMatchObject({
      status: 'pending',
      field_key: fileKeyOf(form),
      file_name: 'Hồ sơ xin việc.PNG',
      file_ext: 'png',
      content_type: 'image/png',
      declared_size: String(PNG.length),
      max_bytes: String(1 * MB),
      submission_id: null,
    });
    expect(Number(row.workspace_owner_id)).toBe(Number(owner.id));
    expect(row.object_key).toBe(`uploads/${owner.id}/forms/${form.id}/tmp/${data.uploadId}.png`);
    // Hạn phiên ~24 giờ.
    const ttl = new Date(row.expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(23 * 3600 * 1000);
    expect(ttl).toBeLessThanOrEqual(24 * 3600 * 1000);
  });

  it('khách khai content-type rỗng / octet-stream cho .png vẫn được (chữ ký mới là chốt); URL trả về luôn Content-Type CHUẨN', async () => {
    const { form } = await setup({ username: 'owner_ff_req2' });
    for (const contentType of ['', 'application/octet-stream', undefined]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await requestUpload(form, { fieldKey: fileKeyOf(form), fileName: 'a.png', size: 10, contentType });
      expect(res.status).toBe(201);
      expect(res.body.data.headers['Content-Type']).toBe('image/png');
    }
  });

  it.each([
    ['đuôi .exe', { fileName: 'virus.exe', contentType: 'application/x-msdownload' }, 'FILE_TYPE_FORBIDDEN'],
    ['đuôi lồng .exe.pdf', { fileName: 'hoadon.exe.pdf', contentType: 'application/pdf' }, 'FILE_TYPE_FORBIDDEN'],
    ['đuôi .svg', { fileName: 'logo.svg', contentType: 'image/svg+xml' }, 'FILE_TYPE_FORBIDDEN'],
    ['đuôi .html', { fileName: 'trang.html', contentType: 'text/html' }, 'FILE_TYPE_FORBIDDEN'],
    ['đuôi .js', { fileName: 'a.js', contentType: 'text/javascript' }, 'FILE_TYPE_FORBIDDEN'],
    ['đuôi .php', { fileName: 'a.php.jpg', contentType: 'image/jpeg' }, 'FILE_TYPE_FORBIDDEN'],
    ['đuôi hợp lệ nhưng nhóm chủ không bật (.mp4)', { fileName: 'phim.mp4', contentType: 'video/mp4' }, 'FILE_TYPE_NOT_ALLOWED'],
    ['không có đuôi', { fileName: 'README', contentType: 'text/plain' }, 'FILE_TYPE_NOT_ALLOWED'],
    ['MIME khai báo lệch đuôi (.jpg nhưng text/html)', { fileName: 'a.jpg', contentType: 'text/html' }, 'FILE_TYPE_NOT_ALLOWED'],
  ])('từ chối %s bằng 400 %s, KHÔNG tạo phiên', async (_name, body, code) => {
    const { form } = await setup({ username: `owner_ff_rej_${code}_${_name.length}` });
    const res = await requestUpload(form, { fieldKey: fileKeyOf(form), size: 100, ...body });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(code);
    const { rows } = await db.query('SELECT count(*)::int AS n FROM form_file_uploads');
    expect(rows[0].n).toBe(0);
  });

  it('sai cỡ: vượt trần của trường (1 MB) → 400 FILE_TOO_LARGE; 0 hoặc không phải số → 400 INVALID_FILE_SIZE; đúng bằng trần thì qua', async () => {
    const { form } = await setup({ username: 'owner_ff_size' });
    const base = { fieldKey: fileKeyOf(form), fileName: 'a.pdf', contentType: 'application/pdf' };
    expect((await requestUpload(form, { ...base, size: 1 * MB + 1 })).body.code).toBe('FILE_TOO_LARGE');
    expect((await requestUpload(form, { ...base, size: 0 })).body.code).toBe('INVALID_FILE_SIZE');
    expect((await requestUpload(form, { ...base, size: 'abc' })).body.code).toBe('INVALID_FILE_SIZE');
    expect((await requestUpload(form, { ...base, size: -5 })).body.code).toBe('INVALID_FILE_SIZE');
    expect((await requestUpload(form, { ...base, size: 1 * MB })).status).toBe(201);
  });

  it('trường không tồn tại / không phải file → 400 INVALID_FIELD; biểu mẫu chưa xuất bản hoặc bị super admin khoá → 404', async () => {
    const owner = await createUser({ username: 'owner_ff_inv' });
    const token = await loginAs(owner);
    const form = await createAndPublish(token);
    const base = { fileName: 'a.pdf', size: 10, contentType: 'application/pdf' };
    expect((await requestUpload(form, { ...base, fieldKey: 'khong_co' })).body.code).toBe('INVALID_FIELD');
    expect((await requestUpload(form, { ...base, fieldKey: nameKeyOf(form) })).body.code).toBe('INVALID_FIELD');

    await request(app).put(`/api/forms/${form.id}/publish`).set('Authorization', `Bearer ${token}`).send({ isPublished: false });
    expect((await requestUpload(form, { ...base, fieldKey: fileKeyOf(form) })).status).toBe(404);

    await request(app).put(`/api/forms/${form.id}/publish`).set('Authorization', `Bearer ${token}`).send({ isPublished: true });
    await db.query('UPDATE forms SET admin_disabled_at = NOW() WHERE id = $1', [form.id]);
    expect((await requestUpload(form, { ...base, fieldKey: fileKeyOf(form) })).status).toBe(404);
  });

  it('nhóm được phép theo TỪNG trường: trường chỉ nhận Word từ chối .pdf; trường nhận Excel nhận .csv', async () => {
    const owner = await createUser({ username: 'owner_ff_kinds' });
    const token = await loginAs(owner);
    const form = await createAndPublish(token, [
      NAME_FIELD,
      { label: 'Văn bản', type: 'file', fileConfig: { kinds: ['word'], maxBytes: MB, maxFiles: 1 } },
      { label: 'Bảng', type: 'file', fileConfig: { kinds: ['excel'], maxBytes: MB, maxFiles: 1 } },
    ]);
    const wordKey = form.fields.find((f) => f.label === 'Văn bản').key;
    const excelKey = form.fields.find((f) => f.label === 'Bảng').key;
    expect((await requestUpload(form, { fieldKey: wordKey, fileName: 'a.pdf', size: 10 })).body.code).toBe('FILE_TYPE_NOT_ALLOWED');
    expect((await requestUpload(form, { fieldKey: wordKey, fileName: 'a.docx', size: 10 })).status).toBe(201);
    expect((await requestUpload(form, { fieldKey: excelKey, fileName: 'a.csv', size: 10, contentType: 'application/vnd.ms-excel' })).status).toBe(201);
  });
});

// ─── Bước 2: PUT cục bộ ────────────────────────────────────────────────────────────────────────────

describe('PUT .../uploads/:uploadId/content (kho cục bộ)', () => {
  async function newSession(form, overrides = {}) {
    const res = await requestUpload(form, {
      fieldKey: fileKeyOf(form), fileName: 'a.png', size: PNG.length, contentType: 'image/png', ...overrides,
    });
    expect(res.status).toBe(201);
    return res.body.data;
  }

  it('ghi tệp vào khoá tạm, đúng số byte', async () => {
    const { owner, form } = await setup({ username: 'owner_ff_put1' });
    const session = await newSession(form);
    const res = await putBytes(session.uploadUrl, PNG, 'image/png');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ size: PNG.length });
    const key = `uploads/${owner.id}/forms/${form.id}/tmp/${session.uploadId}.png`;
    expect((await fs.readFile(diskPath(key))).equals(PNG)).toBe(true);
  });

  it('Content-Type lệch với phiên → 400, không ghi', async () => {
    const { owner, form } = await setup({ username: 'owner_ff_put2' });
    const session = await newSession(form);
    const res = await putBytes(session.uploadUrl, PNG, 'text/html');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CONTENT_TYPE');
    expect(await existsOnDisk(`uploads/${owner.id}/forms/${form.id}/tmp/${session.uploadId}.png`)).toBe(false);
  });

  it('PUT vượt trần của trường (1 MB) bị dừng: 413 FILE_TOO_LARGE và tệp ghi dở bị xoá', async () => {
    const { owner, form } = await setup({ username: 'owner_ff_put3' });
    const session = await newSession(form, { size: 1000 });
    const res = await putBytes(session.uploadUrl, Buffer.alloc(1 * MB + 1, 0x61), 'image/png');
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
    expect(await existsOnDisk(`uploads/${owner.id}/forms/${form.id}/tmp/${session.uploadId}.png`)).toBe(false);
  });

  it('uploadId lạ, hoặc của biểu mẫu khác (publicKey khác), hoặc phiên đã dùng/hết hạn → 404', async () => {
    const { owner, token, form } = await setup({ username: 'owner_ff_put4' });
    const other = await createAndPublish(token, [NAME_FIELD, fileField()]);
    const session = await newSession(form);

    expect((await putBytes(`/api/public/forms/${form.publicKey}/uploads/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d/content`, PNG, 'image/png')).status).toBe(404);
    expect((await putBytes(`/api/public/forms/${other.publicKey}/uploads/${session.uploadId}/content`, PNG, 'image/png')).status).toBe(404);
    expect((await putBytes(`/api/public/forms/${form.publicKey}/uploads/khong-phai-uuid/content`, PNG, 'image/png')).status).toBe(404);

    await db.query(`UPDATE form_file_uploads SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [session.uploadId]);
    expect((await putBytes(session.uploadUrl, PNG, 'image/png')).status).toBe(404);
    expect(await existsOnDisk(`uploads/${owner.id}/forms/${form.id}/tmp/${session.uploadId}.png`)).toBe(false);
  });
});

// ─── Bước 3: nộp bài ───────────────────────────────────────────────────────────────────────────────

describe('nộp bài kèm tệp', () => {
  it('đúng: answers có thông tin tệp, tệp nằm ở tiền tố BÀI NỘP (tệp tạm bị xoá), phiên chuyển used, chủ được cộng dung lượng bằng cỡ THẬT', async () => {
    const { owner, form } = await setup({ username: 'owner_ff_ok' });
    const before = await getStorageUsage(owner.id);
    // Khai cỡ NHỎ hơn thật: ghi sổ phải theo cỡ thật.
    const session = await uploadFile(form, { fileName: 'CCCD mặt trước.png', contentType: 'image/png', buffer: PNG, declaredSize: 5 });
    const tmpKey = `uploads/${owner.id}/forms/${form.id}/tmp/${session.uploadId}.png`;
    expect(await existsOnDisk(tmpKey)).toBe(true);

    const res = await submit(form, { [nameKeyOf(form)]: 'Lan', [fileKeyOf(form)]: [session.uploadId] });
    expect(res.status).toBe(201);

    const [row] = await getSubmissionRows(form.id);
    const answer = row.answers[fileKeyOf(form)];
    expect(answer).toMatchObject({
      label: FILE_LABEL,
      type: 'file',
      value: ['CCCD mặt trước.png'],
      fileStatus: 'received',
    });
    expect(answer.files).toHaveLength(1);
    const file = answer.files[0];
    expect(file).toMatchObject({ name: 'CCCD mặt trước.png', size: PNG.length, contentType: 'image/png' });
    expect(file.storageKey).toMatch(new RegExp(`^uploads/${owner.id}/forms/${form.id}/submissions/${row.id}/[0-9a-f-]{36}\\.png$`));
    // KHÔNG lưu URL công khai.
    expect(JSON.stringify(row.answers)).not.toMatch(/https?:\/\/|lp-assets/);

    expect((await fs.readFile(diskPath(file.storageKey))).equals(PNG)).toBe(true);
    expect(await existsOnDisk(tmpKey)).toBe(false);

    const sess = await sessionRow(session.uploadId);
    expect(sess.status).toBe('used');
    expect(String(sess.submission_id)).toBe(String(row.id));

    const ledger = await ledgerRows(owner.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      state: 'active',
      storage_key: file.storageKey,
      size_bytes: String(PNG.length),
      reference_type: 'form_submission_file',
      reference_id: String(row.id),
      category: 'form_file',
    });
    const after = await getStorageUsage(owner.id);
    expect(after.usedBytes - before.usedBytes).toBe(PNG.length);
  });

  it('nhiều tệp trong một trường (tối đa maxFiles) + nhiều trường file: mỗi tệp một dòng sổ, tổng đúng', async () => {
    const owner = await createUser({ username: 'owner_ff_multi' });
    const token = await loginAs(owner);
    const form = await createAndPublish(token, [
      NAME_FIELD,
      fileField({ label: 'Ảnh' }),
      fileField({ label: 'Hợp đồng', fileConfig: { kinds: ['pdf'], maxBytes: MB, maxFiles: 1 } }),
    ]);
    const imgKey = form.fields.find((f) => f.label === 'Ảnh').key;
    const pdfKey = form.fields.find((f) => f.label === 'Hợp đồng').key;
    const a = await uploadFile(form, { fileName: 'a.png', contentType: 'image/png', buffer: PNG, fieldKey: imgKey });
    const b = await uploadFile(form, { fileName: 'b.jpg', contentType: 'image/jpeg', buffer: JPEG, fieldKey: imgKey });
    const c = await uploadFile(form, { fileName: 'c.pdf', contentType: 'application/pdf', buffer: PDF, fieldKey: pdfKey });

    const res = await submit(form, {
      [nameKeyOf(form)]: 'Lan', [imgKey]: [a.uploadId, b.uploadId], [pdfKey]: [c.uploadId],
    });
    expect(res.status).toBe(201);
    const [row] = await getSubmissionRows(form.id);
    expect(row.answers[imgKey].value).toEqual(['a.png', 'b.jpg']);
    expect(row.answers[imgKey].files).toHaveLength(2);
    expect(row.answers[pdfKey].value).toEqual(['c.pdf']);
    const ledger = await ledgerRows(owner.id);
    expect(ledger).toHaveLength(3);
    expect(ledger.reduce((n, r) => n + Number(r.size_bytes), 0)).toBe(PNG.length + JPEG.length + PDF.length);
  });

  it('trường bắt buộc mà không gửi tệp → 400 và KHÔNG có bài nộp; trường không bắt buộc bỏ trống → 201', async () => {
    const { token, form } = await setup({ username: 'owner_ff_req' });
    const res = await submit(form, { [nameKeyOf(form)]: 'Lan' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/bắt buộc/);
    expect(await getSubmissionRows(form.id)).toHaveLength(0);

    const optional = await createAndPublish(token, [NAME_FIELD, fileField({ required: false })]);
    const ok = await submit(optional, { [nameKeyOf(optional)]: 'Lan' });
    expect(ok.status).toBe(201);
    const [row] = await getSubmissionRows(optional.id);
    expect(Object.keys(row.answers)).toEqual([nameKeyOf(optional)]);
  });

  it('gửi nhiều tệp hơn maxFiles → 400', async () => {
    const { form } = await setup({ username: 'owner_ff_max' });
    const sessions = [];
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      sessions.push(await uploadFile(form, { fileName: `a${i}.png`, contentType: 'image/png', buffer: PNG }));
    }
    const res = await submit(form, { [nameKeyOf(form)]: 'Lan', [fileKeyOf(form)]: sessions.map((s) => s.uploadId) });
    expect(res.status).toBe(400);
    expect(await getSubmissionRows(form.id)).toHaveLength(0);
  });

  it('uploadId của BIỂU MẪU KHÁC → 400 INVALID_UPLOAD, không bài nộp, tệp của biểu mẫu kia nguyên vẹn', async () => {
    const { owner, token, form } = await setup({ username: 'owner_ff_xform' });
    const other = await createAndPublish(token, [NAME_FIELD, fileField()]);
    const session = await uploadFile(other, { fileName: 'a.png', contentType: 'image/png', buffer: PNG });

    const res = await submit(form, { [nameKeyOf(form)]: 'Lan', [fileKeyOf(form)]: [session.uploadId] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_UPLOAD');
    expect(await getSubmissionRows(form.id)).toHaveLength(0);
    expect(await existsOnDisk(`uploads/${owner.id}/forms/${other.id}/tmp/${session.uploadId}.png`)).toBe(true);
    expect((await sessionRow(session.uploadId)).status).toBe('pending');
  });

  it('uploadId của TRƯỜNG KHÁC trong cùng biểu mẫu → 400', async () => {
    const owner = await createUser({ username: 'owner_ff_xfield' });
    const token = await loginAs(owner);
    const form = await createAndPublish(token, [NAME_FIELD, fileField({ label: 'Ảnh', required: false }), fileField({ label: 'Giấy tờ' })]);
    const imgKey = form.fields.find((f) => f.label === 'Ảnh').key;
    const docKey = form.fields.find((f) => f.label === 'Giấy tờ').key;
    const session = await uploadFile(form, { fileName: 'a.png', contentType: 'image/png', buffer: PNG, fieldKey: imgKey });

    const res = await submit(form, { [nameKeyOf(form)]: 'Lan', [imgKey]: [], [docKey]: [session.uploadId] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_UPLOAD');
  });

  it('uploadId ĐÃ DÙNG cho bài nộp trước → 400, bài nộp thứ hai không được tạo', async () => {
    const { form } = await setup({ username: 'owner_ff_used' });
    const session = await uploadFile(form, { fileName: 'a.png', contentType: 'image/png', buffer: PNG });
    const answers = { [nameKeyOf(form)]: 'Lan', [fileKeyOf(form)]: [session.uploadId] };
    expect((await submit(form, answers)).status).toBe(201);
    const again = await submit(form, answers);
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('INVALID_UPLOAD');
    expect(await getSubmissionRows(form.id)).toHaveLength(1);
  });

  it('uploadId lạ / hết hạn / chưa PUT xong → 400', async () => {
    const { form } = await setup({ username: 'owner_ff_bad' });
    const unknown = await submit(form, { [nameKeyOf(form)]: 'Lan', [fileKeyOf(form)]: ['0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('INVALID_UPLOAD');

    const notPut = await requestUpload(form, { fieldKey: fileKeyOf(form), fileName: 'a.png', size: 10, contentType: 'image/png' });
    const res1 = await submit(form, { [nameKeyOf(form)]: 'Lan', [fileKeyOf(form)]: [notPut.body.data.uploadId] });
    expect(res1.status).toBe(400);
    expect(res1.body.code).toBe('UPLOAD_INCOMPLETE');

    const expired = await uploadFile(form, { fileName: 'b.png', contentType: 'image/png', buffer: PNG });
    await db.query(`UPDATE form_file_uploads SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [expired.uploadId]);
    const res2 = await submit(form, { [nameKeyOf(form)]: 'Lan', [fileKeyOf(form)]: [expired.uploadId] });
    expect(res2.status).toBe(400);
    expect(res2.body.code).toBe('INVALID_UPLOAD');
    expect(await getSubmissionRows(form.id)).toHaveLength(0);
  });

  it('khai cỡ NHỎ nhưng tệp thật vượt trần (khách bỏ qua kiểm soát khi PUT) → 400 FILE_TOO_LARGE ở bước xác nhận, tệp bị xoá, không ghi sổ', async () => {
    const { owner, form } = await setup({ username: 'owner_ff_cheat' });
    const res = await requestUpload(form, { fieldKey: fileKeyOf(form), fileName: 'a.png', size: 100, contentType: 'image/png' });
    const { uploadId } = res.body.data;
    const key = `uploads/${owner.id}/forms/${form.id}/tmp/${uploadId}.png`;
    // Ghi thẳng 2 MB (> trần 1 MB) vào khoá tạm, giả như PUT lách được trần.
    await fs.mkdir(path.dirname(diskPath(key)), { recursive: true });
    await fs.writeFile(diskPath(key), Buffer.concat([PNG, Buffer.alloc(2 * MB, 0x61)]));

    const sub = await submit(form, { [nameKeyOf(form)]: 'Lan', [fileKeyOf(form)]: [uploadId] });
    expect(sub.status).toBe(400);
    expect(sub.body.code).toBe('FILE_TOO_LARGE');
    expect(await existsOnDisk(key)).toBe(false);
    expect(await getSubmissionRows(form.id)).toHaveLength(0);
    expect(await ledgerRows(owner.id)).toHaveLength(0);
  });

  it('chữ ký sai: .exe đổi tên .jpg (và PNG đặt tên .jpg) → 400 INVALID_FILE_CONTENT, tệp bị xoá, không bài nộp, không ghi sổ', async () => {
    const { owner, form } = await setup({ username: 'owner_ff_magic' });
    for (const [fileName, buffer] of [['anh-dep.jpg', EXE], ['anh.jpg', PNG], ['ho-so.pdf', EXE], ['x.png', Buffer.from('<svg onload=alert(1)></svg>')]]) {
      // eslint-disable-next-line no-await-in-loop
      const session = await uploadFile(form, { fileName, contentType: '', buffer });
      const key = `uploads/${owner.id}/forms/${form.id}/tmp/${session.uploadId}.${fileName.split('.').pop()}`;
      // eslint-disable-next-line no-await-in-loop
      const sub = await submit(form, { [nameKeyOf(form)]: 'Lan', [fileKeyOf(form)]: [session.uploadId] });
      expect(sub.status).toBe(400);
      expect(sub.body.code).toBe('INVALID_FILE_CONTENT');
      // eslint-disable-next-line no-await-in-loop
      expect(await existsOnDisk(key)).toBe(false);
    }
    expect(await getSubmissionRows(form.id)).toHaveLength(0);
    expect(await ledgerRows(owner.id)).toHaveLength(0);
  });

  it('bài nộp thất bại ở bước INSERT: tệp trả về như chưa nộp (không còn ở tiền tố bài nộp, sổ trừ, phiên về pending, bản tạm còn) và nộp lại thành công không cần tải lại', async () => {
    const { owner, form } = await setup({ username: 'owner_ff_rollback' });
    const session = await uploadFile(form, { fileName: 'a.png', contentType: 'image/png', buffer: PNG });
    const tmpKey = `uploads/${owner.id}/forms/${form.id}/tmp/${session.uploadId}.png`;
    const answers = { [nameKeyOf(form)]: 'Lan', [fileKeyOf(form)]: [session.uploadId] };

    jest.spyOn(formRepository, 'createSubmission').mockRejectedValueOnce(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const failed = await submit(form, answers);
    expect(failed.status).toBe(500);

    expect(await getSubmissionRows(form.id)).toHaveLength(0);
    const ledger = await ledgerRows(owner.id);
    expect(ledger.filter((r) => r.state === 'active')).toHaveLength(0);
    const submissionsDir = path.join(TEST_UPLOADS_DIR, String(owner.id), 'forms', String(form.id), 'submissions');
    const leftovers = await fs.readdir(submissionsDir, { recursive: true }).catch(() => []);
    expect(leftovers.filter((name) => /\.png$/.test(String(name)))).toEqual([]);
    expect(await existsOnDisk(tmpKey)).toBe(true);
    expect((await sessionRow(session.uploadId)).status).toBe('pending');

    const retry = await submit(form, answers);
    expect(retry.status).toBe(201);
    expect((await ledgerRows(owner.id)).filter((r) => r.state === 'active')).toHaveLength(1);
  });

  it('hai bài nộp đua nhau cùng MỘT uploadId: đúng một bài thắng, bài kia 400, chỉ một tệp + một dòng sổ', async () => {
    const { owner, form } = await setup({ username: 'owner_ff_race' });
    const session = await uploadFile(form, { fileName: 'a.png', contentType: 'image/png', buffer: PNG });
    const answers = { [nameKeyOf(form)]: 'Lan', [fileKeyOf(form)]: [session.uploadId] };

    const [r1, r2] = await Promise.all([submit(form, answers), submit(form, answers)]);
    expect([r1.status, r2.status].sort()).toEqual([201, 400]);
    expect(await getSubmissionRows(form.id)).toHaveLength(1);
    const active = (await ledgerRows(owner.id)).filter((r) => r.state === 'active');
    expect(active).toHaveLength(1);
    expect(await existsOnDisk(active[0].storage_key)).toBe(true);
    const submissionsDir = path.join(TEST_UPLOADS_DIR, String(owner.id), 'forms', String(form.id), 'submissions');
    const files = (await fs.readdir(submissionsDir, { recursive: true })).filter((name) => /\.png$/.test(String(name)));
    expect(files).toHaveLength(1);
  });
});

// ─── Chủ hết dung lượng (QĐ7: không mất khách) ────────────────────────────────────────────────────

describe('chủ hết dung lượng', () => {
  const quotaNotifications = async (ownerId) => {
    const { rows } = await db.query(
      `SELECT * FROM user_notifications WHERE user_id = $1 AND event_type = 'form_file_quota_exceeded' ORDER BY id`,
      [ownerId]
    );
    return rows;
  };

  async function exhaustQuota(ownerId) {
    setEnv('STORAGE_QUOTA_ENFORCEMENT_ENABLED', 'true');
    await db.query('UPDATE users SET storage_quota_override_bytes = 1 WHERE id = $1', [ownerId]);
  }

  it('xin URL khi chủ đã hết: 200 { quotaExceeded, skipToken } (KHÔNG lỗi cứng), không tạo phiên, chủ nhận chuông MỘT lần dù khách xin nhiều lần', async () => {
    const { owner, form } = await setup({ username: 'owner_ff_q1' });
    await exhaustQuota(owner.id);
    const body = { fieldKey: fileKeyOf(form), fileName: 'a.png', size: PNG.length, contentType: 'image/png' };

    const first = await requestUpload(form, body);
    expect(first.status).toBe(200);
    expect(first.body.data.quotaExceeded).toBe(true);
    expect(first.body.data.skipToken).toEqual(expect.any(String));
    expect(first.body.data).not.toHaveProperty('uploadUrl');
    const second = await requestUpload(form, body);
    expect(second.status).toBe(200);

    expect((await db.query('SELECT count(*)::int AS n FROM form_file_uploads')).rows[0].n).toBe(0);
    const notes = await quotaNotifications(owner.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ severity: 'warning', link: '/app/topup' });
    expect(notes[0].metadata).toMatchObject({ formId: String(form.id) });
    expect(notes[0].dedupe_key).toMatch(new RegExp(`^form_file_quota:${form.id}:\\d{10}$`));
  });

  it('trường file BẮT BUỘC nhưng chủ hết dung lượng: nộp kèm dấu skip vẫn 201, các ô khác ghi nhận, trường tệp đánh dấu quota_exceeded', async () => {
    const { owner, form } = await setup({ username: 'owner_ff_q2' });
    await exhaustQuota(owner.id);
    const { skipToken } = (await requestUpload(form, {
      fieldKey: fileKeyOf(form), fileName: 'a.png', size: PNG.length, contentType: 'image/png',
    })).body.data;

    const res = await submit(form, { [nameKeyOf(form)]: 'Lan' }, { fileSkip: { [fileKeyOf(form)]: skipToken } });
    expect(res.status).toBe(201);
    const [row] = await getSubmissionRows(form.id);
    expect(row.respondent_name).toBe('Lan');
    expect(row.answers[nameKeyOf(form)].value).toBe('Lan');
    expect(row.answers[fileKeyOf(form)]).toMatchObject({ type: 'file', value: [], files: [], fileStatus: 'quota_exceeded' });
    expect(await ledgerRows(owner.id)).toHaveLength(0);
  });

  it('dấu skip bịa / của trường khác / của biểu mẫu khác KHÔNG thay được tệp bắt buộc → 400', async () => {
    const { owner, token, form } = await setup({ username: 'owner_ff_q3' });
    const other = await createAndPublish(token, [NAME_FIELD, fileField()]);
    await exhaustQuota(owner.id);
    const real = (await requestUpload(other, {
      fieldKey: fileKeyOf(other), fileName: 'a.png', size: 10, contentType: 'image/png',
    })).body.data.skipToken;

    for (const fake of ['bịa.bịa', real, 'x']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await submit(form, { [nameKeyOf(form)]: 'Lan' }, { fileSkip: { [fileKeyOf(form)]: fake } });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/bắt buộc/);
    }
    expect(await getSubmissionRows(form.id)).toHaveLength(0);
  });

  it('còn chỗ lúc xin URL nhưng hết chỗ lúc nộp (chủ vừa đầy): bài nộp VẪN vào, trường đánh dấu quota_exceeded, tệp tạm bị bỏ, không ghi sổ, chủ nhận chuông', async () => {
    const { owner, form } = await setup({ username: 'owner_ff_q4' });
    setEnv('STORAGE_QUOTA_ENFORCEMENT_ENABLED', 'true');
    const session = await uploadFile(form, { fileName: 'a.png', contentType: 'image/png', buffer: PNG });
    await db.query('UPDATE users SET storage_quota_override_bytes = 1 WHERE id = $1', [owner.id]);

    const res = await submit(form, { [nameKeyOf(form)]: 'Lan', [fileKeyOf(form)]: [session.uploadId] });
    expect(res.status).toBe(201);
    const [row] = await getSubmissionRows(form.id);
    expect(row.answers[fileKeyOf(form)]).toMatchObject({ value: [], files: [], fileStatus: 'quota_exceeded' });
    expect(await ledgerRows(owner.id)).toHaveLength(0);
    expect(await existsOnDisk(`uploads/${owner.id}/forms/${form.id}/tmp/${session.uploadId}.png`)).toBe(false);
    expect((await sessionRow(session.uploadId)).status).toBe('used');
    expect(await quotaNotifications(owner.id)).toHaveLength(1);
  });

  it('cờ enforcement TẮT (chế độ bóng): vẫn ghi sổ nhưng không bao giờ báo hết dung lượng', async () => {
    const { owner, form } = await setup({ username: 'owner_ff_q5' });
    await db.query('UPDATE users SET storage_quota_override_bytes = 1 WHERE id = $1', [owner.id]);
    const session = await uploadFile(form, { fileName: 'a.png', contentType: 'image/png', buffer: PNG });
    const res = await submit(form, { [nameKeyOf(form)]: 'Lan', [fileKeyOf(form)]: [session.uploadId] });
    expect(res.status).toBe(201);
    expect((await ledgerRows(owner.id))).toHaveLength(1);
    expect(await quotaNotifications(owner.id)).toHaveLength(0);
  });

  it('phiên chờ GIỮ CHỖ dung lượng: chủ còn đủ chỗ cho 1 tệp thì tệp thứ hai (khi phiên đầu chưa nộp) bị báo hết dung lượng', async () => {
    const { owner, form } = await setup({ username: 'owner_ff_q6' });
    setEnv('STORAGE_QUOTA_ENFORCEMENT_ENABLED', 'true');
    // Cho đủ đúng 1 tệp PNG + chút dư.
    await db.query('UPDATE users SET storage_quota_override_bytes = $2 WHERE id = $1', [owner.id, PNG.length + 10]);
    const body = { fieldKey: fileKeyOf(form), fileName: 'a.png', size: PNG.length, contentType: 'image/png' };
    expect((await requestUpload(form, body)).status).toBe(201);
    const second = await requestUpload(form, body);
    expect(second.status).toBe(200);
    expect(second.body.data.quotaExceeded).toBe(true);
  });
});

// ─── Tải về / xem ──────────────────────────────────────────────────────────────────────────────────

describe('tải tệp khách đã nộp', () => {
  async function submitWithFile(username = 'owner_ff_dl') {
    const { owner, token, form } = await setup({ username });
    const session = await uploadFile(form, { fileName: 'CCCD mặt trước.png', contentType: 'image/png', buffer: PNG });
    const res = await submit(form, { [nameKeyOf(form)]: 'Lan', [fileKeyOf(form)]: [session.uploadId] });
    expect(res.status).toBe(201);
    const [row] = await getSubmissionRows(form.id);
    return { owner, token, form, row };
  }

  const linkUrl = (form, row, index = 0, fieldKey = fileKeyOf(form)) =>
    `/api/forms/${form.id}/submissions/${row.id}/files/${fieldKey}/${index}/link`;

  it('chủ lấy link ngắn hạn → tải về đúng byte, Content-Disposition: attachment (tên tiếng Việt), nosniff, no-store', async () => {
    const { token, form, row } = await submitWithFile();
    const linkRes = await request(app).get(linkUrl(form, row)).set('Authorization', `Bearer ${token}`);
    expect(linkRes.status).toBe(200);
    expect(linkRes.body.data.fileName).toBe('CCCD mặt trước.png');
    expect(linkRes.body.data.path).toMatch(/^\/public\/forms\/files\/[\w-]+\.[\w-]+$/);
    expect(new Date(linkRes.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(linkRes.body.data.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000);
    expect(linkRes.headers['cache-control']).toContain('no-store');

    const download = await request(app).get(`/api${linkRes.body.data.path}`).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(download.status).toBe(200);
    expect(Buffer.isBuffer(download.body) && download.body.equals(PNG)).toBe(true);
    expect(download.headers['content-disposition']).toMatch(/^attachment;/);
    expect(download.headers['content-disposition']).toContain('filename*=UTF-8');
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.headers['cache-control']).toContain('no-store');
  });

  it('không đăng nhập → 401; workspace KHÁC → 404 (biểu mẫu lẫn bài nộp); chỉ số/khoá trường sai → 404', async () => {
    const { form, row } = await submitWithFile('owner_ff_dl2');
    expect((await request(app).get(linkUrl(form, row))).status).toBe(401);

    const stranger = await createUser({ username: 'stranger_ff' });
    const strangerToken = await loginAs(stranger);
    const res = await request(app).get(linkUrl(form, row)).set('Authorization', `Bearer ${strangerToken}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FORM_NOT_FOUND');
  });

  it('chỉ số / khoá trường / bài nộp không tồn tại → 404 FILE_NOT_FOUND hoặc SUBMISSION_NOT_FOUND', async () => {
    const { token, form, row } = await submitWithFile('owner_ff_dl3');
    const auth = { Authorization: `Bearer ${token}` };
    expect((await request(app).get(linkUrl(form, row, 1)).set(auth)).body.code).toBe('FILE_NOT_FOUND');
    expect((await request(app).get(linkUrl(form, row, 0, 'khong_co')).set(auth)).body.code).toBe('FILE_NOT_FOUND');
    expect((await request(app).get(linkUrl(form, row, 0, nameKeyOf(form))).set(auth)).body.code).toBe('FILE_NOT_FOUND');
    expect((await request(app).get(`/api/forms/${form.id}/submissions/999999/files/${fileKeyOf(form)}/0/link`).set(auth)).body.code).toBe('SUBMISSION_NOT_FOUND');
    expect((await request(app).get(`/api/forms/${form.id}/submissions/${row.id}/files/${fileKeyOf(form)}/abc/link`).set(auth)).status).toBe(400);
  });

  it('khoá tệp trong JSON bị sửa trỏ ra ngoài tiền tố của bài nộp → 404 (không dẫn tới tệp của người khác)', async () => {
    const { token, form, row } = await submitWithFile('owner_ff_dl4');
    const answers = row.answers;
    answers[fileKeyOf(form)].files[0].storageKey = 'uploads/999/forms/1/submissions/1/khac.png';
    await db.query('UPDATE form_submissions SET answers = $2::jsonb WHERE id = $1', [row.id, JSON.stringify(answers)]);
    const res = await request(app).get(linkUrl(form, row)).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FILE_NOT_FOUND');
  });

  it('nhân viên có quyền forms lấy được link (ngữ cảnh chủ); nhân viên không có quyền forms bị 403', async () => {
    const { owner, form, row } = await submitWithFile('owner_ff_dl5');
    const allowed = await createUser({ username: 'emp_ff_ok' });
    await addEmployeeMembership(owner.id, allowed.id, { forms: true });
    const allowedToken = await loginAs(allowed);
    const ok = await request(app).get(linkUrl(form, row)).set('Authorization', `Bearer ${allowedToken}`).set('X-Owner-Context', String(owner.id));
    expect(ok.status).toBe(200);

    const denied = await createUser({ username: 'emp_ff_no' });
    await addEmployeeMembership(owner.id, denied.id, {});
    const deniedToken = await loginAs(denied);
    const no = await request(app).get(linkUrl(form, row)).set('Authorization', `Bearer ${deniedToken}`).set('X-Owner-Context', String(owner.id));
    expect(no.status).toBe(403);
  });

  it('token giả / sai chữ ký / hết hạn → 404 FILE_LINK_INVALID, không phát tệp', async () => {
    const { token, form, row } = await submitWithFile('owner_ff_dl6');
    const link = (await request(app).get(linkUrl(form, row)).set('Authorization', `Bearer ${token}`)).body.data;
    const forged = `${link.path.split('.')[0]}.AAAA`;
    const r1 = await request(app).get(`/api${forged}`);
    expect(r1.status).toBe(404);
    expect(r1.body.code).toBe('FILE_LINK_INVALID');
    expect((await request(app).get('/api/public/forms/files/rac')).status).toBe(404);

    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    jest.setSystemTime(Date.now() + 10 * 60 * 1000);
    const expired = await request(app).get(`/api${link.path}`);
    jest.useRealTimers();
    expect(expired.status).toBe(404);
    expect(expired.body.code).toBe('FILE_LINK_INVALID');
  });

  it('tệp đã bị xoá khỏi kho → 404 FILE_NOT_FOUND (không 500)', async () => {
    const { token, form, row } = await submitWithFile('owner_ff_dl7');
    await fs.rm(diskPath(row.answers[fileKeyOf(form)].files[0].storageKey));
    const link = (await request(app).get(linkUrl(form, row)).set('Authorization', `Bearer ${token}`)).body.data;
    const res = await request(app).get(`/api${link.path}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FILE_NOT_FOUND');
  });
});

// ─── Xoá biểu mẫu / dọn dẹp ────────────────────────────────────────────────────────────────────────

describe('xoá & dọn tệp', () => {
  it('xoá biểu mẫu: xoá tệp bài nộp + tệp tạm trên kho, dòng sổ chuyển deleted (TRỪ dung lượng)', async () => {
    const { owner, token, form } = await setup({ username: 'owner_ff_del' });
    const done = await uploadFile(form, { fileName: 'a.png', contentType: 'image/png', buffer: PNG });
    expect((await submit(form, { [nameKeyOf(form)]: 'Lan', [fileKeyOf(form)]: [done.uploadId] })).status).toBe(201);
    const pending = await uploadFile(form, { fileName: 'b.png', contentType: 'image/png', buffer: PNG });
    const [row] = await getSubmissionRows(form.id);
    const finalKey = row.answers[fileKeyOf(form)].files[0].storageKey;
    const pendingKey = `uploads/${owner.id}/forms/${form.id}/tmp/${pending.uploadId}.png`;
    expect(await existsOnDisk(finalKey)).toBe(true);
    expect(await existsOnDisk(pendingKey)).toBe(true);
    expect((await getStorageUsage(owner.id)).usedBytes).toBe(PNG.length);

    const res = await request(app).delete(`/api/forms/${form.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    expect(await existsOnDisk(finalKey)).toBe(false);
    expect(await existsOnDisk(pendingKey)).toBe(false);
    const ledger = await ledgerRows(owner.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].state).toBe('deleted');
    expect((await getStorageUsage(owner.id)).usedBytes).toBe(0);
  });

  it('dọn tệp tạm > 24 giờ: xoá đối tượng + dòng phiên pending hết hạn; phiên còn hạn và phiên used mới giữ nguyên; phiên used cũ bị dọn', async () => {
    const { owner, form } = await setup({ username: 'owner_ff_clean' });
    const expired = await uploadFile(form, { fileName: 'cu.png', contentType: 'image/png', buffer: PNG });
    const fresh = await uploadFile(form, { fileName: 'moi.png', contentType: 'image/png', buffer: PNG });
    const used = await uploadFile(form, { fileName: 'dung.png', contentType: 'image/png', buffer: PNG });
    const usedOld = await uploadFile(form, { fileName: 'dung-cu.png', contentType: 'image/png', buffer: PNG });
    const keyOf = (s) => `uploads/${owner.id}/forms/${form.id}/tmp/${s.uploadId}.png`;

    await db.query(`UPDATE form_file_uploads SET expires_at = NOW() - INTERVAL '1 hour', created_at = NOW() - INTERVAL '25 hours' WHERE id = $1`, [expired.uploadId]);
    await db.query(`UPDATE form_file_uploads SET status = 'used', used_at = NOW() WHERE id = $1`, [used.uploadId]);
    await db.query(`UPDATE form_file_uploads SET status = 'used', used_at = NOW() - INTERVAL '3 days' WHERE id = $1`, [usedOld.uploadId]);

    const summary = await cleanupFormFileUploads();
    expect(summary).toEqual({ scanned: 2, expiredPending: 1, usedRemoved: 1 });

    expect(await sessionRow(expired.uploadId)).toBeNull();
    expect(await existsOnDisk(keyOf(expired))).toBe(false);
    expect(await sessionRow(usedOld.uploadId)).toBeNull();
    expect(await existsOnDisk(keyOf(usedOld))).toBe(false);
    expect((await sessionRow(fresh.uploadId)).status).toBe('pending');
    expect(await existsOnDisk(keyOf(fresh))).toBe(true);
    expect((await sessionRow(used.uploadId)).status).toBe('used');

    // Chạy lại: không còn gì để dọn.
    expect(await cleanupFormFileUploads()).toEqual({ scanned: 0, expiredPending: 0, usedRemoved: 0 });
  });

  it('Thư viện media coi tệp bài nộp là "đang dùng" (không xoá lẻ được khi bài nộp còn)', async () => {
    const { owner, token, form } = await setup({ username: 'owner_ff_media' });
    const session = await uploadFile(form, { fileName: 'a.png', contentType: 'image/png', buffer: PNG });
    expect((await submit(form, { [nameKeyOf(form)]: 'Lan', [fileKeyOf(form)]: [session.uploadId] })).status).toBe(201);
    const [ledger] = await ledgerRows(owner.id);
    const res = await request(app).delete(`/api/media-library/objects/${ledger.id}`).set('Authorization', `Bearer ${token}`);
    // 409: tham chiếu cha (bài nộp biểu mẫu) còn sống → phải xoá bài nộp/biểu mẫu thay vì xoá lẻ tệp.
    expect(res.status).toBe(409);
    expect(res.body.data.referenceLabel).toBe('Tệp khách tải lên biểu mẫu');
    expect((await ledgerRows(owner.id))[0].state).toBe('active');
  });
});
