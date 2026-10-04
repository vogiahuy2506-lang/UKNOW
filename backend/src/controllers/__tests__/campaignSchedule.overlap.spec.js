import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PLAN_UOC_TINH 4.1 — tạo/sửa lịch BẬT bị chặn 409 SCHEDULE_OVERLAP khi lượt trước chưa xong mà lượt sau đã nổ.
 * Đi qua service overlap THẬT; mock ở ranh giới: repository lịch và `estimateForCampaign` (hình dạng hợp đồng PR-1).
 * Lịch dùng `daily` để kết quả không phụ thuộc đồng hồ máy chạy test (chiến dịch 72 giờ chồng với chính nó mọi lúc).
 */
const HOUR = 60 * 60 * 1000;
const mockRepository = {
  findCampaignForSchedule: jest.fn(),
  hasRunningCampaignRun: jest.fn(),
  findEnabledDuplicate: jest.fn(),
  findEnabledByCampaign: jest.fn(),
  create: jest.fn(),
  findMutableById: jest.fn(),
  update: jest.fn(),
};
const estimateForCampaign = jest.fn();
const logWorkspace = jest.fn();
const serverError = jest.fn((res) => res.status(500).json({ success: false }));

jest.unstable_mockModule('../../helpers.js', () => ({ serverError }));
jest.unstable_mockModule('../../utils/scheduler.js', () => ({ requestCampaignScheduleRefresh: jest.fn() }));
jest.unstable_mockModule('../../repositories/campaign/campaignSchedule.repository.js', () => ({ default: mockRepository }));
jest.unstable_mockModule('../../services/campaign/campaignEstimate.service.js', () => ({ estimateForCampaign }));
jest.unstable_mockModule('../../utils/onceScheduleValidation.util.js', () => ({
  assertOnceCronNotYearRolled: jest.fn(() => ({ ok: true })),
}));
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  logWorkspace,
  AUDIT_ACTIONS: {
    CAMPAIGN_SCHEDULE_CREATED: 'CAMPAIGN_SCHEDULE_CREATED',
    CAMPAIGN_SCHEDULE_UPDATED: 'CAMPAIGN_SCHEDULE_UPDATED',
    CAMPAIGN_SCHEDULE_TOGGLED: 'CAMPAIGN_SCHEDULE_TOGGLED',
  },
  AUDIT_ENTITY_TYPES: { CAMPAIGN: 'campaign' },
}));
jest.unstable_mockModule('../../services/campaign/campaignPreflight.service.js', () => ({
  validateCampaignPreflight: jest.fn().mockResolvedValue({ valid: true, nodes: [] }),
}));

const { default: CampaignScheduleController } = await import('../campaignSchedule.controller.js');

