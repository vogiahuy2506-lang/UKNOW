/**
 * Ảnh minh hoạ cho bài "Biểu mẫu: thu thông tin, chia sẻ và nhúng vào website"
 * (/huong-dan/bieu-mau).
 *
 * Seed chung không có biểu mẫu nào, nên các ảnh trong trang tự dựng một biểu mẫu
 * mẫu + bốn bài nộp qua API (`lib/shotFixtures.js`). Vì vậy chúng chỉ chạy ở máy
 * mình.
 */
import {
  sidebarShot, highlight, hideVolatileChrome, settle, contentShot,
  enclosingSection, tallViewportShot, maskLocalOrigin,
} from '../lib/shotHelpers.js';
import { ensureDemoForm, ensureDemoSubmissions } from '../lib/shotFixtures.js';

/** Vào app trước khi gọi API: `fetch('/api/…')` cần một origin và token trong storage. */
async function openApp(page) {
  await page.goto('/app/forms');
  await page.getByRole('heading', { name: 'Biểu mẫu', exact: true }).first()
    .waitFor({ state: 'visible', timeout: 30_000 });
}

async function openEditor(page) {
  await openApp(page);
  const form = await ensureDemoForm(page);
  await page.goto(`/app/forms/${form.id}/edit`);
  await page.getByRole('heading', { name: 'Danh sách trường thông tin' })
    .waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);
  await hideVolatileChrome(page);
  return form;
}

export default {
  slug: 'bieu-mau',
  shots: [
    {
      name: 'menu-bieu-mau',
      caption: 'menu bên trái đang mở nhóm Landing page, khoanh đỏ mục "Biểu mẫu"',
      async take(page, { baseURL }) {
        return sidebarShot(page, { groupName: 'Landing page', itemName: 'Biểu mẫu', baseURL });
      },
    },
    {
      name: 'soan-bieu-mau-them-truong',
      caption: 'trang soạn biểu mẫu, khoanh đỏ nút "Thêm trường" và một trường đang chọn kiểu dữ liệu',
      localOnly: true,
      async take(page) {
        await openEditor(page);
        const heading = page.getByRole('heading', { name: 'Danh sách trường thông tin' });
        const card = await enclosingSection(page, heading);
        await highlight(card.getByRole('button', { name: 'Thêm trường' }));
        // Ô "Kiểu dữ liệu" của trường đầu tiên — chính chỗ người dùng đổi kiểu.
        await highlight(card.locator('select').first());
        await page.waitForTimeout(200);
        // Cả khối cao hơn 1.100px (bốn trường); hai trường đầu là đủ thấy cấu trúc.
        return contentShot(page, card, { maxHeight: 470 });
      },
    },
    {
      name: 'giao-dien-bieu-mau',
      caption: 'mục Giao diện với hàng mẫu dựng sẵn, ô màu, ô font và khung Xem trước',
      localOnly: true,
      async take(page) {
        await openEditor(page);
        return tallViewportShot(page, 2400, async () => {
          const heading = page.getByRole('heading', { name: 'Giao diện', exact: true });
          await heading.scrollIntoViewIfNeeded();
          await page.waitForTimeout(400);
          const card = await enclosingSection(page, heading);
          return contentShot(page, card);
        });
      },
    },
    {
      name: 'hop-chia-se-qr',
      caption: 'hộp Chia sẻ & QR, khoanh đỏ bốn phần: mã nhúng, mã QR, đường dẫn trực tiếp, mã iframe',
      localOnly: true,
      async take(page) {
        await openApp(page);
        await ensureDemoForm(page);
        await page.goto('/app/forms');
        await settle(page);
        return tallViewportShot(page, 1500, async () => {
          await page.locator('[title="Chia sẻ & QR"]').first().click();
          const dialog = page.locator('div.fixed.inset-0').filter({ hasText: 'Chia sẻ & QR' }).last();
          await dialog.waitFor({ state: 'visible', timeout: 15_000 });
          await page.waitForTimeout(1200);   // mã QR vẽ bất đồng bộ
          await hideVolatileChrome(page);

          for (const label of ['Mã nhúng landing', 'Tải ảnh QR về máy', 'Đường dẫn trực tiếp', 'Nhúng bằng iframe']) {
            const anchor = dialog.getByText(label, { exact: false }).first();
            if (!(await anchor.isVisible().catch(() => false))) {
              throw new Error(`Hộp Chia sẻ & QR không có phần "${label}"`);
            }
            await highlight(anchor);
          }
          await maskLocalOrigin(page);
          await page.waitForTimeout(200);
          const panel = dialog.locator('div').filter({ hasText: 'Chia sẻ & QR' })
            .filter({ has: page.locator('canvas, img, svg') }).last();
          return contentShot(page, (await panel.count()) ? panel : dialog);
        });
      },
    },
    {
      name: 'bai-nop-cot-dong-y',
      caption: 'trang Bài nộp biểu mẫu với vài dòng bài nộp, khoanh đỏ cột "Đồng ý tiếp thị"',
      localOnly: true,
      async take(page) {
        await openApp(page);
        const form = await ensureDemoForm(page);
        await ensureDemoSubmissions(page, form);
        await page.goto(`/app/forms/${form.id}/submissions`);
        await page.locator('main table tbody tr').first().waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        await highlight(page.locator('main table thead th').filter({ hasText: 'Đồng ý tiếp thị' }));
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 560 });
      },
    },
  ],
};
