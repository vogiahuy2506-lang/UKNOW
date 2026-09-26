import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Register from '../Register';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const stableT = (key, params) => {
  if (params && Object.keys(params).length > 0) return `${key}:${JSON.stringify(params)}`;
  return key;
};
vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: stableT }) }));

const m = vi.hoisted(() => ({
  phoneOtpEnabled: false,
  fetchPhoneOtpEnabled: vi.fn().mockResolvedValue(false),
  register: vi.fn(),
  googleLogin: vi.fn(),
  switchContext: vi.fn(),
  user: null,
  activeContext: null,
}));

vi.mock('../../../stores/authStore', () => {
  const store = (selector) => (selector ? selector(m) : m);
  store.getState = () => m;
  return { useAuthStore: store };
});

const mockGetInvitationInfo = vi.fn();
const mockSendVerificationCode = vi.fn();

vi.mock('../../../features/auth/services/authApi.service', () => ({
  sendVerificationCode: (...args) => mockSendVerificationCode(...args),
  getInvitationInfo: (...args) => mockGetInvitationInfo(...args),
}));

vi.mock('../../../components/GoogleAuthButton', () => ({
  default: () => <button type="button">google-auth-stub</button>,
}));

const renderRegister = (initialUrl = '/register') =>
  render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/register" element={<Register />} />
      </Routes>
    </MemoryRouter>
  );

const fillAndSubmitInviteForm = () => {
  fireEvent.change(screen.getByPlaceholderText('register.usernamePlaceholder'), {
    target: { value: 'nhanvienmoi' },
  });
  fireEvent.change(screen.getByPlaceholderText('register.fullNamePlaceholder'), {
    target: { value: 'Nguyen Van Nhan Vien' },
  });
  fireEvent.change(screen.getByPlaceholderText('register.phonePlaceholder'), {
    target: { value: '0912345678' },
  });
  const passwordInputs = screen.getAllByPlaceholderText('••••••••');
  fireEvent.change(passwordInputs[0], {
    target: { value: 'Password123' },
  });
  fireEvent.change(passwordInputs[1], {
    target: { value: 'Password123' },
  });
  const checkboxes = screen.getAllByRole('checkbox');
  checkboxes.forEach((cb) => fireEvent.click(cb));
  const submitBtn = screen.getByText('Hoàn tất đăng ký & Kích hoạt');
  fireEvent.click(submitBtn);
};

