/**
 * Ảnh minh hoạ cho bài "Cách sử dụng Voucher giảm giá" (/huong-dan/voucher).
 *
 * CẢ BA ẢNH ĐỀU `localOnly` — chúng phải BẤM vào nút chọn gói ở trang bảng giá
 * để tới màn hình thanh toán. Trên tài khoản thật thì không được bấm.
 *
 * Vì sao vẫn an toàn ở máy mình: bước 1 của /checkout chỉ là một cái form. Nút
 * "Áp dụng" gọi `validateVoucher` — thuần đọc, không tạo đơn, không gọi PayOS.
 * Đơn hàng chỉ sinh ra khi bấm nút tạo mã QR sang bước 2, và ở đây KHÔNG bấm.
 *
 * Cần `E2E_SEED_VOUCHERS=1` (nằm trong `E2E_SEED_ALL=1`): nó dựng WELCOME50K
 * còn hạn và tắt ưu đãi tự động, để ảnh "trước khi áp mã" sạch một dòng giảm
 * giá duy nhất thay vì hai.
 */
import {
  highlight, hideVolatileChrome, settle, contentShot, enclosingSection,
} from '../lib/shotHelpers.js';

/**
 * Chờ một phần tử hiện ra, trả về true/false thay vì ném lỗi.
 *
 * KHÔNG dùng `locator.isVisible({ timeout })` cho việc này: `isVisible()` kiểm
 * tra TỨC THÌ, tham số timeout không làm nó chờ. Thứ nào xuất hiện sau một nhịp
 * (hộp thoại vừa bấm, dòng giảm giá sau khi gọi API) đều bị trả false oan.
 */
async function appears(locator, timeout = 15_000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

/** Mã do seed dựng — xem seedVouchers() trong e2e/scripts/seed-demo-data.js. */
const DEMO_CODE = 'WELCOME50K';

/** Gói dùng để chụp. Phải đắt hơn `min_order_amount` của mã (500.000đ). */
const PLAN_NAME = 'Gói Pro';

/**
 * Mở màn hình thanh toán ở bước 1.
 *
 * KHÔNG mở thẳng /checkout được: trang đọc gói từ `location.state`, vào trực
 * tiếp là nó đá ngược về /pricing. Phải đi qua nút chọn gói thật.
 */
async function openCheckout(page) {
  await page.goto('/pricing');
  await page.locator('#pricing').first().waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);

  const card = page.locator('#pricing .grid > *').filter({ hasText: PLAN_NAME }).first();
  const cta = card.locator('button:not([disabled])').last();
  const label = (await cta.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  if (!label || /Quản lý gói|Gói hiện tại/i.test(label)) {
    throw new Error(
      `Thẻ "${PLAN_NAME}" không có nút nâng cấp nào bấm được (đang là "${label || 'không có nút'}").\n`
      + 'Thường là do tài khoản đang ở chính gói đó, hoặc đang có lệnh hẹn hạ gói khoá luồng nâng gói.\n'
      + 'Nạp lại DB với gói thấp hơn: E2E_SEED_PLAN=starter',
    );
  }
  await cta.click();

  // Nâng gói khi gói cũ còn hạn thì hiện hộp thoại "Xác nhận nâng cấp" cảnh báo
  // mất số ngày còn lại; chưa bấm qua thì KHÔNG sang trang thanh toán.
  // Vẫn chỉ đọc: nút này chỉ điều hướng kèm state, đơn hàng sinh ra ở bước 2.
  const confirmUpgrade = page.getByRole('button', { name: 'Đồng ý nâng cấp', exact: true });
  if (await appears(confirmUpgrade, 8_000)) {
    await confirmUpgrade.click();
  }

  await page.waitForURL(/\/checkout/, { timeout: 30_000 }).catch(() => {
    throw new Error(`Bấm "${label}" xong nhưng không sang /checkout — còn hộp thoại nào chưa xử lý?`);
  });

  const voucherInput = page.getByPlaceholder('Nhập mã voucher').first();
  await voucherInput.waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);
  return voucherInput;
}

/** Khối bo góc chứa ô nhập mã (thẻ cha gần nhất của <input>). */
function voucherBox(page) {
  return page.getByPlaceholder('Nhập mã voucher').first().locator('xpath=ancestor::div[2]');
}

/** Dòng "Tổng cộng" trong bảng tổng kết tiền. */
function totalRow(page) {
  return page.locator('div').filter({ hasText: /^Tổng cộng/ }).last();
}

