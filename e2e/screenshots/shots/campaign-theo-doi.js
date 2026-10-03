/**
 * Ảnh minh hoạ cho bài "Theo dõi chiến dịch đang chạy" (/huong-dan/campaign-theo-doi), viết lại theo giao diện số liệu mới
 * (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30): "Giám sát gửi tin" = hôm nay, "Báo cáo" = cả một khoảng thời gian.
 *
 * Chín ô, chín ảnh — mỗi `caption` là CHÍNH chữ của ô trong bài để script chèn khớp đúng một ô.
 *
 * Cần `E2E_SEED_ALL=1` (gồm `E2E_SEED_ACTIVITY`): tin gửi rải trong 24 giờ qua có khoảng trống 23:00–06:00, đủ năm dạng
 * trạng thái lượt chạy, người chưa gửi được kèm lý do, 60 ngày lịch sử cho trang Báo cáo. Backend PHẢI chạy với
 * `SCHEDULER_ENABLED=false` — worker nền sẽ đánh các lượt "Đang gửi" / "Đang chờ" của dữ liệu mẫu thành lỗi.
 */
import {
  paddedShot, sidebarShot, highlight, hideVolatileChrome, settle, contentShot, bandShot, boxAround, drawBoxes, tallViewportShot,
} from '../lib/shotHelpers.js';

const MONITOR_PATH = '/app/delivery-monitor';
const REPORTS_PATH = '/app/reports';

/** Mở Giám sát gửi tin, đợi số liệu về (thẻ "Đã gửi hôm nay" có số) rồi ẩn các thứ động. */
async function openMonitor(page) {
  await page.goto(MONITOR_PATH);
  await page.getByTestId('card-sent').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByTestId('updated-at').waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);
  await hideVolatileChrome(page);
}

/** Thẻ (khối `.card`) chứa một tiêu đề trên trang Giám sát gửi tin. */
const cardWithHeading = (page, heading) => page.locator('main .card').filter({
  has: page.getByRole('heading', { name: heading }),
}).first();

/**
 * Mở trang Báo cáo với khoảng "30 ngày" — mặc định là 3 tháng nên biểu đồ gộp theo THÁNG, còn ô ảnh và bài viết nói mỗi
 * cột là một NGÀY. Chỉ đổi bộ lọc (bấm Lọc → 30 ngày → Áp dụng), không ghi gì vào dữ liệu.
 */
async function openReportsLast30Days(page) {
  await page.goto(REPORTS_PATH);
  await page.getByTestId('dashboard-kpi-cards').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: 'Lọc', exact: true }).first().click();
  await page.getByRole('button', { name: '30 ngày', exact: true }).first().click();
  await page.getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).first().click();
  // Áp dụng bộ lọc dựng lại khung chờ rồi vẽ lại: đợi khung chờ biến mất, số liệu có mặt.
  await page.waitForTimeout(800);
  await page.getByTestId('dashboard-kpi-cards').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByTestId('dashboard-sent-chart').first().waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);
  await hideVolatileChrome(page);
}

/**
 * Bản phân tích AI mẫu cho thẻ "Phân tích AI" — dựng đúng hình dạng backend trả về (`getSavedInsightForUser`:
 * `{ savedAt, filtersSnapshot, insights }`, `insights` theo schema của `dashboardInsights.service.js`). Chặn đúng
 * một cú GET đọc bản đã lưu nên KHÔNG gọi AI thật, không ghi gì vào dữ liệu. `filtersSnapshot` lấy đúng bộ lọc mặc định
 * của trang (3 tháng, mọi kênh, mọi chiến dịch) để thẻ không bị ẩn vì "phân tích cho bộ lọc khác".
 */
