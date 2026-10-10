/**
 * Ảnh minh hoạ cho bài "Hộp thư hợp nhất" (/huong-dan/inbox).
 *
 * Cần `E2E_SEED_INBOX=1` (nằm trong `E2E_SEED_ALL=1`): 8 hội thoại, 48 tin nhắn,
 * trong đó 1 hội thoại đặt `ai_paused = true` cho ô "AI đang tạm dừng".
 */
import {
  sidebarShot, regionShot, highlight, hideVolatileChrome, settle, contentShot, bandShot,
} from '../lib/shotHelpers.js';

const INBOX_PATH = '/app/settings/inbox';

/** Mở hộp thư và chọn hội thoại đầu tiên trong danh sách bên trái. */
async function openFirstConversation(page) {
  await page.goto(INBOX_PATH);
  const list = page.locator('main').getByRole('button').filter({ hasText: /💬|·/ });
  await page.locator('main input[placeholder*="tên khách" i]').waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);

  // Danh sách hội thoại không có vai trò ARIA riêng; lấy phần tử bấm được đầu
  // tiên trong cột trái, bỏ qua hàng nút lọc kênh ở trên đầu.
  const items = page.locator('main [role="button"], main li, main button')
    .filter({ hasNotText: /^(Tất cả|Web chat|OA|FB|Zalo|Báo cáo AI|Tìm kiếm)$/ });
  const count = await items.count();
  for (let i = 0; i < Math.min(count, 30); i += 1) {
    const item = items.nth(i);
    const box = await item.boundingBox().catch(() => null);
    // Thẻ hội thoại cao hơn nút lọc nhiều; dùng chiều cao để phân biệt.
    if (box && box.height > 48 && box.width > 200 && box.x < 420) {
      await item.click();
      await page.waitForTimeout(1200);
      return true;
    }
  }
  return false;
}

