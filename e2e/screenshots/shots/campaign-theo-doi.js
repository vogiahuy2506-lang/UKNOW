/**
 * Ảnh minh hoạ cho bài "Theo dõi chiến dịch đang chạy" (/huong-dan/campaign-theo-doi).
 *
 * Cần `E2E_SEED_CAMPAIGNS=1` (nằm trong `E2E_SEED_ALL=1`): 4 chiến dịch ở các
 * trạng thái khác nhau kèm campaign_runs có số liệu gửi.
 *
 * Lưu ý tên gọi: mục menu là "Hiệu quả chiến dịch" nhưng tiêu đề trang là
 * "Giám sát gửi tin". Bài viết dùng đúng cả hai tên ở đúng chỗ.
 */
import {
  sidebarShot, highlight, hideVolatileChrome, settle, contentShot, enclosingSection, paddedShot,
} from '../lib/shotHelpers.js';
import { ensureFailedRunDemo } from '../lib/shotFixtures.js';

const MONITOR_PATH = '/app/delivery-monitor';

/** Chụp một mục có tiêu đề cho trước trên trang giám sát. */
async function sectionShot(page, { heading, mark }) {
  await page.goto(MONITOR_PATH);
  const title = page.getByRole('heading', { name: heading }).first();
  await title.waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);
  await hideVolatileChrome(page);

  // Khối chứa tiêu đề — đi ngược lên tới khi đủ lớn. Đếm cứng số cấp cha thì
  // mỗi mục lồng một kiểu, có mục ra khối rỗng và Playwright báo "Clipped area".
  const section = await enclosingSection(page, title);
  if (mark) {
    const target = section.getByText(mark, { exact: false }).first();
    if (await target.isVisible().catch(() => false)) await highlight(target);
  }
  await page.waitForTimeout(200);
  return contentShot(page, section);
}

