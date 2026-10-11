/**
 * 11/10/2026 — site Founder AI công khai có giao diện tối: MỌI thanh điều hướng công khai phải có nút đổi
 * sáng/tối (người dùng mở /login, /huong-dan... lần đầu không có thanh app để bật). Test này khoá việc đó.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../i18n', async () => (await import('../../test/realI18n.js')).realI18nModule());
vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAuthStore: vi.fn(),
}));
vi.mock('../../services/help.service', () => ({
  listHelpArticles: vi.fn(() => Promise.resolve({ data: { result: [] } })),
}));

const { default: HeroNavbar } = await import('../../pages/public/components/HeroNavbar');
const { default: AuthLayout } = await import('../AuthLayout');
const { default: DocsLayout } = await import('../DocsLayout');
const { default: PolicyLayout } = await import('../PolicyLayout');

const TOGGLE = /Chuyển sang giao diện (tối|sáng)/;
const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeAll(() => {
  window.scrollTo = vi.fn();
});

describe('nút đổi giao diện trên thanh điều hướng công khai', () => {
  it('HeroNavbar (trang chủ, Bảng giá, Liên hệ, Dùng thử) có nút', () => {
    wrap(<HeroNavbar />);
    expect(screen.getAllByRole('button', { name: TOGGLE })).toHaveLength(1);
  });

  it('AuthLayout (Đăng nhập/Đăng ký/Quên mật khẩu...) có nút ở panel trái (desktop) và hàng logo (mobile)', () => {
    wrap(<AuthLayout><div>form</div></AuthLayout>);
    expect(screen.getAllByRole('button', { name: TOGGLE })).toHaveLength(2);
  });

  it('DocsLayout công khai (/huong-dan khi chưa đăng nhập) có nút; chế độ nhúng trong app thì KHÔNG (đã có ở thanh trên của app)', async () => {
    let view;
    await act(async () => {
      view = wrap(<DocsLayout />);
    });
    expect(screen.getAllByRole('button', { name: TOGGLE })).toHaveLength(1);
    view.unmount();

    await act(async () => {
      wrap(<DocsLayout embedded />);
    });
    expect(screen.queryAllByRole('button', { name: TOGGLE })).toHaveLength(0);
  });

  it('PolicyLayout (11 trang chính sách, không có thanh trên) có nút nổi ở góc', () => {
    wrap(<PolicyLayout />);
    expect(screen.getAllByRole('button', { name: TOGGLE })).toHaveLength(1);
  });
});
