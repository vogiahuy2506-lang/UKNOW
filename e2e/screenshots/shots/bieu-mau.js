/**
 * Ảnh minh hoạ cho bài "Biểu mẫu: thu thông tin, chia sẻ và nhúng vào website"
 * (/huong-dan/bieu-mau).
 *
 * Seed chung không có biểu mẫu nào, nên các ảnh trong trang tự dựng một biểu mẫu
 * mẫu + bốn bài nộp qua API (`lib/shotFixtures.js`). Vì vậy chúng chỉ chạy ở máy
 * mình.
 *
 * Giao diện trình soạn từ 12/10/2026 (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING PR-3/4/5): hai cột — trái là danh sách câu hỏi
 * (kèm khung "AI hỗ trợ soạn"), phải là khung "Xem trước" cố định; thanh trên cùng có nút "Cài đặt" mở HỘP "Cài đặt biểu
 * mẫu" gồm sáu tab (Thông tin chung / Sau khi gửi / Đặt lịch hẹn / Thanh toán / Giao diện / Sản phẩm). Biểu mẫu MỚI bắt đầu
 * bằng bước chọn mẫu, có khung "Để AI soạn biểu mẫu giúp bạn" (ảnh chụp KHÔNG bấm "Tạo bằng AI" nên không tốn lượt AI).
 * Mọi ảnh trình soạn mở biểu mẫu mẫu ĐÃ LƯU (/edit); các thao tác thêm ô / đổi độ rộng chỉ nằm trong state trang, không bấm
 * Lưu nên không đổi DB. Ảnh bước chọn mẫu sau khi chọn mẫu nằm ở shots/dat-lich-giu-cho.js.
 *
 * Nút "Cài đặt" của trình soạn trùng tên mục "Cài đặt" của menu trái: luôn chọn trong `form-editor-topbar`.
 */
