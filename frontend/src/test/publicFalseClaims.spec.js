import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import vi from '../i18n/vi';
import en from '../i18n/en';
import { I18nProvider } from '../i18n';
import HeroDashboardMock from '../pages/public/components/HeroDashboardMock';
import { MOCK_CONVERSATIONS } from '../pages/public/components/mockConversations';

const pathOf = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const sourceOf = (rel) => readFileSync(pathOf(rel), 'utf8');

/**
 * Trang công khai KHÔNG được quảng cáo tính năng / cam kết không có thật (NĐ 248, luật bảo vệ người tiêu dùng).
 * Spec này khoá các câu đã sửa ở đợt rà 03/10/2026 (G3c). Mỗi nhóm ghi bằng chứng vì sao câu cũ sai:
 *
 * - Trang chủ khối lợi ích #4: "Mã hóa đầu cuối, sao lưu tự động, khả năng mở rộng không giới hạn" + "tuân thủ chuẩn quốc tế".
 *   Chính sách bảo mật (pages/public/PrivacyPolicy.jsx mục biện pháp kỹ thuật) chỉ cam kết HTTPS/TLS, mật khẩu băm bcrypt,
 *   AES-256-GCM cho số CCCD đối tác và phiên kênh nhắn tin — không có mã hóa đầu cuối, không có chứng nhận quốc tế; production
 *   chạy đúng MỘT bản sao backend nên cũng không "mở rộng không giới hạn".
 * - "Hỗ trợ 24/7" ở đăng nhập/đăng ký, thanh toán, thanh toán thành công: chính sách hỗ trợ (pages/public/Support.jsx) ghi
 *   hotline 8:00-22:00 Thứ 2-Thứ 7, email tiếp nhận 24/7 nhưng phản hồi trong 24 giờ làm việc; chỉ trợ lý AI chạy không phụ
 *   thuộc giờ làm việc.
 * - Mẹo ở mục chiến dịch trang chủ: "tăng hiệu quả chuyển đổi lên đến 3 lần" — không có số đo nào.
 * - Demo dùng thử (/trial-demo) luồng Zalo CÁ NHÂN nhưng người dùng giả bấm "Kết nối Zalo OA" — Zalo OA không dùng để gửi chiến dịch.
 *
 * Vòng 2 (03/10/2026, Claude chốt các câu "giữ lại" của vòng 1):
 * - Câu lợi ích hứa kết quả bằng con số không có số đo: "Tiết kiệm 20+ giờ/tuần", "Chuyển đổi lead tốt hơn 3x", "Giảm 60% chi phí
 *   vận hành" (+ "hàng chục công cụ", "không phí ẩn" — chính sách giá/thanh toán không ghi). Viết lại không còn con số.
 * - Huy hiệu "Live Demo" ở mục chiến dịch: khối này là hoạt cảnh có kịch bản, không phải demo chạy thật -> "Mô phỏng".
 * - Khung dashboard mẫu ở trang chủ (HeroDashboardMock): doanh thu 54,5 triệu / 189 đã mua... là số mẫu -> luôn gắn nhãn minh hoạ.
 * - Code/khoá dịch chết có câu bịa đã xoá (TestimonialSlider "tăng 300%", trustStats "500+ / 4.9★" của ContactPage, 49 khoá
 *   heroPage cũ có ZNS/24-7/score/encrypted): spec khoá để không ai khôi phục.
 * - "Tất cả tính năng đã được mở khóa" ở trang thanh toán thành công và "Đầy đủ tính năng" ở trang dùng thử: gói bị hạn mức và cổng
 *   kênh theo gói (campaignNodeRegistry.service.js ZALO_PLAN_NODE_SUBTYPES; seed gói Dùng thử 035_seed_plans.sql: 1 landing page,
 *   1 tài khoản Zalo/email, 100 tin/kỳ, 50 credit AI) -> nói theo hạn mức gói.
 * - f6Desc "không ai khác được đọc": chính sách bảo mật (PrivacyPolicy.jsx mục 5) ghi nhân sự DIGISO tiếp cận dữ liệu theo phân công;
 *   câu đúng là "dữ liệu mỗi tài khoản tách riêng, phân quyền theo vai trò".
 */
const LOCALES = [['vi', vi], ['en', en]];

