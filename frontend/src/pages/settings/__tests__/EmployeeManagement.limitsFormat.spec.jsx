/**
 * Tab "Giới hạn" của nhân viên: ô số có dấu chấm hàng nghìn, lưu vẫn gửi SỐ NGUYÊN, bảng ngoài định dạng dấu chấm,
 * thông báo vượt trần gói hiện đúng số (trước đây hiện nguyên chuỗi "{max.toLocaleString()}").
 * Khuôn mocks theo EmployeeManagement.permissionsFooter.spec.jsx.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../i18n', async () => (await import('../../../test/realI18n.js')).realI18nModule());
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), custom: vi.fn(), dismiss: vi.fn() });
  return { default: toast };
});
vi.mock('../../../features/users/services/userManagementApi.service', () => ({
  default: {
    getEmployees: vi.fn(),
    getTeamOverview: vi.fn(),
    getCampaignApprovalThreshold: vi.fn(),
    updateSendLimits: vi.fn(),
  },
}));
vi.mock('../../../features/auth/services/authApi.service', () => ({
  getMyProfile: vi.fn(),
}));

import api from '../../../features/users/services/userManagementApi.service';
import { getMyProfile } from '../../../features/auth/services/authApi.service';
import EmployeeManagement from '../EmployeeManagement';

const makeEmployee = (overrides = {}) => ({
  id: '12', username: 'nv01', email: 'nv01@example.com', fullName: 'Nhân Viên Một',
  status: 'active', memberStatus: 'active', permissions: [], joinedAt: '2026-09-20T09:00:00.000Z',
  dailyEmailLimit: null, monthlyEmailLimit: null, dailyZaloLimit: null, monthlyZaloLimit: null,
  dailyAiCreditLimit: null, periodAiCreditLimit: null,
  origin: 'created', acceptedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const renderPage = async (emp, profile = {}) => {
  api.getEmployees.mockResolvedValue({ data: { success: true, data: [emp] } });
  getMyProfile.mockResolvedValue({ data: profile });
  const user = userEvent.setup();
  render(<MemoryRouter><EmployeeManagement /></MemoryRouter>);
  await waitFor(() => expect(api.getEmployees).toHaveBeenCalled());
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return user;
};

const openLimitsTab = async (emp, profile) => {
  const user = await renderPage(emp, profile);
  await user.click(await screen.findByText('Nhân Viên Một'));
  await user.click(await screen.findByRole('button', { name: 'Giới hạn' }));
  await screen.findByRole('button', { name: 'Lưu giới hạn' });
  return user;
};

const numberBoxes = () => screen.getAllByPlaceholderText('Nhập số lượng...');

const realConsoleError = console.error;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    if (String(args[0]).includes('not wrapped in act')) return;
    realConsoleError(...args);
  });
});
afterAll(() => { console.error.mockRestore(); });
beforeEach(() => {
  vi.clearAllMocks();
  api.getTeamOverview.mockResolvedValue({ data: { data: [] } });
  api.getCampaignApprovalThreshold.mockResolvedValue({ data: { data: { threshold: null } } });
});

describe('Tab Giới hạn — dấu chấm hàng nghìn', () => {
  it('bảng ngoài định dạng dấu chấm, không còn số trần', async () => {
    await renderPage(makeEmployee({ dailyEmailLimit: 10000000, monthlyZaloLimit: 1234567 }));
    expect(await screen.findByText(/10\.000\.000/)).toBeInTheDocument();
    expect(screen.getByText(/1\.234\.567/)).toBeInTheDocument();
    expect(screen.queryByText(/10000000/)).not.toBeInTheDocument();
  });

  it('gõ vào ô → hiện dấu chấm; Lưu gửi SỐ NGUYÊN (không chuỗi có dấu chấm)', async () => {
    const user = await openLimitsTab(makeEmployee({ dailyEmailLimit: 5 }));
    api.updateSendLimits.mockResolvedValue({ data: { success: true } });
    const box = numberBoxes()[0];
    await user.clear(box);
    await user.type(box, '10000000');
    expect(box).toHaveValue('10.000.000');
    await user.click(screen.getByRole('button', { name: 'Lưu giới hạn' }));
    await waitFor(() => expect(api.updateSendLimits).toHaveBeenCalledTimes(1));
    const [, payload] = api.updateSendLimits.mock.calls[0];
    expect(payload.dailyEmailLimit).toBe(10000000);
    expect(typeof payload.dailyEmailLimit).toBe('number');
    expect(payload.monthlyEmailLimit).toBeNull();
  });

  it('vượt trần gói: báo đỏ có SỐ đã định dạng (không còn chuỗi {max…}) và khoá nút Lưu', async () => {
    const user = await openLimitsTab(makeEmployee({ dailyEmailLimit: 100 }), { dailyEmailLimit: 2000 });
    const box = numberBoxes()[0];
    await user.clear(box);
    await user.type(box, '3000');
    expect(await screen.findByText(/Vượt quá giới hạn tối đa của gói \(2\.000\)/)).toBeInTheDocument();
    expect(screen.queryByText(/toLocaleString/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu giới hạn' })).toBeDisabled();
  });

  it('bằng đúng trần gói (2.000) hoặc gói không có trần: không báo đỏ, nút Lưu bật', async () => {
    const user = await openLimitsTab(makeEmployee({ dailyEmailLimit: 100 }), { dailyEmailLimit: 2000 });
    const box = numberBoxes()[0];
    await user.clear(box);
    await user.type(box, '2000');
    expect(box).toHaveValue('2.000');
    expect(screen.queryByText(/Vượt quá giới hạn tối đa của gói/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu giới hạn' })).toBeEnabled();
  });

  it('gói không đặt trần: nhập số lớn vẫn không báo đỏ', async () => {
    const user = await openLimitsTab(makeEmployee({ dailyEmailLimit: 100 }), { dailyEmailLimit: null });
    const box = numberBoxes()[0];
    await user.clear(box);
    await user.type(box, '99999999');
    expect(screen.queryByText(/Vượt quá giới hạn tối đa của gói/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu giới hạn' })).toBeEnabled();
  });
});