export default {
  slug: 'voucher',
  shots: [
    {
      name: 'o-nhap-ma',
      caption: 'ô nhập mã voucher trên màn hình thanh toán, khoanh đỏ ô nhập mã và nút Áp dụng',
      localOnly: true,
      async take(page) {
        const input = await openCheckout(page);

        // Gõ sẵn mã nhưng KHÔNG bấm: nút "Áp dụng" bị disable khi ô trống, để
        // trống thì ảnh chụp ra một cái nút xám mờ, nhìn như hỏng.
        await input.fill(DEMO_CODE);
        await page.waitForTimeout(200);

        await hideVolatileChrome(page);
        await highlight(input);
        await highlight(page.getByRole('button', { name: 'Áp dụng', exact: true }));
        await page.waitForTimeout(200);
        return contentShot(page, voucherBox(page));
      },
    },
    {
      name: 'tong-ket-sau-khi-ap-ma',
      caption: 'bảng tổng kết tiền sau khi áp mã thành công, khoanh đỏ dòng giảm giá và dòng tổng cộng',
      localOnly: true,
      async take(page) {
        const input = await openCheckout(page);
        await input.fill(DEMO_CODE);
        await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();

        // Chờ dòng "Giảm giá" hiện ra. Nút đổi thành "Bỏ mã" khi áp thành công,
        // nhưng bám vào dòng giảm giá chắc hơn — đó chính là thứ chú thích đòi.
        const discountRow = page.locator('main, body').locator('div').filter({ hasText: /^Giảm giá/ }).last();
        if (!(await appears(discountRow))) {
          throw new Error(
            `Áp mã "${DEMO_CODE}" không ra dòng giảm giá nào.\n`
            + 'Nạp lại DB kèm voucher mẫu:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_VOUCHERS=1 node scripts/seed-test-db.js\n'
            + `Mã này đòi đơn từ 500.000đ — gói "${PLAN_NAME}" phải đắt hơn mức đó.`,
          );
        }

        await hideVolatileChrome(page);
        await highlight(discountRow);
        await highlight(totalRow(page));
        await page.waitForTimeout(200);

        // Đi ngược từ dòng "Tổng cộng" lên thẻ bao trọn bảng tổng kết. Bám thẳng
        // vào div chứa "Phí dịch vụ" thì `.last()` trúng đúng cái DÒNG đó, ảnh
        // ra một dải cao 80px mất cả dòng Tổng cộng.
        // minWidth 250: cột này chỉ rộng ~364px CSS, để mặc định 400 là nó đi
        // quá lên khối bao ngoài và chụp cả nửa trang.
        return contentShot(page, await enclosingSection(page, totalRow(page), { minWidth: 250 }));
      },
    },
    {
      name: 'thong-bao-ma-khong-hop-le',
      caption: 'thông báo Voucher không hợp lệ hiện lên sau khi bấm Áp dụng với một mã sai',
      localOnly: true,
      async take(page) {
        const input = await openCheckout(page);

        // Cố ý gõ một mã không tồn tại. Chỉ gọi endpoint kiểm tra mã, không ghi gì.
        await input.fill('MAKHONGTONTAI');

        // KHÔNG gọi hideVolatileChrome ở đây: nó ẩn luôn khay thông báo, mà thông
        // báo chính là thứ cần chụp. Ẩn tay đúng bảng trợ lý AI thay thế.
        await page.addStyleTag({
          content: '[data-testid="ai-assistant-panel"] { visibility: hidden !important; }',
        });
        await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();

        const toast = page.getByText('Voucher không hợp lệ', { exact: false }).first();
        if (!(await appears(toast))) {
          throw new Error(
            'Không thấy thông báo "Voucher không hợp lệ".\n'
            + 'Kiểm tra backend có đang chạy không — lỗi mạng ra thông báo khác.',
          );
        }
        await page.waitForTimeout(300);   // chờ hoạt ảnh trượt vào xong

        // Chụp cả bề ngang khung nhìn: thông báo nổi ở giữa đỉnh màn hình, cắt
        // hẹp lại thì nó lệch sang một bên, người đọc không biết nó hiện ở đâu.
        // Nhưng cắt bớt phần dưới — khung nhìn cao 900 mà thẻ thanh toán kết
        // thúc quanh 690, để nguyên thì gần một phần ba ảnh là nền trắng.
        const card = await enclosingSection(page, totalRow(page), { minWidth: 700 });
        const box = await card.boundingBox();
        const viewport = page.viewportSize();
        const height = Math.min(viewport.height, Math.round((box?.y ?? 0) + (box?.height ?? 0) + 24));
        return {
          screenshot: (options) => page.screenshot({
            ...options,
            clip: { x: 0, y: 0, width: viewport.width, height },
          }),
        };
      },
    },
  ],
};