export default {
  slug: 'campaign-theo-doi',
  shots: [
    {
      name: 'menu-hieu-qua-chien-dich',
      caption: 'khoanh đỏ mục "Hiệu quả chiến dịch"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'Chiến dịch',
          itemName: 'Hiệu quả chiến dịch',
          baseURL,
        });
      },
    },
    {
      name: 'chon-khoang-thoi-gian',
      caption: 'đầu trang, khoanh đỏ công tắc tự làm mới và ô chọn khoảng thời gian',
      async take(page) {
        await page.goto(MONITOR_PATH);
        const period = page.locator('main').locator('div').filter({
          has: page.getByRole('button', { name: '7 ngày', exact: true }),
        }).filter({
          has: page.getByRole('button', { name: '90 ngày', exact: true }),
        }).last();
        await period.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        await highlight(period);
        const refresh = page.getByRole('button', { name: 'Làm mới', exact: true }).first();
        if (await refresh.isVisible().catch(() => false)) await highlight(refresh);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 260 });
      },
    },
    {
      name: 'hang-o-so-lieu',
      caption: 'hàng ô số liệu ở đầu trang Giám sát gửi tin',
      async take(page) {
        await page.goto(MONITOR_PATH);
        const firstCard = page.getByText('Tin đã gửi', { exact: false }).first();
        await firstCard.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        // Hàng thẻ số liệu nằm ngay dưới phần tiêu đề trang.
        return contentShot(page, page.locator('main').first(), { maxHeight: 420 });
      },
    },
    {
      name: 'chien-dich-gan-day',
      caption: 'mục Chiến dịch gần đây',
      async take(page) {
        return sectionShot(page, { heading: /Chiến dịch gần đây/, mark: 'Đang chạy' });
      },
    },
    {
      name: 'hieu-qua-theo-kenh',
      caption: 'mục Hiệu quả theo kênh',
      async take(page) {
        return sectionShot(page, { heading: /Hiệu quả theo kênh/ });
      },
    },
    {
      name: 'toc-do-gui-theo-gio',
      caption: 'biểu đồ Tốc độ gửi theo giờ',
      async take(page) {
        return sectionShot(page, { heading: /Tốc độ gửi theo giờ/ });
      },
    },
    {
      name: 'tinh-trang-tai-khoan',
      caption: 'mục Tình trạng tài khoản',
      async take(page) {
        return sectionShot(page, { heading: /Tình trạng tài khoản/ });
      },
    },
    {
      name: 'loi-gan-day',
      caption: 'mục Lỗi gần đây',
      async take(page) {
        const shot = await sectionShot(page, { heading: /Lỗi gần đây/ });
        // Seed hiện để tỉ lệ lỗi 0 nên mục này có thể rỗng — báo rõ thay vì cho
        // ra một khung trống vẫn tính là thành công.
        const empty = page.getByText(/Không có lỗi|Chưa có lỗi/i).first();
        if (await empty.isVisible().catch(() => false)) {
          throw new Error(
            'Mục "Lỗi gần đây" đang rỗng. Cần seed vài lượt gửi thất bại\n'
            + '(campaign_run_recipient_steps với trạng thái lỗi) thì ảnh mới có nội dung.',
          );
        }

        // Chốt chặn: lỗi DO DỮ LIỆU MẪU SINH RA không được lọt vào bài hướng dẫn.
        //
        // Worker nền quét campaign_runs có status='running'; chiến dịch Zalo mẫu
        // không có node nào nên bị đánh failed kèm đúng dòng dưới đây. Người đọc
        // thấy một lỗi không tồn tại trong sản phẩm thật. Chuyện này ĐÃ lọt lên
        // production một lần — nên chặn tại đây thay vì trông vào việc nhớ đặt
        // biến môi trường.
        const seedArtifact = 'Chiến dịch không có node nào';
        if ((await page.locator('body').innerText()).includes(seedArtifact)) {
          throw new Error(
            `Trang đang hiện lỗi do dữ liệu mẫu sinh ra: "${seedArtifact}".\n`
            + 'Khởi động lại backend với SCHEDULER_ENABLED=false, nạp lại DB rồi chụp lại:\n'
            + '  SCHEDULER_ENABLED=false npm run dev        (ở thư mục backend)\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_CAMPAIGNS=1 node scripts/seed-test-db.js',
          );
        }
        return shot;
      },
    },
    {
      name: 'xem-chi-tiet-loi',
      caption: 'một dòng chiến dịch đã bấm "Xem chi tiết lỗi", thấy bảng Người nhận / Lý do / Số lần / Lần cuối',
      localOnly: true,
      async take(page) {
        // Seed để mọi lượt chạy 0 lỗi → nút "Xem chi tiết lỗi" không bao giờ hiện. Nêm 3 người nhận Zalo
        // gửi hỏng vào lượt chạy mới nhất (lib/shotFixtures.ensureFailedRunDemo).
        const { campaignName } = await ensureFailedRunDemo();
        // Bảng chiến dịch rộng hơn khung 1440px (cột Tỷ lệ lỗi bị cắt) → nới khung, chụp xong trả lại.
        const viewport = page.viewportSize();
        // Khung cao để cả dòng chiến dịch lẫn bảng lỗi mở ra bên dưới cùng nằm trong khung nhìn — trang
        // cuộn bên trong <main>, toạ độ chụp là toạ độ khung nhìn, phần ngoài khung ra ảnh trắng.
        await page.setViewportSize({ width: 1800, height: 1300 });
        await page.goto(MONITOR_PATH);
        // Bám vào dòng theo TÊN chiến dịch: bấm xong, title nút đổi thành "Ẩn chi tiết lỗi" nên mọi bộ chọn
        // dựa vào title "Xem chi tiết lỗi" (kể cả lọc dòng theo nút) đều trượt sang dòng kế tiếp.
        const row = page.locator('main tbody tr').filter({ hasText: campaignName }).first();
        await row.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        const button = row.locator('button[title*="chi tiết lỗi"]').first();
        await button.click();
        // Bảng lỗi là <tr> ngay sau dòng chiến dịch vừa bấm.
        const detail = row.locator('xpath=following-sibling::tr[1]');
        await detail.getByText('Người nhận', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
        await page.waitForTimeout(800);
        await hideVolatileChrome(page);
        await highlight(button);
        await row.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);

        const a = await row.boundingBox();
        const b = await detail.boundingBox();
        const pad = 10;
        const clip = { x: a.x - pad, y: a.y - pad, width: a.width + pad * 2, height: (b.y + b.height) - a.y + pad * 2 };
        return {
          screenshot: async (options = {}) => {
            try {
              return await page.screenshot({ ...options, clip });
            } finally {
              await page.setViewportSize(viewport);
            }
          },
        };
      },
    },
  ],
};
