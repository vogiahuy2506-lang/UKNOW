import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindSuperAdminLayout = jest.fn();
const mockSaveSuperAdminLayout = jest.fn();
const mockFindLayout = jest.fn();
const mockSaveLayout = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/adminMenu.repository.js', () => ({
  findSuperAdminLayout: mockFindSuperAdminLayout,
  saveSuperAdminLayout: mockSaveSuperAdminLayout,
  findLayout: mockFindLayout,
  saveLayout: mockSaveLayout,
}));

const {
  getSuperAdminMenuLayout,
  getAppMenuLayout,
  normalizeAdminMenuCategories,
  normalizeAppMenuLinks,
  updateSuperAdminMenuLayout,
  updateAppMenuLayout,
} = await import('../adminMenu.service.js');

describe('adminMenu.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('trả layout rỗng để frontend dùng mặc định khi chưa từng lưu', async () => {
    mockFindSuperAdminLayout.mockResolvedValue(null);

    await expect(getSuperAdminMenuLayout()).resolves.toEqual({
      categories: [],
      updatedBy: null,
      updatedAt: null,
    });
  });

  it('chuẩn hóa tên và dùng tên Việt làm fallback tiếng Anh', () => {
    expect(normalizeAdminMenuCategories([
      {
        id: 'sales',
        nameVi: '  Kinh doanh  ',
        nameEn: '',
        itemKeys: ['orders', 'plans'],
      },
    ])).toEqual([
      {
        id: 'sales',
        nameVi: 'Kinh doanh',
        nameEn: 'Kinh doanh',
        itemKeys: ['orders', 'plans'],
      },
    ]);
  });

  it('từ chối một tab được gán vào nhiều chuyên mục', () => {
    expect(() => normalizeAdminMenuCategories([
      { id: 'one', nameVi: 'Một', itemKeys: ['orders'] },
      { id: 'two', nameVi: 'Hai', itemKeys: ['orders'] },
    ])).toThrow('Tab "orders" được gán nhiều lần');
  });

  it('từ chối id không an toàn và danh sách chuyên mục rỗng', () => {
    expect(() => normalizeAdminMenuCategories([])).toThrow('ít nhất một chuyên mục');
    expect(() => normalizeAdminMenuCategories([
      { id: '../bad', nameVi: 'Sai', itemKeys: [] },
    ])).toThrow('Mã chuyên mục không hợp lệ');
  });

  it('lưu toàn bộ layout nguyên tử cùng id super admin thao tác', async () => {
    const savedRow = {
      categories: [{ id: 'overview', nameVi: 'Tổng quan', nameEn: 'Overview', itemKeys: ['dashboard'] }],
      updated_by: 42,
      updated_at: '2026-09-11T03:00:00.000Z',
    };
    mockSaveSuperAdminLayout.mockResolvedValue(savedRow);

    const result = await updateSuperAdminMenuLayout([
      { id: 'overview', nameVi: ' Tổng quan ', nameEn: ' Overview ', itemKeys: ['dashboard'] },
    ], 42);

    expect(mockSaveSuperAdminLayout).toHaveBeenCalledWith(savedRow.categories, 42);
    expect(result).toEqual({
      categories: savedRow.categories,
      updatedBy: 42,
      updatedAt: savedRow.updated_at,
    });
  });

  it('lưu và đọc layout của app_user với đúng scope', async () => {
    mockFindLayout.mockResolvedValue({
      categories: [{ id: 'campaigns', nameVi: 'Chiến dịch', nameEn: 'Campaigns', itemKeys: ['quick_send'] }],
      links: [],
      updated_by: 99,
      updated_at: '2026-09-13T00:00:00.000Z',
    });

    const fetched = await getAppMenuLayout();
    expect(mockFindLayout).toHaveBeenCalledWith({ scope: 'app_user' });
    expect(fetched.categories[0].id).toBe('campaigns');
    expect(fetched.links).toEqual([]);

    mockSaveLayout.mockResolvedValue({
      categories: [{ id: 'campaigns', nameVi: 'Chiến dịch', nameEn: 'Campaigns', itemKeys: ['quick_send'] }],
      links: [],
      updated_by: 99,
      updated_at: '2026-09-13T00:00:00.000Z',
    });

    const updated = await updateAppMenuLayout([
      { id: 'campaigns', nameVi: 'Chiến dịch', nameEn: 'Campaigns', itemKeys: ['quick_send'] },
    ], [], 99);

    expect(mockSaveLayout).toHaveBeenCalledWith({
      categories: [{ id: 'campaigns', nameVi: 'Chiến dịch', nameEn: 'Campaigns', itemKeys: ['quick_send'] }],
      links: [],
      updatedBy: 99,
      scope: 'app_user',
    });
    expect(updated.updatedBy).toBe(99);
    expect(updated.links).toEqual([]);
  });

  describe('normalizeAppMenuLinks', () => {
    const categories = [
      { id: 'main', nameVi: 'Chính', nameEn: 'Main', itemKeys: [] },
      { id: 'guides', nameVi: 'Hướng dẫn', nameEn: 'Guides', itemKeys: [] },
    ];

    it('chấp nhận link https youtu.be và http thường', () => {
      const result = normalizeAppMenuLinks([
        { key: 'link-a', nameVi: 'Video', url: 'https://youtu.be/x', categoryId: 'main' },
        { key: 'link-b', nameVi: 'Trang', url: 'http://a.vn', categoryId: 'guides' },
      ], categories);
      expect(result).toEqual([
        { key: 'link-a', nameVi: 'Video', nameEn: 'Video', url: 'https://youtu.be/x', categoryId: 'main' },
        { key: 'link-b', nameVi: 'Trang', nameEn: 'Trang', url: 'http://a.vn', categoryId: 'guides' },
      ]);
    });

    it.each([
      ['javascript:alert(1)'],
      ['data:text/html,<script>alert(1)</script>'],
      ['JAVASCRIPT:alert(1)'],
      [' javascript:alert(1)'],
      ['youtube.com/x'],
    ])('từ chối protocol không an toàn hoặc thiếu scheme: %s', (url) => {
      expect(() => normalizeAppMenuLinks([
        { key: 'link-a', nameVi: 'X', url, categoryId: 'main' },
      ], categories)).toThrow('Link phải bắt đầu bằng http:// hoặc https://');
    });

    it('từ chối key trùng', () => {
      expect(() => normalizeAppMenuLinks([
        { key: 'link-a', nameVi: 'X', url: 'https://a.vn', categoryId: 'main' },
        { key: 'link-a', nameVi: 'Y', url: 'https://b.vn', categoryId: 'main' },
      ], categories)).toThrow('bị trùng');
    });

    it('từ chối key không đúng tiền tố link-', () => {
      expect(() => normalizeAppMenuLinks([
        { key: 'abc', nameVi: 'X', url: 'https://a.vn', categoryId: 'main' },
      ], categories)).toThrow('Mã link không hợp lệ');
    });

    it('từ chối vượt quá 50 link', () => {
      const tooMany = Array.from({ length: 51 }, (_, i) => ({
        key: `link-${i}`,
        nameVi: `X${i}`,
        url: 'https://a.vn',
        categoryId: 'main',
      }));
      expect(() => normalizeAppMenuLinks(tooMany, categories)).toThrow('Tối đa 50 link');
    });

    it('từ chối nameVi rỗng', () => {
      expect(() => normalizeAppMenuLinks([
        { key: 'link-a', nameVi: '  ', url: 'https://a.vn', categoryId: 'main' },
      ], categories)).toThrow('Tên link tiếng Việt');
    });

    it('từ chối categoryId không tồn tại trong danh sách chuyên mục', () => {
      expect(() => normalizeAppMenuLinks([
        { key: 'link-a', nameVi: 'X', url: 'https://a.vn', categoryId: 'khong-ton-tai' },
      ], categories)).toThrow('Chuyên mục của link không hợp lệ');
    });
  });

  it('từ chối khi itemKeys chứa link-* mà links không có link tương ứng', async () => {
    await expect(updateAppMenuLayout([
      { id: 'main', nameVi: 'Chính', nameEn: 'Main', itemKeys: ['link-zz'] },
    ], [], 1)).rejects.toThrow('không có link tương ứng');
  });

  it('links === undefined giữ nguyên links đang có trong DB (client cũ chưa gửi trường links)', async () => {
    mockFindLayout.mockResolvedValue({
      categories: [{ id: 'main', nameVi: 'Chính', nameEn: 'Main', itemKeys: ['link-a'] }],
      links: [{ key: 'link-a', nameVi: 'Video', nameEn: 'Video', url: 'https://a.vn', categoryId: 'main' }],
      updated_by: 5,
      updated_at: '2026-09-28T00:00:00.000Z',
    });
    mockSaveLayout.mockResolvedValue({
      categories: [{ id: 'main', nameVi: 'Chính', nameEn: 'Main', itemKeys: ['link-a'] }],
      links: [{ key: 'link-a', nameVi: 'Video', nameEn: 'Video', url: 'https://a.vn', categoryId: 'main' }],
      updated_by: 5,
      updated_at: '2026-09-28T00:00:01.000Z',
    });

    const result = await updateAppMenuLayout([
      { id: 'main', nameVi: 'Chính', nameEn: 'Main', itemKeys: ['link-a'] },
    ], undefined, 5);

    expect(mockSaveLayout).toHaveBeenCalledWith({
      categories: [{ id: 'main', nameVi: 'Chính', nameEn: 'Main', itemKeys: ['link-a'] }],
      links: null,
      updatedBy: 5,
      scope: 'app_user',
    });
    expect(result.links).toEqual([
      { key: 'link-a', nameVi: 'Video', nameEn: 'Video', url: 'https://a.vn', categoryId: 'main' },
    ]);
  });
});
