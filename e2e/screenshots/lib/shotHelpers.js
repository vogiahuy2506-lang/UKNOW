/**
 * Các thao tác dùng chung khi chụp ảnh minh hoạ cho bài hướng dẫn.
 *
 * Mọi thứ ở đây phải CHỈ ĐỌC: điều hướng, mở menu, mở hộp thoại xem — tuyệt đối
 * không bấm nút tạo đơn, xác nhận thanh toán hay lưu dữ liệu. Script này chạy
 * trên tài khoản thật ở production, một cú bấm nhầm là một đơn hàng thật.
 */

/** Màu khoanh — đỏ đủ tương phản trên nền sáng lẫn ảnh chụp nén. */
const HIGHLIGHT_COLOR = '#e11d48';

/**
 * Bật thanh menu trái ở trạng thái MỞ RỘNG.
 *
 * Mặc định của app là thu gọn chỉ còn biểu tượng (MainLayout đọc localStorage
 * `founder_ai_sidebar_open`, mặc định false). Chú thích trong bài luôn mô tả
 * menu đang mở kèm chữ, nên phải đặt cờ này TRƯỚC khi tải trang.
 */
export async function forceSidebarExpanded(page, baseURL) {
  await page.goto(baseURL);
  await page.evaluate(() => {
    window.localStorage.setItem('founder_ai_sidebar_open', 'true');
  });
}

/**
 * Chờ trang ổn định đủ để chụp.
 *
 * KHÔNG dùng `waitForLoadState('networkidle')`: site thật giữ kết nối SSE cho
 * hộp thư nên mạng không bao giờ rảnh, chờ kiểu đó luôn hết giờ. Thay bằng chờ
 * DOM dựng xong, chờ font tải xong (font chưa xong thì chữ nhảy sau khi chụp),
 * rồi nghỉ một nhịp ngắn cho hoạt ảnh chạy nốt.
 */
export async function settle(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(400);
}

/**
 * Ẩn những thứ động làm ảnh chụp mỗi lần một khác: bảng trợ lý AI nổi, các
 * thông báo toast, dải cảnh báo hết hạn mức. Không xoá khỏi DOM (có thể làm vỡ
 * bố cục) mà chỉ ẩn.
 */
export async function hideVolatileChrome(page) {
  await page.addStyleTag({
    content: `
      [data-testid="ai-assistant-panel"],
      .Toastify, [class*="toast"],
      [data-help-shot-hide] { visibility: hidden !important; }
      *, *::before, *::after {
        animation-duration: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });
}

/**
 * Khoanh đỏ một phần tử.
 *
 * Dùng outline chứ không dùng border: outline không chiếm chỗ nên không đẩy bố
 * cục, ảnh chụp ra giống hệt trang thật, chỉ thêm viền.
 */
export async function highlight(locator) {
  await locator.first().evaluate((el, color) => {
    el.style.outline = `3px solid ${color}`;
    el.style.outlineOffset = '2px';
    el.style.borderRadius = '6px';
  }, HIGHLIGHT_COLOR);
}

/**
 * Chụp ảnh thanh menu trái với một nhóm đang mở và một mục được khoanh đỏ.
 *
 * Đây là mẫu chú thích lặp nhiều nhất trong bộ bài hướng dẫn (hơn 20 chỗ), nên
 * gói lại thành một hàm thay vì chép đi chép lại.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{groupName: string, itemName: string, baseURL: string}} options
 */
export async function sidebarShot(page, { groupName, itemName, baseURL }) {
  await forceSidebarExpanded(page, baseURL);
  await page.goto('/app');

  const sidebar = page.locator('aside').first();
  await sidebar.waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);
  await hideVolatileChrome(page);

  // Mở nhóm nếu mục con chưa hiện. Bấm lại khi đang mở sẽ đóng nhóm lại.
  const item = sidebar.getByRole('link', { name: itemName, exact: true });
  if (!(await item.isVisible().catch(() => false))) {
    await sidebar.getByRole('button', { name: new RegExp(escapeRegExp(groupName)) }).first().click();
    await item.waitFor({ state: 'visible' });
  }

  await highlight(item);
  await page.waitForTimeout(150);   // chờ outline vẽ xong
  return sidebar;
}

/**
 * Mở một trang và chụp đúng một vùng, có thể khoanh đỏ một phần tử bên trong.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{path: string, clip: string, mark?: string, waitFor?: string}} options
 *        clip/mark/waitFor là bộ chọn CSS hoặc text locator.
 */
export async function regionShot(page, { path, clip, mark, waitFor }) {
  await page.goto(path);
  if (waitFor) await page.locator(waitFor).first().waitFor({ state: 'visible', timeout: 30_000 });

  const target = page.locator(clip).first();
  await target.waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);
  await hideVolatileChrome(page);
  if (mark) await highlight(page.locator(mark));
  await page.waitForTimeout(150);
  return target;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
