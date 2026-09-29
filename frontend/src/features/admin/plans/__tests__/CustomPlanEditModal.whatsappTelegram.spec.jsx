/**
 * Sửa gói riêng rồi Lưu không đổi gì KHÔNG được xoá hạn mức WhatsApp/Telegram.
 * Bản cũ thiếu 2 khoá trong form -> payload undefined -> backend ghi NULL = "không giới hạn".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CustomPlanEditModal } from '../CustomPlanEditModal';
import adminPlansApiService from '../../services/adminPlansApi.service';

vi.mock('../../services/adminPlansApi.service', () => ({ default: { updatePlan: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: (key) => key }) }));

const plan = {
  id: 6, name: 'Gói riêng', price: 1000, maxWhatsappAccounts: 1, maxTelegramAccounts: 2, isActive: true,
};

describe('CustomPlanEditModal — hạn mức WhatsApp/Telegram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminPlansApiService.updatePlan.mockResolvedValue({});
  });

  it('Lưu không đổi gì -> updatePlan giữ maxWhatsappAccounts=1, maxTelegramAccounts=2', async () => {
    render(<CustomPlanEditModal plan={plan} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'adminPlans.saveChanges' }));
    await waitFor(() => expect(adminPlansApiService.updatePlan).toHaveBeenCalledTimes(1));
    const [id, payload] = adminPlansApiService.updatePlan.mock.calls[0];
    expect(id).toBe(6);
    expect(payload.maxWhatsappAccounts).toBe(1);
    expect(payload.maxTelegramAccounts).toBe(2);
  });
});
