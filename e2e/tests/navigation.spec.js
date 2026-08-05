import { test, expect } from '@playwright/test';

const ROUTES = [
  { path: '/app', heading: /Tôi có thể giúp gì cho bạn/i },
  { path: '/app/reports', heading: /Báo cáo/i },
  { path: '/app/campaigns', heading: /Chiến dịch/i },
  { path: '/app/customers', heading: /Khách hàng/i },
  { path: '/app/settings/channels', heading: /Cài đặt email|Quản lý Workspace Zalo/i },
  { path: '/app/settings/templates', heading: /Thư viện Template/i },
];

// KHÔNG thêm /app/courses và /app/orders vào ROUTES ở trên.
// Hai trang đó gác bằng AdminUsernameRoute (frontend/src/App.jsx) — chỉ tài khoản
// username "admin" mới vào được. User E2E là "e2etest" nên thấy màn hình không có
// quyền, và bài smoke tìm tiêu đề sẽ luôn đỏ. Hành vi đúng được kiểm ở khối
// "Phân quyền theo username" bên dưới.
const ADMIN_ONLY_ROUTES = ['/app/courses', '/app/orders'];

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

test.describe('Phân quyền theo username', () => {
  for (const path of ADMIN_ONLY_ROUTES) {
    test(`GET ${path} → user thường thấy màn hình không có quyền`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle', { timeout: 20_000 });
      // Vẫn ở đúng URL (không đá về trang khác), nhưng nội dung là màn hình chặn.
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/')));
      await expect(
        page.getByText(/Không có quyền truy cập/i).first()
      ).toBeVisible({ timeout: 15_000 });
    });
  }
});
