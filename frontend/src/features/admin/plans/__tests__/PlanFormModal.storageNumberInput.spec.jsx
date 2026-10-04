/**
 * Ô "Dung lượng lưu trữ (MB)" dùng NumberInput: gõ 20000 hiện 20.000, payload vẫn là BYTE (MB * 1048576) kiểu số.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomPlanEditModal } from '../CustomPlanEditModal';
import adminPlansApiService from '../../services/adminPlansApi.service';

vi.mock('../../services/adminPlansApi.service', () => ({ default: { updatePlan: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: (key) => key }) }));

describe('Gói riêng — ô dung lượng (MB)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminPlansApiService.updatePlan.mockResolvedValue({});
  });

  it('gõ 20000 -> hiện 20.000, updatePlan gửi storageLimitBytes = 20000 * 1048576', async () => {
    const user = userEvent.setup();
    render(<CustomPlanEditModal plan={{ id: 6, name: 'Gói riêng', price: 1000, storageLimitBytes: 5 * 1048576, isActive: true }} onClose={() => {}} onSaved={() => {}} />);
    const box = screen.getByDisplayValue('5');
    // Ô luôn hiện tối thiểu 1 (Math.max) nên thay thế phần đang chọn thay vì xoá rồi gõ.
    await user.type(box, '20000', { initialSelectionStart: 0, initialSelectionEnd: 1 });
    expect(box).toHaveValue('20.000');
    await user.click(screen.getByRole('button', { name: 'adminPlans.saveChanges' }));
    await waitFor(() => expect(adminPlansApiService.updatePlan).toHaveBeenCalledTimes(1));
    expect(adminPlansApiService.updatePlan.mock.calls[0][1].storageLimitBytes).toBe(20000 * 1048576);
  });
});
