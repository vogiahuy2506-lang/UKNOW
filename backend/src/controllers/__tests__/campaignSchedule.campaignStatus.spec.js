import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PLAN_NUT_HANH_DONG_TRONG_SO_DO_CHIEN_DICH_2026-09-16.md — PR-3, Việc 4.
 *
 * Lỗi im lặng đã đo: lịch tới giờ mà chiến dịch đang paused/draft thì createCampaignRunRecord
 * ném 400, scheduler chỉ console.error — không tạo lượt chạy, không cập nhật last_run_at, giao
 * diện không hiện gì. Bịt bằng cách trả thêm campaignStatus để giao diện tự cảnh báo trên dòng
 * lịch, không cần bảng mới.
 */
const mockRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
};

jest.unstable_mockModule('../../helpers.js', () => ({
  serverError: jest.fn((res) => res.status(500).json({ success: false })),
}));
jest.unstable_mockModule('../../utils/scheduler.js', () => ({
  requestCampaignScheduleRefresh: jest.fn(),
}));
jest.unstable_mockModule('../../repositories/campaign/campaignSchedule.repository.js', () => ({
  default: mockRepository,
}));
jest.unstable_mockModule('../../utils/onceScheduleValidation.util.js', () => ({
  assertOnceCronNotYearRolled: jest.fn(() => ({ ok: true })),
}));

const { default: CampaignScheduleControllerClass } = await import('../campaignSchedule.controller.js');

const makeRes = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
};

const owner = { id: 1, role: 'user', activeContext: { type: 'self' } };

describe('CampaignScheduleController — campaignStatus theo lịch (PR-3 Việc 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getAll trả campaignStatus cho từng dòng lịch (đọc từ c.status AS campaign_status)', async () => {
    mockRepository.findAll.mockResolvedValue([
      { id: 1, id_campaign: 10, campaign_name: 'Nháp buổi sáng', campaign_status: 'draft', schedule_name: 'Lịch A', schedule_type: 'daily', cron_expression: '0 9 * * *', enabled: true, run_count: 0 },
      { id: 2, id_campaign: 11, campaign_name: 'Đang chạy', campaign_status: 'active', schedule_name: 'Lịch B', schedule_type: 'daily', cron_expression: '0 9 * * *', enabled: true, run_count: 3 },
      { id: 3, id_campaign: 12, campaign_name: 'Tạm dừng', campaign_status: 'paused', schedule_name: 'Lịch C', schedule_type: 'daily', cron_expression: '0 9 * * *', enabled: true, run_count: 1 },
    ]);

    const req = { user: owner };
    const res = makeRes();
    const controller = new CampaignScheduleControllerClass();

    await controller.getAll(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: [
        expect.objectContaining({ id: 1, campaignStatus: 'draft' }),
        expect.objectContaining({ id: 2, campaignStatus: 'active' }),
        expect.objectContaining({ id: 3, campaignStatus: 'paused' }),
      ],
    }));
  });

  it('getById trả campaignStatus cho một lịch', async () => {
    mockRepository.findById.mockResolvedValue({
      id: 5, id_campaign: 50, campaign_name: 'Chiến dịch tạm dừng', campaign_status: 'paused',
      schedule_name: 'Lịch riêng', schedule_type: 'once', cron_expression: '0 9 1 1 *', enabled: true, run_count: 0,
    });

    const req = { user: owner, params: { id: '5' } };
    const res = makeRes();
    const controller = new CampaignScheduleControllerClass();

    await controller.getById(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ id: 5, campaignStatus: 'paused' }),
    }));
  });
});