const makeRes = () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
};
const owner = { id: 39, role: 'user', activeContext: { type: 'self' } };
const row = (over = {}) => ({
  id: 177, id_campaign: 438, schedule_name: 'Hằng ngày', schedule_type: 'daily', cron_expression: '0 6 * * *',
  enabled: true, run_count: 0, last_run_at: null, created_at: new Date(), updated_at: new Date(), ...over,
});
const mutable = (over = {}) => ({
  id: 177, id_campaign: 438, schedule_type: 'daily', cron_expression: '0 6 * * *', enabled: false, run_count: 0,
  last_run_at: null, created_at: new Date('2026-09-30T01:00:00.000Z'), workspace_owner_id: 39, campaign_status: 'active', ...over,
});
const createReq = (body = {}) => ({
  user: owner, headers: {}, ip: '1.1.1.1',
  body: { campaignId: 438, scheduleName: 'Hằng ngày', scheduleType: 'daily', cronExpression: '0 6 * * *', ...body },
});
const updateReq = (body) => ({ user: owner, headers: {}, params: { id: '177' }, body });
const controller = () => new CampaignScheduleController();
const estimateTakes = (hours, extra = {}) => estimateForCampaign.mockImplementation(async ({ startAt }) => ({
  finishAtLatest: new Date(startAt.getTime() + hours * HOUR).toISOString(), totalActions: 1596, warnings: [], ...extra,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRepository.findCampaignForSchedule.mockResolvedValue({ id: 438, status: 'active', workspace_owner_id: 39 });
  mockRepository.hasRunningCampaignRun.mockResolvedValue(false);
  mockRepository.findEnabledDuplicate.mockResolvedValue(null);
  mockRepository.findEnabledByCampaign.mockResolvedValue([]);
  mockRepository.create.mockResolvedValue(row());
  mockRepository.update.mockResolvedValue(row());
  logWorkspace.mockResolvedValue(undefined);
  estimateTakes(72);
});

describe('create — 409 SCHEDULE_OVERLAP', () => {
  it('lịch daily cho chiến dịch 72 giờ → 409 đúng hình dạng hợp đồng; KHÔNG tạo, KHÔNG ghi nhật ký', async () => {
    const res = makeRes();
    await controller().create(createReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({
      success: false,
      code: 'SCHEDULE_OVERLAP',
      message: expect.stringContaining('sẽ bị bỏ qua'),
      overlap: {
        previousFireAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        estimatedFinishAt: expect.any(String),
        nextFireAt: expect.any(String),
        scheduleIds: [],
      },
      suggestions: ['use_steps', 'add_accounts', 'spread_schedule'],
    });
    // 72 giờ sau lần trước = 3 ngày; lần sau cách đúng 1 ngày.
    const previous = new Date(body.overlap.previousFireAt).getTime();
    expect(new Date(body.overlap.estimatedFinishAt).getTime() - previous).toBe(72 * HOUR);
    expect(new Date(body.overlap.nextFireAt).getTime() - previous).toBe(24 * HOUR);
    expect(mockRepository.create).not.toHaveBeenCalled();
    expect(logWorkspace).not.toHaveBeenCalled();
    expect(estimateForCampaign).toHaveBeenCalledWith(expect.objectContaining({ campaignId: 438, ownerUserId: 39 }));
  });

  it('chiến dịch xong trong 20 giờ → 201, không có `warnings`', async () => {
    estimateTakes(20);
    const res = makeRes();
    await controller().create(createReq(), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('warnings');
    expect(mockRepository.create).toHaveBeenCalledTimes(1);
  });

  it('ước tính NÉM lỗi → vẫn tạo được (không chặn)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      estimateForCampaign.mockRejectedValue(new Error('db down'));
      const res = makeRes();
      await controller().create(createReq(), res);
      expect(res.status).toHaveBeenCalledWith(201);
    } finally {
      warn.mockRestore();
    }
  });

  it('không đếm được người nhận → 201 kèm `warnings` trong body', async () => {
    estimateTakes(72, { warnings: [{ code: 'recipient_count_unknown', params: { nodeId: '3', reason: 'timeout' } }] });
    const res = makeRes();
    await controller().create(createReq(), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].warnings).toEqual([{ code: 'recipient_count_unknown', params: { nodeId: '3', reason: 'timeout' } }]);
  });

  it('lịch TẮT (soạn sẵn) không bị kiểm chồng', async () => {
    const res = makeRes();
    await controller().create(createReq({ enabled: false }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(estimateForCampaign).not.toHaveBeenCalled();
    expect(mockRepository.findEnabledByCampaign).not.toHaveBeenCalled();
  });
});

describe('update — chỉ kiểm khi lịch ĐANG BẬT sau khi sửa và vừa bật / vừa đổi kiểu-giờ', () => {
  it('bật lại lịch tắt mà chiến dịch 72 giờ → 409, không cập nhật; lịch được sửa nằm trong scheduleIds', async () => {
    mockRepository.findMutableById.mockResolvedValue(mutable());
    const res = makeRes();
    await controller().update(updateReq({ enabled: true }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'SCHEDULE_OVERLAP', overlap: { scheduleIds: [177] } });
    expect(mockRepository.update).not.toHaveBeenCalled();
  });

  it('đổi giờ lịch đang bật (kiểm theo cron MỚI): 20 giờ thì qua, 72 giờ thì 409', async () => {
    mockRepository.findMutableById.mockResolvedValue(mutable({ enabled: true }));
    estimateTakes(20);
    const ok = makeRes();
    await controller().update(updateReq({ cronExpression: '0 7 * * *' }), ok);
    expect(ok.status).not.toHaveBeenCalledWith(409);
    expect(mockRepository.update).toHaveBeenCalledTimes(1);

    estimateTakes(72);
    const blocked = makeRes();
    await controller().update(updateReq({ cronExpression: '0 7 * * *' }), blocked);
    expect(blocked.status).toHaveBeenCalledWith(409);
    expect(mockRepository.update).toHaveBeenCalledTimes(1);
  });

  it('chỉ đổi tên, hoặc TẮT lịch → không kiểm chồng (kể cả khi chiến dịch 72 giờ)', async () => {
    mockRepository.findMutableById.mockResolvedValue(mutable({ enabled: true }));
    await controller().update(updateReq({ scheduleName: 'Tên mới' }), makeRes());
    await controller().update(updateReq({ enabled: false }), makeRes());
    expect(estimateForCampaign).not.toHaveBeenCalled();
    expect(mockRepository.update).toHaveBeenCalledTimes(2);
  });

  it('lịch cũ đã chồng nhau từ trước, chỉ đổi tên → không bị chặn', async () => {
    mockRepository.findEnabledByCampaign.mockResolvedValue([
      { id: 177, schedule_type: 'daily', cron_expression: '0 6 * * *', enabled: true, last_run_at: null, created_at: '2026-09-30T01:00:00.000Z' },
      { id: 178, schedule_type: 'daily', cron_expression: '0 7 * * *', enabled: true, last_run_at: null, created_at: '2026-09-30T01:00:00.000Z' },
    ]);
    mockRepository.findMutableById.mockResolvedValue(mutable({ enabled: true }));
    const res = makeRes();
    await controller().update(updateReq({ scheduleName: 'Tên mới' }), res);
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(mockRepository.update).toHaveBeenCalledTimes(1);
  });
});
