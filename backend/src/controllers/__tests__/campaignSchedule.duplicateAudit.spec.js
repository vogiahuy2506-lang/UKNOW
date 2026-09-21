import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Lệnh giao 21/09/2026 (lịch chạy không được chết im lặng), PR-2.
 *  - Việc 2.1: lịch trùng hệt (vụ #177/#178 cách nhau một phút; #31/#33 tháng 8/2026) bị chặn 409.
 *  - Việc 2.2: tạo/sửa/bật-tắt/xoá lịch phải để lại dòng nhật ký, entity_id = id_campaign.
 */
const mockRepository = {
  findCampaignForSchedule: jest.fn(),
  hasRunningCampaignRun: jest.fn(),
  findEnabledDuplicate: jest.fn(),
  create: jest.fn(),
  findMutableById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
const logWorkspace = jest.fn();
const serverError = jest.fn((res) => res.status(500).json({ success: false }));

jest.unstable_mockModule('../../helpers.js', () => ({ serverError }));
jest.unstable_mockModule('../../utils/scheduler.js', () => ({ requestCampaignScheduleRefresh: jest.fn() }));
jest.unstable_mockModule('../../repositories/campaign/campaignSchedule.repository.js', () => ({ default: mockRepository }));
jest.unstable_mockModule('../../utils/onceScheduleValidation.util.js', () => ({
  assertOnceCronNotYearRolled: jest.fn(() => ({ ok: true })),
}));
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  logWorkspace,
  AUDIT_ACTIONS: {
    CAMPAIGN_SCHEDULE_CREATED: 'CAMPAIGN_SCHEDULE_CREATED',
    CAMPAIGN_SCHEDULE_UPDATED: 'CAMPAIGN_SCHEDULE_UPDATED',
    CAMPAIGN_SCHEDULE_DELETED: 'CAMPAIGN_SCHEDULE_DELETED',
    CAMPAIGN_SCHEDULE_TOGGLED: 'CAMPAIGN_SCHEDULE_TOGGLED',
  },
  AUDIT_ENTITY_TYPES: { CAMPAIGN: 'campaign' },
}));

const { default: CampaignScheduleController } = await import('../campaignSchedule.controller.js');

const makeRes = () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
};
const owner = { id: 39, role: 'user', activeContext: { type: 'self' } };
const employee = { id: 7, role: 'user', activeContext: { type: 'employee', ownerId: 39, permissions: { campaigns_run: true } } };

const row = (over = {}) => ({
  id: 177, id_campaign: 395, schedule_name: 'Nhắc lịch', schedule_type: 'once', cron_expression: '30 07 21 9 *',
  enabled: true, run_count: 0, last_run_at: null, next_run_at: null, created_at: new Date(), updated_at: new Date(), ...over,
});
const mutable = (over = {}) => ({
  id: 177, id_campaign: 395, schedule_type: 'daily', cron_expression: '0 9 * * *',
  enabled: false, run_count: 0, last_run_at: null, workspace_owner_id: 39, campaign_status: 'active', ...over,
});
const createReq = (body = {}, user = owner) => ({
  user, headers: { 'user-agent': 'jest' }, ip: '1.2.3.4',
  body: { campaignId: 395, scheduleName: 'Nhắc lịch', scheduleType: 'once', cronExpression: '30 07 21 9 *', ...body },
});
const updateReq = (body, user = owner) => ({ user, headers: {}, params: { id: '177' }, body });
const controller = () => new CampaignScheduleController();

beforeEach(() => {
  jest.clearAllMocks();
  mockRepository.findCampaignForSchedule.mockResolvedValue({ id: 395, status: 'active', workspace_owner_id: 39 });
  mockRepository.hasRunningCampaignRun.mockResolvedValue(false);
  mockRepository.findEnabledDuplicate.mockResolvedValue(null);
  mockRepository.create.mockResolvedValue(row());
  mockRepository.update.mockResolvedValue(row({ enabled: true }));
  mockRepository.delete.mockResolvedValue(true);
  logWorkspace.mockResolvedValue(undefined);
});

