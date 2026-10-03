import { describe, it, expect } from 'vitest';
import vi from '../i18n/vi';
import en from '../i18n/en';
import { MOCK_CONVERSATIONS } from '../pages/public/components/mockConversations';

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
