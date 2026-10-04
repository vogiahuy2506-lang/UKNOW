import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateFileToken } from '../../../utils/fileDownloadToken.js';

// File token ký bằng JWT_SECRET (không còn chuỗi dự phòng) — đọc lúc ký/kiểm nên gán ở đây là đủ.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-storage-reference-secret';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const {
  REFERENCE_CONFIGS,
  buildStorageReferenceIndex,
  getIndexedStorageReferences,
  isReferenceAlive,
  isStorageKeyReferencedByMessage,
  resolveStorageObjectsUsage,
  resolveWorkspaceOwner,
} = await import('../storageReference.service.js');

describe('storageReference.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockImplementation(async (sql) => {
      if (/FROM chat_attachments/.test(sql)) {
        return { rows: [{ id: 11, id_user: 88, storage_key: 'uploads/55/chat/inbox.pdf' }] };
      }
      if (/FROM help_articles/.test(sql)) {
        const token = generateFileToken('uploads/1/help/guide.png', null, null, null);
        return {
          rows: [{
            id: 9,
            body_md: '',
            body_html: `<img src="/file/${token}">`,
            media_urls: [],
          }],
        };
      }
      if (/FROM business_profiles/.test(sql)) {
        return {
          rows: [{ id: 5, user_id: 77, logo_url: '/uploads/77/legacy-logo.png' }],
        };
      }
      return { rows: [] };
    });
  });

  it('keeps chat catalog owner canonical and maps help to the system pool', async () => {
    const index = await buildStorageReferenceIndex();

    expect(getIndexedStorageReferences(index, 'uploads/55/chat/inbox.pdf')).toEqual([
      expect.objectContaining({
        ownerUserId: 88,
        ownerIsCanonical: true,
        referenceType: 'chat_attachment',
      }),
    ]);
    expect(getIndexedStorageReferences(index, 'uploads/1/help/guide.png')).toEqual([
      expect.objectContaining({
        poolType: 'system',
        ownerUserId: null,
        referenceType: 'help_article',
      }),
    ]);
    expect(getIndexedStorageReferences(index, 'uploads/77/legacy-logo.png')).toEqual([
      expect.objectContaining({
        ownerUserId: 77,
        referenceType: 'business_profile',
      }),
    ]);
  });

  it('resolves an employee parent id to its active workspace owner', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 55, owner_ids: ['12'] }] });

    await expect(resolveWorkspaceOwner(55)).resolves.toEqual({
      ownerUserId: 12,
      source: 'membership',
      ambiguous: false,
    });
  });

  it('checks isReferenceAlive accurately', async () => {
    // 1. empty input
    await expect(isReferenceAlive(null, null)).resolves.toEqual({ alive: false });

    // 2. alive reference
    query.mockResolvedValueOnce({ rows: [{ id: 10, name: 'Khuyến mãi T8' }] });
    await expect(isReferenceAlive('zalo_template', 10)).resolves.toEqual({
      alive: true,
      label: 'Mẫu tin nhắn',
      name: 'Khuyến mãi T8',
      url: '/app/settings/templates',
    });

    // 3. dead reference
    query.mockResolvedValueOnce({ rows: [] });
    await expect(isReferenceAlive('email_template', 99)).resolves.toEqual({ alive: false });

    // 4. unknown reference (fail-safe alive)
    await expect(isReferenceAlive('unknown_parent_type', 123)).resolves.toEqual({
      alive: true,
      label: 'unknown_parent_type',
      name: 'unknown_parent_type #123',
      url: null,
    });

    // 5. query error (fail-safe alive on 42703, 22P02, etc.)
    query.mockRejectedValueOnce(new Error('column does not exist (42703)'));
    await expect(isReferenceAlive('campaign_node', 5)).resolves.toEqual({
      alive: true,
      label: 'Chiến dịch',
      name: 'Chiến dịch #5',
      url: '/app/campaigns',
    });
  });

  describe('isStorageKeyReferencedByMessage', () => {
    it('detects reference in ai_chat_messages via data column', async () => {
      query.mockImplementation(async (sql) => {
        if (/ai_chat_messages/i.test(sql)) {
          return { rows: [{ 1: 1 }] };
        }
        return { rows: [] };
      });

      const referenced = await isStorageKeyReferencedByMessage('uploads/42/chat/assistant.pdf');
      expect(referenced).toBe(true);
      const aiQueryCall = query.mock.calls.find(([sql]) => sql.includes('ai_chat_messages'));
      expect(aiQueryCall[0]).toMatch(/data::text LIKE \$1/);
    });

    it('detects reference in webchat_messages via attachments column', async () => {
      query.mockImplementation(async (sql) => {
        if (/webchat_messages/i.test(sql)) {
          return { rows: [{ 1: 1 }] };
        }
        return { rows: [] };
      });

      const referenced = await isStorageKeyReferencedByMessage('uploads/42/chat/webchat.pdf');
      expect(referenced).toBe(true);
    });

    it('returns false when no table contains the key', async () => {
      query.mockResolvedValue({ rows: [] });
      const referenced = await isStorageKeyReferencedByMessage('uploads/42/chat/orphan.pdf');
      expect(referenced).toBe(false);
    });
  });
});

