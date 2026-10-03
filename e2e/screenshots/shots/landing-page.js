/**
 * Ảnh minh hoạ cho bài "Landing page thu khách hàng" (/huong-dan/landing-page).
 *
 * Cần `E2E_SEED_LANDING=1` (nằm trong `E2E_SEED_ALL=1`): 2 trang đã xuất bản,
 * 1 trang có HTML thật kèm mốc form, 1 trang có tên miền riêng đang chờ DNS,
 * và 3 mẫu công khai trong thư viện template.
 *
 * Bài viết bản 03/10/2026 có 13 ô chú thích; mỗi `shots[].caption` dưới đây khớp ĐÚNG MỘT ô. Từ bản này file chỉ còn
 * những ảnh có ô tương ứng — ảnh "ten-mien-rieng" của giao diện cũ (tab Subdomain / Tên miền riêng) đã bỏ vì ô đó không còn.
 *
 * Màn hình Cài đặt trang (PLAN_DON_GIAN_CAI_DAT_LANDING_VA_BIEU_MAU + PLAN_TEN_MIEN_RIENG, 03/10/2026) là một hộp thoại
 * ba khối: "Xuất bản & đường dẫn" → "Form thu khách" → "Ảnh đã tải lên". Ảnh tên miền riêng đi qua đường THẬT (bấm nút,
 * gõ tên miền, bấm Kiểm tra) nhưng bước "Kiểm tra" bị chặn bằng page.route: backend sẽ gọi DNS thật của một tên miền
 * không có thật, nên phản hồi giả có đúng hình dạng của `buildDnsCheckResult` (landingPageDomain.service.js). Không có
 * cuộc gọi nào tới Cloudflare / DNS, và KHÔNG bấm "Kết nối tên miền" (PUT sẽ ghi DB).
 *
 * LỆCH GIỮA BÀI VIẾT VÀ GIAO DIỆN (chụp đúng thứ có thật; câu chữ bài nên sửa — xem báo cáo cuối lượt):
 *  - Ô 3: bài gọi ba lựa chọn "Dán HTML có sẵn / Nhờ AI tạo / Chọn mẫu" (khoá i18n `emptyState.*` không còn component nào
 *    dùng); màn hình thật là ô nhập mô tả kèm nút "Tạo trang" (AI), nút "Dán mã HTML" và nút "Thư viện mẫu". Khi trang còn
 *    trống màn này chiếm cả khung, chưa có cột chat bên trái / xem trước bên phải như bài tả.
 *  - Ô 5: "Nhập HTML / Template / Trình chỉnh sửa khối / Lịch sử" nằm trong menu "Công cụ" chứ không phải nút riêng trên
 *    thanh; chỉ "Cài đặt" và "Lưu" là nút nằm sẵn trên thanh.
 *  - Ô 11: bảng DNS (chỉ hiện khi DNS CHƯA đúng) và nút "Kết nối tên miền" (chỉ hiện khi DNS ĐÃ đúng) không bao giờ cùng
 *    xuất hiện — ảnh ghép hai trạng thái thật theo chiều dọc.
 */
import {
  sidebarShot, highlight, hideVolatileChrome, settle, contentShot,
  tallViewportShot, paddedShot, boxAround, drawBoxes,
} from '../lib/shotHelpers.js';
import { ensureDemoForm, withDb } from '../lib/shotFixtures.js';

const LANDING_PATH = '/app/settings/landing-pages';
const MARKETING_TITLE = 'Khoá học Marketing';
const MARKETING_SLUG = 'khoa-hoc-marketing-tu-dong-hoa';

