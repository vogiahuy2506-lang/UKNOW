import { test, expect } from '@playwright/test';

test.describe('Campaigns UI', () => {
  test('nút Tạo mở modal rồi Hủy', async ({ page }) => {
    await page.goto('/app/campaigns');
    await expect(page.getByRole('heading', { name: 'Chiến dịch', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Tạo', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tạo chiến dịch mới' })).toBeVisible();
    await page.getByRole('button', { name: 'Hủy' }).first().click();
    await expect(page.getByRole('heading', { name: 'Tạo chiến dịch mới' })).not.toBeVisible();
  });
});

test.describe.serial('Tạo + kích hoạt chiến dịch', () => {
  const name = `E2E-${Date.now()}`;

  test('tạo email → vào builder', async ({ page }) => {
    await page.goto('/app/campaigns');
    await page.getByRole('button', { name: 'Tạo', exact: true }).click();
    await page.getByPlaceholder('Nhập tên chiến dịch...').fill(name);
    await page.getByRole('button', { name: 'Tạo và thiết kế' }).click();
    await page.waitForURL(/\/app\/campaigns\/\d+\/builder/, { timeout: 25_000 });
    await expect(page).toHaveURL(/\/builder/);
  });

  /**
   * Chiến dịch vừa tạo CHƯA có node nào — kích hoạt nó phải bị TỪ CHỐI.
   *
   * Trước 30/08/2026 test này khẳng định điều ngược lại (kích hoạt thành công), và đó chính là
   * lỗ hổng đã gây sự cố 15/08: 15 chiến dịch rỗng node của 11 khách hàng thật được kích hoạt,
   * chạy thất bại mỗi ngày suốt 15 ngày mà không ai được báo. Đợt A thêm preflight `NO_SEND_NODE`
   * (`backend/src/services/campaign/campaignPreflight.service.js:50-61`) để chặn.
   *
   * Nói cách khác: test đỏ từ 30/08 KHÔNG phải lỗi sản phẩm — là test còn khẳng định hành vi cũ.
   */
  test('kích hoạt chiến dịch rỗng node → bị từ chối', async ({ page }) => {
    await page.goto('/app/campaigns');
    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('td').last().locator('button').first().click();
    await page.getByRole('button', { name: 'Kích hoạt' }).click();

    // Hai tầng chặn khác nhau, thông điệp khác nhau — nhận cả hai:
    //  - publish (409): 'Không thể kích hoạt chiến dịch khi chưa có node nào'
    //    (campaignCrud.service.js:685) — chặn campaign KHÔNG CÓ NODE NÀO.
    //  - preflight tầng chạy (400): 'Chiến dịch không có node gửi tin nhắn nào.'
    //    (campaignPreflight.service.js:57) — chặn campaign CÓ node nhưng không có node gửi.
    await expect(
      page.getByText(/chưa có node nào|không có node gửi tin nhắn/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Và trạng thái KHÔNG được đổi sang đang hoạt động.
    await expect(row.getByText('Đang hoạt động')).toHaveCount(0);
  });
});
