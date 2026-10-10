/**
 * Ảnh minh hoạ cho bài "Nối chatbot với Telegram và WhatsApp" (/huong-dan/chatbot-telegram-whatsapp).
 *
 * Hai ảnh sau (hộp QR, công tắc chatbot) cần phiên Telegram thật nên dựng bằng `page.route` trả JSON mẫu đúng hình dạng API
 * (localOnly) — KHÔNG tạo phiên Telegram nào.
 */
import { createRequire } from 'node:module';
import { highlight, hideVolatileChrome, settle, contentShot } from '../lib/shotHelpers.js';

// `qrcode` có ở backend/ (không có ở e2e/): dùng dựng mã QR MẪU cho ảnh hộp quét — không phải mã đăng nhập thật.
const requireFromRepo = createRequire(import.meta.url);

const STUDIO_PATH = '/app/chatbot-studio';
const json = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });

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
    {
      // Hộp quét QR do máy chủ Telegram cấp mã; KHÔNG tạo phiên Telegram thật — chặn ba lời gọi API và trả mã QR MẪU
      // (encode một chuỗi vô nghĩa, quét không đăng nhập được gì), trạng thái "đang chờ quét".
      name: 'hop-quet-qr-telegram',
      caption: 'hộp Quét mã QR để kết nối Telegram, bên cạnh là ba bước hướng dẫn',
      localOnly: true,
      async take(page) {
        const QRCode = requireFromRepo('../../../backend/node_modules/qrcode');
        const dataUrl = await QRCode.toDataURL('https://example.invalid/mau-khong-phai-ma-dang-nhap', { margin: 1, width: 400 });
        const qrImageBase64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        await page.route('**/api/ai/chatbot/telegram-accounts/init', (route) => route.fulfill(json({
          sessionId: 'mau-khong-co-that', qrImageBase64, expiresAt: Date.now() + 118_000,
        })));
        await page.route('**/api/ai/chatbot/telegram-accounts/status/**', (route) => route.fulfill(json({ status: 'awaiting_scan' })));
        await page.route('**/api/ai/chatbot/telegram-accounts/login/**', (route) => route.fulfill(json({})));
        await page.route('**/api/ai/chatbot/personal-account-status/telegram', (route) => route.fulfill(json({ canStartLogin: true, hasSecret: true, stubOnly: false })));
        await page.route('**/api/ai/chatbot/personal-accounts-health', (route) => route.fulfill(json({
          channels: { telegram: { canStartLogin: true, hasSecret: true, stubOnly: false } }, allHealthy: true, checkedAt: new Date().toISOString(),
        })));
        await page.goto('/app/settings/channels');
        await page.locator('main').getByRole('button', { name: 'Telegram', exact: true }).first().click();
        const scan = page.getByRole('button', { name: 'Quét QR', exact: true }).first();
        await scan.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await scan.click();
        await page.getByText('Đang chờ bạn quét QR…').first().waitFor({ state: 'visible', timeout: 20_000 });
        await page.getByAltText('QR Telegram').waitFor({ state: 'visible', timeout: 10_000 });
        await page.waitForTimeout(500);
        await hideVolatileChrome(page);
        // Khung trắng của hộp (con của lớp phủ). Hộp cao hơn khung nhìn thì Playwright tự ghép cuộn bên trong lớp phủ nên
        // nới khung nhìn cho hộp lọt trọn.
        const card = page.locator('div.fixed.inset-0').filter({ hasText: 'Quét mã QR để kết nối' }).last().locator(':scope > div').first();
        const viewport = page.viewportSize();
        await page.setViewportSize({ width: viewport.width, height: 1100 });
        await page.waitForTimeout(300);
        return {
          screenshot: async (options = {}) => {
            try { return await card.screenshot(options); } finally { await page.setViewportSize(viewport); }
          },
        };
      },
    },
    {
      // Studio: chọn chatbot, bấm ô Telegram ở cột "Đưa chatbot tới khách", khoanh công tắc của một tài khoản. DB e2e không có
      // tài khoản Telegram đã liên kết (và cấm tạo phiên thật) nên trả danh sách MẪU đúng hình dạng
      // `GET /ai/chatbot/telegram-accounts/chatbot`. CHỈ khoanh, KHÔNG gạt công tắc.
      name: 'cong-tac-chatbot-telegram',
      caption: 'cột Đưa chatbot tới khách, đã bấm ô Telegram, khoanh đỏ công tắc bật chatbot cho một tài khoản',
      localOnly: true,
      async take(page) {
        await page.route('**/api/ai/chatbot/telegram-accounts/chatbot**', (route) => route.fulfill(json({
          items: [
            { id: 301, first_name: 'Minh', last_name: 'Tuấn', username: 'minhtuan_banhang', phone: null, telegram_user_id: '700000001', is_active: true, is_loaded: true, chatbot_enabled: true, chatbot_enabled_dm: true, chatbot_enabled_group: false },
            { id: 302, first_name: 'Thu', last_name: 'Hà', username: 'thuha_hotro', phone: null, telegram_user_id: '700000002', is_active: true, is_loaded: true, chatbot_enabled: false, chatbot_enabled_dm: true, chatbot_enabled_group: false },
          ],
        })));
        await page.goto(STUDIO_PATH);
        await page.getByRole('button', { name: /^Cấu hình$/ }).first().waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        const withDocs = page.getByText(/^Trợ lý CSKH/).first();
        if (await withDocs.isVisible().catch(() => false)) {
          await withDocs.click({ timeout: 5_000 }).catch(() => {});
          await page.waitForTimeout(1200);
        }
        const tile = page.getByRole('button', { name: /Telegram/ }).first();
        await tile.waitFor({ state: 'visible', timeout: 15_000 });
        await tile.click();
        const toggle = page.getByRole('switch', { name: /chatbot/i }).first();
        await toggle.waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForTimeout(500);
        await hideVolatileChrome(page);
        // Lớp phủ mặc định làm mờ nền: bỏ mờ để cột "Đưa chatbot tới khách" phía sau còn ĐỌC được.
        await page.addStyleTag({ content: 'div.fixed.inset-0 { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; background: rgba(15, 23, 42, 0.18) !important; }' });
        await highlight(toggle);
        await page.waitForTimeout(200);
        // Cả khung nhìn: cột "Đưa chatbot tới khách" phía sau và hộp Telegram phía trước.
        return { screenshot: (options = {}) => page.screenshot(options) };
      },
    },
  ],
};
