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
    'Chạy chiến dịch',
    'Hiệu quả chiến dịch',
    'Khách hàng từ chiến dịch',
  ],
  'Landing page': ['Khách hàng từ Landing page', 'Tạo Landing page'],
  'Gói & Thanh toán': ['Tổng quan gói', 'Mua thêm hạn mức'],
  'Cài đặt': ['Hồ sơ doanh nghiệp', 'Nhân viên', 'Nhật ký hoạt động'],
};

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
      'Menu **Chatbot Studio**',
      'Menu **Hộp thư**',
      'Menu **Nhân viên**',
      '**Chiến dịch → Quản lý kênh**',
      '**Gói dịch vụ →',
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

  it('bài nào cũng chừa ít nhất 3 chỗ chèn ảnh', () => {
    const thin = HELP_SEED_ARTICLES
      .map((a) => [a.slug, ((a.body_md || '').match(/\[ẢNH:/g) || []).length])
      .filter(([, count]) => count < 3);

    expect(thin).toEqual([]);
  });
});
