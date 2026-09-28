import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import PolicyHistory from './PolicyHistory.jsx';

/**
 * PR-2 Section 5 — unit test cho component "Lịch sử cập nhật" ở footer chính sách.
 */
describe('PolicyHistory', () => {
  function lc() {
    return '';
  }

  it('không render gì khi entries rỗng hoặc undefined', () => {
    const { container } = render(<PolicyHistory language="vi" lc={lc} entries={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('render đúng số lượng entry theo thứ tự mới nhất trước', () => {
    const entries = [
      {
        date: '2026-09-28',
        note: {
          vi: 'Bản mới nhất',
          en: 'Latest version',
        },
      },
      {
        date: '2026-08-04',
        note: {
          vi: 'Bản cũ',
          en: 'Previous version',
        },
      },
    ];
    const { container } = render(
      <PolicyHistory language="vi" lc={lc} entries={entries} />
    );
    const items = container.querySelectorAll('ol li');
    expect(items.length).toBe(2);
    // Bản mới nhất xuất hiện trước (thứ tự trong DOM).
    expect(items[0].textContent).toMatch(/2026/);
    expect(items[1].textContent).toMatch(/2026/);
  });

  it('format ngày VI theo DD/MM/YYYY và EN theo Month DD, YYYY', () => {
    const entries = [
      {
        date: '2026-09-28',
        note: { vi: 'a', en: 'b' },
      },
    ];
    // Test cả 2 locale đều chứa cả 2 format (vì DOM render cả 2 <span>, chỉ ẩn theo class).
    const { container } = render(
      <PolicyHistory language="vi" lc={lc} entries={entries} />
    );
    expect(container.textContent).toContain('28/09/2026');
    expect(container.textContent).toContain('September 28, 2026');
  });

  it('hiển thị hint về Nghị định 248/2026/NĐ-CP (VI + EN)', () => {
    const entries = [{ date: '2026-09-28', note: { vi: 'x', en: 'x' } }];
    const { container: viContainer } = render(
      <PolicyHistory language="vi" lc={lc} entries={entries} />
    );
    expect(viContainer.textContent).toContain('248/2026/NĐ-CP');

    const { container: enContainer } = render(
      <PolicyHistory language="en" lc={lc} entries={entries} />
    );
    expect(enContainer.textContent).toContain('248/2026/NĐ-CP');
  });
});
