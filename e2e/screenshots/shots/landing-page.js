/**
 * Ảnh minh hoạ cho bài "Landing page thu khách hàng" (/huong-dan/landing-page).
 *
 * Cần `E2E_SEED_LANDING=1` (nằm trong `E2E_SEED_ALL=1`): 2 trang đã xuất bản,
 * 1 trang có HTML thật kèm mốc form, 1 trang có tên miền riêng đang chờ DNS,
 * và 3 mẫu công khai trong thư viện template.
 *
 * BA CHỖ BÀI VIẾT MÔ TẢ LỆCH VỚI GIAO DIỆN — chụp đúng thứ có thật, câu chữ
 * trong bài nên sửa lại sau:
 *  1. Bài nói "bấm nút tạo trang mới, màn hình cho bạn chọn một trong ba cách".
 *     Thực tế bấm "Tạo mới" là vào thẳng trình sửa; ba cách nằm ở ba nút trên
 *     thanh công cụ (Visual Block Editor / Template / Tạo bằng AI).
 *  2. Bài gọi ba cách là "Tạo với AI", "Chọn mẫu có sẵn", "Trình sửa trực quan".
 *     Nút thật tên khác: "Tạo bằng AI", "Template", "Visual Block Editor".
 *  3. Ô "tên miền riêng" đòi thấy CẢ ô nhập tên miền LẪN bảng hướng dẫn DNS.
 *     Hai thứ đó là hai trạng thái loại trừ nhau của cùng một thẻ: chưa khai
 *     tên miền thì có ô nhập, khai rồi thì thay bằng bản ghi DNS cần thêm.
 *     Ảnh này chụp trạng thái sau — đó mới là chỗ người dùng hay mắc kẹt.
 */
import {
  sidebarShot, highlight, hideVolatileChrome, settle, contentShot,
  enclosingSection, tallViewportShot, highlightCell, paddedShot,
} from '../lib/shotHelpers.js';

const LANDING_PATH = '/app/settings/landing-pages';

/**
 * Mở trình sửa của một trang trong danh sách.
 *
 * Bấm vào dòng KHÔNG mở gì cả — phải bấm đúng nút biểu tượng `title="Sửa"` ở
 * cuối dòng. Thứ tự dòng theo `updated_at` giảm dần nên chỉ định bằng tên trang
 * cho chắc, đừng đếm chỉ số.
 */
async function openEditor(page, { pageTitle }) {
  await page.goto(LANDING_PATH);
  await page.getByRole('heading', { name: 'Quản lý Landing Pages' })
    .waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);

  const row = page.locator('tbody tr').filter({ hasText: pageTitle }).first();
  if (!(await row.isVisible({ timeout: 15_000 }).catch(() => false))) {
    throw new Error(
      `Không thấy trang "${pageTitle}" trong danh sách. Nạp lại DB:\n`
      + '  E2E_SEED_DEMO=1 E2E_SEED_LANDING=1 node scripts/seed-test-db.js',
    );
  }
  await row.locator('button[title="Sửa"]').first().click();
  // Trình soạn landing-canvas (từ 07–14/09/2026) không còn nút "Tạo bằng AI"; nút "Lưu" là mốc chắc
  // chắn nhất cho biết thanh công cụ đã dựng xong.
  await page.getByRole('button', { name: 'Lưu', exact: true })
    .first().waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(1500);
}

/**
 * Phần đầu trình sửa — đủ thấy cả hai hàng nút trên thanh công cụ.
 *
 * Bám vào khối bao thanh công cụ bằng `filter({ has: … })` rồi `.last()` cho ra
 * đúng khối trong cùng bọc mấy cái nút, rộng chưa hết hàng — ảnh cụt mất nút
 * cuối. Cắt theo chiều cao từ đỉnh <main> chắc ăn hơn.
 */
const TOOLBAR_HEIGHT = 210;

