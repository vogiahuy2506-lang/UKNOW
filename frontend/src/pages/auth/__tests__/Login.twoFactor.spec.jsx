import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from '../Login';

const stableT = (key, params) => {
  if (params && Object.keys(params).length > 0) return `${key}:${JSON.stringify(params)}`;
  return key;
};
vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: stableT }) }));

const m = vi.hoisted(() => ({
  sessionCheckFailed: false,
  login: vi.fn(),
  googleLogin: vi.fn(),
  verifyTwoFactor: vi.fn(),
}));

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => (selector ? selector(m) : m),
}));

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toastMock }));

vi.mock('../../../components/GoogleAuthButton', () => ({
  default: () => <button type="button">google-auth-stub</button>,
}));

const challengeResponse = {
  success: true,
  data: { requiresTwoFactor: true, challengeToken: 'chal-123', rememberMe: true, method: 'local' },
};

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Login />
    </MemoryRouter>,
  );

const submitCredentials = async () => {
  fireEvent.change(screen.getByPlaceholderText('auth.usernameLabel'), { target: { value: 'admin' } });
  fireEvent.change(screen.getByPlaceholderText('auth.password'), { target: { value: 'pw12345' } });
  fireEvent.click(screen.getByRole('button', { name: 'auth.loginButton' }));
  await screen.findByText('twoFactor.loginTitle');
};

describe('Login.jsx — bước xác thực hai lớp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.login.mockResolvedValue(challengeResponse);
  });

  it('login trả requiresTwoFactor → hiện bước nhập mã, KHÔNG toast thành công, KHÔNG điều hướng', async () => {
    renderLogin();
    await submitCredentials();

    expect(screen.getByLabelText('twoFactor.codeLabel')).toBeInTheDocument();
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('nhập mã đúng → gọi verifyTwoFactor với challengeToken, rồi điều hướng', async () => {
    m.verifyTwoFactor.mockResolvedValue({ success: true, data: { user: { id: 1, role: 'admin' } } });
    renderLogin();
    await submitCredentials();

    fireEvent.change(screen.getByLabelText('twoFactor.codeLabel'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'twoFactor.confirm' }));

    await waitFor(() =>
      expect(m.verifyTwoFactor).toHaveBeenCalledWith({
        challengeToken: 'chal-123',
        code: '123456',
        rememberMe: true,
      }),
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
  });

  it('401 → hiện "Mã không đúng", ở lại bước mã', async () => {
    m.verifyTwoFactor.mockRejectedValue({ response: { status: 401, data: { message: 'x' } } });
    renderLogin();
    await submitCredentials();

    fireEvent.change(screen.getByLabelText('twoFactor.codeLabel'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'twoFactor.confirm' }));

    expect(await screen.findByText('twoFactor.invalidCode')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('403 TWO_FACTOR_LOCKED → hiện đúng thông điệp của server', async () => {
    m.verifyTwoFactor.mockRejectedValue({
      response: { status: 403, data: { code: 'TWO_FACTOR_LOCKED', message: 'Thử lại sau 15 phút', retryAfterSeconds: 900 } },
    });
    renderLogin();
    await submitCredentials();

    fireEvent.change(screen.getByLabelText('twoFactor.codeLabel'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'twoFactor.confirm' }));

    expect(await screen.findByText('Thử lại sau 15 phút')).toBeInTheDocument();
  });

  it('"Dùng mã khôi phục" đổi nhãn ô nhập; "Quay lại" về form mật khẩu', async () => {
    renderLogin();
    await submitCredentials();

    fireEvent.click(screen.getByRole('button', { name: 'twoFactor.useRecovery' }));
    expect(screen.getByLabelText('twoFactor.recoveryCodeLabel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'twoFactor.back' }));
    expect(screen.getByPlaceholderText('auth.usernameLabel')).toBeInTheDocument();
    expect(screen.queryByText('twoFactor.loginTitle')).not.toBeInTheDocument();
  });

  it('login không bật 2FA → toast thành công + điều hướng như cũ', async () => {
    m.login.mockResolvedValue({ success: true, data: { user: { id: 2, role: 'user' } } });
    renderLogin();

    fireEvent.change(screen.getByPlaceholderText('auth.usernameLabel'), { target: { value: 'u' } });
    fireEvent.change(screen.getByPlaceholderText('auth.password'), { target: { value: 'pw12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'auth.loginButton' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    expect(toastMock.success).toHaveBeenCalled();
  });
});
