/**
 * Ô số tiền rút dùng NumberInput: hiện dấu chấm hàng nghìn, nhưng `amount` gửi API vẫn là SỐ;
 * số tiền > số dư và < mức tối thiểu vẫn bị chặn như cũ.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WithdrawalModal from '../WithdrawalModal';

const { getPrefill, requestWithdrawal, toastError } = vi.hoisted(() => ({
  getPrefill: vi.fn(),
  requestWithdrawal: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../../services/affiliate.service', () => ({ default: { getPrefill, requestWithdrawal } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: toastError } }));
vi.mock('../../../i18n', () => {
  const t = (key, params) => (params?.balance ? `${key}:${params.balance}` : key);
  return { useI18n: () => ({ t }) };
});

const PREFILL = {
  fullName: 'Nguyen Van A', idNumber: '012345678901', bankName: 'VCB',
  bankAccountNumber: '123456789', bankAccountName: 'nguyen van a',
  idCardIssuedDate: '2020-01-01', idCardIssuedPlace: 'Ha Noi',
};

const setup = async (balance = 5_000_000) => {
  const user = userEvent.setup();
  const onSuccess = vi.fn();
  render(<WithdrawalModal isOpen onClose={() => {}} currentBalance={balance} onSuccess={onSuccess} />);
  await waitFor(() => expect(getPrefill).toHaveBeenCalled());
  const box = screen.getAllByRole('textbox')[0];
  await waitFor(() => expect(screen.getAllByRole('textbox').some((el) => el.value === 'Nguyen Van A')).toBe(true));
  return { user, box, form: box.closest('form') };
};

describe('WithdrawalModal — ô số tiền', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPrefill.mockResolvedValue({ data: PREFILL });
    requestWithdrawal.mockResolvedValue({});
  });

  it('mặc định hiện số dư có dấu chấm; gõ 2000000 -> 2.000.000 và gửi amount = 2000000 (số)', async () => {
    const { user, box, form } = await setup();
    expect(box).toHaveValue('5.000.000');
    await user.clear(box);
    await user.type(box, '2000000');
    expect(box).toHaveValue('2.000.000');
    fireEvent.submit(form);
    await waitFor(() => expect(requestWithdrawal).toHaveBeenCalledTimes(1));
    expect(requestWithdrawal.mock.calls[0][0].amount).toBe(2000000);
  });

  it('số tiền > số dư bị chặn, không gọi API', async () => {
    const { user, box, form } = await setup(5_000_000);
    await user.clear(box);
    await user.type(box, '5000001');
    expect(box).toHaveValue('5.000.001');
    fireEvent.submit(form);
    expect(requestWithdrawal).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('affiliate.errMaxAmount'));
  });

  it('số tiền < mức tối thiểu 1.000.000 bị chặn, không gọi API', async () => {
    const { user, box, form } = await setup(5_000_000);
    await user.clear(box);
    await user.type(box, '999999');
    fireEvent.submit(form);
    expect(requestWithdrawal).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('affiliate.errMinAmount');
  });

  it('số dư lẻ thập phân: hiển thị làm tròn, không bị đọc thành số lớn gấp 10', async () => {
    const { box } = await setup(1234567.4);
    expect(box).toHaveValue('1.234.567');
  });
});
