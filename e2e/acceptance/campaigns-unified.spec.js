/**
 * Kịch bản A — Trang chiến dịch gộp (chỉ đọc, không tạo dữ liệu).
 * Nguồn: _internal/archive/PLAN_GOP_TRANG_CHIEN_DICH_MOT_MUC_2026-09-12.md §2, §5c, §6.
 *
 * Nhãn nút và chuỗi trích xuất từ frontend/src/i18n/vi.js:
 * - operationAll: 'Tất cả' (:1264)
 * - operationRunning: 'Đang chạy' (:1265)
 * - operationScheduled: 'Đã lên lịch' (:1266)
 * - operationInactive: 'Tạm ngưng · Không hoạt động' (:1267)
 * - operationDraft: 'Nháp' (:1268)
 * - inactive: 'Không hoạt động' (:1272)
 * - collapseMenu: 'Thu gọn sidebar' (:4924)  [sửa từ 'Thu gọn menu' theo A11]
 * - expandMenu: 'Mở rộng sidebar' (:4925)    [sửa từ 'Mở rộng menu' theo A11]
 */
import { test, expect } from '@playwright/test';
import { captureScreenshot, recordReport, dismissPhoneReminder } from './acceptance-helper.js';

const I18N_LABELS = {
  operationAll: 'Tất cả', // frontend/src/i18n/vi.js:1264
  operationRunning: 'Đang chạy', // frontend/src/i18n/vi.js:1265
  operationScheduled: 'Đã lên lịch', // frontend/src/i18n/vi.js:1266
  operationInactive: 'Tạm ngưng · Không hoạt động', // frontend/src/i18n/vi.js:1267
  operationDraft: 'Nháp', // frontend/src/i18n/vi.js:1268
  inactive: 'Không hoạt động', // frontend/src/i18n/vi.js:1272
  collapseSidebar: 'Thu gọn sidebar', // frontend/src/i18n/vi.js:4924
  expandSidebar: 'Mở rộng sidebar', // frontend/src/i18n/vi.js:4925
};

/**
 * Trích xuất danh sách dòng (tên chiến dịch + nhãn vận hành) trên trang hiện tại
 */
async function extractVisibleCampaignRows(page) {
  const rows = page.locator('tbody tr');
  const count = await rows.count();
  const list = [];
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    // Cột 1 là Tên chiến dịch
    const nameCell = row.locator('td').first();
    const name = (await nameCell.innerText().catch(() => '')).trim().split('\n')[0];

    // Cột 3 là Vận hành
    const rowText = await row.innerText().catch(() => '');
    let opLabel = 'khong_xac_dinh';
    if (rowText.includes(I18N_LABELS.operationRunning)) {
      opLabel = I18N_LABELS.operationRunning;
    } else if (rowText.includes(I18N_LABELS.operationScheduled)) {
      opLabel = I18N_LABELS.operationScheduled;
    } else if (rowText.includes(I18N_LABELS.inactive)) {
      opLabel = I18N_LABELS.inactive;
    }

    if (name) {
      list.push({ rowIndex: i + 1, name, opLabel });
    }
  }
  return list;
}

