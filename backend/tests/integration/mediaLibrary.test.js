/**
 * Integration: Thư viện media — cách ly theo workspace, link tải ký sẵn, và hai khẳng định làm nền cho việc
 * gỡ tab "Tệp tin nhắn" / dựng tab "Tệp khách gửi":
 *   (a) MỌI tệp chat (đủ 4 nguồn) có dòng storage_objects category 'chat', cùng storage_key → luôn hiện ở tab "Tất cả tệp";
 *   (b) tệp khách gửi qua Telegram/WhatsApp chỉ có KHOÁ lưu trữ (không url) và vẫn được liệt kê ở tab "Tệp khách gửi".
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

/** Dựng một kênh (connection + hội thoại) rồi ghi một tin vào channel_messages — hình dạng giống Telegram/WhatsApp ghi thật. */
async function insertChannelMessage(ownerUserId, { channel, role = 'visitor', attachments, conversationExternalId = 'c1' }) {
  const { rows: connRows } = await db.query(
    `INSERT INTO channel_connections (id_user, channel, display_name, external_channel_id)
     VALUES ($1, $2, $2, $3)
     ON CONFLICT (id_user, channel, fb_page_id) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING id`,
    [ownerUserId, channel, `${channel}-conn`]
  );
  const { rows: convRows } = await db.query(
    `INSERT INTO channel_conversations (id_user, id_channel, channel, external_id, visitor_name)
     VALUES ($1, $2, $3, $4, 'Khach')
     ON CONFLICT (id_channel, external_id) DO UPDATE SET visitor_name = EXCLUDED.visitor_name
     RETURNING id`,
    [ownerUserId, connRows[0].id, channel, conversationExternalId]
  );
  const { rows } = await db.query(
    `INSERT INTO channel_messages (id_conversation, id_user, id_channel, role, content, message_type, attachments)
     VALUES ($1, $2, $3, $4, 'noi dung', 'image', $5::jsonb)
     RETURNING id`,
    [convRows[0].id, ownerUserId, connRows[0].id, role, JSON.stringify(attachments)]
  );
  return rows[0].id;
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

  it('(b) Tệp khách gửi: tệp Telegram/WhatsApp (chỉ có khoá lưu trữ) hiện với platform đúng và tính dung lượng', async () => {
    const owner = await createUser({ email: 'owner-channel-files@test.local' });
    const stranger = await createUser({ email: 'stranger-channel-files@test.local' });

    // Đúng đường production: storeInboundMedia → { key, displayName, size, mime, type }, KHÔNG có url.
    const tg = (await storeInboundMedia({
      ownerUserId: owner.id, buffer: PNG, fileName: 'tele.png', mimeType: 'image/png', kind: 'image',
    })).attachment;
    const wa = (await storeInboundMedia({
      ownerUserId: owner.id, buffer: PNG, fileName: 'wa.png', mimeType: 'image/png', kind: 'image',
    })).attachment;
    const gone = (await storeInboundMedia({
      ownerUserId: owner.id, buffer: PNG, fileName: 'da-xoa.png', mimeType: 'image/png', kind: 'image',
    })).attachment;
    const agentSent = (await storeInboundMedia({
      ownerUserId: owner.id, buffer: PNG, fileName: 'chu-gui.png', mimeType: 'image/png', kind: 'image',
    })).attachment;
    expect(tg).not.toHaveProperty('url');
    expect(tg.key).toMatch(new RegExp(`^uploads/${owner.id}/chat/`));

    await insertChannelMessage(owner.id, { channel: 'telegram', attachments: [tg] });
    // WhatsApp ghi cùng tệp vào hội thoại của mỗi chatbot đang bật → hai dòng, một thẻ.
    await insertChannelMessage(owner.id, { channel: 'whatsapp_baileys', attachments: [wa], conversationExternalId: 'wa-1' });
    await insertChannelMessage(owner.id, { channel: 'whatsapp_baileys', attachments: [wa], conversationExternalId: 'wa-2' });
    await insertChannelMessage(owner.id, { channel: 'telegram', attachments: [gone], conversationExternalId: 'c2' });
    await insertChannelMessage(owner.id, { channel: 'zalo_oa', attachments: [{ type: 'image', url: 'https://cdn.zalo.test/oa.jpg', name: 'oa.jpg' }] });
    // Tệp chủ gửi đi (role agent) không thuộc "Tệp khách gửi".
    await insertChannelMessage(owner.id, { channel: 'telegram', role: 'agent', attachments: [agentSent], conversationExternalId: 'c3' });
    // Khoá của người khác chèn vào tin của mình thì bị bỏ.
    await insertChannelMessage(owner.id, {
      channel: 'telegram',
      attachments: [{ key: `uploads/${stranger.id}/chat/bi-mat.png`, displayName: 'bi-mat.png', type: 'image' }],
      conversationExternalId: 'c4',
    });

    // Người dùng xoá tệp ở tab "Tất cả tệp" → biến khỏi tab này (không để link chết).
    await db.query(`UPDATE storage_objects SET state = 'deleted', deleted_at = NOW() WHERE storage_key = $1`, [gone.key]);

    const res = await request(app)
      .get('/api/media-library/channels')
      .set(authHeader(owner))
      .expect(200);

    // 3 thẻ đúng nghĩa: tệp WhatsApp ghi ở hai hội thoại vẫn chỉ một thẻ (Object.fromEntries bên dưới sẽ che trùng).
    expect(res.body.data).toHaveLength(3);
    const byName = Object.fromEntries(res.body.data.map((item) => [item.name, item]));
    expect(Object.keys(byName).sort()).toEqual(['oa.jpg', 'tele.png', 'wa.png']);

    expect(byName['tele.png']).toMatchObject({ platform: 'telegram', stored: true, type: 'image' });
    expect(byName['wa.png']).toMatchObject({ platform: 'whatsapp', stored: true, type: 'image' });
    expect(byName['oa.jpg']).toMatchObject({ platform: 'zalo_oa', stored: false, url: 'https://cdn.zalo.test/oa.jpg' });
    expect(byName['tele.png'].url).toMatch(/\/file\//);
    expect(byName['tele.png'].size).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toContain('uploads/');

    // Tệp đã lưu NẰM trên hệ thống và đang tính dung lượng (nhóm "Tin nhắn chat" của tab Tất cả tệp).
    const objects = await request(app)
      .get('/api/media-library/objects')
      .query({ category: 'chat', search: 'tele' })
      .set(authHeader(owner))
      .expect(200);
    expect(objects.body.data.map((item) => item.storageKey)).toEqual([tg.key]);
  });
});
