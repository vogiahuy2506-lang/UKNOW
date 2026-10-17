import { test, expect } from '@playwright/test';

test.describe('Campaigns UI', () => {
  test('nút Tạo mở modal rồi Hủy', async ({ page }) => {
    await page.goto('/app/campaigns');
    await expect(page.getByRole('heading', { name: 'Chiến dịch', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Tạo', exact: true }).click();
    // Từ 17/10/2026 (tạo chiến dịch từng bước) nút Tạo mở hộp chọn cách tạo trước; "Sơ đồ khối" mới tới modal cũ.
    await page.getByTestId('create-method-blocks').click();
    await expect(page.getByRole('heading', { name: 'Tạo chiến dịch mới' })).toBeVisible();
    await page.getByRole('button', { name: 'Hủy' }).first().click();
    await expect(page.getByRole('heading', { name: 'Tạo chiến dịch mới' })).not.toBeVisible();
  });

  test('nút Tạo → "Từng bước" mở trang tạo chiến dịch từng bước', async ({ page }) => {
    await page.goto('/app/campaigns');
    await page.getByRole('button', { name: 'Tạo', exact: true }).click();
    await page.getByTestId('create-method-step').click();
    await page.waitForURL(/\/app\/campaigns\/simple/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Bạn muốn gửi qua đâu?' })).toBeVisible();
  });
});

test.describe.serial('Tạo + kích hoạt chiến dịch', () => {
  const name = `E2E-${Date.now()}`;

  test('tạo email → vào builder', async ({ page }) => {
    await page.goto('/app/campaigns');
    await page.getByRole('button', { name: 'Tạo', exact: true }).click();
    await page.getByTestId('create-method-blocks').click();
    await page.getByPlaceholder('Nhập tên chiến dịch...').fill(name);
    await page.getByRole('button', { name: 'Tạo và thiết kế' }).click();
    // Tạo trống bằng trình dựng: chiến dịch mở thẳng ở tab Sơ đồ khối (`/app/campaigns/:id?tab=flow`).
    await page.waitForURL(/\/app\/campaigns\/\d+\?tab=flow/, { timeout: 25_000 });
    await expect(page.getByTestId('campaign-tab-flow')).toHaveAttribute('aria-selected', 'true');
  });

  /**
   * PR-3 16/09/2026 — bỏ nút "Kích hoạt" trên trang danh sách. Chiến dịch nháp giờ tự kích hoạt
   * khi bấm "Chạy ngay" trong trình dựng (campaignCrud.service.js:685 + campaignPreflight.service.js:57).
   * Test khẳng định: chiến dịch nháp rỗng node → bấm "Chạy ngay" → bị từ chối.
   *
   * Lịch sử: trước 30/08/2026 test khẳng định ngược lại (kích hoạt thành công) — chính là lỗ hổng
   * đã gây sự cố 15/08 (15 chiến dịch rỗng node của 11 KH thật chạy thất bại 15 ngày không ai biết).
   */
  test('kích hoạt chiến dịch rỗng node → bị từ chối', async ({ page }) => {
    await page.goto('/app/campaigns');
    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Vào builder từ tên chiến dịch.
    await row.getByRole('link', { name }).click();
    // Từ 17/10/2026 chi tiết chiến dịch là một trang hai tab; mở chiến dịch đã có vào tab Thiết lập trước (chiến dịch rỗng node
    // hiện trạng thái rỗng) → sang tab Sơ đồ khối. Nút "Chạy ngay" nằm ở thanh trên, dùng được ở cả hai tab.
    await page.waitForURL(/\/app\/campaigns\/\d+$/, { timeout: 25_000 });
    await expect(page.getByTestId('settings-empty')).toBeVisible({ timeout: 25_000 });
    await page.getByTestId('campaign-tab-flow').click();
    await page.waitForURL(/\/app\/campaigns\/\d+\?tab=flow/, { timeout: 25_000 });

    // Bấm "Chạy ngay" trong trình dựng -> mở modal xác nhận.
    await page.getByRole('button', { name: 'Chạy ngay' }).click();
    await expect(page.getByText('Xác nhận chạy chiến dịch')).toBeVisible({ timeout: 10_000 });

    // Bấm "Xác nhận chạy" trong modal -> lúc này mới gọi API runCampaign, server trả lỗi.
    await page.getByRole('button', { name: 'Xác nhận chạy' }).click();

    // Hai tầng chặn khác nhau, thông điệp khác nhau — nhận cả hai:
    //  - publish (409): 'Không thể kích hoạt chiến dịch khi chưa có node nào'
    //    (campaignCrud.service.js:685) — chặn campaign KHÔNG CÓ NODE NÀO.
    //  - preflight tầng chạy (400): 'Chiến dịch không có node gửi tin nhắn nào.'
    //    (campaignPreflight.service.js:57) — chặn campaign CÓ node nhưng không có node gửi.
    await expect(
      page.getByText(/chưa có node nào|không có node gửi tin nhắn/i).first()
    ).toBeVisible({ timeout: 15_000 });

    // Quay lại trang danh sách để xác nhận trạng thái KHÔNG đổi sang đang hoạt động.
    await page.goto('/app/campaigns');
    const rowAfter = page.locator('tr', { hasText: name });
    await expect(rowAfter).toBeVisible({ timeout: 15_000 });
    await expect(rowAfter.getByText('Đang hoạt động')).toHaveCount(0);
  });
});
