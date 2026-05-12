/**
 * Integration tests cho file storage local — Batch D.
 *
 * Phạm vi:
 *   - GET  /file/:token                         (download.handleView)
 *   - GET  /file/:token/download                (download.handleDownload, kèm preview)
 *   - GET  /api/attachments/:id/presigned-download
 *   - GET  /api/attachments/presigned-by-key?key=...
 *   - POST   /api/uploads/temp                  (upload.uploadTemp, multipart)
 *   - DELETE /api/uploads/temp/:tempId          (upload.deleteTempFile)
 *   - GET    /api/uploads/signed-url/:key(*)    (upload.getSignedUrl)
 *
 * Lưu ý:
 *   - Không có S3/AWS thật — controller ghi file vào `temp_uploads/` và
 *     `uploads/` dưới `process.cwd()`. Test override `uploadController.tempDir`
 *     và `.uploadsRootDir` sang thư mục tmp riêng theo test suite để tránh
 *     rò rỉ file vào repo.
 *   - Token download dùng HMAC từ `utils/fileDownloadToken.js` (không có
 *     expiry). Reuse helper `generateFileToken` để build token hợp lệ /
 *     không hợp lệ thay vì gọi nội bộ.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import uploadController from '../../src/controllers/upload.controller.js';
import { generateFileToken } from '../../src/utils/fileDownloadToken.js';
import { truncateAll, createUser } from './helpers/db.js';

const TEST_ROOT = path.join(
  os.tmpdir(),
  `uknow-batch-d-${process.pid}-${Date.now()}`
);
const TEST_TEMP_DIR = path.join(TEST_ROOT, 'temp_uploads');
const TEST_UPLOADS_DIR = path.join(TEST_ROOT, 'uploads');

let app;

beforeAll(async () => {
  await fs.mkdir(TEST_TEMP_DIR, { recursive: true });
  await fs.mkdir(TEST_UPLOADS_DIR, { recursive: true });
  uploadController.tempDir = TEST_TEMP_DIR;
  uploadController.uploadsRootDir = TEST_UPLOADS_DIR;
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  // Đảm bảo thư mục test tồn tại lại (tránh test trước rm -rf parent dir).
  await fs.mkdir(TEST_TEMP_DIR, { recursive: true });
  await fs.mkdir(TEST_UPLOADS_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

/**
 * Ghi 1 file vào thư mục uploads test với prefix subfolder để mô phỏng
 * key `uploads/<userId>/<file>`.
 */
async function writeFakeUpload({ relPath, content }) {
  const abs = path.join(TEST_UPLOADS_DIR, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content);
  return { storageKey: `uploads/${relPath.replace(/\\/g, '/')}`, absPath: abs };
}

