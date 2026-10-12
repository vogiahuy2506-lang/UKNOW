/**
 * Ảnh minh hoạ cho bài "Đặt lịch hẹn và thu tiền giữ chỗ bằng mã QR"
 * (/huong-dan/dat-lich-giu-cho).
 *
 * Dùng chung biểu mẫu mẫu với bài `bieu-mau` (lib/shotFixtures.js): đã bật đặt
 * lịch, đã bật thanh toán giữ chỗ bằng chuyển khoản, có một bài đang "Chờ thanh
 * toán". Chỉ chạy ở máy mình.
 *
 * Giao diện từ 12/10/2026 (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING PR-3): Đặt lịch hẹn và Thanh toán là hai TAB trong hộp
 * "Cài đặt biểu mẫu" (nút "Cài đặt" trên thanh trên cùng của trang soạn), không còn hai thẻ thu gọn "Thêm đặt lịch hẹn" /
 * "Thu tiền khi gửi". Nút "Cài đặt" của trình soạn trùng tên mục "Cài đặt" của menu trái: luôn chọn trong `form-editor-topbar`.
 */
import {
  highlight, highlightCell, hideVolatileChrome, settle, contentShot, tallViewportShot,
} from '../lib/shotHelpers.js';
import { ensureDemoForm, ensureDemoSubmissions, withDb } from '../lib/shotFixtures.js';

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

/** Chụp trọn hộp Cài đặt ở một tab (tab thường cao hơn màn hình nên nới khung nhìn). */
async function settingsTabShot(page, tabName) {
  await openEditor(page);
  return tallViewportShot(page, 2400, async () => {
    const dialog = await openSettings(page, tabName);
    return contentShot(page, dialog, { pad: 20 });
  });
}

export default {
  slug: 'dat-lich-giu-cho',
  shots: [
    {
      name: 'hai-muc-dat-lich-thanh-toan',
      caption: 'hộp Cài đặt biểu mẫu đang mở, khoanh đỏ hai tab "Đặt lịch hẹn" và "Thanh toán"',
      localOnly: true,
      async take(page) {
        await openEditor(page);
        return tallViewportShot(page, 1500, async () => {
          const dialog = await openSettings(page, 'Đặt lịch hẹn');
          const tabs = dialog.getByTestId('editor-settings-tabs');
          await highlight(tabs.getByRole('button', { name: /^Đặt lịch hẹn/ }));
          await highlight(tabs.getByRole('button', { name: /^Thanh toán/ }));
          await page.waitForTimeout(200);
          return contentShot(page, dialog, { pad: 20, maxHeight: 700 });
        });
      },
    },
    {
      name: 'goi-y-khai-them',
      caption: 'đầu danh sách câu hỏi của biểu mẫu vừa chọn mẫu Đặt lịch hẹn, khoanh đỏ khung xanh nhắc việc cùng nút "Khai khung giờ đặt lịch"',
      localOnly: true,
      async take(page) {
        // Đường thật của người dùng: Tạo biểu mẫu mới -> chọn mẫu "Đặt lịch hẹn" (bật sẵn tab Đặt lịch) -> khung xanh nhắc
        // khai khung giờ hiện ở đầu danh sách câu hỏi. Chưa lưu gì nên không để lại biểu mẫu nào trong DB.
        await page.goto('/app/forms/new');
        const template = page.getByTestId('form-template-booking');
        await template.waitFor({ state: 'visible', timeout: 30_000 });
        await template.click();
        const hints = page.getByTestId('form-setup-hints');
        await hints.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        await highlight(hints.getByRole('button', { name: 'Khai khung giờ đặt lịch', exact: true }));
        await page.waitForTimeout(200);
        return contentShot(page, hints, { pad: 20 });
      },
    },
    {
      name: 'dat-lich-hen-da-bat',
      caption: 'tab Đặt lịch hẹn trong hộp Cài đặt biểu mẫu đã bật, thấy khung giờ từng ngày và ba ô sức chứa, số ngày đặt trước, báo trước tối thiểu',
      localOnly: true,
      async take(page) {
        return settingsTabShot(page, 'Đặt lịch hẹn');
      },
    },
    {
      name: 'thanh-toan-giu-cho-chuyen-khoan',
      caption: 'tab Thanh toán trong hộp Cài đặt biểu mẫu đang chọn Chuyển khoản ngân hàng, đã điền ngân hàng, số tài khoản, tên chủ tài khoản, số tiền',
      localOnly: true,
      async take(page) {
        return settingsTabShot(page, 'Thanh toán');
      },
    },
    {
      name: 'man-giu-cho-tren-dien-thoai',
      caption: 'màn giữ chỗ trên điện thoại của khách: đồng hồ đếm ngược, mã QR chuyển khoản và các dòng thông tin có nút Sao chép',
      localOnly: true,
      async take(page, { baseURL }) {
        await openApp(page);
        const form = await ensureDemoForm(page);
        await ensureDemoSubmissions(page, form);

        // Giữ chỗ chỉ sống 30 phút. Nới hạn cho bài đang chờ để lượt chụp nào cũng
        // thấy đồng hồ còn chạy, khỏi phải nộp bài mới mỗi lần (mỗi máy chỉ được
        // giữ vài chỗ chưa thanh toán).
        const accessToken = await withDb(async (db) => {
          const { rows } = await db.query(
            `UPDATE form_submissions
                SET hold_expires_at = NOW() + INTERVAL '28 minutes'
              WHERE id = (
                SELECT id FROM form_submissions
                 WHERE form_id = $1 AND status = 'pending_payment'
                 ORDER BY id DESC LIMIT 1
              )
            RETURNING access_token`,
            [form.id],
          );
          return rows[0]?.access_token;
        });
        if (!accessToken) throw new Error('Không có bài nộp nào đang chờ thanh toán.');

        // Khổ điện thoại, context riêng: trang công khai, không cần đăng nhập.
        const context = await page.context().browser().newContext({
          storageState: { cookies: [], origins: [] },   // khách vãng lai, không mang phiên của chủ form
          baseURL,
          viewport: { width: 420, height: 900 },
          deviceScaleFactor: 2,
          locale: 'vi-VN',
          timezoneId: 'Asia/Ho_Chi_Minh',
          colorScheme: 'light',
        });
        const phone = await context.newPage();
        await phone.goto(`/f/${form.publicKey}/s/${accessToken}`);
        await phone.locator('img[alt="Mã QR chuyển khoản"]').waitFor({ state: 'visible', timeout: 30_000 });
        await phone.waitForTimeout(800);
        return {
          screenshot: async (options = {}) => {
            try {
              return await phone.screenshot({ ...options, fullPage: true });
            } finally {
              await context.close();
            }
          },
        };
      },
    },
    {
      name: 'bai-nop-cho-thanh-toan',
      caption: 'trang Bài nộp, một dòng đang "Chờ thanh toán", khoanh đỏ cột "Mã & số tiền" và nút "Đã nhận tiền"',
      localOnly: true,
      async take(page) {
        await openApp(page);
        const form = await ensureDemoForm(page);
        await ensureDemoSubmissions(page, form);
        await page.goto(`/app/forms/${form.id}/submissions`);
        const row = page.locator('main table tbody tr').filter({ hasText: 'Chờ thanh toán' }).first();
        await row.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        await highlightCell(page.locator('main table thead th').filter({ hasText: /Mã & số tiền/i }));
        await highlight(row.getByRole('button', { name: 'Đã nhận tiền' }));
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 360 });
      },
    },
  ],
};
