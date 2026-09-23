import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Lệnh giao 21/09/2026 (lịch chạy không được chết im lặng), PR-1 Việc 1.1.
 * Chiến dịch 395 còn `draft`, người dùng đặt 2 lịch bật, 07:30 lịch nổ và chết im lặng.
 * Đặt lịch BẬT cho chiến dịch chưa `active` phải bị chặn 409 kèm câu nói đúng việc cần làm.
 */
const mockRepository = {
  findCampaignForSchedule: jest.fn(),
  hasRunningCampaignRun: jest.fn(),
  create: jest.fn(),
  findMutableById: jest.fn(),
  findEnabledDuplicate: jest.fn(),
  update: jest.fn(),
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
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  logWorkspace: jest.fn(async () => {}),
  AUDIT_ACTIONS: {},
  AUDIT_ENTITY_TYPES: { CAMPAIGN: 'campaign' },
}));
jest.unstable_mockModule('../../utils/onceScheduleValidation.util.js', () => ({
  assertOnceCronNotYearRolled: jest.fn(() => ({ ok: true })),
}));

const { default: CampaignScheduleController } = await import('../campaignSchedule.controller.js');

const makeRes = () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
};
const owner = { id: 1, role: 'user', activeContext: { type: 'self' } };
const employeeWithoutRun = {
  id: 2, role: 'user',
  activeContext: { type: 'employee', ownerId: 1, permissions: { campaigns_create: true, campaigns_run: false } },
};

const createdRow = {
  id: 200, id_campaign: 395, schedule_name: 'Nhắc lịch', schedule_type: 'once', cron_expression: '30 07 21 9 *',
  enabled: true, run_count: 0, last_run_at: null, next_run_at: null, created_at: new Date(), updated_at: new Date(),
};
const createReq = (body = {}, user = owner) => ({
  user,
  body: { campaignId: 395, scheduleName: 'Nhắc lịch', scheduleType: 'once', cronExpression: '30 07 21 9 *', ...body },
});

