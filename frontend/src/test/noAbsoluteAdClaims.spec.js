import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Luật Quảng cáo cấm từ ngữ tuyệt đối / so sánh vị thế ("nhất", "duy nhất", "số một", "hàng đầu",
 * "dẫn đầu", "độc quyền", "#1"...) khi không có tài liệu chứng minh (PLAN_PHAP_LY_ND248_DOT2, PR-L3a).
 * Spec này khoá các bề mặt CÔNG KHAI đã được rà: thêm lại cụm cũ là đỏ.
 *
 * "hàng đầu tiên" (danh sách: 'khách hàng đầu tiên') là cụm hợp lệ nên được loại bằng (?! tiên).
 */
const FORBIDDEN = new RegExp(
  [
    'hàng đầu(?! tiên)',
    'dẫn đầu',
    'số 1\\b',
    'số một',
    'tốt nhất',
    'nhất Việt Nam',
    'độc quyền',
    'tiên phong',
    'No\\.\\s?1\\b',
    '#1\\b',
    'top ?1\\b',
    'leading (AI|expert|platform|marketing)',
    "Vietnam.s leading",
    'pioneer',
    'best plan',
    'exclusive (AI|offer)',
    'Phổ Biến Nhất',
    'Most Popular',
    // Đợt 3 (29/09/2026): số liệu / cam kết / khuyến mại chưa có chứng cứ.
    'đảm bảo 100%',
    '100% guarantee',
    'x\\s?[2-9]\\s*năng suất',
    '[2-9]x (your )?productivity',
    '\\bX[2-9] (your )?productivity',
    'chỉ (áp dụng )?(trong )?hôm nay',
    'only today',
    'today only',
    'hàng ngàn (người|khách|học viên)',
    // "gửi cho hàng nghìn khách hàng" là năng lực gửi của hệ thống, không phải số liệu khách — chỉ chặn người/học viên.
    'hàng nghìn (người|học viên)',
    'thousands (of (people|Vietnamese|learners) )?have',
    'thousands of (people|Vietnamese|learners)',
    // (?:\\s|\\\\n)* : chuỗi nguồn hay ngắt dòng bằng ký tự \\n literal ('10,000+\\nHọc viên') — review 29/09 đột biến lọt.
    '\\d[\\d.,]*\\s*\\+?(?:\\s|\\\\n)*(học viên|learners|students)\\b',
  ].join('|'),
  'i'
);

// Nhãn chức năng (sắp xếp / thống kê nội bộ), không phải câu quảng cáo dịch vụ.
const ALLOWED = /sortPopular|bestChannel/;

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// Từng file public đã rà (đường dẫn tính từ src/test/).
const PUBLIC_FILES = [
  '../features/landing/constants/landingCopy.js',
  '../pages/learning/LearningPage.jsx',
  '../pages/public/components/MockChatbot.jsx',
  '../features/landing-pages/components/VisualBlockEditor.jsx',
  '../features/admin/utils/notificationTemplates.util.js',
  '../i18n/vi.js',
  '../i18n/en.js',
];

describe('không dùng từ ngữ quảng cáo tuyệt đối trên bề mặt công khai', () => {
  it.each(PUBLIC_FILES)('%s', (rel) => {
    const lines = read(rel).split('\n');
    const hits = lines
      .map((line, i) => ({ line: i + 1, full: line.trim() }))
      .filter((l) => FORBIDDEN.test(l.full) && !ALLOWED.test(l.full) && !/^(\/\/|\*|\/\*)/.test(l.full))
      .map((l) => ({ line: l.line, text: l.full.slice(0, 140) }));
    expect(hits).toEqual([]);
  });
});
