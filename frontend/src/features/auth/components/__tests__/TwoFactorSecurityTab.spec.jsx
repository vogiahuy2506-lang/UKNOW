import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TwoFactorSecurityTab from '../TwoFactorSecurityTab';

const stableT = (key, params) => {
  if (params && Object.keys(params).length > 0) return `${key}:${JSON.stringify(params)}`;
  return key;
};
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: stableT }) }));

const api = vi.hoisted(() => ({
  getTwoFactorStatus: vi.fn(),
  beginTwoFactorSetup: vi.fn(),
  enableTwoFactor: vi.fn(),
  disableTwoFactor: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
}));
vi.mock('../../services/authApi.service', () => api);

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const CODES = ['AAAAA-BBBBB', 'CCCCC-DDDDD', 'EEEEE-FFFFF', 'GGGGG-HHHHH', 'JJJJJ-KKKKK', 'LLLLL-MMMMM', 'NNNNN-PPPPP', 'QQQQQ-RRRRR'];

describe('TwoFactorSecurityTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getTwoFactorStatus.mockResolvedValue({
      success: true,
      data: { enabled: false, enabledAt: null, recoveryCodesLeft: 0, requiresPasswordToDisable: true },
    });
    api.beginTwoFactorSetup.mockResolvedValue({
      success: true,
      data: { secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/x', qrDataUrl: 'data:image/png;base64,AAA' },
    });
    api.enableTwoFactor.mockResolvedValue({ success: true, data: { recoveryCodes: CODES } });
  });

  it('chưa bật: setup → nhập mã → enable → hiện 8 mã; nút Xong khoá tới khi tick', async () => {
    render(<TwoFactorSecurityTab />);

    fireEvent.click(await screen.findByRole('button', { name: 'twoFactor.enable' }));

    expect(await screen.findByAltText('twoFactor.qrAlt')).toHaveAttribute('src', 'data:image/png;base64,AAA');
    expect(screen.getByText('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('twoFactor.enterCodeToConfirm'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'twoFactor.confirm' }));

    await waitFor(() => expect(api.enableTwoFactor).toHaveBeenCalledWith('123456'));
    expect(await screen.findAllByTestId('recovery-code')).toHaveLength(8);

    const done = screen.getByRole('button', { name: 'twoFactor.done' });
    expect(done).toBeDisabled();
    // Bước mã khôi phục không có nút đóng (X).
    expect(screen.queryByRole('button', { name: 'common.close' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(done).toBeEnabled();
  });

  it('sai mã khi bật (401) → báo lỗi, vẫn ở bước 1', async () => {
    api.enableTwoFactor.mockRejectedValue({ response: { status: 401, data: {} } });
    render(<TwoFactorSecurityTab />);

    fireEvent.click(await screen.findByRole('button', { name: 'twoFactor.enable' }));
    await screen.findByAltText('twoFactor.qrAlt');
    fireEvent.change(screen.getByLabelText('twoFactor.enterCodeToConfirm'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'twoFactor.confirm' }));

    expect(await screen.findByText('twoFactor.invalidCode')).toBeInTheDocument();
    expect(screen.queryAllByTestId('recovery-code')).toHaveLength(0);
  });

  it('đã bật: hiện số mã còn lại; tắt cần mật khẩu khi requiresPasswordToDisable', async () => {
    api.getTwoFactorStatus.mockResolvedValue({
      success: true,
      data: { enabled: true, enabledAt: '2026-10-01T00:00:00.000Z', recoveryCodesLeft: 6, requiresPasswordToDisable: true },
    });
    api.disableTwoFactor.mockResolvedValue({ success: true, data: { enabled: false } });
    render(<TwoFactorSecurityTab />);

    expect(await screen.findByText(/twoFactor\.recoveryCodesLeft/)).toHaveTextContent('"count":6');

    fireEvent.click(screen.getByRole('button', { name: 'twoFactor.disable' }));
    fireEvent.change(await screen.findByLabelText('twoFactor.currentPassword'), { target: { value: 'matkhau' } });
    fireEvent.change(screen.getByLabelText('twoFactor.codeOrRecovery'), { target: { value: '123456' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'twoFactor.disable' }).pop());

    await waitFor(() =>
      expect(api.disableTwoFactor).toHaveBeenCalledWith({ code: '123456', password: 'matkhau' }),
    );
  });

  it('tài khoản Google (requiresPasswordToDisable=false): không hỏi mật khẩu', async () => {
    api.getTwoFactorStatus.mockResolvedValue({
      success: true,
      data: { enabled: true, enabledAt: '2026-10-01T00:00:00.000Z', recoveryCodesLeft: 8, requiresPasswordToDisable: false },
    });
    render(<TwoFactorSecurityTab />);

    fireEvent.click(await screen.findByRole('button', { name: 'twoFactor.disable' }));
    await screen.findByLabelText('twoFactor.codeOrRecovery');
    expect(screen.queryByLabelText('twoFactor.currentPassword')).not.toBeInTheDocument();
  });
});
