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
  await revealOnScrollContent(page);
  await page.waitForTimeout(400);
}

/**
 * Cuộn chậm hết trang rồi quay lại đầu, để các khối "hiện dần khi cuộn tới" kịp
 * hiện ra.
 *
 * Component AnimatedSection giữ opacity 0 cho tới khi IntersectionObserver báo
 * phần tử lọt vào khung nhìn. Cuộn NHẢY một phát (điều Playwright làm khi chụp
 * fullPage) thì phần tử không bao giờ được lấy mẫu ở trạng thái đang hiện —
 * quan sát viên không kích hoạt và khối đó chụp ra trắng trơn.
 *
 * Đã đo trên trang bảng giá thật: mới tải `1 1 1 0 0 0`, cuộn nhảy vẫn
 * `1 1 1 0 0 0`, cuộn từng nhịp thì `1 1 1 1 1 1`. Nửa dưới bảng giá biến mất
 * khỏi ảnh chụp chính vì chỗ này.
 */
export async function revealOnScrollContent(page) {
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
    const step = Math.max(200, Math.round(window.innerHeight * 0.6));
    const bottom = document.documentElement.scrollHeight;
    for (let y = 0; y <= bottom; y += step) {
      window.scrollTo(0, y);
      await wait(120);
    }
    window.scrollTo(0, 0);
    await wait(250);
  });
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
      /* Chốt chặn cuối cho khối hiện-dần-khi-cuộn nào vẫn còn ẩn sau khi đã cuộn
         qua: AnimatedSection đặt style trực tiếp nên phải !important mới đè được. */
      [style*="translateY(50px)"] { opacity: 1 !important; transform: none !important; }
      *, *::before, *::after {
        animation-duration: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });

  // Widget nổi ở góc dưới phải (bong bóng "Chat tư vấn" trên trang công khai) lọt
  // vào mọi ảnh. Đánh dấu data-help-shot-hide trong mã nguồn là cách sạch nhất,
  // nhưng chỉ có tác dụng sau khi deploy — nên ẩn thêm theo hình dạng để chụp
  // được ngay trên bản đang chạy. Điều kiện chặt (nhỏ, dính sát góc dưới phải)
  // để không ẩn nhầm nội dung thật.
  await page.evaluate(() => {
    for (const el of document.body.querySelectorAll('div, button, iframe')) {
      const style = window.getComputedStyle(el);
      if (style.position !== 'fixed') continue;
      const box = el.getBoundingClientRect();

      const inCorner = box.bottom > window.innerHeight - 140 && box.right > window.innerWidth - 140;
      if (inCorner && box.width < 500 && box.height < 700) {
        el.style.visibility = 'hidden';
        continue;
      }

      // Khay đựng thông báo của react-hot-toast: một lớp phủ gần kín khung nhìn,
      // không nhận chuột, KHÔNG có id hay class nào để bám. Nó trong suốt lúc
      // rảnh nên chỉ lộ ra khi vừa có thao tác sinh toast — ảnh dính một dải đen
      // ở đỉnh. Nhận diện theo hình dạng là cách duy nhất.
      const coversViewport = box.width > window.innerWidth * 0.8
        && box.height > window.innerHeight * 0.8;
      if (coversViewport && style.pointerEvents === 'none') {
        el.style.visibility = 'hidden';
        continue;
      }

      // Tay nắm bảng trợ lý AI khi đang thu: một mẩu hẹp dán vào mép phải, cao
      // giữa màn hình nên không lọt điều kiện "góc dưới phải" ở trên.
      const onRightEdge = box.right > window.innerWidth - 10 && box.width <= 60 && box.height >= 40;
      if (onRightEdge) el.style.visibility = 'hidden';
    }
  });
}

/**
 * Chụp một phần tử nhưng CẮT BỎ khoảng trắng thừa ở dưới và bên phải.
 *
 * Vùng cần chụp thường cao hơn nội dung thật rất nhiều: thanh menu trái cao hết
 * màn hình dù chỉ có mươi mục, khối bảng giá chừa sẵn chỗ cho gói chưa có. Chụp
 * nguyên khối thì gần nửa ảnh là nền trắng, chèn vào bài trông rất hụt.
 *
 * Đo bằng vị trí thật của các phần tử con đang hiển thị, rồi cắt tới đó.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 * @returns {Promise<{screenshot: (options?: object) => Promise<Buffer>}>}
 */
