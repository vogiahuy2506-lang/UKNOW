/**
 * Ảnh minh hoạ cho bài "Gửi nhanh" (/huong-dan/quick-send).
 *
 * 5/6 ô của bài đã có ảnh chèn tay (alt "image.png"). Sheet này làm ô bước 2 — giao diện đổi từ
 * "Mẫu tin" (chỉ chọn mẫu) sang "Nội dung" (chọn mẫu có sẵn HOẶC soạn nội dung mới) nên ảnh cũ bị bỏ
 * ở lô vá 28/09/2026.
 *
 * Cần `E2E_SEED_ALL=1` (có tài khoản Zalo + mẫu Zalo). CHỈ bấm "Tiếp theo" để sang bước 2 — không
 * sang bước 3, không bấm gửi.
 */
import { hideVolatileChrome, settle, contentShot } from '../lib/shotHelpers.js';

export default {
  slug: 'quick-send',
  shots: [
    {
      name: 'buoc-noi-dung',
      caption: 'bước Nội dung, hai lựa chọn "Chọn mẫu có sẵn" và "Soạn nội dung mới" ở đầu, danh sách mẫu Zalo đang hiện bên dưới',
      localOnly: true,
      async take(page) {
        await page.goto('/app/quick-send');
        await settle(page);

        await page.getByRole('button', { name: 'Zalo', exact: true }).first().click();
        await page.waitForTimeout(800);

        // Chọn tài khoản Zalo đầu tiên nếu trang chưa tự chọn.
        const accountRadio = page.locator('input[name="zaloAccount"]').first();
        if (await accountRadio.isVisible().catch(() => false)) await accountRadio.check().catch(() => {});

        const box = page.locator('main textarea').first();
        await box.waitFor({ state: 'visible', timeout: 15_000 });
        await box.fill('0901234567\n0912345678');
        await page.waitForTimeout(500);

        const next = page.getByRole('button', { name: /^Tiếp/ }).first();
        await next.click();
        await page.getByText('Soạn nội dung mới').first().waitFor({ state: 'visible', timeout: 15_000 });
        await settle(page);
        await hideVolatileChrome(page);

        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 760 });
      },
    },
  ],
};
