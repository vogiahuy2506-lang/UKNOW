/**
 * Ảnh minh hoạ cho bài "Tạo chiến dịch bằng Trợ lý AI" (/huong-dan/tro-ly-ai-chien-dich).
 *
 * Hai ảnh thẻ trong chat là KẾT QUẢ của AI, nhưng ở đây KHÔNG gọi Gemini: `page.route` chặn `POST /ai/chat` và
 * `POST /ai/prepare-campaign` rồi trả JSON mẫu đúng hình dạng API thật (xem `aiApi.chat` / `aiApi.prepareCampaign` và
 * `ConfirmCreateCard` ở frontend). Nên cả hai ảnh là localOnly và không tốn lượt AI nào. KHÔNG bấm nút nào trên thẻ.
 */
import {
  forceSidebarExpanded, highlight, hideVolatileChrome, settle, paddedShot, contentShot, boxAround, drawBoxes,
} from '../lib/shotHelpers.js';

const json = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
const chatBox = (page) => page.locator('main textarea').first();

/** Mở khung chat ở trang chủ app và gửi một câu — câu trả lời do `page.route` dựng sẵn. */
async function sendPrompt(page, prompt) {
  await page.goto('/app');
  await chatBox(page).waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);
  const fresh = page.getByRole('button', { name: /^Mới$/ }).first();
  if (await fresh.isVisible().catch(() => false)) await fresh.click();
  await chatBox(page).fill(prompt);
  await page.keyboard.press('Enter');
}

export default {
  slug: 'tro-ly-ai-chien-dich',
  shots: [
    {
      name: 'menu-va-khung-chat',
      caption: 'menu bên trái, khoanh đỏ mục "Trợ lý AI" ở trên cùng, khung chat với ô nhập yêu cầu',
      async take(page, { baseURL }) {
        await forceSidebarExpanded(page, baseURL);
        await page.goto('/app');
        const sidebar = page.locator('aside').first();
        await sidebar.waitFor({ state: 'visible', timeout: 30_000 });
        await chatBox(page).waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        // Mục lá ở đầu menu là <button> — khoanh cả hàng chứ không chỉ chữ.
        await highlight(sidebar.getByRole('button', { name: 'Trợ lý AI', exact: true }).first());
        await page.waitForTimeout(200);
        // Cả khung nhìn: menu trái (mục được khoanh) và khung chat với ô nhập ở giữa.
        return { screenshot: (options = {}) => page.screenshot(options) };
      },
    },
    {
      name: 'the-hoi-lai-tai-khoan-gui',
      caption: 'một thẻ hỏi lại trong chat, ví dụ thẻ chọn tài khoản gửi hoặc thẻ chọn nguồn người nhận',
      localOnly: true,
      async take(page) {
        await page.route('**/api/ai/chat', (route) => route.fulfill(json({
          type: 'ask_sender_account',
          content: 'Bạn muốn gửi chiến dịch này bằng tài khoản Zalo nào?',
          data: {
            channel: 'zalo',
            allowOther: true,
            noUsableAccount: false,
            accounts: [
              { id: 101, name: 'Zalo Tư vấn bán hàng', email: null, isDefault: true, usable: true, status: 'connected' },
              { id: 102, name: 'Zalo Chăm sóc khách', email: null, isDefault: false, usable: true, status: 'connected' },
            ],
          },
        })));
        await sendPrompt(page, 'Gửi tin Zalo nhắc lịch hẹn cho khách để lại thông tin ở landing page.');
        const card = page.getByText('Bạn muốn gửi chiến dịch này bằng tài khoản Zalo nào?').first();
        await card.waitFor({ state: 'visible', timeout: 30_000 });
        await page.getByText('Zalo Tư vấn bán hàng').first().waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForTimeout(800);
        await hideVolatileChrome(page);
        // Cả khung chat: câu của người dùng, lời hỏi lại của trợ lý và thẻ chọn tài khoản gửi.
        return contentShot(page, page.locator('main').first(), { pad: 24 });
      },
    },
    {
      name: 'the-xac-nhan-tao-chien-dich',
      caption: 'thẻ "Xác nhận tạo chiến dịch" đầy đủ, khoanh đỏ các nút ở đáy thẻ',
      localOnly: true,
      async take(page) {
        const now = Date.now();
        const day = (offset) => new Date(now + offset * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
        const script = { name: 'Giới thiệu khoá học mới', channel: 'email' };
        await page.route('**/api/ai/chat', (route) => route.fulfill(json({
          type: 'create_and_run',
          content: 'Mình đã soạn xong chiến dịch. Bạn xem thẻ xác nhận bên dưới nhé.',
          data: script,
        })));
        await page.route('**/api/ai/prepare-campaign', (route) => route.fulfill(json({
          preparedScript: script,
          confirmationView: {
            readyToCreate: true,
            blockingIssues: [],
            campaign: { name: 'Giới thiệu khoá học mới', description: 'Gửi một email giới thiệu khoá học cho danh sách nhập tay' },
            steps: [{
              key: 'step-1',
              title: 'Gửi email giới thiệu khoá học',
              channel: 'email',
              timing: { anchor: 'start', value: 0 },
              sender: { label: 'Email CSKH UKNOW' },
              recipients: { mode: 'manual', type: 'email', sourceLabel: 'Danh sách nhập tay (3 người)' },
              content: {
                subject: 'Khoá học mới: Marketing tự động hoá thực chiến',
                bodyText: 'Chào {{ten}}, UKNOW vừa mở khoá học Marketing tự động hoá thực chiến. Đăng ký sớm trước 15/10 để nhận ưu đãi 20%.',
                attachments: [],
              },
            }],
            estimate: {
              startAt: new Date(now).toISOString(),
              finishAtEarliest: new Date(now + 60_000).toISOString(),
              finishAtLatest: new Date(now + 180_000).toISOString(),
              totalActions: 3,
              accounts: [{ key: 'email:1', label: 'Email CSKH UKNOW' }],
              perDay: [{ date: day(0), actions: 3, perAccount: { 'email:1': 3 } }],
              warnings: [],
            },
          },
        })));
        await sendPrompt(page, 'Tạo và chạy chiến dịch gửi email giới thiệu khoá học mới cho danh sách nhập tay.');
        const heading = page.getByText('Xác nhận tạo chiến dịch', { exact: true }).first();
        await heading.waitFor({ state: 'visible', timeout: 30_000 });
        const createBtn = page.getByRole('button', { name: /Tạo chiến dịch/ }).first();
        await createBtn.waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForTimeout(800);
        await hideVolatileChrome(page);
        const card = heading.locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
        // Khối nút ở đáy thẻ (nền trắng mờ, viền trên): chứa mọi nút Tạo và chạy / Tạo chiến dịch / Gửi nhanh / Chỉnh sửa / Huỷ.
        const footer = card.locator('xpath=./div[contains(@class,"border-t")]');
        const viewport = page.viewportSize();
        await page.setViewportSize({ width: viewport.width, height: 1500 });
        await page.waitForTimeout(400);
        // Thẻ có overflow-hidden nên outline bị cắt: vẽ khung phủ bên trong thẻ.
        await drawBoxes(card, [await boxAround(card, [footer], { pad: -4 })]);
        await page.waitForTimeout(200);
        const shot = await paddedShot(page, card, { pad: 16 });
        return {
          screenshot: async (options = {}) => {
            try { return await shot.screenshot(options); } finally { await page.setViewportSize(viewport); }
          },
        };
      },
    },
  ],
};
