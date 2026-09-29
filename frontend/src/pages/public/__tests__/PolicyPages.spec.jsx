import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ServiceDeliveryPolicy from '../ServiceDeliveryPolicy.jsx';
import ComplaintPolicy from '../ComplaintPolicy.jsx';
import PricingPolicy from '../PricingPolicy.jsx';
import PaymentPolicy from '../PaymentPolicy.jsx';
import ServiceTerms from '../ServiceTerms.jsx';
import RefundPolicy from '../RefundPolicy.jsx';
import RightsAndDuties from '../RightsAndDuties.jsx';
import TermsOfService from '../TermsOfService.jsx';
import Support from '../Support.jsx';

const norm = (s) => s.replace(/\s+/g, ' ').replace(/ /g, ' ').trim();

const PAGES = [
  ['/complaint-policy', ComplaintPolicy, 'Phương thức tiếp nhận và giải quyết phản ánh, yêu cầu, khiếu nại'],
  ['/pricing-policy', PricingPolicy, 'Chính sách về giá'],
  ['/payment-policy', PaymentPolicy, 'Chính sách về thanh toán'],
  ['/service-terms', ServiceTerms, 'Các điều kiện hoặc hạn chế trong việc cung cấp dịch vụ trên nền tảng'],
  ['/service-delivery-policy', ServiceDeliveryPolicy, 'Chính sách về phương thức cung cấp dịch vụ'],
  ['/refund-policy', RefundPolicy, 'Chính sách chấm dứt dịch vụ và hoàn tiền'],
  ['/rights-and-duties', RightsAndDuties, 'Quyền và nghĩa vụ của các bên'],
  ['/terms', TermsOfService, 'Điều khoản sử dụng dịch vụ'],
  ['/support', Support, 'Hình thức hỗ trợ trực tuyến'],
];

describe.each(PAGES)('trang %s', (path, Component, h1Vi) => {
  it('render được, h1 đúng tên, có ngày cập nhật/áp dụng 29/09/2026 và lịch sử 29/09/2026', () => {
    const { container } = render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={<Component />} />
        </Routes>
      </MemoryRouter>,
    );
    const h1 = [...container.querySelectorAll('h1')].find((h) => !h.className.includes('hidden'));
    expect(norm(h1.textContent)).toBe(h1Vi);
    const text = norm(container.textContent);
    expect(text).toContain('Cập nhật ngày 29/09/2026 — Áp dụng từ 29/09/2026');
    expect(text).toContain('Lịch sử cập nhật');
  });
});

describe('ServiceDeliveryPolicy — nội dung tối thiểu Điều 15 NĐ 248', () => {
  it('nêu thời hạn, loại thiết bị, số thiết bị đồng thời, cách dùng, hạn chế', () => {
    const { container } = render(<ServiceDeliveryPolicy />);
    const t = norm(container.textContent);
    expect(t).toContain('Thời hạn sử dụng dịch vụ');
    expect(t).toContain('Loại thiết bị phù hợp');
    expect(t).toContain('không giới hạn số thiết bị đăng nhập đồng thời');
    expect(t).toContain('Mô tả cách sử dụng dịch vụ và các tính năng chính');
    expect(t).toContain('Các hạn chế trong quá trình sử dụng');
  });
});

describe('không còn nội dung cũ bị luật sư gạch bỏ', () => {
  it('Điều khoản sử dụng không còn website digiso.vn, quyền ngừng không báo trước hay chấp nhận ngầm', () => {
    const { container } = render(<TermsOfService />);
    const t = norm(container.textContent);
    expect(t).not.toContain('https://digiso.vn');
    expect(t).not.toContain('mà không cần thông báo trước');
    expect(t).not.toContain('Việc tiếp tục sử dụng Dịch vụ đồng nghĩa với việc bạn chấp nhận');
    expect(t).toContain('không mặc nhiên được xem là sự chấp thuận');
    expect(t).toContain('ít nhất 15 ngày');
  });

  it('Hình thức hỗ trợ không ghi Live Chat người thật', () => {
    const { container } = render(<Support />);
    expect(norm(container.textContent)).not.toContain('Chat trực tiếp trên website founderai.biz');
  });
});