describe.each(LOCALES)('chuỗi trang công khai đã rà (%s)', (_name, dict) => {
  it('trang chủ khối lợi ích #4: không còn mã hóa đầu cuối / mở rộng không giới hạn / tuân thủ chuẩn quốc tế', () => {
    const blob = `${dict.heroPage.b4Title} ${dict.heroPage.b4Desc}`;
    expect(blob).not.toMatch(/đầu cuối|end-to-end/i);
    expect(blob).not.toMatch(/không giới hạn|unlimited/i);
    expect(blob).not.toMatch(/chuẩn quốc tế|international/i);
    // Chỉ nêu biện pháp có trong chính sách bảo mật.
    expect(blob).toMatch(/HTTPS\/TLS/);
  });

  it('không còn "hỗ trợ 24/7" ở đăng nhập/đăng ký, thanh toán, thanh toán thành công', () => {
    const surfaces = {
      'authLayout.features': dict.authLayout.features.join(' | '),
      'checkout.contactSupport': dict.checkout.contactSupport,
      'checkout.trustBadge3': dict.checkout.trustBadge3,
      'paymentSuccess.feature2': dict.paymentSuccess.feature2,
    };
    for (const [where, text] of Object.entries(surfaces)) {
      expect(text, where).not.toMatch(/24\s*\/\s*7/);
    }
  });

  it('mẹo ở mục chiến dịch trang chủ không hứa tăng chuyển đổi gấp ba', () => {
    const tip = dict.heroPage.campaignDemo.tipContent;
    expect(tip).not.toMatch(/3 lần|3x|\bgấp\b/i);
    expect(tip).not.toMatch(/chuyển đổi|conversion/i);
  });
});

describe('demo dùng thử /trial-demo', () => {
  it.each(['vi', 'en'])('luồng tạo chiến dịch (%s) không nhắc Zalo OA', (locale) => {
    const blob = JSON.stringify(MOCK_CONVERSATIONS[locale].campaign);
    expect(blob).not.toMatch(/Zalo OA/i);
  });
});

// ── Vòng 2 ───────────────────────────────────────────────────────────────────────────────────────────────────

// 49 khoá `heroPage` cũ không còn nơi nào dùng (grep literal + `t(`heroPage.${...}`)` chỉ còn HeroChatWidget:77 với heroConsultation.*).
const DELETED_HERO_KEYS = [
  'getStarted', 'statsBusinesses', 'statsLeads', 'statsCampaigns', 'statsUptime', 'featuresBadge', 'featuresTitle',
  'featuresTitleHighlight', 'featuresSubtitle', 'howItWorksBadge', 'howItWorksTitle', 'howItWorksSubtitle', 'step', 'whyChooseTitle',
  'benefit1Title', 'benefit1Desc', 'benefit2Title', 'benefit2Desc', 'benefit3Title', 'benefit3Desc', 'benefit4Title', 'benefit4Desc',
  'ctaReady', 'ctaSubtitle', 'ctaButton', 'ctaNote', 'testimonialsBadge', 'testimonialsTitle', 'testimonialsSubtitle',
  'feature1Title', 'feature1Desc', 'feature2Title', 'feature2Desc', 'feature3Title', 'feature3Desc', 'feature4Title', 'feature4Desc',
  'feature5Title', 'feature5Desc', 'feature6Title', 'feature6Desc', 'step1Title', 'step1Desc', 'step2Title', 'step2Desc',
  'step3Title', 'step3Desc', 'step4Title', 'step4Desc',
];

