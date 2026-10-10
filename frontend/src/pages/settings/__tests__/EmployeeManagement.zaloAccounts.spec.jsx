/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G1 — tab "Tài khoản Zalo" trong modal nhân viên: chủ chọn tài khoản Zalo
 * nào nhân viên được thấy/dùng. Khuôn render/mocks theo EmployeeManagement.permissionsFooter.spec.jsx cùng thư mục.
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
    getEmployeeChannelAccounts: vi.fn(),
    updateEmployeeChannelAccounts: vi.fn(),
  },
}));
vi.mock('../../../features/auth/services/authApi.service', () => ({
  getMyProfile: vi.fn(() => Promise.resolve({ data: {} })),
}));

import toast from 'react-hot-toast';
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

const zaloAccount = (id, overrides = {}) => ({
  id,
  displayName: `Zalo ${id}`,
  zaloName: '',
  zaloPhone: '',
  status: 'connected',
  isActive: true,
  isDefault: false,
  assigned: false,
  source: null,
  ...overrides,
});

const ok = (data) => Promise.resolve({ data: { success: true, data } });

const renderPage = async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><EmployeeManagement /></MemoryRouter>);
  await waitFor(() => expect(api.getEmployees).toHaveBeenCalled());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return user;
};

/** Dựng trang với một nhân viên, mở nhân viên đó rồi sang tab Tài khoản Zalo (danh sách do `accounts` quyết định). */
const openZaloTab = async (accounts) => {
  api.getEmployees.mockResolvedValue({ data: { success: true, data: [makeEmployee()] } });
  api.getEmployeeChannelAccounts.mockReturnValue(ok({ zaloAccounts: accounts }));
  const user = await renderPage();
  await user.click(await screen.findByText('nv01'));
  await user.click(await screen.findByRole('button', { name: 'Tài khoản kênh' }));
  return user;
};

const panel = () => screen.getByRole('button', { name: 'Lưu tài khoản được giao' }).closest('.rounded-xl');

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

