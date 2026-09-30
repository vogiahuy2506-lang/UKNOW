/**
 * Chặn ba lỗi đã từng xảy ra thật với bài trợ giúp:
 *
 * 1. `body_html` lệch `body_md` — trang đọc ưu tiên `bodyHtml`, nên sửa Markdown
 *    mà quên dựng lại HTML là người dùng đọc bản cũ. Bài `doi-goi` đã mất một
 *    dòng về thời điểm xuất hoá đơn đúng theo cách này.
 * 2. Dán URL trần (`/app/settings/inbox`) thay vì chỉ đường trên giao diện.
 *    Người dùng không biết `/app/...` là gì.
 * 3. Gọi sai tên mục menu. Bài từng ghi "Chatbot Studio" và "Hộp thư" trong khi
 *    giao diện ghi "Tạo AI Chatbot" và "Lịch sử trò chuyện" — người dùng đi tìm
 *    thứ không tồn tại.
 */
import { describe, expect, it } from '@jest/globals';
import { HELP_SEED_ARTICLES } from '../helpSeed.data.js';
import { miniMarkdownToHtml } from '../../../../../frontend/src/utils/miniMarkdownToHtml.js';
import viDictionary from '../../../../../frontend/src/i18n/vi.js';

/**
 * Cấu trúc menu THẬT, chép từ `frontend/src/components/layout/admin/Sidebar.jsx`
 * (`userMenuItems`) + nhãn trong `frontend/src/i18n/vi.js` (`nav.*`).
 * Đổi menu bên frontend thì cập nhật bảng này, test sẽ chỉ ra bài nào phải sửa theo.
 */
const REAL_MENU = {
  'AI Chatbot': ['Tạo AI Chatbot', 'Lịch sử trò chuyện', 'Thư viện media'],
  'Chiến dịch': [
    'Gửi nhanh',
    'Quản lý kênh gửi',
    'Thư viện nội dung',
    'Quản lý chiến dịch',
    'Giám sát gửi tin',
    'Khách hàng từ chiến dịch',
  ],
  'Landing page': ['Khách hàng từ Landing page', 'Tạo Landing page', 'Biểu mẫu'],
  'Gói & Thanh toán': ['Tổng quan gói', 'Mua thêm hạn mức'],
  'Cài đặt': ['Hồ sơ doanh nghiệp', 'Nhân viên', 'Nhật ký hoạt động'],
};

/**
 * Nhãn giao diện mà bài nhắc tới bằng chữ in đậm / chữ nghiêng (PLAN_SO_LIEU_DUNG_GON_KHOP PR-11).
 * Mỗi dòng: [bài, khoá trong `frontend/src/i18n/vi.js`, chữ hiện trên màn]. Đổi chữ trên màn thì test đỏ và chỉ
 * đúng bài phải sửa theo — trước đây `campaign-theo-doi` tả "Tin lỗi", "Hiệu quả theo kênh" trong khi trang đã viết lại.
 * Khi so, bỏ dấu chấm cuối câu và đuôi ": {count}" của từ điển (số liệu chèn vào lúc chạy).
 */
