import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Register from '../Register';

/**
 * PR-2 (xác thực SĐT) & PR-B (đăng ký Google không mở hộp đồng ý, gọi googleLogin không gửi consents)
 */
const stableT = (key, params) => {
  if (params && Object.keys(params).length > 0) return `${key}:${JSON.stringify(params)}`;
  return key;
};
vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: stableT }) }));

const m = vi.hoisted(() => ({
  phoneOtpEnabled: false,
  fetchPhoneOtpEnabled: vi.fn().mockResolvedValue(false),
  googleLogin: vi.fn().mockResolvedValue({ data: { user: { id: 1 }, trial: null } }),
  register: vi.fn().mockResolvedValue({ data: { user: { id: 2 }, trial: null } }),
}));

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => (selector ? selector(m) : m),
}));

vi.mock('../../../features/auth/services/authApi.service', () => ({
  sendVerificationCode: vi.fn(),
}));

// GoogleAuthButton stub: cho phép trigger onSuccess với token để test luồng Google
vi.mock('../../../components/GoogleAuthButton', () => ({
  default: ({ onSuccess }) => (
    <button
      type="button"
      data-testid="google-auth-btn"
      onClick={() => onSuccess?.({ access_token: 'fake_google_token_123' })}
    >
      google-auth-stub
    </button>
  ),
}));

const renderRegister = () =>
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );

