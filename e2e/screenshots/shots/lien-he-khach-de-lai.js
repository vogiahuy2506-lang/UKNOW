/**
 * Ảnh minh hoạ cho bài "Liên hệ khách để lại trong chat và thư tổng hợp"
 * (/huong-dan/lien-he-khach-de-lai).
 *
 * Sổ liên hệ do cron quét tin nhắn sinh ra; ở máy mình cron không chạy nên hai ảnh
 * có sổ tự nêm vài dòng mẫu (`ensureContactAlertsDemo`). Chỉ chạy ở máy mình.
 */
import { highlight, hideVolatileChrome, settle, contentShot } from '../lib/shotHelpers.js';
import { ensureContactAlertsDemo } from '../lib/shotFixtures.js';

const INBOX_PATH = '/app/settings/inbox';

async function openContactTab(page) {
  await ensureContactAlertsDemo();
  await page.goto(INBOX_PATH);
  const tab = page.getByRole('button', { name: /Liên hệ để lại/ }).first();
  await tab.waitFor({ state: 'visible', timeout: 30_000 });
  await tab.click();
  await page.getByText('Liên hệ khách để lại', { exact: true }).first()
    .waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(1200);
  await settle(page);
  await hideVolatileChrome(page);
}

export default {
  slug: 'lien-he-khach-de-lai',
  shots: [
    {
      name: 'tab-lien-he-de-lai',
      caption: 'trang Lịch sử trò chuyện, khoanh đỏ tab "Liên hệ để lại"',
      async take(page) {
        await page.goto(INBOX_PATH);
        const tab = page.getByRole('button', { name: /Liên hệ để lại/ }).first();
        await tab.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        await highlight(tab);
        await page.waitForTimeout(150);
        return contentShot(page, page.locator('main').first(), { maxHeight: 300 });
      },
    },
    {
      name: 'so-lien-he-ba-nut',
      caption: 'sổ Liên hệ khách để lại với vài dòng, khoanh đỏ ba nút Sao chép, Mở hội thoại, Đã liên hệ',
      localOnly: true,
      async take(page) {
        // Ở khung 1440px, cột danh sách hội thoại bên trái chiếm chỗ nên bảng bị cuộn
        // ngang và nút "Đã liên hệ" nằm ngoài màn hình. Nới khung cho bảng hiện trọn.
        const viewport = page.viewportSize();
        await page.setViewportSize({ width: 2000, height: 900 });
        try {
          await openContactTab(page);
          const row = page.locator('main table tbody tr').first();
          await row.waitFor({ state: 'visible', timeout: 30_000 });
          const copy = row.locator('button').first();                        // nút biểu tượng cạnh SĐT
          const open = row.getByRole('button', { name: /Mở hội thoại/ }).first();
          const done = row.getByRole('button', { name: /Đã liên hệ/ }).first();
          for (const [label, button] of [['Sao chép', copy], ['Mở hội thoại', open], ['Đã liên hệ', done]]) {
            if (!(await button.isVisible().catch(() => false))) throw new Error(`Không thấy nút "${label}" ở dòng đầu của sổ`);
            await highlight(button);
          }
          await page.waitForTimeout(200);

          // Chỉ chụp khung sổ bên phải, bỏ cột danh sách hội thoại.
          const panel = page.getByText('Liên hệ khách để lại', { exact: true }).first()
            .locator('xpath=ancestor::div[.//table][1]');
          const box = await panel.boundingBox();
          const table = await panel.locator('table').first().boundingBox();
          // Cắt ngay dưới dòng cuối của bảng — khung sổ cao hết màn hình, để nguyên thì
          // nửa dưới ảnh là nền trắng.
          const clip = { x: box.x, y: box.y, width: box.width, height: (table.y + table.height) - box.y + 24 };
          return {
            screenshot: async (options = {}) => {
              try {
                return await page.screenshot({ ...options, clip });
              } finally {
                await page.setViewportSize(viewport);
              }
            },
          };
        } catch (error) {
          await page.setViewportSize(viewport);
          throw error;
        }
      },
    },
    {
      name: 'cai-dat-email-va-thu-tong-hop',
      caption: 'phần cài đặt phía trên sổ, khoanh đỏ công tắc nhận email và ô chọn tần suất thư tổng hợp',
      localOnly: true,
      async take(page) {
        await openContactTab(page);
        const emailSwitch = page.getByText('Nhận email khi khách để lại liên hệ', { exact: false }).first();
        const digest = page.getByText('Thư tổng hợp hội thoại AI', { exact: false }).first();
        await highlight(emailSwitch.locator('xpath=..'));
        await highlight(digest.locator('xpath=..'));
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 330 });
      },
    },
  ],
};
