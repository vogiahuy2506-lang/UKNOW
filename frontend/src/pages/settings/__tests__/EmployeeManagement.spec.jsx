/**
 * PLAN_NHAN_VIEN_KHONG_THAY_CHIEN_DICH, PR-2 — trang Nhân viên (phía chủ).
 * Dùng từ điển vi THẬT (câu chữ chủ thấy), api mock ở ranh giới service.
 * Ca chính: thêm/link xong phải tự mở tab Phân quyền; 0 quyền phải hiện "Chưa cấp quyền"; lỗi email/tên
 * trùng phải chỉ lối ra; reset mật khẩu phải hiện mật khẩu thật; nút "Gửi lại lời mời" phải hiện.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../../i18n', async () => (await import('../../../test/realI18n.js')).realI18nModule());

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast };
});

vi.mock('../../../features/users/services/userManagementApi.service', () => ({
  default: {
    getEmployees: vi.fn(),
    getTeamOverview: vi.fn(),
    getCampaignApprovalThreshold: vi.fn(),
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
  permissions: [],
  joinedAt: '2026-09-20T09:00:00.000Z',
  dailyEmailLimit: null,
  monthlyEmailLimit: null,
  dailyZaloLimit: null,
  monthlyZaloLimit: null,
  ...overrides,
});

const ok = (data, extra = {}) => Promise.resolve({ data: { success: true, data, ...extra } });
const httpError = (data, status = 400) => Object.assign(new Error('Request failed'), { response: { status, data } });

const setEmployees = (...lists) => {
  api.getEmployees.mockReset();
  lists.forEach((list) => api.getEmployees.mockResolvedValueOnce({ data: { success: true, data: list } }));
  // Lần gọi sau danh sách đã hết → giữ danh sách cuối.
  api.getEmployees.mockResolvedValue({ data: { success: true, data: lists[lists.length - 1] } });
};

const renderPage = async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><EmployeeManagement /></MemoryRouter>);
  await waitFor(() => expect(api.getEmployees).toHaveBeenCalled());
  // Các fetch nền của trang (hồ sơ, tổng quan team, ngưỡng duyệt) resolve sau — cho chúng xong hẳn để
  // không cập nhật state ngoài act() giữa chừng test.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return user;
};

const field = (name) => document.body.querySelector(`input[name="${name}"]`);

/** Mở hộp thoại thêm nhân viên rồi chuyển sang tab `tabLabel`. */
const openAddModal = async (user) => {
  await user.click(await screen.findByRole('button', { name: 'Thêm nhân viên' }));
  await screen.findAllByRole('button', { name: 'Tạo tài khoản mới' });
};

// Trang có nhiều setState sau await; user-event lo phần act(), còn cảnh báo "not wrapped in act" chỉ là
// nhiễu log. Chỉ lọc đúng loại này — mọi console.error khác vẫn in ra.
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

