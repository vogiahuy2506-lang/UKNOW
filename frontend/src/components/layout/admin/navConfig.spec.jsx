import { describe, expect, it } from 'vitest';
import {
  superAdminMenuItems,
} from './navConfig';
import {
  groupSuperAdminMenuItems,
  normalizeSuperAdminMenuCategories,
} from './adminMenuLayout';

const t = (key) => key;

describe('super admin menu layout', () => {
  it('nhóm toàn bộ tab vào bố cục mặc định và luôn có trang quản lý chuyên mục', () => {
    const catalog = superAdminMenuItems(t);
    const categories = normalizeSuperAdminMenuCategories(null, catalog);
    const assigned = categories.flatMap((category) => category.itemKeys);

    expect(new Set(assigned).size).toBe(catalog.length);
    expect(assigned).toContain('menu_categories');
    expect(assigned).toContain('welcome_email');
  });

  it('tôn trọng thứ tự chuyên mục/tab đã lưu và tự nối tab mới còn thiếu', () => {
    const catalog = superAdminMenuItems(t);
    const categories = normalizeSuperAdminMenuCategories([
      {
        id: 'custom',
        nameVi: 'Tùy chỉnh',
        nameEn: 'Custom',
        itemKeys: ['orders', 'dashboard', 'unknown_item'],
      },
    ], catalog);

    expect(categories[0].itemKeys.slice(0, 2)).toEqual(['orders', 'dashboard']);
    expect(categories[0].itemKeys).not.toContain('unknown_item');
    expect(new Set(categories[0].itemKeys).size).toBe(catalog.length);
  });

  it('dùng tên theo locale và tạo menu cha có children là tab thật', () => {
    const groups = groupSuperAdminMenuItems(superAdminMenuItems(t), 'en', [
      {
        id: 'custom',
        nameVi: 'Tùy chỉnh',
        nameEn: 'Custom',
        itemKeys: ['orders'],
      },
    ], () => null);

    expect(groups[0].name).toBe('Custom');
    expect(groups[0].children[0]).toMatchObject({
      key: 'orders',
      path: '/admin/orders',
    });
  });
});