/** Mở trình sửa của một trang trong danh sách (bấm nút bút chì `title="Sửa"` ở cuối dòng, KHÔNG bấm vào dòng). */
async function openEditor(page, { pageTitle }) {
  await page.goto(LANDING_PATH);
  await page.getByRole('heading', { name: 'Quản lý Landing Pages' })
    .waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);
  // Trình sửa tự ghi nháp (localStorage) khi trang đổi mà chưa lưu — ảnh nào sửa trang bằng AI để lại nháp, lần mở sau
  // sẽ hiện dải vàng "Bỏ bản nháp" và nội dung đã sửa. Xoá trước khi mở.
  await page.evaluate(() => {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith('founderai:landingCanvasDraft:'))
      .forEach((key) => window.localStorage.removeItem(key));
  });

  const row = page.locator('tbody tr').filter({ hasText: pageTitle }).first();
  if (!(await row.isVisible({ timeout: 15_000 }).catch(() => false))) {
    throw new Error(
      `Không thấy trang "${pageTitle}" trong danh sách. Nạp lại DB:\n`
      + '  E2E_SEED_ALL=1 node scripts/seed-test-db.js',
    );
  }
  await row.locator('button[title="Sửa"]').first().click();
  // "Lưu" là mốc chắc chắn nhất cho biết thanh công cụ đã dựng xong.
  await page.getByRole('button', { name: 'Lưu', exact: true })
    .first().waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(1500);
}

/** Bấm nút "Cài đặt" trên thanh trình sửa (không phải mục "Cài đặt" của menu trái) và trả về hộp thoại. */
async function openSettings(page) {
  await page.locator('main').getByRole('button', { name: 'Cài đặt', exact: true }).first().click();
  const heading = page.getByRole('heading', { name: 'Cài đặt trang', exact: true });
  await heading.waitFor({ state: 'visible', timeout: 15_000 });
  // Tình trạng tên miền nạp từ server sau khi hộp thoại mở.
  await page.waitForTimeout(1500);
  return page.locator('div.rounded-2xl.shadow-2xl').filter({ has: heading }).first();
}

/** Một khối trong hộp Cài đặt trang, nhận ra qua tiêu đề của khối. */
function settingsCard(modal, title) {
  return modal.locator('div.rounded-xl.overflow-hidden')
    .filter({ has: modal.page().getByText(title, { exact: true }) })
    .first();
}

/**
 * Trang mẫu "Khoá học Marketing" ở DB seed không có hàng tên miền nào. Ở production MỌI trang đều có một hàng
 * `<slug>.founderai.biz` (60/60 ở đo 03/10), và giao diện chỉ hiện câu "Link miễn phí vẫn chạy cho tới khi kết nối xong"
 * khi hàng đó có — nên dựng hàng này để ảnh giống thứ khách thật thấy.
 */
async function ensureFreeDomainRow() {
  await withDb((db) => db.query(
    `INSERT INTO landing_page_domains
       (landing_page_id, hostname, is_apex_domain, verification_token, status, cf_managed, verified_at)
     SELECT lp.id, lp.slug || '.founderai.biz', FALSE, 'shot-free-' || lp.id, 'active', TRUE, NOW()
       FROM landing_pages lp
      WHERE lp.slug = $1
        AND NOT EXISTS (SELECT 1 FROM landing_page_domains d WHERE d.landing_page_id = lp.id)`,
    [MARKETING_SLUG],
  ));
}

/**
 * Seed đặt mốc form kiểu cũ `<!-- UKNOW_LP_FORM -->` mà trình sửa không vẽ gì ra. Trang do AI dựng ngày nay mang chỗ
 * trống `<div data-founderai-form-slot></div>`, và khung xem trước thay nó bằng khối chấm cam "Biểu mẫu đăng ký sẽ hiện
 * ở đây sau khi lưu" — chính khối người dùng không được xoá.
 */
async function ensureFormSlotInHtml() {
  await withDb((db) => db.query(
    `UPDATE landing_pages
        SET html_content = REPLACE(html_content, '<!-- UKNOW_LP_FORM -->', '<div data-founderai-form-slot></div>')
      WHERE slug = $1 AND html_content LIKE '%<!-- UKNOW_LP_FORM -->%'`,
    [MARKETING_SLUG],
  ));
}

/** Hai ảnh danh sách không đánh dấu `localOnly` (chỉ đọc, chạy được trên production) nên chỉ dựng hàng miễn phí khi trỏ vào máy mình. */
const isLocalBase = (baseURL) => /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(String(baseURL || ''));

