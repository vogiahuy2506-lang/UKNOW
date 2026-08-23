/**
 * Ảnh minh hoạ cho bài "Thư viện nội dung: mẫu tin và biến" (/huong-dan/mau-tin-nhan).
 *
 * Cần `E2E_SEED_TEMPLATES=1` (đã nằm trong `E2E_SEED_ALL=1`): 3 nhãn, 6 mẫu email
 * (một mẫu hệ thống bị khoá), 4 mẫu Zalo.
 */
import {
  sidebarShot, regionShot, highlight, hideVolatileChrome, settle, contentShot,
} from '../lib/shotHelpers.js';

const TEMPLATES_PATH = '/app/settings/templates';

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
      name: 'the-email-zalo',
      caption: 'đầu trang Thư viện nội dung, khoanh đỏ 2 thẻ Email / Zalo',
      async take(page) {
        await page.goto(TEMPLATES_PATH);
        const tabs = page.locator('main').locator('div').filter({
          has: page.getByRole('button', { name: 'Email', exact: true }),
        }).filter({
          has: page.getByRole('button', { name: 'Zalo', exact: true }),
        }).last();
        await tabs.waitFor({ state: 'visible', timeout: 30_000 });
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