/**
 * resolveStorageObjectsUsage — MỘT quyết định "tệp có đang được dùng không" cho nút Xoá và cho danh sách.
 *
 * Mock DB theo hình dạng pg thật: id bigint là CHUỖI, reference_id là varchar, `title` là chuỗi. Truy vấn tìm landing
 * page theo khoá được MÔ PHỎNG đúng nghĩa câu SQL (position(khoá IN html_content/custom_config)); câu SQL thật được
 * kiểm bằng EXPLAIN trên DB e2e và ở tests/integration/mediaLibrary.test.js.
 */
describe('resolveStorageObjectsUsage', () => {
  const OWNER = 42;
  const KEY = 'uploads/42/landing/1779359034935_ab12cd34_hero.png';

  const asset = (overrides = {}) => ({
    id: '549',
    category: 'landing_asset',
    storageKey: KEY,
    expiresAt: null,
    referenceType: 'landing_page',
    referenceId: '72',
    ...overrides,
  });

  const isLandingQuery = (sql) => /unnest\(\$2::text\[\]\)/.test(sql);

  /** landingPages: [{ id, title, html, config }]; parents: { 'form#2': { name } } — chỉ các cha CÒN SỐNG. */
  function mockUsageDb({ landingPages = [], parents = {}, landingError = null } = {}) {
    query.mockReset();
    query.mockImplementation(async (sql, params) => {
      if (isLandingQuery(sql)) {
        if (landingError) throw landingError;
        const rows = [];
        for (const page of [...landingPages].sort((a, b) => Number(a.id) - Number(b.id))) {
          for (const key of params[1]) {
            if (String(page.html || '').includes(key) || JSON.stringify(page.config || {}).includes(key)) {
              rows.push({ storage_key: key, id: page.id, title: page.title });
            }
          }
        }
        return { rows };
      }
      // `landing` và `landing_page` dùng CÙNG câu SQL — khớp theo mọi kiểu có câu SQL đó.
      const parent = Object.entries(REFERENCE_CONFIGS)
        .filter(([, config]) => config.sql === sql)
        .map(([type]) => parents[`${type}#${params[0]}`])
        .find(Boolean);
      return { rows: parent ? [{ id: params[0], name: parent.name }] : [] };
    });
  }

  const landingQueries = () => query.mock.calls.filter(([sql]) => isLandingQuery(sql));
  const parentQueries = () => query.mock.calls.filter(([sql]) => !isLandingQuery(sql));

  beforeEach(() => {
    mockUsageDb();
  });

  it('tệp không có tham chiếu → không dùng, không chạm DB', async () => {
    const usage = await resolveStorageObjectsUsage([
      asset({ id: '1', referenceType: null, referenceId: null }),
      asset({ id: '2', referenceType: 'zalo_template', referenceId: null }),
    ], OWNER);

    expect(usage.get('1')).toEqual({ inUse: false });
    expect(usage.get('2')).toEqual({ inUse: false });
    expect(query).not.toHaveBeenCalled();
  });

  it('M-04a: tệp chat có reference chat_attachment KHÔNG bị chặn xoá (trước đây 409 "đang được sử dụng bởi Hộp thư chat")', async () => {
    const usage = await resolveStorageObjectsUsage([
      { id: '31', category: 'chat', storageKey: 'uploads/42/chat/1754800000000_BaoCao.docx', referenceType: 'chat_attachment', referenceId: '12' },
    ], OWNER);

    expect(usage.get('31')).toEqual({ inUse: false });
    expect(query).not.toHaveBeenCalled();
  });

  it('tệp tạm đã quá hạn xoá được dù còn tham chiếu; chưa quá hạn thì vẫn xét tham chiếu', async () => {
    mockUsageDb({ parents: { 'zalo_template#9': { name: 'Mẫu cũ' } } });
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);

    const usage = await resolveStorageObjectsUsage([
      { id: '1', category: 'temp', storageKey: 'uploads/42/t1.png', expiresAt: past, referenceType: 'zalo_template', referenceId: '9' },
      { id: '2', category: 'temp', storageKey: 'uploads/42/t2.png', expiresAt: future, referenceType: 'zalo_template', referenceId: '9' },
    ], OWNER);

    expect(usage.get('1')).toEqual({ inUse: false });
    expect(usage.get('2')).toMatchObject({ inUse: true, label: 'Mẫu tin nhắn', name: 'Mẫu cũ' });
  });

  it('M-04c: ảnh biểu mẫu (reference_type "form") báo đúng tên + link biểu mẫu, không còn mã thô "form #2"', async () => {
    mockUsageDb({ parents: { 'form#2': { name: 'Đăng ký tư vấn' } } });

    const usage = await resolveStorageObjectsUsage([
      { id: '70', category: 'form_asset', storageKey: 'uploads/42/forms/b.png', referenceType: 'form', referenceId: '2' },
    ], OWNER);

    expect(usage.get('70')).toEqual({
      inUse: true,
      referenceType: 'form',
      referenceId: '2',
      label: 'Biểu mẫu',
      name: 'Đăng ký tư vấn',
      url: '/app/forms',
    });
    expect(JSON.stringify(usage.get('70'))).not.toContain('form #2');
  });

  it('biểu mẫu đã xoá thì ảnh của nó xoá được', async () => {
    mockUsageDb({ parents: {} });
    const usage = await resolveStorageObjectsUsage([
      { id: '70', category: 'form_asset', storageKey: 'uploads/42/forms/b.png', referenceType: 'form', referenceId: '2' },
    ], OWNER);
    expect(usage.get('70')).toEqual({ inUse: false });
  });

  describe('ảnh landing (category landing_asset gắn landing_page) — M-04b', () => {
    it('khoá còn nằm trong html_content của trang → đang dùng, báo tên trang', async () => {
      mockUsageDb({
        landingPages: [{ id: '72', title: 'Khai giảng tháng 10', html: `<img src="https://app.test/lp-assets/${KEY}">` }],
        parents: { 'landing_page#72': { name: 'Khai giảng tháng 10' } },
      });

      const usage = await resolveStorageObjectsUsage([asset()], OWNER);

      expect(usage.get('549')).toEqual({
        inUse: true,
        referenceType: 'landing_page',
        referenceId: '72',
        label: 'Landing Page',
        name: 'Khai giảng tháng 10',
        url: '/app/settings/landing-pages',
      });
      // phạm vi: đúng chủ workspace + đúng khoá
      expect(landingQueries()).toHaveLength(1);
      expect(landingQueries()[0][1]).toEqual([OWNER, [KEY]]);
    });

    it('khoá chỉ còn trong custom_config của trang → vẫn đang dùng', async () => {
      mockUsageDb({
        landingPages: [{ id: '72', title: 'Trang A', html: '<p>không còn ảnh</p>', config: { hero: { image: `/lp-assets/${KEY}` } } }],
        parents: { 'landing_page#72': { name: 'Trang A' } },
      });
      const usage = await resolveStorageObjectsUsage([asset()], OWNER);
      expect(usage.get('549')).toMatchObject({ inUse: true, name: 'Trang A' });
    });

    it('ảnh đã bị thay: trang cha còn nhưng html không còn khoá → XOÁ ĐƯỢC (production 04/10: 10/55 ảnh, 4,5 MB)', async () => {
      mockUsageDb({
        landingPages: [{ id: '72', title: 'Khai giảng tháng 10', html: '<img src="https://app.test/lp-assets/uploads/42/landing/anh-moi.png">' }],
        parents: { 'landing_page#72': { name: 'Khai giảng tháng 10' } },
      });

      const usage = await resolveStorageObjectsUsage([asset()], OWNER);

      expect(usage.get('549')).toEqual({ inUse: false });
    });

    it('trang cha đã xoá nhưng một trang khác của workspace dùng lại ảnh → đang dùng, báo TRANG ĐANG DÙNG chứ không phải trang cũ', async () => {
      mockUsageDb({
        landingPages: [{ id: '88', title: 'Trang bản sao', html: `<img src="/lp-assets/${KEY}">` }],
        parents: {},
      });

      const usage = await resolveStorageObjectsUsage([asset({ referenceId: '72' })], OWNER);

      expect(usage.get('549')).toMatchObject({ inUse: true, referenceId: '88', name: 'Trang bản sao' });
    });

    it('không kiểm được nội dung trang (lỗi SQL) → rơi về "trang cha còn sống" = đang dùng (fail-safe), không bao giờ coi là rảnh', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockUsageDb({
        landingError: Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }),
        parents: { 'landing_page#72': { name: 'Khai giảng tháng 10' } },
      });

      const usage = await resolveStorageObjectsUsage([asset()], OWNER);

      expect(usage.get('549')).toMatchObject({ inUse: true, label: 'Landing Page', name: 'Khai giảng tháng 10' });
      warn.mockRestore();
    });

    it('nhiều ảnh cùng workspace chỉ tốn MỘT truy vấn nội dung trang', async () => {
      const otherKey = 'uploads/42/landing/1779359034999_ef56ab78_logo.png';
      mockUsageDb({
        landingPages: [{ id: '72', title: 'Trang A', html: `<img src="/lp-assets/${KEY}">` }],
        parents: { 'landing_page#72': { name: 'Trang A' } },
      });

      const usage = await resolveStorageObjectsUsage([
        asset({ id: '1' }),
        asset({ id: '2', storageKey: otherKey }),
      ], OWNER);

      expect(landingQueries()).toHaveLength(1);
      expect(usage.get('1')).toMatchObject({ inUse: true });
      expect(usage.get('2')).toEqual({ inUse: false });
    });

    it('category "landing" (tệp nhúng bằng link ký, khoá không hiện nguyên văn) KHÔNG bị kiểm nội dung: chỉ xét trang cha còn sống', async () => {
      mockUsageDb({
        landingPages: [],
        parents: { 'landing#72': { name: 'Trang A' } },
      });

      const usage = await resolveStorageObjectsUsage([
        { id: '9', category: 'landing', storageKey: 'uploads/42/landing/x.png', referenceType: 'landing', referenceId: '72' },
      ], OWNER);

      expect(landingQueries()).toHaveLength(0);
      expect(usage.get('9')).toMatchObject({ inUse: true, label: 'Landing Page', name: 'Trang A' });
    });
  });

  it('kiểu tham chiếu lạ → fail-safe đang dùng, giữ mã thô (để thấy mà bổ sung cấu hình)', async () => {
    const usage = await resolveStorageObjectsUsage([
      { id: '5', category: 'other', storageKey: 'uploads/42/x.png', referenceType: 'cho_la', referenceId: '3' },
    ], OWNER);
    expect(usage.get('5')).toMatchObject({ inUse: true, referenceType: 'cho_la', label: 'cho_la', name: 'cho_la #3', url: null });
  });

  it('nhiều tệp cùng một bản ghi cha chỉ tốn MỘT truy vấn cha', async () => {
    mockUsageDb({ parents: { 'zalo_template#15': { name: 'Khuyến mãi T8' } } });

    const usage = await resolveStorageObjectsUsage([
      { id: '1', category: 'zalo_template', storageKey: 'uploads/42/z/a.png', referenceType: 'zalo_template', referenceId: '15' },
      { id: '2', category: 'zalo_template', storageKey: 'uploads/42/z/b.png', referenceType: 'zalo_template', referenceId: '15' },
    ], OWNER);

    expect(parentQueries()).toHaveLength(1);
    expect(usage.get('1')).toMatchObject({ inUse: true, name: 'Khuyến mãi T8' });
    expect(usage.get('2')).toMatchObject({ inUse: true, name: 'Khuyến mãi T8' });
  });
});

