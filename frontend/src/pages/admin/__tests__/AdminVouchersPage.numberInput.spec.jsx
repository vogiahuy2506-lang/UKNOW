/**
 * Voucher: "Giới hạn lượt dùng" dùng NumberInput (dấu chấm hàng nghìn) nhưng payload vẫn là SỐ;
 * rỗng vẫn là null (không giới hạn); min=1 vẫn chặn gửi biểu mẫu khi nhập 0.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminVouchersPage from '../AdminVouchersPage';

const { getVouchers, createVoucher, getPlans } = vi.hoisted(() => ({
  getVouchers: vi.fn(),
  createVoucher: vi.fn(),
  getPlans: vi.fn(),
}));

vi.mock('../../../features/admin/services/adminVouchersApi.service', () => ({
  default: { getVouchers, createVoucher, updateVoucher: vi.fn() },
}));
vi.mock('../../../features/admin/services/adminPlansApi.service', () => ({ default: { getPlans } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../i18n', () => {
  const t = (key) => key; // ổn định giữa các lần render (fetchVouchers phụ thuộc t)
  return { useI18n: () => ({ t, locale: 'vi' }) };
});
vi.mock('../../../components/common/PageContainer', () => ({ default: ({ children, actions }) => <div>{actions}{children}</div> }));

const openForm = async (user) => {
  render(<AdminVouchersPage />);
  await user.click(await screen.findByRole('button', { name: /voucherAdmin\.createButton/ }));
  return screen.getAllByPlaceholderText('voucherAdmin.unlimited');
};

describe('AdminVouchersPage — ô giới hạn lượt dùng', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVouchers.mockResolvedValue({ data: { data: [] } });
    getPlans.mockResolvedValue({ data: { data: [] } });
    createVoucher.mockResolvedValue({});
  });

  const fillBasics = async (user) => {
    const code = screen.getAllByRole('textbox').find((el) => el.tagName === 'INPUT' && el.inputMode !== 'numeric');
    await user.type(code, 'KM2026');
    const priceInputs = screen.getAllByRole('textbox').filter((el) => el.inputMode === 'numeric');
    await user.type(priceInputs[0], '50000');
  };

  it('gõ 1500000 -> hiện 1.500.000, payload usageLimit = 1500000 (số); perUser giữ 1', async () => {
    const user = userEvent.setup();
    const [usage, perUser] = await openForm(user);
    await fillBasics(user);
    expect(perUser).toHaveValue('1');
    await user.type(usage, '1500000');
    expect(usage).toHaveValue('1.500.000');
    fireEvent.submit(usage.closest('form'));
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1));
    const payload = createVoucher.mock.calls[0][0];
    expect(payload.usageLimit).toBe(1500000);
    expect(payload.usageLimitPerUser).toBe(1);
  });

  it('để trống -> usageLimit null (không giới hạn)', async () => {
    const user = userEvent.setup();
    const [usage] = await openForm(user);
    await fillBasics(user);
    fireEvent.submit(usage.closest('form'));
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1));
    expect(createVoucher.mock.calls[0][0].usageLimit).toBeNull();
  });

  it('nhập 0 -> ô không hợp lệ (min=1) nên biểu mẫu bị chặn gửi', async () => {
    const user = userEvent.setup();
    const [usage] = await openForm(user);
    await user.type(usage, '0');
    expect(usage.checkValidity()).toBe(false);
    expect(usage.closest('form').checkValidity()).toBe(false);
  });
});
