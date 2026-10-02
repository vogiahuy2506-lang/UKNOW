import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Tab "Tệp khách gửi" của Thư viện media (`listChannelAttachments`):
 *  - Zalo / Zalo OA / Facebook cũ: attachment có `url` (link nền tảng, KHÔNG nằm trên hệ thống);
 *  - Telegram / WhatsApp: attachment chỉ có KHOÁ lưu trữ `{ key, displayName, size, mime, type }` (xem
 *    channelInboundMedia.service.js) — phải dựng link tải từ khoá, và chỉ khi tệp còn sống trong sổ lưu trữ.
 *
 * Mock DB theo hình dạng hàng thật; câu SQL thật được kiểm ở tests/integration/mediaLibrary.test.js.
 */
const { normalizeStorageKey } = await import('../../utils/storageKey.util.js');

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: jest.fn() },
}));
jest.unstable_mockModule('../../controllers/upload.controller.js', () => ({
  default: {
    normalizeStorageKey,
    buildDownloadUrlByKey: (key, { preview = false } = {}) => `https://app.test/file/${encodeURIComponent(key)}${preview ? '/download?preview=true' : ''}`,
  },
}));

const db = (await import('../../config/database.js')).default;
const { listChannelAttachments, platformFromChannel } = await import('../mediaLibrary.repository.js');

const OWNER = 7;
const keyOf = (name) => `uploads/${OWNER}/chat/${name}`;
const storedAttachment = (name, extra = {}) => ({
  key: keyOf(name),
  displayName: name,
  size: 1234,
  mime: 'image/png',
  type: 'image',
  ...extra,
});

/** Dựng mock theo bảng: mỗi truy vấn trả hàng của đúng bảng nó đọc. */
function mockTables({ zaloPersonal = [], channel = [], liveKeys = null } = {}) {
  db.query.mockImplementation(async (sql, params) => {
    if (/FROM zalo_personal_messages/.test(sql)) return { rows: zaloPersonal };
    if (/FROM channel_messages/.test(sql)) return { rows: channel };
    if (/FROM storage_objects/.test(sql)) {
      const requested = params[1];
      const alive = liveKeys == null ? requested : requested.filter((key) => liveKeys.includes(key));
      return { rows: alive.map((key) => ({ storage_key: key, size_bytes: '4321' })) };
    }
    throw new Error(`SQL ngoài dự kiến: ${sql.slice(0, 60)}`);
  });
}

const message = (id, channelName, attachments, createdAt = '2026-10-01T10:00:00Z', conversation = 1) => ({
  id,
  id_conversation: conversation,
  attachments,
  created_at: createdAt,
  channel: channelName,
});

describe('platformFromChannel', () => {
  it.each([
    ['telegram', 'telegram'],
    ['whatsapp_baileys', 'whatsapp'],
    ['whatsapp', 'whatsapp'],
    ['zalo_oa', 'zalo_oa'],
    ['facebook', 'facebook'],
    ['kenh_la', 'kenh_la'],
    [null, 'channel'],
  ])('%s -> %s', (channelName, expected) => {
    expect(platformFromChannel(channelName)).toBe(expected);
  });
});

