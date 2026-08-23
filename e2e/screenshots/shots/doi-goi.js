/**
 * Ảnh minh hoạ cho bài "Đổi gói — nâng cấp, hạ gói, đổi kỳ hạn" (/huong-dan/doi-goi).
 *
 * `caption` là khoá tìm ô chú thích "[ẢNH: …]" trong body_html của bài. Khoá phải
 * đủ riêng để khớp ĐÚNG MỘT ô — script chèn sẽ từ chối nếu khớp 0 hoặc nhiều ô.
 *
 * Bài này có 7 ô chú thích, ở đây mới làm 3 ô. Bốn ô còn lại cần trạng thái tài
 * khoản đặc biệt, không dựng được bằng thao tác chỉ-đọc trên tài khoản thật:
 *   - "hộp cảnh báo trước khi xác nhận nâng gói" → phải bấm vào luồng nâng gói,
 *     có nguy cơ tạo đơn hàng thật. Cố ý không tự động hoá.
 *   - "lệnh hẹn đổi gói kèm ngày hiệu lực" → cần một lệnh hạ gói đang chờ.
 *   - "landing page bị tô đỏ vì vượt hạn mức" → cần tài khoản đang trong ân hạn.
 *   - "một mục đã bị khoá sau khi hết ân hạn" → cần tài khoản đã hết ân hạn.
 * Ba cái sau dựng được nếu chụp trên môi trường test có seed sẵn các trạng thái đó.
 */
import {
  sidebarShot, regionShot, highlight, hideVolatileChrome, settle, contentShot,
} from '../lib/shotHelpers.js';

export default {
  slug: 'doi-goi',
  shots: [
    {
      name: 'topbar-nang-cap',
      caption: 'thanh ngang trên cùng, khoanh đỏ nút "Nâng cấp"',
      async take(page) {
        await page.goto('/app');
        const header = page.locator('header').first();
        await header.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        await highlight(header.getByRole('button', { name: 'Nâng cấp', exact: true }));
        return header;
      },
    },
    {
      name: 'bang-gia',
      caption: 'bảng giá với các gói xếp ngang',
      async take(page) {
        // Đăng nhập sẵn nên gói đang dùng được đánh dấu — đúng như chú thích mô tả.
        return regionShot(page, { path: '/pricing', clip: '#pricing', waitFor: '#pricing' });
      },
    },
    {
      name: 'menu-mua-them-han-muc',
      caption: 'khoanh đỏ mục "Mua thêm hạn mức"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'Gói & Thanh toán',
          itemName: 'Mua thêm hạn mức',
          baseURL,
        });
      },
    },

    // Từ đây trở xuống chỉ chạy ở máy mình: phải BẤM vào luồng đổi gói, và cần
    // trạng thái do seed dựng sẵn. Trên tài khoản thật thì không đụng vào.
    {
      name: 'canh-bao-mat-ngay',
      caption: 'hộp cảnh báo trước khi xác nhận nâng gói',
      localOnly: true,
      async take(page) {
        await regionShot(page, { path: '/pricing', clip: '#pricing', waitFor: '#pricing' });

        // Bấm nút của một gói CAO HƠN gói đang dùng. Nút này chỉ mở hộp thoại
        // cảnh báo, chưa tạo đơn — đơn chỉ sinh ra nếu bấm tiếp "Đồng ý nâng cấp",
        // và ta cố ý dừng lại trước bước đó.
        const proCard = page.locator('#pricing .grid > *').filter({ hasText: 'Gói Pro' }).first();
        const cta = proCard.getByRole('button', { name: /Đăng ký gói|Nâng cấp ngay/ });
        if (!(await cta.isVisible().catch(() => false))) {
          throw new Error(
            'Nút nâng gói đang bị khoá — thường là do tài khoản đã có lệnh hẹn đổi gói.\n'
            + 'Nạp lại DB KHÔNG kèm E2E_SEED_PENDING_CHANGE rồi chạy lại:\n'
            + '  E2E_SEED_DEMO=1 node scripts/seed-test-db.js',
          );
        }
        await cta.click();

        const dialog = page.locator('div.fixed.inset-0').filter({ hasText: 'Xác nhận nâng cấp gói' }).first();
        await dialog.waitFor({ state: 'visible', timeout: 15_000 });
        await hideVolatileChrome(page);
        await highlight(dialog.locator('p').filter({ hasText: 'ngày sử dụng' }));
        await page.waitForTimeout(200);
        return dialog.locator('div.bg-white').first();
      },
    },
    {
      name: 'lenh-hen-doi-goi',
      // Bài viết từng nói dải này nằm ở trang "Tổng quan gói", nhưng
      // BillingHubPage không hề có nó — dải chỉ hiện trên trang bảng giá. Câu chữ
      // đã được sửa lại cho khớp (xem scripts/patchHelpArticleText.js).
      caption: 'lệnh hẹn đổi gói kèm ngày hiệu lực',
      localOnly: true,
      async take(page) {
        await page.goto('/pricing');
        const banner = page.locator('#pricing').getByText('Lệnh hẹn đổi gói đang chờ kích hoạt').first();
        if (!(await banner.isVisible({ timeout: 20_000 }).catch(() => false))) {
          throw new Error(
            'Chưa có lệnh hẹn đổi gói. Nạp lại DB kèm cờ rồi chạy riêng ảnh này:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_PENDING_CHANGE=1 node scripts/seed-test-db.js\n'
            + 'Lưu ý: bật cờ đó thì ảnh "canh-bao-mat-ngay" sẽ hỏng, vì lệnh hẹn khoá luồng nâng gói.',
          );
        }
        await settle(page);
        await hideVolatileChrome(page);
        const box = page.locator('#pricing div').filter({ hasText: 'Lệnh hẹn đổi gói đang chờ kích hoạt' }).last();
        await highlight(box);
        await page.waitForTimeout(200);
        return box;
      },
    },
    {
      name: 'landing-page-vuot-han-muc',
      caption: 'danh sách landing page trong thời gian ân hạn',
      localOnly: true,
      async take(page) {
        return resourceLockShot(page, {
          expect: 'Sắp bị khoá',
          dropExtras: true,
          seedHint: 'E2E_SEED_DEMO=1 E2E_SEED_OVERAGE=grace node scripts/seed-test-db.js',
        });
      },
    },
    {
      name: 'muc-bi-khoa',
      caption: 'một mục đã bị khoá sau khi hết ân hạn',
      localOnly: true,
      async take(page) {
        return resourceLockShot(page, {
          expect: 'Đã khoá',
          seedHint: 'E2E_SEED_DEMO=1 E2E_SEED_OVERAGE=locked node scripts/seed-test-db.js',
        });
      },
    },
  ],
};