/** Phản hồi của POST .../custom-domain/check — cùng hình dạng với `buildDnsCheckResult` ở backend. */
function dnsCheckResponse({ verified }) {
  const hostname = 'lp.tenmien.com';
  return {
    success: true,
    data: {
      hostname,
      isApexDomain: false,
      verified,
      reason: verified ? 'ok' : 'not_found',
      found: verified ? ['founderai.biz'] : [],
      currentIp: null,
      dnsRecords: [{ type: 'CNAME', host: 'lp', value: 'founderai.biz', ttl: 3600 }],
      cnameTarget: 'founderai.biz',
      apexFixedIp: null,
      message: verified
        ? `DNS của ${hostname} đã trỏ đúng về hệ thống.`
        : `${hostname} chưa tồn tại trong DNS công khai. Kiểm tra: (1) bản ghi đã thêm đúng nhà cung cấp đang giữ `
          + 'nameserver của domain chưa? (Tra bằng: dig NS tenmien.com) (2) trường Name chỉ điền phần subdomain, '
          + 'ví dụ "giahuy", không điền full domain.',
    },
  };
}

/** Xếp các ảnh PNG theo chiều dọc thành một ảnh (đặt hai ảnh THẬT cạnh nhau, không sửa gì bên trong). */
async function stackVertically(page, buffers, { gap = 20 } = {}) {
  const composer = await page.context().newPage();
  try {
    // deviceScaleFactor của context là 2: ảnh chụp rộng N pixel ứng với N/2 pixel CSS.
    const imgs = buffers.map((buffer, index) => {
      const cssWidth = buffer.readUInt32BE(16) / 2;
      const src = `data:image/png;base64,${buffer.toString('base64')}`;
      return `<img src="${src}" style="display:block;width:${cssWidth}px;${index ? `margin-top:${gap}px;` : ''}">`;
    }).join('');
    await composer.setContent(
      `<body style="margin:0;background:#fff"><div id="stack" style="display:inline-block;background:#fff">${imgs}</div></body>`,
    );
    await composer.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
    return composer;
  } catch (error) {
    await composer.close();
    throw error;
  }
}