describe('Register.jsx — luồng kích hoạt / đăng ký nhân viên được mời (inviteToken)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.phoneOtpEnabled = false;
    m.user = null;
    m.activeContext = null;
    m.switchContext = vi.fn().mockImplementation(async (ownerId) => {
      m.activeContext = { type: 'employee', ownerId };
    });
    m.register = vi.fn().mockResolvedValue({ data: { user: { id: 50 }, trial: null } });
  });

  it('có invite và email trong query param → điền sẵn email, khóa email, hiện banner mời, ẩn stepper 2 bước', () => {
    renderRegister('/register?email=nhanvien%40example.com&invite=inv_token_999');

    expect(screen.getByText(/Hoàn tất đăng ký thành viên được mời/i)).toBeInTheDocument();
    const emailInput = screen.getByPlaceholderText('register.emailPlaceholder');
    expect(emailInput.value).toBe('nhanvien@example.com');
    expect(emailInput).toHaveAttribute('readOnly');
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.getByText('Hoàn tất đăng ký & Kích hoạt')).toBeInTheDocument();
  });

  it('chỉ có invite trong query param → gọi getInvitationInfo để lấy email tự động', async () => {
    mockGetInvitationInfo.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          email: 'auto_nv@example.com',
          ownerName: 'Anh Quản Lý',
        },
      },
    });

    renderRegister('/register?invite=inv_token_auto');

    expect(mockGetInvitationInfo).toHaveBeenCalledWith('inv_token_auto');
    await waitFor(() => {
      const emailInput = screen.getByPlaceholderText('register.emailPlaceholder');
      expect(emailInput.value).toBe('auto_nv@example.com');
      expect(emailInput).toHaveAttribute('readOnly');
    });
    expect(screen.getByText(/Anh Quản Lý/i)).toBeInTheDocument();
  });

  it('submit form khi có inviteToken → gửi thẳng registerUser kèm inviteToken, không gửi OTP', async () => {
    renderRegister('/register?email=nhanvien%40example.com&invite=inv_token_999');

    fireEvent.change(screen.getByPlaceholderText('register.usernamePlaceholder'), {
      target: { value: 'nhanvienmoi' },
    });
    fireEvent.change(screen.getByPlaceholderText('register.fullNamePlaceholder'), {
      target: { value: 'Nguyen Van Nhan Vien' },
    });
    fireEvent.change(screen.getByPlaceholderText('register.phonePlaceholder'), {
      target: { value: '0912345678' },
    });
    const passwordInputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(passwordInputs[0], {
      target: { value: 'Password123' },
    });
    fireEvent.change(passwordInputs[1], {
      target: { value: 'Password123' },
    });

    // Check 3 ô điều khoản
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((cb) => fireEvent.click(cb));

    const submitBtn = screen.getByText('Hoàn tất đăng ký & Kích hoạt');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(m.register).toHaveBeenCalledTimes(1);
    });

    expect(mockSendVerificationCode).not.toHaveBeenCalled();

    const callPayload = m.register.mock.calls[0][0];
    expect(callPayload).toEqual(
      expect.objectContaining({
        username: 'nhanvienmoi',
        email: 'nhanvien@example.com',
        fullName: 'Nguyen Van Nhan Vien',
        phone: '0912345678',
        password: 'Password123',
        inviteToken: 'inv_token_999',
        consents: { terms: true, privacy: true, dpa: true },
      })
    );
  });

  it('ca a: đăng ký qua lời mời, response có trial + memberships [{ ownerId: "39" }] → switchContext gọi với "39" TRƯỚC navigate, navigate tới "/app"', async () => {
    m.register.mockImplementation(async () => {
      m.user = {
        id: 50,
        active_plan_id: 1,
        memberships: [{ ownerId: '39', isLocked: false, permissions: ['campaign.view'] }],
      };
      return { data: { user: m.user, trial: { durationDays: 14 } } };
    });

    renderRegister('/register?email=nhanvien%40example.com&invite=inv_token_999');
    fillAndSubmitInviteForm();

    await waitFor(() => {
      expect(m.register).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(m.switchContext).toHaveBeenCalledWith('39');
      expect(mockNavigate).toHaveBeenCalledWith('/app');
    });

    expect(m.switchContext.mock.invocationCallOrder[0]).toBeLessThan(mockNavigate.mock.invocationCallOrder[0]);
  });

  it('ca b: membership đầu bị khoá (isLocked) + membership thứ hai mở → chọn membership thứ hai', async () => {
    m.register.mockImplementation(async () => {
      m.user = {
        id: 50,
        active_plan_id: 1,
        memberships: [
          { ownerId: '10', isLocked: true, permissions: [] },
          { ownerId: '42', isLocked: false, permissions: ['campaign.view'] },
        ],
      };
      return { data: { user: m.user, trial: { durationDays: 14 } } };
    });

    renderRegister('/register?email=nhanvien%40example.com&invite=inv_token_999');
    fillAndSubmitInviteForm();

    await waitFor(() => {
      expect(m.register).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(m.switchContext).toHaveBeenCalledWith('42');
      expect(mockNavigate).toHaveBeenCalledWith('/app');
    });
  });

  it('ca c: không có membership → KHÔNG gọi switchContext', async () => {
    m.register.mockImplementation(async () => {
      m.user = {
        id: 50,
        active_plan_id: 1,
        memberships: [],
      };
      return { data: { user: m.user, trial: { durationDays: 14 } } };
    });

    renderRegister('/register?email=nhanvien%40example.com&invite=inv_token_999');
    fillAndSubmitInviteForm();

    await waitFor(() => {
      expect(m.register).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });

    expect(m.switchContext).not.toHaveBeenCalled();
  });
});