export default {
  slug: 'inbox',
  shots: [
    {
      name: 'menu-hop-thu',
      caption: 'menu bên trái đang mở nhóm AI Chatbot, khoanh đỏ mục "Hộp thư"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'AI Chatbot',
          itemName: 'Hộp thư',
          baseURL,
        });
      },
    },
    {
      name: 'menu-tep-va-dung-luong',
      caption: 'nhóm Cài đặt đang mở, khoanh đỏ mục "Tệp & dung lượng"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'Cài đặt',
          itemName: 'Tệp & dung lượng',
          baseURL,
        });
      },
    },
    {
      name: 'toan-man-hinh-hop-thu',
      caption: 'toàn màn hình Hộp thư',
      async take(page) {
        await openFirstConversation(page);
        await hideVolatileChrome(page);
        return contentShot(page, page.locator('main').first());
      },
    },
    {
      name: 'ba-khu-vuc',
      caption: 'khoanh đỏ các khu vực trên màn hình',
      async take(page) {
        await openFirstConversation(page);
        await hideVolatileChrome(page);

        // Ba khu vực bài viết nói tới: hàng lọc kênh, cột danh sách, khung chat.
        const filterRow = page.locator('main').locator('div').filter({
          has: page.getByRole('button', { name: 'Web chat', exact: true }),
        }).last();
        if (await filterRow.isVisible().catch(() => false)) await highlight(filterRow);

        // Chọn cột theo VỊ TRÍ và BỀ RỘNG. Lấy đại "khối cao nhất bên phải" sẽ
        // trúng chính <main>, khoanh ra thành viền quanh cả màn hình chứ không
        // phải khung chat — loại bằng cách đòi hẹp hơn main một khoảng rõ rệt.
        await page.locator('main div').evaluateAll((nodes) => {
          const main = document.querySelector('main');
          const mainBox = main.getBoundingClientRect();
          const boxes = nodes
            .map((el) => ({ el, r: el.getBoundingClientRect() }))
            .filter(({ r }) => r.height > 380);

          const left = boxes.find(({ r }) => r.x < mainBox.x + 40 && r.width > 200 && r.width < 480);
          const right = boxes.find(({ r }) => (
            r.x > mainBox.x + 300 && r.width > 400 && r.width < mainBox.width - 200
          ));
          for (const hit of [left, right]) {
            if (!hit) continue;
            hit.el.style.outline = '3px solid #e11d48';
            hit.el.style.outlineOffset = '-3px';
          }
        });
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first());
      },
    },
    {
      // Tab "Báo cáo AI": số liệu đọc từ GET /ai/chatbot/inbox/ai-activity. DB e2e không có hội thoại Zalo cá nhân do AI trả lời,
      // và nút "Bật lại tất cả AI" chỉ hiện khi có hội thoại tạm dừng quá 24 giờ — nên trả dữ liệu MẪU đúng hình dạng API.
      name: 'bao-cao-ai',
      caption: 'tab Báo cáo AI, khoanh đỏ các thẻ số, hàng bộ lọc và nút "Bật lại tất cả AI"',
      localOnly: true,
      async take(page) {
        const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
        const conv = (id, name, khach, ai, nguoi, chuaDoc, aiPaused) => ({
          id, visitorName: name, khachNhan: khach, aiTraLoi: ai, nguoiTraLoi: nguoi, chuaDoc, aiPaused,
          tinDau: at(8, 10 + id), tinCuoi: at(10, 5 + id), summary: null,
        });
        await page.route('**/api/ai/chatbot/inbox/ai-activity**', (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              hasSummaryCache: false,
              stats: {
                totalConversations: 12, totalKhachNhan: 58, totalAiTraLoi: 41, totalNguoiTraLoi: 9,
                totalChuaDoc: 4, totalAiPaused: 3, stalePausedCount: 2,
              },
              conversations: [
                conv(1, 'Nguyễn Minh Anh', 6, 5, 0, 0, false),
                conv(2, 'Trần Quốc Bảo', 9, 4, 3, 2, true),
                conv(3, 'Lê Thu Hà', 4, 4, 0, 0, false),
                conv(4, 'Phạm Gia Hân', 7, 2, 4, 2, true),
              ],
            },
          }),
        }));
        await page.goto(INBOX_PATH);
        const tab = page.locator('main').getByRole('button', { name: /Báo cáo AI/ }).first();
        await tab.waitFor({ state: 'visible', timeout: 30_000 });
        await tab.click();
        const resume = page.getByRole('button', { name: 'Bật lại tất cả AI', exact: true });
        await resume.waitFor({ state: 'visible', timeout: 20_000 });
        await settle(page);
        await hideVolatileChrome(page);

        const kpi = page.getByText('Hội thoại phát sinh', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"grid")][1]');
        const filters = page.getByRole('button', { name: /^Tất cả \(/ }).first().locator('xpath=..');
        // Khoanh từng thẻ số (khối lưới bao ngoài có đệm, viền khoanh bị cắt ở mép ảnh).
        const cards = kpi.locator('> div');
        for (let i = 0; i < await cards.count(); i += 1) await highlight(cards.nth(i));
        await highlight(filters);
        await highlight(resume);
        await page.waitForTimeout(200);
        // Từ đầu báo cáo (tiêu đề + dải cảnh báo) tới hết hàng bộ lọc.
        const top = page.getByRole('heading', { name: /Báo cáo AI phản hồi/ }).first().locator('xpath=ancestor::div[contains(@class,"shrink-0")][1]');
        return bandShot(page, top, filters.locator('xpath=..'), { pad: 10, padTop: 0 });
      },
    },
    {
      name: 'o-nhap-tra-loi',
      caption: 'đáy khung chat, khoanh đỏ ô nhập câu trả lời',
      async take(page) {
        if (!(await openFirstConversation(page))) {
          throw new Error('Không mở được hội thoại nào — cần E2E_SEED_INBOX=1');
        }
        const box = page.locator('main textarea, main input[placeholder*="trả lời" i], main input[placeholder*="tin nhắn" i]').last();
        if (!(await box.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Không thấy ô nhập câu trả lời ở đáy khung chat');
        }
        await hideVolatileChrome(page);
        await highlight(box);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first());
      },
    },
    {
      // 04/10/2026: nhãn trong danh sách đổi thành "Bạn đang trả lời" / "AI tắt";
      // đầu khung chat ghi "· AI tự bật lại sau …" (hoặc "Tự bật lại đang Tắt")
      // dưới tên khách, công tắc "AI tự động trả lời" nằm bên phải.
      name: 'cong-tac-ai',
      caption: 'đầu khung chat, khoanh đỏ công tắc AI và dòng chữ "AI tự bật lại sau" bên dưới tên khách',
      localOnly: true,
      async take(page) {
        await page.goto(INBOX_PATH);
        await page.locator('main input[placeholder*="tên khách" i]').waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);

        const badge = page.locator('main span').filter({ hasText: /^(Bạn đang trả lời|AI tắt)$/ }).first();
        if (!(await badge.isVisible({ timeout: 15_000 }).catch(() => false))) {
          throw new Error(
            'Không hội thoại nào đang tạm dừng AI. Nạp lại DB:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_INBOX=1 node scripts/seed-test-db.js',
          );
        }
        await badge.click();
        await page.waitForTimeout(1500);

        const toggle = page.locator('main button[role="switch"]').last();
        if (!(await toggle.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Mở được hội thoại nhưng không thấy công tắc AI ở đầu khung chat');
        }
        await hideVolatileChrome(page);
        const status = page.locator('main h2').last().locator('xpath=following-sibling::p[1]');
        if (await status.isVisible().catch(() => false)) await highlight(status);
        await highlight(toggle);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 300 });
      },
    },
  ],
};