// ── (a) thêm/link xong → tự mở tab Phân quyền ────────────────────────────────
describe('thêm nhân viên xong → tự mở tab Phân quyền', () => {
  it('link tài khoản có sẵn: mở đúng nhân viên ở tab Phân quyền, có dải vàng "chưa có quyền nào"', async () => {
    setEmployees([], [makeEmployee()]);
    api.linkEmployee.mockReturnValue(ok({ id: '12' })); // id là CHUỖI (BIGINT)
    const user = await renderPage();

    await openAddModal(user);
    await user.click(screen.getByRole('button', { name: 'Link tài khoản có sẵn' }));
    await user.type(field('email'), 'nv01@example.com');
    const submit = screen.getAllByRole('button', { name: 'Link tài khoản có sẵn' }).pop();
    await user.click(submit);

    expect(await screen.findByText(/Nhân Viên Một chưa có quyền nào/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nhân Viên Một' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu quyền hạn' })).toBeInTheDocument();
    expect(api.linkEmployee).toHaveBeenCalledWith('nv01@example.com');
  });

  it('backend cũ chưa trả data.id → tìm theo email (không phân biệt hoa/thường)', async () => {
    setEmployees([], [makeEmployee({ email: 'nv01@example.com' })]);
    api.linkEmployee.mockReturnValue(ok({ permissions: [] })); // không có id
    const user = await renderPage();

    await openAddModal(user);
    await user.click(screen.getByRole('button', { name: 'Link tài khoản có sẵn' }));
    await user.type(field('email'), 'NV01@Example.com');
    await user.click(screen.getAllByRole('button', { name: 'Link tài khoản có sẵn' }).pop());

    expect(await screen.findByText(/Nhân Viên Một chưa có quyền nào/)).toBeInTheDocument();
  });

  it('tạo tài khoản mới cũng mở tab Phân quyền', async () => {
    setEmployees([], [makeEmployee({ status: 'pending_activation' })]);
    api.createEmployee.mockReturnValue(ok({ id: '12', invitationSent: true }, { message: 'Đã gửi lời mời đến email nhân viên' }));
    const user = await renderPage();

    await openAddModal(user);
    await user.type(field('username'), 'nv01');
    await user.type(field('email'), 'nv01@example.com');
    await user.click(screen.getAllByRole('button', { name: 'Tạo tài khoản mới' }).pop());

    expect(await screen.findByText(/Nhân Viên Một chưa có quyền nào/)).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Đã gửi lời mời kích hoạt đến email nhân viên');
  });

  it('thư mời gửi hỏng (invitationSent=false) → toast lỗi mang câu của backend, KHÔNG toast "đã gửi"', async () => {
    setEmployees([], [makeEmployee({ status: 'pending_activation' })]);
    api.createEmployee.mockReturnValue(ok({ id: '12', invitationSent: false }, { message: 'Đã tạo tài khoản NHƯNG gửi email mời thất bại.' }));
    const user = await renderPage();

    await openAddModal(user);
    await user.type(field('username'), 'nv01');
    await user.type(field('email'), 'nv01@example.com');
    await user.click(screen.getAllByRole('button', { name: 'Tạo tài khoản mới' }).pop());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Đã tạo tài khoản NHƯNG gửi email mời thất bại.', expect.anything()));
    expect(toast.success).not.toHaveBeenCalledWith('Đã gửi lời mời kích hoạt đến email nhân viên');
  });
});

