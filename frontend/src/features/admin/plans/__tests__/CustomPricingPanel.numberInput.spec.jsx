/**
 * Bảng giá gói riêng: các ô số nguyên dùng NumberInput (dấu chấm hàng nghìn) nhưng payload lưu vẫn là SỐ như cũ;
 * "Max" rỗng vẫn là null (không giới hạn).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomPricingPanel from '../CustomPricingPanel';
import adminPlansApiService from '../../services/adminPlansApi.service';

vi.mock('../../services/adminPlansApi.service', () => ({
  default: { getCustomPricing: vi.fn(), updateCustomPricing: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: (key) => key }) }));

const row = {
  itemKey: 'emails', planColumn: 'max_emails', unitPrice: 50, unitSize: 1000,
  includedQty: 0, minQty: 0, maxQty: null, stepQty: 1, isActive: true,
};

describe('CustomPricingPanel — ô số dùng NumberInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminPlansApiService.getCustomPricing.mockResolvedValue({ data: { data: [row] } });
    adminPlansApiService.updateCustomPricing.mockResolvedValue({});
  });

  it('hiện dấu chấm khi gõ số lớn; lưu gửi số (maxQty=1500000), các ô khác giữ kiểu số', async () => {
    const user = userEvent.setup();
    render(<CustomPricingPanel />);
    await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(6));
    const boxes = screen.getAllByRole('textbox');
    // [giá, unitSize, included, min, max, step]
    expect(boxes[1]).toHaveValue('1.000');
    expect(boxes[4]).toHaveValue('');
    await user.type(boxes[4], '1500000');
    expect(boxes[4]).toHaveValue('1.500.000');
    await user.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(adminPlansApiService.updateCustomPricing).toHaveBeenCalledTimes(1));
    const [key, payload] = adminPlansApiService.updateCustomPricing.mock.calls[0];
    expect(key).toBe('emails');
    expect(payload).toEqual({
      unitPrice: 50, unitSize: 1000, includedQty: 0, minQty: 0, maxQty: 1500000, stepQty: 1, isActive: true,
    });
  });

  it('xoá Max -> maxQty null (không giới hạn)', async () => {
    const user = userEvent.setup();
    adminPlansApiService.getCustomPricing.mockResolvedValue({ data: { data: [{ ...row, maxQty: 2000 }] } });
    render(<CustomPricingPanel />);
    await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(6));
    const max = screen.getAllByRole('textbox')[4];
    expect(max).toHaveValue('2.000');
    await user.clear(max);
    await user.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(adminPlansApiService.updateCustomPricing).toHaveBeenCalled());
    expect(adminPlansApiService.updateCustomPricing.mock.calls[0][1].maxQty).toBeNull();
  });
});
