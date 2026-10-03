/**
 * Ảnh minh hoạ cho bài "Dung lượng lưu trữ" (/huong-dan/dung-luong-luu-tru).
 *
 * Ảnh thứ hai cần trạng thái "workspace gần đầy". Không bơm dữ liệu rác vào DB cho
 * đầy thật: chặn lời gọi `GET /api/storage/usage` ngay trong trình duyệt và sửa
 * hai con số (còn trống 2,4 MB, bật chế độ chặn), rồi chọn một tệp 6 MB — đúng
 * đường mà bộ kiểm phía trình duyệt (`validateFilesBeforeUpload`) sinh ra thông báo.
 * Không tệp nào được tải lên. Chỉ chạy ở máy mình.
 *
 * Hai ảnh Thư viện media (03/10/2026, sau khi bỏ tab "Tệp tin nhắn"): trang có 2 tab "Tất cả tệp (Dung lượng)" và
 * "Tệp khách gửi". Tài khoản mẫu chưa có tệp nào trong sổ lưu trữ, nên cũng chặn hai lời gọi
 * `GET /api/media-library/objects` và `/channels` ngay trong trình duyệt và trả dữ liệu mẫu ĐÚNG HÌNH DẠNG backend
 * (xem `mediaLibrary.repository.js`) — trang vẫn dựng bằng mã thật, chỉ nguồn dữ liệu là mẫu. Không ghi gì vào DB.
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
    referenceType: null,
    referenceId: null,
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

/** Tệp khách gửi (tab "Tệp khách gửi"): Telegram/WhatsApp lưu trên hệ thống, Zalo/Zalo OA chỉ là link nền tảng. */
const CHANNEL_FIXTURE = [
  ['telegram', 'image', 'anh-chuyen-khoan.jpg', 0.42, true],
  ['whatsapp', 'file', 'bao-gia-khoa-hoc.pdf', 1.8, true],
  ['zalo_personal', 'image', 'anh-san-pham.jpg', null, false],
  ['zalo_oa', 'file', 'phieu-dang-ky.docx', null, false],
  ['telegram', 'file', 'danh-sach-hoc-vien.xlsx', 0.2, true],
  ['whatsapp', 'image', 'anh-hoa-don.png', 0.6, true],
  ['zalo_personal', 'file', 'cv-ung-vien.pdf', null, false],
  ['zalo_oa', 'image', 'anh-san-pham-2.jpg', null, false],
];

function channelAttachmentsPayload() {
  const items = CHANNEL_FIXTURE.map(([platform, type, name, mb, stored], index) => ({
    platform,
    conversationId: 500 + index,
    createdAt: new Date(Date.UTC(2026, 9, 2, 10, 0, 0) - index * 3_600_000).toISOString(),
    messageId: 7000 + index,
    type,
    url: type === 'image' ? picture(index) : '#',
    name,
    stored,
    ...(stored ? { size: Math.round(mb * MB) } : {}),
  }));
  return { success: true, data: items, pagination: { total: items.length, page: 1, limit: 24, pages: 1 } };
}

/** Thay dữ liệu Thư viện media bằng bản mẫu đúng hình dạng; trả về hàm gỡ chặn. */
async function mockMediaLibrary(page) {
  await page.route('**/api/media-library/objects*', (route) => route.fulfill({ json: storageObjectsPayload() }));
  await page.route('**/api/media-library/channels*', (route) => route.fulfill({ json: channelAttachmentsPayload() }));
  return async () => {
    await page.unroute('**/api/media-library/objects*');
    await page.unroute('**/api/media-library/channels*');
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
      caption: 'Thư viện media ở tab Tất cả tệp (Dung lượng), khoanh đỏ hàng thẻ Dung lượng theo danh mục',
      localOnly: true,
      async take(page) {
        const unmock = await mockMediaLibrary(page);
        await page.goto('/app/settings/media-library');
        const summaryTitle = page.getByText('Dung lượng theo danh mục', { exact: true }).first();
        await summaryTitle.waitFor({ state: 'visible', timeout: 30_000 });
        await page.getByText('Ảnh landing page', { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 });
        await settle(page);
        await hideVolatileChrome(page);
        // Khối "Dung lượng theo danh mục" = nhãn + lưới thẻ; khoanh cả khối.
        await highlight(summaryTitle.locator('xpath=..'));
        await page.waitForTimeout(300);
        await unmock();
        return contentShot(page, page.locator('main').first(), { maxHeight: 640 });
      },
    },
    {
      name: 'thu-vien-media-tep-khach-gui',
      caption: 'Thư viện media ở tab Tệp khách gửi, thấy nhãn Telegram, WhatsApp, Zalo và dòng cho biết tệp lưu trên hệ thống hay chỉ là link nền tảng',
      localOnly: true,
      async take(page) {
        const unmock = await mockMediaLibrary(page);
        await page.goto('/app/settings/media-library');
        const tab = page.getByRole('button', { name: 'Tệp khách gửi', exact: true });
        await tab.waitFor({ state: 'visible', timeout: 30_000 });
        await tab.click();
        await page.getByText('Lưu trên hệ thống · tính dung lượng', { exact: false }).first()
          .waitFor({ state: 'visible', timeout: 15_000 });
        await settle(page);
        await hideVolatileChrome(page);
        // Khoanh dòng giải thích hai loại tệp (link nền tảng / lưu trên hệ thống) ở đầu tab.
        await highlight(page.getByText(/chỉ là link tới nền tảng/).first());
        await page.waitForTimeout(300);
        await unmock();
        return contentShot(page, page.locator('main').first(), { maxHeight: 760 });
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