// Nút "Đi đến màn hình quản lý" ở Thư viện media dùng nguyên văn `url` làm href. Trước 03/10 hầu hết url thiếu tiền tố /app
// ('/templates', '/studio', '/landing-pages'…) nên rơi vào route `*` của App.jsx và về TRANG CHỦ. Đọc chữ App.jsx
// (không import JSX vào jest backend) và đòi mỗi url là một route thật nằm dưới /app hoặc /admin.
describe('REFERENCE_CONFIGS: url là route thật của frontend', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const appSource = fs.readFileSync(path.resolve(__dirname, '../../../../../frontend/src/App.jsx'), 'utf8');
  const sectionOf = (marker) => {
    const start = appSource.indexOf(`<Route path="${marker}"`);
    const next = appSource.indexOf('<Route path="/', start + 1);
    return start >= 0 ? appSource.slice(start, next > start ? next : undefined) : '';
  };
  const sections = { app: sectionOf('/app'), admin: sectionOf('/admin') };

  it('đọc được hai nhánh route /app và /admin', () => {
    expect(sections.app).toContain('path="settings/templates"');
    expect(sections.admin).toContain('path="help-articles"');
  });

  Object.entries(REFERENCE_CONFIGS).forEach(([type, config]) => {
    it(`${type}: ${config.url}`, () => {
      const match = /^\/(app|admin)\/(.+)$/.exec(config.url);
      expect(match).not.toBeNull();
      expect(sections[match[1]]).toContain(`path="${match[2]}"`);
    });
  });

  it('mẫu tin nhắn dùng chung 3 kênh: nhãn không còn "Mẫu Zalo"', () => {
    expect(REFERENCE_CONFIGS.zalo_template.label).toBe('Mẫu tin nhắn');
  });
});
