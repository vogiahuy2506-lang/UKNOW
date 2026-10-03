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