describe.each(LOCALES)('vòng 2 — chuỗi trang chủ / thanh toán / dùng thử (%s)', (_name, dict) => {
  it('mọi chuỗi cấp 1 của heroPage không hứa kết quả bằng con số (20+ giờ, 3x, 60%)', () => {
    const offenders = Object.entries(dict.heroPage)
      .filter(([, v]) => typeof v === 'string')
      .filter(([, v]) => /\b\d+\s?x\b/i.test(v) || /\d+\s*%/.test(v) || /\d+\s*\+\s*(giờ|hours?)/i.test(v))
      .map(([k, v]) => `${k}: ${v}`);
    expect(offenders).toEqual([]);
  });

  it('khối lợi ích #1-#3 và f3Highlight đã viết lại không còn "hàng chục công cụ" / "không phí ẩn" / chi phí giảm', () => {
    const blob = ['f3Highlight', 'b1Title', 'b1Desc', 'b2Title', 'b2Desc', 'b3Title', 'b3Desc'].map((k) => dict.heroPage[k]).join(' | ');
    expect(blob).not.toMatch(/hàng chục|dozens/i);
    expect(blob).not.toMatch(/phí ẩn|hidden fees?/i);
    expect(blob).not.toMatch(/giảm .*chi phí|cut .*costs?/i);
    expect(blob).not.toMatch(/gấp|\b\d+\s?x\b|tốt hơn|better/i);
  });

  it('huy hiệu mục chiến dịch không còn "Live Demo"', () => {
    expect(dict.heroPage.campaignDemoBadge).not.toMatch(/live/i);
    expect(dict.heroPage.campaignDemoBadge.length).toBeGreaterThan(3);
  });

  it('f6Desc không còn "không ai khác được đọc", nói đúng chữ chính sách: tách riêng dữ liệu + phân quyền theo vai trò', () => {
    expect(dict.heroPage.f6Desc).not.toMatch(/không ai khác|no one else/i);
    expect(dict.heroPage.f6Desc).toMatch(/tách riêng|separated/i);
    expect(dict.heroPage.f6Desc).toMatch(/vai trò|role-based/i);
  });

  it('thanh toán thành công không còn "Tất cả tính năng đã được mở khóa" — nói theo gói', () => {
    expect(dict.paymentSuccess.feature1).not.toMatch(/tất cả tính năng|all features/i);
    expect(dict.paymentSuccess.feature1).toMatch(/trong gói|your plan/i);
  });

  it('trang dùng thử không còn "đầy đủ tính năng" — nói theo hạn mức gói dùng thử', () => {
    for (const key of ['trustFullFeature', 'ctaSubtitle']) {
      expect(dict.trialDemo[key], key).not.toMatch(/đầy đủ tính năng|full[ -]features?/i);
      expect(dict.trialDemo[key], key).toMatch(/hạn mức|limits/i);
    }
  });

  it('khoá heroPage / contact đã xoá không quay lại', () => {
    const back = DELETED_HERO_KEYS.filter((k) => k in dict.heroPage);
    expect(back).toEqual([]);
    expect(['trustStat1Label', 'trustStat2Label', 'trustStat3Label'].filter((k) => k in dict.contact)).toEqual([]);
  });
});

describe('vòng 2 — code chết có câu bịa không quay lại', () => {
  it('TestimonialSlider.jsx (lời chứng thực bịa "tăng 300%") đã xoá', () => {
    expect(existsSync(pathOf('../pages/public/components/TestimonialSlider.jsx'))).toBe(false);
  });

  it('ContactPage không còn trustStats ("500+" khách, "4.9★" đánh giá)', () => {
    const src = sourceOf('../pages/public/ContactPage.jsx');
    expect(src).not.toMatch(/trustStats?|getTrustStats/);
    expect(src).not.toMatch(/500\+|4\.9★/);
  });

  it('CampaignFlowLauncher không còn chuỗi dự phòng "Live Demo"', () => {
    expect(sourceOf('../pages/public/components/CampaignFlowLauncher.jsx')).not.toMatch(/Live Demo/);
  });
});

describe('vòng 2 — HeroDashboardMock (số mẫu) luôn có nhãn minh hoạ', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('khung dashboard mẫu có nhãn "Số liệu minh hoạ" trên thanh trình duyệt', () => {
    localStorage.clear();
    render(createElement(I18nProvider, null, createElement(HeroDashboardMock)));
    const badge = screen.getByTestId('hero-dashboard-mock-sample-badge');
    expect(badge.textContent).toBe('Số liệu minh hoạ');
  });
});

// ── Vòng 3 (H1, PLAN_SUA_AI_DOT3, 03/10/2026) ────────────────────────────────────────────────────────────────

/**
 * Giờ làm việc hotline sếp chốt 03/10/2026: Thứ 2 – Thứ 6, 8:30 – 17:00. Trước đó mỗi nơi ghi một kiểu: trang Liên hệ "9h-18h" /
 * "08:00 – 17:00", prompt tư vấn "8h-17h", ba trang chính sách "8:00 - 22:00, Thứ 2 - Thứ 7" — khách hỏi bot và hỏi trang nhận hai đáp án.
 * Phần chữ của ba trang chính sách (Support / PaymentPolicy / ComplaintPolicy) KHÔNG nằm trong spec này: đó là văn bản có phiên bản theo
 * NĐ 248 (pages/public/policyVersions.js — báo trước >= 15 ngày, lưu bản cũ), sửa chữ phải qua quy trình đó.
 */
