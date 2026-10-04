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
const { setStorageBackendInstance, resetStorageBackendForTest } = await import('../../src/services/storage/storageBackend.js');
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
});
