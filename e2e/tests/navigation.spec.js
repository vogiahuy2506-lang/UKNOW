/**
 * Navigation smoke — sau khi login, kiểm tra rằng các route chính
 * KHÔNG bị crash/blank và render tiêu đề chính xác.
 *
 * Không deep test logic — chỉ đảm bảo:
 *   - HTTP 200
 *   - URL đúng
 *   - Không hiển thị Error Boundary fallback
 *   - Render header/heading đặc trưng của trang
 */
import { test, expect } from '@playwright/test';

const ROUTES = [
  { path: '/app', heading: /Campaign Dashboard|Tổng quan insight/i },
  { path: '/app/campaigns', heading: /Quản lý quy trình/i },
  { path: '/app/customers', heading: /Khách hàng/i },
  { path: '/app/courses', heading: /Quản lý khóa học/i },
  { path: '/app/orders', heading: /Đơn hàng/i },
  { path: '/app/settings/channels', heading: /Cài đặt email|Quản lý Workspace Zalo/i },
  { path: '/app/settings/templates', heading: /Thư viện Template/i },
];

test.describe('Navigation smoke', () => {
  for (const route of ROUTES) {
    test(`render ${route.path}`, async ({ page }) => {
      const response = await page.goto(route.path);
      expect(response?.status() ?? 200).toBeLessThan(400);

      await expect(page).toHaveURL(new RegExp(route.path.replace(/\//g, '\\/')));

      await expect(page.locator('aside').first()).toBeVisible();

      const errorBoundary = page.getByText(/Đã có lỗi xảy ra|Something went wrong/i);
      await expect(errorBoundary).toHaveCount(0);

      const heading = page.locator('h1, h2').filter({ hasText: route.heading }).first();
      await expect(heading).toBeVisible({ timeout: 10_000 });
    });
  }

  test('back/forward navigation hoạt động', async ({ page }) => {
    await page.goto('/app');
    await page.goto('/app/customers');
    await expect(page).toHaveURL(/\/app\/customers/);

    await page.goBack();
    await expect(page).toHaveURL(/\/app(\/|$)/);

    await page.goForward();
    await expect(page).toHaveURL(/\/app\/customers/);
  });
});