// ── (b) cột "Quyền" ──────────────────────────────────────────────────────────
describe('cột Quyền trong bảng', () => {
  it('permissions [] (mặc định nhân viên mới) → nhãn "Chưa cấp quyền"', async () => {
    setEmployees([makeEmployee({ permissions: [] })]);
    await renderPage();
    expect(await screen.findByRole('button', { name: 'Chưa cấp quyền' })).toBeInTheDocument();
  });

  it('permissions là object mà mọi giá trị false → vẫn "Chưa cấp quyền"', async () => {
    setEmployees([makeEmployee({ permissions: { campaigns_view: false, customers: false } })]);
    await renderPage();
    expect(await screen.findByRole('button', { name: 'Chưa cấp quyền' })).toBeInTheDocument();
  });

  it('có quyền → "N quyền", không có nhãn vàng', async () => {
    setEmployees([makeEmployee({ permissions: { campaigns_view: true, customers: true, leads: true, forms: false } })]);
    await renderPage();
    expect(await screen.findByText('3 quyền')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chưa cấp quyền' })).not.toBeInTheDocument();
  });

  it('bấm nhãn "Chưa cấp quyền" mở thẳng tab Phân quyền (không phải tab Thông tin)', async () => {
    setEmployees([makeEmployee()]);
    const user = await renderPage();
    await user.click(await screen.findByRole('button', { name: 'Chưa cấp quyền' }));
    expect(await screen.findByRole('button', { name: 'Lưu quyền hạn' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset mật khẩu' })).not.toBeInTheDocument();
  });
});

// ── (c) lỗi email/tên đăng nhập trùng ────────────────────────────────────────
describe('lỗi khi tạo tài khoản mới', () => {
  it('EMAIL_ALREADY_REGISTERED → sang tab Link, email điền sẵn, hiện gợi ý (không toast đỏ)', async () => {
    setEmployees([]);
    const message = 'Email này đã có tài khoản Founder AI. Hãy dùng tab "Link tài khoản có sẵn" để thêm người này vào nhóm.';
    api.createEmployee.mockRejectedValue(httpError({ success: false, code: 'EMAIL_ALREADY_REGISTERED', message }));
    const user = await renderPage();

    await openAddModal(user);
    await user.type(field('username'), 'nv01');
    await user.type(field('email'), 'da.co@example.com');
    await user.click(screen.getAllByRole('button', { name: 'Tạo tài khoản mới' }).pop());

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(field('email')).toHaveValue('da.co@example.com');
    expect(field('username')).toBeNull(); // form tạo mới đã ẩn → đang ở tab Link
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('USERNAME_TAKEN → lỗi đỏ ngay dưới ô tên đăng nhập, không toast, vẫn ở tab tạo mới', async () => {
    setEmployees([]);
    const message = 'Tên đăng nhập này đã có người dùng. Hãy chọn tên khác (ví dụ thêm tên công ty phía sau).';
    api.createEmployee.mockRejectedValue(httpError({ success: false, code: 'USERNAME_TAKEN', message }));
    const user = await renderPage();

    await openAddModal(user);
    await user.type(field('username'), 'nv01');
    await user.type(field('email'), 'moi@example.com');
    await user.click(screen.getAllByRole('button', { name: 'Tạo tài khoản mới' }).pop());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(field('username')).not.toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('backend cũ (lỗi không có code) → giữ toast cũ với câu của server', async () => {
    setEmployees([]);
    api.createEmployee.mockRejectedValue(httpError({ success: false, message: 'Email này đã được sử dụng bởi một tài khoản khác' }));
    const user = await renderPage();

    await openAddModal(user);
    await user.type(field('username'), 'nv01');
    await user.type(field('email'), 'x@example.com');
    await user.click(screen.getAllByRole('button', { name: 'Tạo tài khoản mới' }).pop());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Email này đã được sử dụng bởi một tài khoản khác'));
  });

  it('tab Tạo tài khoản mới có dòng nhắc quy tắc tên đăng nhập', async () => {
    setEmployees([]);
    const user = await renderPage();
    await openAddModal(user);
    expect(screen.getByText(/Chỉ chữ cái và số, không dấu, không khoảng trắng/)).toBeInTheDocument();
    expect(screen.getByText(/thêm tên công ty/)).toBeInTheDocument();
  });
});

// ── (d) reset mật khẩu ───────────────────────────────────────────────────────
describe('reset mật khẩu nhân viên', () => {
  const openReset = async (user) => {
    await user.click(await screen.findByText('nv01'));
    await user.click(await screen.findByRole('button', { name: 'Reset mật khẩu' }));
  };

  it('hộp xác nhận KHÔNG còn nói mật khẩu cố định', async () => {
    setEmployees([makeEmployee()]);
    const user = await renderPage();
    await openReset(user);

    expect(await screen.findByText(/Hệ thống sẽ tạo một mật khẩu tạm/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/digiso/i);
  });

  it('reset xong hiện ĐÚNG mật khẩu tạm backend trả, kèm nút Sao chép + cảnh báo một lần', async () => {
    setEmployees([makeEmployee()]);
    api.resetEmployeePassword.mockReturnValue(ok({ tempPassword: 'Qx7mK2pLw9' }));
    const user = await renderPage();
    await openReset(user);
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));

    expect(await screen.findByTestId('temp-password')).toHaveTextContent('Qx7mK2pLw9');
    expect(screen.getByRole('button', { name: 'Sao chép' })).toBeInTheDocument();
    expect(screen.getByText(/chỉ hiện một lần/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/digiso/i);
    expect(api.resetEmployeePassword).toHaveBeenCalledWith('12');
  });

  it('mật khẩu tạm không lọt vào toast', async () => {
    setEmployees([makeEmployee()]);
    api.resetEmployeePassword.mockReturnValue(ok({ tempPassword: 'Qx7mK2pLw9' }));
    const user = await renderPage();
    await openReset(user);
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await screen.findByTestId('temp-password');

    const toasted = [...toast.success.mock.calls, ...toast.error.mock.calls].flat().join(' ');
    expect(toasted).not.toContain('Qx7mK2pLw9');
  });

  it('bấm ra ngoài (nền tối) KHÔNG đóng hộp mật khẩu — chỉ nút Đóng mới đóng, vì mật khẩu chỉ hiện một lần', async () => {
    setEmployees([makeEmployee()]);
    api.resetEmployeePassword.mockReturnValue(ok({ tempPassword: 'Qx7mK2pLw9' }));
    const user = await renderPage();
    await openReset(user);
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    const code = await screen.findByTestId('temp-password');
    const panel = code.closest('div.relative');
    // Nền tối là nút "Đóng" đứng TRƯỚC panel trong cùng lớp phủ.
    const backdrop = panel.parentElement.querySelector('button[aria-label]');
    expect(backdrop).not.toBeNull();
    expect(panel.contains(backdrop)).toBe(false);

    await user.click(backdrop);

    expect(screen.getByTestId('temp-password')).toHaveTextContent('Qx7mK2pLw9');
  });

  it('đóng hộp mật khẩu bằng nút Đóng thì mật khẩu biến mất', async () => {
    setEmployees([makeEmployee()]);
    api.resetEmployeePassword.mockReturnValue(ok({ tempPassword: 'Qx7mK2pLw9' }));
    const user = await renderPage();
    await openReset(user);
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    const dialog = (await screen.findByTestId('temp-password')).closest('div.relative');
    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }));

    await waitFor(() => expect(screen.queryByTestId('temp-password')).not.toBeInTheDocument());
  });

  it('chuỗi mật khẩu cứng cũ không còn trong mã nguồn frontend', () => {
    const needle = ['digiso', '2026'].join('@');
    const hits = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|jsx)$/.test(entry.name) && fs.readFileSync(full, 'utf8').includes(needle)) hits.push(full);
      }
    };
    walk(path.resolve(__dirname, '../../..'));
    expect(hits).toEqual([]);
  });
});

// ── (e) P5: nút "Gửi lại lời mời" ────────────────────────────────────────────
describe('nhân viên chờ kích hoạt (P5)', () => {
  it('status=pending_activation (memberStatus=active) → thấy "Gửi lại lời mời", KHÔNG thấy Reset mật khẩu/Khóa tài khoản', async () => {
    setEmployees([makeEmployee({ status: 'pending_activation', memberStatus: 'active' })]);
    const user = await renderPage();
    await user.click(await screen.findByText('nv01'));

    expect(await screen.findByRole('button', { name: 'Gửi lại lời mời' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset mật khẩu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Khóa tài khoản' })).not.toBeInTheDocument();
  });

  it('nhân viên đã kích hoạt → thấy Reset mật khẩu + Khóa tài khoản, không có "Gửi lại lời mời"', async () => {
    setEmployees([makeEmployee({ status: 'active', memberStatus: 'active' })]);
    const user = await renderPage();
    await user.click(await screen.findByText('nv01'));

    expect(await screen.findByRole('button', { name: 'Reset mật khẩu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khóa tài khoản' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi lại lời mời' })).not.toBeInTheDocument();
  });
});

// ── Chọn nhanh + lưu quyền ───────────────────────────────────────────────────
describe('tab Phân quyền: chọn nhanh và lưu', () => {
  /** Dựng trang với đúng một nhân viên, mở nhân viên đó rồi sang tab Phân quyền. */
  const setup = async (emp = makeEmployee()) => {
    setEmployees([emp]);
    const user = await renderPage();
    await user.click(await screen.findByText(emp.username));
    await user.click(await screen.findByRole('button', { name: 'Phân quyền' }));
    await screen.findByRole('button', { name: 'Lưu quyền hạn' });
    return user;
  };
  const checkedCount = () => document.body.querySelectorAll('input[type="checkbox"]:checked').length;

  it('"Chỉ xem" tick đúng 4 ô và KHÔNG tự lưu', async () => {
    const user = await setup();

    await user.click(screen.getByRole('button', { name: 'Chỉ xem' }));

    expect(checkedCount()).toBe(4);
    expect(api.updateEmployeePermissions).not.toHaveBeenCalled();
  });

  it('"Làm marketing" tick 10 ô (mẫu email + mẫu Zalo chung một ô); "Tất cả" tick hết; "Bỏ hết" bỏ hết', async () => {
    const user = await setup();
    const totalBoxes = document.body.querySelectorAll('input[type="checkbox"]').length;

    await user.click(screen.getByRole('button', { name: 'Làm marketing' }));
    expect(checkedCount()).toBe(10);

    await user.click(screen.getByRole('button', { name: 'Tất cả' }));
    expect(checkedCount()).toBe(totalBoxes);

    await user.click(screen.getByRole('button', { name: 'Bỏ hết' }));
    expect(checkedCount()).toBe(0);
  });

  it('chọn bộ mới THAY hẳn bộ cũ (không giữ sót ô đã tick)', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Tất cả' }));
    await user.click(screen.getByRole('button', { name: 'Chỉ xem' }));
    expect(checkedCount()).toBe(4);
  });

  it('bấm Lưu sau khi chọn nhanh gửi đúng bản đồ quyền; KHÔNG còn dòng bắt nhân viên F5 (đã có làm mới tự động)', async () => {
    const user = await setup();
    api.updateEmployeePermissions.mockReturnValue(ok({ permissions: { campaigns_view: true, reports_view: true, customers: true, leads: true } }));
    await user.click(screen.getByRole('button', { name: 'Chỉ xem' }));
    await user.click(screen.getByRole('button', { name: 'Lưu quyền hạn' }));

    await waitFor(() => expect(api.updateEmployeePermissions).toHaveBeenCalledTimes(1));
    const [id, sent] = api.updateEmployeePermissions.mock.calls[0];
    expect(id).toBe('12');
    expect(Array.isArray(sent)).toBe(false);
    const granted = Object.entries(sent).filter(([, v]) => v === true).map(([k]) => k).sort();
    expect(granted).toEqual(['campaigns_view', 'customers', 'leads', 'reports_view']);
    await screen.findByRole('button', { name: 'Lưu quyền hạn' });
    expect(screen.queryByText(/F5/)).not.toBeInTheDocument();
  });

  it('lưu khi chưa tick gì gửi {} chứ không phải [] (P4)', async () => {
    const user = await setup();
    api.updateEmployeePermissions.mockReturnValue(ok({ permissions: {} }));
    await user.click(screen.getByRole('button', { name: 'Lưu quyền hạn' }));

    await waitFor(() => expect(api.updateEmployeePermissions).toHaveBeenCalled());
    expect(api.updateEmployeePermissions.mock.calls[0][1]).toEqual({});
  });

  it('nhân viên đã có quyền → không hiện dải vàng "chưa có quyền nào"', async () => {
    await setup(makeEmployee({ permissions: { campaigns_view: true } }));
    expect(screen.queryByText(/chưa có quyền nào/)).not.toBeInTheDocument();
  });
});