const collectStrings = (node, out = []) => {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => collectStrings(n, out));
  else if (node && typeof node === 'object') Object.values(node).forEach((n) => collectStrings(n, out));
  return out;
};

const OLD_HOURS = [
  [/22:00|10:00 PM|10 PM/i, '22:00 / 10 PM (giờ hotline cũ 8:00-22:00)'],
  [/Thứ 2\s*[-–]\s*Thứ 7|Mon(day)?\s*[-–]\s*Sat/i, 'Thứ 2 - Thứ 7'],
  [/9h\s*-\s*18h|9\s?am\s*-\s*6\s?pm/i, '9h-18h'],
  [/8h\s*-\s*17h/i, '8h-17h'],
  [/08:00\s*[–-]\s*17:00/, '08:00 – 17:00'],
  [/Mở lại 08:00|Reopens Monday 08:00/, 'mở lại 08:00'],
];

describe.each(LOCALES)('H1 — giờ làm việc thống nhất Thứ 2 – Thứ 6, 8:30 – 17:00 (%s)', (name, dict) => {
  it('các mục công khai (liên hệ, bảng giá, trang chủ, thanh toán, dùng thử, đăng nhập) không còn giờ cũ', () => {
    const blob = ['contact', 'pricingPage', 'heroPage', 'checkout', 'paymentSuccess', 'trialDemo', 'authLayout']
      .flatMap((k) => collectStrings(dict[k]))
      .join('\n');
    for (const [re, label] of OLD_HOURS) expect(blob, label).not.toMatch(re);
  });

  it('trang Liên hệ ghi 8:30 – 17:00 ở workHours / officeDesc / hotlineDesc và "08:30" ở câu mở lại', () => {
    expect(dict.contact.workHours).toContain('08:30 – 17:00');
    const [from, to] = name === 'vi' ? ['8:30', '17:00'] : ['8:30 AM', '5:00 PM'];
    for (const key of ['officeDesc', 'hotlineDesc']) {
      expect(dict.contact[key], key).toContain(from);
      expect(dict.contact[key], key).toContain(to);
    }
    expect(dict.contact.statusClosedDetail).toContain('08:30');
    expect(dict.contact.statusOpenDetail).toContain('17:00');
  });

  it('statusOpenDetail: {time} là giờ Việt Nam và nói rõ "giờ Việt Nam" (không còn giờ trình duyệt)', () => {
    const open = dict.contact.statusOpenDetail;
    expect(open).toContain('{time}');
    expect(open).toMatch(name === 'vi' ? /giờ Việt Nam/ : /Vietnam time/);
  });

  it('chữ tiếng Việt dùng "Thứ 2 – Thứ 6", tiếng Anh dùng "Mon – Fri" (không còn thứ Bảy)', () => {
    const expected = name === 'vi' ? /Thứ 2 – Thứ 6|T2 – T6/ : /Mon – Fri/;
    expect(dict.contact.workHours).toMatch(expected);
    expect(dict.contact.officeDesc).toMatch(expected);
    expect(dict.contact.hotlineDesc).toMatch(expected);
  });
});

/**
 * Câu hứa chưa kiểm chứng (thợ G3c để lại, H1 mục 3): "setup miễn phí 30 phút đầu tiên" (faq4A — không có quy trình/hợp đồng nào ghi),
 * "Chỉ mất 10 phút" / "Chỉ cần 15 phút" / "Mất khoảng 5 phút" (không có số đo thời gian thiết lập), "Tỷ lệ vào inbox cao" (không đo tỷ lệ vào
 * hộp thư đến), "Mọi lead đều được chăm sóc" (hệ thống gom lead, không tự chăm sóc mọi lead). Viết lại theo đúng điều có thật:
 * trợ lý AI + mẫu có sẵn, hạ tầng email Founder AI hoặc SMTP riêng, lead gom về trang Lead, bài hướng dẫn + hotline/email trong giờ làm việc.
 */