describe('EmployeeManagement — tab Tài khoản Zalo', () => {
  it('mở tab → gọi API đúng nhân viên, hiện giải thích + từng tài khoản; ô đã giao được tick, kèm nhãn nguồn', async () => {
    await openZaloTab([
      zaloAccount(5, { displayName: 'Shop', assigned: true, source: 'legacy', isDefault: true, zaloPhone: '0900000001' }),
      zaloAccount(6, { displayName: 'Gia dinh', assigned: false }),
      zaloAccount(7, { displayName: 'Cua NV', assigned: true, source: 'self_login', status: 'disconnected' }),
    ]);

    expect(api.getEmployeeChannelAccounts).toHaveBeenCalledTimes(1);
    expect(api.getEmployeeChannelAccounts).toHaveBeenCalledWith('12');
    expect(await screen.findByText(/Nhân viên chỉ thấy và dùng được các tài khoản Zalo được chọn ở đây/)).toBeInTheDocument();

    const modal = within(panel());
    expect(await modal.findByText('Shop')).toBeInTheDocument();
    expect(modal.getByText('Mặc định')).toBeInTheDocument();
    expect(modal.getByText('Giữ từ trước')).toBeInTheDocument();
    expect(modal.getByText('Nhân viên tự đăng nhập')).toBeInTheDocument();

    const boxes = modal.getAllByRole('checkbox');
    expect(boxes.map((b) => b.checked)).toEqual([true, false, true]);
    expect(modal.getByText('Đã chọn 2/3 tài khoản')).toBeInTheDocument();
  });

  it('nhân viên chưa được giao gì → có dòng cảnh báo; chưa tick thì chưa dirty', async () => {
    await openZaloTab([zaloAccount(5), zaloAccount(6)]);
    expect(await screen.findByText(/chưa được giao tài khoản Zalo nào/)).toBeInTheDocument();
    expect(screen.queryByText('Có thay đổi chưa lưu')).not.toBeInTheDocument();
  });

  it('tick thêm một tài khoản + Lưu → API nhận ĐÚNG danh sách id; báo thành công; hết dirty', async () => {
    const user = await openZaloTab([
      zaloAccount(5, { displayName: 'Shop', assigned: true, source: 'assigned' }),
      zaloAccount(6, { displayName: 'Ban hang' }),
    ]);
    const modal = within(panel());
    await modal.findByText('Ban hang');

    await user.click(modal.getAllByRole('checkbox')[1]);
    expect(await screen.findByText('Có thay đổi chưa lưu')).toBeInTheDocument();

    api.updateEmployeeChannelAccounts.mockReturnValue(ok({
      zaloAccounts: [
        zaloAccount(5, { displayName: 'Shop', assigned: true, source: 'assigned' }),
        zaloAccount(6, { displayName: 'Ban hang', assigned: true, source: 'assigned' }),
      ],
    }));
    await user.click(screen.getByRole('button', { name: 'Lưu tài khoản được giao' }));

    await waitFor(() => expect(api.updateEmployeeChannelAccounts).toHaveBeenCalledTimes(1));
    const [id, payload] = api.updateEmployeeChannelAccounts.mock.calls[0];
    expect(id).toBe('12');
    expect([...payload.zaloAccountIds].map(Number).sort((a, b) => a - b)).toEqual([5, 6]);
    // Telegram / WhatsApp không đổi → vẫn gửi danh sách hiện có (rỗng ở ca này), không bỏ khoá.
    expect(payload.telegramAccountIds).toEqual([]);
    expect(payload.whatsappSessionKeys).toEqual([]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã cập nhật tài khoản được giao'));
    await waitFor(() => expect(screen.queryByText('Có thay đổi chưa lưu')).not.toBeInTheDocument());
  });

  it('"Bỏ chọn hết" rồi Lưu → gửi mảng rỗng (thu hồi hết); "Chọn tất cả" chọn đủ', async () => {
    const user = await openZaloTab([
      zaloAccount(5, { assigned: true, source: 'assigned' }),
      zaloAccount(6, { assigned: true, source: 'assigned' }),
    ]);
    const modal = within(panel());
    await modal.findByText('Đã chọn 2/2 tài khoản');

    await user.click(modal.getByRole('button', { name: 'Bỏ chọn hết' }));
    expect(modal.getByText('Đã chọn 0/2 tài khoản')).toBeInTheDocument();
    api.updateEmployeeChannelAccounts.mockReturnValue(ok({ zaloAccounts: [zaloAccount(5), zaloAccount(6)] }));
    await user.click(screen.getByRole('button', { name: 'Lưu tài khoản được giao' }));
    await waitFor(() => expect(api.updateEmployeeChannelAccounts).toHaveBeenCalledWith('12', {
      zaloAccountIds: [], telegramAccountIds: [], whatsappSessionKeys: [],
    }));

    await user.click(await modal.findByRole('button', { name: 'Chọn tất cả' }));
    expect(modal.getByText('Đã chọn 2/2 tài khoản')).toBeInTheDocument();
  });

  it('còn thay đổi chưa lưu + bấm Đóng → hộp xác nhận; "Lưu rồi đóng" lưu cả tab này', async () => {
    const user = await openZaloTab([zaloAccount(5, { displayName: 'Shop' }), zaloAccount(6)]);
    const modal = within(panel());
    await modal.findByText('Shop');
    await user.click(modal.getAllByRole('checkbox')[0]);

    await user.click(modal.getByRole('button', { name: 'Đóng' }));
    await screen.findByRole('heading', { name: 'Có thay đổi chưa lưu' });
    api.updateEmployeeChannelAccounts.mockReturnValue(ok({ zaloAccounts: [zaloAccount(5, { assigned: true }), zaloAccount(6)] }));
    await user.click(screen.getByRole('button', { name: 'Lưu rồi đóng' }));

    await waitFor(() => expect(api.updateEmployeeChannelAccounts).toHaveBeenCalledTimes(1));
    expect(api.updateEmployeeChannelAccounts.mock.calls[0][1].zaloAccountIds.map(Number)).toEqual([5]);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Lưu tài khoản được giao' })).not.toBeInTheDocument());
  });

  it('chủ chưa có tài khoản Zalo nào → thông báo trống, không có ô tick', async () => {
    await openZaloTab([]);
    expect(await screen.findByText(/Bạn chưa có tài khoản Zalo nào/)).toBeInTheDocument();
    expect(within(panel()).queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('tải lỗi → báo lỗi + nút Thử lại; Thử lại gọi API lần nữa và hiện danh sách', async () => {
    api.getEmployees.mockResolvedValue({ data: { success: true, data: [makeEmployee()] } });
    api.getEmployeeChannelAccounts.mockRejectedValueOnce(new Error('boom'));
    api.getEmployeeChannelAccounts.mockReturnValue(ok({ zaloAccounts: [zaloAccount(5, { displayName: 'Shop' })] }));
    const user = await renderPage();
    await user.click(await screen.findByText('nv01'));
    await user.click(await screen.findByRole('button', { name: 'Tài khoản kênh' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được danh sách tài khoản Zalo');
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Shop')).toBeInTheDocument();
    expect(api.getEmployeeChannelAccounts).toHaveBeenCalledTimes(2);
  });

  it('lưu lỗi → báo lỗi từ backend, vẫn còn dirty', async () => {
    const user = await openZaloTab([zaloAccount(5, { displayName: 'Shop' })]);
    const modal = within(panel());
    await modal.findByText('Shop');
    await user.click(modal.getByRole('checkbox'));
    api.updateEmployeeChannelAccounts.mockRejectedValue({ response: { data: { message: 'Lỗi từ máy chủ' } } });
    await user.click(screen.getByRole('button', { name: 'Lưu tài khoản được giao' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Lỗi từ máy chủ'));
    expect(screen.getByText('Có thay đổi chưa lưu')).toBeInTheDocument();
  });

  it('không mở tab thì KHÔNG gọi API tài khoản Zalo (không tốn request khi chỉ sửa tên/quyền)', async () => {
    api.getEmployees.mockResolvedValue({ data: { success: true, data: [makeEmployee()] } });
    const user = await renderPage();
    await user.click(await screen.findByText('nv01'));
    await screen.findByRole('button', { name: 'Phân quyền' });
    expect(api.getEmployeeChannelAccounts).not.toHaveBeenCalled();
  });
});

const telegramAccount = (id, overrides = {}) => ({
  id,
  displayName: `Telegram ${id}`,
  username: '',
  phone: '',
  isActive: true,
  assigned: false,
  source: null,
  ...overrides,
});

const whatsappAccount = (sessionKey, overrides = {}) => ({
  sessionKey,
  shortKey: sessionKey.replace(/^\d+-/, ''),
  displayName: `WA ${sessionKey}`,
  phone: '',
  status: 'open',
  assigned: false,
  source: null,
  ...overrides,
});

/** Mở tab với dữ liệu ba kênh. */
const openChannelsTab = async (data) => {
  api.getEmployees.mockResolvedValue({ data: { success: true, data: [makeEmployee()] } });
  api.getEmployeeChannelAccounts.mockReturnValue(ok(data));
  const user = await renderPage();
  await user.click(await screen.findByText('nv01'));
  await user.click(await screen.findByRole('button', { name: 'Tài khoản kênh' }));
  return user;
};

describe('EmployeeManagement — tab Tài khoản kênh: nhóm Telegram và WhatsApp (PLAN_GIAO_TK_TG_WA H1)', () => {
  it('hiện hai nhóm Telegram / WhatsApp với ô đã giao được tick và nhãn nguồn', async () => {
    await openChannelsTab({
      zaloAccounts: [],
      telegramAccounts: [
        telegramAccount(3, { displayName: 'Tele Shop', username: 'shop_vn', assigned: true, source: 'legacy' }),
        telegramAccount(4, { displayName: 'Tele Phu' }),
      ],
      whatsappAccounts: [
        whatsappAccount('10-default', { displayName: 'WA Chinh', assigned: true, source: 'self_login' }),
      ],
    });
    const tele = within(await screen.findByTestId('channel-group-telegram'));
    expect(tele.getByText('Tele Shop')).toBeInTheDocument();
    expect(tele.getByText('@shop_vn')).toBeInTheDocument();
    expect(tele.getByText('Giữ từ trước')).toBeInTheDocument();
    expect(tele.getAllByRole('checkbox').map((b) => b.checked)).toEqual([true, false]);
    const wa = within(screen.getByTestId('channel-group-whatsapp'));
    expect(wa.getByText('WA Chinh')).toBeInTheDocument();
    expect(wa.getByText('Nhân viên tự đăng nhập')).toBeInTheDocument();
    expect(wa.getAllByRole('checkbox').map((b) => b.checked)).toEqual([true]);
  });

  it('tick Telegram + bỏ tick WhatsApp rồi Lưu → API nhận ĐỦ ba danh sách (id Telegram, session key WhatsApp)', async () => {
    const user = await openChannelsTab({
      zaloAccounts: [zaloAccount(5, { displayName: 'Shop', assigned: true, source: 'assigned' })],
      telegramAccounts: [telegramAccount(3, { displayName: 'Tele Shop' })],
      whatsappAccounts: [whatsappAccount('10-default', { displayName: 'WA Chinh', assigned: true, source: 'assigned' })],
    });
    const tele = within(await screen.findByTestId('channel-group-telegram'));
    await user.click(tele.getByRole('checkbox'));
    const wa = within(screen.getByTestId('channel-group-whatsapp'));
    await user.click(wa.getByRole('checkbox'));
    expect(await screen.findByText('Có thay đổi chưa lưu')).toBeInTheDocument();

    api.updateEmployeeChannelAccounts.mockReturnValue(ok({
      zaloAccounts: [zaloAccount(5, { displayName: 'Shop', assigned: true, source: 'assigned' })],
      telegramAccounts: [telegramAccount(3, { displayName: 'Tele Shop', assigned: true, source: 'assigned' })],
      whatsappAccounts: [whatsappAccount('10-default', { displayName: 'WA Chinh' })],
    }));
    await user.click(screen.getByRole('button', { name: 'Lưu tài khoản được giao' }));

    await waitFor(() => expect(api.updateEmployeeChannelAccounts).toHaveBeenCalledTimes(1));
    const [, payload] = api.updateEmployeeChannelAccounts.mock.calls[0];
    expect(payload.zaloAccountIds.map(Number)).toEqual([5]);
    expect(payload.telegramAccountIds.map(Number)).toEqual([3]);
    expect(payload.whatsappSessionKeys).toEqual([]);
    await waitFor(() => expect(screen.queryByText('Có thay đổi chưa lưu')).not.toBeInTheDocument());
  });

  it('CHỈ đổi Telegram (Zalo không đổi) vẫn tính là có thay đổi chưa lưu', async () => {
    const user = await openChannelsTab({
      zaloAccounts: [zaloAccount(5, { displayName: 'Shop', assigned: true, source: 'assigned' })],
      telegramAccounts: [telegramAccount(3, { displayName: 'Tele Shop' })],
      whatsappAccounts: [],
    });
    expect(screen.queryByText('Có thay đổi chưa lưu')).not.toBeInTheDocument();
    await user.click(within(await screen.findByTestId('channel-group-telegram')).getByRole('checkbox'));
    expect(await screen.findByText('Có thay đổi chưa lưu')).toBeInTheDocument();
  });

  it('chưa có tài khoản Telegram / WhatsApp → câu trống cho từng nhóm; backend cũ không trả hai khoá vẫn hiển thị được', async () => {
    await openChannelsTab({ zaloAccounts: [zaloAccount(5, { displayName: 'Shop' })] });
    expect(await screen.findByText('Bạn chưa kết nối tài khoản Telegram nào.')).toBeInTheDocument();
    expect(screen.getByText('Bạn chưa kết nối tài khoản WhatsApp nào.')).toBeInTheDocument();
  });
});
