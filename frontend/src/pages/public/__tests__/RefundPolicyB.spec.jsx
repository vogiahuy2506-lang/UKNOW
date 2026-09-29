import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RefundPolicy from '../RefundPolicy.jsx';

const norm = (s) => s.replace(/\s+/g, ' ').replace(/ /g, ' ').trim();

function renderText() {
  const { container } = render(
    <MemoryRouter initialEntries={['/refund-policy']}>
      <Routes>
        <Route path="/refund-policy" element={<RefundPolicy />} />
      </Routes>
    </MemoryRouter>,
  );
  return norm(container.textContent);
}

describe('/refund-policy — phương án B (huỷ trong 07 ngày đầu, chưa sử dụng)', () => {
  const text = renderText();

  it('có quyền hoàn 100% trong 07 ngày kể từ ngày thanh toán khi chưa sử dụng dịch vụ (vi + en)', () => {
    expect(text).toContain('07 ngày kể từ ngày thanh toán');
    expect(text).toContain('chưa sử dụng dịch vụ');
    expect(text).toContain('100%');
    expect(text).toContain('within 07 days of the payment date');
    expect(text).toContain('100% of the amount paid');
  });

  it('mục 8.1 nêu hai nhóm hoàn tiền, mục 8.3 và mục 4c trỏ về 8.2.đ', () => {
    expect(text).toContain('DIGISO hoàn tiền trong hai nhóm trường hợp');
    expect(text).toContain('ngoài trường hợp mục 8.2.đ');
    expect(text).toContain('trừ trường hợp mục 8.2.đ');
    expect(text).toContain('Yêu cầu hoàn tiền không thuộc các trường hợp tại mục 8.2');
  });

  it('KHÔNG đưa quy tắc "50%" thời hạn hay "30 ngày kể từ"', () => {
    expect(text).not.toMatch(/50\s*%/);
    expect(text).not.toContain('30 ngày kể từ');
    expect(text).not.toMatch(/30 days (from|of|after)/i);
  });
});
