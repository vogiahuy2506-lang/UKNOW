import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockRefresh = jest.fn();
const mockRepository = {
  findCampaignForSchedule: jest.fn(),
  hasRunningCampaignRun: jest.fn(),
  create: jest.fn(),
  findMutableById: jest.fn(),
  update: jest.fn(),
};

jest.unstable_mockModule('../../helpers.js', () => ({
  serverError: jest.fn(),
}));
jest.unstable_mockModule('../../utils/scheduler.js', () => ({
  requestCampaignScheduleRefresh: mockRefresh,
}));
jest.unstable_mockModule('../../repositories/campaign/campaignSchedule.repository.js', () => ({
  default: mockRepository,
}));
jest.unstable_mockModule('../../utils/roleScope.util.js', () => ({
  isAdminRole: jest.fn(() => false),
  isSuperAdmin: jest.fn(() => false),
}));
jest.unstable_mockModule('../../utils/onceScheduleValidation.util.js', () => ({
  assertOnceCronNotYearRolled: jest.fn(() => ({ ok: true })),
}));

const { default: CampaignScheduleController } = await import('../campaignSchedule.controller.js');

const makeRes = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
};

const employeeWithoutRun = {
  id: 2,
  role: 'user',
  activeContext: {
    type: 'employee',
    ownerId: 1,
    permissions: { campaigns_create: true, campaigns_run: false },
  },
};

describe('CampaignScheduleController execution permission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepository.findCampaignForSchedule.mockResolvedValue({
      id: 12,
      workspace_owner_id: 1,
    });
    mockRepository.hasRunningCampaignRun.mockResolvedValue(false);
  });

  it('treats validated string "true" as enabled and blocks create without campaigns_run', async () => {
    const controller = new CampaignScheduleController();
    const res = makeRes();

    await controller.create({
      user: employeeWithoutRun,
      body: {
        campaignId: 12,
        scheduleName: 'Daily',
        scheduleType: 'daily',
        cronExpression: '0 9 * * *',
        enabled: 'true',
      },
    }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
    expect(mockRepository.create).not.toHaveBeenCalled();
  });

  it('blocks editing the execution schedule of an already-enabled schedule without campaigns_run', async () => {
    mockRepository.findMutableById.mockResolvedValue({
      id: 44,
      id_campaign: 12,
      schedule_type: 'daily',
      cron_expression: '0 9 * * *',
      enabled: true,
      run_count: 0,
      last_run_at: null,
    });
    const controller = new CampaignScheduleController();
    const res = makeRes();

    await controller.update({
      user: employeeWithoutRun,
      params: { id: 44 },
      body: { cronExpression: '0 10 * * *' },
    }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
    expect(mockRepository.update).not.toHaveBeenCalled();
  });
});
