import { describe, expect, it } from 'vitest';
import { isSafeExternalUrl, buildAppLinkMenuItems } from '../adminMenuLayout';

/**
 * PLAN_CHUYEN_MUC_LINK_NGOAI_2026-09-28 — lớp phòng thủ THỨ HAI ở FE cho link ngoài (BE đã kiểm
 * trước khi lưu ở adminMenu.service.js). Test riêng vì file gốc adminMenuLayout.js chưa có spec.
 */
describe('isSafeExternalUrl', () => {
  it('chấp nhận http/https', () => {
    expect(isSafeExternalUrl('https://youtu.be/x')).toBe(true);
    expect(isSafeExternalUrl('http://a.vn')).toBe(true);
  });

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['JAVASCRIPT:alert(1)'],
    [' javascript:alert(1)'],
    ['youtube.com/x'],
    [''],
    [null],
    [undefined],
  ])('từ chối: %s', (url) => {
    expect(isSafeExternalUrl(url)).toBe(false);
  });
});

describe('buildAppLinkMenuItems', () => {
  it('chuyển link hợp lệ thành mục menu external=true, icon Play cho YouTube', () => {
    const items = buildAppLinkMenuItems([
      { key: 'link-a', nameVi: 'Video', nameEn: 'Video EN', url: 'https://youtu.be/x', categoryId: 'guides' },
    ], 'vi');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: 'link-a',
      name: 'Video',
      url: 'https://youtu.be/x',
      external: true,
      defaultCategory: 'guides',
    });
  });

  it('dùng nameEn khi locale=en, rơi về nameVi nếu nameEn rỗng', () => {
    const items = buildAppLinkMenuItems([
      { key: 'link-a', nameVi: 'Video', nameEn: 'Video EN', url: 'https://a.vn', categoryId: 'guides' },
      { key: 'link-b', nameVi: 'Trang', nameEn: '', url: 'https://b.vn', categoryId: 'guides' },
    ], 'en');
    expect(items[0].name).toBe('Video EN');
    expect(items[1].name).toBe('Trang');
  });

  it('icon khác nhau cho youtube.com/youtu.be so với link thường', () => {
    const items = buildAppLinkMenuItems([
      { key: 'link-a', nameVi: 'A', url: 'https://youtube.com/watch?v=1', categoryId: 'guides' },
      { key: 'link-b', nameVi: 'B', url: 'https://a.vn', categoryId: 'guides' },
    ], 'vi');
    expect(items[0].icon).not.toBe(items[1].icon);
  });

  it('URL không an toàn (javascript:) bị lọc — KHÔNG sinh mục menu', () => {
    const items = buildAppLinkMenuItems([
      { key: 'link-bad', nameVi: 'Xấu', url: 'javascript:alert(1)', categoryId: 'guides' },
      { key: 'link-ok', nameVi: 'Tốt', url: 'https://a.vn', categoryId: 'guides' },
    ], 'vi');
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe('link-ok');
  });

  it('input không phải mảng -> trả về mảng rỗng', () => {
    expect(buildAppLinkMenuItems(null, 'vi')).toEqual([]);
    expect(buildAppLinkMenuItems(undefined, 'vi')).toEqual([]);
  });
});
