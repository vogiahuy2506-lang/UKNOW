/**
 * Ảnh minh hoạ cho bài "Chatbot AI trả lời khách tự động" (/huong-dan/chatbot).
 *
 * Cần `E2E_SEED_CHATBOT=1` (nằm trong `E2E_SEED_ALL=1`): 2 chatbot, 1 cái có 3
 * tài liệu ở các trạng thái xử lý khác nhau.
 */
import {
  sidebarShot, highlight, hideVolatileChrome, settle, contentShot,
} from '../lib/shotHelpers.js';

const STUDIO_PATH = '/app/chatbot-studio';

/**
 * Mở Studio và chọn một chatbot, rồi chuyển sang tab yêu cầu.
 *
 * Chatbot mặc định được chọn không chắc là cái có tài liệu — seed gắn tài liệu
 * cho một cái thôi. `needsDocuments` sẽ chọn cái nào có tài liệu.
 */
async function openStudio(page, { tab, needsDocuments = false } = {}) {
  await page.goto(STUDIO_PATH);
  await page.getByRole('button', { name: 'Kiến thức', exact: true })
    .first().waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);

  if (needsDocuments) {
    // Lấy TÊN các chatbot ở cột trái rồi bấm theo tên. Bấm theo chỉ số trong
    // danh sách `main button` không ăn: mục chatbot không phải thẻ <button>, và
    // vài nút cùng khớp bộ lọc lại nằm ngoài vùng nhìn.
    const names = await page.locator('main').evaluate((main) => {
      const seen = new Set();
      for (const el of main.querySelectorAll('*')) {
        if (el.children.length) continue;
        const text = (el.textContent || '').trim();
        if (text.length > 6 && text.length < 60 && /chatbot|trợ lý/i.test(text)) seen.add(text);
      }
      return [...seen].slice(0, 6);
    });

    for (const name of names) {
      const entry = page.getByText(name, { exact: true }).first();
      if (!(await entry.isVisible().catch(() => false))) continue;
      await entry.click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(900);
      const knowledgeTab = page.getByRole('button', { name: 'Kiến thức', exact: true }).first();
      if (!(await knowledgeTab.isVisible().catch(() => false))) continue;
      await knowledgeTab.click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(1200);
      // Đếm tài liệu hiện ngay cạnh chữ "Tài liệu"; 0 nghĩa là chatbot này rỗng.
      const count = await page.locator('main').evaluate((main) => {
        const match = (main.innerText || '').match(/Tài liệu\s+(\d+)/);
        return match ? Number(match[1]) : 0;
      });
      if (count > 0) return true;
    }
    return false;
  }

  if (tab) {
    await page.getByRole('button', { name: tab, exact: true }).first().click();
    await page.waitForTimeout(900);
  }
  return true;
}

export default {
  slug: 'chatbot',
  shots: [
    {
      name: 'menu-tao-ai-chatbot',
      caption: 'menu bên trái đang mở nhóm AI Chatbot, khoanh đỏ mục "Tạo AI Chatbot"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'AI Chatbot',
          itemName: 'Tạo AI Chatbot',
          baseURL,
        });
      },
    },
    {
      name: 'toan-trang-studio',
      caption: 'trang Tạo AI Chatbot, cột trái là danh sách chatbot',
      async take(page) {
        await openStudio(page);
        await hideVolatileChrome(page);
        return contentShot(page, page.locator('main').first());
      },
    },
    {
      name: 'hang-ba-tab',
      caption: 'hàng ba tab Cấu hình / Kiến thức / Triển khai, khoanh đỏ cả hàng',
      async take(page) {
        await openStudio(page);
        const tabs = page.locator('main').locator('div').filter({
          has: page.getByRole('button', { name: 'Cấu hình', exact: true }),
        }).filter({
          has: page.getByRole('button', { name: 'Triển khai', exact: true }),
        }).last();
        await tabs.waitFor({ state: 'visible', timeout: 15_000 });
        await hideVolatileChrome(page);
        await highlight(tabs);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 420 });
      },
    },
    {
      name: 'tab-cau-hinh',
      caption: 'tab Cấu hình, khoanh đỏ ô nhập hướng dẫn cách trả lời',
      async take(page) {
        await openStudio(page, { tab: 'Cấu hình' });
        const box = page.locator('main textarea').first();
        if (!(await box.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Không thấy ô nhập hướng dẫn trong tab Cấu hình');
        }
        await hideVolatileChrome(page);
        await highlight(box);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first());
      },
    },
    {
      name: 'tab-kien-thuc-tai-len',
      caption: 'tab Kiến thức, khoanh đỏ nút tải tài liệu lên',
      async take(page) {
        await openStudio(page, { tab: 'Kiến thức' });
        const upload = page.getByRole('button', { name: 'Upload', exact: true }).first();
        if (!(await upload.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Không thấy nút tải tài liệu trong tab Kiến thức');
        }
        await hideVolatileChrome(page);
        await highlight(upload);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first());
      },
    },
    {
      name: 'trang-thai-tai-lieu',
      caption: 'tab Kiến thức sau khi đã có vài tài liệu',
      localOnly: true,
      async take(page) {
        if (!(await openStudio(page, { needsDocuments: true }))) {
          throw new Error(
            'Không chatbot nào có tài liệu. Nạp lại DB:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_CHATBOT=1 node scripts/seed-test-db.js',
          );
        }
        await hideVolatileChrome(page);
        // Chú thích chỉ đích danh CỘT TRẠNG THÁI XỬ LÝ — khoanh từng nhãn.
        let marked = 0;
        for (const status of ['ready', 'processing', 'error']) {
          const badge = page.getByText(status, { exact: true }).first();
          if (await badge.isVisible().catch(() => false)) { await highlight(badge); marked += 1; }
        }
        if (!marked) throw new Error('Có tài liệu nhưng không thấy nhãn trạng thái nào để khoanh');
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first());
      },
    },
    {
      name: 'tab-trien-khai',
      caption: 'tab Triển khai, khoanh đỏ bốn lựa chọn kênh',
      async take(page) {
        await openStudio(page, { tab: 'Triển khai' });
        await hideVolatileChrome(page);
        await page.waitForTimeout(400);
        return contentShot(page, page.locator('main').first());
      },
    },
    {
      name: 'huong-dan-zalo-oa',
      caption: 'phần hướng dẫn Zalo OA, khoanh đỏ hai ô sao chép Webhook URL và Verify Token',
      localOnly: true,
      async take(page) {
        await openStudio(page, { tab: 'Triển khai' });
        const zaloOption = page.getByText(/Zalo OA/i).first();
        if (await zaloOption.isVisible().catch(() => false)) {
          await zaloOption.click();
          await page.waitForTimeout(1200);
        }
        const webhook = page.getByText(/Webhook URL/i).first();
        if (!(await webhook.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Không thấy phần hướng dẫn Zalo OA (Webhook URL / Verify Token)');
        }
        await hideVolatileChrome(page);
        await highlight(webhook);
        const token = page.getByText(/Verify Token/i).first();
        if (await token.isVisible().catch(() => false)) await highlight(token);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first());
      },
    },
  ],
};