import {
  sidebarShot, highlight, highlightCell, hideVolatileChrome, settle, contentShot, tallViewportShot, maskLocalOrigin,
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

/** Mở hộp "Cài đặt biểu mẫu" (và chọn một tab nếu có). Trả về locator của hộp. */
async function openSettings(page, tabName) {
  await page.getByTestId('form-editor-topbar').getByRole('button', { name: 'Cài đặt', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cài đặt biểu mẫu' });
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  if (tabName) {
    await dialog.getByTestId('editor-settings-tabs').getByRole('button', { name: new RegExp(`^${tabName}`) }).click();
  }
  await page.waitForTimeout(300);
  return dialog;
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
      name: 'ai-soan-bieu-mau',
      caption: 'bước đầu khi tạo biểu mẫu mới, khoanh đỏ khung "Để AI soạn biểu mẫu giúp bạn" cùng ô mô tả và nút "Tạo bằng AI"',
      localOnly: true,
      async take(page) {
        // Không bấm "Tạo bằng AI": chỉ điền sẵn câu mô tả bằng một gợi ý nhanh, nên không tốn lượt AI và không cần khoá Gemini.
        await page.goto('/app/forms/new');
        const card = page.getByTestId('form-ai-draft-card');
        await card.waitFor({ state: 'visible', timeout: 30_000 });
        await page.getByTestId('form-ai-example-englishTrial').click();
        await settle(page);
        await hideVolatileChrome(page);
        await highlight(card.getByTestId('form-ai-description'));
        await highlight(card.getByTestId('form-ai-draft-submit'));
        await page.waitForTimeout(200);
        return contentShot(page, card, { pad: 20 });
      },
    },
    {
      name: 'soan-bieu-mau-tong-quan',
      caption: 'trang soạn biểu mẫu, bên trái danh sách câu hỏi, bên phải khung Xem trước, khoanh đỏ nút "Cài đặt" trên thanh trên cùng, hai nút AI và nút "Thêm trường"',
      localOnly: true,
      async take(page) {
        await openEditor(page);
        const topbar = page.getByTestId('form-editor-topbar');
        const list = page.getByTestId('form-field-list-pane');
        await highlight(topbar.getByRole('button', { name: 'Cài đặt', exact: true }));
        await highlight(page.getByTestId('form-ai-suggest-toggle'));
        await highlight(page.getByTestId('form-ai-rewrite-toggle'));
        await highlight(list.getByRole('button', { name: 'Thêm trường', exact: true }));
        await page.waitForTimeout(200);
        // Khối nhỏ nhất ôm cả thanh trên cùng lẫn khung Xem trước (vùng soạn, không gồm menu trái).
        const region = page.locator('div')
          .filter({ has: topbar })
          .filter({ has: page.getByTestId('form-preview-pane') })
          .last();
        return contentShot(page, region, { maxHeight: 880 });
      },
    },
    {
      name: 'bang-thuoc-tinh-o',
      caption: 'bảng thuộc tính của một ô đang mở, khoanh đỏ ô "Độ rộng", ô "Gợi ý trong ô nhập (placeholder)" và ô "Chữ hướng dẫn dưới tên trường"',
      localOnly: true,
      async take(page) {
        await openEditor(page);
        const row = page.getByTestId('field-row-0');
        await row.getByRole('button', { name: /Trường #1/ }).click();
        const panel = row.getByTestId('field-properties-panel');
        await panel.waitFor({ state: 'visible', timeout: 15_000 });
        // Điền thử cho ảnh có chữ minh hoạ — chỉ nằm trong state trang, không bấm Lưu.
        await panel.getByLabel('Độ rộng').selectOption('half');
        await panel.getByLabel('Gợi ý trong ô nhập (placeholder)').fill('Nguyễn Văn A');
        await panel.getByLabel('Chữ hướng dẫn dưới tên trường').fill('Ghi đúng họ tên như trên giấy tờ');
        await highlight(panel.getByLabel('Độ rộng'));
        await highlight(panel.getByLabel('Gợi ý trong ô nhập (placeholder)'));
        await highlight(panel.getByLabel('Chữ hướng dẫn dưới tên trường'));
        await page.waitForTimeout(200);
        return tallViewportShot(page, 1600, async () => contentShot(page, row, { pad: 20 }));
      },
    },
    {
      name: 'xem-truoc-nhieu-buoc',
      caption: 'khung Xem trước ở chế độ Điện thoại của biểu mẫu nhiều bước, thấy dòng "Bước 1/2" cùng nút "Tiếp"',
      localOnly: true,
      async take(page) {
        await openEditor(page);
        // Chia biểu mẫu mẫu thành hai bước: thêm khối "Ngắt trang" rồi một ô sau nó (chỉ trong state trang, không Lưu).
        const list = page.getByTestId('form-field-list-pane');
        await list.getByRole('button', { name: 'Loại khác…' }).click();
        await page.getByTestId('form-more-field-types').getByRole('button', { name: 'Ngắt trang' }).click();
        await list.getByRole('button', { name: 'Văn bản ngắn', exact: true }).click();
        const pane = page.getByTestId('form-preview-pane');
        await pane.getByRole('tab', { name: 'Điện thoại' }).click();
        const frame = page.getByTestId('form-preview-frame');
        await frame.getByTestId('form-step-progress').waitFor({ state: 'visible', timeout: 15_000 });
        await highlight(frame.getByTestId('form-step-progress'));
        await highlight(frame.getByRole('button', { name: 'Tiếp', exact: true }));
        await page.waitForTimeout(200);
        return tallViewportShot(page, 1800, async () => contentShot(page, pane, { pad: 20 }));
      },
    },
    {
      name: 'hop-cai-dat-bieu-mau',
      caption: 'hộp Cài đặt biểu mẫu đang mở, khoanh đỏ cột sáu tab Thông tin chung, Sau khi gửi, Đặt lịch hẹn, Thanh toán, Giao diện, Sản phẩm',
      localOnly: true,
      async take(page) {
        await openEditor(page);
        return tallViewportShot(page, 1500, async () => {
          const dialog = await openSettings(page);
          await highlight(dialog.getByTestId('editor-settings-tabs'));
          await page.waitForTimeout(200);
          return contentShot(page, dialog, { pad: 20 });
        });
      },
    },
    {
      name: 'giao-dien-bieu-mau',
      caption: 'tab Giao diện trong hộp Cài đặt biểu mẫu, thấy hàng mẫu dựng sẵn, ô màu, ô font, ô bố cục và ô tải ảnh banner, logo',
      localOnly: true,
      async take(page) {
        await openEditor(page);
        return tallViewportShot(page, 2000, async () => {
          const dialog = await openSettings(page, 'Giao diện');
          await dialog.getByText('Mẫu dựng sẵn', { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 });
          return contentShot(page, dialog, { pad: 20 });
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
        // Viền vẽ vào trong ô: outline của <th> bị khung bảng cắt mất cạnh trên.
        await highlightCell(page.locator('main table thead th').filter({ hasText: 'Đồng ý tiếp thị' }));
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 560 });
      },
    },
  ],
};
