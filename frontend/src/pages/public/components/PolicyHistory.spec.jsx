import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PolicyHistory from './PolicyHistory.jsx';

let mockVersions = ['2026-09-29'];
vi.mock('../policyVersions.js', () => ({
  POLICY_VERSIONS: {
    get terms() {
      return { path: '/terms', versions: mockVersions };
    },
  },
}));

const lc = () => '';
const renderHistory = (props = {}) =>
  render(
    <MemoryRouter>
      <PolicyHistory slug="terms" language="vi" lc={lc} {...props} />
    </MemoryRouter>,
  );

describe('PolicyHistory', () => {
  it('slug lạ → không render gì', () => {
    const { container } = renderHistory({ slug: 'khong-co' });
    expect(container.firstChild).toBeNull();
  });

  it('1 phiên bản → đúng 1 dòng, có ngày + "Phiên bản hiện hành", không có liên kết', () => {
    mockVersions = ['2026-09-29'];
    const { container } = renderHistory();
    const items = container.querySelectorAll('ol li');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('29/09/2026');
    expect(items[0].textContent).toContain('Phiên bản hiện hành');
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('3 phiên bản → dòng 1 không liên kết, dòng 2-3 liên kết tới /policy-versions/<slug>/<date>', () => {
    mockVersions = ['2026-11-01', '2026-09-29', '2026-08-01'];
    const { container } = renderHistory();
    const items = container.querySelectorAll('ol li');
    expect(items).toHaveLength(3);
    expect(items[0].querySelectorAll('a')).toHaveLength(0);
    expect(items[1].querySelector('a').getAttribute('href')).toBe('/policy-versions/terms/2026-09-29');
    expect(items[2].querySelector('a').getAttribute('href')).toBe('/policy-versions/terms/2026-08-01');
  });

  it('EN hiện "September 29, 2026" và "Current version"', () => {
    mockVersions = ['2026-09-29'];
    const { container } = renderHistory({ language: 'en' });
    expect(container.textContent).toContain('September 29, 2026');
    expect(container.textContent).toContain('Current version');
  });

  it('không render chữ nào ngoài ngày và nhãn (không có lý do cập nhật)', () => {
    mockVersions = ['2026-09-29'];
    const { container } = renderHistory();
    expect(container.querySelector('ol').textContent).toBe(
      '29/09/2026September 29, 2026Phiên bản hiện hànhCurrent version',
    );
  });

  it('có id lich-su-cap-nhat và data-policy-history trên section', () => {
    mockVersions = ['2026-09-29'];
    const { container } = renderHistory();
    const section = container.querySelector('section');
    expect(section.id).toBe('lich-su-cap-nhat');
    expect(section.hasAttribute('data-policy-history')).toBe(true);
  });
});
