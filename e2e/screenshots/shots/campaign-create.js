/**
 * Ảnh minh hoạ cho bài "Tạo chiến dịch" (/huong-dan/campaign-create).
 *
 * Bài có 12 ô, 5 ô đầu đã chèn từ trước; sheet này làm 7 ô còn lại.
 *
 * ⚠ PHẢI CHẠY BẢN VÁ CHỮ TRƯỚC:
 *   node backend/scripts/patchHelpArticleText.js --slug=campaign-create \
 *     --from=_internal/patch-campaign-create-2026-08-24.json --apply
 * Ba khoá dưới đây bám vào câu chú thích ĐÃ SỬA. Chạy ngược thứ tự thì không
 * khớp ô nào. Ba chỗ bài viết mô tả sai giao diện:
 *   1. "bảng bên phải" — bảng khối nằm bên TRÁI trình dựng.
 *   2. "nút Kích hoạt chiến dịch" — KHÔNG có nút nào tên vậy. Mỗi dòng ở trang
 *      Chạy chiến dịch có sẵn ba nút: Chạy ngay / Lên lịch / Xem log.
 *   3. "hai lựa chọn hiện ra sau khi kích hoạt" — cả hai luôn hiện sẵn, không
 *      có bước kích hoạt trung gian nào.
 *
 * Cần `E2E_SEED_CAMPAIGNS=1` (nằm trong `E2E_SEED_ALL=1`): chiến dịch nháp được
 * dựng sẵn luồng Khởi chạy → Đọc dữ liệu Sheet → Gửi email, kèm hai đường nối.
 * Không có luồng thì trình dựng mở ra một khung trắng, chẳng chụp được gì.
 */
import {
  sidebarShot, highlight, hideVolatileChrome, settle, contentShot, paddedShot,
} from '../lib/shotHelpers.js';

/**
 * Mở trình dựng của chiến dịch nháp đã có luồng mẫu.
 *
 * Chờ `.react-flow__node` chứ không chờ khung `.react-flow`: khung dựng xong
 * ngay cả khi chưa nạp node nào, chờ nhầm thì chụp phải canvas trắng.
 */
async function openBuilder(page) {
  await page.goto('/app/campaigns');
  await page.waitForTimeout(1500);

  const row = page.locator('a[href*="/builder"], tr').filter({ hasText: 'Chào mừng Khách hàng mới' }).first();
  const link = await row.locator('a[href*="/builder"]').first().getAttribute('href').catch(() => null);
  await page.goto(link || '/app/campaigns/1/builder');

  const nodes = page.locator('.react-flow__node');
  await nodes.first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
  if (!(await nodes.count())) {
    throw new Error(
      'Trình dựng mở ra khung trắng — chiến dịch nháp chưa có node nào. Nạp lại DB:\n'
      + '  E2E_SEED_DEMO=1 E2E_SEED_CAMPAIGNS=1 node scripts/seed-test-db.js',
    );
  }
  await settle(page);
  await hideVolatileChrome(page);
}

/** Mở bảng cài đặt của một khối — trình dựng bắt bấm HAI LẦN trong 300ms. */
async function openNodeConfig(page, nodeName) {
  const node = page.locator('.react-flow__node').filter({ hasText: nodeName }).first();
  await node.click();
  await page.waitForTimeout(120);
  await node.click();
  await page.waitForTimeout(1800);
}

