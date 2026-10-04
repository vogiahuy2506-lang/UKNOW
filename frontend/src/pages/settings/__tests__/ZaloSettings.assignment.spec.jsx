/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G1 — trang tài khoản Zalo:
 * - dòng "Người tạo" (luôn ra tên CHỦ dù nhân viên quét QR — sai nghĩa) được thay bằng "Nhân viên được giao: N", chỉ chủ thấy;
 * - nhân viên không thấy nút "Đặt mặc định" (tài khoản mặc định là của cả không gian, chỉ chủ đổi).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

let mockActiveContext = { type: 'self' };

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => selector({ user: { id: 1, role: 'user' }, activeContext: mockActiveContext }),
}));

vi.mock('../../../i18n', async () => (await import('../../../test/realI18n.js')).realI18nModule());

vi.mock('../../../features/settings/services/zaloSettingsApi.service', () => ({
  default: {
    listAccounts: vi.fn(),
    deleteAccount: vi.fn(),
    setDefaultAccount: vi.fn(),
    createLoginQr: vi.fn(),
    restoreSession: vi.fn(),
    retryRestore: vi.fn(),
    getLoginQrStatus: vi.fn(),
    updateSendLimit: vi.fn(),
    updateSendSpeed: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import ZaloSettings from '../ZaloSettings';
import zaloSettingsApiService from '../../../features/settings/services/zaloSettingsApi.service';

const makeAccount = (over = {}) => ({
  id: 7,
  displayName: 'Nick bán hàng',
  status: 'connected',
  isActive: true,
  isDefault: false,
  zaloPhone: '0901234567',
  sendSpeed: 'safe',
  creatorName: 'Chủ Shop',
  createdBy: { name: 'Chủ Shop' },
  ...over,
});

const renderWith = async (items) => {
  zaloSettingsApiService.listAccounts.mockResolvedValue({ data: { data: { items } } });
  render(<ZaloSettings />);
  await waitFor(() => expect(screen.getByText('Nick bán hàng')).toBeInTheDocument());
};

beforeEach(() => {
  vi.clearAllMocks();
  mockActiveContext = { type: 'self' };
});

describe('ZaloSettings — giao tài khoản cho nhân viên (G1)', () => {
  it('CHỦ: thấy "Nhân viên được giao: N" (kể cả 0), KHÔNG còn dòng "Người tạo"; còn nút Đặt mặc định', async () => {
    await renderWith([
      makeAccount({ id: 7, assignedEmployeeCount: 2 }),
      makeAccount({ id: 8, displayName: 'Nick phụ', assignedEmployeeCount: 0 }),
    ]);

    expect(screen.getByText('Nhân viên được giao: 2')).toBeInTheDocument();
    expect(screen.getByText('Nhân viên được giao: 0')).toBeInTheDocument();
    expect(screen.queryByText(/Người tạo/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chủ Shop/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Đặt mặc định/ })).toHaveLength(2);
  });

  it('NHÂN VIÊN: không thấy dòng số nhân viên được giao, không thấy "Người tạo", không có nút Đặt mặc định', async () => {
    mockActiveContext = { type: 'employee', ownerId: 10 };
    await renderWith([makeAccount({ id: 7, assignedEmployeeCount: null })]);

    expect(screen.queryByText(/Nhân viên được giao/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Người tạo/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Đặt mặc định/ })).not.toBeInTheDocument();
    // Các nút việc của chính tài khoản được giao vẫn còn (xoá, giới hạn gửi, tốc độ).
    expect(screen.getByTitle('Xóa')).toBeInTheDocument();
  });

  it('backend cũ không trả assignedEmployeeCount → không hiện dòng nào (không in "undefined"/"NaN")', async () => {
    await renderWith([makeAccount({ id: 7 })]);
    expect(screen.queryByText(/Nhân viên được giao/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/undefined|NaN/);
  });
});
