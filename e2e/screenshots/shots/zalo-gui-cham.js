/**
 * Ba ô của bài "Vì sao Zalo gửi chậm hoặc đang dừng" (/huong-dan/zalo-gui-cham), theo giao diện số liệu mới
 * (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30): mục menu là "Giám sát gửi tin", bảng "Lượt chạy gần đây" có cột
 * "Đã gửi / Cần gửi".
 *
 * Cần `E2E_SEED_ALL=1` (kênh Zalo mẫu + `E2E_SEED_ACTIVITY`: chiến dịch Zalo "Gửi ưu đãi Zalo Khách hàng thân thiết" đang
 * gửi 85 / 500). Backend chạy với `SCHEDULER_ENABLED=false`, kẻo worker nền đánh lượt đang gửi thành lỗi.
 */
import {
  sidebarShot, highlight, hideVolatileChrome, settle, contentShot, bandShot, boxAround, drawBoxes, paddedShot,
} from '../lib/shotHelpers.js';

const MONITOR_PATH = '/app/delivery-monitor';
const CHANNELS_PATH = '/app/settings/channels';

export default {
  slug: 'zalo-gui-cham',
  shots: [
    {
      name: 'the-zalo-trang-thai',
      caption: 'thẻ Zalo trong trang Quản lý kênh gửi, khoanh đỏ dòng trạng thái của tài khoản',
      localOnly: true,
      async take(page) {
        await page.goto(CHANNELS_PATH);
        const tab = page.getByRole('button', { name: 'Zalo', exact: true }).first();
        await tab.waitFor({ state: 'visible', timeout: 30_000 });
        await tab.click();
        // Khối "Tài khoản" liệt kê mỗi tài khoản một thẻ; dòng trạng thái là dòng có tên + nhãn (Đã kết nối / Cần kết nối lại…).
        const list = page.locator('main .card').filter({ has: page.getByRole('heading', { name: 'Tài khoản', exact: true }) }).first();
        await list.waitFor({ state: 'visible', timeout: 30_000 });
        const accountCard = list.locator('div.rounded-lg.border').first();
        await accountCard.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        // Dòng có tên tài khoản và nhãn trạng thái ngay cạnh.
        const statusLine = accountCard.locator('h3').first().locator('xpath=..');
        await highlight(statusLine);
        await page.waitForTimeout(200);
        return contentShot(page, list);
      },
    },
    {
      name: 'o-toc-do-va-gioi-han-gui',
      caption: 'thẻ Zalo trong trang Quản lý kênh gửi, khoanh đỏ ô Tốc độ gửi và ô Giới hạn gửi/ngày',
      localOnly: true,
      async take(page) {
        await page.goto(CHANNELS_PATH);
        const tab = page.getByRole('button', { name: 'Zalo', exact: true }).first();
        await tab.waitFor({ state: 'visible', timeout: 30_000 });
        await tab.click();
        const limit = page.locator('[id^="send-limit-"]').first();
        const speed = page.locator('[id^="send-speed-"]').first();
        await limit.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        // Khoanh riêng hai Ô (không kèm nút Lưu). CHỈ khoanh, KHÔNG bấm Lưu.
        await highlight(speed);
        await highlight(limit.locator('xpath=ancestor::div[1]'));
        await page.waitForTimeout(200);
        const card = limit.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
        return paddedShot(page, card, { pad: 14 });
      },
    },
    {
      name: 'menu-giam-sat-gui-tin',
      caption: 'menu bên trái, nhóm Chiến dịch đang mở, khoanh đỏ mục "Giám sát gửi tin"',
      async take(page, { baseURL }) {
        return sidebarShot(page, { groupName: 'Chiến dịch', itemName: 'Giám sát gửi tin', baseURL });
      },
    },
    {
      name: 'dong-chien-dich-zalo',
      caption: 'mục Lượt chạy gần đây, khoanh đỏ dòng của một chiến dịch Zalo đang chạy với cột Đã gửi / Cần gửi',
      async take(page) {
        await page.goto(MONITOR_PATH);
        await page.getByTestId('card-sent').waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);

        const card = page.locator('main .card').filter({ has: page.getByRole('heading', { name: /Lượt chạy gần đây/ }) }).first();
        await card.waitFor({ state: 'visible', timeout: 30_000 });
        // Chú thích chỉ đích danh chiến dịch ZALO đang chạy — bảng xếp lẫn cả chiến dịch email. Chọn theo nhãn kênh và trạng thái
        // "Đang gửi" (không phải "Đang chờ": lượt đó nghỉ chứ không chạy).
        const row = card.locator('tbody tr[data-testid^="run-row-"]')
          .filter({ hasText: 'Zalo cá nhân' })
          .filter({ has: page.locator('[data-testid="run-status"]', { hasText: /^Đang gửi$/ }) })
          .first();
        if (!(await row.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error(
            'Không thấy chiến dịch Zalo nào ở trạng thái "Đang gửi" trong "Lượt chạy gần đây".\n'
            + 'Hai nguyên nhân: worker nền đã đánh lượt mẫu thành lỗi (chạy backend với SCHEDULER_ENABLED=false), hoặc chưa seed:\n'
            + '  E2E_SEED_ALL=1 node e2e/scripts/seed-test-db.js',
          );
        }
        await card.evaluate((el) => el.scrollIntoView({ block: 'start' }));
        await page.waitForTimeout(300);
        // Khoanh cả dòng, và riêng ô "Đã gửi / Cần gửi" của dòng đó (cột thứ 4).
        const sentCell = row.locator('td:nth-child(4)');
        await drawBoxes(card, [
          await boxAround(card, [row], { pad: 0 }),
          await boxAround(card, [sentCell], { pad: -4 }),
        ]);
        await page.waitForTimeout(200);
        // Từ đầu thẻ (tiêu đề + hàng tiêu đề cột) tới hết dòng được khoanh.
        return bandShot(page, card, row, { pad: 10, padTop: 0 });
      },
    },
  ],
};
