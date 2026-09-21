/**
 * Ảnh minh hoạ cho bài "Marketplace: mua, bán và chia sẻ template"
 * (/huong-dan/marketplace).
 *
 * Marketplace không có trang riêng: nút trên thanh ngang mở một CỬA SỔ lớn phủ lên
 * trang đang đứng. Cửa sổ có đúng hai tab (Khám phá, Của tôi); nút "Đăng bài" mở
 * trình ba bước "Tạo Template mới". Chỉ mở xem, không bấm đăng.
 */
import { highlight, hideVolatileChrome, settle, contentShot } from '../lib/shotHelpers.js';

async function openMarketplace(page) {
  await page.goto('/app');
  await page.locator('aside').first().waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);
  await page.locator('header, [role="banner"]').first()
    .getByRole('button', { name: 'Marketplace' }).first().click();
  const dialog = page.locator('div.fixed.inset-0').filter({ hasText: 'Template & workflow' }).last();
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(1200);
  await hideVolatileChrome(page);
  return dialog;
}

export default {
  slug: 'marketplace',
  shots: [
    {
      name: 'nut-marketplace-tren-thanh-ngang',
      caption: 'thanh ngang trên cùng, khoanh đỏ nút "Marketplace"',
      async take(page) {
        await page.goto('/app');
        const bar = page.locator('header, [role="banner"]').first();
        await bar.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        await highlight(bar.getByRole('button', { name: 'Marketplace' }).first());
        await page.waitForTimeout(150);
        return bar;
      },
    },
    {
      name: 'cua-so-marketplace-hai-tab',
      caption: 'cửa sổ Marketplace, khoanh đỏ hai tab Khám phá và Của tôi',
      async take(page) {
        const dialog = await openMarketplace(page);
        await highlight(dialog.getByRole('button', { name: 'Khám phá', exact: true }).first());
        await highlight(dialog.getByRole('button', { name: 'Của tôi', exact: true }).first());
        await page.waitForTimeout(200);
        const panel = dialog.locator('> div').last();
        return contentShot(page, panel, { maxHeight: 360 });
      },
    },
    {
      name: 'tao-template-moi-chon-loai',
      caption: 'cửa sổ Tạo Template mới ở bước Chọn loại, khoanh đỏ ba bước Chọn loại / Thông tin / Giá bán và hàng nút Chiến dịch, Chatbot, Landing Page',
      localOnly: true,
      async take(page) {
        const dialog = await openMarketplace(page);
        await dialog.getByRole('button', { name: 'Đăng bài' }).first().click();
        const wizard = page.locator('div.fixed.inset-0').filter({ hasText: 'Tạo Template mới' }).last();
        await wizard.waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForTimeout(1200);
        await hideVolatileChrome(page);

        // Hàng ba bước: bám vào chữ "Giá bán" rồi lấy khối bao cả ba.
        const steps = wizard.getByText('Giá bán', { exact: true }).first()
          .locator('xpath=ancestor::div[contains(., "Chọn loại") and contains(., "Thông tin")][1]');
        await highlight(steps);
        const typeRow = wizard.getByRole('button', { name: 'Landing Page' }).first().locator('xpath=..');
        await highlight(typeRow);
        await page.waitForTimeout(200);
        return contentShot(page, wizard.locator('> div').last(), { maxHeight: 640 });
      },
    },
  ],
};
