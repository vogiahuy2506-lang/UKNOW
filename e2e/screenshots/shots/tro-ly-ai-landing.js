/**
 * Ảnh minh hoạ cho bài "Trợ lý AI dựng landing page ngay trong khung chat" (/huong-dan/tro-ly-ai-landing).
 *
 * Trừ ảnh menu, mọi ảnh ở đây là KẾT QUẢ của AI chạy thật: máy thử phải có GEMINI_API_KEY thật trong
 * e2e/.env.test (không có thì `/ai/chat` trả "Thiếu GEMINI_API_KEY"). Các ảnh dùng CHUNG một cuộc trò chuyện
 * trên cùng trang — dựng trang một lần, sửa một lần — nên phải chạy đúng thứ tự khai báo bên dưới.
 * Tốn 2 lượt AI thật mỗi lần chạy. Không bấm "Lưu trang".
 */
import fs from 'node:fs/promises';
import {
  forceSidebarExpanded, highlight, hideVolatileChrome, settle, contentShot, paddedShot,
} from '../lib/shotHelpers.js';

/**
 * Dòng "Đã kiểm tra hiển thị ✓" TỰ ẨN sau 4 giây (LandingPageCard: setTimeout 4000). Chờ thẻ dựng xong rồi
 * mới đi chụp thì nó đã biến mất, nên ảnh của dòng này được bấm NGAY trong lúc chạy lượt sửa và giữ ở đây;
 * shot `dong-da-kiem-tra-hien-thi` chỉ việc ghi bộ đệm ra file.
 */
let okStripShot = null;

const BUILD_PROMPT = 'Tạo landing page cho khoá học "Marketing tự động hoá thực chiến": phần mở đầu có tiêu đề lớn, 3 lợi ích, lịch khai giảng và form đăng ký gồm họ tên, số điện thoại, email.';
const EDIT_PROMPT = 'Đổi nền phần mở đầu sang màu xanh đậm và chữ tiêu đề sang màu trắng.';

const chatBox = (page) => page.locator('main textarea').first();

/** Thẻ landing page mới nhất trong khung chat (khối bao gần nhất quanh nút "Sửa trang này với AI"). */
function landingCard(page) {
  return page.getByRole('button', { name: 'Sửa trang này với AI' }).last()
    .locator('xpath=ancestor::div[.//iframe][1]');
}

/** Dựng trang nếu khung chat chưa có thẻ nào — các ảnh sau dùng lại thẻ của ảnh trước. */
async function ensureLandingCard(page) {
  const editButton = page.getByRole('button', { name: 'Sửa trang này với AI' }).last();
  if (!(await editButton.isVisible().catch(() => false))) {
    await page.goto('/app');
    await chatBox(page).waitFor({ state: 'visible', timeout: 30_000 });
    await settle(page);
    const fresh = page.getByRole('button', { name: /^Mới$/ }).first();
    if (await fresh.isVisible().catch(() => false)) await fresh.click();
    await chatBox(page).fill(BUILD_PROMPT);
    await page.keyboard.press('Enter');
    await editButton.waitFor({ state: 'visible', timeout: 240_000 });
  }
  // Vòng tự kiểm hiển thị chạy nền sau khi thẻ hiện ra; chờ dòng "Đang kiểm tra hiển thị…" BIẾN MẤT để ảnh
  // không dính vòng xoay. (Đừng chờ dòng ✓ ở đây: nó tự ẩn sau 4 giây, chờ nó là ngồi hết timeout.)
  await page.waitForTimeout(1500);
  await page.getByText('Đang kiểm tra hiển thị…').last()
    .waitFor({ state: 'hidden', timeout: 180_000 }).catch(() => {});
  await page.waitForTimeout(800);
  await hideVolatileChrome(page);
  return landingCard(page);
}

