/**
 * Phản hồi sếp 14/09: mở /huong-dan là mất menu chính của app. Test khoá đúng cách chọn khung:
 * đã đăng nhập → chạy trong khung app (MainLayout) với DocsLayout ở chế độ nhúng; chưa đăng nhập
 * → layout công khai như trước (trang hướng dẫn phải đọc được khi chưa có tài khoản).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import HelpDocsRoute from '../HelpDocsRoute';
import { useAuthStore } from '../../stores/authStore';

vi.mock('../MainLayout', () => ({
  default: ({ children }) => <div data-testid="app-chrome">{children}</div>,
}));

vi.mock('../DocsLayout', () => ({
  default: ({ embedded }) => (
    <div data-testid={embedded ? 'docs-embedded' : 'docs-public'} />
  ),
}));

const setAuth = (state) => useAuthStore.setState(state);

describe('HelpDocsRoute — khung cho /huong-dan', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setAuth({ isAuthenticated: false, isLoading: false });
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('chưa đăng nhập: giữ layout công khai, KHÔNG bọc khung app', () => {
    render(<HelpDocsRoute />);

    expect(screen.getByTestId('docs-public')).toBeInTheDocument();
    expect(screen.queryByTestId('app-chrome')).toBeNull();
    expect(screen.queryByTestId('docs-embedded')).toBeNull();
  });

  it('đã đăng nhập: trang hướng dẫn nằm TRONG khung app, DocsLayout ở chế độ nhúng', () => {
    setAuth({ isAuthenticated: true, isLoading: false });
    render(<HelpDocsRoute />);

    const chrome = screen.getByTestId('app-chrome');
    expect(chrome).toContainElement(screen.getByTestId('docs-embedded'));
    expect(screen.queryByTestId('docs-public')).toBeNull();
  });

  it('đang xác thực lại mà kho có accessToken: hiện khung app ngay, không nhấp nháy layout công khai', () => {
    localStorage.setItem('accessToken', 'token-cu-con-hieu-luc');
    setAuth({ isAuthenticated: false, isLoading: true });
    render(<HelpDocsRoute />);

    expect(screen.getByTestId('app-chrome')).toBeInTheDocument();
    expect(screen.queryByTestId('docs-public')).toBeNull();
  });

  it('token nằm ở sessionStorage (không tích "ghi nhớ đăng nhập") cũng tính là đang đăng nhập', () => {
    sessionStorage.setItem('accessToken', 'token-phien');
    setAuth({ isAuthenticated: false, isLoading: true });
    render(<HelpDocsRoute />);

    expect(screen.getByTestId('app-chrome')).toBeInTheDocument();
  });

  it('đang xác thực lại mà không có token: khách lạ thấy layout công khai ngay', () => {
    setAuth({ isAuthenticated: false, isLoading: true });
    render(<HelpDocsRoute />);

    expect(screen.getByTestId('docs-public')).toBeInTheDocument();
    expect(screen.queryByTestId('app-chrome')).toBeNull();
  });

  it('token hỏng (xác thực xong vẫn chưa đăng nhập): tự về layout công khai', () => {
    localStorage.setItem('accessToken', 'token-het-han');
    setAuth({ isAuthenticated: false, isLoading: false });
    render(<HelpDocsRoute />);

    expect(screen.getByTestId('docs-public')).toBeInTheDocument();
    expect(screen.queryByTestId('app-chrome')).toBeNull();
  });
});