async function insertTemplateFile({
  idUser,
  storageKey,
  displayName = 'File hiển thị',
  originalName = 'file.txt',
  mimeType = 'text/plain',
  fileSize = 100,
}) {
  const { rows } = await db.query(
    `INSERT INTO template_files (id_user, storage_key, original_name, display_name, mime_type, file_size)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [idUser, storageKey, originalName, displayName, mimeType, fileSize]
  );
  return rows[0];
}

// ═══════════════════════════════════════════════════════════════════════
// GET /file/:token  (handleView — render HTML viewer)
// ═══════════════════════════════════════════════════════════════════════
describe('GET /file/:token — handleView', () => {
  it('token không hợp lệ → 400 HTML error page', async () => {
    const res = await request(app).get('/file/garbage-token');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toMatch(/Link xem file không hợp lệ|Lỗi/);
  });

  it('token hợp lệ + không có template_files row → 200, viewer fallback name', async () => {
    const { storageKey } = await writeFakeUpload({
      relPath: 'pub/no-row.txt',
      content: 'hello',
    });
    const token = generateFileToken(storageKey, null, null, null);
    const res = await request(app).get(`/file/${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Tệp đính kèm/);
    expect(res.text).toContain(`/file/${encodeURIComponent(token)}/download`);
  });

  it('token hợp lệ + DB metadata + customerId+campaignId → log OPEN + customer_journey + cập nhật campaign_customers', async () => {
    const user = await createUser({ username: 'view-1' });
    const { rows: cusRows } = await db.query(
      `INSERT INTO customers (id_user, email, full_name) VALUES ($1, 'cust@u.local', 'C') RETURNING id`,
      [user.id]
    );
    const cusId = cusRows[0].id;
    const { rows: campRows } = await db.query(
      `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, 'CV', 'active') RETURNING id`,
      [user.id]
    );
    const campId = campRows[0].id;
    await db.query(
      `INSERT INTO campaign_customers (id_campaign, id_customer, joined_at) VALUES ($1, $2, NOW())`,
      [campId, cusId]
    );

    const { storageKey } = await writeFakeUpload({
      relPath: `${user.id}/doc.pdf`,
      content: 'PDF',
    });
    const tf = await insertTemplateFile({
      idUser: user.id,
      storageKey,
      displayName: 'Tài liệu PDF',
      originalName: 'tai-lieu.pdf',
      mimeType: 'application/pdf',
    });

    const token = generateFileToken(storageKey, campId, cusId, 'cust@u.local');
    const res = await request(app).get(`/file/${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Tài liệu PDF');

    // _logAccessEvent fire-and-forget — poll briefly cho tới khi journey ghi xong.
    let journey;
    for (let i = 0; i < 20; i += 1) {
      const r = await db.query(
        `SELECT event_type, event_channel FROM customer_journey WHERE id_customer = $1`,
        [cusId]
      );
      if (r.rows.length > 0) { journey = r.rows[0]; break; }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(journey).toBeDefined();
    expect(journey).toMatchObject({ event_type: 'file_link_open', event_channel: 'email' });

    const fae = await db.query(
      `SELECT file_id, event_type FROM file_access_events WHERE customer_id = $1`,
      [cusId]
    );
    expect(fae.rows).toHaveLength(1);
    expect(fae.rows[0].event_type).toBe('OPEN');
    expect(Number(fae.rows[0].file_id)).toBe(Number(tf.id));

    const cc = await db.query(
      `SELECT last_activity_at FROM campaign_customers WHERE id_campaign = $1 AND id_customer = $2`,
      [campId, cusId]
    );
    expect(cc.rows[0].last_activity_at).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GET /file/:token/download  (handleDownload — stream file)
// ═══════════════════════════════════════════════════════════════════════
describe('GET /file/:token/download — handleDownload', () => {
  it('token không hợp lệ → 400 HTML, không ghi event', async () => {
    const res = await request(app).get('/file/junk/download');
    expect(res.status).toBe(400);
    const fae = await db.query(`SELECT COUNT(*)::int AS c FROM file_access_events`);
    expect(fae.rows[0].c).toBe(0);
  });

  it('token hợp lệ + file không tồn tại trên disk → 404 + vẫn ghi DOWNLOAD event', async () => {
    const token = generateFileToken('uploads/missing/abc.txt', null, null, null);
    const res = await request(app).get(`/file/${encodeURIComponent(token)}/download`);
    expect(res.status).toBe(404);
    expect(res.text).toMatch(/Không tìm thấy tệp/);
    const fae = await db.query(`SELECT event_type FROM file_access_events`);
    expect(fae.rows).toHaveLength(1);
    expect(fae.rows[0].event_type).toBe('DOWNLOAD');
  });

  it('file tồn tại → 200 + Content-Disposition attachment + bytes', async () => {
    const { storageKey } = await writeFakeUpload({
      relPath: 'pub/data.txt',
      content: 'HELLO-WORLD',
    });
    const token = generateFileToken(storageKey, null, null, null);
    const res = await request(app)
      .get(`/file/${encodeURIComponent(token)}/download`)
      .buffer(true)
      .parse((response, cb) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment;/);
    // Khi không có template_files row, filename = basename(storageKey).
    expect(res.headers['content-disposition']).toMatch(/filename="data\.txt"/);
    expect(res.body.toString('utf8')).toBe('HELLO-WORLD');
  });

  it('?preview=true → Content-Disposition inline + Cross-Origin-Resource-Policy header', async () => {
    const { storageKey } = await writeFakeUpload({
      relPath: 'pub/img.png',
      content: 'PNG-bytes',
    });
    const token = generateFileToken(storageKey, null, null, null);
    const res = await request(app)
      .get(`/file/${encodeURIComponent(token)}/download?preview=true`)
      .buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('inline');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('mount alias /download/:token/download cũng hoạt động', async () => {
    const { storageKey } = await writeFakeUpload({
      relPath: 'pub/alias.txt',
      content: 'A',
    });
    const token = generateFileToken(storageKey, null, null, null);
    const res = await request(app).get(`/download/${encodeURIComponent(token)}/download`).buffer(true);
    expect(res.status).toBe(200);
  });

  it('payload missing sk → 400', async () => {
    // Tạo token mà payload không có `sk` (chỉ có c).
    const token = generateFileToken('', null, null, null);
    const res = await request(app).get(`/file/${encodeURIComponent(token)}/download`);
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/attachments/:id/presigned-download
// ═══════════════════════════════════════════════════════════════════════
describe('GET /api/attachments/:id/presigned-download', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/attachments/1/presigned-download');
    expect(res.status).toBe(401);
  });

  it('id không tồn tại → 404 JSON', async () => {
    const user = await createUser({ username: 'pres-1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/attachments/99999/presigned-download')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/Không tìm thấy/);
  });

  it('happy path → 200 trả url chứa /file/<token>/download + filename', async () => {
    const user = await createUser({ username: 'pres-2' });
    const tf = await insertTemplateFile({
      idUser: user.id,
      storageKey: `uploads/${user.id}/abc.txt`,
      displayName: 'Hợp đồng',
      originalName: 'contract.txt',
      mimeType: 'text/plain',
    });
    const token = await loginAs(user);
    const res = await request(app)
      .get(`/api/attachments/${tf.id}/presigned-download`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.fileName).toBe('contract.txt');
    expect(res.body.data.url).toMatch(/\/file\/[^/]+\/download$/);
    expect(res.body.data.mimeType).toBe('text/plain');
  });

  it('?preview=true → url có suffix ?preview=true', async () => {
    const user = await createUser({ username: 'pres-3' });
    const tf = await insertTemplateFile({
      idUser: user.id,
      storageKey: `uploads/${user.id}/x.png`,
      mimeType: 'image/png',
    });
    const token = await loginAs(user);
    const res = await request(app)
      .get(`/api/attachments/${tf.id}/presigned-download?preview=true`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.url).toMatch(/\?preview=true$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/attachments/presigned-by-key?key=...
// ═══════════════════════════════════════════════════════════════════════
describe('GET /api/attachments/presigned-by-key', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/attachments/presigned-by-key?key=uploads/x.png');
    expect(res.status).toBe(401);
  });

  it('thiếu key → 400 JSON', async () => {
    const user = await createUser({ username: 'pres-key-1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/attachments/presigned-by-key')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('key không có prefix uploads/ → 403 JSON', async () => {
    const user = await createUser({ username: 'pres-key-2' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/attachments/presigned-by-key?key=etc/passwd')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('key hợp lệ → 200, url chứa /file/<token>/download', async () => {
    const user = await createUser({ username: 'pres-key-3' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/attachments/presigned-by-key?key=uploads/foo/bar.txt&preview=true')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.fileName).toBe('bar.txt');
    expect(res.body.data.url).toMatch(/\/file\/[^/]+\/download\?preview=true$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/uploads/temp
// ═══════════════════════════════════════════════════════════════════════
describe('POST /api/uploads/temp', () => {
  it('không token → 401', async () => {
    const res = await request(app)
      .post('/api/uploads/temp')
      .attach('file', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(res.status).toBe(401);
  });

  it('auth ok nhưng không có file → 400 "Không có tệp để tải lên"', async () => {
    const user = await createUser({ username: 'up-1' });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/uploads/temp')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Không có tệp/);
  });

  it('happy path → 200, file thật tồn tại trên đĩa', async () => {
    const user = await createUser({ username: 'up-2' });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/uploads/temp')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('payload-bytes'), { filename: 'note.txt', contentType: 'text/plain' });
    expect(res.status).toBe(200);
    expect(res.body.data.tempId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.data.originalName).toBe('note.txt');
    expect(res.body.data.contentType).toBe('text/plain');
    const expectedPath = path.join(TEST_TEMP_DIR, `${res.body.data.tempId}.txt`);
    const stat = await fs.stat(expectedPath);
    expect(stat.size).toBe('payload-bytes'.length);
  });

  it('file không có extension → file lưu không có ext, vẫn ok', async () => {
    const user = await createUser({ username: 'up-3' });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/uploads/temp')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('xx'), { filename: 'noext', contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
    const expectedPath = path.join(TEST_TEMP_DIR, `${res.body.data.tempId}`);
    await expect(fs.stat(expectedPath)).resolves.toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/uploads/temp/:tempId
// ═══════════════════════════════════════════════════════════════════════
describe('DELETE /api/uploads/temp/:tempId', () => {
  it('không token → 401', async () => {
    const res = await request(app).delete('/api/uploads/temp/some-uuid');
    expect(res.status).toBe(401);
  });

  it('happy path → 200, file biến mất', async () => {
    const user = await createUser({ username: 'del-1' });
    const token = await loginAs(user);
    const up = await request(app)
      .post('/api/uploads/temp')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('hi'), { filename: 'h.txt', contentType: 'text/plain' });
    const tempId = up.body.data.tempId;

    const res = await request(app)
      .delete(`/api/uploads/temp/${tempId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    await expect(fs.stat(path.join(TEST_TEMP_DIR, `${tempId}.txt`))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('tempId không tồn tại → vẫn 200 (no-op)', async () => {
    const user = await createUser({ username: 'del-2' });
    const token = await loginAs(user);
    const res = await request(app)
      .delete('/api/uploads/temp/aabbcc-not-existing')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/uploads/signed-url/:key(*)
// ═══════════════════════════════════════════════════════════════════════
describe('GET /api/uploads/signed-url/:key', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/uploads/signed-url/uploads/a.png');
    expect(res.status).toBe(401);
  });

  it('key thoát ra ngoài uploads/ → 400 "Key của file không hợp lệ"', async () => {
    const user = await createUser({ username: 'sig-1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get(`/api/uploads/signed-url/${encodeURIComponent('uploads/../../etc/passwd')}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('key hợp lệ nhưng file không tồn tại → 404', async () => {
    const user = await createUser({ username: 'sig-2' });
    const token = await loginAs(user);
    const res = await request(app)
      .get(`/api/uploads/signed-url/${encodeURIComponent('uploads/missing/file.png')}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('file tồn tại → 200, url là /file/<token> (viewer page), data.expires là ISO 1h sau', async () => {
    const { storageKey } = await writeFakeUpload({
      relPath: 'sig/exists.png',
      content: 'PNG',
    });
    const user = await createUser({ username: 'sig-3' });
    const token = await loginAs(user);
    const res = await request(app)
      .get(`/api/uploads/signed-url/${encodeURIComponent(storageKey)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/\/file\/[^/]+$/); // không có /download
    expect(typeof res.body.data.expires).toBe('string');
    const expires = new Date(res.body.data.expires).getTime();
    expect(expires).toBeGreaterThan(Date.now() + 50 * 60 * 1000);
    expect(expires).toBeLessThan(Date.now() + 70 * 60 * 1000);
  });
});
