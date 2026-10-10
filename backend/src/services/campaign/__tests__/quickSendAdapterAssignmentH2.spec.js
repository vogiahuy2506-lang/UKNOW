/**
 * PLAN_GIAO_TK_TG_WA PR-H2 — Gửi nhanh kênh adapter: nhân viên chỉ gửi bằng tài khoản ĐƯỢC GIAO. Kiểm TRƯỚC adapter / tài khoản /
 * hạn mức; phạm vi được truyền xuống `resolveAccount` (chốt chung với đường chạy chiến dịch). Khuôn quickSendAdapterEntitlementP9.spec.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockCheckLimit = jest.fn();
const mockDbQuery = jest.fn();
const mockGetRefs = jest.fn();

jest.unstable_mockModule('../../../utils/userResourceLimit.util.js', () => ({ checkUserResourceLimit: mockCheckLimit }));
const actualDb = await import('../../../config/database.js');
jest.unstable_mockModule('../../../config/database.js', () => ({ ...actualDb, default: { query: mockDbQuery } }));
jest.unstable_mockModule('../zaloCampaignRecipient.service.js', () => ({
  default: { isLeadPhoneConsentRefused: jest.fn().mockResolvedValue(false) },
}));
jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: jest.fn().mockResolvedValue({ allowed: false, message: 'dừng ở hạn mức (chứng minh đã qua cổng giao tài khoản)' }),
  recordDirectSendUsage: jest.fn(),
  nextVnMidnight: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));
jest.unstable_mockModule('../../quota/accountDailyLimit.service.js', () => ({
  checkAccountDailyLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));
const realAccess = await import('../../user/memberChannelAccess.service.js');
jest.unstable_mockModule('../../user/memberChannelAccess.service.js', () => ({
  ...realAccess,
  getAccessibleChannelAccountRefs: mockGetRefs,
}));

const { sendQuickAdapterMessage } = await import('../quickSendAdapter.service.js');
const { __registerChannelForTest, __resetTestChannels } = await import('../campaignChannelRegistry.service.js');

const checkReadiness = jest.fn();
const resolveAccount = jest.fn();
const employee = { id: 20, role: 'user', activeContext: { type: 'employee', ownerId: 3, membershipId: 1, permissions: {} } };
const owner = { id: 3, role: 'user' };

function register(key, subtype) {
  __registerChannelForTest({
    key,
    sendNodeSubtype: subtype,
    engine: 'adapter',
    continuousSupported: false,
    continuousReplay: false,
    quotaChannel: 'zalo',
    policy: { minDelayMs: 60_000, maxDelayMs: 60_000, perHourLimit: 0, quietHours: null },
    adapter: { checkReadiness, resolveAccount, resolveRecipients: async () => [], sendOne: jest.fn(), classifyError: () => 'hard' },
  });
}

describe('sendQuickAdapterMessage — giao tài khoản cho nhân viên (PR-H2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
    mockCheckLimit.mockResolvedValue({ allowed: false, limit: 1, currentCount: 1, message: 'đủ' });
    resolveAccount.mockResolvedValue({ accountKey: '7', accountId: 7 });
    register('telegram', 'send_telegram');
    register('whatsapp', 'send_whatsapp');
  });

  afterEach(() => {
    __resetTestChannels();
  });

  it('Telegram: nhân viên chưa được giao tài khoản → 403 CHANNEL_ACCOUNT_NOT_ASSIGNED; KHÔNG chạm adapter', async () => {
    mockGetRefs.mockResolvedValue(['8']);
    await expect(sendQuickAdapterMessage({
      channel: 'telegram', authUser: employee, body: { accountId: 7, recipientKey: '123456', message: 'hi' },
    })).rejects.toMatchObject({ status: 403, code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED' });
    expect(mockGetRefs).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 20, workspaceOwnerId: 3, contextType: 'employee' }), 'telegram');
    expect(checkReadiness).not.toHaveBeenCalled();
    expect(resolveAccount).not.toHaveBeenCalled();
  });

  it('WhatsApp: phiên chưa giao → 403; đã giao → tới bước sẵn sàng', async () => {
    mockGetRefs.mockResolvedValue(['3-mot']);
    await expect(sendQuickAdapterMessage({
      channel: 'whatsapp', authUser: employee, body: { sessionKey: '3-hai', recipientKey: '84901234567', message: 'hi' },
    })).rejects.toMatchObject({ status: 403, code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED' });
    expect(mockGetRefs).toHaveBeenCalledWith(expect.anything(), 'whatsapp_baileys');
    expect(checkReadiness).not.toHaveBeenCalled();

    await expect(sendQuickAdapterMessage({
      channel: 'whatsapp', authUser: employee, body: { sessionKey: '3-mot', recipientKey: '84901234567', message: 'hi' },
    })).rejects.toMatchObject({ code: 'SEND_QUOTA_EXCEEDED' });
    expect(checkReadiness).toHaveBeenCalled();
  });

  it('được giao → phạm vi được truyền xuống resolveAccount (chốt chung với đường chạy chiến dịch)', async () => {
    mockGetRefs.mockResolvedValue(['7']);
    await expect(sendQuickAdapterMessage({
      channel: 'telegram', authUser: employee, body: { accountId: 7, recipientKey: '123456', message: 'hi' },
    })).rejects.toMatchObject({ code: 'SEND_QUOTA_EXCEEDED' });
    expect(resolveAccount).toHaveBeenCalledWith(expect.objectContaining({ accessibleChannelRefs: { telegram: ['7'] } }));
  });

  it('CHỦ (phạm vi null) → qua, phạm vi null truyền xuống', async () => {
    mockGetRefs.mockResolvedValue(null);
    await expect(sendQuickAdapterMessage({
      channel: 'telegram', authUser: owner, body: { accountId: 7, recipientKey: '123456', message: 'hi' },
    })).rejects.toMatchObject({ code: 'SEND_QUOTA_EXCEEDED' });
    expect(resolveAccount).toHaveBeenCalledWith(expect.objectContaining({ accessibleChannelRefs: { telegram: null } }));
  });

  it('resolveAccount ném CHANNEL_ACCOUNT_NOT_ASSIGNED (phạm vi đổi giữa chừng) → giữ nguyên 403, KHÔNG gói thành 409', async () => {
    mockGetRefs.mockResolvedValue(['7']);
    resolveAccount.mockRejectedValue(Object.assign(new Error('Tài khoản Telegram này chưa được giao cho bạn.'), { status: 403, code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED' }));
    await expect(sendQuickAdapterMessage({
      channel: 'telegram', authUser: employee, body: { accountId: 7, recipientKey: '123456', message: 'hi' },
    })).rejects.toMatchObject({ status: 403, code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED' });
  });

  it('lỗi đọc việc giao → phạm vi [] → chặn (hỏng thì chặn)', async () => {
    mockGetRefs.mockResolvedValue([]);
    await expect(sendQuickAdapterMessage({
      channel: 'telegram', authUser: employee, body: { accountId: 7, recipientKey: '123456', message: 'hi' },
    })).rejects.toMatchObject({ status: 403, code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED' });
  });
});
