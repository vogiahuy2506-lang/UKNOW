/**
 * Ảnh minh hoạ cho bài "Khách hàng: dữ liệu đến từ đâu và xem ở đâu"
 * (/huong-dan/khach-hang).
 *
 * Bài có 7 ô, ở đây làm 4. Ba ô còn lại phải chụp tay:
 *   1, 2 — ảnh chụp Google Sheet và hộp thoại chia sẻ của Google, nằm NGOÀI app.
 *   4   — danh sách cột hiện ra SAU KHI kiểm tra kết nối thành công. Bấm nút đó
 *         là gọi thật ra Google, cần một Sheet đã chia sẻ công khai; dựng giả chỉ
 *         ra ảnh báo lỗi.
 * Ô 3 thì chụp được: nút "Kiểm tra kết nối" hiện ra không cần Sheet thật, chỉ
 * cần bấm mới cần.
 *
 * Cần `E2E_SEED_CUSTOMERS=1` và `E2E_SEED_CAMPAIGNS=1` (nằm trong `E2E_SEED_ALL=1`).
 */
import {
  sidebarShot, regionShot, highlight, hideVolatileChrome, settle, contentShot,
} from '../lib/shotHelpers.js';

const CUSTOMERS_PATH = '/app/customers';

export default {
  slug: 'khach-hang',
  shots: [
    {
      // Cùng màn hình với ô "khoi-lay-du-lieu" bên bài campaign-create, nhưng
      // câu chú thích khác nên phải là ảnh riêng.
      name: 'khoi-doc-sheet',
      caption: 'khối Đọc dữ liệu Sheet đã điền URL, khoanh đỏ nút "Kiểm tra kết nối"',
      localOnly: true,
      async take(page) {
        await page.goto('/app/campaigns/1/builder');
        const nodes = page.locator('.react-flow__node');
        await nodes.first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
        if (!(await nodes.count())) {
          throw new Error(
            'Trình dựng mở ra khung trắng — chiến dịch nháp chưa có node nào. Nạp lại DB:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_CAMPAIGNS=1 node scripts/seed-test-db.js',
          );
        }
        await settle(page);

        // Bảng cài đặt mở bằng HAI lần bấm trong 300ms, không phải dblclick.
        const node = nodes.filter({ hasText: 'Đọc dữ liệu Sheet' }).first();
        await node.click();
        await page.waitForTimeout(120);
        await node.click();
        await page.waitForTimeout(1800);

        // Nút nằm ở tab "Kết nối", không phải tab "Cấu hình Sheet".
        const tab = page.getByText('Kết nối', { exact: true }).first();
        if (!(await tab.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Không mở được bảng cài đặt của khối "Đọc dữ liệu Sheet"');
        }
        await tab.click();
        await page.waitForTimeout(1000);

        const testButton = page.getByRole('button', { name: 'Kiểm tra kết nối', exact: true }).first();
        if (!(await testButton.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Mở được tab Kết nối nhưng không thấy nút "Kiểm tra kết nối"');
        }
        await hideVolatileChrome(page);
        await highlight(testButton);
        await page.waitForTimeout(200);

        const dialog = page.locator('div.fixed').filter({ hasText: 'Cấu hình:' }).last();
        const shot = await contentShot(page, dialog.locator('> div').first());
        return {
          screenshot: async (options = {}) => {
            try {
              return await shot.screenshot(options);
            } finally {
              // Đóng bảng cài đặt sau khi chụp. Cả bộ ảnh dùng chung một trang;
              // để nó mở thì mọi ô sau của bài này chờ mòn mỏi rồi hết giờ.
              await page.getByRole('button', { name: 'Hủy', exact: true })
                .first().click({ timeout: 5_000 })
                .catch(() => page.keyboard.press('Escape').catch(() => {}));
              await page.waitForTimeout(500);
            }
          },
        };
      },
    },
    {
      name: 'menu-khach-hang',
      caption: 'khoanh đỏ mục "Khách hàng từ chiến dịch" ở cuối',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'Chiến dịch',
          itemName: 'Khách hàng từ chiến dịch',
          baseURL,
        });
      },
    },
    {
      name: 'danh-sach-chien-dich',
      caption: 'trang Khách hàng từ chiến dịch, danh sách chiến dịch kèm số khách của từng cái',
      async take(page) {
        return regionShot(page, {
          path: CUSTOMERS_PATH,
          clip: 'main',
          waitFor: 'main input[placeholder*="khách hàng" i]',
        });
      },
    },
    {
      name: 'chi-tiet-khach',
      caption: 'màn hình chi tiết một khách',
      localOnly: true,
      async take(page) {
        await page.goto(CUSTOMERS_PATH);
        await page.locator('main input[placeholder*="khách hàng" i]').waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);

        // Chọn chiến dịch có khách thật. Chiến dịch "0 đã gửi" mở ra danh sách
        // rỗng, chụp thì vô nghĩa — ưu tiên cái có số lớn nhất.
        const campaigns = page.locator('main button').filter({ hasText: /\d+ đã gửi/ });
        const total = await campaigns.count();
        let best = null;
        let bestCount = 0;
        for (let i = 0; i < total; i += 1) {
          const text = await campaigns.nth(i).innerText();
          const sent = Number((text.match(/(\d+)\s+đã gửi/) || [])[1] || 0);
          if (sent > bestCount) { bestCount = sent; best = i; }
        }
        if (best === null || bestCount === 0) {
          throw new Error(
            'Không chiến dịch nào có khách. Nạp lại DB:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_CUSTOMERS=1 E2E_SEED_CAMPAIGNS=1 node scripts/seed-test-db.js',
          );
        }
        await campaigns.nth(best).click();
        await page.waitForTimeout(1500);

        // Mỗi dòng khách có nút "Chi tiết" và "Hành trình" — bấm vào dòng thì
        // không mở gì cả, phải bấm đúng nút. Chú thích cần cả thông tin liên hệ
        // lẫn dòng thời gian tin đã gửi, nên ưu tiên "Hành trình".
        // "Chi tiết" chỉ hiện thông tin liên hệ kèm danh sách khoá học; dòng thời
        // gian tin đã gửi mà chú thích nói tới nằm ở "Hành trình".
        const journeyButton = page.locator('main button').filter({ hasText: /^Hành trình$/ }).first();
        if (!(await journeyButton.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Chiến dịch mở ra nhưng không có khách nào — thiếu bảng nối campaign_customers');
        }
        await journeyButton.click();
        await page.waitForTimeout(1800);

        // Hộp thoại này dùng class `modal-overlay`, KHÔNG phải `fixed inset-0`
        // như các hộp thoại khác trong app — bám nhầm thì tưởng không có modal.
        const overlay = page.locator('.modal-overlay').last();
        if (!(await overlay.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Bấm "Hành trình" nhưng không thấy hộp thoại nào mở ra');
        }

        // Kiểm chữ TRONG hộp thoại, không kiểm cả trang: nền phía sau cũng có
        // những câu "Chưa có …" khác, bắt nhầm thì báo lỗi oan.
        const problem = overlay.getByText(/Không thể tải|Chưa có email nào/i).first();
        if (await problem.isVisible().catch(() => false)) {
          throw new Error(
            `Hành trình không tải được: "${(await problem.innerText()).trim()}".\n`
            + 'Cần email_messages/zalo_messages cho khách trong chiến dịch, và schema test\n'
            + 'phải có đủ cột đời sau của zalo_messages (message_text, recipient_value…).',
          );
        }

        await hideVolatileChrome(page);
        return overlay.locator('> div').filter({ hasText: /./ }).last();
      },
    },
  ],
};
