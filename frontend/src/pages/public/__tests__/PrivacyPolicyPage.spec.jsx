import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import PrivacyPolicy from '../PrivacyPolicy';
import PublicDPA from '../PublicDPA';

/** Tám điểm tối thiểu của Điều 5 khoản 1 NĐ 248/2026/NĐ-CP → tiêu đề mục bắt buộc phải có trong Phần (I). */
const ARTICLE_5_HEADINGS = [
  'Mục đích và phạm vi thu thập thông tin', // a
  'Phạm vi sử dụng thông tin', // b
  'Thời gian lưu trữ thông tin', // c
  'Tổ chức, cá nhân có thể được tiếp cận thông tin cá nhân', // d
  'Biện pháp bảo mật thông tin, dữ liệu của người sử dụng', // đ
  'Phương thức, quy trình để chủ thể dữ liệu xem, chỉnh sửa dữ liệu', // e
  'Phương thức, quy trình tiếp nhận yêu cầu xóa, hủy hoặc hạn chế xử lý dữ liệu', // g
  'Phương thức, quy trình tiếp nhận và giải quyết khiếu nại, yêu cầu, phản ánh liên quan đến bảo mật thông tin', // h
];

const FORBIDDEN = /SendGrid|Azure|FPT Smart|Singapore|2FA|SAML|whitelist|penetration|pentest/i;

describe('Chính sách bảo mật — ba phần theo NĐ 248/2026', () => {
  it('có mục lục 3 phần và đủ 8 tiêu đề Điều 5 (bản VI)', () => {
    const { container } = render(<PrivacyPolicy />);
    const text = container.textContent;

    expect(container.querySelector('#phan-1')).not.toBeNull();
    expect(container.querySelector('#phan-2')).not.toBeNull();
    expect(container.querySelector('#phan-3')).not.toBeNull();
    expect(container.querySelectorAll('nav a[href^="#phan-"]')).toHaveLength(3);

    expect(text).toContain('Chính sách bảo mật — thông tin DIGISO thu thập trực tiếp từ bạn');
    expect(text).toContain('DIGISO là Bên xử lý dữ liệu — khi bạn là khách hàng của khách hàng DIGISO');
    expect(text).toContain('DIGISO là Bên kiểm soát và xử lý dữ liệu');

    for (const heading of ARTICLE_5_HEADINGS) {
      expect(text, `thiếu mục Điều 5: ${heading}`).toContain(heading);
    }
    expect(container.querySelectorAll('section[id^="p1-"]').length).toBeGreaterThanOrEqual(8);
  });

  it('ghi ngày cập nhật/áp dụng 29/09/2026', () => {
    const { container } = render(<PrivacyPolicy />);
    expect(container.textContent).toContain('Cập nhật ngày 29/09/2026 — Áp dụng từ 29/09/2026');
  });

  it('không hứa hạ tầng/biện pháp hệ thống không có (VI và EN)', () => {
    const { container } = render(<PrivacyPolicy />);
    expect(container.textContent).not.toMatch(FORBIDDEN);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  it('nêu chuyển dữ liệu xuyên biên giới và không coi im lặng là đồng ý', () => {
    const { container } = render(<PrivacyPolicy />);
    const text = container.textContent;
    expect(text).toContain('chuyển dữ liệu cá nhân xuyên biên giới');
    expect(text).toContain('Google Gemini API');
    expect(text).toContain('không coi việc bạn tiếp tục truy cập dịch vụ là sự đồng ý');
  });
});

describe('Thỏa thuận xử lý dữ liệu cá nhân', () => {
  it('có đủ 15 điều, mục lục và ngày cập nhật', () => {
    const { container } = render(<PublicDPA />);
    for (let i = 1; i <= 15; i += 1) {
      expect(container.querySelector(`#dieu-${i}`), `thiếu Điều ${i}`).not.toBeNull();
    }
    expect(container.querySelector('#dieu-16')).toBeNull();
    expect(container.textContent).toContain('Cập nhật ngày 29/09/2026 — Áp dụng từ 29/09/2026');
  });

  it('không hứa hạ tầng/biện pháp hệ thống không có và không dùng "im lặng = đồng ý"', () => {
    const { container } = render(<PublicDPA />);
    expect(container.textContent).not.toMatch(FORBIDDEN);
    expect(container.textContent).not.toMatch(/tiếp tục sử dụng[^.]*(được hiểu|đồng nghĩa|chấp thuận)/);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });
});
