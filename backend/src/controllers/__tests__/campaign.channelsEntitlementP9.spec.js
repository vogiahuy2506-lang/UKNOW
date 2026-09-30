/**
 * P9 — GET /campaigns/channels chỉ trả kênh mà gói của chủ workspace có (trần 0 -> ẩn), và
 * GET /users/channel-entitlements trả { telegram, whatsapp, limits }.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockCheckLimit = jest.fn();
const mockDbQuery = jest.fn();

const actualLimit = await import('../../utils/userResourceLimit.util.js');
jest.unstable_mockModule('../../utils/userResourceLimit.util.js', () => ({
  ...actualLimit,
  checkUserResourceLimit: mockCheckLimit,
}));

const actualRegistry = await import('../../services/campaign/campaignChannelRegistry.service.js');
jest.unstable_mockModule('../../services/campaign/campaignChannelRegistry.service.js', () => ({
  ...actualRegistry,
  getEnabledAdapterChannelsForBuilder: () => ([
    { key: 'telegram', sendNodeSubtype: 'send_telegram', label: 'Telegram' },
    { key: 'whatsapp', sendNodeSubtype: 'send_whatsapp', label: 'WhatsApp' },
  ]),
}));

const campaignController = (await import('../campaign.controller.js')).default;
const userController = (await import('../user.controller.js')).default;
const { default: db } = await import('../../config/database.js');

function makeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

function limitFor(map) {
  mockCheckLimit.mockImplementation(async ({ resourceKey }) => ({
    allowed: false, limit: map[resourceKey] ?? null, currentCount: 0, message: null,
  }));
}

describe('GET /campaigns/channels — lọc theo quyền kênh của gói (P9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(db, 'query').mockImplementation(mockDbQuery);
    mockDbQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
  });

  it('trần Telegram 0 -> chỉ còn WhatsApp', async () => {
    limitFor({ telegramAccounts: 0, whatsappAccounts: 1 });
    const res = makeRes();
    await campaignController.getChannels({ user: { id: 7, role: 'user' } }, res);
    expect(res.body.data.channels.map((c) => c.key)).toEqual(['whatsapp']);
  });

  it('cả hai trần 0 -> mảng rỗng', async () => {
    limitFor({ telegramAccounts: 0, whatsappAccounts: 0 });
    const res = makeRes();
    await campaignController.getChannels({ user: { id: 7, role: 'user' } }, res);
    expect(res.body.data.channels).toEqual([]);
  });

  it('trần null / n -> giữ cả hai kênh', async () => {
    limitFor({ telegramAccounts: 2 });
    const res = makeRes();
    await campaignController.getChannels({ user: { id: 7, role: 'user' } }, res);
    expect(res.body.data.channels.map((c) => c.key)).toEqual(['telegram', 'whatsapp']);
  });
});

describe('GET /users/channel-entitlements (P9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(db, 'query').mockImplementation(mockDbQuery);
    mockDbQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
  });

  it('trả hình dạng { telegram, whatsapp, limits }', async () => {
    limitFor({ telegramAccounts: 0, whatsappAccounts: 5 });
    const res = makeRes();
    await userController.getChannelEntitlements({ user: { id: 7, role: 'user' } }, res);
    expect(res.body).toEqual({
      success: true,
      data: { telegram: false, whatsapp: true, limits: { telegram: 0, whatsapp: 5 } },
    });
  });
});
