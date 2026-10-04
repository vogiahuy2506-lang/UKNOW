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
const { listWorkspaceStorageObjects, deleteChatCatalogRows, isAssistantUploadOfOthers } = await import('../mediaLibrary.repository.js');

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
  chat_source: null,
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

  it('M-08: tên hiển thị bỏ tiền tố số giờ của khoá lưu trữ (tệp chat dùng tên người dùng đặt)', async () => {
    mockQueries({
      rows: [
        row({ id: '1', storage_key: `uploads/${OWNER}/campaign/1779359034935_Campaign_4_-_Aff.png`, category: 'campaign', reference_type: null }),
        row({ id: '2', storage_key: `uploads/${OWNER}/landing/1779359034935_ab12cd34_hero.png`, category: 'landing_asset', reference_type: null }),
        row({ id: '3', storage_key: `uploads/${OWNER}/chat/1779359034935_x.docx`, chat_display_name: 'Báo cáo thực tập.docx' }),
      ],
    });

    const { items } = await listWorkspaceStorageObjects(OWNER, {});

    expect(items.map((item) => item.displayName)).toEqual(['Campaign_4_-_Aff.png', 'hero.png', 'Báo cáo thực tập.docx']);
  });

  it('M-02: tệp chat mang nguồn (Trợ lý AI / Studio / Hộp thư); tệp khác thì source null', async () => {
    mockQueries({
      rows: [
        row({ id: '1', chat_source: 'ai_assistant' }),
        row({ id: '2', category: 'zalo_template', reference_type: 'zalo_template', reference_id: '15' }),
      ],
    });

    const { items } = await listWorkspaceStorageObjects(OWNER, {});

    expect(items.map((item) => item.source)).toEqual(['ai_assistant', null]);
  });

  it('M-02: "tự xoá ngày …" CHỈ cho tệp tạm (kho dọn tệp temp quá hạn); tệp chat đã gắn tin nhắn có expires_at nhưng không hứa tự xoá', async () => {
    const expires = new Date('2026-11-22T00:00:00Z');
    mockQueries({
      rows: [
        row({ id: '1', category: 'temp', state: 'temp', expires_at: expires, reference_type: null }),
        row({ id: '2', category: 'chat', state: 'active', expires_at: expires }),
        row({ id: '3', category: 'chat', state: 'temp', expires_at: null }),
      ],
    });

    const { items } = await listWorkspaceStorageObjects(OWNER, {});

    expect(items.map((item) => item.autoDeleteAt)).toEqual([expires, null, null]);
  });

  describe('truy vấn', () => {
    const listCall = () => db.query.mock.calls.find(([sql]) => /SELECT so\.id,/.test(sql));
    const countCall = () => db.query.mock.calls.find(([sql]) => /COUNT\(\*\)::int AS total/.test(sql));
    const summaryCall = () => db.query.mock.calls.find(([sql]) => /GROUP BY so\.category/.test(sql));

    it('lọc theo danh mục: đưa tham số vào truy vấn, không ghép chuỗi; có phân trang', async () => {
      mockQueries();

      await listWorkspaceStorageObjects(OWNER, { category: 'landing_asset', page: '2', limit: '10' });

      expect(listCall()[0]).toMatch(/so\.category = \$2/);
      expect(listCall()[1]).toEqual([OWNER, 'landing_asset', 10, 10]);
      expect(listCall()[0]).not.toContain('landing_asset');
    });

    it('M-08: tìm theo TÊN tệp (phần sau dấu / cuối của khoá) hoặc tên chat; không khớp đường dẫn nội bộ', async () => {
      mockQueries();

      await listWorkspaceStorageObjects(OWNER, { search: 'banner' });

      const [sql, params] = listCall();
      expect(sql).toContain(`regexp_replace(COALESCE(so.storage_key, so.temp_key, ''), '^.*/', '') ILIKE $2`);
      expect(sql).toContain('ca.display_name ILIKE $2');
      expect(sql).not.toMatch(/so\.storage_key ILIKE/);
      expect(params).toEqual([OWNER, '%banner%', 24, 0]);
    });

    it('M-11: ký tự LIKE trong chữ tìm (% _ \\) được thoát — gõ "50%" không khớp mọi tệp', async () => {
      mockQueries();

      await listWorkspaceStorageObjects(OWNER, { search: '50%_a\\' });

      const [sql, params] = listCall();
      expect(params[1]).toBe('%50\\%\\_a\\\\%');
      expect(sql).toContain("ESCAPE '\\'");
    });

    it('M-08: sắp xếp mặc định nặng nhất trước; sort=newest thì mới nhất trước; giá trị lạ → mặc định (không ghép chuỗi vào ORDER BY)', async () => {
      mockQueries();
      await listWorkspaceStorageObjects(OWNER, {});
      expect(listCall()[0]).toContain('ORDER BY so.size_bytes DESC, so.id DESC');

      db.query.mockClear();
      mockQueries();
      await listWorkspaceStorageObjects(OWNER, { sort: 'newest' });
      expect(listCall()[0]).toContain('ORDER BY so.created_at DESC, so.id DESC');

      db.query.mockClear();
      mockQueries();
      await listWorkspaceStorageObjects(OWNER, { sort: 'size; DROP TABLE storage_objects' });
      expect(listCall()[0]).toContain('ORDER BY so.size_bytes DESC, so.id DESC');
      expect(listCall()[0]).not.toContain('DROP');
    });

    it('M-08: bản lưu landing tự động bị ẩn khỏi lưới khi không lọc danh mục, nhưng VẪN nằm trong thẻ tổng; lọc đích danh thì liệt kê được', async () => {
      mockQueries();
      await listWorkspaceStorageObjects(OWNER, {});
      expect(listCall()[0]).toContain(`so.category <> 'landing_version'`);
      expect(countCall()[0]).toContain(`so.category <> 'landing_version'`);
      expect(summaryCall()[0]).not.toContain('landing_version');

      db.query.mockClear();
      mockQueries();
      await listWorkspaceStorageObjects(OWNER, { category: 'landing_version' });
      expect(listCall()[0]).not.toContain(`<> 'landing_version'`);
    });

    it('thẻ tổng không chịu bộ lọc danh mục/tìm kiếm (là bảng "dung lượng nằm ở đâu")', async () => {
      mockQueries();

      await listWorkspaceStorageObjects(OWNER, { category: 'chat', search: 'abc' });

      expect(summaryCall()[1]).toEqual([OWNER]);
      expect(summaryCall()[0]).not.toMatch(/ILIKE|so\.category = /);
    });

    it('nối chat_attachments theo KHOÁ (duy nhất), không còn DISTINCT ON quét cả bảng (M-10)', async () => {
      mockQueries();

      await listWorkspaceStorageObjects(OWNER, {});

      for (const [sql] of db.query.mock.calls) {
        expect(sql).toContain('LEFT JOIN chat_attachments ca ON ca.storage_key = so.storage_key');
        expect(sql).not.toContain('DISTINCT ON');
      }
    });

    it('Q3: chủ không bị lọc tệp trợ lý AI; nhân viên: danh sách, đếm VÀ thẻ tổng đều loại tệp trợ lý do người khác tải lên', async () => {
      mockQueries();
      await listWorkspaceStorageObjects(OWNER, {}, { restrictAssistantFiles: false, actorUserId: OWNER });
      for (const [sql] of db.query.mock.calls) expect(sql).not.toContain('ai_assistant');

      db.query.mockClear();
      mockQueries();
      await listWorkspaceStorageObjects(OWNER, { category: 'chat' }, { restrictAssistantFiles: true, actorUserId: 99 });
      const clause = "AND NOT (ca.source = 'ai_assistant' AND so.actor_user_id IS DISTINCT FROM $";
      expect(db.query.mock.calls).toHaveLength(3);
      for (const [sql, params] of db.query.mock.calls) {
        expect(sql).toContain(clause);
        // id nhân viên là THAM SỐ (không ghép chuỗi) và đứng đúng chỗ $n tương ứng
        const at = sql.indexOf(clause) + clause.length;
        const n = Number(/^\d+/.exec(sql.slice(at))[0]);
        expect(params[n - 1]).toBe(99);
      }
    });
  });
});