describe('CampaignScheduleController.create — chiến dịch không hoạt động', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepository.hasRunningCampaignRun.mockResolvedValue(false);
    mockRepository.findEnabledDuplicate.mockResolvedValue(null);
    mockRepository.create.mockResolvedValue(createdRow);
  });

  it('draft + lịch bật (mặc định) → 409 CAMPAIGN_NOT_ACTIVE, câu nói đúng việc phải làm, KHÔNG tạo lịch', async () => {
    mockRepository.findCampaignForSchedule.mockResolvedValue({ id: 395, status: 'draft', workspace_owner_id: 1 });
    const res = makeRes();
    await new CampaignScheduleController().create(createReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      code: 'CAMPAIGN_NOT_ACTIVE',
      campaignStatus: 'draft',
      message: 'Chiến dịch đang ở trạng thái Nháp nên lịch sẽ không chạy. Hãy chọn «Kích hoạt & tạo lịch» — hệ thống bật chiến dịch mà không gửi tin nào ngay.',
    });
    expect(mockRepository.create).not.toHaveBeenCalled();
  });

  it.each([[true], ['true'], [1], ['1'], [undefined]])('enabled=%p (đều là bật) trên chiến dịch draft → 409', async (enabled) => {
    mockRepository.findCampaignForSchedule.mockResolvedValue({ id: 395, status: 'draft', workspace_owner_id: 1 });
    const res = makeRes();
    await new CampaignScheduleController().create(createReq({ enabled }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockRepository.create).not.toHaveBeenCalled();
  });

  it('paused → chữ "Tạm dừng" chứ không phải "Nháp"', async () => {
    mockRepository.findCampaignForSchedule.mockResolvedValue({ id: 395, status: 'paused', workspace_owner_id: 1 });
    const res = makeRes();
    await new CampaignScheduleController().create(createReq(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].message).toContain('trạng thái Tạm dừng');
    expect(res.json.mock.calls[0][0].message).not.toContain('Nháp');
  });

  it.each([[false], ['false'], [0], ['0']])('lịch TẮT (enabled=%p) trên chiến dịch draft → vẫn tạo được (soạn sẵn)', async (enabled) => {
    mockRepository.findCampaignForSchedule.mockResolvedValue({ id: 395, status: 'draft', workspace_owner_id: 1 });
    const res = makeRes();
    await new CampaignScheduleController().create(createReq({ enabled }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockRepository.create).toHaveBeenCalledTimes(1);
  });

  it('chiến dịch active + lịch bật → tạo như cũ', async () => {
    mockRepository.findCampaignForSchedule.mockResolvedValue({ id: 395, status: 'active', workspace_owner_id: 1 });
    const res = makeRes();
    await new CampaignScheduleController().create(createReq(), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockRepository.create).toHaveBeenCalledTimes(1);
  });

  it('nhân viên không có campaigns_run vẫn nhận 403 trước (không bị chỉ cách kích hoạt chiến dịch)', async () => {
    mockRepository.findCampaignForSchedule.mockResolvedValue({ id: 395, status: 'draft', workspace_owner_id: 1 });
    const res = makeRes();
    await new CampaignScheduleController().create(createReq({}, employeeWithoutRun), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
  });

  it('chiến dịch đang chạy vẫn trả 409 "đang chạy" như cũ (kiểm trước)', async () => {
    mockRepository.findCampaignForSchedule.mockResolvedValue({ id: 395, status: 'draft', workspace_owner_id: 1 });
    mockRepository.hasRunningCampaignRun.mockResolvedValue(true);
    const res = makeRes();
    await new CampaignScheduleController().create(createReq(), res);
    expect(res.json.mock.calls[0][0].message).toBe('Chiến dịch đang chạy, tạm thời chưa thể lên lịch');
  });
});

describe('CampaignScheduleController.update — bật lại lịch đang tắt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepository.hasRunningCampaignRun.mockResolvedValue(false);
    mockRepository.findEnabledDuplicate.mockResolvedValue(null);
    mockRepository.update.mockResolvedValue({ ...createdRow, enabled: true });
  });
  const updateReq = (body, user = owner) => ({ user, params: { id: '177' }, body });
  const schedule = (over = {}) => ({
    id: 177, id_campaign: 395, schedule_type: 'daily', cron_expression: '0 9 * * *',
    enabled: false, run_count: 0, last_run_at: null, workspace_owner_id: 1, campaign_status: 'draft', ...over,
  });

  it('bật lịch đang tắt của chiến dịch draft → 409 CAMPAIGN_NOT_ACTIVE, không cập nhật', async () => {
    mockRepository.findMutableById.mockResolvedValue(schedule());
    const res = makeRes();
    await new CampaignScheduleController().update(updateReq({ enabled: true }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'CAMPAIGN_NOT_ACTIVE',
      message: expect.stringContaining('trạng thái Nháp'),
    }));
    expect(mockRepository.update).not.toHaveBeenCalled();
  });

  it('bật lịch đang tắt của chiến dịch active → cập nhật được', async () => {
    mockRepository.findMutableById.mockResolvedValue(schedule({ campaign_status: 'active' }));
    const res = makeRes();
    await new CampaignScheduleController().update(updateReq({ enabled: true }), res);
    expect(mockRepository.update).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalledWith(409);
  });

  it('TẮT lịch của chiến dịch draft → luôn được (không chặn việc dừng)', async () => {
    mockRepository.findMutableById.mockResolvedValue(schedule({ enabled: true }));
    const res = makeRes();
    await new CampaignScheduleController().update(updateReq({ enabled: false }), res);
    expect(mockRepository.update).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalledWith(409);
  });

  it('lịch ĐÃ bật từ trước, chỉ sửa tên (kèm enabled:true) trên chiến dịch draft → không bị chặn', async () => {
    mockRepository.findMutableById.mockResolvedValue(schedule({ enabled: true }));
    const res = makeRes();
    await new CampaignScheduleController().update(updateReq({ enabled: true, scheduleName: 'Tên mới' }), res);
    expect(mockRepository.update).toHaveBeenCalledTimes(1);
  });

  it('sửa tên khi lịch đang tắt và KHÔNG gửi enabled → không chặn', async () => {
    mockRepository.findMutableById.mockResolvedValue(schedule());
    const res = makeRes();
    await new CampaignScheduleController().update(updateReq({ scheduleName: 'Tên mới' }), res);
    expect(mockRepository.update).toHaveBeenCalledTimes(1);
  });
});
