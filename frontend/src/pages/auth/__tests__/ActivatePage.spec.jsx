import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ActivatePage from '../ActivatePage';

const stableT = (key) => key;
vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: stableT }) }));

const mAuth = vi.hoisted(() => ({
  googleLogin: vi.fn().mockResolvedValue({ data: { user: { id: 2, role: 'staff' } } }),
}));

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => mAuth,
}));

const mApi = vi.hoisted(() => ({
  activateAccount: vi.fn(),
}));

vi.mock('../../../features/auth/services/authApi.service', () => ({
  activateAccount: mApi.activateAccount,
}));

vi.mock('../../../components/GoogleAuthButton', () => ({
  default: ({ onSuccess, text }) => (
    <button
      type="button"
      data-testid="google-auth-btn"
      onClick={() => onSuccess?.({ access_token: 'fake_google_token_123' })}
    >
      {text}
    </button>
  ),
}));

const renderActivatePage = (initialUrl = '/activate?token=valid_token_123') =>
  render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/activate" element={<ActivatePage />} />
      </Routes>
    </MemoryRouter>
  );

describe('ActivatePage.jsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('không có token trong URL → hiện thông báo link không hợp lệ', () => {
    renderActivatePage('/activate');
    expect(screen.getByText('activate.failedTitle')).toBeInTheDocument();
    expect(screen.getByText('activate.invalidLink')).toBeInTheDocument();
    expect(screen.getByText('activate.backToLogin')).toBeInTheDocument();
  });

  it('có token → hiện form kích hoạt và tùy chọn đăng nhập Google', () => {
    renderActivatePage('/activate?token=valid_token_123');
    expect(screen.getByText('activate.title')).toBeInTheDocument();
    expect(screen.getByText('activate.googleSectionTitle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'activate.activateButton' })).toBeInTheDocument();
  });

  it('bấm nút Google → gọi googleLogin tự động kích hoạt tài khoản', async () => {
    renderActivatePage('/activate?token=valid_token_123');
    const googleBtn = screen.getByTestId('google-auth-btn');
    fireEvent.click(googleBtn);

    await waitFor(() => {
      expect(mAuth.googleLogin).toHaveBeenCalledWith({ access_token: 'fake_google_token_123' });
    });
  });

  it('mật khẩu không khớp → hiện lỗi validation, không gọi API', async () => {
    renderActivatePage('/activate?token=valid_token_123');
    const inputs = screen.getAllByPlaceholderText(/NewPassword/i);
    // input 1: new password, input 2: confirm password
    fireEvent.change(inputs[0], { target: { value: 'Secret123' } });
    fireEvent.change(inputs[1], { target: { value: 'Mismatch456' } });

    fireEvent.click(screen.getByRole('button', { name: 'activate.activateButton' }));

    await waitFor(() => {
      expect(screen.getByText('auth.passwordMismatch')).toBeInTheDocument();
      expect(mApi.activateAccount).not.toHaveBeenCalled();
    });
  });

  it('mật khẩu hợp lệ → gọi activateAccount({ token, password }) và hiện màn hình thành công', async () => {
    mApi.activateAccount.mockResolvedValueOnce({ data: { username: 'nhanvien' } });

    renderActivatePage('/activate?token=valid_token_123');
    const inputs = screen.getAllByPlaceholderText(/NewPassword/i);
    fireEvent.change(inputs[0], { target: { value: 'Secret123' } });
    fireEvent.change(inputs[1], { target: { value: 'Secret123' } });

    fireEvent.click(screen.getByRole('button', { name: 'activate.activateButton' }));

    await waitFor(() => {
      expect(mApi.activateAccount).toHaveBeenCalledWith({
        token: 'valid_token_123',
        password: 'Secret123',
      });
      expect(screen.getByText('activate.successTitle')).toBeInTheDocument();
      expect(screen.getByText('activate.loginNow')).toBeInTheDocument();
    });
  });
});
