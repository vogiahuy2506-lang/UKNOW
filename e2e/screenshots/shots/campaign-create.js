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
  sidebarShot, highlight, hideVolatileChrome, settle, contentShot,
} from '../lib/shotHelpers.js';

const RUN_PATH = '/app/campaign-run';

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
      name: 'menu-chay-chien-dich',
      caption: 'menu bên trái, nhóm Chiến dịch đang mở, khoanh đỏ mục "Chạy chiến dịch"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'Chiến dịch',
          itemName: 'Chạy chiến dịch',
          baseURL,
        });
      },
    },
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
      name: 'trang-chay-chien-dich',
      caption: 'trang Chạy chiến dịch, khoanh đỏ dòng của một chiến dịch đang hoạt động',
      async take(page) {
        await page.goto(RUN_PATH);
        await page.getByRole('heading', { name: 'Chạy chiến dịch' })
          .first().waitFor({ state: 'visible', timeout: 30_000 });

        const row = page.locator('main tbody tr').first();
        if (!(await row.isVisible({ timeout: 15_000 }).catch(() => false))) {
          throw new Error(
            'Không chiến dịch nào đang hoạt động. Nạp lại DB:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_CAMPAIGNS=1 node scripts/seed-test-db.js',
          );
        }
        await settle(page);
        await hideVolatileChrome(page);

        // Không dùng highlight() ở đây: outline vẽ trên <tr> bị bảng nuốt mất,
        // ảnh chỉ còn một nét đỏ ở mép trên trông như lỗi hiển thị. Vẽ viền
        // trong từng ô rồi ghép lại thành một dải liền.
        await row.evaluate((tr, color) => {
          const cells = [...tr.children];
          cells.forEach((cell, i) => {
            const sides = [
              `inset 0 3px 0 0 ${color}`,
              `inset 0 -3px 0 0 ${color}`,
              i === 0 ? `inset 3px 0 0 0 ${color}` : '',
              i === cells.length - 1 ? `inset -3px 0 0 0 ${color}` : '',
            ].filter(Boolean);
            cell.style.boxShadow = sides.join(', ');
          });
        }, '#e11d48');
        await page.waitForTimeout(200);
        // 505: cắt sát ngay dưới dòng được khoanh, không để dòng sau bị xén ngang.
        return contentShot(page, page.locator('main').first(), { maxHeight: 505 });
      },
    },
    {
      name: 'chay-ngay-va-len-lich',
      caption: 'cột thao tác của một chiến dịch, khoanh đỏ hai nút Chạy ngay và Lên lịch',
      async take(page) {
        await page.goto(RUN_PATH);
        await page.getByRole('heading', { name: 'Chạy chiến dịch' })
          .first().waitFor({ state: 'visible', timeout: 30_000 });

        const row = page.locator('main tbody tr').first();
        await row.waitFor({ state: 'visible', timeout: 15_000 });
        await settle(page);
        await hideVolatileChrome(page);

        // CHỈ khoanh, KHÔNG bấm: "Chạy ngay" bắt đầu gửi thật.
        for (const name of ['Chạy ngay', 'Lên lịch']) {
          const button = row.getByRole('button', { name, exact: true }).first();
          if (!(await button.isVisible().catch(() => false))) {
            throw new Error(`Không thấy nút "${name}" trên dòng chiến dịch`);
          }
          await highlight(button);
        }
        await page.waitForTimeout(200);
        return contentShot(page, row);
      },
    },
  ],
};
