/**
 * PLAN_SUA_SAU_NGHIEM_THU_2026-09-29 mục 1.A — chân modal cố định (nút Lưu quyền hạn/Lưu giới hạn
 * đứng ngoài vùng cuộn) + hộp xác nhận khi đóng modal lúc còn thay đổi chưa lưu.
 * Khuôn render/mocks theo EmployeeManagement.spec.jsx cùng thư mục.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../i18n', async () => (await import('../../../test/realI18n.js')).realI18nModule());

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), custom: vi.fn(), dismiss: vi.fn() });
  return { default: toast };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('../../../features/users/services/userManagementApi.service', () => ({
  default: {
    getEmployees: vi.fn(),
    getTeamOverview: vi.fn(),
    getCampaignApprovalThreshold: vi.fn(),
    inviteEmployee: vi.fn(),
    createEmployee: vi.fn(),
    linkEmployee: vi.fn(),
    updateEmployeeInfo: vi.fn(),
    updateEmployeeStatus: vi.fn(),
    updateEmployeePermissions: vi.fn(),
    updateSendLimits: vi.fn(),
    resetEmployeePassword: vi.fn(),
    resendInvite: vi.fn(),
    deleteEmployee: vi.fn(),
  },
}));
vi.mock('../../../features/auth/services/authApi.service', () => ({
  getMyProfile: vi.fn(() => Promise.resolve({ data: {} })),
}));

import api from '../../../features/users/services/userManagementApi.service';
import EmployeeManagement from '../EmployeeManagement';

const makeEmployee = (overrides = {}) => ({
  id: '12',
  username: 'nv01',
  email: 'nv01@example.com',
  fullName: 'Nhân Viên Một',
  status: 'active',
  memberStatus: 'active',
  permissions: {},
  joinedAt: '2026-09-20T09:00:00.000Z',
  dailyEmailLimit: null,
  monthlyEmailLimit: null,
  dailyZaloLimit: null,
  monthlyZaloLimit: null,
  origin: 'created',
  acceptedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const ok = (data, extra = {}) => Promise.resolve({ data: { success: true, data, ...extra } });

const setEmployees = (list) => {
  api.getEmployees.mockReset();
  api.getEmployees.mockResolvedValue({ data: { success: true, data: list } });
};

const renderPage = async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><EmployeeManagement /></MemoryRouter>);
  await waitFor(() => expect(api.getEmployees).toHaveBeenCalled());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return user;
};

/** Dựng trang với đúng một nhân viên, mở nhân viên đó rồi sang tab Phân quyền. */
const openPermissionsTab = async (emp = makeEmployee()) => {
  setEmployees([emp]);
  const user = await renderPage();
  await user.click(await screen.findByText(emp.username));
  await user.click(await screen.findByRole('button', { name: 'Phân quyền' }));
  await screen.findByRole('button', { name: 'Lưu quyền hạn' });
  return user;
};

/**
 * Modal chi tiết nhân viên có 2 nút cùng tên "Đóng" (nút thật trên header + nút nền tối
 * aria-label="Đóng") — `getByRole('button', {name:'Đóng'})` trên toàn trang bị mơ hồ. Khoanh vùng
 * trong panel modal (tìm qua nút "Lưu quyền hạn") để luôn bấm đúng nút Đóng thật trên header.
 */
const getEmployeeModalPanel = () => screen.getByRole('button', { name: 'Lưu quyền hạn' }).closest('.rounded-xl');
const clickCloseButton = async (user) => {
  const panel = getEmployeeModalPanel();
  await user.click(within(panel).getByRole('button', { name: 'Đóng' }));
};

const realConsoleError = console.error;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    if (String(args[0]).includes('not wrapped in act')) return;
    realConsoleError(...args);
  });
});
afterAll(() => {
  console.error.mockRestore();
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getTeamOverview.mockResolvedValue({ data: { data: [] } });
  api.getCampaignApprovalThreshold.mockResolvedValue({ data: { data: { threshold: null } } });
});