export default {
  slug: 'tro-ly-ai-landing',
  timeoutMs: 900_000,
  shots: [
    {
      name: 'menu-tro-ly-ai',
      caption: 'menu bên trái, khoanh đỏ mục "Trợ lý AI" ở trên cùng',
      async take(page, { baseURL }) {
        await forceSidebarExpanded(page, baseURL);
        await page.goto('/app');
        const sidebar = page.locator('aside').first();
        await sidebar.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        await highlight(sidebar.getByText('Trợ lý AI', { exact: true }).first());
        await page.waitForTimeout(150);
        const list = sidebar.locator('nav').first();
        return contentShot(page, (await list.count()) ? list : sidebar);
      },
    },
    {
      name: 'o-chat-co-tep-pdf-dinh-kem',
      caption: 'ô chat đang có một tệp PDF đính kèm, khoanh đỏ nút đính kèm tệp',
      localOnly: true,
      async take(page) {
        await page.goto('/app');
        await chatBox(page).waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        // PDF tối thiểu hợp lệ — chỉ cần hiện thẻ tệp trong ô chat, không gửi đi. Tên ngắn để không bị "…".
        const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
        await page.locator('input[type="file"]').first()
          .setInputFiles({ name: 'bang-gia.pdf', mimeType: 'application/pdf', buffer: pdf });
        await page.getByText('bang-gia.pdf').first().waitFor({ state: 'visible', timeout: 30_000 });
        await page.waitForTimeout(3500);   // chờ toast "Đã tải lên 1 tệp" tự tắt
        await hideVolatileChrome(page);
        // Nút đính kèm ở trang chủ chỉ là biểu tượng kẹp giấy, không có title: nó là nút đầu của hàng ngay dưới ô nhập.
        await highlight(chatBox(page).locator('xpath=following-sibling::div[1]//button[1]'));
        await page.waitForTimeout(200);
        const composer = chatBox(page).locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
        return paddedShot(page, composer, { pad: 16 });
      },
    },
    {
      name: 'the-landing-vua-dung',
      caption: 'khung chat với thẻ landing page vừa dựng xong, thấy phần xem trước của trang',
      localOnly: true,
      async take(page) {
        const card = await ensureLandingCard(page);
        await card.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        return card;
      },
    },
    {
      name: 'hop-luu-va-xuat-ban',
      caption: 'hộp Lưu & xuất bản với ô Tiêu đề, ô Slug và ô tích Xuất bản ngay',
      localOnly: true,
      async take(page) {
        await ensureLandingCard(page);
        const viewport = page.viewportSize();
        // Ô chat GHIM ở đáy khung nhìn và đè lên nửa dưới của hộp lưu. Nới khung nhìn cho cả thẻ lọt trọn,
        // và ẩn ô chat trong lúc bấm máy.
        await page.setViewportSize({ width: viewport.width, height: 1900 });
        const composer = chatBox(page).locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
        try {
          await page.getByRole('button', { name: 'Lưu & xuất bản' }).last().click();
          const submit = page.getByRole('button', { name: 'Lưu trang', exact: true }).last();
          await submit.waitFor({ state: 'visible', timeout: 15_000 });
          await page.waitForTimeout(600);
          await hideVolatileChrome(page);
          await composer.evaluate((el) => { el.style.visibility = 'hidden'; }).catch(() => {});

          const titleLabel = page.getByText('Tiêu đề', { exact: true }).last();
          await titleLabel.scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);
          const top = await titleLabel.boundingBox();
          const bottom = await submit.boundingBox();
          const card = await landingCard(page).boundingBox();
          const pad = 18;
          const clip = {
            x: card.x, y: Math.max(0, top.y - pad),
            width: card.width, height: (bottom.y + bottom.height) - top.y + pad * 2,
          };
          return {
            screenshot: async (options = {}) => {
              try {
                return await page.screenshot({ ...options, clip });
              } finally {
                // Đóng hộp, hiện lại ô chat, trả khung nhìn. KHÔNG bấm "Lưu trang".
                await page.getByRole('button', { name: 'Hủy', exact: true }).last().click().catch(() => {});
                await composer.evaluate((el) => { el.style.visibility = ''; }).catch(() => {});
                await page.setViewportSize(viewport);
              }
            },
          };
        } catch (error) {
          await composer.evaluate((el) => { el.style.visibility = ''; }).catch(() => {});
          await page.setViewportSize(viewport);
          throw error;
        }
      },
    },
    {
      name: 'nut-sua-voi-ai-va-hoan-tac',
      caption: 'thẻ landing page, khoanh đỏ nút "Sửa trang này với AI" và nút "Hoàn tác"',
      localOnly: true,
      async take(page) {
        await ensureLandingCard(page);
        // "Hoàn tác" chỉ xuất hiện SAU một lần AI sửa trang → sửa thật một lượt.
        const undo = page.getByRole('button', { name: 'Hoàn tác', exact: true }).last();
        if (!(await undo.isVisible().catch(() => false))) {
          await page.getByRole('button', { name: 'Sửa trang này với AI' }).last().click();
          const editBox = page.getByPlaceholder(/Đổi nền sang màu tím/).last();
          await editBox.waitFor({ state: 'visible', timeout: 15_000 });
          await editBox.fill(EDIT_PROMPT);
          await page.getByRole('button', { name: 'Áp dụng sửa' }).last().click();

          // Bắt dòng ✓ ngay khi nó hiện (4 giây sau là mất) — xem chú thích ở `okStripShot`.
          const okLine = page.getByTestId('landing-layout-strip').last().getByText('Đã kiểm tra hiển thị ✓');
          const appeared = await okLine.waitFor({ state: 'visible', timeout: 300_000 }).then(() => true).catch(() => false);
          if (appeared) {
            await hideVolatileChrome(page);
            await highlight(okLine);
            const card = landingCard(page);
            await card.scrollIntoViewIfNeeded();
            okStripShot = await card.screenshot({ animations: 'disabled' });
            await okLine.evaluate((el) => { el.style.outline = ''; }).catch(() => {});
          }
          await undo.waitFor({ state: 'visible', timeout: 60_000 });
        }
        await page.waitForTimeout(800);
        await hideVolatileChrome(page);
        await highlight(page.getByRole('button', { name: 'Sửa trang này với AI' }).last());
        await highlight(undo);
        const card = landingCard(page);
        await card.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        return card;
      },
    },
    {
      name: 'dong-da-kiem-tra-hien-thi',
      caption: 'thẻ landing page với dòng trạng thái "Đã kiểm tra hiển thị ✓" ở dưới phần xem trước',
      localOnly: true,
      async take() {
        if (!okStripShot) {
          throw new Error('Chưa bắt được dòng "Đã kiểm tra hiển thị ✓" — nó chỉ hiện 4 giây sau lượt sửa của shot nut-sua-voi-ai-va-hoan-tac.');
        }
        const buffer = okStripShot;
        return { screenshot: async (options = {}) => { await fs.writeFile(options.path, buffer); return buffer; } };
      },
    },
  ],
};
