/**
 * Ảnh minh hoạ cho bài "Chatbot AI trả lời khách tự động" (/huong-dan/chatbot).
 *
 * Cần `E2E_SEED_CHATBOT=1` (nằm trong `E2E_SEED_ALL=1`): 2 chatbot, 1 cái có 3
 * tài liệu ở các trạng thái xử lý khác nhau.
 *
 * Giao diện Studio (từ 28/09/2026): cột trái danh sách chatbot, giữa khung chat thử có nút
 * "Cấu hình" mở hộp năm phần (Kiến thức là MỘT PHẦN trong hộp đó), cột phải "Triển khai".
 * Chỉ mở xem, KHÔNG bấm "Lưu cấu hình".
 */
import {
  sidebarShot, highlight, hideVolatileChrome, settle, contentShot, enclosingSection,
} from '../lib/shotHelpers.js';

const STUDIO_PATH = '/app/chatbot-studio';

/**
 * Mở Studio, chọn chatbot có tài liệu (ảnh phần Kiến thức mới có danh sách + nhãn trạng thái).
 *
 * Chọn theo TÊN chatbot mà seed gắn tài liệu. Không dò theo dòng "N tài liệu" ở cột trái được:
 * cột đó đọc `bot.documents` mà API danh sách không trả, nên chatbot nào cũng ghi "Chưa có dữ liệu".
 */
const CHATBOT_WITH_DOCUMENTS = /^Trợ lý CSKH/;

async function openStudio(page) {
  await page.goto(STUDIO_PATH);
  const configButton = page.getByRole('button', { name: /^Cấu hình$/ }).first();
  await configButton.waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);

  const withDocs = page.getByText(CHATBOT_WITH_DOCUMENTS).first();
  if (await withDocs.isVisible().catch(() => false)) {
    await withDocs.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  await hideVolatileChrome(page);
  return { configButton };
}

/** Thẻ trắng của một hộp thoại (bỏ lớp nền mờ phủ cả màn hình). */
function dialogCard(page, title) {
  return page.locator('div.fixed.inset-0').filter({ hasText: title }).last()
    .locator(':scope > div').first();
}

/** Mở hộp "Cấu hình chatbot" rồi nhảy tới một phần qua mục lục bên trái hộp. */
async function openConfigSection(page, section) {
  const { configButton } = await openStudio(page);
  await configButton.click();
  const card = dialogCard(page, 'Cấu hình chatbot');
  await card.waitFor({ state: 'visible', timeout: 15_000 });
  await card.getByRole('button', { name: section, exact: true }).first().click();
  await page.waitForTimeout(900);
  await hideVolatileChrome(page);
  return card;
}

export default {
  slug: 'chatbot',
  timeoutMs: 480_000,
  shots: [
    {
      // Cùng một màn hình với ô "menu-lich-su-tro-chuyen" bên bài inbox, nhưng
      // câu chú thích khác nên phải là ảnh riêng — khoá chèn bám theo chú thích.
      name: 'menu-lich-su-tro-chuyen',
      caption: 'menu bên trái, nhóm AI Chatbot đang mở, khoanh đỏ mục "Lịch sử trò chuyện"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'AI Chatbot',
          itemName: 'Lịch sử trò chuyện',
          baseURL,
        });
      },
    },
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
      caption: 'trang Tạo AI Chatbot gồm ba phần',
      async take(page) {
        await openStudio(page);
        return contentShot(page, page.locator('main').first());
      },
    },
    {
      name: 'nut-cau-hinh',
      caption: 'phía trên khung chat thử, khoanh đỏ nút "Cấu hình"',
      async take(page) {
        const { configButton } = await openStudio(page);
        await highlight(configButton);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 330 });
      },
    },
    {
      name: 'huong-dan-ai',
      caption: 'hộp Cấu hình ở phần Hướng dẫn AI, khoanh đỏ ô nhập hướng dẫn cách trả lời',
      async take(page) {
        const card = await openConfigSection(page, 'Hướng dẫn AI');
        const box = card.getByPlaceholder(/Bạn là một trợ lý ảo thân thiện/).first();
        if (!(await box.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Không thấy ô Hướng dẫn AI trong hộp Cấu hình');
        }
        await box.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        await highlight(box);
        await page.waitForTimeout(200);
        return card;
      },
    },
    {
      name: 'kien-thuc-ba-nut',
      caption: 'hộp Cấu hình ở phần Kiến thức chatbot, khoanh đỏ ba nút Upload, Văn bản và URL',
      async take(page) {
        const card = await openConfigSection(page, 'Kiến thức');
        const upload = card.getByRole('button', { name: 'Upload', exact: true }).first();
        if (!(await upload.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Không thấy nút Upload trong phần Kiến thức');
        }
        // Ba nút nằm chung một hàng — khoanh cả hàng.
        const row = upload.locator('xpath=..');
        await row.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        await highlight(row);
        await page.waitForTimeout(200);
        return card;
      },
    },
    {
      name: 'tab-trien-khai',
      // 28/09/2026: giao diện thêm Zalo cá nhân/WhatsApp/Telegram — "bốn lựa chọn" thành cả lưới
      // "Kênh hội thoại"; chú thích seed đổi theo.
      caption: 'tab Triển khai, khoanh đỏ các ô chọn kênh',
      async take(page) {
        await openStudio(page);
        const grid = page.getByText('Kênh hội thoại', { exact: true }).first()
          .locator('xpath=following-sibling::div[1]');
        if (!(await grid.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Không thấy lưới "Kênh hội thoại" ở cột Triển khai');
        }
        await highlight(grid);
        await page.waitForTimeout(400);
        return contentShot(page, page.locator('main').first());
      },
    },
    {
      name: 'widget-nhan-nut-mo-chat',
      caption: 'hộp Giao diện Widget, khoanh đỏ phần Nhãn nút mở chat',
      async take(page) {
        await openStudio(page);
        await page.getByTitle('Tuỳ chỉnh giao diện widget', { exact: true }).first().click();
        const card = dialogCard(page, 'Nhãn nút mở chat');
        await card.waitFor({ state: 'visible', timeout: 15_000 });
        const heading = card.getByText('Nhãn nút mở chat', { exact: true }).first();
        await heading.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        const section = await enclosingSection(page, heading, { minWidth: 200 });
        await hideVolatileChrome(page);
        await highlight(section);
        await page.waitForTimeout(200);
        return card;
      },
    },
    {
      name: 'hop-zalo-oa',
      caption: 'hộp Cấu hình Zalo OA, khoanh đỏ các ô App ID, App Secret và Webhook URL',
      async take(page) {
        await openStudio(page);
        await page.getByTitle('Zalo OA — Tự động hồi đáp', { exact: true }).first().click();
        const card = dialogCard(page, 'Cấu hình Zalo OA');
        await card.waitFor({ state: 'visible', timeout: 15_000 });
        await card.getByText('App ID (Zalo App ID)', { exact: true }).first()
          .waitFor({ state: 'visible', timeout: 15_000 });
        await hideVolatileChrome(page);
        for (const label of ['App ID (Zalo App ID)', 'App Secret (Secret Key)', 'Webhook URL']) {
          await highlight(card.getByText(label, { exact: true }).first().locator('xpath=..'));
        }
        await page.waitForTimeout(200);
        return card;
      },
    },
  ],
};
