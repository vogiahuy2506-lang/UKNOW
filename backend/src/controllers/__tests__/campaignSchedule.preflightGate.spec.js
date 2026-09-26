import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-4 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) Việc 3 — bật lịch (tạo lịch bật, hoặc bật lại
 * lịch đang tắt) phải qua preflight, không chỉ lúc bấm "Chạy ngay". Lịch TẮT vẫn cho soạn, không
 * preflight.
 */
const mockRepository = {
  findCampaignForSchedule: jest.fn(),
  hasRunningCampaignRun: jest.fn(),
  findEnabledDuplicate: jest.fn(),
  create: jest.fn(),
  findMutableById: jest.fn(),
  update: jest.fn(),
};
const mockValidateCampaignPreflight = jest.fn();

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
  logWorkspace: jest.fn().mockResolvedValue(undefined),
  AUDIT_ACTIONS: new Proxy({}, { get: (_t, prop) => String(prop) }),
  AUDIT_ENTITY_TYPES: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));
jest.unstable_mockModule('../../utils/onceScheduleValidation.util.js', () => ({
  assertOnceCronNotYearRolled: jest.fn(() => ({ ok: true })),
}));
jest.unstable_mockModule('../../services/campaign/campaignPreflight.service.js', () => ({
  validateCampaignPreflight: mockValidateCampaignPreflight,
}));

const { default: CampaignScheduleController } = await import('../campaignSchedule.controller.js');

const makeRes = () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
};
const owner = { id: 39, role: 'user', activeContext: { type: 'self' } };
const senderDisconnectedError = Object.assign(new Error('Tài khoản Zalo gửi tin đã bị ngắt kết nối'), {
  code: 'SENDER_DISCONNECTED',
  statusCode: 400,
});

const createReq = (body = {}) => ({
  user: owner,
  body: { campaignId: 395, scheduleName: 'Nhắc lịch', scheduleType: 'daily', cronExpression: '0 9 * * *', ...body },
});
const updateReq = (body) => ({ user: owner, params: { id: '177' }, body });

beforeEach(() => {
  jest.clearAllMocks();
  mockRepository.findCampaignForSchedule.mockResolvedValue({ id: 395, status: 'active', workspace_owner_id: 39 });
  mockRepository.hasRunningCampaignRun.mockResolvedValue(false);
  mockRepository.findEnabledDuplicate.mockResolvedValue(null);
  mockRepository.create.mockResolvedValue({ id: 200, id_campaign: 395, schedule_name: 'Nhắc lịch', schedule_type: 'daily', cron_expression: '0 9 * * *', enabled: true, run_count: 0, last_run_at: null, created_at: new Date(), updated_at: new Date() });
  mockRepository.update.mockResolvedValue({ id: 177, id_campaign: 395, schedule_type: 'daily', cron_expression: '0 9 * * *', enabled: true, run_count: 0, last_run_at: null, created_at: new Date(), updated_at: new Date() });
  mockValidateCampaignPreflight.mockResolvedValue({ valid: true, nodes: [] });
});

describe('CampaignScheduleController.create — preflight khi bật lịch', () => {
  it('preflight ném SENDER_DISCONNECTED → 400 đúng code/message, KHÔNG tạo lịch', async () => {
    mockValidateCampaignPreflight.mockRejectedValue(senderDisconnectedError);
    const res = makeRes();
    await new CampaignScheduleController().create(createReq(), res);

    expect(mockValidateCampaignPreflight).toHaveBeenCalledWith({ campaignId: 395, workspaceOwnerId: 39 });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      code: 'SENDER_DISCONNECTED',
      message: senderDisconnectedError.message,
    });
    expect(mockRepository.create).not.toHaveBeenCalled();
  });

  it('preflight qua → tạo lịch bật như thường', async () => {
    const res = makeRes();
    await new CampaignScheduleController().create(createReq(), res);
    expect(mockValidateCampaignPreflight).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockRepository.create).toHaveBeenCalledTimes(1);
  });

  it('lịch TẮT (enabled:false) → KHÔNG gọi preflight, vẫn tạo được (soạn sẵn)', async () => {
    const res = makeRes();
    await new CampaignScheduleController().create(createReq({ enabled: false }), res);
    expect(mockValidateCampaignPreflight).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('preflight chạy TRƯỚC bước kiểm trùng lịch (không lãng phí kiểm trùng nếu preflight đã chặn)', async () => {
    mockValidateCampaignPreflight.mockRejectedValue(senderDisconnectedError);
    const res = makeRes();
    await new CampaignScheduleController().create(createReq(), res);
    expect(mockRepository.findEnabledDuplicate).not.toHaveBeenCalled();
  });
});

describe('CampaignScheduleController.update — preflight khi bật lại lịch đang tắt', () => {
  const mutableSchedule = (over = {}) => ({
    id: 177, id_campaign: 395, schedule_type: 'daily', cron_expression: '0 9 * * *',
    enabled: false, run_count: 0, last_run_at: null, workspace_owner_id: 39, campaign_status: 'active', ...over,
  });

  it('bật lại lịch đang tắt, preflight ném lỗi → 400, KHÔNG cập nhật', async () => {
    mockRepository.findMutableById.mockResolvedValue(mutableSchedule());
    mockValidateCampaignPreflight.mockRejectedValue(senderDisconnectedError);
    const res = makeRes();
    await new CampaignScheduleController().update(updateReq({ enabled: true }), res);

    expect(mockValidateCampaignPreflight).toHaveBeenCalledWith({ campaignId: 395, workspaceOwnerId: 39 });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SENDER_DISCONNECTED' }));
    expect(mockRepository.update).not.toHaveBeenCalled();
  });

  it('bật lại lịch đang tắt, preflight qua → cập nhật được', async () => {
    mockRepository.findMutableById.mockResolvedValue(mutableSchedule());
    const res = makeRes();
    await new CampaignScheduleController().update(updateReq({ enabled: true }), res);
    expect(mockValidateCampaignPreflight).toHaveBeenCalledTimes(1);
    expect(mockRepository.update).toHaveBeenCalledTimes(1);
  });

  it('lịch ĐÃ bật từ trước, chỉ sửa tên (không bật thêm) → KHÔNG gọi preflight', async () => {
    mockRepository.findMutableById.mockResolvedValue(mutableSchedule({ enabled: true }));
    const res = makeRes();
    await new CampaignScheduleController().update(updateReq({ scheduleName: 'Tên mới' }), res);
    expect(mockValidateCampaignPreflight).not.toHaveBeenCalled();
    expect(mockRepository.update).toHaveBeenCalledTimes(1);
  });

  it('TẮT lịch đang bật → KHÔNG gọi preflight', async () => {
    mockRepository.findMutableById.mockResolvedValue(mutableSchedule({ enabled: true }));
    const res = makeRes();
    await new CampaignScheduleController().update(updateReq({ enabled: false }), res);
    expect(mockValidateCampaignPreflight).not.toHaveBeenCalled();
  });
});
