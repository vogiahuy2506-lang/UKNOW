/**
 * Ảnh minh hoạ cho bài "Dung lượng lưu trữ" (/huong-dan/dung-luong-luu-tru).
 *
 * Ảnh thứ hai cần trạng thái "workspace gần đầy". Không bơm dữ liệu rác vào DB cho
 * đầy thật: chặn lời gọi `GET /api/storage/usage` ngay trong trình duyệt và sửa
 * hai con số (còn trống 2,4 MB, bật chế độ chặn), rồi chọn một tệp 6 MB — đúng
 * đường mà bộ kiểm phía trình duyệt (`validateFilesBeforeUpload`) sinh ra thông báo.
 * Không tệp nào được tải lên. Chỉ chạy ở máy mình.
 */
import {
  highlight, hideVolatileChrome, settle, enclosingSection, tallViewportShot, paddedShot,
} from '../lib/shotHelpers.js';
import { ensureDemoForm } from '../lib/shotFixtures.js';

/**
 * Sửa con số dung lượng mà trang nhận được, KHÔNG đụng dữ liệu thật.
 * @param {{usedRatio?: number, remainingBytes?: number}} shape
 */
async function mockStorageUsage(page, { usedRatio, remainingBytes }) {
  await page.route('**/api/storage/usage*', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    const usage = json.data || json;
    const limit = Number(usage.limitBytes) || 5 * 1024 ** 3;
    const remaining = remainingBytes ?? Math.round(limit * (1 - usedRatio));
    Object.assign(usage, {
      enforcementEnabled: true,
      limitBytes: limit,
      usedBytes: limit - remaining,
      remainingBytes: remaining,
      percent: Math.round(((limit - remaining) / limit) * 100),
    });
    await route.fulfill({ response, json });
  });
}

export default {
  slug: 'dung-luong-luu-tru',
  shots: [
    {
      name: 'khoi-dung-luong-luu-tru',
      caption: 'trang Tổng quan gói, khoanh đỏ khối Dung lượng lưu trữ với thanh phần trăm đã dùng',
      async take(page) {
        // Tài khoản mẫu chưa tải tệp nào nên thanh luôn 0% — không minh hoạ được gì.
        // Cho trang thấy mức đã dùng 38% (chỉ sửa con số trang nhận về).
        await mockStorageUsage(page, { usedRatio: 0.38 });
        await page.goto('/app/billing');
        const title = page.locator('main').getByText('Dung lượng lưu trữ', { exact: true }).first();
        await title.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        await page.unroute('**/api/storage/usage*');
        return tallViewportShot(page, 2200, async () => {
          const card = await enclosingSection(page, title, { minWidth: 300 });
          await highlight(card);
          await page.waitForTimeout(200);
          return paddedShot(page, card);
        });
      },
    },
    {
      name: 'thong-bao-vuot-dung-luong',
      caption: 'thông báo lỗi khi tải tệp vượt dung lượng còn trống, thấy số còn lại và kích thước tệp',
      localOnly: true,
      async take(page) {
        await page.goto('/app/forms');
        const form = await ensureDemoForm(page);

        await mockStorageUsage(page, { remainingBytes: Math.round(2.4 * 1024 * 1024) });

        await page.goto(`/app/forms/${form.id}/edit`);
        await page.getByRole('heading', { name: 'Giao diện', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);

        // Ô chọn ảnh banner/logo của mục Giao diện. Tệp giả 6 MB, không cần là ảnh thật:
        // bộ kiểm dung lượng chạy trước mọi bước đọc nội dung.
        const input = page.locator('input[type="file"]').first();
        await input.setInputFiles({
          name: 'banner-khai-truong.png',
          mimeType: 'image/png',
          buffer: Buffer.alloc(6 * 1024 * 1024, 1),
        });
        const toast = page.getByText(/Workspace chỉ còn/).first();
        await toast.waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForTimeout(300);
        await page.unroute('**/api/storage/usage*');

        // KHÔNG gọi hideVolatileChrome: nó ẩn mọi toast, mà ảnh này chính là cái toast.
        // Chụp cả dải đầu trang: cắt sát thông báo thì ảnh dính mấy mẩu chữ nền vô nghĩa.
        const box = await toast.boundingBox();
        const clip = { x: 0, y: 0, width: page.viewportSize().width, height: Math.ceil(box.y + box.height + 70) };
        return { screenshot: (options = {}) => page.screenshot({ ...options, clip }) };
      },
    },
    {
      name: 'mua-them-dung-luong',
      caption: 'trang Mua thêm hạn mức, khoanh đỏ dòng mua thêm dung lượng lưu trữ theo GB',
      async take(page) {
        await page.goto('/app/topup');
        const title = page.locator('main').getByText('Dung lượng lưu trữ', { exact: true }).first();
        await title.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        return tallViewportShot(page, 1900, async () => {
          const card = await enclosingSection(page, title, { minWidth: 300 });
          await highlight(card);
          await page.waitForTimeout(200);
          // Chụp cả hàng (hai thẻ cạnh nhau) để thấy thẻ dung lượng nằm ở đâu trong trang.
          const row = card.locator('xpath=..');
          return paddedShot(page, row);
        });
      },
    },
  ],
};
