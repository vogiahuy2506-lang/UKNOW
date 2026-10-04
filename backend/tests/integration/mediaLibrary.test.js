/**
 * Integration: Thư viện media — cách ly theo workspace, link tải ký sẵn, và hai khẳng định làm nền cho việc
 * gỡ tab "Tệp tin nhắn" / "Tệp khách gửi":
 *   (a) MỌI tệp chat (đủ 4 nguồn) có dòng storage_objects category 'chat', cùng storage_key → luôn hiện ở danh sách chính;
 *   (b) tệp khách gửi qua Telegram/WhatsApp (chỉ có KHOÁ lưu trữ, không url) cũng là tệp chat → nằm trong danh sách chính
 *       và tính dung lượng; endpoint /channels của tab cũ không còn.
 * Ghi tệp thật qua persistChatBlob / storeInboundMedia (đường code production), không chèn tay vào chat_attachments.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

const { createApp } = await import('../../src/app.js');
const {
  truncateAll,
  createUser,
} = await import('./helpers/db.js');
const db = (await import('../../src/config/database.js')).default;
const { setStorageBackendInstance, resetStorageBackendForTest, getStorageBackend } = await import('../../src/services/storage/storageBackend.js');
const { registerWrittenStorageObject } = await import('../../src/services/storage/storageObject.service.js');
const { LocalStorageBackend } = await import('../../src/services/storage/localStorageBackend.js');
const { persistChatBlob, CHAT_ATTACHMENT_SOURCES } = await import('../../src/services/chatbot/chatAttachment.service.js');
const { storeInboundMedia } = await import('../../src/services/chatbot/channelInboundMedia.service.js');

const TEST_ROOT = path.join(os.tmpdir(), `uknow-media-library-${process.pid}-${Date.now()}`);
// PNG tối thiểu: chữ ký 8 byte + vài byte đệm (validateFile chỉ kiểm magic bytes cho ảnh).
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 7)]);

let app;

function authHeader(user, ownerContextId = null) {
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return {
    Authorization: `Bearer ${token}`,
    ...(ownerContextId ? { 'X-Owner-Context': String(ownerContextId) } : {}),
  };
}

async function addMediaMembership(ownerId, employeeId, permissions = { media_library_view: true }) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, 'active', NOW(), NOW())`,
    [ownerId, employeeId, JSON.stringify(permissions)]
  );
}

function saveChatFile(ownerUserId, { source = CHAT_ATTACHMENT_SOURCES.WEB, name = 'a.png' } = {}) {
  return persistChatBlob({
    buffer: PNG,
    originalName: name,
    mimetype: 'image/png',
    ownerUserId,
    source,
  });
}

describe('media library API', () => {
  beforeAll(async () => {
    await fs.mkdir(path.join(TEST_ROOT, 'uploads'), { recursive: true });
    await fs.mkdir(path.join(TEST_ROOT, 'temp_uploads'), { recursive: true });
    setStorageBackendInstance(new LocalStorageBackend({
      uploadsRootDir: path.join(TEST_ROOT, 'uploads'),
      tempDir: path.join(TEST_ROOT, 'temp_uploads'),
    }));
    app = createApp();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    resetStorageBackendForTest();
    await fs.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
  });

  it('(a) mọi nguồn tệp chat đều có storage_objects category chat cùng storage_key và hiện ở tab Tất cả tệp', async () => {
    const owner = await createUser({ email: 'owner-chat-ledger@test.local' });
    const sources = Object.values(CHAT_ATTACHMENT_SOURCES);
    expect(sources.sort()).toEqual(['ai_assistant', 'chatbot_studio', 'chatbot_web', 'inbox_outbound']);

    for (const source of sources) {
      await saveChatFile(owner.id, { source, name: `tep-${source}.png` });
    }

    const { rows } = await db.query(
      `SELECT ca.source, ca.storage_key, ca.storage_object_id, ca.id_user,
              so.id AS so_id, so.category, so.storage_key AS so_key, so.owner_user_id, so.pool_type, so.state
         FROM chat_attachments ca
         LEFT JOIN storage_objects so ON so.storage_key = ca.storage_key
        WHERE ca.id_user = $1`,
      [owner.id]
    );
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.so_id).not.toBeNull();
      expect(row.storage_object_id).toBe(row.so_id);
      expect(row.category).toBe('chat');
      expect(row.so_key).toBe(row.storage_key);
      expect(Number(row.owner_user_id)).toBe(Number(owner.id));
      expect(row.pool_type).toBe('workspace');
      expect(['temp', 'active']).toContain(row.state);
    }

    const res = await request(app)
      .get('/api/media-library/objects')
      .query({ category: 'chat' })
      .set(authHeader(owner))
      .expect(200);

    expect(res.body.data.map((item) => item.displayName).sort()).toEqual(
      sources.map((source) => `tep-${source}.png`).sort()
    );
    expect(res.body.data.every((item) => /\/file\//.test(item.url))).toBe(true);
    expect(res.body.categorySummary).toEqual([
      expect.objectContaining({ category: 'chat', count: 4 }),
    ]);
  });

  it('mỗi chủ chỉ thấy tệp của workspace mình; url ký từ khoá', async () => {
    const alice = await createUser({ email: 'alice-media@test.local' });
    const bob = await createUser({ email: 'bob-media@test.local' });
    await saveChatFile(alice.id, { name: 'alice.png' });
    await saveChatFile(bob.id, { name: 'bob.png' });

    const aliceRes = await request(app)
      .get('/api/media-library/objects')
      .set(authHeader(alice))
      .expect(200);

    expect(aliceRes.body.success).toBe(true);
    expect(aliceRes.body.data).toHaveLength(1);
    expect(aliceRes.body.data[0].displayName).toBe('alice.png');
    expect(aliceRes.body.data[0].url).toMatch(/\/file\//);
    expect(aliceRes.body.data[0].url).not.toMatch(/javascript:/i);
    expect(aliceRes.body.data[0].storageKey).toContain(`uploads/${alice.id}/chat/`);

    const bobRes = await request(app)
      .get('/api/media-library/objects')
      .set(authHeader(bob))
      .expect(200);

    expect(bobRes.body.data).toHaveLength(1);
    expect(bobRes.body.data[0].displayName).toBe('bob.png');
  });

  it('nhân viên có quyền xem media chỉ thấy workspace của chủ đang chọn', async () => {
    const owner = await createUser({ email: 'owner-employee-media@test.local' });
    const otherOwner = await createUser({ email: 'other-employee-media@test.local' });
    const employee = await createUser({ email: 'employee-media@test.local' });
    await addMediaMembership(owner.id, employee.id);
    await saveChatFile(owner.id, { name: 'owner.png' });
    await saveChatFile(otherOwner.id, { name: 'other.png' });

    const response = await request(app)
      .get('/api/media-library/objects')
      .set(authHeader(employee, owner.id))
      .expect(200);

    expect(response.body.data.map((item) => item.displayName)).toEqual(['owner.png']);
  });

  it('(b) tệp khách gửi qua Telegram/WhatsApp là tệp chat: hiện ở danh sách chính, tính dung lượng; /channels không còn', async () => {
    const owner = await createUser({ email: 'owner-channel-files@test.local' });
    const stranger = await createUser({ email: 'stranger-channel-files@test.local' });

    // Đúng đường production: storeInboundMedia → { key, displayName, size, mime, type }, KHÔNG có url.
    const tg = (await storeInboundMedia({
      ownerUserId: owner.id, buffer: PNG, fileName: 'tele.png', mimeType: 'image/png', kind: 'image',
    })).attachment;
    const wa = (await storeInboundMedia({
      ownerUserId: owner.id, buffer: PNG, fileName: 'wa.png', mimeType: 'image/png', kind: 'image',
    })).attachment;
    await storeInboundMedia({
      ownerUserId: stranger.id, buffer: PNG, fileName: 'cua-nguoi-khac.png', mimeType: 'image/png', kind: 'image',
    });
    expect(tg).not.toHaveProperty('url');
    expect(tg.key).toMatch(new RegExp(`^uploads/${owner.id}/chat/`));

    const objects = await request(app)
      .get('/api/media-library/objects')
      .query({ category: 'chat' })
      .set(authHeader(owner))
      .expect(200);
    expect(objects.body.data.map((item) => item.storageKey).sort()).toEqual([tg.key, wa.key].sort());
    expect(objects.body.data.every((item) => item.sizeBytes > 0 && /\/file\//.test(item.url))).toBe(true);
    expect(objects.body.categorySummary).toEqual([expect.objectContaining({ category: 'chat', count: 2 })]);

    // Tìm theo tên (không còn khớp đường dẫn): "tele" ra đúng một tệp.
    const searched = await request(app)
      .get('/api/media-library/objects')
      .query({ search: 'tele' })
      .set(authHeader(owner))
      .expect(200);
    expect(searched.body.data.map((item) => item.storageKey)).toEqual([tg.key]);

    // Tab "Tệp khách gửi" đã gỡ: endpoint không còn.
    await request(app).get('/api/media-library/channels').set(authHeader(owner)).expect(404);
  });

  describe('xoá tệp (M-04): ba chỗ từng kẹt', () => {
    /** Ghi một tệp thật vào kho + sổ lưu trữ với tham chiếu cho trước (đúng đường production: put + registerWrittenStorageObject). */
    async function putStored(ownerUserId, { dir, name, category, referenceType, referenceId }) {
      const key = `uploads/${ownerUserId}/${dir}/${Date.now()}_${name}`;
      await getStorageBackend().put(key, PNG, { contentType: 'image/png' });
      const object = await registerWrittenStorageObject({
        ownerUserId,
        actorUserId: ownerUserId,
        storageKey: key,
        category,
        state: 'active',
        sizeBytes: PNG.length,
        referenceType,
        referenceId,
      });
      return { key, id: Number(object.id) };
    }

    const stateOf = async (id) => (await db.query('SELECT state FROM storage_objects WHERE id = $1', [id])).rows[0].state;

    it('(a) tệp chat có tham chiếu chat_attachment xoá được và dòng chat_attachments biến mất (trước đây 409 vô nghĩa)', async () => {
      const owner = await createUser({ email: 'owner-delete-chat@test.local' });
      const saved = await saveChatFile(owner.id, { name: 'cu.png' });
      // Dựng đúng tình trạng của 8 tệp kẹt trên production: tham chiếu có id của dòng danh mục.
      await db.query(
        `UPDATE storage_objects so SET reference_id = ca.id::text
           FROM chat_attachments ca WHERE ca.storage_key = so.storage_key AND so.storage_key = $1`,
        [saved._key]
      );

      const res = await request(app)
        .delete(`/api/media-library/objects/${saved._storageObjectId}`)
        .set(authHeader(owner))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(await stateOf(saved._storageObjectId)).toBe('deleted');
      const catalog = await db.query('SELECT 1 FROM chat_attachments WHERE storage_key = $1', [saved._key]);
      expect(catalog.rows).toHaveLength(0);
      const listed = await request(app).get('/api/media-library/objects').set(authHeader(owner)).expect(200);
      expect(listed.body.data).toHaveLength(0);
    });

    it('(b) ảnh landing: còn nằm trong HTML của trang thì 409 kèm tên trang; thay ảnh khác xong thì xoá được', async () => {
      const owner = await createUser({ email: 'owner-delete-landing@test.local' });
      const stored = await putStored(owner.id, { dir: 'landing', name: 'hero.png', category: 'landing_asset', referenceType: 'landing_page', referenceId: '1' });
      const { rows: [page] } = await db.query(
        `INSERT INTO landing_pages (id_user, workspace_owner_id, slug, title, html_content)
         VALUES ($1, $1, 'khai-giang', 'Khai giảng tháng 10', $2) RETURNING id`,
        [owner.id, `<img src="https://app.test/lp-assets/${stored.key}">`]
      );
      await db.query(`UPDATE storage_objects SET reference_id = $2 WHERE id = $1`, [stored.id, String(page.id)]);

      const blocked = await request(app)
        .delete(`/api/media-library/objects/${stored.id}`)
        .set(authHeader(owner))
        .expect(409);
      expect(blocked.body).toMatchObject({
        code: 'STORAGE_REFERENCE_ALIVE',
        data: { referenceType: 'landing_page', referenceName: 'Khai giảng tháng 10', url: '/app/settings/landing-pages' },
      });
      expect(await stateOf(stored.id)).toBe('active');

      // Người dùng thay ảnh trong trang: trang cha còn, nhưng HTML không còn khoá.
      await db.query(`UPDATE landing_pages SET html_content = $2 WHERE id = $1`, [page.id, '<img src="https://app.test/lp-assets/uploads/x/landing/anh-moi.png">']);

      await request(app)
        .delete(`/api/media-library/objects/${stored.id}`)
        .set(authHeader(owner))
        .expect(200);
      expect(await stateOf(stored.id)).toBe('deleted');
    });

    it('(c) ảnh biểu mẫu: 409 báo đúng tên biểu mẫu + link, không lộ mã thô', async () => {
      const owner = await createUser({ email: 'owner-delete-form@test.local' });
      const { rows: [form] } = await db.query(
        `INSERT INTO forms (workspace_owner_id, public_key, title) VALUES ($1, 'pk-media-1', 'Đăng ký tư vấn') RETURNING id`,
        [owner.id]
      );
      const stored = await putStored(owner.id, { dir: 'forms', name: 'banner.png', category: 'form_asset', referenceType: 'form', referenceId: String(form.id) });

      const res = await request(app)
        .delete(`/api/media-library/objects/${stored.id}`)
        .set(authHeader(owner))
        .expect(409);

      expect(res.body.data).toMatchObject({ referenceType: 'form', referenceLabel: 'Biểu mẫu', referenceName: 'Đăng ký tư vấn', url: '/app/forms' });
      expect(res.body.message).toContain('Đăng ký tư vấn');
      expect(res.body.message).not.toContain(`form #${form.id}`);
    });

    it('không xoá được tệp của workspace khác (404)', async () => {
      const alice = await createUser({ email: 'alice-delete@test.local' });
      const bob = await createUser({ email: 'bob-delete@test.local' });
      const saved = await saveChatFile(alice.id, { name: 'cua-alice.png' });

      await request(app)
        .delete(`/api/media-library/objects/${saved._storageObjectId}`)
        .set(authHeader(bob))
        .expect(404);
      expect(await stateOf(saved._storageObjectId)).not.toBe('deleted');
    });
  });
});
