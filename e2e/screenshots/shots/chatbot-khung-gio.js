/**
 * Ảnh minh hoạ cho bài "Chatbot: khung giờ hoạt động, giới hạn trả lời và AI viết hộ"
 * (/huong-dan/chatbot-khung-gio).
 *
 * Ba ảnh đầu dùng chatbot mẫu đã được `ensureChatbotHoursDemo` chỉnh khung giờ hai ca + trần lượt.
 * Ảnh thứ tư ("AI viết hộ") cần AI chạy thật — máy thử phải có GEMINI_API_KEY trong e2e/.env.test.
 * Chỉ mở xem, KHÔNG bấm "Lưu cấu hình".
 */
import {
  highlight, hideVolatileChrome, settle, contentShot, enclosingSection, tallViewportShot, paddedShot,
} from '../lib/shotHelpers.js';
import { ensureChatbotHoursDemo } from '../lib/shotFixtures.js';

const STUDIO_PATH = '/app/chatbot-studio';

async function openStudio(page) {
  const chatbot = await ensureChatbotHoursDemo();
  await page.goto(STUDIO_PATH);
  const configButton = page.getByRole('button', { name: /^Cấu hình$/ }).first();
  await configButton.waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);
  await hideVolatileChrome(page);
  return { chatbot, configButton };
}

/** Mở hộp "Cấu hình chatbot" rồi nhảy tới mục Giới hạn. */
async function openLimitsSection(page) {
  const { configButton } = await openStudio(page);
  await configButton.click();
  const dialog = page.locator('div.fixed.inset-0').filter({ hasText: 'Cấu hình chatbot' }).last();
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  await dialog.getByRole('button', { name: 'Giới hạn', exact: true }).first().click();
  await dialog.getByText('Khung giờ hoạt động', { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(800);
  await hideVolatileChrome(page);
  return dialog;
}

export default {
  slug: 'chatbot-khung-gio',
  shots: [
    {
      name: 'nut-cau-hinh-chatbot',
      caption: 'trang Tạo AI Chatbot, đã chọn một chatbot, khoanh đỏ chỗ mở phần Cấu hình',
      localOnly: true,
      async take(page) {
        const { configButton } = await openStudio(page);
        await highlight(configButton);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 330 });
      },
    },
    {
      name: 'khung-gio-hai-ca',
      caption: 'khối Khung giờ hoạt động đang chọn "Chỉ trả lời trong khung giờ", có hai khung giờ sáng và chiều',
      localOnly: true,
      async take(page) {
        return tallViewportShot(page, 2400, async () => {
          const dialog = await openLimitsSection(page);
          const heading = dialog.getByText('Khung giờ hoạt động', { exact: true }).first();
          await heading.scrollIntoViewIfNeeded();
          await page.waitForTimeout(400);
          const card = await enclosingSection(page, heading, { minWidth: 500 });
          return paddedShot(page, card, { pad: 10 });
        });
      },
    },
    {
      name: 'gioi-han-luot-tra-loi',
      caption: 'khối Giới hạn lượt chatbot trả lời, đang bật trần Mỗi giờ và Mỗi ngày',
      localOnly: true,
      async take(page) {
        return tallViewportShot(page, 2400, async () => {
          const dialog = await openLimitsSection(page);
          const heading = dialog.getByText('Giới hạn lượt chatbot trả lời', { exact: true }).first();
          await heading.scrollIntoViewIfNeeded();
          await page.waitForTimeout(400);
          const card = await enclosingSection(page, heading, { minWidth: 500 });
          return paddedShot(page, card, { pad: 10 });
        });
      },
    },
  ],
};
