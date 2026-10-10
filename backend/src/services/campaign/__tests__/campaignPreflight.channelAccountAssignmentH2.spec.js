/**
 * PLAN_GIAO_TK_TG_WA PR-H2 — preflight kiểm tài khoản Telegram / WhatsApp ĐƯỢC GIAO theo NGƯỜI BẤM CHẠY, TRƯỚC `checkReadiness`
 * (lời báo đúng là "chưa được giao", không phải "mất kết nối"). Khuôn campaignPreflight.zaloAccountAssignment.spec.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockFindTelegram = jest.fn();
const mockFindWhatsApp = jest.fn();

const realMemberRepo = await import('../../../repositories/user/memberChannelAccount.repository.js');
jest.unstable_mockModule('../../../repositories/user/memberChannelAccount.repository.js', () => ({
  ...realMemberRepo,
  findAssignedTelegramAccountRefs: mockFindTelegram,
  findAssignedWhatsAppSessionKeys: mockFindWhatsApp,
}));
jest.unstable_mockModule('../../../config/database.js', () => ({ default: { query: mockQuery } }));
jest.unstable_mockModule('../../../utils/topupLockGate.util.js', () => ({ resourceIsLocked: jest.fn(async () => false) }));
jest.unstable_mockModule('../channelEntitlement.service.js', () => ({
  assertChannelEntitled: jest.fn(async () => undefined),
  default: { assertChannelEntitled: jest.fn(async () => undefined) },
}));

const { validateCampaignPreflight } = await import('../campaignPreflight.service.js');
const campaignChannelRegistry = (await import('../campaignChannelRegistry.service.js')).default;

const OWNER = 7;
const EMP = 20;
const checkReadiness = jest.fn().mockResolvedValue();
let nodeRows;

beforeEach(() => {
  jest.clearAllMocks();
  nodeRows = [{ id: 1, node_type: 'action', node_subtype: 'send_telegram', config: { telegramAccountId: 5 } }];
  mockFindTelegram.mockResolvedValue(['5']);
  mockFindWhatsApp.mockResolvedValue([]);
  mockQuery.mockImplementation(async (sql) => {
    const text = String(sql);
    if (/FROM campaign_nodes/.test(text)) return { rows: nodeRows };
    if (/SELECT role FROM users/.test(text)) return { rows: [{ role: 'user' }] };
    if (/FROM telegram_accounts WHERE id = ANY/.test(text)) return { rows: [{ id: 5, first_name: 'Shop', last_name: null, username: 'shop' }] };
    if (/FROM users WHERE id = ANY/.test(text)) return { rows: [{ id: EMP, full_name: 'NV Hai', username: 'nvhai' }] };
    throw new Error(`unexpected sql: ${text}`);
  });
  for (const [key, subtype] of [['telegram', 'send_telegram'], ['whatsapp', 'send_whatsapp']]) {
    campaignChannelRegistry.__registerChannelForTest({
      key,
      sendNodeSubtype: subtype,
      engine: 'adapter',
      continuousSupported: false,
      continuousReplay: false,
      quotaChannel: 'zalo',
      policy: { minDelayMs: 0, maxDelayMs: 0, perHourLimit: 0, quietHours: null },
      adapter: { checkReadiness, resolveAccount: jest.fn(), resolveRecipients: jest.fn(), sendOne: jest.fn(), classifyError: jest.fn() },
    });
  }
});

afterEach(() => {
  campaignChannelRegistry.__resetTestChannels();
});

describe('validateCampaignPreflight — tài khoản Telegram / WhatsApp được giao (H2)', () => {
  it('nhân viên bấm chạy, tài khoản được giao → qua, đi tiếp tới checkReadiness', async () => {
    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [EMP] }))
      .resolves.toMatchObject({ valid: true });
    expect(mockFindTelegram).toHaveBeenCalledWith(OWNER, EMP);
    expect(checkReadiness).toHaveBeenCalledTimes(1);
  });

  it('nhân viên bấm chạy, tài khoản CHƯA giao → 403 CHANNEL_ACCOUNT_NOT_ASSIGNED nêu tên tài khoản + nhân viên, TRƯỚC checkReadiness', async () => {
    mockFindTelegram.mockResolvedValue(['6']);
    const error = await validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [EMP] }).catch((e) => e);
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
    expect(error.message).toContain('Tài khoản Telegram "Shop" chưa được giao cho nhân viên "NV Hai"');
    expect(checkReadiness).not.toHaveBeenCalled();
  });

  it('WhatsApp chưa giao → 403 (tên hiển thị = khoá ngắn)', async () => {
    nodeRows = [{ id: 1, node_type: 'action', node_subtype: 'send_whatsapp', config: { whatsappSessionKey: `${OWNER}-shop` } }];
    mockFindWhatsApp.mockResolvedValue([`${OWNER}-khac`]);
    const error = await validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [EMP] }).catch((e) => e);
    expect(error.code).toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
    expect(error.message).toContain('Tài khoản WhatsApp "shop" chưa được giao cho nhân viên');
    expect(checkReadiness).not.toHaveBeenCalled();
  });

  it('CHỦ bấm chạy (kể cả chiến dịch do nhân viên tạo) → không đọc việc giao, qua', async () => {
    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [OWNER, OWNER] }))
      .resolves.toMatchObject({ valid: true });
    expect(mockFindTelegram).not.toHaveBeenCalled();
  });

  it('không truyền actorUserIds (đường cũ) → không kiểm giao ở preflight (engine kiểm lại ở đầu lượt)', async () => {
    mockFindTelegram.mockResolvedValue([]);
    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER })).resolves.toMatchObject({ valid: true });
    expect(mockFindTelegram).not.toHaveBeenCalled();
  });

  it('chiến dịch không có node kênh adapter → không gọi hàm kiểm giao kênh', async () => {
    nodeRows = [{ id: 1, node_type: 'action', node_subtype: 'send_email', config: {} }];
    const assertFn = jest.fn();
    await validateCampaignPreflight({
      campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [EMP], assertChannelAccountsAssignedFn: assertFn,
    }).catch(() => {});
    expect(assertFn).not.toHaveBeenCalled();
  });

  it('truyền đúng { ownerId, actorUserIds, nodes } cho hàm kiểm (ghim hợp đồng)', async () => {
    const assertFn = jest.fn().mockResolvedValue({ scope: {} });
    await validateCampaignPreflight({
      campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [EMP, OWNER], assertChannelAccountsAssignedFn: assertFn,
    });
    expect(assertFn).toHaveBeenCalledWith({ ownerId: OWNER, actorUserIds: [EMP, OWNER], nodes: nodeRows });
  });
});
