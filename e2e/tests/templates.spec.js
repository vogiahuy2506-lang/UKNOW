import { test, expect } from '@playwright/test';

test.describe('Email template', () => {
  test('tạo template tối thiểu', async ({ page }) => {
    const tplName = `E2E-Tpl-${Date.now()}`;
    await page.goto('/app/settings/templates');
    await expect(page.getByRole('heading', { name: /Thư viện Template/i })).toBeVisible();

    await page.getByRole('button', { name: 'Tạo template mới' }).first().click();
    await expect(page.getByRole('heading', { name: 'Tạo template mới' })).toBeVisible();

    // Từ PR-M2 dải "Thông tin mẫu" mặc định ĐÓNG (ô tên / tiêu đề bị ẩn): mở ra rồi mới điền.
    await page.getByRole('button', { name: /Thông tin mẫu/ }).click();
    await page.getByPlaceholder('Ví dụ: Chào mừng khách hàng mới').fill(tplName);
    await page.getByPlaceholder('Ví dụ: Chào mừng {{name}} đến với Founder AI!').fill('E2E subject');

    await page.getByPlaceholder('<!-- Bắt đầu viết mã HTML của bạn tại đây... -->').fill('<p>E2E body</p>');

    // Nút gửi nằm ở thanh trên của modal, NGOÀI <form> (nối bằng thuộc tính form=, từ 6d294fbf 14/10).
    await page.locator('button[type="submit"][form="email-template-editor-form"]').click();

    await expect(page.getByText(/Tạo template thành công/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(tplName).first()).toBeVisible({ timeout: 10_000 });
  });
});
