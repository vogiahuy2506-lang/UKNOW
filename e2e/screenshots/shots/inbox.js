/**
 * Ảnh minh hoạ cho bài "Hộp thư hợp nhất" (/huong-dan/inbox).
 *
 * Cần `E2E_SEED_INBOX=1` (nằm trong `E2E_SEED_ALL=1`): 8 hội thoại, 48 tin nhắn,
 * trong đó 1 hội thoại đặt `ai_paused = true` cho ô "AI đang tạm dừng".
 */
import {
  sidebarShot, regionShot, highlight, hideVolatileChrome, settle, contentShot,
} from '../lib/shotHelpers.js';

const INBOX_PATH = '/app/settings/inbox';

/** Mở hộp thư và chọn hội thoại đầu tiên trong danh sách bên trái. */
async function openFirstConversation(page) {
  await page.goto(INBOX_PATH);
  const list = page.locator('main').getByRole('button').filter({ hasText: /💬|·/ });
  await page.locator('main input[placeholder*="hội thoại" i]').waitFor({ state: 'visible', timeout: 30_000 });
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
      name: 'menu-lich-su-tro-chuyen',
      caption: 'menu bên trái đang mở nhóm AI Chatbot, khoanh đỏ mục "Lịch sử trò chuyện"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'AI Chatbot',
          itemName: 'Lịch sử trò chuyện',
          baseURL,
        });
      },
    },
    {
      name: 'menu-thu-vien-media',
      caption: 'khoanh đỏ mục "Thư viện media" ở cuối nhóm',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'AI Chatbot',
          itemName: 'Thư viện media',
          baseURL,
        });
      },
    },
    {
      name: 'toan-man-hinh-hop-thu',
      caption: 'toàn màn hình Lịch sử trò chuyện',
      async take(page) {
        await openFirstConversation(page);
        await hideVolatileChrome(page);
        return contentShot(page, page.locator('main').first());
      },
    },
    {
      name: 'ba-khu-vuc',
      caption: 'khoanh đỏ ba khu vực trên màn hình',
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
      // BÀI VIẾT MÔ TẢ SAI: chú thích nói nhãn là "AI đang tạm dừng". Giao diện
      // thật ghi "AI tự động trả lời" kèm công tắc; chuỗi 'inbox.aiPausedHint'
      // ("AI đang tạm dừng") có trong i18n nhưng KHÔNG được dùng ở đâu trong mã.
      // Chụp đúng thứ có thật; câu chữ trong bài cần sửa lại cho khớp.
      name: 'cong-tac-ai',
      caption: 'khoanh đỏ nhãn "AI đang tạm dừng" và công tắc AI bên cạnh',
      localOnly: true,
      async take(page) {
        await page.goto(INBOX_PATH);
        await page.locator('main input[placeholder*="hội thoại" i]').waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);

        // Hội thoại đang tạm dừng AI mang nhãn "Tạm dừng" (hoặc "Thủ công" nếu
        // dừng tay) trong danh sách bên trái. Bấm vào chính thẻ chứa nhãn đó.
        const badge = page.locator('main span').filter({ hasText: /^(Tạm dừng|Thủ công)$/ }).first();
        if (!(await badge.isVisible({ timeout: 15_000 }).catch(() => false))) {
          throw new Error(
            'Không hội thoại nào đang tạm dừng AI. Nạp lại DB:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_INBOX=1 node scripts/seed-test-db.js',
          );
        }
        await badge.locator('xpath=ancestor::*[self::div or self::li or self::button][3]').click();
        await page.waitForTimeout(1500);

        const aiLabel = page.getByText('AI tự động trả lời', { exact: false }).first();
        if (!(await aiLabel.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Mở được hội thoại nhưng không thấy nhãn AI ở đầu khung chat');
        }
        await hideVolatileChrome(page);
        await highlight(aiLabel);
        const toggle = page.locator('main button[role="switch"], main input[type="checkbox"]').first();
        if (await toggle.isVisible().catch(() => false)) await highlight(toggle);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 300 });
      },
    },
  ],
};
