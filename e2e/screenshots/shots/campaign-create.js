/**
 * Ảnh minh hoạ cho bài "Tạo chiến dịch" (/huong-dan/campaign-create).
 *
 * Bài có 12 ô, 5 ô đầu đã chèn từ trước; sheet này làm 7 ô còn lại.
 *
 * ⚠ PHẢI CHẠY BẢN VÁ CHỮ TRƯỚC:
 *   node backend/scripts/patchHelpArticleText.js --slug=campaign-create \
 *     --from=_internal/patch-campaign-create-2026-08-24.json --apply
 * Ba khoá dưới đây bám vào câu chú thích ĐÃ SỬA. Chạy ngược thứ tự thì không
 * khớp ô nào. Ba chỗ bài viết mô tả sai giao diện:
 *   1. "bảng bên phải" — bảng khối nằm bên TRÁI trình dựng.
 *   2. "nút Kích hoạt chiến dịch" — KHÔNG có nút nào tên vậy. Mỗi dòng ở trang
 *      Chạy chiến dịch có sẵn ba nút: Chạy ngay / Lên lịch / Xem log.
 *   3. "hai lựa chọn hiện ra sau khi kích hoạt" — cả hai luôn hiện sẵn, không
 *      có bước kích hoạt trung gian nào.
 *
 * Cần `E2E_SEED_CAMPAIGNS=1` (nằm trong `E2E_SEED_ALL=1`): chiến dịch nháp được
 * dựng sẵn luồng Khởi chạy → Đọc dữ liệu Sheet → Gửi email, kèm hai đường nối.
 * Không có luồng thì trình dựng mở ra một khung trắng, chẳng chụp được gì.
 */
import {
  sidebarShot, highlight, hideVolatileChrome, settle, contentShot, paddedShot,
} from '../lib/shotHelpers.js';
import { ensureDemoForm, ensureFormSubmissionsNodeDemo } from '../lib/shotFixtures.js';
import { takeSettingsTab, withCleanup, raiseEmailCampaignCap } from './chien-dich-tung-buoc.js';
import { api, withDb } from '../lib/shotFixtures.js';

/**
 * Mở trình dựng của chiến dịch nháp đã có luồng mẫu.
 *
 * Chờ `.react-flow__node` chứ không chờ khung `.react-flow`: khung dựng xong
 * ngay cả khi chưa nạp node nào, chờ nhầm thì chụp phải canvas trắng.
 */
async function openBuilder(page) {
  await page.goto('/app/campaigns');
  await page.waitForTimeout(1500);

  // Link mở chiến dịch giờ là /app/campaigns/:id (vào tab Từng bước) — lấy id rồi mở thẳng tab Sơ đồ khối.
  const row = page.locator('tr').filter({ hasText: 'Chào mừng Khách hàng mới' }).first();
  const href = await row.locator('a[href^="/app/campaigns/"]').first().getAttribute('href').catch(() => null);
  const idMatch = String(href || '').match(/\/app\/campaigns\/(\d+)/);
  await page.goto(idMatch ? `/app/campaigns/${idMatch[1]}/builder` : '/app/campaigns/1/builder');

  const nodes = page.locator('.react-flow__node');
  await nodes.first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
  if (!(await nodes.count())) {
    throw new Error(
      'Trình dựng mở ra khung trắng — chiến dịch nháp chưa có node nào. Nạp lại DB:\n'
      + '  E2E_SEED_DEMO=1 E2E_SEED_CAMPAIGNS=1 node scripts/seed-test-db.js',
    );
  }
  await settle(page);
  await hideVolatileChrome(page);
}

/** Mở bảng cài đặt của một khối — trình dựng bắt bấm HAI LẦN trong 300ms. */
async function openNodeConfig(page, nodeName) {
  const node = page.locator('.react-flow__node').filter({ hasText: nodeName }).first();
  await node.click();
  await page.waitForTimeout(120);
  await node.click();
  await page.waitForTimeout(1800);
}