export async function contentShot(page, locator, { pad = 16, maxHeight = 0 } = {}) {
  const target = locator.first();

  const measure = () => target.evaluate((el, [padding, cap]) => {
    const root = el.getBoundingClientRect();
    let bottom = root.top;
    let right = root.left;
    for (const child of el.querySelectorAll('*')) {
      const style = window.getComputedStyle(child);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;
      const box = child.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      bottom = Math.max(bottom, Math.min(box.bottom, root.bottom));
      right = Math.max(right, Math.min(box.right, root.right));
    }
    let height = Math.max(Math.min(root.height, bottom - root.top + padding), 40);
    if (cap > 0) height = Math.min(height, cap);
    return {
      // Toạ độ theo KHUNG NHÌN. Trang này cuộn bên trong <main> chứ không cuộn
      // cửa sổ, nên cộng window.scrollY như trước cho ra khung sai với phần nằm
      // dưới màn hình — Playwright báo "Clipped area is either empty".
      x: root.left,
      y: root.top,
      width: Math.max(Math.min(root.width, right - root.left + padding), 40),
      height,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  }, [pad, maxHeight]);

  return {
    screenshot: async (options = {}) => {
      // Cuộn tới rồi mới đo: phần tử nằm ngoài màn hình có toạ độ âm hoặc vượt
      // đáy, cắt theo đó ra ảnh rỗng.
      await target.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(150);
      const box = await measure();

      const fitsInViewport = box.y >= 0
        && box.x >= 0
        && box.y + box.height <= box.viewportHeight
        && box.x + box.width <= box.viewportWidth;

      if (fitsInViewport) {
        return page.screenshot({
          ...options,
          clip: { x: box.x, y: box.y, width: box.width, height: box.height },
        });
      }
      // Cao hơn màn hình thì để Playwright tự lo: nó cuộn và ghép, chỉ mất phần
      // cắt bớt khoảng trắng.
      return target.screenshot(options);
    },
  };
}

/**
 * Từ một phần tử con, đi ngược lên cha cho tới khi gặp khối đủ lớn để ôm trọn
 * mục, rồi trả về locator trỏ đúng khối đó.
 *
 * Đếm cứng số cấp cha (`ancestor::*[2]`) không dùng được: mỗi trang lồng khác
 * nhau, ra khối quá nhỏ (ảnh cụt) hoặc quá lớn (ảnh cả trang). Tệ hơn là trúng
 * phần tử có kích thước 0 — Playwright báo "Clipped area is either empty".
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} child
 * @param {{minHeight?: number, minWidth?: number}} [options]
 */
export async function enclosingSection(page, child, { minWidth = 400 } = {}) {
  const marker = `help-shot-section-${Date.now()}`;
  const ok = await child.first().evaluate((el, [attr, minW]) => {
    // Ưu tiên "thẻ": khối gần nhất có bo góc hoặc viền. Các mục trên trang này
    // đều là thẻ, nên đây là ranh giới đúng của mục.
    //
    // Đi theo NGƯỠNG CHIỀU CAO thì hỏng: mục "Tình trạng tài khoản" chỉ cao
    // 162px, dưới ngưỡng, nên vòng lặp đi quá và vớ phải khối bao ngoài —
    // ảnh phình từ 324 lên 3152 pixel.
    let node = el;
    for (let i = 0; i < 8 && node; i += 1) {
      const box = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const isCard = parseFloat(style.borderRadius) > 2
        || parseFloat(style.borderTopWidth) > 0
        || style.boxShadow !== 'none';
      if (isCard && box.width >= minW && box.height > 60) {
        node.setAttribute(attr, '1');
        return true;
      }
      node = node.parentElement;
    }
    // Không thấy thẻ nào thì lấy khối đầu tiên rộng bằng yêu cầu.
    node = el;
    for (let i = 0; i < 8 && node; i += 1) {
      const box = node.getBoundingClientRect();
      if (box.width >= minW && box.height > 60) {
        node.setAttribute(attr, '1');
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }, [marker, minWidth]);

  return ok ? page.locator(`[${marker}]`).first() : child.first();
}

/**
 * Chụp một khối CAO HƠN KHUNG NHÌN bằng cách nới tạm khung nhìn cho nó lọt trọn.
 *
 * Cách mặc định của Playwright — cuộn rồi ghép nhiều ảnh — chỉ đúng khi trang
 * cuộn theo cửa sổ. Ở đây phần lớn màn hình cuộn bên trong một cột `overflow-auto`
 * riêng, nên nó cuộn cửa sổ (không nhúc nhích) rồi ghép ra ảnh vỡ: nửa dưới là
 * thứ nằm sau lưng khối cần chụp.
 *
 * Khung nhìn phải còn cao TỚI LÚC bấm máy: contentShot đo lại ngay trước khi
 * chụp, mà việc chụp do capture.spec.js gọi sau khi `take` đã trả về. Vì vậy
 * hàm này trả một vỏ bọc, tự trả khung nhìn về cũ sau khi chụp xong.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} height chiều cao tạm của khung nhìn
 * @param {() => Promise<{screenshot: Function}>} build dựng ảnh trong lúc khung nhìn còn cao
 */
export async function tallViewportShot(page, height, build) {
  const viewport = page.viewportSize();
  const restore = () => page.setViewportSize(viewport);
  await page.setViewportSize({ width: viewport.width, height });
  try {
    const shot = await build();
    return {
      screenshot: async (options = {}) => {
        try {
          return await shot.screenshot(options);
        } finally {
          await restore();
        }
      },
    };
  } catch (error) {
    await restore();
    throw error;
  }
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

  // Chụp riêng <nav> (danh sách mục) chứ không chụp cả <aside>: thanh menu cao
  // hết màn hình và có nút thu gọn GHIM Ở ĐÁY, nên cắt theo nội dung không ăn
  // thua — vẫn thừa gần nửa ảnh nền trắng ở giữa.
  const list = sidebar.locator('nav').first();
  const target = (await list.count()) ? list : sidebar;
  return contentShot(page, target);
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
  return contentShot(page, target);
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