describe('create — chặn lịch trùng hệt (Việc 2.1)', () => {
  it('đã có lịch BẬT cùng chiến dịch + kiểu + cron → 409 SCHEDULE_DUPLICATE, KHÔNG tạo, KHÔNG ghi nhật ký', async () => {
    mockRepository.findEnabledDuplicate.mockResolvedValue({ id: 177 });
    const res = makeRes();
    await controller().create(createReq(), res);

    expect(mockRepository.findEnabledDuplicate).toHaveBeenCalledWith({
      campaignId: 395, scheduleType: 'once', cronExpression: '30 07 21 9 *',
    });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      code: 'SCHEDULE_DUPLICATE',
      message: expect.stringContaining('Chiến dịch đã có lịch chạy y hệt'),
    });
    expect(mockRepository.create).not.toHaveBeenCalled();
    expect(logWorkspace).not.toHaveBeenCalled();
  });

  it('không trùng → tạo được', async () => {
    const res = makeRes();
    await controller().create(createReq(), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockRepository.create).toHaveBeenCalledTimes(1);
  });

  it('lịch TẮT (soạn sẵn) không bị kiểm trùng vì index chỉ tính lịch bật; bật lại thì bị kiểm ở update', async () => {
    mockRepository.findEnabledDuplicate.mockResolvedValue({ id: 177 });
    const res = makeRes();
    await controller().create(createReq({ enabled: false }), res);
    expect(mockRepository.findEnabledDuplicate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('hai request cùng lúc lọt qua bước kiểm → DB chặn nốt (23505 trên index bán phần) vẫn ra 409 tiếng người, không phải 500', async () => {
    mockRepository.create.mockRejectedValue(Object.assign(new Error('duplicate key'), {
      code: '23505', constraint: 'uq_campaign_schedules_enabled_dup',
    }));
    const res = makeRes();
    await controller().create(createReq(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SCHEDULE_DUPLICATE' }));
    expect(serverError).not.toHaveBeenCalled();
  });

  it('lỗi unique KHÁC (constraint lạ) vẫn là 500, không bị nuốt thành "lịch trùng"', async () => {
    mockRepository.create.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'some_other_key' }));
    const res = makeRes();
    await controller().create(createReq(), res);
    expect(serverError).toHaveBeenCalledTimes(1);
  });
});