describe.each(LOCALES)('H1 — câu hứa chưa kiểm chứng đã viết lại (%s)', (_name, dict) => {
  it('pricingPage.faq4A không hứa thời lượng / miễn phí setup; nói hỗ trợ có thật + giờ làm việc', () => {
    const a = dict.pricingPage.faq4A;
    expect(a).not.toMatch(/\d+\s*(phút|minutes?)/i);
    expect(a).not.toMatch(/miễn phí|free/i);
    expect(a).not.toMatch(/Professional|Enterprise/);
    expect(a).toMatch(/hotline/i);
    expect(a).toMatch(/email/i);
    expect(a).toContain('8:30');
  });

  it('mọi chuỗi cấp 1 của heroPage không hứa thời gian bằng con số (10 phút, 15 phút, 5 phút…)', () => {
    const offenders = Object.entries(dict.heroPage)
      .filter(([, v]) => typeof v === 'string')
      .filter(([, v]) => /\d+\s*(phút|minutes?)\b/i.test(v))
      .map(([k, v]) => `${k}: ${v}`);
    expect(offenders).toEqual([]);
  });

  it('f2Highlight / f4Highlight không hứa kết quả chưa đo (tỷ lệ vào inbox, mọi lead đều được chăm sóc)', () => {
    expect(dict.heroPage.f2Highlight).not.toMatch(/inbox|deliverab|tỷ lệ|rate/i);
    expect(dict.heroPage.f4Highlight).not.toMatch(/mọi lead|every lead|chăm sóc|cared/i);
    expect(dict.heroPage.f1Highlight).not.toMatch(/chỉ mất|only takes|done in/i);
    expect(dict.heroPage.section2Title).not.toMatch(/chỉ cần|only need|in \d+ minutes/i);
  });

  it('bốn câu mới nói điều có thật: mẫu + trợ lý AI, hạ tầng email hoặc SMTP riêng, lead gom về một nơi, 4 bước', () => {
    const vi18n = _name === 'vi';
    expect(dict.heroPage.f1Highlight).toMatch(vi18n ? /trợ lý AI/ : /AI assistant/);
    expect(dict.heroPage.f2Highlight).toMatch(/SMTP/);
    expect(dict.heroPage.f4Highlight).toMatch(vi18n ? /gom về/ : /collected/);
    expect(dict.heroPage.section2Title).toMatch(/\b4\b/);
  });

  it('f5Highlight không hứa "ROI rõ ràng"; f4Desc không hứa "không để khách rơi vào quên lãng" / phân loại theo mức độ quan tâm (không có chấm điểm lead)', () => {
    expect(dict.heroPage.f5Highlight).not.toMatch(/\bROI\b|lợi nhuận|return on/i);
    expect(dict.heroPage.f5Highlight).toMatch(_name === 'vi' ? /chiến dịch/ : /campaign/);
    expect(dict.heroPage.f5Highlight).toMatch(_name === 'vi' ? /kênh/ : /channel/);
    expect(dict.heroPage.f4Desc).not.toMatch(/quên lãng|rơi vào|fall through|never let|không để/i);
    expect(dict.heroPage.f4Desc).not.toMatch(/mức độ quan tâm|interest level/i);
    expect(dict.heroPage.f4Desc).toMatch(/lead/i);
    expect(dict.heroPage.f4Desc).toMatch(_name === 'vi' ? /landing page, form/ : /landing pages and forms/);
  });
});

describe('H1 — trang Liên hệ tính mở/đóng cửa bằng businessHours.js theo giờ Việt Nam, không còn đọc giờ trình duyệt', () => {
  it('ContactPage dùng isWithinBusinessHours + getVietnamClock; không còn getHours/getMinutes/getDay/getTimezoneOffset và "hour >= 8"', () => {
    const src = sourceOf('../pages/public/ContactPage.jsx');
    expect(src).toMatch(/isWithinBusinessHours/);
    expect(src).toMatch(/getVietnamClock\(now\)\.timeStr/);
    expect(src).not.toMatch(/\bgetHours\b|\bgetMinutes\b|\bgetDay\b|getTimezoneOffset|toLocaleTimeString/);
    expect(src).not.toMatch(/hour\s*>=\s*8\b/);
  });

  it('businessHours.js đọc giờ qua getter UTC sau khi cộng +7, không dùng getter giờ địa phương', () => {
    const src = sourceOf('../pages/public/businessHours.js');
    expect(src).toMatch(/getUTCHours/);
    expect(src).toMatch(/getUTCDay/);
    expect(src).not.toMatch(/\.getHours\(|\.getMinutes\(|\.getDay\(/);
  });
});