export default {
  slug: 'landing-page',
  shots: [
    {
      name: 'menu-tao-landing-page',
      caption: 'menu bên trái đang mở nhóm Landing page, khoanh đỏ mục "Tạo Landing page"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'Landing page',
          itemName: 'Tạo Landing page',
          baseURL,
        });
      },
    },
    {
      name: 'menu-khach-hang-tu-landing',
      caption: 'menu bên trái, nhóm Landing page đang mở, khoanh đỏ mục "Khách hàng từ Landing page"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'Landing page',
          itemName: 'Khách hàng từ Landing page',
          baseURL,
        });
      },
    },
    {
      name: 'danh-sach-landing-page',
      caption: 'trang danh sách landing page, thấy các trang đã tạo kèm trạng thái đã xuất bản',
      async take(page) {
        await page.goto(LANDING_PATH);
        await page.locator('main table').first().waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        // Cắt theo chiều cao thay vì để contentShot tự đo: khung trang có một
        // khối bao CAO HẾT MÀN HÌNH (`div.relative.h-full`), nên phép đo "đáy
        // của phần tử con thấp nhất" luôn chạm đáy <main> và không cắt được gì —
        // ảnh ra hai phần ba là nền trắng dưới bảng.
        return contentShot(page, page.locator('main').first(), { maxHeight: 360 });
      },
    },
    {
      name: 'khoi-form-dang-ky',
      caption: 'khối form đăng ký trên trang, khoanh đỏ để người đọc nhận ra khối nào không được xoá',
      localOnly: true,
      async take(page) {
        await openEditor(page, { pageTitle: 'Khoá học Marketing' });
        await hideVolatileChrome(page);

        // Trên trang đã xuất bản, khối form là một mốc `<!-- UKNOW_LP_FORM -->`
        // trong HTML, tới lúc phục vụ mới thay bằng iframe — khung xem trước
        // trong trình sửa KHÔNG dựng nó ra, nên không chụp được ở đó.
        // Thứ duy nhất trong sản phẩm trông ra hình hài một form đăng ký là thẻ
        // "Form đăng ký" này (kèm phần xem trước), nên chụp nó.
        const title = page.getByText('Form đăng ký', { exact: true }).first();
        if (!(await title.isVisible({ timeout: 15_000 }).catch(() => false))) {
          throw new Error('Không thấy thẻ "Form đăng ký" trong trình sửa');
        }

        // Thẻ này cao 1482px và nằm trong một cột có thanh cuộn RIÊNG, nên phải
        // nới khung nhìn mới chụp trọn được (xem tallViewportShot).
        return tallViewportShot(page, 1900, async () => {
          await title.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);

          const card = await enclosingSection(page, title);
          // Khoanh phần xem trước chứ không khoanh cả thẻ: viền vẽ quanh chính
          // phần tử đang chụp sẽ bị phép cắt xén mất.
          const preview = page.getByText('Xem trước form', { exact: false })
            .first().locator('xpath=..');
          if (await preview.isVisible().catch(() => false)) await highlight(preview);
          await page.waitForTimeout(200);

          // Chặn chiều cao ở 920: cột chứa thẻ chỉ vẽ tới đó rồi cắt, phần bên
          // dưới trong ảnh là ô mã HTML nằm sau lưng chứ không còn là thẻ nữa.
          return contentShot(page, card, { maxHeight: 920 });
        });
      },
    },
    {
      name: 'ten-mien-rieng',
      caption: 'phần cài đặt tên miền riêng, thấy ô nhập tên miền và bảng hướng dẫn trỏ DNS',
      localOnly: true,
      async take(page) {
        // Trang này có tên miền riêng đang chờ DNS, nên thẻ in ra bản ghi cần thêm.
        await openEditor(page, { pageTitle: 'Trang Giới Thiệu Dịch Vụ' });

        const tab = page.getByRole('button', { name: 'Tên miền riêng', exact: true }).first();
        await tab.scrollIntoViewIfNeeded();
        await tab.click();
        await page.waitForTimeout(1500);

        const record = page.getByText('Vào trang quản lý tên miền', { exact: false }).first();
        if (!(await record.isVisible({ timeout: 15_000 }).catch(() => false))) {
          throw new Error(
            'Thẻ tên miền riêng không in ra bản ghi DNS. Trạng thái phải là\n'
            + 'pending_verification và cf_managed = FALSE — Cloudflare tự quản thì\n'
            + 'màn hình chỉ báo "đang chờ hệ thống cấp DNS". Nạp lại DB:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_LANDING=1 node scripts/seed-test-db.js',
          );
        }
        await hideVolatileChrome(page);

        // Không khoanh đỏ: chú thích không yêu cầu, mà viền vẽ quanh chính phần
        // tử đang chụp thì bị chính phép cắt xén mất, ra một nét đỏ nham nhở.
        const card = await enclosingSection(page, page.getByText('Custom Domain', { exact: true }).first());
        await page.waitForTimeout(200);
        return contentShot(page, card);
      },
    },
    // ── Trình soạn landing-canvas (thay màn cũ từ 07–14/09/2026). Ba ô dưới đây là của bài viết bản 21/09;
    //    các shot phía trên nhắm vào nút của màn cũ nên sẽ báo lỗi bộ chọn — ảnh của chúng đã chèn từ trước.
    {
      name: 'ba-lua-chon-trinh-soan-trong',
      caption: 'trình soạn trang còn trống, khoanh đỏ ba lựa chọn Dán HTML có sẵn / Nhờ AI tạo / Chọn mẫu',
      async take(page) {
        await page.goto('/app/settings/landing-pages/new');
        const first = page.getByRole('button', { name: 'Dán HTML có sẵn', exact: true }).first();
        await first.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        for (const name of ['Dán HTML có sẵn', 'Nhờ AI tạo', 'Chọn mẫu']) {
          await highlight(page.getByRole('button', { name, exact: true }).first());
        }
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 640 });
      },
    },
    {
      name: 'thanh-cong-cu-trinh-soan',
      caption: 'thanh công cụ của trình soạn, khoanh đỏ các nút Nhập HTML, Template, Trình chỉnh sửa khối, Lịch sử, Cài đặt, Lưu',
      localOnly: true,
      async take(page) {
        // Mở một trang ĐÃ LƯU: nút "Lịch sử" chỉ có khi trang đã có phiên bản.
        await page.goto(LANDING_PATH);
        const row = page.locator('tbody tr').filter({ hasText: 'Khoá học Marketing' }).first();
        await row.waitFor({ state: 'visible', timeout: 30_000 });
        await row.locator('button[title="Sửa"]').first().click();
        const save = page.getByRole('button', { name: 'Lưu', exact: true }).first();
        await save.waitFor({ state: 'visible', timeout: 30_000 });
        await page.waitForTimeout(1500);
        await settle(page);
        await hideVolatileChrome(page);

        const marks = [
          page.locator('main button[title="Nhập HTML"]').first(),
          page.locator('main button[title="Template"]').first(),
          page.locator('main button[title="Trình chỉnh sửa khối"]').first(),
          page.locator('main button[title="Lịch sử"], main button[title*="Lịch sử"]').first(),
          page.locator('main').getByRole('button', { name: 'Cài đặt', exact: true }).first(),
          save,
        ];
        const missing = [];
        for (const [i, mark] of marks.entries()) {
          // Viền vẽ VÀO TRONG nút: thanh công cụ cắt phần tràn nên outline thường bị xén trên dưới.
          if (await mark.isVisible().catch(() => false)) await highlightCell(mark);
          else missing.push(['Nhập HTML', 'Template', 'Trình chỉnh sửa khối', 'Lịch sử', 'Cài đặt', 'Lưu'][i]);
        }
        if (missing.length) throw new Error(`Thanh công cụ thiếu nút: ${missing.join(', ')}`);
        await page.waitForTimeout(200);
        // Chỉ chụp đúng hàng thanh công cụ (khối gần nhất chứa cả nút đầu lẫn nút Lưu).
        const bar = save.locator('xpath=ancestor::div[.//button[@title="Quay lại danh sách"]][1]');
        return paddedShot(page, bar, { pad: 8 });
      },
    },
  ],
};