const UI_LABELS_IN_ARTICLES = [
  ['campaign-theo-doi', 'userDeliveryMonitor.title', 'Giám sát gửi tin'],
  ['campaign-theo-doi', 'userDeliveryMonitor.refresh', 'Làm mới'],
  ['campaign-theo-doi', 'userDeliveryMonitor.cards.sent', 'Đã gửi hôm nay'],
  ['campaign-theo-doi', 'userDeliveryMonitor.cards.failed', 'Chưa gửi được hôm nay'],
  ['campaign-theo-doi', 'userDeliveryMonitor.cards.waiting', 'Đang chờ'],
  ['campaign-theo-doi', 'userDeliveryMonitor.hourlyTitle', 'Tin gửi theo giờ — 24 giờ qua'],
  ['campaign-theo-doi', 'userDeliveryMonitor.hourlyEmpty', 'Chưa có tin nào được gửi trong 24 giờ qua'],
  ['campaign-theo-doi', 'userDeliveryMonitor.runsTitle', 'Lượt chạy gần đây'],
  ['campaign-theo-doi', 'userDeliveryMonitor.col.campaign', 'Chiến dịch'],
  ['campaign-theo-doi', 'userDeliveryMonitor.col.startedAt', 'Bắt đầu'],
  ['campaign-theo-doi', 'userDeliveryMonitor.col.status', 'Trạng thái'],
  ['campaign-theo-doi', 'userDeliveryMonitor.col.sent', 'Đã gửi / Cần gửi'],
  ['campaign-theo-doi', 'userDeliveryMonitor.col.failed', 'Chưa gửi được'],
  ['campaign-theo-doi', 'userDeliveryMonitor.runStatus.running', 'Đang gửi'],
  ['campaign-theo-doi', 'userDeliveryMonitor.runStatus.completed', 'Xong'],
  ['campaign-theo-doi', 'userDeliveryMonitor.runStatus.stopped', 'Đã dừng'],
  ['campaign-theo-doi', 'userDeliveryMonitor.runStatus.failed', 'Lỗi'],
  ['campaign-theo-doi', 'userDeliveryMonitor.waitReason.planQuota', 'đã hết lượt gửi (theo gói hoặc giới hạn bạn đặt)'],
  ['campaign-theo-doi', 'userDeliveryMonitor.waitReason.nextStep', 'chờ tới bước gửi kế tiếp'],
  ['campaign-theo-doi', 'quickSend.deferredReasonQuietHours', 'đang trong khung giờ yên lặng'],
  ['campaign-theo-doi', 'quickSend.deferredReasonRateLimited', 'tài khoản đã đạt giới hạn gửi trong giờ'],
  ['campaign-theo-doi', 'quickSend.deferredReasonPhoneLookupCooldown', 'tài khoản đang bị khoá tra số điện thoại'],
  ['campaign-theo-doi', 'userDeliveryMonitor.failures.recipient', 'Người nhận'],
  ['campaign-theo-doi', 'userDeliveryMonitor.failures.reason', 'Lý do'],
  ['campaign-theo-doi', 'userDeliveryMonitor.failures.count', 'Số lần'],
  ['campaign-theo-doi', 'userDeliveryMonitor.failures.lastAt', 'Lần cuối'],
  ['zalo-gui-cham', 'userDeliveryMonitor.title', 'Giám sát gửi tin'],
  ['zalo-gui-cham', 'userDeliveryMonitor.cards.sent', 'Đã gửi hôm nay'],
  ['zalo-gui-cham', 'userDeliveryMonitor.cards.failed', 'Chưa gửi được hôm nay'],
  ['zalo-gui-cham', 'userDeliveryMonitor.cards.waiting', 'Đang chờ'],
  ['zalo-gui-cham', 'userDeliveryMonitor.runsTitle', 'Lượt chạy gần đây'],
  ['zalo-gui-cham', 'userDeliveryMonitor.col.sent', 'Đã gửi / Cần gửi'],
  ['zalo-gui-cham', 'userDeliveryMonitor.col.failed', 'Chưa gửi được'],
  ['campaign-theo-doi', 'nav.reports', 'Báo cáo'],
  ['campaign-theo-doi', 'common.filter', 'Lọc'],
  ['campaign-theo-doi', 'dashboard.quickSelect', 'Chọn nhanh'],
  ['campaign-theo-doi', 'dashboard.fromDate', 'Từ ngày'],
  ['campaign-theo-doi', 'dashboard.toDate', 'Đến ngày'],
  ['campaign-theo-doi', 'dashboard.channelType', 'Loại kênh'],
  ['campaign-theo-doi', 'dashboard.specificCampaigns', 'Chiến dịch cụ thể'],
  ['campaign-theo-doi', 'dashboard.applyFilter', 'Áp dụng bộ lọc'],
  ['campaign-theo-doi', 'dashboardReport.cards.sent', 'Đã gửi'],
  ['campaign-theo-doi', 'dashboardReport.cards.failed', 'Chưa gửi được'],
  ['campaign-theo-doi', 'dashboardReport.cards.emailEngagement', 'Email · % trên thư đã gửi'],
  ['campaign-theo-doi', 'dashboardReport.cards.emailOpened', 'Email đã mở'],
  ['campaign-theo-doi', 'dashboardReport.cards.emailClicked', 'Email đã bấm link'],
  ['campaign-theo-doi', 'dashboardReport.cards.clicksAllChannels', 'Lượt nhấp link ở mọi kênh'],
  ['campaign-theo-doi', 'dashboardReport.cards.customers', 'Khách phản hồi'],
  ['campaign-theo-doi', 'dashboardReport.cards.leftInfo', 'Để lại thông tin'],
  ['campaign-theo-doi', 'dashboardReport.cards.purchased', 'Đã mua'],
  ['campaign-theo-doi', 'dashboardReport.chart.title', 'Đã gửi mỗi ngày'],
  ['campaign-theo-doi', 'dashboardReport.campaigns.title', 'Chiến dịch trong kỳ'],
  ['campaign-theo-doi', 'dashboardReport.links.deliveryMonitor', 'Xem lượt chạy ở Giám sát gửi tin'],
  ['campaign-theo-doi', 'dashboardReport.links.landing', 'Xem thống kê landing ở mục Landing page'],
  ['campaign-theo-doi', 'dashboard.ordersOverTime', 'Đơn hàng theo thời gian'],
  ['campaign-theo-doi', 'ordersTable.title', 'Bảng đơn hàng'],
  ['campaign-theo-doi', 'employee.permissions.reportsView', 'Báo cáo & Thống kê'],
  ['campaign-theo-doi', 'employee.permissions.campaignView', 'Chiến dịch — xem'],
  ['nhan-vien', 'employee.teamActivity', 'Hoạt động nhóm'],
  ['nhan-vien', 'employee.teamColEmployee', 'Nhân viên'],
  ['nhan-vien', 'employee.teamColRunning', 'Chiến dịch đang chạy'],
  ['nhan-vien', 'employee.teamColSent', 'Tin đã gửi tháng này'],
  ['nhan-vien', 'employee.teamColAi', 'Lượt AI kỳ này'],
  ['nhan-vien', 'employee.lastActive', 'Hoạt động gần nhất'],
  ['nhan-vien', 'employee.teamRowYou', 'Bạn'],
  ['nhan-vien', 'employee.teamRowOther', 'Khác (người đã rời nhóm / không xác định)'],
  ['nhan-vien', 'employee.teamRowCompany', 'Cả công ty'],
  ['nhan-vien', 'employee.myContribution.title', 'Tiến độ của bạn'],
  ['nhan-vien', 'employee.limitPerPeriod', 'Giới hạn / kỳ'],
  ['nhan-vien', 'nav.reports', 'Báo cáo'],
  ['plan-and-billing', 'billingHub.tabOverview', 'Tổng quan'],
  ['plan-and-billing', 'billingHub.tabLocks', 'Tài nguyên khoá'],
  ['plan-and-billing', 'billingHub.tabOrders', 'Lịch sử đơn'],
  ['plan-and-billing', 'accountProfileModal.messagesInCycle', 'Tin nhắn trong kỳ'],
  ['plan-and-billing', 'accountProfileModal.email', 'Email'],
  ['plan-and-billing', 'accountProfileModal.messagingChannels', 'Zalo'],
  ['plan-and-billing', 'accountProfileModal.telegramMessages', 'Telegram'],
  ['plan-and-billing', 'accountProfileModal.whatsappMessages', 'WhatsApp'],
  ['plan-and-billing', 'accountProfileModal.emailToday', 'Email hôm nay'],
  ['plan-and-billing', 'accountProfileModal.messagingToday', 'Tin nhắn hôm nay'],
  ['plan-and-billing', 'accountProfileModal.messagesCombined', 'Tổng tin nhắn trong kỳ'],
  ['plan-and-billing', 'accountProfileModal.aiUsageTitle', 'Lượt AI trong kỳ'],
  ['plan-and-billing', 'accountProfileModal.aiUsed', 'Đã dùng'],
  ['plan-and-billing', 'accountProfileModal.unlimited', 'Không giới hạn'],
  ['plan-and-billing', 'accountProfileModal.resourcesTitle', 'Tài nguyên'],
];

