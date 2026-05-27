import { test, expect } from '@playwright/test';

const ROUTES = [
  { path: '/app', heading: /Báo cáo/i },
  { path: '/app/campaigns', heading: /Chiến dịch/i },
  { path: '/app/customers', heading: /Khách hàng/i },
  { path: '/app/courses', heading: /Quản lý khóa học/i },
  { path: '/app/orders', heading: /Đơn hàng/i },
  { path: '/app/settings/channels', heading: /Cài đặt email|Quản lý Workspace Zalo/i },
  { path: '/app/settings/templates', heading: /Thư viện Template/i },
];

test.describe('Navigation smoke', () => {
  for (const r of ROUTES) {
    test(`GET ${r.path}`, async ({ page }) => {
      const res = await page.goto(r.path);
      expect(res?.status() ?? 200).toBeLessThan(400);
      // Wait for auth/me + all data requests to settle before asserting layout
      await page.waitForLoadState('networkidle', { timeout: 20_000 });
      await expect(page).toHaveURL(new RegExp(r.path.replace(/\//g, '\\/')));
      await expect(page.locator('aside').first()).toBeVisible({ timeout: 15_000 });
      await expect(
        page.locator('h1, h2').filter({ hasText: r.heading }).first()
      ).toBeVisible({ timeout: 15_000 });
    });
  }
});