describe('deleteChatCatalogRows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('xoá dòng danh mục chat_attachments theo khoá HOẶC storage_object_id (tệp chat cũ có storage_object_id NULL), trả tên hiển thị', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ display_name: 'BaoCao.docx' }, { display_name: null }] });

    const names = await deleteChatCatalogRows({ storageObjectId: '31', storageKey: 'uploads/7/chat/1754800000000_BaoCao.docx' });

    expect(names).toEqual(['BaoCao.docx']);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM chat_attachments/);
    expect(sql).toMatch(/storage_key = \$1 OR storage_object_id = \$2/);
    expect(params).toEqual(['uploads/7/chat/1754800000000_BaoCao.docx', '31']);
  });

  it('thiếu cả hai định danh thì không xoá gì (tránh DELETE không điều kiện)', async () => {
    expect(await deleteChatCatalogRows({})).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('isAssistantUploadOfOthers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tệp trợ lý AI do người khác tải lên → true (nhân viên không được mở/xoá)', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    const hidden = await isAssistantUploadOfOthers({ storage_key: 'uploads/7/chat/1_a.docx', actor_user_id: '7' }, 99);

    expect(hidden).toBe(true);
    expect(db.query.mock.calls[0][0]).toContain(`source = 'ai_assistant'`);
    expect(db.query.mock.calls[0][1]).toEqual(['uploads/7/chat/1_a.docx']);
  });

  it('tệp do chính người xem tải lên → false, không cần hỏi DB (id so sánh dạng chuỗi: bigint của pg là chuỗi)', async () => {
    expect(await isAssistantUploadOfOthers({ storage_key: 'uploads/7/chat/1_a.docx', actor_user_id: '99' }, 99)).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('tệp không phải của trợ lý AI → false; tệp không có khoá → false', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    expect(await isAssistantUploadOfOthers({ storage_key: 'uploads/7/zalo/a.png', actor_user_id: '7' }, 99)).toBe(false);
    expect(await isAssistantUploadOfOthers({ storage_key: null, actor_user_id: '7' }, 99)).toBe(false);
  });
});