export default {
  slug: 'campaign-create',
  shots: [
    {
      name: 'keo-khoi-khoi-chay',
      caption: 'kéo khối Khởi chạy từ bảng bên trái thả vào khu vực dựng',
      localOnly: true,
      async take(page) {
        await openBuilder(page);

        // Ảnh tĩnh không diễn tả được động tác kéo. Khoanh cả hai đầu của thao
        // tác — mục "Khởi chạy" trong bảng khối bên trái và khối đã nằm trên
        // khung dựng — để người đọc thấy nó đi từ đâu tới đâu.
        const paletteItem = page.locator('aside, div').filter({ hasText: 'Điểm khởi đầu (Triggers)' })
          .last().getByText('Khởi chạy', { exact: true }).first();
        if (await paletteItem.isVisible().catch(() => false)) await highlight(paletteItem);

        const placed = page.locator('.react-flow__node').filter({ hasText: 'Khởi chạy' }).first();
        if (await placed.isVisible().catch(() => false)) await highlight(placed);

        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first());
      },
    },
    {
      name: 'khoi-lay-du-lieu',
      caption: 'khối lấy dữ liệu đang mở bảng cài đặt, khoanh đỏ nút "Kiểm tra kết nối"',
      localOnly: true,
      async take(page) {
        await openBuilder(page);
        await openNodeConfig(page, 'Đọc dữ liệu Sheet');

        // Nút "Kiểm tra kết nối" nằm ở tab "Kết nối", KHÔNG phải tab "Cấu hình
        // Sheet" (tab đó chỉ có tên sheet, dòng tiêu đề, số dòng chạy thử).
        const sheetTab = page.getByText('Kết nối', { exact: true }).first();
        if (!(await sheetTab.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Không mở được bảng cài đặt của khối "Đọc dữ liệu Sheet"');
        }
        await sheetTab.click();
        await page.waitForTimeout(1000);

        const testButton = page.getByRole('button', { name: 'Kiểm tra kết nối', exact: true }).first();
        if (!(await testButton.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Mở được tab Kết nối nhưng không thấy nút "Kiểm tra kết nối"');
        }
        await hideVolatileChrome(page);
        await highlight(testButton);
        await page.waitForTimeout(200);

        const dialog = page.locator('div.fixed').filter({ hasText: 'Cấu hình:' }).last();
        return contentShot(page, dialog.locator('> div').first());
      },
    },
    {
      name: 'hai-khoi-da-noi',
      caption: 'hai khối đã được nối, khoanh đỏ đường nối giữa hai chấm tròn',
      localOnly: true,
      async take(page) {
        await openBuilder(page);

        // Đường nối là <path> trong SVG — outline không vẽ được trên đó. Tô đậm
        // và đổi màu chính nét vẽ thay vì khoanh khung.
        const marked = await page.locator('.react-flow__edge-path').evaluateAll((paths, color) => {
          for (const p of paths) {
            p.style.stroke = color;
            p.style.strokeWidth = '4';
          }
          return paths.length;
        }, '#e11d48');
        if (!marked) {
          throw new Error(
            'Không có đường nối nào giữa các khối. Nạp lại DB:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_CAMPAIGNS=1 node scripts/seed-test-db.js',
          );
        }
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('.react-flow').first());
      },
    },
    {
      name: 'nut-luu-trinh-dung',
      caption: 'thanh công cụ của trình dựng, khoanh đỏ nút lưu',
      localOnly: true,
      async take(page) {
        await openBuilder(page);
        const save = page.getByRole('button', { name: 'Lưu', exact: true }).first();
        if (!(await save.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Không thấy nút Lưu trên thanh công cụ trình dựng');
        }
        await highlight(save);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 130 });
      },
    },
    {
      name: 'chay-ngay-len-lich-trinh-dung',
      // 28/09/2026 — trang "Chạy chiến dịch" đã gộp vào Quản lý chiến dịch (13/09) và nút "Kích hoạt"
      // bỏ từ PR-3 16/09: chạy thẳng từ thanh công cụ trình dựng. CHỈ khoanh, KHÔNG bấm — "Chạy ngay" gửi thật.
      caption: 'thanh công cụ trình dựng, khoanh đỏ hai nút "Chạy ngay" và "Lên lịch"',
      localOnly: true,
      async take(page) {
        await openBuilder(page);
        for (const name of ['Chạy ngay', 'Lên lịch']) {
          const button = page.getByRole('button', { name, exact: true }).first();
          if (!(await button.isVisible({ timeout: 10_000 }).catch(() => false))) {
            throw new Error(`Không thấy nút "${name}" trên thanh công cụ trình dựng`);
          }
          await highlight(button);
        }
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 130 });
      },
    },
    {
      // Ước tính do server tính từ chiến dịch + tài khoản gửi; DB e2e chưa có kênh Zalo thật nên trả bản MẪU đúng hợp đồng
      // `GET /campaigns/:id/estimate` (ba ngày, một tài khoản email gửi, kèm cảnh báo nhiều ngày). CHỈ mở hộp, KHÔNG bấm "Xác nhận chạy".
      name: 'hop-xac-nhan-chay-uoc-tinh',
      caption: 'hộp Xác nhận chạy chiến dịch, khoanh đỏ khối "Ước tính thời gian gửi" với dòng Dự kiến xong và bảng theo ngày',
      localOnly: true,
      async take(page) {
        const now = Date.now();
        const vnDay = (offsetDays) => new Date(now + offsetDays * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
        const startAt = new Date(now).toISOString();
        const finishAtEarliest = new Date(now + 2 * 86_400_000 + 5 * 3_600_000).toISOString();
        const finishAtLatest = new Date(now + 2 * 86_400_000 + 11 * 3_600_000).toISOString();
        await page.route('**/api/campaigns/*/estimate**', (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              startAt,
              finishAtEarliest,
              finishAtLatest,
              totalActions: 240,
              accounts: [{ key: 'email:1', label: 'Email CSKH UKNOW' }],
              perDay: [
                { date: vnDay(0), actions: 90, perAccount: { 'email:1': 90 } },
                { date: vnDay(1), actions: 90, perAccount: { 'email:1': 90 } },
                { date: vnDay(2), actions: 60, perAccount: { 'email:1': 60 } },
              ],
              warnings: [{ code: 'multi_day', params: { days: 3, finishAtLatest } }],
            },
          }),
        }));
        await openBuilder(page);
        const run = page.getByRole('button', { name: 'Chạy ngay', exact: true }).first();
        await run.waitFor({ state: 'visible', timeout: 10_000 });
        await run.click();
        const estimate = page.getByTestId('campaign-estimate');
        await estimate.waitFor({ state: 'visible', timeout: 20_000 });
        await page.waitForTimeout(500);
        await hideVolatileChrome(page);
        await highlight(estimate);
        await page.waitForTimeout(200);
        // Khung trắng của hộp thoại (con của lớp phủ toàn màn hình), cao tới hết hộp.
        const dialog = estimate.locator('xpath=ancestor::div[contains(@class,"fixed")][1]').locator('> div').first();
        return paddedShot(page, dialog, { pad: 16 });
      },
    },
  ],
};
