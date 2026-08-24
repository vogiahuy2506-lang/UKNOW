/**
 * Ba ô còn thiếu của bài "Bắt đầu với Founder AI — 4 bước"
 * (/huong-dan/getting-started). Bài đã có sẵn 11 ảnh từ trước.
 */
import {
  sidebarShot, highlight, hideVolatileChrome, settle, contentShot,
} from '../lib/shotHelpers.js';

export default {
  slug: 'getting-started',
  shots: [
    {
      name: 'toan-man-hinh-sau-dang-nhap',
      caption: 'toàn màn hình sau khi đăng nhập, khoanh đỏ thanh menu bên trái và thanh ngang trên cùng',
      async take(page, { baseURL }) {
        // Menu phải ở trạng thái MỞ RỘNG mới thấy chữ; mặc định app thu gọn.
        await page.goto(baseURL);
        await page.evaluate(() => {
          window.localStorage.setItem('founder_ai_sidebar_open', 'true');
        });
        await page.goto('/app');
        await page.locator('header').first().waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);

        await highlight(page.locator('aside').first());
        await highlight(page.locator('header').first());
        await page.waitForTimeout(200);

        // Chú thích đòi TOÀN màn hình, không phải một khối — chụp thẳng khung
        // nhìn thay vì cắt theo nội dung một phần tử.
        return { screenshot: async (options = {}) => page.screenshot(options) };
      },
    },
    {
      name: 'menu-ho-so-doanh-nghiep',
      caption: 'menu bên trái đang mở nhóm Cài đặt, khoanh đỏ mục "Hồ sơ doanh nghiệp"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'Cài đặt',
          itemName: 'Hồ sơ doanh nghiệp',
          baseURL,
        });
      },
    },
    {
      name: 'the-email-zalo',
      caption: 'đầu trang Quản lý kênh gửi, khoanh đỏ 2 thẻ Email / Zalo',
      async take(page) {
        await page.goto('/app/settings/channels');
        const emailTab = page.getByRole('button', { name: 'Email', exact: true }).first();
        await emailTab.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);

        await highlight(emailTab);
        const zaloTab = page.getByRole('button', { name: 'Zalo', exact: true }).first();
        if (await zaloTab.isVisible().catch(() => false)) await highlight(zaloTab);
        await page.waitForTimeout(200);

        // Hai thẻ nằm sát đỉnh <main>. Cắt ở 140 để dừng ngay dưới dòng mô tả —
        // rộng hơn thì thẻ "Danh sách email" bị xén ngang.
        return contentShot(page, page.locator('main').first(), { maxHeight: 140 });
      },
    },
  ],
};
