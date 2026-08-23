/**
 * Ảnh minh hoạ cho bài "Khách hàng: dữ liệu đến từ đâu và xem ở đâu"
 * (/huong-dan/khach-hang).
 *
 * Bài có 7 ô, ở đây làm 3. Bốn ô còn lại không tự động hoá được:
 *   1, 2 — ảnh chụp Google Sheet và hộp thoại chia sẻ của Google, nằm NGOÀI app.
 *   3, 4 — khối "Đọc dữ liệu Sheet" trong trình dựng chiến dịch, cần một Google
 *          Sheet thật đã chia sẻ công khai thì nút "Kiểm tra kết nối" mới chạy
 *          được. Dựng giả sẽ ra ảnh báo lỗi, tệ hơn là không có ảnh.
 * Bốn ô đó phải chụp tay.
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

        // Hành trình dựng từ bảng `email_messages`; seed hiện chưa tạo bảng này
        // nên hộp thoại mở ra rỗng. Thà báo lỗi còn hơn cho ra một ảnh trống mà
        // vẫn tính là thành công — đúng bài học đã lặp lại nhiều lần ở đây.
        const empty = page.getByText(/Chưa có email nào|Chưa có dữ liệu/i).first();
        if (await empty.isVisible({ timeout: 5_000 }).catch(() => false)) {
          throw new Error(
            'Hành trình khách rỗng — cần seed bảng email_messages (tin đã gửi cho từng khách\n'
            + 'trong chiến dịch). campaign_customers chỉ nối khách vào chiến dịch, không sinh tin.',
          );
        }

        await hideVolatileChrome(page);
        const panel = page.locator('div.fixed.inset-0').last().locator('> div').last();
        return (await panel.isVisible().catch(() => false))
          ? panel
          : contentShot(page, page.locator('main').first());
      },
    },
  ],
};
