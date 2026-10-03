/**
 * Ảnh minh hoạ cho bài "Đặt lịch hẹn và thu tiền giữ chỗ bằng mã QR"
 * (/huong-dan/dat-lich-giu-cho).
 *
 * Dùng chung biểu mẫu mẫu với bài `bieu-mau` (lib/shotFixtures.js): đã bật đặt
 * lịch, đã bật thanh toán giữ chỗ bằng chuyển khoản, có một bài đang "Chờ thanh
 * toán". Chỉ chạy ở máy mình.
 */
import {
  highlight, highlightCell, hideVolatileChrome, settle, contentShot, enclosingSection, tallViewportShot, bandShot,
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
  await page.getByRole('heading', { name: 'Đặt lịch hẹn', exact: true })
    .waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);
  await hideVolatileChrome(page);
  return form;
}

/** Chụp trọn một thẻ của trình soạn (thẻ thường cao hơn màn hình). */
async function sectionCardShot(page, headingName) {
  return tallViewportShot(page, 2600, async () => {
    const heading = page.getByRole('heading', { name: headingName, exact: true });
    await heading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const card = await enclosingSection(page, heading);
    return contentShot(page, card);
  });
}

export default {
  slug: 'dat-lich-giu-cho',
  shots: [
    {
      name: 'hai-muc-dat-lich-thanh-toan',
      // Ở biểu mẫu mới, hai mục này là hai thẻ thu gọn tên "Thêm đặt lịch hẹn" / "Thu tiền khi gửi" (đúng nhãn vi.js
      // `forms.editorPage.addBlock.*`, và đúng đoạn văn ngay trên ô ảnh).
      caption: 'trang soạn biểu mẫu kéo xuống giữa trang, khoanh đỏ hai thẻ thu gọn "Thêm đặt lịch hẹn" và "Thu tiền khi gửi"',
      localOnly: true,
      async take(page) {
        // Đường thật của người dùng: Tạo biểu mẫu mới -> chọn mẫu "Đăng ký tư vấn" (không bật sẵn đặt lịch / thu tiền)
        // -> kéo xuống dưới phần câu hỏi. Chưa lưu gì nên không để lại biểu mẫu nào trong DB.
        await page.goto('/app/forms/new');
        const consult = page.getByTestId('form-template-consult');
        await consult.waitFor({ state: 'visible', timeout: 30_000 });
        await consult.click();
        const bookingCard = page.locator('button#section-booking');
        const paymentCard = page.locator('button#section-payment');
        await bookingCard.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        return tallViewportShot(page, 2600, async () => {
          await highlight(bookingCard);
          await highlight(paymentCard);
          await page.waitForTimeout(200);
          // Dải từ thẻ "Sau khi gửi" (thu gọn, ngay trên) tới thẻ "Giao diện" (ngay dưới): thấy hai thẻ cần khoanh nằm
          // giữa các khối khác của trang.
          return bandShot(page, page.locator('#section-settings'), page.locator('button#section-theme'));
        });
      },
    },
    {
      name: 'dat-lich-hen-da-bat',
      caption: 'mục Đặt lịch hẹn đã bật, thấy khung giờ từng ngày và ba ô sức chứa, số ngày đặt trước, báo trước tối thiểu',
      localOnly: true,
      async take(page) {
        await openEditor(page);
        return sectionCardShot(page, 'Đặt lịch hẹn');
      },
    },
    {
      name: 'thanh-toan-giu-cho-chuyen-khoan',
      caption: 'mục Thanh toán giữ chỗ đang chọn Chuyển khoản ngân hàng, đã điền ngân hàng, số tài khoản, tên chủ tài khoản, số tiền',
      localOnly: true,
      async take(page) {
        await openEditor(page);
        return sectionCardShot(page, 'Thanh toán giữ chỗ');
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
