/**
 * Ba ô còn thiếu của bài "Gói dùng thử: có gì và hết hạn thì sao"
 * (/huong-dan/dung-thu).
 *
 * Ô "hộp thoại chào mừng" dựng lại đúng cách app tạo ra nó: modal KHÔNG đọc DB
 * mà đọc localStorage `founderai_trial_welcome_<userId>` — authStore ghi khoá
 * này ngay sau khi đăng ký thành công, MainLayout đọc để quyết định có hiện hay
 * không. Đặt lại đúng khoá đó là tái hiện y hệt màn hình người mới đăng ký
 * thấy, không phải dựng giả một hộp thoại.
 *
 * Số liệu lấy đúng gói "Dùng thử" trong demo-plans.js (14 ngày, 100 tin Zalo,
 * 200 credit AI, 2 chatbot) — đổi gói thì sửa theo, đừng bịa số.
 *
 * ⚠ Ô "hạn mức còn lại" phải seed với gói DÙNG THỬ, không thì trang Tổng quan
 * gói hiện gói trả phí trong một bài viết về gói miễn phí:
 *   E2E_SEED_PLAN=trial E2E_SEED_ALL=1 node scripts/seed-test-db.js
 * Nhớ seed lại về mặc định (bỏ E2E_SEED_PLAN) trước khi chụp các bài khác.
 */
import {
  sidebarShot, highlight, hideVolatileChrome, settle, contentShot,
} from '../lib/shotHelpers.js';

const BILLING_PATH = '/app/billing';

const TRIAL_PAYLOAD = {
  planCode: 'trial',
  planName: 'Dùng thử',
  durationDays: 14,
  messagesPerPeriod: 100,
  aiCreditsPerPeriod: 200,
  maxChatbots: 2,
};

export default {
  slug: 'dung-thu',
  shots: [
    {
      name: 'hop-thoai-chao-mung',
      caption: 'hộp thoại chào mừng gói dùng thử hiện giữa màn hình, khoanh đỏ tên gói và ngày hết hạn',
      localOnly: true,
      async take(page, { baseURL }) {
        await page.goto(baseURL);
        const userId = await page.evaluate(() => {
          const raw = window.localStorage.getItem('accessToken')
            || window.sessionStorage.getItem('accessToken');
          if (!raw) return null;
          try {
            return JSON.parse(atob(raw.split('.')[1])).userId;
          } catch {
            return null;
          }
        });
        if (!userId) throw new Error('Không đọc được userId từ access token — phiên đăng nhập hỏng?');

        await page.evaluate(([id, trial]) => {
          const expires = new Date();
          expires.setDate(expires.getDate() + trial.durationDays);
          window.localStorage.setItem(
            `founderai_trial_welcome_${id}`,
            JSON.stringify({ ...trial, expiresAt: expires.toISOString() }),
          );
        }, [userId, TRIAL_PAYLOAD]);

        await page.goto('/app');
        const dialog = page.locator('div.fixed').filter({ hasText: 'dùng thử' }).last();
        if (!(await dialog.isVisible({ timeout: 20_000 }).catch(() => false))) {
          throw new Error('Đặt khoá localStorage rồi mà hộp thoại chào mừng vẫn không hiện');
        }
        await settle(page);
        await hideVolatileChrome(page);

        for (const pattern of [/Dùng thử/, /\d{2}\/\d{2}\/\d{4}/]) {
          const target = dialog.getByText(pattern).first();
          if (await target.isVisible().catch(() => false)) await highlight(target);
        }
        await page.waitForTimeout(200);

        // Dọn khoá localStorage NGAY SAU khi chụp xong. Cả bộ ảnh dùng chung một
        // trang; để nguyên thì hộp thoại mọc lại ở mọi lượt điều hướng sau và
        // che mất thanh menu — hai ô còn lại của bài này hỏng vì đúng chuyện đó.
        const shot = await contentShot(page, dialog.locator('> div').first());
        return {
          screenshot: async (options = {}) => {
            try {
              return await shot.screenshot(options);
            } finally {
              await page.evaluate((id) => {
                window.localStorage.removeItem(`founderai_trial_welcome_${id}`);
              }, userId);
            }
          },
        };
      },
    },
    {
      name: 'menu-tong-quan-goi',
      caption: 'menu bên trái đang mở nhóm Gói & Thanh toán, khoanh đỏ mục "Tổng quan gói"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'Gói & Thanh toán',
          itemName: 'Tổng quan gói',
          baseURL,
        });
      },
    },
    {
      name: 'han-muc-va-ngay-het-han',
      caption: 'trang Tổng quan gói, khoanh đỏ khu vực hiện hạn mức còn lại và ngày hết hạn',
      localOnly: true,
      async take(page) {
        // Vào lại từ /app chứ không nhảy thẳng: ô trước đó chụp thanh menu và để
        // trang ở /app; điều hướng thẳng sang /app/billing từ đó thỉnh thoảng
        // dựng trang trước khi authStore nạp xong hồ sơ, ra khung rỗng.
        await page.goto('/app');
        await page.waitForTimeout(800);
        await page.goto(BILLING_PATH);
        await page.getByRole('heading', { name: 'Gói & Thanh toán' })
          .first().waitFor({ state: 'visible', timeout: 30_000 });

        const failed = page.getByText('Không tải được thông tin gói').first();
        if (await failed.isVisible({ timeout: 3_000 }).catch(() => false)) {
          throw new Error('Trang Tổng quan gói báo "Không tải được thông tin gói".');
        }

        const expiry = page.getByText(/Hết hạn ngày/).first();
        if (!(await expiry.isVisible({ timeout: 20_000 }).catch(() => false))) {
          throw new Error('Trang Tổng quan gói không hiện ngày hết hạn — tài khoản chưa được gán gói?');
        }
        await settle(page);
        await hideVolatileChrome(page);

        await highlight(expiry);
        const limits = page.locator('main div').filter({ hasText: /^GIỚI HẠN GỬI TIN/i }).last();
        if (await limits.isVisible().catch(() => false)) await highlight(limits);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main div.space-y-5').first(), { maxHeight: 515 });
      },
    },
  ],
};
