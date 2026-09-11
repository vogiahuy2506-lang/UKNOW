import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindSuperAdminLayout = jest.fn();
const mockSaveSuperAdminLayout = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/adminMenu.repository.js', () => ({
  findSuperAdminLayout: mockFindSuperAdminLayout,
  saveSuperAdminLayout: mockSaveSuperAdminLayout,
}));

const {
  getSuperAdminMenuLayout,
  normalizeAdminMenuCategories,
  updateSuperAdminMenuLayout,
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
});
