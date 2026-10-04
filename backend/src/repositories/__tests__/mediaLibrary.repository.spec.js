import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Danh sách tệp của Thư viện media (`listWorkspaceStorageObjects`).
 *
 * Tab "Tệp khách gửi" (`listChannelAttachments`) đã gỡ 04/10/2026: nó lọc `jsonb_array_length(attachments) > 0` trên
 * tin Zalo, mà luồng nhận tin Zalo không bao giờ ghi cột `attachments` — bản test cũ tự dựng dòng có sẵn mảng đó nên
 * xanh trong khi production luôn rỗng. Bài học giữ lại ở đây: hàng mock phải đúng hình dạng pg trả thật — cột bigint
 * (`id`, `size_bytes`, `reference_id` là varchar) là CHUỖI, cột timestamptz là Date, `COUNT(*)::int` là số.
 * Câu SQL thật được kiểm ở tests/integration/mediaLibrary.test.js.
 */
jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: jest.fn() },
}));
jest.unstable_mockModule('../../controllers/upload.controller.js', () => ({
  default: {
    buildDownloadUrlByKey: (key, { preview = false } = {}) => `https://app.test/file/${encodeURIComponent(key)}${preview ? '/download?preview=true' : ''}`,
  },
}));

const db = (await import('../../config/database.js')).default;
const { listWorkspaceStorageObjects } = await import('../mediaLibrary.repository.js');

const OWNER = 7;

/** Một hàng `storage_objects` (+ cột chat_*) đúng kiểu pg trả về. */
const row = (overrides = {}) => ({
  id: '31',
  storage_key: `uploads/${OWNER}/chat/1754800000000_BaoCao.docx`,
  temp_key: null,
  category: 'chat',
  state: 'active',
  size_bytes: '32600000',
  expires_at: null,
  reference_type: 'chat_attachment',
  reference_id: null,
  created_at: new Date('2026-08-09T10:00:00Z'),
  chat_display_name: null,
  chat_mime_type: null,
  ...overrides,
});

/** Mỗi truy vấn trả đúng phần của nó: đếm / tổng theo danh mục / danh sách. */
function mockQueries({ rows = [], total = rows.length, summary = [] } = {}) {
  db.query.mockImplementation(async (sql) => {
    if (/COUNT\(\*\)::int AS total/.test(sql)) return { rows: [{ total }] };
    if (/GROUP BY so\.category/.test(sql)) return { rows: summary };
    if (/SELECT so\.id,/.test(sql)) return { rows };
    throw new Error(`SQL ngoài dự kiến: ${sql.slice(0, 60)}`);
  });
}

describe('listWorkspaceStorageObjects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('trả tệp đúng hình dạng: cỡ là số, id giữ nguyên, ảnh có link xem trước, tệp khác thì không', async () => {
    mockQueries({
      rows: [
        row(),
        row({
          id: '32',
          storage_key: `uploads/${OWNER}/chat/1754800000001_anh.png`,
          chat_display_name: 'anh-san-pham.png',
          chat_mime_type: 'image/png',
          size_bytes: '2048',
        }),
      ],
      summary: [{ category: 'chat', count: 2, total_bytes: '32602048' }],
    });

    const result = await listWorkspaceStorageObjects(OWNER, {});

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: '31', category: 'chat', sizeBytes: 32600000, size: 32600000, type: 'file',
    });
    expect(result.items[0].url).not.toContain('preview=true');
    expect(result.items[1]).toMatchObject({
      id: '32', displayName: 'anh-san-pham.png', mimeType: 'image/png', type: 'image', sizeBytes: 2048,
    });
    expect(result.items[1].url).toContain('/download?preview=true');
    expect(result.categorySummary).toEqual([{ category: 'chat', count: 2, totalBytes: 32602048 }]);
    expect(result.pagination).toEqual({ total: 2, page: 1, limit: 24, pages: 1 });
  });

  it('lọc theo danh mục và tìm theo chữ: đưa tham số vào truy vấn, không ghép chuỗi', async () => {
    mockQueries();

    await listWorkspaceStorageObjects(OWNER, { category: 'landing_asset', search: 'banner', page: '2', limit: '10' });

    const listCall = db.query.mock.calls.find(([sql]) => /SELECT so\.id,/.test(sql));
    expect(listCall[0]).toMatch(/so\.category = \$2/);
    expect(listCall[1]).toEqual([OWNER, 'landing_asset', '%banner%', 10, 10]);
    expect(listCall[0]).not.toContain('banner');
  });
});
