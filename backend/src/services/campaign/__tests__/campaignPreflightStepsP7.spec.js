/**
 * P7 — preflight chặn node kênh adapter có > 5 bước hoặc độ trễ giữa các bước sai (cấu hình nhập bằng API/trợ lý AI
 * không đi qua FE). Mock db.query trả node giả; kênh giả đăng ký qua __registerChannelForTest.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({ default: { query: mockQuery } }));
jest.unstable_mockModule('../../../utils/topupLockGate.util.js', () => ({ resourceIsLocked: jest.fn(async () => false) }));

const { validateCampaignPreflight } = await import('../campaignPreflight.service.js');
const campaignChannelRegistry = (await import('../campaignChannelRegistry.service.js')).default;
const { validateChannelSteps, MAX_CHANNEL_STEPS } = await import('../../../utils/channelSteps.util.js');

const checkReadiness = jest.fn().mockResolvedValue();

beforeEach(() => {
  jest.clearAllMocks();
  campaignChannelRegistry.__registerChannelForTest({
    key: 'mock_p7',
    sendNodeSubtype: 'send_mock_p7',
    engine: 'adapter',
    continuousSupported: true,
    continuousReplay: true,
    quotaChannel: 'zalo',
    policy: { minDelayMs: 0, maxDelayMs: 0, perHourLimit: 0, quietHours: null },
    adapter: { checkReadiness, resolveAccount: jest.fn(), resolveRecipients: jest.fn(), sendOne: jest.fn(), classifyError: jest.fn() },
  });
});

afterEach(() => {
  campaignChannelRegistry.__resetTestChannels();
});

const nodesWithSteps = (steps) => ({
  rows: [{ id: 7, node_type: 'action', node_subtype: 'send_mock_p7', config: { steps } }],
});
const stepList = (count, extra = {}) => Array.from({ length: count }, (_, i) => ({ message: `m${i}`, ...(i > 0 ? extra : {}) }));

describe('validateChannelSteps (P7)', () => {
  it('hợp lệ: không có steps, 1 bước, đúng 5 bước có trễ', () => {
    expect(validateChannelSteps(undefined)).toBeNull();
    expect(validateChannelSteps(stepList(1))).toBeNull();
    expect(validateChannelSteps(stepList(MAX_CHANNEL_STEPS, { delayValue: 2, delayUnit: 'hours' }))).toBeNull();
    expect(validateChannelSteps(stepList(2, { delayValue: 0 }))).toBeNull();
  });

  it('6 bước -> CHANNEL_TOO_MANY_STEPS', () => {
    expect(validateChannelSteps(stepList(MAX_CHANNEL_STEPS + 1))).toMatchObject({ code: 'CHANNEL_TOO_MANY_STEPS' });
  });

  it('trễ âm / không nguyên / đơn vị lạ / quá 30 ngày -> CHANNEL_INVALID_STEP_DELAY', () => {
    expect(validateChannelSteps(stepList(2, { delayValue: -1 }))).toMatchObject({ code: 'CHANNEL_INVALID_STEP_DELAY' });
    expect(validateChannelSteps(stepList(2, { delayValue: 1.5 }))).toMatchObject({ code: 'CHANNEL_INVALID_STEP_DELAY' });
    expect(validateChannelSteps(stepList(2, { delayValue: 'abc' }))).toMatchObject({ code: 'CHANNEL_INVALID_STEP_DELAY' });
    expect(validateChannelSteps(stepList(2, { delayValue: 5, delayUnit: 'weeks' }))).toMatchObject({ code: 'CHANNEL_INVALID_STEP_DELAY' });
    expect(validateChannelSteps(stepList(2, { delayValue: 31, delayUnit: 'days' }))).toMatchObject({ code: 'CHANNEL_INVALID_STEP_DELAY' });
    expect(validateChannelSteps(stepList(2, { delayValue: 30, delayUnit: 'days' }))).toBeNull();
  });

  it('bước ĐẦU: độ trễ bị bỏ qua (không kiểm) vì bước 1 luôn gửi ngay', () => {
    expect(validateChannelSteps([{ message: 'a', delayValue: -9 }, { message: 'b' }])).toBeNull();
  });
});

describe('validateCampaignPreflight — node kênh adapter nhiều bước (P7)', () => {
  it('6 bước -> 400 CHANNEL_TOO_MANY_STEPS, không gọi checkReadiness', async () => {
    mockQuery.mockResolvedValueOnce(nodesWithSteps(stepList(6)));
    await expect(validateCampaignPreflight({ campaignId: 1, workspaceOwnerId: 1 })).rejects.toMatchObject({
      code: 'CHANNEL_TOO_MANY_STEPS',
      statusCode: 400,
    });
    expect(checkReadiness).not.toHaveBeenCalled();
  });

  it('trễ âm -> 400 CHANNEL_INVALID_STEP_DELAY', async () => {
    mockQuery.mockResolvedValueOnce(nodesWithSteps(stepList(2, { delayValue: -3, delayUnit: 'minutes' })));
    await expect(validateCampaignPreflight({ campaignId: 1, workspaceOwnerId: 1 })).rejects.toMatchObject({
      code: 'CHANNEL_INVALID_STEP_DELAY',
      statusCode: 400,
    });
  });

  it('2 bước trễ 1 phút hợp lệ -> qua bước kiểm bước, có gọi checkReadiness', async () => {
    mockQuery.mockResolvedValue(nodesWithSteps(stepList(2, { delayValue: 1, delayUnit: 'minutes' })));
    await validateCampaignPreflight({ campaignId: 1, workspaceOwnerId: 1 });
    expect(checkReadiness).toHaveBeenCalledTimes(1);
  });
});