/** Bắt cả hai lối viết: `**Nhóm → Mục**` và `**Nhóm** → **Mục**`. */
function extractMenuPaths(markdown) {
  const paths = [];
  for (const m of markdown.matchAll(/\*\*([^*\n]+?)\s*→\s*([^*\n]+?)\*\*/g)) {
    paths.push([m[1].trim(), m[2].trim()]);
  }
  for (const m of markdown.matchAll(/\*\*([^*\n]+?)\*\*\s*→\s*\*\*([^*\n]+?)\*\*/g)) {
    paths.push([m[1].trim(), m[2].trim()]);
  }
  return paths;
}

describe('chất lượng bài trợ giúp seed', () => {
  it('có đủ 19 bài và bài nào cũng có body_md', () => {
    expect(HELP_SEED_ARTICLES.length).toBeGreaterThanOrEqual(19);
    for (const article of HELP_SEED_ARTICLES) {
      expect(typeof article.body_md).toBe('string');
      expect(article.body_md.length).toBeGreaterThan(0);
    }
  });

  it('body_html luôn đúng bằng bản sinh từ body_md', () => {
    const stale = HELP_SEED_ARTICLES
      .filter((a) => a.body_html && a.body_html !== miniMarkdownToHtml(a.body_md || ''))
      .map((a) => a.slug);

    expect(stale).toEqual([]);
    // Lệch thì chạy: node scripts/regenHelpSeedHtml.mjs
  });

  it('không dán URL trần trong nội dung — phải chỉ đường trên giao diện', () => {
    const offenders = [];
    for (const article of HELP_SEED_ARTICLES) {
      const hits = (article.body_md || '').match(/\/(app|pricing|checkout)(\/[a-z0-9/_-]*)?/gi) || [];
      if (hits.length > 0) offenders.push(`${article.slug}: ${[...new Set(hits)].join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('mọi đường đi menu đều trỏ tới mục có thật trên giao diện', () => {
    const offenders = [];
    for (const article of HELP_SEED_ARTICLES) {
      for (const [group, item] of extractMenuPaths(article.body_md || '')) {
        if (!REAL_MENU[group]) continue; // không phải câu chỉ đường menu
        if (!REAL_MENU[group].includes(item)) {
          offenders.push(`${article.slug}: nhóm "${group}" không có mục "${item}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('không gọi tên cũ của các mục đã đổi tên', () => {
    // Ba tên này KHÔNG tồn tại trên giao diện, nhưng bài từng dùng.
    const bannedMenuLabels = [
      // PLAN_SO_LIEU_DUNG_GON_KHOP PR-4b: mục menu đổi "Hiệu quả chiến dịch" → "Giám sát gửi tin" (menu = tiêu đề trang).
      'Hiệu quả chiến dịch',
      'Menu **Chatbot Studio**',
      'Menu **Hộp thư**',
      'Menu **Nhân viên**',
      '**Chiến dịch → Quản lý kênh**',
      '**Gói dịch vụ →',
      // PLAN_NUT_HANH_DONG_TRONG_SO_DO_CHIEN_DICH_2026-09-16.md, PR-3 Việc 5: nút "Kích hoạt
      // chiến dịch" đã bỏ (chiến dịch nháp tự kích hoạt khi bấm "Chạy ngay"); "Chạy chiến dịch"
      // không còn là trang riêng — đã gộp vào "Quản lý chiến dịch".
      'Kích hoạt chiến dịch',
      'trang Chạy chiến dịch',
      // Màn tạo/sửa landing cũ (ba cách tạo trang + cửa sổ AI ba tab) đã bị thay bằng trình soạn
      // landing-canvas từ 07–14/09/2026; ba nhãn này không còn trong frontend/src/i18n/vi.js.
      // Bài `landing-page` vẫn chỉ đường theo chúng tới 21/09.
      'Sửa trang hiện tại',
      'Tạo mới theo mô tả',
      'Trình sửa trực quan',
      // Studio chatbot cũ có ba tab Cấu hình / Kiến thức / Triển khai; nay Cấu hình là nút mở hộp
      // (Kiến thức là một phần trong hộp đó), Triển khai là cột bên phải. Bài `chatbot` vẫn tả ba
      // tab tới 29/09/2026.
      'Ba tab cần đi qua',
      'tab Cấu hình',
      'tab Kiến thức',
      // PLAN_SO_LIEU_DUNG_GON_KHOP PR-4b / PR-5 (30/09/2026): trang Giám sát gửi tin và trang Báo cáo viết lại.
      // Các nhãn dưới đây KHÔNG còn trên màn (0 lần trong frontend/src/i18n/vi.js) nhưng bài `campaign-theo-doi`
      // từng tả theo chúng — người đọc đi tìm thứ không tồn tại. `Tổng gửi` còn ở một trang admin khác nhưng
      // bài hướng dẫn cho khách không được nhắc tới.
      'Tin lỗi',
      'Hiệu quả theo kênh',
      'Tổng gửi',
      'Tổng chiến dịch',
      'Tỷ lệ click',
      'Tỷ lệ thành công trên lượt thử',
      'Lượt nhấp liên kết',
      'Chiến dịch gần đây',
      'Tất cả chiến dịch đã chạy',
      'Lỗi gần đây',
      'Tốc độ gửi theo giờ',
      'Tình trạng tài khoản & hàng đợi',
      'Thành công / tổng',
      // PR-3: hai đồng hồ theo tháng dương lịch của trang Thanh toán (nay đếm theo kỳ của gói).
      'Email tháng này',
      'Zalo tháng này',
    ];
    const offenders = [];
    for (const article of HELP_SEED_ARTICLES) {
      for (const banned of bannedMenuLabels) {
        if ((article.body_md || '').includes(banned)) {
          offenders.push(`${article.slug}: còn dùng "${banned}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('mọi nhãn giao diện bài nhắc tới đều có thật trong vi.js (đúng từng chữ)', () => {
    const offenders = [];
    for (const [slug, key, label] of UI_LABELS_IN_ARTICLES) {
      const actual = key.split('.').reduce((node, part) => (node == null ? node : node[part]), viDictionary);
      if (typeof actual !== 'string' || actual.replace(/\.$|:\s*\{count\}$/, '') !== label) {
        offenders.push(`${slug}: khoá ${key} = ${JSON.stringify(actual)}, bài ghi "${label}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('mỗi nhãn trong bảng nhãn giao diện đều được bài tương ứng nhắc tới', () => {
    const bySlug = new Map(HELP_SEED_ARTICLES.map((a) => [a.slug, a.body_md || '']));
    // Chỉ tính nhãn đứng đầu chữ in đậm / nghiêng hoặc đầu ô bảng: nhắc trong chú thích ảnh [ẢNH: …] không đủ để
    // chứng minh bài còn tả đúng màn (đột biến đổi nhãn trong bảng mà chú thích ảnh còn nguyên phải đỏ).
    const mentioned = (body, label) => body.includes(`*${label}`) || body.includes(`| ${label} |`);
    const missing = UI_LABELS_IN_ARTICLES
      .filter(([slug, , label]) => !mentioned(bySlug.get(slug) || '', label))
      .map(([slug, key, label]) => `${slug}: không còn nhắc "${label}" (${key})`);
    expect(missing).toEqual([]);
  });

  it('bài nào cũng chừa ít nhất 3 chỗ chèn ảnh', () => {
    const thin = HELP_SEED_ARTICLES
      .map((a) => [a.slug, ((a.body_md || '').match(/\[ẢNH:/g) || []).length])
      .filter(([, count]) => count < 3);

    expect(thin).toEqual([]);
  });
});