describe('Register.jsx — ô SĐT theo cờ phoneOtpEnabled & Đăng ký Google (PR-B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('cờ tắt → hiện ô SĐT, bắt buộc (giữ nguyên hành vi hôm nay)', () => {
    m.phoneOtpEnabled = false;

    renderRegister();

    expect(screen.getByPlaceholderText('register.phonePlaceholder')).toBeInTheDocument();
  });

  it('cờ bật → KHÔNG hiện ô SĐT', () => {
    m.phoneOtpEnabled = true;

    renderRegister();

    expect(screen.queryByPlaceholderText('register.phonePlaceholder')).not.toBeInTheDocument();
  });

  it('mount gọi fetchPhoneOtpEnabled() — lưới an toàn thứ hai cạnh lần gọi lúc app khởi động', () => {
    renderRegister();

    expect(m.fetchPhoneOtpEnabled).toHaveBeenCalledTimes(1);
  });

  it('PR-B: đăng ký Google không mở hộp đồng ý, gọi googleLogin trực tiếp không có consents', async () => {
    // Register.jsx chỉ render nút Google khi có VITE_GOOGLE_CLIENT_ID. Máy dev có sẵn trong
    // frontend/.env nên ca này xanh cục bộ, nhưng job test-frontend trên CI không đặt biến
    // này (chỉ bước build của deploy-frontend có) — thiếu stub là đỏ trên CI.
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-google-client-id');
    renderRegister();

    const googleBtn = screen.getByTestId('google-auth-btn');
    fireEvent.click(googleBtn);

    await waitFor(() => {
      expect(m.googleLogin).toHaveBeenCalledTimes(1);
    });

    const callArgs = m.googleLogin.mock.calls[0][0];
    expect(callArgs.access_token).toBe('fake_google_token_123');
    expect(callArgs.consents).toBeUndefined();

    // Xác nhận không có popup đồng ý
    expect(screen.queryByText(/termsConsentTitle/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/termsConsentDesc/i)).not.toBeInTheDocument();
  });

  it('cờ OTP tắt → submit form gọi sendVerificationCode kèm phone', async () => {
    m.phoneOtpEnabled = false;
    const { sendVerificationCode } = await import('../../../features/auth/services/authApi.service');
    sendVerificationCode.mockResolvedValueOnce({ success: true });

    renderRegister();

    fireEvent.change(screen.getByPlaceholderText('register.usernamePlaceholder'), {
      target: { value: 'userotpfalse' },
    });
    fireEvent.change(screen.getByPlaceholderText('register.emailPlaceholder'), {
      target: { value: 'test_otp_false@gmail.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('register.phonePlaceholder'), {
      target: { value: '0912345678' },
    });
    const passwordInputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(passwordInputs[0], { target: { value: 'Password123' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'Password123' } });

    // Một ô đồng ý duy nhất cho cả 3 văn bản
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(1);
    fireEvent.click(checkboxes[0]);

    fireEvent.click(screen.getByText('register.registerButton'));

    await waitFor(() => {
      expect(sendVerificationCode).toHaveBeenCalledTimes(1);
    });

    expect(sendVerificationCode).toHaveBeenCalledWith({
      email: 'test_otp_false@gmail.com',
      username: 'userotpfalse',
      phone: '0912345678',
    });
  });

  it('cờ OTP bật → submit form gọi sendVerificationCode KHÔNG kèm phone', async () => {
    m.phoneOtpEnabled = true;
    const { sendVerificationCode } = await import('../../../features/auth/services/authApi.service');
    sendVerificationCode.mockResolvedValueOnce({ success: true });

    renderRegister();

    fireEvent.change(screen.getByPlaceholderText('register.usernamePlaceholder'), {
      target: { value: 'userotptrue' },
    });
    fireEvent.change(screen.getByPlaceholderText('register.emailPlaceholder'), {
      target: { value: 'test_otp_true@gmail.com' },
    });
    const passwordInputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(passwordInputs[0], { target: { value: 'Password123' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'Password123' } });

    // Một ô đồng ý duy nhất cho cả 3 văn bản
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(1);
    fireEvent.click(checkboxes[0]);

    fireEvent.click(screen.getByText('register.registerButton'));

    await waitFor(() => {
      expect(sendVerificationCode).toHaveBeenCalledTimes(1);
    });

    expect(sendVerificationCode).toHaveBeenCalledWith({
      email: 'test_otp_true@gmail.com',
      username: 'userotptrue',
    });
  });
  describe('một ô đồng ý cho 3 văn bản bắt buộc', () => {
    const fillForm = () => {
      fireEvent.change(screen.getByPlaceholderText('register.usernamePlaceholder'), {
        target: { value: 'userdongy' },
      });
      fireEvent.change(screen.getByPlaceholderText('register.emailPlaceholder'), {
        target: { value: 'dongy@gmail.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('register.phonePlaceholder'), {
        target: { value: '0912345678' },
      });
      const passwordInputs = screen.getAllByPlaceholderText('••••••••');
      fireEvent.change(passwordInputs[0], { target: { value: 'Password123' } });
      fireEvent.change(passwordInputs[1], { target: { value: 'Password123' } });
    };

    it('đúng 1 ô tích, 3 link văn bản mở tab mới', () => {
      m.phoneOtpEnabled = false;
      renderRegister();

      expect(screen.getAllByRole('checkbox')).toHaveLength(1);
      for (const [name, href] of [
        ['auth.termsOfUse', '/terms'],
        ['auth.privacyPolicy', '/privacy-policy'],
        ['auth.publicDPA', '/public-dpa'],
      ]) {
        const link = screen.getByRole('link', { name });
        expect(link).toHaveAttribute('href', href);
        expect(link).toHaveAttribute('target', '_blank');
      }
    });

    it('chưa tích ô nào → không gửi mã xác minh', async () => {
      m.phoneOtpEnabled = false;
      const { sendVerificationCode } = await import('../../../features/auth/services/authApi.service');
      renderRegister();
      fillForm();

      fireEvent.click(screen.getByText('register.registerButton'));

      // chờ một nhịp để handleSubmit (async) chạy xong rồi mới khẳng định "không gọi"
      await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
      expect(sendVerificationCode).not.toHaveBeenCalled();
    });

    it('tích 1 ô → payload đăng ký có đủ 3 khoá consents = true', async () => {
      m.phoneOtpEnabled = false;
      const { sendVerificationCode } = await import('../../../features/auth/services/authApi.service');
      sendVerificationCode.mockResolvedValueOnce({ success: true });
      renderRegister();
      fillForm();

      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByText('register.registerButton'));

      await waitFor(() => {
        expect(sendVerificationCode).toHaveBeenCalledTimes(1);
      });

      // Sang bước nhập OTP: nhập đủ 6 số rồi xác nhận
      const digitInputs = await screen.findAllByRole('textbox');
      expect(digitInputs).toHaveLength(6);
      digitInputs.forEach((input, i) => fireEvent.change(input, { target: { value: String((i % 9) + 1) } }));
      fireEvent.click(screen.getByText('register.confirmButton'));

      await waitFor(() => {
        expect(m.register).toHaveBeenCalledTimes(1);
      });
      expect(m.register.mock.calls[0][0].consents).toEqual({ terms: true, privacy: true, dpa: true });
    });
  });
});
