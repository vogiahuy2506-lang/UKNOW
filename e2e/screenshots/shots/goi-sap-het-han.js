/**
 * Ảnh minh hoạ cho bài "Gói sắp hết hạn: hệ thống nhắc thế nào, hết hạn thì sao"
 * (/huong-dan/goi-sap-het-han).
 *
 * Ba ảnh cần ba trạng thái của CÙNG một tài khoản: còn 2 ngày, vừa bấm "Để sau",
 * và đã hết hạn quá ân hạn. Sheet này tự chỉnh `subscription_expires_at` của tài
 * khoản đang chụp qua DB rồi TRẢ LẠI sau mỗi ảnh — để sót trạng thái "sắp hết hạn"
 * thì mọi sheet chạy sau đều bị hộp thoại này che mất. Chỉ chạy ở máy mình.
 */
import { highlight, hideVolatileChrome, settle, contentShot } from '../lib/shotHelpers.js';
import { withDb } from '../lib/shotFixtures.js';

const USERNAME = process.env.HELP_SHOT_USERNAME || 'e2etest';

async function setExpiry(intervalSql) {
  await withDb((db) => db.query(
    `UPDATE users SET subscription_expires_at = NOW() + ($1)::interval WHERE username = $2`,
    [intervalSql, USERNAME],
  ));
}

/** Trả gói về còn dài hạn. Gọi trong `finally` của MỌI ảnh. */
const restoreExpiry = () => setExpiry('300 days');

/** Bọc một ảnh để hạn gói luôn được trả lại, kể cả khi bước chụp ném lỗi. */
function restoringShot(locatorOrShot) {
  return {
    screenshot: async (options = {}) => {
      try {
        return await locatorOrShot.screenshot(options);
      } finally {
        await restoreExpiry();
      }
    },
  };
}

async function openExpiryModal(page) {
  await setExpiry('2 days 3 hours');
  // Cờ "đã bấm Để sau" nằm trong sessionStorage — xoá đi cho chắc rồi tải lại.
  await page.goto('/app');
  await page.evaluate(() => window.sessionStorage.clear());
  await page.goto('/app');
  const dialog = page.locator('.modal-content').filter({ hasText: 'Gói của bạn sắp hết hạn' }).first();
  await dialog.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(600);
  await hideVolatileChrome(page);
  return dialog;
}

export default {
  slug: 'goi-sap-het-han',
  shots: [
    {
      name: 'hop-thoai-sap-het-han',
      caption: 'hộp thoại Gói của bạn sắp hết hạn, khoanh đỏ số ngày còn lại và nút Nâng cấp ngay',
      localOnly: true,
      async take(page) {
        try {
          const dialog = await openExpiryModal(page);
          // "sẽ hết hạn sau 2 ngày nữa" nằm giữa câu mô tả — khoanh cả câu.
          await highlight(dialog.locator('p').filter({ hasText: /hết hạn sau \d+ ngày/ }));
          await highlight(dialog.getByRole('button', { name: 'Nâng cấp ngay' }));
          await page.waitForTimeout(200);
          return restoringShot(dialog);
        } catch (error) {
          await restoreExpiry();
          throw error;
        }
      },
    },
    {
      name: 'sau-khi-bam-de-sau',
      caption: 'sau khi bấm Để sau, menu bên trái và trang đang mở vẫn dùng được bình thường',
      localOnly: true,
      async take(page, { baseURL }) {
        try {
          await page.goto(baseURL);
          await page.evaluate(() => window.localStorage.setItem('founder_ai_sidebar_open', 'true'));
          const dialog = await openExpiryModal(page);
          await dialog.getByRole('button', { name: 'Để sau' }).click();
          await dialog.waitFor({ state: 'hidden', timeout: 15_000 });
          await page.goto('/app/campaigns');
          await page.locator('main table, main [class*="card"]').first().waitFor({ state: 'visible', timeout: 30_000 });
          await settle(page);
          await hideVolatileChrome(page);
          return restoringShot({
            screenshot: (options = {}) => page.screenshot({
              ...options,
              clip: { x: 0, y: 0, width: 1440, height: 620 },
            }),
          });
        } catch (error) {
          await restoreExpiry();
          throw error;
        }
      },
    },
    {
      name: 'tong-quan-goi-da-het-han',
      caption: 'trang Tổng quan gói khi gói đã hết hạn, khoanh đỏ dòng báo gửi tin và AI tạm dừng',
      localOnly: true,
      async take(page) {
        try {
          await setExpiry('-20 days');
          await page.goto('/app');
          await page.evaluate(() => window.sessionStorage.clear());
          await page.goto('/app/billing');
          // Hộp thoại "Đã hết hạn" che trang — đóng đi rồi mới chụp trang.
          // (`isVisible()` không chờ; phải `waitFor` thì mới bắt được hộp thoại hiện trễ.)
          const expired = page.locator('.modal-content').filter({ hasText: 'Gói của bạn đã hết hạn' }).first();
          await expired.waitFor({ state: 'visible', timeout: 20_000 });
          await expired.getByRole('button', { name: 'Để sau' }).click();
          await expired.waitFor({ state: 'hidden', timeout: 15_000 });
          const notice = page.locator('main').getByText(/tạm dừng|tạm ngưng/i).first();
          await notice.waitFor({ state: 'visible', timeout: 30_000 });
          await settle(page);
          await hideVolatileChrome(page);
          await highlight(notice);
          await page.waitForTimeout(200);
          return restoringShot(await contentShot(page, page.locator('main').first(), { maxHeight: 520 }));
        } catch (error) {
          await restoreExpiry();
          throw error;
        }
      },
    },
  ],
};