async function openReportsWithAiInsight(page) {
  const filtersSnapshot = await page.evaluate(() => {
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(end.getFullYear(), end.getMonth() - 2, 1);
    return { startDate: fmt(start), endDate: fmt(end), campaignType: 'all', campaignIds: [] };
  });
  const insights = {
    overview: 'Trong 3 tháng qua, **Email** là kênh gửi nhiều tin và có tỉ lệ mở ổn định, còn Zalo cá nhân gửi ít hơn nhưng '
      + 'khách phản hồi nhanh hơn. Khoảng 8% người nhận chưa gửi được, chủ yếu do địa chỉ email không còn dùng. '
      + 'Số đơn đặt tập trung ở hai chiến dịch gần đây.',
    key_metrics_analysis: {
      summary: 'Số liệu gửi tin ổn định; tỉ lệ chưa gửi được ở mức cần xử lý.',
    },
    action_plan: [
      { priority: 1, action: 'Rà lại danh sách email, loại các địa chỉ **không còn dùng** để giảm tỉ lệ chưa gửi được.', expected_result: 'Tỉ lệ chưa gửi được giảm', timeline: '1 tuần' },
      { priority: 2, action: 'Gửi lại ưu đãi cho nhóm khách đã mở email nhưng chưa nhấp vào liên kết.', expected_result: 'Thêm lượt nhấp', timeline: '2 tuần' },
      { priority: 3, action: 'Dùng Zalo cá nhân để nhắc khách đã để lại thông tin nhưng chưa đặt mua.', expected_result: 'Thêm đơn đặt', timeline: '2 tuần' },
    ],
    risk_warning: 'Nếu tỉ lệ chưa gửi được không giảm, uy tín tên miền gửi email có thể bị ảnh hưởng.',
    charts: {
      ordersTrend: { summary: '', compare: '' },
      channelEngagement: { all: '' },
      landingTopPages: '',
      channelBreakdown: { click: '', completed: '', pending: '' },
      topLists: { topCourses: '', topCampaignsByOrders: '', topCampaignsByClicks: '' },
    },
    notes: [],
  };
  await page.route('**/api/dashboard/insights/saved*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { savedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), filtersSnapshot, insights } }),
  }));
  await page.reload();
  await page.getByTestId('dashboard-kpi-cards').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByTestId('ai-insight-saved-at').waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);
  await hideVolatileChrome(page);
}

/**
 * Khoanh khoảng trống 23:00–06:00 trên biểu đồ 24 giờ.
 *
 * Biểu đồ có 24 cột (một cột một giờ), cột cuối là giờ hiện tại. Nhãn trục chỉ hiện mỗi 3 cột nên lấy nhãn đầu tiên và vị
 * trí của nó để biết cột nào ứng với giờ nào, rồi vẽ khung đỏ phủ các cột từ 23:00 tới trước 06:00. Khung phủ cả nhãn giờ
 * bên dưới; nếu cửa sổ 24 giờ cắt khoảng đó làm hai đoạn (chụp lúc 02–05 giờ sáng) thì vẽ cả hai.
 */