test.describe('Kịch bản A — Trang chiến dịch gộp', () => {
  test.beforeEach(async ({ page }) => {
    await dismissPhoneReminder(page);
  });

  test('A1: Mở /app/campaign-run phải chuyển hướng sang /app/campaigns?tab=schedules', async ({ page }) => {
    console.log('[Kịch bản A] Bước A1: Kiểm tra chuyển hướng từ /app/campaign-run...');
    await page.goto('/app/campaign-run');

    await page.waitForURL(/\/app\/campaigns\?tab=schedules/, { timeout: 20_000 });
    expect(page.url()).toContain('/app/campaigns?tab=schedules');

    // Bảng lịch chạy hoặc tiêu đề / trạng thái trống của tab Lịch chạy xuất hiện
    await expect(
      page.locator('table')
        .or(page.getByText('Lịch chạy đã thiết lập'))
        .or(page.getByText('Chưa có lịch chạy nào'))
        .first()
    ).toBeVisible({ timeout: 15_000 });

    await captureScreenshot(page, 'A1_redirect_schedules.png', 'Chuyển hướng thành công sang tab Lịch chạy');

    recordReport({
      kichBan: 'A',
      buoc: 'A1_redirect_schedules',
      ketQua: 'dat',
      extra: { finalUrl: page.url() },
    });
  });

  test('A2: 5 nút lọc trục vận hành — bấm lần lượt, chụp ảnh và ghi chi tiết dòng cho đối chiếu DB', async ({ page }) => {
    console.log('[Kịch bản A] Bước A2: Bấm 5 nút lọc vận hành...');

    // Đón response API đầu tiên khi vừa tải trang để lấy total của "Tất cả"
    const initialApiPromise = page.waitForResponse(
      (res) =>
        res.url().match(/\/api\/campaigns(\?|$)/) &&
        res.request().method() === 'GET' &&
        res.status() === 200,
      { timeout: 20_000 }
    ).catch(() => null);

    await page.goto('/app/campaigns');
    const initialRes = await initialApiPromise;
    let initialTotal = null;
    if (initialRes) {
      try {
        const body = await initialRes.json();
        initialTotal = body?.data?.pagination?.total ?? body?.pagination?.total ?? null;
      } catch {
        // Bỏ qua
      }
    }

    await page.waitForLoadState('domcontentloaded');

    const filterButtons = [
      { key: 'all', label: I18N_LABELS.operationAll },
      { key: 'running', label: I18N_LABELS.operationRunning },
      { key: 'scheduled', label: I18N_LABELS.operationScheduled },
      { key: 'inactive', label: I18N_LABELS.operationInactive },
      { key: 'draft', label: I18N_LABELS.operationDraft },
    ];

    const counts = {};

    for (const btnInfo of filterButtons) {
      console.log(`[Kịch bản A] Bấm nút lọc "${btnInfo.label}" (state=${btnInfo.key})...`);

      let totalFromServer = btnInfo.key === 'all' ? initialTotal : null;

      if (btnInfo.key !== 'all') {
        const responsePromise = page.waitForResponse(
          (res) =>
            res.url().match(/\/api\/campaigns(\?|$)/) &&
            res.request().method() === 'GET' &&
            res.status() === 200,
          { timeout: 15_000 }
        ).catch(() => null);

        const btn = page.getByRole('button', { name: btnInfo.label, exact: true });
        await expect(btn).toBeVisible({ timeout: 10_000 });
        await btn.click();

        const response = await responsePromise;
        if (response) {
          try {
            const body = await response.json();
            totalFromServer = body?.data?.pagination?.total ?? body?.pagination?.total ?? null;
          } catch {
            // Bỏ qua
          }
        }
      }

      await page.waitForTimeout(600); // Chờ UI render

      const visibleRows = await extractVisibleCampaignRows(page);

      counts[btnInfo.key] = {
        label: btnInfo.label,
        totalFromServer,
        visibleRowCount: visibleRows.length,
        rows: visibleRows, // Ghi đầy đủ tên và nhãn vận hành từng dòng trang 1 cho Claude/sếp đối chiếu
      };

      await captureScreenshot(
        page,
        `A2_filter_${btnInfo.key}.png`,
        `Nút lọc "${btnInfo.label}": serverTotal=${totalFromServer}, rows=${visibleRows.length}`
      );
    }

    console.log('[Kịch bản A] Thống kê 5 nút vận hành:', JSON.stringify(counts, null, 2));

    recordReport({
      kichBan: 'A',
      buoc: 'A2_filter_buttons',
      ketQua: 'cho_doi_chieu',
      lyDo: 'Máy đã ghi nhận toàn bộ số đếm và danh sách dòng trang 1; chờ Claude/sếp đối chiếu SQL DB theo §2 plan',
      extra: { counts },
    });
  });

  test('A3: Nhãn vận hành trên các dòng hiển thị đúng thứ tự ưu tiên (cho_doi_chieu)', async ({ page }) => {
    console.log('[Kịch bản A] Bước A3: Kiểm tra nhãn vận hành trên các dòng...');
    // Chờ đúng response danh sách rồi dòng đầu tiên hiện — production 25/09 đọc bảng quá sớm, ra 0
    // dòng trong khi "Tất cả" có 94 chiến dịch.
    const listResponse = page.waitForResponse(
      (res) => /\/api\/campaigns(\?|$)/.test(res.url()) && res.request().method() === 'GET' && res.status() === 200,
      { timeout: 20_000 }
    ).catch(() => null);
    await page.goto('/app/campaigns?state=all');
    await listResponse;
    await page.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});

    const visibleRows = await extractVisibleCampaignRows(page);
    console.log(`[Kịch bản A] Đã trích xuất ${visibleRows.length} dòng chiến dịch ở trang 1`);

    await captureScreenshot(page, 'A3_operation_labels.png', 'Các nhãn vận hành trên dòng chiến dịch');

    recordReport({
      kichBan: 'A',
      buoc: 'A3_operation_labels',
      ketQua: 'cho_doi_chieu',
      lyDo: 'Chờ đối chiếu ưu tiên "Đang chạy" > "Đã lên lịch" > "Không hoạt động" với DB',
      extra: { visibleRows },
    });
  });

  test('A4: Sidebar — xuất phát từ /app, mở nhóm, bấm Quản lý chiến dịch, verify giữ mở và nổi bật, chụp mở rộng & thu gọn', async ({ page }) => {
    console.log('[Kịch bản A] Bước A4: Kiểm tra Sidebar điều hướng (A11)...');

    // Đứng ở /app (ngoài nhóm Chiến dịch) để kiểm tra việc chuyển trang
    await page.goto('/app');
    await page.waitForLoadState('domcontentloaded');

    // Đảm bảo sidebar ở trạng thái mở rộng trước. Mặc định là thu gọn chỉ còn biểu tượng
    // (MainLayout.jsx:36 `founder_ai_sidebar_open` = false), và isVisible() KHÔNG chờ — production
    // 25/09 kiểm lúc sidebar chưa vẽ, bỏ qua bước mở rộng, rồi không tìm thấy nhóm có chữ.
    const sidebarToggle = page
      .locator(`button[title="${I18N_LABELS.expandSidebar}"], button[title="${I18N_LABELS.collapseSidebar}"]`)
      .first();
    await sidebarToggle.waitFor({ state: 'visible', timeout: 15_000 });
    if ((await sidebarToggle.getAttribute('title')) === I18N_LABELS.expandSidebar) {
      await sidebarToggle.click();
      await expect(page.locator(`button[title="${I18N_LABELS.collapseSidebar}"]`).first()).toBeVisible({ timeout: 5000 });
    }

    // Tìm nút nhóm Chiến dịch
    const campaignGroupBtn = page.locator('button[data-menu-level="group"]').filter({ hasText: /Chiến dịch/i }).first();
    await expect(campaignGroupBtn).toBeVisible({ timeout: 10_000 });

    // Mở nhóm nếu đang đóng
    const isExpandedBefore = await campaignGroupBtn.getAttribute('aria-expanded');
    if (isExpandedBefore !== 'true') {
      await campaignGroupBtn.click();
      await page.waitForTimeout(400);
    }

    // Bấm mục con "Quản lý chiến dịch" (/app/campaigns)
    const subMenuItem = page.locator('a[data-menu-level="item"]').filter({ hasText: /Quản lý chiến dịch/i }).first();
    await expect(subMenuItem).toBeVisible({ timeout: 10_000 });
    await subMenuItem.click();

    // Chờ URL chuyển sang /app/campaigns
    await page.waitForURL(/\/app\/campaigns(\?|$)/, { timeout: 20_000 });
    await page.waitForLoadState('domcontentloaded');

    // Kiểm tra: Sau khi chuyển trang xong, nhóm Chiến dịch VẪN MỞ (aria-expanded === 'true')
    const isGroupStillExpanded = await campaignGroupBtn.getAttribute('aria-expanded');
    expect(isGroupStillExpanded).toBe('true');

    // Kiểm tra: Mục con đang đứng được làm nổi (aria-current === 'page')
    const ariaCurrent = await subMenuItem.getAttribute('aria-current');
    expect(ariaCurrent).toBe('page');

    await captureScreenshot(page, 'A4_sidebar_expanded.png', 'Sidebar mở rộng: nhóm Chiến dịch vẫn mở sau điều hướng, mục con active');

    // Bấm nút "Thu gọn sidebar" (đọc từ vi.js:4924)
    const collapseBtn = page.locator(`button[title="${I18N_LABELS.collapseSidebar}"]`).first();
    await expect(collapseBtn).toBeVisible({ timeout: 5000 });
    await collapseBtn.click();
    await page.waitForTimeout(500);

    await captureScreenshot(page, 'A4_sidebar_collapsed.png', 'Sidebar ở chế độ thu gọn');

    // Mở rộng lại để khôi phục
    const restoreBtn = page.locator(`button[title="${I18N_LABELS.expandSidebar}"]`).first();
    if (await restoreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await restoreBtn.click();
      await page.waitForTimeout(400);
    }

    recordReport({
      kichBan: 'A',
      buoc: 'A4_sidebar_navigation',
      ketQua: 'dat',
      extra: {
        isGroupStillExpanded,
        childAriaCurrent: ariaCurrent,
      },
    });
  });
});