describe('update — bật lại / đổi giờ không được thành lịch trùng (Việc 2.1)', () => {
  it('bật lại lịch đang tắt mà đã có lịch bật y hệt → 409, không cập nhật (loại trừ chính nó)', async () => {
    mockRepository.findMutableById.mockResolvedValue(mutable());
    mockRepository.findEnabledDuplicate.mockResolvedValue({ id: 178 });
    const res = makeRes();
    await controller().update(updateReq({ enabled: true }), res);

    expect(mockRepository.findEnabledDuplicate).toHaveBeenCalledWith({
      campaignId: 395, scheduleType: 'daily', cronExpression: '0 9 * * *', excludeId: 177,
    });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SCHEDULE_DUPLICATE' }));
    expect(mockRepository.update).not.toHaveBeenCalled();
  });

  it('đổi giờ của lịch đang bật sang đúng giờ của lịch bật khác → 409, kiểm theo cron MỚI', async () => {
    mockRepository.findMutableById.mockResolvedValue(mutable({ enabled: true }));
    mockRepository.findEnabledDuplicate.mockResolvedValue({ id: 178 });
    const res = makeRes();
    await controller().update(updateReq({ cronExpression: '30 8 * * *' }), res);
    expect(mockRepository.findEnabledDuplicate).toHaveBeenCalledWith(expect.objectContaining({ cronExpression: '30 8 * * *', excludeId: 177 }));
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('TẮT lịch, hoặc chỉ đổi tên lịch đang bật → không kiểm trùng', async () => {
    mockRepository.findMutableById.mockResolvedValue(mutable({ enabled: true }));
    await controller().update(updateReq({ enabled: false }), makeRes());
    await controller().update(updateReq({ scheduleName: 'Tên mới' }), makeRes());
    expect(mockRepository.findEnabledDuplicate).not.toHaveBeenCalled();
    expect(mockRepository.update).toHaveBeenCalledTimes(2);
  });

  it('23505 lúc cập nhật → 409 SCHEDULE_DUPLICATE', async () => {
    mockRepository.findMutableById.mockResolvedValue(mutable());
    mockRepository.update.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505', constraint: 'uq_campaign_schedules_enabled_dup' }));
    const res = makeRes();
    await controller().update(updateReq({ enabled: true }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SCHEDULE_DUPLICATE' }));
  });
});

describe('nhật ký thao tác lịch (Việc 2.2)', () => {
  it('tạo lịch → CAMPAIGN_SCHEDULE_CREATED, entity campaign, entity_id = id_campaign, details có scheduleId + enabled', async () => {
    await controller().create(createReq({}, employee), makeRes());
    expect(logWorkspace).toHaveBeenCalledTimes(1);
    const [context, action, entityType, entityId, details] = logWorkspace.mock.calls[0];
    expect(context).toMatchObject({ userId: 7, ownerId: 39, ipAddress: '1.2.3.4', userAgent: 'jest' });
    expect(action).toBe('CAMPAIGN_SCHEDULE_CREATED');
    expect(entityType).toBe('campaign');
    expect(entityId).toBe(395);
    expect(details).toEqual({ scheduleId: 177, scheduleType: 'once', cronExpression: '30 07 21 9 *', enabled: true });
  });

  it('bật lịch đang tắt → CAMPAIGN_SCHEDULE_TOGGLED {enabled:true, previousEnabled:false}', async () => {
    mockRepository.findMutableById.mockResolvedValue(mutable());
    await controller().update(updateReq({ enabled: true }), makeRes());
    expect(logWorkspace).toHaveBeenCalledTimes(1);
    const [, action, , entityId, details] = logWorkspace.mock.calls[0];
    expect(action).toBe('CAMPAIGN_SCHEDULE_TOGGLED');
    expect(entityId).toBe(395);
    expect(details).toEqual({ scheduleId: 177, enabled: true, previousEnabled: false });
  });

  it('tắt lịch đang bật → TOGGLED {enabled:false, previousEnabled:true} (vụ sếp tự tắt 11:33 phải tra ra được)', async () => {
    mockRepository.findMutableById.mockResolvedValue(mutable({ enabled: true }));
    mockRepository.update.mockResolvedValue(row({ enabled: false }));
    await controller().update(updateReq({ enabled: false }), makeRes());
    expect(logWorkspace.mock.calls[0][1]).toBe('CAMPAIGN_SCHEDULE_TOGGLED');
    expect(logWorkspace.mock.calls[0][4]).toEqual({ scheduleId: 177, enabled: false, previousEnabled: true });
  });

  it('sửa tên/kiểu/giờ → CAMPAIGN_SCHEDULE_UPDATED kèm danh sách trường đổi; vừa sửa vừa bật → cả hai dòng', async () => {
    mockRepository.findMutableById.mockResolvedValue(mutable());
    await controller().update(updateReq({ scheduleName: 'Mới', cronExpression: '30 8 * * *', enabled: true }), makeRes());
    const actions = logWorkspace.mock.calls.map((c) => c[1]);
    expect(actions).toEqual(['CAMPAIGN_SCHEDULE_TOGGLED', 'CAMPAIGN_SCHEDULE_UPDATED']);
    expect(logWorkspace.mock.calls[1][4]).toEqual({ scheduleId: 177, changedFields: ['scheduleName', 'cronExpression'], enabled: true });
  });

  it('gửi lại enabled y như cũ và không sửa gì khác → không ghi dòng nào (không có thay đổi để ghi)', async () => {
    mockRepository.findMutableById.mockResolvedValue(mutable({ enabled: true }));
    mockRepository.update.mockResolvedValue(row({ enabled: true }));
    await controller().update(updateReq({ enabled: true }), makeRes());
    expect(logWorkspace).not.toHaveBeenCalled();
  });

  it('xoá lịch → CAMPAIGN_SCHEDULE_DELETED, entity_id = id_campaign, details mô tả lịch đã xoá', async () => {
    mockRepository.findMutableById.mockResolvedValue(mutable({ enabled: true }));
    await controller().delete({ user: owner, headers: {}, params: { id: '177' } }, makeRes());
    expect(mockRepository.delete).toHaveBeenCalledTimes(1);
    const [, action, , entityId, details] = logWorkspace.mock.calls[0];
    expect(action).toBe('CAMPAIGN_SCHEDULE_DELETED');
    expect(entityId).toBe(395);
    expect(details).toEqual({ scheduleId: 177, scheduleType: 'daily', cronExpression: '0 9 * * *', enabled: true });
  });

  it('ghi nhật ký hỏng KHÔNG làm hỏng thao tác chính (vẫn 201/200), chỉ cảnh báo', async () => {
    logWorkspace.mockRejectedValue(new Error('audit db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const created = makeRes();
      await controller().create(createReq(), created);
      expect(created.status).toHaveBeenCalledWith(201);

      mockRepository.findMutableById.mockResolvedValue(mutable());
      const updated = makeRes();
      await controller().update(updateReq({ enabled: true }), updated);
      expect(updated.status).not.toHaveBeenCalledWith(500);
      expect(warn.mock.calls.map((c) => c.join(' ')).join('\n')).toContain('CAMPAIGN_SCHEDULE_CREATED audit failed');
    } finally {
      warn.mockRestore();
    }
  });

  it('thao tác bị chặn (404 / 409) không để lại dòng nhật ký nào', async () => {
    mockRepository.findCampaignForSchedule.mockResolvedValue(null);
    await controller().create(createReq(), makeRes());
    mockRepository.findMutableById.mockResolvedValue(null);
    await controller().update(updateReq({ enabled: true }), makeRes());
    await controller().delete({ user: owner, headers: {}, params: { id: '1' } }, makeRes());
    expect(logWorkspace).not.toHaveBeenCalled();
  });
});