async function markQuietHours(card) {
  const boxes = await card.evaluate((el) => {
    const surface = el.querySelector('svg.recharts-surface');
    const lines = [...el.querySelectorAll('.recharts-cartesian-grid-horizontal line')];
    const ticks = [...el.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick-value')];
    if (!surface || lines.length < 2 || ticks.length === 0) return null;

    const x1 = Math.min(...lines.map((line) => Number(line.getAttribute('x1'))));
    const x2 = Math.max(...lines.map((line) => Number(line.getAttribute('x2'))));
    const yTop = Math.min(...lines.map((line) => Number(line.getAttribute('y1'))));
    const yBottom = Math.max(...lines.map((line) => Number(line.getAttribute('y1'))));
    const band = (x2 - x1) / 24;

    const surfaceRect = surface.getBoundingClientRect();
    const first = ticks[0];
    const firstRect = first.getBoundingClientRect();
    const firstIndex = Math.round(((firstRect.left + firstRect.width / 2) - surfaceRect.left - x1) / band - 0.5);
    const firstHour = Number.parseInt(first.textContent, 10);
    if (!Number.isFinite(firstHour)) return null;
    const startHour = (firstHour - firstIndex + 48) % 24;

    const quiet = [];
    for (let index = 0; index < 24; index += 1) {
      const hour = (startHour + index) % 24;
      if (hour >= 23 || hour < 6) quiet.push(index);
    }
    // Gom các cột liền nhau thành đoạn.
    const runs = [];
    for (const index of quiet) {
      const last = runs[runs.length - 1];
      if (last && index === last.end + 1) last.end = index;
      else runs.push({ start: index, end: index });
    }

    const cardRect = el.getBoundingClientRect();
    const offsetX = surfaceRect.left - cardRect.left - el.clientLeft;
    const offsetY = surfaceRect.top - cardRect.top - el.clientTop;
    return runs.map((run) => ({
      x: offsetX + x1 + run.start * band,
      y: offsetY + yTop - 4,
      width: (run.end - run.start + 1) * band,
      height: yBottom - yTop + 4 + 24,
    }));
  });
  if (!boxes || boxes.length === 0) throw new Error('Không dựng được khung khoảng trống 23:00–06:00 trên biểu đồ');
  await drawBoxes(card, boxes, { fill: 'rgba(225, 29, 72, 0.06)' });
}

export default {
  slug: 'campaign-theo-doi',
  shots: [
    // ── Giám sát gửi tin: hôm nay ───────────────────────────────────────────────────────────────────────────────────
    {
      name: 'menu-giam-sat-gui-tin',
      caption: 'menu bên trái đang mở nhóm Chiến dịch, khoanh đỏ mục "Giám sát gửi tin"',
      async take(page, { baseURL }) {
        return sidebarShot(page, { groupName: 'Chiến dịch', itemName: 'Giám sát gửi tin', baseURL });
      },
    },
    {
      name: 'ba-the-hom-nay',
      caption: 'đầu trang Giám sát gửi tin, khoanh đỏ ba thẻ Đã gửi hôm nay, Chưa gửi được hôm nay và Đang chờ',
      async take(page) {
        await openMonitor(page);
        const cards = ['card-sent', 'card-failed', 'card-waiting'].map((id) => page.getByTestId(id));
        for (const card of cards) await highlight(card);
        const grid = page.locator('main div.grid').filter({ has: page.getByTestId('card-sent') }).first();
        await page.waitForTimeout(200);
        return bandShot(page, page.locator('main').first(), grid, { scrollToTop: true, padTop: 2 });
      },
    },
    {
      name: 'bieu-do-24-gio',
      caption: 'biểu đồ Tin gửi theo giờ, khoanh đỏ khoảng trống từ 23:00 đến 06:00',
      async take(page) {
        await openMonitor(page);
        const card = cardWithHeading(page, /Tin gửi theo giờ/);
        await card.waitFor({ state: 'visible', timeout: 30_000 });
        await card.locator('svg.recharts-surface').first().waitFor({ state: 'visible', timeout: 30_000 });
        await card.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        await markQuietHours(card);
        await page.waitForTimeout(200);
        return contentShot(page, card);
      },
    },
    {
      name: 'luot-chay-gan-day',
      caption: 'mục Lượt chạy gần đây, khoanh đỏ cột Trạng thái và cột Đã gửi / Cần gửi',
      async take(page) {
        await openMonitor(page);
        const card = cardWithHeading(page, /Lượt chạy gần đây/);
        await card.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        const table = card.locator('table').first();
        await table.waitFor({ state: 'visible', timeout: 30_000 });
        // Cột 3 (Trạng thái) và cột 4 (Đã gửi / Cần gửi): tiêu đề + mọi ô của cột. Đo khi chưa mở dòng lỗi nào.
        const column = async (nth) => boxAround(card, [
          table.locator(`thead th:nth-child(${nth})`),
          ...(await table.locator(`tbody tr td:nth-child(${nth})`).all()),
        ], { pad: -3 });   // pad âm: hai cột liền nhau nên thu khung vào để hai viền không dính thành một nét dày
        await drawBoxes(card, [await column(3), await column(4)]);
        await page.waitForTimeout(200);
        // Thẻ 10 dòng cao hơn khung nhìn 900px: nới khung để chụp trọn cả dòng cuối và viền dưới của hai khung.
        return tallViewportShot(page, 1200, async () => contentShot(page, card));
      },
    },
    {
      name: 'chua-gui-duoc-chi-tiet',
      caption: 'một dòng lượt chạy đã bấm số ở cột Chưa gửi được, thấy bảng Người nhận / Lý do / Số lần / Lần cuối',
      async take(page) {
        await openMonitor(page);
        // Chiến dịch Zalo mẫu có 4 người chưa gửi được (đủ lý do khác nhau, một người đã thử 3 lần) — chọn theo TÊN vì
        // sau khi bấm, tên nút đổi từ "Xem" sang "Ẩn" nên bộ chọn theo tên nút trượt sang dòng khác.
        const row = page.locator('main tbody tr[data-testid^="run-row-"]').filter({ hasText: 'Gửi ưu đãi Zalo Khách hàng thân thiết' }).first();
        await row.waitFor({ state: 'visible', timeout: 30_000 });
        await row.scrollIntoViewIfNeeded();
        const button = row.locator('button[aria-expanded]').first();
        await button.click();
        const runId = (await row.getAttribute('data-testid')).replace('run-row-', '');
        const detail = page.getByTestId(`run-failures-row-${runId}`);
        await detail.getByTestId('failures-table-body').waitFor({ state: 'visible', timeout: 30_000 });
        await page.waitForTimeout(500);
        await hideVolatileChrome(page);
        await highlight(button);
        await page.waitForTimeout(200);
        // Từ đầu dòng tới hết bảng lỗi mở ra ngay dưới nó.
        return bandShot(page, row, detail, { pad: 12 });
      },
    },

    // ── Báo cáo: cả một khoảng thời gian ────────────────────────────────────────────────────────────────────────────
    {
      name: 'menu-bao-cao',
      caption: 'menu bên trái, khoanh đỏ mục "Báo cáo" gần đầu menu',
      async take(page, { baseURL }) {
        return sidebarShot(page, { itemName: 'Báo cáo', baseURL });
      },
    },
    {
      name: 'bon-the-bao-cao',
      caption: 'đầu trang Báo cáo, khoanh đỏ bốn thẻ Đã gửi, Chưa gửi được, Email và Khách phản hồi',
      async take(page) {
        await openReportsLast30Days(page);
        for (const id of ['kpi-sent', 'kpi-failed', 'kpi-email', 'kpi-customers']) {
          await highlight(page.getByTestId(id).first());
        }
        await page.waitForTimeout(200);
        return bandShot(page, page.locator('main').first(), page.getByTestId('dashboard-kpi-cards').first(), { scrollToTop: true, padTop: 2 });
      },
    },
    {
      name: 'the-phan-tich-ai',
      caption: 'thẻ Phân tích AI với phần tổng quan và mục Nên làm gì',
      async take(page) {
        await page.goto(REPORTS_PATH);
        await page.getByTestId('dashboard-kpi-cards').first().waitFor({ state: 'visible', timeout: 30_000 });
        await openReportsWithAiInsight(page);
        const card = page.getByTestId('ai-insight-card').first();
        await card.scrollIntoViewIfNeeded();
        await highlight(card);
        await page.waitForTimeout(200);
        return paddedShot(page, card, { pad: 14 });
      },
    },
    {
      name: 'bieu-do-da-gui-moi-ngay',
      caption: 'biểu đồ Đã gửi mỗi ngày, cột xếp chồng theo kênh',
      async take(page) {
        await openReportsLast30Days(page);
        const chart = page.getByTestId('dashboard-sent-chart').first();
        await chart.scrollIntoViewIfNeeded();
        await chart.locator('svg.recharts-surface').first().waitFor({ state: 'visible', timeout: 30_000 });
        await page.waitForTimeout(400);
        return contentShot(page, chart);
      },
    },
    {
      name: 'bang-chien-dich-trong-ky',
      caption: 'bảng Chiến dịch trong kỳ với các cột Đã gửi, Chưa gửi được, Mở, Nhấp, Đã mua',
      async take(page) {
        await openReportsLast30Days(page);
        const table = page.getByTestId('dashboard-campaigns-table').first();
        await table.scrollIntoViewIfNeeded();
        await table.getByTestId('campaign-row').first().waitFor({ state: 'visible', timeout: 30_000 });
        await page.waitForTimeout(300);
        return contentShot(page, table);
      },
    },
  ],
};
