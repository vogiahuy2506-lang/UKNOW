import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPut, mockGet } = vi.hoisted(() => ({
  mockPut: vi.fn().mockResolvedValue({ data: {} }),
  mockGet: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock('../../../../services/api', () => ({
  default: { get: mockGet, put: mockPut },
}));

const { default: adminSubscriptionReminderSettingsApiService } = await import('../adminSubscriptionReminderSettingsApi.service');

// PLAN_MOC_NHAC_HAN_THEO_KY B5 — trang admin mock service này nên KHÔNG chạm tới hình dạng payload thật;
// spec này là chỗ duy nhất canh rằng PUT mang CẢ HAI danh sách (gói tháng `daysBefore`, gói năm `daysBeforeYearly`).
describe('adminSubscriptionReminderSettingsApiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updateSettings PUT một lần với cả daysBefore (gói tháng) và daysBeforeYearly (gói năm)', async () => {
    await adminSubscriptionReminderSettingsApiService.updateSettings({
      daysBefore: [7, 3],
      daysBeforeYearly: [30, 7, 3],
    });

    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith('/admin/subscription-reminder-settings', {
      daysBefore: [7, 3],
      daysBeforeYearly: [30, 7, 3],
    });
  });

  it('getSettings GET đúng đường dẫn', async () => {
    await adminSubscriptionReminderSettingsApiService.getSettings();

    expect(mockGet).toHaveBeenCalledWith('/admin/subscription-reminder-settings');
  });
});
