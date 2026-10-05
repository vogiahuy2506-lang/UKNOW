import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AccountProfileModal from '../AccountProfileModal';

const stableT = (key, params) => {
  if (params && Object.keys(params).length > 0) return `${key}:${JSON.stringify(params)}`;
  return key;
};
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: stableT }) }));

const mockAuthStore = vi.fn();
vi.mock('../../../../stores/authStore', () => ({
  useAuthStore: () => mockAuthStore(),
}));

const authApi = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
  getUserConsentHistory: vi.fn(),
}));
vi.mock('../../services/authApi.service', () => authApi);

vi.mock('../TwoFactorSecurityTab', () => ({
  default: () => <div data-testid="two-factor-security-tab">MockTwoFactorSecurityTab</div>,
}));

vi.mock('../../billing/PlanSection', () => ({
  default: () => <div data-testid="plan-section">MockPlanSection</div>,
}));

vi.mock('../../billing/OrderHistoryTab', () => ({
  default: () => <div data-testid="order-history-tab">MockOrderHistoryTab</div>,
}));

vi.mock('../PhoneRequiredModal', () => ({
  default: () => null,
}));

describe('AccountProfileModal', () => {
  const defaultUser = {
    id: 1,
    username: 'testuser',
    fullName: 'Nguyễn Văn A',
    email: 'user@example.com',
    phone: '0844795999',
    role: 'user',
    referralCode: 'MHKYTYC2',
  };

  const defaultConsents = [
    { purpose: 'terms', granted: true, documentVersion: '2026-09-29', createdAt: '2026-09-29T10:00:00.000Z' },
    { purpose: 'privacy', granted: true, documentVersion: '2026-09-29', createdAt: '2026-09-29T10:00:00.000Z' },
    { purpose: 'dpa', granted: true, documentVersion: '2026-09-29', createdAt: '2026-09-29T10:00:00.000Z' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthStore.mockReturnValue({
      user: defaultUser,
      updateUser: vi.fn(),
      activeContext: null,
      fetchAiCredits: vi.fn(),
      syncBillingFromProfile: vi.fn(),
      phoneOtpEnabled: false,
    });
    authApi.getMyProfile.mockResolvedValue({
      data: {
        ...defaultUser,
        activePlanId: 'pro',
      },
    });
    authApi.getUserConsentHistory.mockResolvedValue({
      data: defaultConsents,
    });
  });

  it('tab Hồ sơ: KHÔNG còn phần mã giới thiệu & link chia sẻ, KHÔNG có lịch sử đồng ý điều khoản', async () => {
    render(<AccountProfileModal isOpen={true} onClose={vi.fn()} />);

    // Chờ profile load xong
    await waitFor(() => {
      expect(screen.getByDisplayValue('Nguyễn Văn A')).toBeInTheDocument();
    });

    // Xác nhận KHÔNG có các phần tử mã giới thiệu
    expect(screen.queryByText('accountProfileModal.affiliateTitle')).not.toBeInTheDocument();
    expect(screen.queryByText('accountProfileModal.referralCodeLabel')).not.toBeInTheDocument();
    expect(screen.queryByText('MHKYTYC2')).not.toBeInTheDocument();
    expect(screen.queryByText('accountProfileModal.referralLinkLabel')).not.toBeInTheDocument();

    // Xác nhận KHÔNG có phần lịch sử điều khoản ở tab Hồ sơ
    expect(screen.queryByText('accountProfileModal.consentHistoryTitle')).not.toBeInTheDocument();
    expect(screen.queryByText('accountProfileModal.consentDocTerms')).not.toBeInTheDocument();
  });

  it('tab Bảo mật: chứa cả xác thực 2 lớp VÀ Lịch sử đồng ý điều khoản & xử lý dữ liệu', async () => {
    render(<AccountProfileModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Nguyễn Văn A')).toBeInTheDocument();
    });

    // Chuyển sang tab Bảo mật
    const securityTabButton = screen.getByRole('button', { name: 'accountProfileModal.tabSecurity' });
    fireEvent.click(securityTabButton);

    // Xác nhận có component 2FA
    expect(screen.getByTestId('two-factor-security-tab')).toBeInTheDocument();

    // Xác nhận có phần Lịch sử đồng ý điều khoản & xử lý dữ liệu
    expect(screen.getByText('accountProfileModal.consentHistoryTitle')).toBeInTheDocument();
    expect(screen.getByText('accountProfileModal.consentDocTerms')).toBeInTheDocument();
    expect(screen.getByText('accountProfileModal.consentDocPrivacy')).toBeInTheDocument();
    expect(screen.getByText('accountProfileModal.consentDocDpa')).toBeInTheDocument();

    // Xác nhận link văn bản và trạng thái đồng ý
    const docLinks = screen.getAllByText('accountProfileModal.viewDocLink');
    expect(docLinks.length).toBe(3);
    expect(screen.getAllByText('accountProfileModal.consentGranted').length).toBe(3);

    // Xác nhận có thông điệp minh bạch về việc rút lại đồng ý
    expect(screen.getByText(/accountProfileModal\.consentWithdrawalNotice/)).toBeInTheDocument();
  });
});
