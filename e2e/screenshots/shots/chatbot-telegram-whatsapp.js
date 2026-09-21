/**
 * Ảnh minh hoạ cho bài "Nối chatbot với Telegram và WhatsApp" (/huong-dan/chatbot-telegram-whatsapp).
 *
 * Mới có ảnh đầu (hai tab trên trang Quản lý kênh gửi). Hai ảnh còn lại cần phiên Telegram thật (mã QR do
 * máy chủ Telegram cấp, và một tài khoản đã nối để có công tắc bật chatbot) — máy thử không dựng được.
 */
import { highlight, hideVolatileChrome, settle, contentShot } from '../lib/shotHelpers.js';

export default {
  slug: 'chatbot-telegram-whatsapp',
  shots: [
    {
      name: 'hai-tab-whatsapp-telegram',
      caption: 'trang Quản lý kênh gửi, khoanh đỏ hai tab WhatsApp và Telegram',
      async take(page) {
        await page.goto('/app/settings/channels');
        const telegram = page.locator('main').getByRole('button', { name: 'Telegram', exact: true }).first();
        await telegram.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        await highlight(page.locator('main').getByRole('button', { name: 'WhatsApp', exact: true }).first());
        await highlight(telegram);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 260 });
      },
    },
  ],
};
