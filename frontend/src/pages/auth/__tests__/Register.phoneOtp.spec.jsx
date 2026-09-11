import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Register from '../Register';

/**
 * PR-2 (xác thực SĐT) — _internal/PLAN_XAC_THUC_SDT_OTP_2026-09-11.md mục 4 PR-2 việc 9.
 * `t` ổn định giữa các lần render (bài học QuickSend.customContent.spec.jsx, phiên này).
 */
const stableT = (key, params) => {
  if (params && Object.keys(params).length > 0) return `${key}:${JSON.stringify(params)}`;
  return key;
};
vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: stableT }) }));

const m = vi.hoisted(() => ({
  phoneOtpEnabled: false,
  fetchPhoneOtpEnabled: vi.fn().mockResolvedValue(false),
  googleLogin: vi.fn(),
}));

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => (selector ? selector(m) : m),
}));

vi.mock('../../../features/auth/services/authApi.service', () => ({
  sendVerificationCode: vi.fn(),
}));

// GoogleAuthButton dùng @react-oauth/google (cần GoogleOAuthProvider context) — không liên
// quan tới việc test ô SĐT, thay bằng stub để tránh phải dựng provider thật.
vi.mock('../../../components/GoogleAuthButton', () => ({
  default: () => <button type="button">google-auth-stub</button>,
}));

const renderRegister = () =>
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );

describe('Register.jsx — ô SĐT theo cờ phoneOtpEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
