/**
 * Ảnh minh hoạ cho bài "Đặt lịch hẹn và thu tiền giữ chỗ bằng mã QR"
 * (/huong-dan/dat-lich-giu-cho).
 *
 * Dùng chung biểu mẫu mẫu với bài `bieu-mau` (lib/shotFixtures.js): đã bật đặt
 * lịch, đã bật thanh toán giữ chỗ bằng chuyển khoản, có một bài đang "Chờ thanh
 * toán". Chỉ chạy ở máy mình.
 */
import {
  highlight, hideVolatileChrome, settle, contentShot, enclosingSection, tallViewportShot,
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
      caption: 'trang soạn biểu mẫu kéo xuống giữa trang, khoanh đỏ hai mục "Đặt lịch hẹn" và "Thanh toán giữ chỗ"',
      localOnly: true,
      async take(page) {
        // Biểu mẫu MỚI: cả hai mục đang tắt nên hai thẻ nằm sát nhau, một khung
        // hình là thấy cả hai. Ở biểu mẫu đã bật đặt lịch, thẻ thứ nhất cao cả
        // nghìn pixel, không cách nào chụp chung.
        await page.goto('/app/forms/new');
        const booking = page.getByRole('heading', { name: 'Đặt lịch hẹn', exact: true });
        const payment = page.getByRole('heading', { name: 'Thanh toán giữ chỗ', exact: true });
        await booking.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        return tallViewportShot(page, 2200, async () => {
          const bookingCard = await enclosingSection(page, booking);
          const paymentCard = await enclosingSection(page, payment);
          await highlight(bookingCard);
          await highlight(paymentCard);
          await bookingCard.scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);

          // Khung chụp = từ đỉnh thẻ Đặt lịch tới đáy thẻ Thanh toán.
          const a = await bookingCard.boundingBox();
          const b = await paymentCard.boundingBox();
          const pad = 16;
          const clip = {
            x: Math.max(0, Math.min(a.x, b.x) - pad),
            y: Math.max(0, a.y - pad),
            width: Math.max(a.width, b.width) + pad * 2,
            height: (b.y + b.height) - a.y + pad * 2,
          };
          return { screenshot: (options = {}) => page.screenshot({ ...options, clip }) };
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
        await highlight(page.locator('main table thead th').filter({ hasText: /Mã & số tiền/i }));
        await highlight(row.getByRole('button', { name: 'Đã nhận tiền' }));
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 360 });
      },
    },
  ],
};