/** Mở hộp "Tạo chiến dịch mới" qua nút Tạo -> thẻ "Thủ công". */
async function openCreateModal(page) {
  await page.goto('/app/campaigns');
  await settle(page);
  await hideVolatileChrome(page);
  await page.getByRole('button', { name: 'Tạo', exact: true }).click();
  await page.getByTestId('create-method-modal').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('create-method-blocks').click();
  const dialog = page.getByRole('heading', { name: 'Tạo chiến dịch mới', exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  await hideVolatileChrome(page);
  return dialog;
}

/** Hộp tạo chiến dịch với tên điền sẵn, khoanh đỏ nút kênh `channelId` (hoặc cả hàng kênh + nút Tạo và thiết kế). */
async function createModalShot(page, channelId) {
  const dialog = await openCreateModal(page);
  await dialog.locator('input[type="text"]').first().fill('Ưu đãi tháng 10');
  if (channelId) {
    await highlight(page.getByTestId(`create-campaign-type-${channelId}`));
  } else {
    for (const id of ['email', 'zalo', 'telegram', 'whatsapp']) {
      const button = page.getByTestId(`create-campaign-type-${id}`);
      if (await button.isVisible().catch(() => false)) await highlight(button);
    }
    await highlight(dialog.getByRole('button', { name: 'Tạo và thiết kế', exact: true }));
  }
  await page.waitForTimeout(200);
  return paddedShot(page, dialog, { pad: 16 });
}

/** Tạo chiến dịch trống qua hộp "Thủ công" (loại Email), dừng ở tab Thiết lập. Trả id + hàm dọn. */
async function createEmptyViaModal(page) {
  const restoreCap = await raiseEmailCampaignCap(2);
  const dialog = await openCreateModal(page);
  await dialog.locator('input[type="text"]').first().fill('Ưu đãi tháng 10');
  await page.getByTestId('create-campaign-type-email').click();
  await dialog.getByRole('button', { name: 'Tạo và thiết kế', exact: true }).click();
  await page.waitForURL(/\/app\/campaigns\/\d+\?tab=settings/, { timeout: 30_000 });
  const campaignId = Number(page.url().match(/campaigns\/(\d+)/)[1]);
  await page.getByTestId('campaign-settings-panel').waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);
  await hideVolatileChrome(page);
  const cleanup = async () => {
    await api(page, 'DELETE', `/campaigns/${campaignId}`).catch(() => {});
    await restoreCap();
  };
  return { campaignId, cleanup };
}

/** Ẩn ô "Tên node" (thuật ngữ nội bộ, bài hướng dẫn không nhắc) trước khi chụp hộp cấu hình khối gửi. */
async function hideNodeNameField(dialog) {
  await dialog.locator('input[placeholder^="VD: Gửi tin"]').first().evaluate((el) => {
    const block = el.parentElement;
    if (block) block.style.display = 'none';
  });
}

/**
 * Dựng chiến dịch nháp kênh Telegram/WhatsApp trong DB e2e: Khởi chạy -> khối gửi (chưa cấu hình gì), mở bảng cài đặt khối
 * gửi bằng bấm đúp. Trả hàm dọn (xoá chiến dịch). Không gửi gì, chỉ mở hộp.
 */
async function openChannelSendConfig(page, channel, nodeName) {
  const campaignId = await withDb(async (db) => {
    const user = (await db.query(`SELECT id FROM users WHERE username = 'e2etest'`)).rows[0];
    const camp = (await db.query(
      `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, description, campaign_type, status, created_at, updated_at)
       VALUES ($1, $1, $1, 'Ưu đãi tháng 10', '', $2, 'draft', NOW(), NOW()) RETURNING id`,
      [user.id, channel],
    )).rows[0];
    const t = (await db.query(
      `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, position_x, position_y, config, execution_order)
       VALUES ($1, 'trigger', 'manual_trigger', 'Khởi chạy', 120, 220, '{}'::jsonb, 1) RETURNING id`, [camp.id],
    )).rows[0];
    const a = (await db.query(
      `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, position_x, position_y, config, execution_order)
       VALUES ($1, 'action', $2, $3, 460, 220, '{}'::jsonb, 2) RETURNING id`, [camp.id, `send_${channel}`, nodeName],
    )).rows[0];
    await db.query(
      `INSERT INTO campaign_connections (id_campaign, source_node_id, target_node_id, connection_type) VALUES ($1, $2, $3, 'default')`,
      [camp.id, t.id, a.id],
    );
    return camp.id;
  });
  const cleanup = async () => { await api(page, 'DELETE', `/campaigns/${campaignId}`).catch(() => {}); };
  await page.goto('/app/campaigns');
  await settle(page);
  await page.goto(`/app/campaigns/${campaignId}/builder`);
  await page.getByText('Sơ đồ khối', { exact: true }).first().click();
  const node = page.locator('.react-flow__node').filter({ hasText: nodeName }).first();
  await node.waitFor({ state: 'visible', timeout: 20_000 });
  await settle(page);
  await hideVolatileChrome(page);
  await node.click();
  await page.waitForTimeout(120);
  await node.click();
  await page.waitForTimeout(1800);
  return cleanup;
}

export default {
  slug: 'campaign-create',
  shots: [
    {
      name: 'menu-quan-ly-chien-dich',
      caption: 'menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục "Quản lý chiến dịch"',
      localOnly: true,
      async take(page, { baseURL }) {
        return sidebarShot(page, { groupName: 'Chiến dịch', itemName: 'Quản lý chiến dịch', baseURL });
      },
    },
    {
      name: 'the-tu-tao',
      caption: 'đầu trang Quản lý chiến dịch, khoanh đỏ thẻ "Tự tạo" đang được chọn',
      localOnly: true,
      async take(page) {
        await page.goto('/app/campaigns');
        await settle(page);
        await hideVolatileChrome(page);
        const tab = page.getByRole('button', { name: 'Tự tạo', exact: true }).first();
        await tab.waitFor({ state: 'visible', timeout: 30_000 });
        await highlight(tab);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 220 });
      },
    },
    {
      name: 'nut-tao-chien-dich',
      caption: 'góc trên bên phải, khoanh đỏ nút "Tạo"',
      localOnly: true,
      async take(page) {
        await page.goto('/app/campaigns');
        await settle(page);
        await hideVolatileChrome(page);
        const button = page.getByRole('button', { name: 'Tạo', exact: true }).first();
        await button.waitFor({ state: 'visible', timeout: 30_000 });
        await highlight(button);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 220 });
      },
    },
    {
      name: 'hop-tao-chien-dich-moi',
      caption: 'hộp thoại "Tạo chiến dịch mới", khoanh đỏ hàng nút chọn loại chiến dịch và nút "Tạo và thiết kế"',
      localOnly: true,
      take: (page) => createModalShot(page, null),
    },
    {
      name: 'tab-thiet-lap-con-trong',
      caption: 'tab Thiết lập của chiến dịch vừa tạo còn trống, thẻ "Gửi cho ai?" với các thẻ nguồn người nhận',
      localOnly: true,
      async take(page) {
        await page.setViewportSize({ width: 1440, height: 1250 });
        const { cleanup } = await createEmptyViaModal(page);
        try {
          const audience = page.getByTestId('settings-section-audience');
          await highlight(audience);
          await page.waitForTimeout(200);
          const shot = await contentShot(page, page.getByTestId('campaign-view-tabs').locator('xpath=../..'), { pad: 20, maxHeight: 1250 });
          return withCleanup(shot, async () => { await page.setViewportSize({ width: 1440, height: 900 }); await cleanup(); });
        } catch (error) {
          await cleanup();
          throw error;
        }
      },
    },
    {
      name: 'tab-thiet-lap-thieu-noi-dung',
      caption: 'tab Thiết lập sau khi bấm Tạo, các mục Gửi từ và Gửi cho ai đã đủ, mục Nội dung còn thiếu',
      localOnly: true,
      async take(page) {
        await page.setViewportSize({ width: 1440, height: 1100 });
        const { cleanup } = await createEmptyViaModal(page);
        try {
          await page.getByText('Tự nhập danh sách', { exact: true }).first().click();
          await page.locator('textarea').first().fill('an@example.com\nbinh@example.com');
          const audience = page.getByTestId('settings-section-audience');
          await audience.getByRole('button', { name: 'Tạo', exact: true }).click();
          await page.waitForTimeout(1500);
          await settle(page);
          await hideVolatileChrome(page);
          for (const key of ['sender', 'audience', 'content']) await highlight(page.getByTestId(`settings-section-${key}`));
          await page.waitForTimeout(200);
          const shot = await contentShot(page, page.getByTestId('campaign-view-tabs').locator('xpath=../..'), { pad: 20, maxHeight: 1100 });
          return withCleanup(shot, async () => { await page.setViewportSize({ width: 1440, height: 900 }); await cleanup(); });
        } catch (error) {
          await cleanup();
          throw error;
        }
      },
    },
    {
      name: 'khoi-gui-telegram',
      caption: 'hộp cấu hình khối Gửi tin nhắn Telegram, khoanh đỏ ô chọn tài khoản, nguồn người nhận và ô nội dung',
      localOnly: true,
      async take(page) {
        const cleanup = await openChannelSendConfig(page, 'telegram', 'Gửi tin nhắn Telegram');
        const dialog = page.locator('div.fixed').filter({ hasText: 'Cấu hình:' }).last();
        await hideNodeNameField(dialog);
        await highlight(dialog.locator('select').nth(0));
        await highlight(dialog.locator('select').nth(1).locator('xpath=ancestor::div[1]'));
        await highlight(dialog.locator('textarea').first());
        await page.waitForTimeout(200);
        const shot = await contentShot(page, dialog.locator('> div').first());
        return withCleanup(shot, cleanup);
      },
    },
    {
      name: 'khoi-gui-whatsapp',
      caption: 'hộp cấu hình khối Gửi tin nhắn WhatsApp, khoanh đỏ ô chọn tài khoản và ba cách chọn người nhận',
      localOnly: true,
      async take(page) {
        const cleanup = await openChannelSendConfig(page, 'whatsapp', 'Gửi tin nhắn WhatsApp');
        const dialog = page.locator('div.fixed').filter({ hasText: 'Cấu hình:' }).last();
        await hideNodeNameField(dialog);
        await highlight(dialog.locator('select').nth(0));
        await highlight(dialog.locator('select').nth(1).locator('xpath=ancestor::div[1]'));
        await page.waitForTimeout(200);
        const shot = await contentShot(page, dialog.locator('> div').first());
        return withCleanup(shot, cleanup);
      },
    },
    {
      name: 'hop-tao-chon-telegram',
      caption: 'hộp thoại "Tạo chiến dịch mới", khoanh đỏ nút "Telegram" trong hàng chọn loại chiến dịch',
      localOnly: true,
      take: (page) => createModalShot(page, 'telegram'),
    },
    {
      name: 'hop-tao-chon-whatsapp',
      caption: 'hộp thoại "Tạo chiến dịch mới", khoanh đỏ nút "WhatsApp" trong hàng chọn loại chiến dịch',
      localOnly: true,
      take: (page) => createModalShot(page, 'whatsapp'),
    },
    {
      name: 'keo-khoi-khoi-chay',
      caption: 'kéo khối Khởi chạy từ bảng bên trái thả vào khu vực dựng',
      localOnly: true,
      async take(page) {
        await openBuilder(page);

        // Ảnh tĩnh không diễn tả được động tác kéo. Khoanh cả hai đầu của thao
        // tác — mục "Khởi chạy" trong bảng khối bên trái và khối đã nằm trên
        // khung dựng — để người đọc thấy nó đi từ đâu tới đâu.
        const paletteItem = page.locator('aside, div').filter({ hasText: 'Điểm khởi đầu (Triggers)' })
          .last().getByText('Khởi chạy', { exact: true }).first();
        if (await paletteItem.isVisible().catch(() => false)) await highlight(paletteItem);

        const placed = page.locator('.react-flow__node').filter({ hasText: 'Khởi chạy' }).first();
        if (await placed.isVisible().catch(() => false)) await highlight(placed);

        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first());
      },
    },
    {
      name: 'khoi-lay-du-lieu',
      caption: 'khối lấy dữ liệu đang mở bảng cài đặt, khoanh đỏ nút "Kiểm tra kết nối"',
      localOnly: true,
      async take(page) {
        await openBuilder(page);
        await openNodeConfig(page, 'Đọc dữ liệu Sheet');

        // Nút "Kiểm tra kết nối" nằm ở tab "Kết nối", KHÔNG phải tab "Cấu hình
        // Sheet" (tab đó chỉ có tên sheet, dòng tiêu đề, số dòng chạy thử).
        const sheetTab = page.getByText('Kết nối', { exact: true }).first();
        if (!(await sheetTab.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Không mở được bảng cài đặt của khối "Đọc dữ liệu Sheet"');
        }
        await sheetTab.click();
        await page.waitForTimeout(1000);

        const testButton = page.getByRole('button', { name: 'Kiểm tra kết nối', exact: true }).first();
        if (!(await testButton.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Mở được tab Kết nối nhưng không thấy nút "Kiểm tra kết nối"');
        }
        await hideVolatileChrome(page);
        await highlight(testButton);
        await page.waitForTimeout(200);

        const dialog = page.locator('div.fixed').filter({ hasText: 'Cấu hình:' }).last();
        return contentShot(page, dialog.locator('> div').first());
      },
    },
    {
      name: 'hai-khoi-da-noi',
      caption: 'hai khối đã được nối, khoanh đỏ đường nối giữa hai chấm tròn',
      localOnly: true,
      async take(page) {
        await openBuilder(page);

        // Đường nối là <path> trong SVG — outline không vẽ được trên đó. Tô đậm
        // và đổi màu chính nét vẽ thay vì khoanh khung.
        const marked = await page.locator('.react-flow__edge-path').evaluateAll((paths, color) => {
          for (const p of paths) {
            p.style.stroke = color;
            p.style.strokeWidth = '4';
          }
          return paths.length;
        }, '#e11d48');
        if (!marked) {
          throw new Error(
            'Không có đường nối nào giữa các khối. Nạp lại DB:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_CAMPAIGNS=1 node scripts/seed-test-db.js',
          );
        }
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('.react-flow').first());
      },
    },
    {
      name: 'nut-luu-trinh-dung',
      caption: 'thanh công cụ của trình dựng, khoanh đỏ nút lưu',
      localOnly: true,
      async take(page) {
        await openBuilder(page);
        const save = page.getByRole('button', { name: 'Lưu', exact: true }).first();
        if (!(await save.isVisible({ timeout: 10_000 }).catch(() => false))) {
          throw new Error('Không thấy nút Lưu trên thanh công cụ trình dựng');
        }
        await highlight(save);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 130 });
      },
    },
    {
      name: 'chay-ngay-len-lich-trinh-dung',
      // 28/09/2026 — trang "Chạy chiến dịch" đã gộp vào Quản lý chiến dịch (13/09) và nút "Kích hoạt"
      // bỏ từ PR-3 16/09: chạy thẳng từ thanh công cụ trình dựng. CHỈ khoanh, KHÔNG bấm — "Chạy ngay" gửi thật.
      caption: 'thanh công cụ trình dựng, khoanh đỏ hai nút "Chạy ngay" và "Lên lịch"',
      localOnly: true,
      async take(page) {
        await openBuilder(page);
        for (const name of ['Chạy ngay', 'Lên lịch']) {
          const button = page.getByRole('button', { name, exact: true }).first();
          if (!(await button.isVisible({ timeout: 10_000 }).catch(() => false))) {
            throw new Error(`Không thấy nút "${name}" trên thanh công cụ trình dựng`);
          }
          await highlight(button);
        }
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first(), { maxHeight: 130 });
      },
    },
    {
      // Ước tính do server tính từ chiến dịch + tài khoản gửi; DB e2e chưa có kênh Zalo thật nên trả bản MẪU đúng hợp đồng
      // `GET /campaigns/:id/estimate` (ba ngày, một tài khoản email gửi, kèm cảnh báo nhiều ngày). CHỈ mở hộp, KHÔNG bấm "Xác nhận chạy".
      name: 'hop-xac-nhan-chay-uoc-tinh',
      caption: 'hộp Xác nhận chạy chiến dịch, khoanh đỏ khối "Ước tính thời gian gửi" với dòng Dự kiến xong và bảng theo ngày',
      localOnly: true,
      async take(page) {
        const now = Date.now();
        const vnDay = (offsetDays) => new Date(now + offsetDays * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
        const startAt = new Date(now).toISOString();
        const finishAtEarliest = new Date(now + 2 * 86_400_000 + 5 * 3_600_000).toISOString();
        const finishAtLatest = new Date(now + 2 * 86_400_000 + 11 * 3_600_000).toISOString();
        await page.route('**/api/campaigns/*/estimate**', (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              startAt,
              finishAtEarliest,
              finishAtLatest,
              totalActions: 240,
              accounts: [{ key: 'email:1', label: 'Email CSKH UKNOW' }],
              perDay: [
                { date: vnDay(0), actions: 90, perAccount: { 'email:1': 90 } },
                { date: vnDay(1), actions: 90, perAccount: { 'email:1': 90 } },
                { date: vnDay(2), actions: 60, perAccount: { 'email:1': 60 } },
              ],
              warnings: [{ code: 'multi_day', params: { days: 3, finishAtLatest } }],
            },
          }),
        }));
        await openBuilder(page);
        const run = page.getByRole('button', { name: 'Chạy ngay', exact: true }).first();
        await run.waitFor({ state: 'visible', timeout: 10_000 });
        await run.click();
        const estimate = page.getByTestId('campaign-estimate');
        await estimate.waitFor({ state: 'visible', timeout: 20_000 });
        await page.waitForTimeout(500);
        await hideVolatileChrome(page);
        await highlight(estimate);
        await page.waitForTimeout(200);
        // Khung trắng của hộp thoại (con của lớp phủ toàn màn hình), cao tới hết hộp.
        const dialog = estimate.locator('xpath=ancestor::div[contains(@class,"fixed")][1]').locator('> div').first();
        return paddedShot(page, dialog, { pad: 16 });
      },
    },
    {
      // PR-7b (12/10/2026): khối "Dữ liệu Biểu mẫu" chọn NHIỀU biểu mẫu (ô tích) + lối tắt "Chọn nhanh theo landing page".
      // Dựng node + gắn biểu mẫu mẫu vào landing mẫu qua DB test (lib/shotFixtures.js); chưa bấm Lưu nên sơ đồ không đổi.
      name: 'khoi-du-lieu-bieu-mau',
      caption: 'hộp cấu hình khối Dữ liệu Biểu mẫu, khoanh đỏ danh sách biểu mẫu có ô tích và ô Chọn nhanh theo landing page',
      localOnly: true,
      async take(page) {
        await page.goto('/app/forms');
        await page.getByRole('heading', { name: 'Biểu mẫu', exact: true }).first()
          .waitFor({ state: 'visible', timeout: 30_000 });
        const demoForm = await ensureDemoForm(page);
        const { campaignId, nodeName } = await ensureFormSubmissionsNodeDemo({ formId: demoForm.id });

        await page.goto(`/app/campaigns/${campaignId}/builder`);
        // Node trên sơ đồ React Flow: bấm đúp mới mở khung cấu hình.
        const node = page.locator('.react-flow__node').filter({ hasText: nodeName }).first();
        await node.waitFor({ state: 'visible', timeout: 45_000 });
        await settle(page);
        await node.dblclick();

        const legend = page.getByText('Chọn biểu mẫu', { exact: true }).first();
        await legend.waitFor({ state: 'visible', timeout: 30_000 });
        // Lối tắt: chọn landing thì mọi biểu mẫu của landing đó được tích sẵn ("Đã chọn N biểu mẫu").
        const shortcut = page.locator('#form-submissions-landing-shortcut');
        await shortcut.waitFor({ state: 'visible', timeout: 30_000 });
        await shortcut.selectOption({ index: 1 });
        await page.getByText(/Đã chọn \d+ biểu mẫu/).first().waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForTimeout(600);
        await hideVolatileChrome(page);

        await highlight(shortcut);
        await highlight(page.locator('fieldset').filter({ has: legend }).locator('div.overflow-y-auto').first());
        await page.waitForTimeout(200);
        const panel = legend.locator('xpath=ancestor::div[contains(@class,"rounded")][.//h2 or .//h3][1]');
        return paddedShot(page, (await panel.count()) ? panel : legend.locator('xpath=ancestor::div[3]'), { pad: 12 });
      },
    },
    {
      name: 'tab-thiet-lap',
      caption: 'tab Thiết lập của một chiến dịch email, khoanh đỏ thẻ Tổng quan và năm mục cài đặt',
      localOnly: true,
      take: takeSettingsTab,
    },
  ],
};