export default {
  slug: 'landing-page',
  timeoutMs: 600_000,
  shots: [
    {
      name: 'menu-tao-landing-page',
      caption: 'menu bên trái đang mở nhóm Landing page, khoanh đỏ mục "Tạo Landing page"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'Landing page',
          itemName: 'Tạo Landing page',
          baseURL,
        });
      },
    },
    {
      name: 'danh-sach-landing-page',
      caption: 'trang danh sách landing page, thấy các trang đã tạo kèm trạng thái đã xuất bản',
      async take(page, { baseURL }) {
        // Cùng trạng thái với ảnh "nut-chia-se-tren-danh-sach": trang mẫu có hàng link miễn phí như ở production.
        if (isLocalBase(baseURL)) await ensureFreeDomainRow();
        await page.goto(LANDING_PATH);
        await page.locator('main table').first().waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        // Cắt theo chiều cao thay vì để contentShot tự đo: khung trang có một khối bao CAO HẾT MÀN HÌNH
        // (`div.relative.h-full`), nên phép đo "đáy của phần tử con thấp nhất" luôn chạm đáy <main>.
        return contentShot(page, page.locator('main').first(), { maxHeight: 440 });
      },
    },
    {
      name: 'ba-lua-chon-trinh-soan-trong',
      caption: 'trình soạn trang còn trống, khoanh đỏ ba lựa chọn Dán HTML có sẵn / Nhờ AI tạo / Chọn mẫu',
      async take(page) {
        await page.goto(`${LANDING_PATH}/new`);
        const pasteHtml = page.getByRole('button', { name: 'Dán mã HTML', exact: true }).first();
        const gallery = page.getByRole('button', { name: 'Thư viện mẫu', exact: true }).first();
        await pasteHtml.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        // Lựa chọn "Nhờ AI tạo" = ô mô tả lớn ở giữa kèm nút "Tạo trang".
        const composer = page.locator('main textarea').first()
          .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
        await highlight(composer);
        await highlight(pasteHtml);
        await highlight(gallery);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 830 });
      },
    },
    {
      name: 'khung-chat-ai-dinh-kem-va-hoan-tac',
      caption: 'khung chat AI Assistant bên trái, khoanh đỏ nút Đính kèm tệp và nút Hoàn tác',
      localOnly: true,
      async take(page) {
        // "Hoàn tác" chỉ hiện trên tin của AI SAU khi AI tự áp một lượt sửa. Ưu tiên gọi AI THẬT (GEMINI_API_KEY trong
        // e2e/.env.test, tốn 1 lượt); nếu backend e2e không gọi được AI thì trả một bản sửa nhỏ có thật trên HTML của trang
        // để nút hiện ra — xem log "[landing-page] AI ...". Trang KHÔNG được lưu: không bấm "Lưu".
        let aiSource = 'thật';
        await page.route('**/api/ai/edit-landing-html', async (route) => {
          try {
            const res = await route.fetch({ timeout: 100_000 });
            const body = await res.json().catch(() => null);
            if (res.ok() && (body?.html || body?.data?.html || body?.data?.data?.html)) {
              await route.fulfill({ response: res, json: body });
              return;
            }
          } catch {
            // rơi xuống bản dự phòng
          }
          aiSource = 'DỰ PHÒNG (backend e2e không trả được bản sửa của AI)';
          const current = String(route.request().postDataJSON()?.currentHtml || '');
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              html: current.replace('bg-orange-500', 'bg-orange-600').replace('text-4xl', 'text-5xl'),
              summary: 'Đã đổi nút "Đăng ký ngay" sang màu cam đậm hơn và tăng cỡ chữ của tiêu đề chính.',
            }),
          });
        });

        // Khung nhìn thấp hơn mặc định: cột chat cao bằng khung nhìn, mà chỉ có hai tin nhắn nên cao 900px là toàn khoảng trắng.
        return tallViewportShot(page, 700, async () => {
          await openEditor(page, { pageTitle: MARKETING_TITLE });
          const input = page.locator('main textarea').first();
          await input.waitFor({ state: 'visible', timeout: 30_000 });
          await input.fill('Đổi màu nút đăng ký sang màu cam đậm và làm tiêu đề chính to hơn một chút.');
          await page.locator('main button[title="Gửi"]').first().click();
          const undo = page.locator('main').getByRole('button', { name: 'Hoàn tác' }).last();
          await undo.waitFor({ state: 'visible', timeout: 150_000 });
          console.log(`  [landing-page] bản sửa của AI: ${aiSource}`);
          await page.waitForTimeout(1500);
          await settle(page);
          await hideVolatileChrome(page);
          await highlight(page.locator('main button[title*="Đính kèm"]').first());
          await highlight(undo);
          await page.waitForTimeout(200);
          // Cột chat bên trái = khối bao gần nhất chứa cả ô nhập lẫn tiêu đề "AI Assistant".
          const panel = input.locator('xpath=ancestor::div[.//*[normalize-space()="AI Assistant"]][1]');
          return paddedShot(page, panel, { pad: 6 });
        });
      },
    },
    {
      name: 'thanh-cong-cu-trinh-soan',
      caption: 'thanh công cụ của trình soạn, khoanh đỏ các nút Nhập HTML, Template, Trình chỉnh sửa khối, Lịch sử, Cài đặt, Lưu',
      localOnly: true,
      async take(page) {
        // Mở một trang ĐÃ LƯU: mục "Lịch sử" chỉ có khi trang đã có phiên bản.
        await openEditor(page, { pageTitle: MARKETING_TITLE });
        await settle(page);
        await hideVolatileChrome(page);

        const main = page.locator('main');
        const save = main.getByRole('button', { name: 'Lưu', exact: true }).first();
        const settings = main.getByRole('button', { name: 'Cài đặt', exact: true }).first();
        // Nhập HTML / Template / Trình chỉnh sửa khối / Lịch sử là bốn mục của menu "Công cụ", không phải nút riêng.
        await main.getByRole('button', { name: 'Công cụ' }).first().click();
        const menu = page.locator('div.absolute.right-0').filter({ hasText: 'Mẫu & Trình dựng' }).first();
        await menu.waitFor({ state: 'visible', timeout: 10_000 });
        const item = (label) => menu.getByRole('button', { name: new RegExp(label) }).first();
        const template = item('Template');
        const blocks = item('Trình chỉnh sửa khối');
        const importHtml = item('Nhập HTML');
        const history = item('Lịch sử');
        for (const [name, locator] of [['Template', template], ['Trình chỉnh sửa khối', blocks], ['Nhập HTML', importHtml], ['Lịch sử', history]]) {
          if (!(await locator.isVisible().catch(() => false))) throw new Error(`Menu Công cụ thiếu mục "${name}"`);
        }

        // Ba mục đầu nằm liền nhau → một khung chung; "Lịch sử" cách một mục ("Lưu làm template") → khung riêng.
        const boxes = [
          await boxAround(menu, [template, blocks, importHtml], { pad: 2 }),
          await boxAround(menu, [history], { pad: 2 }),
        ];
        await drawBoxes(menu, boxes);
        await highlight(settings);
        await highlight(save);
        await page.waitForTimeout(250);

        // Dải ảnh: từ nút "Toàn cảnh" (cho thấy thanh còn nhiều nút khác bên trái) tới đáy menu, rộng tới mép phải.
        const anchor = main.locator('button[title*="toàn cảnh"], button[title*="chat"]').first();
        const anchorBox = (await anchor.boundingBox().catch(() => null)) || await settings.boundingBox();
        const menuBox = await menu.boundingBox();
        const viewport = page.viewportSize();
        const x = Math.max(0, anchorBox.x - 6);
        const clip = {
          x,
          y: 0,
          width: viewport.width - x,
          height: Math.min(viewport.height, menuBox.y + menuBox.height + 16),
        };
        return { screenshot: (options = {}) => page.screenshot({ ...options, clip }) };
      },
    },
    {
      name: 'menu-khach-hang-tu-landing',
      caption: 'menu bên trái, nhóm Landing page đang mở, khoanh đỏ mục "Khách hàng từ Landing page"',
      async take(page, { baseURL }) {
        return sidebarShot(page, {
          groupName: 'Landing page',
          itemName: 'Khách hàng từ Landing page',
          baseURL,
        });
      },
    },
    {
      name: 'form-thu-khach-chon-cach',
      caption: 'mục Form thu khách trong Cài đặt, khoanh đỏ hai lựa chọn Form cơ bản và Dùng biểu mẫu đã tạo cùng ô chọn biểu mẫu',
      localOnly: true,
      async take(page) {
        // Cần có ít nhất một biểu mẫu trong mục Biểu mẫu để ô chọn có thứ mà chọn (dùng chung biểu mẫu mẫu của bài `bieu-mau`).
        await page.goto(LANDING_PATH);
        await page.getByRole('heading', { name: 'Quản lý Landing Pages' }).waitFor({ state: 'visible', timeout: 30_000 });
        const demoForm = await ensureDemoForm(page);

        await openEditor(page, { pageTitle: MARKETING_TITLE });
        return tallViewportShot(page, 1500, async () => {
          const modal = await openSettings(page);
          const card = settingsCard(modal, 'Form thu khách');
          // Chọn "Dùng biểu mẫu đã tạo" rồi chọn một biểu mẫu trong ô danh sách. Chưa bấm Lưu nên trang không đổi gì.
          const linked = card.getByRole('radio', { name: 'Dùng biểu mẫu đã tạo' });
          await linked.check();
          const select = card.locator('#lead-form-linked-select');
          await select.waitFor({ state: 'visible', timeout: 15_000 });
          await page.waitForFunction(
            () => document.querySelectorAll('#lead-form-linked-select option').length > 1,
            null,
            { timeout: 15_000 },
          );
          await select.selectOption(String(demoForm.id));
          await page.waitForTimeout(400);
          await hideVolatileChrome(page);

          for (const label of ['Form cơ bản', 'Dùng biểu mẫu đã tạo']) {
            await highlight(card.locator('label', { has: page.getByRole('radio', { name: label, exact: true }) }));
          }
          await highlight(select);
          await page.waitForTimeout(250);
          return contentShot(page, card);
        });
      },
    },
    {
      name: 'khoi-form-dang-ky',
      caption: 'khối form đăng ký trên trang, khoanh đỏ để người đọc nhận ra khối nào không được xoá',
      localOnly: true,
      async take(page) {
        await ensureFormSlotInHtml();
        await openEditor(page, { pageTitle: MARKETING_TITLE });
        await hideVolatileChrome(page);

        // Khối form trong khung xem trước (iframe): khối chấm cam thay cho chỗ trống `data-founderai-form-slot`.
        const preview = page.locator('main iframe').first();
        await preview.waitFor({ state: 'visible', timeout: 30_000 });
        const block = page.frameLocator('main iframe').first()
          .locator('div', { hasText: 'Biểu mẫu đăng ký sẽ hiện ở đây sau khi lưu' }).last();
        // `isVisible` không chờ gì cả: chờ khung xem trước dựng xong (nạp Tailwind CDN) bằng waitFor.
        if (!(await block.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false))) {
          throw new Error(
            'Khung xem trước không vẽ khối form. Trang phải chứa <div data-founderai-form-slot></div> '
            + '(ensureFormSlotInHtml chỉ đổi được mốc <!-- UKNOW_LP_FORM --> của seed).',
          );
        }
        // Khoanh ngay trong iframe: outline vẽ ra ngoài hộp nên chừa lề cho nó bằng margin (lề trên để viền không đè lên dòng tiêu đề).
        await block.evaluate((el) => {
          el.style.outline = '4px solid #e11d48';
          el.style.outlineOffset = '4px';
          el.style.margin = '16px 8px 8px';
          el.scrollIntoView({ block: 'center' });
        });
        await page.waitForTimeout(400);
        // Bỏ dải 52px trên cùng của khung xem trước: cuộn tới khối form thường làm một dòng chữ phía trên bị cắt đôi.
        const box = await preview.boundingBox();
        const clip = { x: box.x, y: box.y + 52, width: box.width, height: box.height - 52 };
        return { screenshot: (options = {}) => page.screenshot({ ...options, clip }) };
      },
    },
    {
      name: 'xuat-ban-va-duong-dan',
      caption: 'mục Xuất bản & đường dẫn trong Cài đặt, khoanh đỏ ô link của trang cùng nút Sao chép và Mở trang',
      localOnly: true,
      async take(page) {
        await ensureFreeDomainRow();
        await openEditor(page, { pageTitle: MARKETING_TITLE });
        return tallViewportShot(page, 1500, async () => {
          const modal = await openSettings(page);
          await hideVolatileChrome(page);
          const card = settingsCard(modal, 'Xuất bản & đường dẫn');
          const url = card.getByTestId('landing-public-url');
          if (!(await url.isVisible().catch(() => false))) throw new Error('Không thấy ô link của trang (trang chưa có slug?)');
          // Một khung chung quanh cả hàng: ô link + Sao chép + Mở trang nằm sát nhau, khoanh riêng thì viền đè lên nhau.
          const row = [
            url,
            card.getByRole('button', { name: 'Sao chép', exact: true }),
            card.getByRole('link', { name: 'Mở trang' }),
          ];
          await drawBoxes(card, [await boxAround(card, row, { pad: 6 })]);
          await page.waitForTimeout(250);
          return contentShot(page, card);
        });
      },
    },
    {
      name: 'nut-dung-ten-mien-rieng',
      caption: 'mục Xuất bản & đường dẫn, khoanh đỏ nút Dùng tên miền riêng của bạn',
      localOnly: true,
      async take(page) {
        await ensureFreeDomainRow();
        await openEditor(page, { pageTitle: MARKETING_TITLE });
        return tallViewportShot(page, 1500, async () => {
          const modal = await openSettings(page);
          await hideVolatileChrome(page);
          const card = settingsCard(modal, 'Xuất bản & đường dẫn');
          const button = card.getByRole('button', { name: 'Dùng tên miền riêng của bạn', exact: true });
          await button.waitFor({ state: 'visible', timeout: 15_000 });
          await highlight(button);
          await page.waitForTimeout(250);
          return contentShot(page, card);
        });
      },
    },
    {
      name: 'bang-dns-ten-mien-rieng',
      caption: 'bảng bản ghi DNS sau khi bấm Kiểm tra, khoanh đỏ cột Tên (Host) và Giá trị (Value) cùng nút Kết nối tên miền',
      localOnly: true,
      async take(page) {
        await ensureFreeDomainRow();
        // Chặn bước "Kiểm tra" (backend sẽ tra DNS thật của tên miền không có thật). Phản hồi đổi theo `state.verified`.
        const state = { verified: false };
        await page.route('**/api/admin/landing-pages/*/custom-domain/check', (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(dnsCheckResponse(state)),
        }));

        await openEditor(page, { pageTitle: MARKETING_TITLE });
        return tallViewportShot(page, 1700, async () => {
          const modal = await openSettings(page);
          await hideVolatileChrome(page);
          const card = settingsCard(modal, 'Xuất bản & đường dẫn');
          await card.getByRole('button', { name: 'Dùng tên miền riêng của bạn', exact: true }).click();
          const panel = card.getByTestId('custom-domain-connect');
          await panel.waitFor({ state: 'visible', timeout: 15_000 });
          await panel.getByLabel('Tên miền của bạn').fill('lp.tenmien.com');
          await panel.getByRole('button', { name: 'Kiểm tra', exact: true }).click();

          // Trạng thái 1: DNS chưa đúng → bảng bản ghi cần thêm.
          const table = panel.getByTestId('custom-domain-dns-table');
          await table.waitFor({ state: 'visible', timeout: 15_000 });
          await page.waitForTimeout(400);
          // Một cột = ô tiêu đề + ô của bản ghi duy nhất (CNAME). Có nhiều bản ghi thì boxAround phải nhận từng ô.
          const column = (index) => [
            table.locator('thead th').nth(index),
            table.locator('tbody tr').first().locator('td').nth(index),
          ];
          // Hai cột sát nhau nên hai khung chạm vào nhau ở giữa — thu mỗi khung vào 3px mỗi bên để còn một khe.
          const frames = [
            await boxAround(panel, column(1), { pad: 4 }),
            await boxAround(panel, column(2), { pad: 4 }),
          ].map((frame) => ({ ...frame, x: frame.x + 3, width: frame.width - 6 }));
          await drawBoxes(panel, frames);
          await page.waitForTimeout(250);
          const unverified = await panel.screenshot({ animations: 'disabled' });

          // Trạng thái 2: DNS đã đúng → hiện nút "Kết nối tên miền" (KHÔNG bấm: bấm là PUT ghi DB).
          await panel.evaluate((el) => el.querySelectorAll('[data-help-shot-box]').forEach((node) => node.remove()));
          state.verified = true;
          await panel.getByRole('button', { name: 'Kiểm tra lại', exact: true }).click();
          const connect = panel.getByRole('button', { name: 'Kết nối tên miền', exact: true });
          await connect.waitFor({ state: 'visible', timeout: 15_000 });
          await highlight(connect);
          await page.waitForTimeout(250);
          const verified = await panel.screenshot({ animations: 'disabled' });

          const composer = await stackVertically(page, [unverified, verified]);
          return {
            screenshot: async (options = {}) => {
              try {
                return await composer.locator('#stack').screenshot(options);
              } finally {
                await composer.close();
              }
            },
          };
        });
      },
    },
    {
      name: 'nut-chia-se-tren-danh-sach',
      caption: 'danh sách landing page ở tab Tự tạo, khoanh đỏ nút Chia sẻ trên một dòng',
      async take(page, { baseURL }) {
        if (isLocalBase(baseURL)) await ensureFreeDomainRow();
        await page.goto(LANDING_PATH);
        await page.locator('main table tbody tr').first().waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        await highlight(page.locator('main table tbody tr').first().locator('button[title="Chia sẻ"]'));
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 440 });
      },
    },
    {
      name: 'hop-chia-se-landing',
      caption: 'hộp Chia sẻ landing page, thấy ô nhập email, hai nút chọn quyền Chỉ xem/Có thể chỉnh sửa và nút Chia sẻ',
      async take(page) {
        await page.goto(LANDING_PATH);
        await page.locator('main table tbody tr').first().waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await page.locator('main table tbody tr').first().locator('button[title="Chia sẻ"]').click();
        const heading = page.getByRole('heading', { name: 'Chia sẻ landing page', exact: true });
        await heading.waitFor({ state: 'visible', timeout: 15_000 });
        // Gõ một email rồi Enter để thêm vào danh sách người nhận (chỉ ở trong hộp, chưa gửi đi đâu) — nút "Chia sẻ" mới sáng lên.
        const email = page.getByPlaceholder('Nhập email và nhấn Enter để thêm...');
        await email.fill('ketoan@congty.vn');
        await email.press('Enter');
        // Bỏ con trỏ khỏi ô nhập: nếu không, ô nhập trống phía dưới thẻ email hiện viền cam của trạng thái đang gõ.
        await heading.click();
        await page.waitForTimeout(500);
        await hideVolatileChrome(page);
        const modal = page.locator('div.rounded-2xl.shadow-xl').filter({ has: heading }).first();
        return contentShot(page, modal);
      },
    },
  ],
};