describe('listChannelAttachments', () => {
  beforeEach(() => {
    db.query.mockReset();
  });

  it('Telegram: tệp chỉ có khoá được dựng link tải, gắn platform "telegram", stored=true, cỡ lấy từ sổ lưu trữ', async () => {
    mockTables({ channel: [message(1, 'telegram', [storedAttachment('khach.png')])] });

    const result = await listChannelAttachments(OWNER, {});

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      platform: 'telegram',
      stored: true,
      type: 'image',
      name: 'khach.png',
      size: 4321,
      url: `https://app.test/file/${encodeURIComponent(keyOf('khach.png'))}/download?preview=true`,
      messageId: 1,
    });
    // khoá lưu trữ thô không ra client
    expect(result.items[0]).not.toHaveProperty('storageKey');
    expect(JSON.stringify(result.items[0])).not.toContain('uploads/');
  });

  it('WhatsApp (Baileys): platform "whatsapp"; tài liệu không dùng preview', async () => {
    mockTables({
      channel: [message(2, 'whatsapp_baileys', [storedAttachment('bao-gia.pdf', { mime: 'application/pdf', type: 'file' })])],
    });

    const [item] = (await listChannelAttachments(OWNER, {})).items;

    expect(item).toMatchObject({ platform: 'whatsapp', stored: true, type: 'file', name: 'bao-gia.pdf' });
    expect(item.url).toBe(`https://app.test/file/${encodeURIComponent(keyOf('bao-gia.pdf'))}`);
  });

  it('WhatsApp ghi cùng một tệp vào hội thoại của mọi chatbot: chỉ hiện một thẻ', async () => {
    const same = storedAttachment('trung.png');
    mockTables({
      channel: [
        message(3, 'whatsapp_baileys', [same], '2026-10-01T10:00:02Z', 11),
        message(4, 'whatsapp_baileys', [same], '2026-10-01T10:00:01Z', 12),
      ],
    });

    expect((await listChannelAttachments(OWNER, {})).items).toHaveLength(1);
  });

  it('tệp đã bị xoá khỏi sổ lưu trữ thì không hiện (tránh link chết)', async () => {
    mockTables({
      channel: [message(5, 'telegram', [storedAttachment('con.png'), storedAttachment('da-xoa.png')])],
      liveKeys: [keyOf('con.png')],
    });

    const names = (await listChannelAttachments(OWNER, {})).items.map((item) => item.name);

    expect(names).toEqual(['con.png']);
  });

  it('khoá không thuộc thư mục của chủ workspace hoặc không hợp lệ bị bỏ', async () => {
    mockTables({
      channel: [message(6, 'telegram', [
        { key: 'uploads/999/chat/cua-nguoi-khac.png', displayName: 'x.png', type: 'image' },
        { key: 'uploads/7/../8/chat/thoat.png', displayName: 'y.png', type: 'image' },
        { key: 'khong-phai-uploads.png', displayName: 'z.png', type: 'image' },
        null,
      ])],
    });

    const result = await listChannelAttachments(OWNER, {});

    expect(result.items).toEqual([]);
    // không có khoá hợp lệ thì không cần hỏi sổ lưu trữ
    expect(db.query.mock.calls.some(([sql]) => /FROM storage_objects/.test(sql))).toBe(false);
  });

  it('Zalo cá nhân và Zalo OA: link nền tảng, stored=false, giữ nguyên url', async () => {
    mockTables({
      zaloPersonal: [{
        id: 20, id_conversation: 3, created_at: '2026-10-01T09:00:00Z',
        attachments: [{ type: 'image', url: 'https://cdn.zalo.test/a.jpg', name: 'a.jpg' }],
      }],
      channel: [message(21, 'zalo_oa', [{ src: 'https://cdn.zalo.test/oa.jpg' }], '2026-10-01T08:00:00Z')],
    });

    const items = (await listChannelAttachments(OWNER, {})).items;

    expect(items.map((item) => [item.platform, item.stored, item.url])).toEqual([
      ['zalo_personal', false, 'https://cdn.zalo.test/a.jpg'],
      ['zalo_oa', false, 'https://cdn.zalo.test/oa.jpg'],
    ]);
    // chỉ link nền tảng → không đụng sổ lưu trữ
    expect(db.query.mock.calls.some(([sql]) => /FROM storage_objects/.test(sql))).toBe(false);
  });

  it('attachments dạng chuỗi JSON vẫn đọc được', async () => {
    mockTables({
      channel: [message(22, 'telegram', JSON.stringify([storedAttachment('chuoi.png')]))],
    });

    expect((await listChannelAttachments(OWNER, {})).items.map((item) => item.name)).toEqual(['chuoi.png']);
  });

  it('chỉ lấy tin của KHÁCH (role = visitor) ở cả hai bảng', async () => {
    mockTables({});

    await listChannelAttachments(OWNER, {});

    const sqls = db.query.mock.calls.map(([sql]) => sql);
    expect(sqls).toHaveLength(2);
    expect(sqls.find((sql) => /FROM zalo_personal_messages/.test(sql))).toMatch(/role = 'visitor'/);
    expect(sqls.find((sql) => /FROM channel_messages/.test(sql))).toMatch(/cm\.role = 'visitor'/);
  });

  it('bảng thiếu (42P01) thì bỏ qua; lỗi khác nổi lên', async () => {
    db.query.mockImplementation(async (sql) => {
      if (/FROM zalo_personal_messages/.test(sql)) {
        throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
      }
      return { rows: [] };
    });
    await expect(listChannelAttachments(OWNER, {})).resolves.toMatchObject({ items: [] });

    db.query.mockImplementation(async () => {
      throw Object.assign(new Error('boom'), { code: '08006' });
    });
    await expect(listChannelAttachments(OWNER, {})).rejects.toThrow('boom');
  });

  it('sắp mới nhất trước và phân trang theo trang/giới hạn', async () => {
    const rows = [1, 2, 3].map((n) => message(
      30 + n, 'zalo_oa', [{ url: `https://cdn.zalo.test/${n}.jpg` }], `2026-10-0${n}T00:00:00Z`
    ));
    mockTables({ channel: rows });

    const page1 = await listChannelAttachments(OWNER, { page: 1, limit: 2 });
    const page2 = await listChannelAttachments(OWNER, { page: 2, limit: 2 });

    expect(page1.items.map((item) => item.url)).toEqual(['https://cdn.zalo.test/3.jpg', 'https://cdn.zalo.test/2.jpg']);
    expect(page1.pagination).toEqual({ total: 3, page: 1, limit: 2, pages: 2 });
    expect(page2.items.map((item) => item.url)).toEqual(['https://cdn.zalo.test/1.jpg']);
  });
});