/**
 * Mở trang Tổng quan gói → tab "Tài nguyên khoá", tìm khối Landing page, khoanh
 * đỏ các dòng mang nhãn `expect` rồi chụp cả khối.
 *
 * Hai nhãn "Sắp bị khoá" và "Đã khoá" ứng với hai trạng thái LOẠI TRỪ NHAU (còn
 * ân hạn / hết ân hạn), nên mỗi lượt seed chỉ dựng được một cái.
 *
 * `dropExtras` mô phỏng đúng thao tác của người dùng thật: nhãn "Sắp bị khoá"
 * chỉ hiện với mục BỊ BỎ CHỌN, mà mặc định giao diện tích sẵn tất cả — người
 * dùng phải tự chọn giữ lại cái nào. Chỉ đổi trạng thái tại chỗ, KHÔNG bấm
 * "Lưu lựa chọn" nên không ghi gì xuống DB.
 */
async function resourceLockShot(page, { expect: expectedLabel, seedHint, dropExtras = false }) {
  await page.goto('/app/billing');
  await page.getByRole('button', { name: 'Tài nguyên khoá' }).click();

  const section = page.locator('section').filter({ hasText: 'Landing page' }).first();
  await section.waitFor({ state: 'visible', timeout: 20_000 });

  if (dropExtras) {
    const boxes = await section.locator('input[type="checkbox"]').all();
    for (const box of boxes.slice(1)) {
      if (await box.isChecked()) await box.uncheck();
    }
  }

  const badges = section.getByText(expectedLabel, { exact: true });
  if (!(await badges.first().isVisible({ timeout: 10_000 }).catch(() => false))) {
    throw new Error(
      `Không thấy landing page nào mang nhãn "${expectedLabel}". Nạp lại DB rồi chạy riêng ảnh này:\n  ${seedHint}`,
    );
  }

  await settle(page);
  await hideVolatileChrome(page);
  for (const badge of await badges.all()) await highlight(badge);
  await page.waitForTimeout(200);
  return contentShot(page, section);
}
