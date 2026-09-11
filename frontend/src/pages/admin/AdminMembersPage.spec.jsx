import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import AdminMembersPage from './AdminMembersPage';

/**
 * PR-3 (xác thực SĐT, admin) — _internal/PLAN_XAC_THUC_SDT_OTP_2026-09-11.md mục 4 PR-3
 * việc 4. Theo khuôn sẵn có của thư mục này (AdminOrdersPage.spec.jsx,
 * AdminWelcomeEmailPage.spec.jsx): I18nProvider THẬT, chỉ mock service gọi API + authStore
 * (trang này cần currentUser/phoneOtpEnabled, hai file kia không dùng authStore nên không
 * có tiền lệ để soi — mock ở đây theo đúng khuôn PR-2 (selector lẫn no-arg đều gọi được).
 */
const { mockGetMembers, mockGetPlans } = vi.hoisted(() => ({
  mockGetMembers: vi.fn(),
  mockGetPlans: vi.fn(),
}));

vi.mock('../../features/admin/services/adminMembersApi.service', () => ({
  default: {
    getMembers: mockGetMembers,
    toggleStatus: vi.fn(),
    promote: vi.fn(),
    demote: vi.fn(),
    detachEmail: vi.fn(),
    purge: vi.fn(),
  },
}));

vi.mock('../../features/admin/services/adminPlansApi.service', () => ({
  default: {
    getPlans: mockGetPlans,
    removeUserPlan: vi.fn(),
  },
}));

const authState = vi.hoisted(() => ({
  user: { id: 1, role: 'admin' },
  phoneOtpEnabled: false,
}));

vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector) => (selector ? selector(authState) : authState),
}));

function membersResponse(members) {
  return { data: { data: members } };
}

const verifiedMember = {
  id: 10,
  username: 'has_verified',
  fullName: 'Nguyễn Văn A',
  email: 'a@test.local',
  status: 'active',
  employeeCount: 0,
  phone: '0912345678',
  phoneVerifiedAt: '2026-09-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const unverifiedMember = {
  id: 11,
  username: 'has_unverified',
  fullName: 'Trần Thị B',
  email: 'b@test.local',
  status: 'active',
  employeeCount: 0,
  phone: '0987654321',
  phoneVerifiedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const renderPage = () =>
  render(
    <I18nProvider>
      <AdminMembersPage />
    </I18nProvider>
  );

describe('AdminMembersPage — cột SĐT theo cờ phoneOtpEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlans.mockResolvedValue({ data: { data: [] } });
    authState.phoneOtpEnabled = false;
  });

  it('cờ tắt → chỉ hiện số trần, KHÔNG có nhãn xác thực, KHÔNG có bộ lọc SĐT', async () => {
    mockGetMembers.mockResolvedValue(membersResponse([verifiedMember, unverifiedMember]));

    renderPage();

    await waitFor(() => expect(screen.getByText('0912345678')).toBeInTheDocument());
    expect(screen.getByText('0987654321')).toBeInTheDocument();

    // Không nhãn xác thực dù dữ liệu backend có phoneVerifiedAt.
    expect(screen.queryByText(/Đã xác thực/)).not.toBeInTheDocument();
    expect(screen.queryByText('Chưa xác thực')).not.toBeInTheDocument();
    // Không có option bộ lọc SĐT.
    expect(screen.queryByText('SĐT: Tất cả')).not.toBeInTheDocument();
  });

  it('cờ bật → hiện nhãn "Đã xác thực · ngày" / "Chưa xác thực" + bộ lọc SĐT', async () => {
    authState.phoneOtpEnabled = true;
    mockGetMembers.mockResolvedValue(membersResponse([verifiedMember, unverifiedMember]));

    renderPage();

    await waitFor(() => expect(screen.getByText('0912345678')).toBeInTheDocument());
    // Dấu "·" chỉ có ở nhãn trong bảng, phân biệt với option lọc "SĐT: Đã xác thực".
    expect(screen.getByText(/Đã xác thực ·/)).toBeInTheDocument();
    expect(screen.getByText('Chưa xác thực')).toBeInTheDocument();

    // Bộ lọc "SĐT: ..." xuất hiện cạnh bộ lọc gói.
    expect(screen.getByText('SĐT: Tất cả')).toBeInTheDocument();
    expect(screen.getByText('SĐT: Đã xác thực')).toBeInTheDocument();
    expect(screen.getByText('SĐT: Chưa xác thực')).toBeInTheDocument();
  });

  it('cờ bật, chọn bộ lọc "Đã xác thực" rồi tìm → gọi API kèm phoneVerified=verified', async () => {
    authState.phoneOtpEnabled = true;
    mockGetMembers.mockResolvedValue(membersResponse([verifiedMember]));

    renderPage();

    await waitFor(() => expect(mockGetMembers).toHaveBeenCalledTimes(1));

    const selects = screen.getAllByRole('combobox');
    // Thứ tự render: gói, SĐT, trạng thái, hạn — chọn đúng select có option "SĐT: Đã xác thực".
    const phoneSelect = selects.find((el) =>
      Array.from(el.options).some((o) => o.textContent === 'SĐT: Đã xác thực')
    );
    fireEvent.change(phoneSelect, { target: { value: 'verified' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }));

    await waitFor(() => expect(mockGetMembers).toHaveBeenCalledTimes(2));
    expect(mockGetMembers).toHaveBeenLastCalledWith(
      expect.objectContaining({ phoneVerified: 'verified' })
    );
  });
});
