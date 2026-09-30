import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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
const { mockGetMembers, mockGetPlans, mockGetSummary } = vi.hoisted(() => ({
  mockGetMembers: vi.fn(),
  mockGetPlans: vi.fn(),
  mockGetSummary: vi.fn(),
}));

vi.mock('../../features/admin/services/adminMembersApi.service', () => ({
  default: {
    getMembers: mockGetMembers,
    getSummary: mockGetSummary,
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
    mockGetSummary.mockResolvedValue({ data: { data: null } });
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

// fix/goi-giu-cho-admin, Việc 3 — gói giữ chỗ "Tùy chọn"/"Liên hệ" không gán được nữa (backend trả 400
// PLACEHOLDER_PLAN_NOT_ASSIGNABLE), nên phải loại khỏi dropdown "Chọn gói" trong modal Gán gói — chọn nó
// giờ chỉ dẫn tới lỗi. Bộ lọc DANH SÁCH THÀNH VIÊN theo gói (select riêng, phía trên bảng) KHÔNG bị đụng vì
// vẫn cần tìm ra những user đang mắc kẹt ở gói này.
describe('AdminMembersPage — dropdown gán gói loại gói giữ chỗ "Tùy chọn"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSummary.mockResolvedValue({ data: { data: null } });
    authState.phoneOtpEnabled = false;
  });

  it('gói giữ chỗ (code custom, isCustom=false) không có trong dropdown gán gói; gói thường vẫn còn', async () => {
    mockGetMembers.mockResolvedValue(membersResponse([verifiedMember]));
    mockGetPlans.mockResolvedValue({
      data: {
        data: [
          { id: 18, name: 'Gói Tùy chọn', code: 'custom', isCustom: false, price: 0, isActive: true },
          { id: 5, name: 'Pro', code: 'pro', isCustom: false, price: 500000, isActive: true },
        ],
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText(verifiedMember.email)).toBeInTheDocument());

    const row = screen.getByText(verifiedMember.email).closest('tr');
    const assignButton = within(row).getAllByRole('button')[0];
    fireEvent.click(assignButton);

    // getByText('Gán gói dịch vụ') khớp CẢ tooltip ẩn của nút lẫn tiêu đề modal — dùng role heading
    // để chỉ trúng modal.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Gán gói dịch vụ' })).toBeInTheDocument());

    const selects = screen.getAllByRole('combobox');
    const planSelect = selects.find((el) =>
      Array.from(el.options).some((o) => o.textContent === '-- Chọn gói --')
    );
    const optionValues = Array.from(planSelect.options).map((o) => o.value);
    expect(optionValues).not.toContain('18');
    expect(optionValues).toContain('5');
  });
});

// PR-9 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30) — đầu trang 5 số, danh sách mặc định chỉ khách, bỏ cột "% AI" /
// "Gửi lỗi 30 ngày", "nguy cơ" kèm lý do chữ.
describe('AdminMembersPage — PR-9: đầu trang, nhóm, cột, lý do nguy cơ', () => {
  const summary = {
    customers: 8, paying: 4, trial: 3, expiring7d: 1, expiring7dPaying: 1, expired30d: 1, employees: 2, internal: 1, deleted: 1,
  };
  const riskMember = {
    id: 12,
    username: 'idle_user',
    fullName: 'Lê Văn C',
    email: 'c@test.local',
    status: 'active',
    segment: 'customer',
    planState: 'trial',
    employeeCount: 0,
    churnRisk: true,
    churnRiskReason: 'inactive_21d',
    lastActivityAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const deletedMember = {
    id: 13,
    username: 'gone',
    fullName: 'Đã Gỡ',
    email: 'freed+13@deleted.local',
    status: 'deleted',
    segment: 'deleted',
    planState: 'none',
    employeeCount: 0,
    churnRisk: false,
    churnRiskReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authState.phoneOtpEnabled = false;
    mockGetPlans.mockResolvedValue({ data: { data: [] } });
    mockGetSummary.mockResolvedValue({ data: { data: summary } });
    mockGetMembers.mockResolvedValue(membersResponse([riskMember, deletedMember]));
  });

  it('hiện đúng 5 thẻ đầu trang với số từ API', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('members-summary-customers')).toBeInTheDocument());
    const value = (key) => within(screen.getByTestId(`members-summary-${key}`)).getByText(/^\d+$/).textContent;
    expect(value('customers')).toBe('8');
    expect(value('paying')).toBe('4');
    expect(value('trial')).toBe('3');
    expect(value('expiring7d')).toBe('1');
    expect(value('expired30d')).toBe('1');
    const labels = ['Khách', 'Đang trả tiền', 'Đang dùng thử', 'Sắp hết hạn 7 ngày', 'Đã hết hạn 30 ngày'];
    labels.forEach((label) => expect(screen.getAllByText(label).length).toBeGreaterThan(0));
    expect(screen.getByText('Trong đó trả tiền: 1')).toBeInTheDocument();
  });

  it('lần tải đầu gọi API với segment=customer (mặc định chỉ khách), không kèm planState', async () => {
    renderPage();
    await waitFor(() => expect(mockGetMembers).toHaveBeenCalledTimes(1));
    expect(mockGetMembers).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'user', segment: 'customer' }));
    expect(mockGetMembers.mock.calls[0][0]).not.toHaveProperty('planState');
  });

  it('bấm thẻ "Đang trả tiền" → lọc planState=paying; bấm lại → bỏ lọc', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('members-summary-paying')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('members-summary-paying'));
    await waitFor(() => expect(mockGetMembers).toHaveBeenLastCalledWith(
      expect.objectContaining({ segment: 'customer', planState: 'paying' })
    ));
    fireEvent.click(screen.getByTestId('members-summary-paying'));
    await waitFor(() => expect(mockGetMembers).toHaveBeenCalledTimes(3));
    expect(mockGetMembers.mock.calls[2][0]).not.toHaveProperty('planState');
  });

  it('bộ lọc nhóm ghi số của từng nhóm và gửi segment tương ứng', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Nhân viên (2)' })).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'Nội bộ (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Đã xoá (1)' })).toBeInTheDocument();
    const select = screen.getByRole('option', { name: 'Nhân viên (2)' }).closest('select');
    fireEvent.change(select, { target: { value: 'employee' } });
    await waitFor(() => expect(mockGetMembers).toHaveBeenLastCalledWith(expect.objectContaining({ segment: 'employee' })));
  });

  it('không còn cột "% AI" và "Fail 30d"; có "Hoạt động gần nhất"', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('c@test.local')).toBeInTheDocument());
    expect(screen.queryByText('% AI')).not.toBeInTheDocument();
    expect(screen.queryByText('Fail 30d')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Hoạt động gần nhất' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Đăng nhập gần nhất' })).not.toBeInTheDocument();
  });

  it('"Nguy cơ" kèm lý do bằng chữ; tài khoản đã xoá hiện "Đã gỡ", không phải "Đã khóa"', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('c@test.local')).toBeInTheDocument());
    expect(screen.getByText('Nguy cơ')).toBeInTheDocument();
    expect(screen.getByText('Hơn 21 ngày không hoạt động')).toBeInTheDocument();
    const goneRow = screen.getByText('freed+13@deleted.local').closest('tr');
    expect(within(goneRow).getByText('Đã gỡ')).toBeInTheDocument();
    expect(within(goneRow).queryByText('Đã khóa')).not.toBeInTheDocument();
  });

  it('tab Admin: ẩn thẻ đầu trang và bộ lọc nhóm, không gửi segment', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('members-summary-customers')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Admin' }));
    await waitFor(() => expect(mockGetMembers).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'admin' })));
    expect(mockGetMembers.mock.calls[mockGetMembers.mock.calls.length - 1][0]).not.toHaveProperty('segment');
    expect(screen.queryByTestId('members-summary-customers')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Nhân viên (2)' })).not.toBeInTheDocument();
  });
});