describe('EmployeeManagement — chân modal cố định + hộp xác nhận thay đổi chưa lưu', () => {
  it('(a) nút "Lưu quyền hạn" đứng NGOÀI vùng cuộn (không phải con của .overflow-y-auto)', async () => {
    await openPermissionsTab();

    const saveBtn = screen.getByRole('button', { name: 'Lưu quyền hạn' });
    expect(saveBtn.closest('.overflow-y-auto')).toBeNull();
  });

  it('(b) bấm preset "Tất cả" → hiện dòng gợi ý, API updateEmployeePermissions CHƯA được gọi', async () => {
    const user = await openPermissionsTab();

    expect(screen.queryByText('Đã tick — bấm Lưu quyền hạn để áp dụng.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tất cả' }));

    expect(screen.getByText('Đã tick — bấm Lưu quyền hạn để áp dụng.')).toBeInTheDocument();
    expect(api.updateEmployeePermissions).not.toHaveBeenCalled();
  });

  it('(c) dirty + bấm Đóng → hộp xác nhận hiện, modal chưa đóng; "Bỏ thay đổi" → đóng, API không gọi', async () => {
    const user = await openPermissionsTab();
    await user.click(screen.getByRole('button', { name: 'Tất cả' }));

    await clickCloseButton(user);

    expect(await screen.findByRole('heading', { name: 'Có thay đổi chưa lưu' })).toBeInTheDocument();
    // Modal nhân viên vẫn còn (nút Lưu quyền hạn còn trong DOM).
    expect(screen.getByRole('button', { name: 'Lưu quyền hạn' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Bỏ thay đổi' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Lưu quyền hạn' })).not.toBeInTheDocument());
    expect(api.updateEmployeePermissions).not.toHaveBeenCalled();
  });

  it('(d) dirty + Đóng + "Lưu rồi đóng" → API gọi 1 lần với đúng object quyền, modal đóng', async () => {
    const user = await openPermissionsTab();
    api.updateEmployeePermissions.mockReturnValue(ok({ permissions: {} }));
    await user.click(screen.getByRole('button', { name: 'Chỉ xem' }));

    await clickCloseButton(user);
    await screen.findByRole('heading', { name: 'Có thay đổi chưa lưu' });
    await user.click(screen.getByRole('button', { name: 'Lưu rồi đóng' }));

    await waitFor(() => expect(api.updateEmployeePermissions).toHaveBeenCalledTimes(1));
    const [id, sent] = api.updateEmployeePermissions.mock.calls[0];
    expect(id).toBe('12');
    const granted = Object.entries(sent).filter(([, v]) => v === true).map(([k]) => k).sort();
    expect(granted).toEqual(['campaigns_view', 'customers', 'leads', 'reports_view']);

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Lưu quyền hạn' })).not.toBeInTheDocument());
  });

  it('(e) không dirty + bấm Đóng → đóng ngay, không hộp xác nhận', async () => {
    const user = await openPermissionsTab();

    await clickCloseButton(user);

    expect(screen.queryByText('Có thay đổi chưa lưu')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Lưu quyền hạn' })).not.toBeInTheDocument());
  });

  it('(f) lưu thành công → dirty về false (dòng gợi ý biến mất)', async () => {
    const emp = makeEmployee();
    const user = await openPermissionsTab(emp);
    api.updateEmployeePermissions.mockReturnValue(ok({ permissions: { campaigns_view: true } }));
    // handleSavePermissions gọi fetchEmployees(true) sau khi lưu — mô phỏng backend trả permissions
    // ĐÃ CẬP NHẬT để selectedEmployee đồng bộ với permState, đúng cơ chế thật (:220 setSelectedEmployee(updated)).
    api.getEmployees.mockResolvedValueOnce({ data: { success: true, data: [{ ...emp, permissions: { campaigns_view: true } }] } });
    await user.click(screen.getByRole('button', { name: 'Tất cả' }));
    expect(screen.getByText('Đã tick — bấm Lưu quyền hạn để áp dụng.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Lưu quyền hạn' }));

    await waitFor(() => expect(screen.queryByText('Đã tick — bấm Lưu quyền hạn để áp dụng.')).not.toBeInTheDocument());
  });

  // Đột biến (iii) trong lệnh giao: so dirty bằng JSON.stringify sẽ SAI khi backend trả permissions
  // với thứ tự khoá khác thứ tự permState build ra — ca này ghim đúng hành vi so TỪNG KHOÁ. Phải
  // cùng NỘI DUNG (cùng bộ true/false) và cùng ĐỦ 24 khoá, chỉ khác THỨ TỰ chèn — nếu để
  // permissions gốc là object thưa (thiếu khoá), JSON.stringify khác nhau vì SỐ khoá khác nhau
  // (không phải vì thứ tự), không cô lập được đúng lỗi mà đột biến (iii) gây ra.
  it('permissions gốc ĐỦ 24 khoá nhưng chèn NGƯỢC thứ tự so với "Chỉ xem" build ra → vẫn KHÔNG dirty (so từng khoá, không so chuỗi)', async () => {
    const ALL_KEYS_IN_BUILD_ORDER = [
      'email_settings', 'zalo_settings', 'email_templates', 'zalo_templates', 'courses', 'landing_pages',
      'campaigns_view', 'campaigns_create', 'campaigns_run', 'customers', 'leads', 'forms',
      'chatbots_manage', 'chatbot_channels_manage', 'inbox_view', 'inbox_reply', 'inbox_manage',
      'media_library_view', 'media_library_manage', 'reports_view', 'ai_assistant_use',
      'marketplace_manage', 'marketplace_purchase', 'integrations_manage',
    ];
    const VIEW_ONLY_KEYS = new Set(['campaigns_view', 'reports_view', 'customers', 'leads']);
    // Cùng nội dung với preset "Chỉ xem" (buildPermissionPreset lặp allKeys theo ALL_KEYS_IN_BUILD_ORDER)
    // nhưng chèn NGƯỢC thứ tự — JSON.stringify của 2 object này khác nhau dù giá trị từng khoá giống hệt.
    const reversedSameContent = {};
    [...ALL_KEYS_IN_BUILD_ORDER].reverse().forEach((k) => { reversedSameContent[k] = VIEW_ONLY_KEYS.has(k); });

    const emp = makeEmployee({ permissions: reversedSameContent });
    const user = await openPermissionsTab(emp);
    expect(screen.queryByText('Đã tick — bấm Lưu quyền hạn để áp dụng.')).not.toBeInTheDocument();

    // Tick lại đúng "Chỉ xem" — buildPermissionPreset dựng permState mới theo ALL_KEYS_IN_BUILD_ORDER
    // (thứ tự XUÔI), cùng nội dung true/false với permissions gốc (thứ tự NGƯỢC) — chỉ khác thứ tự chèn.
    await user.click(screen.getByRole('button', { name: 'Chỉ xem' }));

    expect(screen.queryByText('Đã tick — bấm Lưu quyền hạn để áp dụng.')).not.toBeInTheDocument();
  });
});
