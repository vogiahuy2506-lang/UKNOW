/**
 * Ảnh minh hoạ cho bài "Dung lượng lưu trữ" (/huong-dan/dung-luong-luu-tru).
 *
 * Ảnh thứ hai cần trạng thái "workspace gần đầy". Không bơm dữ liệu rác vào DB cho
 * đầy thật: chặn lời gọi `GET /api/storage/usage` ngay trong trình duyệt và sửa
 * hai con số (còn trống 2,4 MB, bật chế độ chặn), rồi chọn một tệp 6 MB — đúng
 * đường mà bộ kiểm phía trình duyệt (`validateFilesBeforeUpload`) sinh ra thông báo.
 * Không tệp nào được tải lên. Chỉ chạy ở máy mình.
 *
 * Ảnh trang Tệp & dung lượng (trước 04/10/2026 gọi là Thư viện media; 04/10/2026: trang chỉ còn MỘT danh sách, tab "Tệp khách gửi" đã gỡ). Tài khoản mẫu chưa có tệp nào
 * trong sổ lưu trữ, nên chặn lời gọi `GET /api/media-library/objects` ngay trong trình duyệt và trả dữ liệu mẫu ĐÚNG
 * HÌNH DẠNG backend (xem `mediaLibrary.repository.js`) — trang vẫn dựng bằng mã thật, chỉ nguồn dữ liệu là mẫu.
 * Không ghi gì vào DB.
 */
import {
  highlight, hideVolatileChrome, settle, enclosingSection, tallViewportShot, paddedShot, contentShot,
} from '../lib/shotHelpers.js';
import { ensureDemoForm } from '../lib/shotFixtures.js';

const MB = 1024 * 1024;

/** Ảnh giả 16:9 (gradient, không chữ) — thẻ Thư viện media chỉ hiện ảnh khi có `url`. */
const gradient = (from, to) => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
  + `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>`
  + '<rect width="320" height="180" fill="url(#g)"/></svg>',
)}`;
const PICTURES = [
  gradient('#60a5fa', '#1e3a8a'), gradient('#fbbf24', '#b45309'), gradient('#34d399', '#065f46'),
  gradient('#f472b6', '#9d174d'), gradient('#a78bfa', '#4c1d95'),
];
const picture = (index) => PICTURES[index % PICTURES.length];

/** Tệp trong sổ lưu trữ (tab "Tất cả tệp"), xếp từ nặng tới nhẹ như backend. */
const STORAGE_FIXTURE = [
  ['chat', 'bao-gia-khoa-hoc.pdf', 9.2, 'file'],
  ['zalo_template', 'banner-khuyen-mai.png', 3.4, 'image'],
  ['chat', 'anh-san-pham-1.jpg', 2.8, 'image'],
  ['landing_asset', 'hero-landing.jpg', 2.5, 'image'],
  ['email_template', 'email-chao-mung.png', 1.9, 'image'],
  ['zalo_template', 'huong-dan-su-dung.pdf', 1.6, 'file'],
  ['form_asset', 'banner-bieu-mau.png', 1.2, 'image'],
  ['chat', 'anh-chuyen-khoan.jpg', 0.9, 'image'],
  ['landing_asset', 'logo-doi-tac.png', 0.6, 'image'],
  ['form_receipt', 'bien-lai-chuyen-khoan.jpg', 0.5, 'image'],
  ['zalo_template', 'bang-gia.xlsx', 0.4, 'file'],
  ['chat', 'danh-sach-khach.csv', 0.1, 'file'],
];

function storageObjectsPayload() {
  const items = STORAGE_FIXTURE.map(([category, name, mb, type], index) => ({
    id: 9000 + index,
    storageKey: null,
    tempKey: null,
    category,
    state: 'active',
    sizeBytes: Math.round(mb * MB),
    size: Math.round(mb * MB),
    displayName: name,
    name,
    mimeType: type === 'image' ? 'image/jpeg' : 'application/octet-stream',
    type,
    url: type === 'image' ? picture(index) : '#',
    expiresAt: null,
    autoDeleteAt: null,
    referenceType: null,
    referenceId: null,
    // Hình dạng mới của backend (04/10/2026): nguồn tệp chat + "đang dùng ở đâu" (cùng hàm quyết định với nút Xoá).
    source: category === 'chat' ? 'ai_assistant' : null,
    inUse: category === 'zalo_template' || category === 'email_template',
    usedBy: category === 'zalo_template'
      ? { referenceType: 'zalo_template', referenceId: '15', label: 'Mẫu tin nhắn', name: 'Khuyến mãi khai giảng', url: '/app/settings/templates' }
      : category === 'email_template'
        ? { referenceType: 'email_template', referenceId: '3', label: 'Mẫu Email', name: 'Chào mừng học viên', url: '/app/settings/templates' }
        : null,
    createdAt: new Date(Date.UTC(2026, 8, 20 - index)).toISOString(),
  }));
  const byCategory = new Map();
  for (const item of items) {
    const entry = byCategory.get(item.category) || { category: item.category, count: 0, totalBytes: 0 };
    entry.count += 1;
    entry.totalBytes += item.sizeBytes;
    byCategory.set(item.category, entry);
  }
  return {
    success: true,
    data: items,
    categorySummary: [...byCategory.values()].sort((a, b) => b.totalBytes - a.totalBytes),
    pagination: { total: items.length, page: 1, limit: 24, pages: 1 },
  };
}

/** Thay dữ liệu Thư viện media bằng bản mẫu đúng hình dạng; trả về hàm gỡ chặn. */
async function mockMediaLibrary(page) {
  await page.route('**/api/media-library/objects*', (route) => route.fulfill({ json: storageObjectsPayload() }));
  return async () => {
    await page.unroute('**/api/media-library/objects*');
  };
}

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
        // Câu thông báo là `storage.quotaExceeded` (vi.js): "Dung lượng lưu trữ chỉ còn …" (trước đây ghi "Workspace chỉ còn …").
        const toast = page.getByText(/Dung lượng lưu trữ chỉ còn/).first();
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
      name: 'thu-vien-media-tat-ca-tep',
      caption: 'Tệp & dung lượng, khoanh đỏ thanh dung lượng và hàng thẻ Theo loại tệp',
      localOnly: true,
      async take(page) {
        // Thanh dung lượng ở đầu trang: tài khoản mẫu chưa tải tệp nào nên thanh luôn 0% — cho trang thấy 38%.
        await mockStorageUsage(page, { usedRatio: 0.38 });
        const unmock = await mockMediaLibrary(page);
        await page.goto('/app/settings/media-library');
        const summaryTitle = page.getByText('Theo loại tệp', { exact: true }).first();
        await summaryTitle.waitFor({ state: 'visible', timeout: 30_000 });
        await page.getByText('Ảnh landing page', { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 });
        await settle(page);
        await hideVolatileChrome(page);
        // Khoanh thanh dung lượng + khối "Theo loại tệp" (nhãn + lưới thẻ).
        await highlight(page.locator('main').getByText('Dung lượng lưu trữ', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]'));
        await highlight(summaryTitle.locator('xpath=..'));
        await page.waitForTimeout(300);
        await unmock();
        await page.unroute('**/api/storage/usage*');
        return contentShot(page, page.locator('main').first(), { maxHeight: 640 });
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
