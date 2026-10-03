/**
 * Ảnh minh hoạ cho bài "Thư viện nội dung: mẫu tin và biến" (/huong-dan/mau-tin-nhan).
 *
 * Cần `E2E_SEED_TEMPLATES=1` (đã nằm trong `E2E_SEED_ALL=1`): 3 nhãn, 6 mẫu email
 * (một mẫu hệ thống bị khoá), 4 mẫu tin nhắn (kho dùng chung Zalo/Telegram/WhatsApp, bảng zalo_templates).
 *
 * Từ 03/10/2026 tab thứ hai của trang là "Tin nhắn" (không còn "Zalo"): `channelTemplates.messages` trong vi.js.
 */
import {
  sidebarShot, regionShot, highlight, highlightCell, hideVolatileChrome, settle, contentShot,
} from '../lib/shotHelpers.js';

const TEMPLATES_PATH = '/app/settings/templates';

/** PNG 1x1 hợp lệ (đủ byte ma thuật để backend nhận làm ảnh). */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export default {
  slug: 'mau-tin-nhan',
  shots: [
    {
      name: 'menu-thu-vien-noi-dung',
      caption: 'menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục "Thư viện nội dung"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'Chiến dịch',
          itemName: 'Thư viện nội dung',
          baseURL,
        });
      },
    },
    {
      name: 'the-email-tin-nhan',
      caption: 'đầu trang Thư viện nội dung, khoanh đỏ 2 thẻ Email / Tin nhắn',
      async take(page) {
        await page.goto(TEMPLATES_PATH);
        const tabs = page.locator('main').locator('div').filter({
          has: page.getByRole('button', { name: 'Email', exact: true }),
        }).filter({
          has: page.getByRole('button', { name: 'Tin nhắn', exact: true }),
        }).last();
        await tabs.waitFor({ state: 'visible', timeout: 30_000 });
        // Mở thẻ Tin nhắn để ảnh thấy cả tiêu đề "Thư viện mẫu tin nhắn" và dòng "Dùng chung cho Zalo, Telegram và
        // WhatsApp" mà bài nhắc tới.
        await tabs.getByRole('button', { name: 'Tin nhắn', exact: true }).click();
        await page.getByText('Dùng chung cho Zalo, Telegram và WhatsApp', { exact: false }).first()
          .waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        await highlight(tabs);
        await page.waitForTimeout(200);
        // Chụp phần ĐẦU trang chứ không chụp riêng hai thẻ: chú thích nói "đầu
        // trang Thư viện nội dung", chụp trơ hai nút thì mất hết ngữ cảnh.
        return contentShot(page, page.locator('main').first(), { maxHeight: 340 });
      },
    },
    {
      name: 'nut-tao-template',
      caption: 'khoanh đỏ nút thêm mẫu mới trên trang Thư viện nội dung',
      async take(page) {
        return regionShot(page, {
          path: TEMPLATES_PATH,
          clip: 'main',
          mark: 'main button:has-text("Tạo template mới")',
          waitFor: 'main button:has-text("Tạo template mới")',
        });
      },
    },
    {
      name: 'nhan-loc-va-tim-kiem',
      caption: 'danh sách mẫu đã gắn nhãn, khoanh đỏ hàng nhãn lọc',
      async take(page) {
        await page.goto(TEMPLATES_PATH);
        const filterRow = page.locator('main').locator('div').filter({
          has: page.getByRole('button', { name: 'Tất cả', exact: true }),
        }).filter({
          has: page.getByRole('button', { name: 'Khuyến mãi', exact: true }),
        }).last();
        await filterRow.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        await highlight(filterRow);
        const search = page.locator('main input[type="search"], main input[placeholder*="ìm" i]').first();
        if (await search.isVisible().catch(() => false)) await highlight(search);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first());
      },
    },
    {
      name: 'trinh-soan-bien-goi-y',
      caption: 'trình soạn mẫu, đang mở danh sách biến gợi ý',
      localOnly: true,
      async take(page) {
        await page.goto(TEMPLATES_PATH);
        await page.getByRole('button', { name: 'Tạo template mới' }).first().waitFor({ timeout: 30_000 });
        await settle(page);
        await page.getByRole('button', { name: 'Tạo template mới' }).first().click();
        await page.waitForTimeout(1200);

        // Danh sách biến thường nấp sau một nút; thử vài nhãn hay gặp rồi mới chụp.
        for (const label of [/biến/i, /variable/i, /\{\{/]) {
          const opener = page.getByRole('button', { name: label }).first();
          if (await opener.isVisible().catch(() => false)) {
            await opener.click();
            await page.waitForTimeout(500);
            break;
          }
        }
        await hideVolatileChrome(page);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first());
      },
    },
    {
      name: 'canh-bao-gioi-han-tep',
      caption: 'trình soạn mẫu tin nhắn có hơn 5 ảnh đính kèm, thấy dòng nhắc màu vàng về giới hạn của Telegram và WhatsApp',
      localOnly: true,
      async take(page) {
        await page.goto(TEMPLATES_PATH);
        const messagesTab = page.locator('main').getByRole('button', { name: 'Tin nhắn', exact: true });
        await messagesTab.waitFor({ state: 'visible', timeout: 30_000 });
        await messagesTab.click();
        const createButton = page.getByRole('button', { name: 'Tạo template mới' }).first();
        await createButton.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await createButton.click();

        // Đính kèm đủ 6 ảnh qua đúng nút "Upload file" của trình soạn (mỗi lần một tệp — handleFileSelect chỉ lấy
        // tệp đầu). Dòng nhắc chỉ hiện khi vượt 5 ảnh; 6 tệp .png đều tính là ảnh với cả Telegram lẫn WhatsApp.
        // Bám đúng ô nhập tệp NGAY SAU nút "Upload file": trang còn một ô nhập tệp khác (trợ lý AI) đứng trước trong DOM,
        // `.first()` sẽ đẩy tệp vào đó và nút "Files (n)" không bao giờ hiện.
        const fileInput = page.locator('button:has-text("Upload file") ~ input[type="file"]');
        for (let i = 1; i <= 6; i += 1) {
          await fileInput.setInputFiles({ name: `anh-san-pham-${i}.png`, mimeType: 'image/png', buffer: TINY_PNG });
          await page.getByRole('button', { name: new RegExp(`Files \\(${i}\\)`) }).waitFor({ state: 'visible', timeout: 30_000 });
        }

        const notice = page.getByTestId('channel-limit-warning');
        await notice.waitFor({ state: 'visible', timeout: 15_000 });
        await hideVolatileChrome(page);
        // Dòng nhắc trải hết bề ngang hộp thoại nên viền ngoài (outline) bị cắt ở mép: vẽ viền VÀO TRONG.
        await highlightCell(notice);
        await page.waitForTimeout(300);
        // Trình soạn là tấm phủ kín màn hình: chụp nguyên khung nhìn để thấy dòng nhắc nằm ở đâu trong trình soạn.
        return { screenshot: (options = {}) => page.screenshot(options) };
      },
    },
    {
      name: 'mau-he-thong-bi-khoa',
      caption: 'thông báo mẫu bị khoá',
      localOnly: true,
      async take(page) {
        await page.goto(TEMPLATES_PATH);
        const editButtons = page.locator('main button', { hasText: /^Sửa$/ });
        await editButtons.first().waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);

        // KHÔNG bám vào tên mẫu: mẫu nào bị khoá phụ thuộc mẫu nào đang được
        // chiến dịch đang chạy dùng, mà thứ tự id do seed quyết định. Bấm lần
        // lượt tới khi thấy thông báo là cách duy nhất không phụ thuộc thứ tự.
        const notice = page.getByText('Tạo bản sao', { exact: false }).first();
        const count = Math.min(await editButtons.count(), 8);
        let found = false;
        for (let i = 0; i < count; i += 1) {
          await editButtons.nth(i).click();
          await page.waitForTimeout(900);
          if (await notice.isVisible().catch(() => false)) { found = true; break; }
          await page.goto(TEMPLATES_PATH);
          await editButtons.first().waitFor({ state: 'visible', timeout: 15_000 });
        }
        if (!found) {
          throw new Error(
            'Không mẫu nào đang bị khoá. Mẫu chỉ bị khoá khi có chiến dịch ĐANG CHẠY\n'
            + 'dùng nó (findActiveCampaignUsages) — đặt tên "Hệ thống khoá" không có tác dụng.\n'
            + 'Nạp lại DB có cả mẫu lẫn chiến dịch:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_TEMPLATES=1 E2E_SEED_CAMPAIGNS=1 node scripts/seed-test-db.js',
          );
        }
        await hideVolatileChrome(page);
        await highlight(notice);
        await page.waitForTimeout(200);
        const box = page.locator('div.fixed.inset-0').last();
        return (await box.isVisible().catch(() => false))
          ? contentShot(page, box)
          : contentShot(page, page.locator('main').first());
      },
    },
  ],
};
