import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import PrivacyPolicyControllerPanel from '../PrivacyPolicyControllerPanel';
import PrivacyPolicyProcessorPanel from '../PrivacyPolicyProcessorPanel';

function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

describe('PR-N5: Privacy Policy Panels Verification', () => {
  describe('PrivacyPolicyControllerPanel (Bên kiểm soát)', () => {
    it('hiển thị đầy đủ các nội dung mới trong tiếng Việt', () => {
      const { container } = render(
        <PrivacyPolicyControllerPanel language="vi" lc={getLangClass} />
      );
      const text = container.textContent;

      // 2a. Theo dõi lượt truy cập landing page
      expect(text).toContain('Theo dõi lượt truy cập trang đích');
      expect(text).toContain('mã nhận diện ngẫu nhiên');

      // 2b. Form liên hệ lưu IP + cam kết không tiếp thị nếu chưa có đồng ý
      expect(text).toContain('Dữ liệu biểu mẫu liên hệ');
      expect(text).toContain('địa chỉ IP');
      expect(text).toContain('chỉ dùng duy nhất để phản hồi yêu cầu đó');

      // 2c. Thời hạn lưu: 13 tháng, 24 tháng, 10 năm
      expect(text).toContain('13 tháng');
      expect(text).toContain('24 tháng');
      expect(text).toContain('10 năm');
    });

    it('hiển thị đầy đủ các nội dung mới trong tiếng Anh', () => {
      const { container } = render(
        <PrivacyPolicyControllerPanel language="en" lc={getLangClass} />
      );
      const text = container.textContent;

      // 2a. Landing page tracking
      expect(text).toContain('Landing page visit tracking');
      expect(text).toContain('randomized identifier');

      // 2b. Contact form IP + purpose limitation
      expect(text).toContain('Contact form data');
      expect(text).toContain('IP address');
      expect(text).toContain('Mandatory limitation');

      // 2c. Retention: 13 months, 24 months, 10 years
      expect(text).toContain('13 months');
      expect(text).toContain('24 months');
      expect(text).toContain('10 years');
    });
  });

  describe('PrivacyPolicyProcessorPanel (Bên xử lý)', () => {
    it('hiển thị đầy đủ các nội dung mới trong tiếng Việt', () => {
      const { container } = render(
        <PrivacyPolicyProcessorPanel language="vi" lc={getLangClass} />
      );
      const text = container.textContent;

      // 2d. Rút lại đồng ý cho lead
      expect(text).toContain('Rút lại đồng ý tiếp thị cho khách hàng tiềm năng (lead)');
      expect(text).toContain('liên kết hủy nhận tin / rút lại đồng ý');

      // 2c. Thời hạn lưu: 90 ngày, 24 tháng
      expect(text).toContain('90 ngày');
      expect(text).toContain('24 tháng');
    });

    it('hiển thị đầy đủ các nội dung mới trong tiếng Anh', () => {
      const { container } = render(
        <PrivacyPolicyProcessorPanel language="en" lc={getLangClass} />
      );
      const text = container.textContent;

      // 2d. Lead consent withdrawal
      expect(text).toContain('Marketing consent withdrawal for prospective customers (leads)');
      expect(text).toContain('unsubscribe / consent withdrawal link');

      // 2c. Retention: 90 days, 24 months
      expect(text).toContain('90 days');
      expect(text).toContain('24 months');
    });
  });
});
