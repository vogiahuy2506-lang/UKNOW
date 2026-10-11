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

// Danh sách kênh adapter HỆ THỐNG đang bật — mỗi ca đặt lại qua `systemAdapterChannels` / `registryShouldThrow`.
const ALL_ADAPTER_CHANNELS = [
  { key: 'telegram', sendNodeSubtype: 'send_telegram', label: 'Telegram' },
  { key: 'whatsapp', sendNodeSubtype: 'send_whatsapp', label: 'WhatsApp' },
];
let systemAdapterChannels = ALL_ADAPTER_CHANNELS;
let registryShouldThrow = false;

const actualRegistry = await import('../../services/campaign/campaignChannelRegistry.service.js');
jest.unstable_mockModule('../../services/campaign/campaignChannelRegistry.service.js', () => ({
  ...actualRegistry,
  getEnabledAdapterChannelsForBuilder: () => {
    if (registryShouldThrow) throw new Error('registry boom');
    return systemAdapterChannels;
  },
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
    systemAdapterChannels = ALL_ADAPTER_CHANNELS;
    registryShouldThrow = false;
    jest.spyOn(db, 'query').mockImplementation(mockDbQuery);
    mockDbQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
  });

  it('trả hình dạng { telegram, whatsapp, zalo, limits } (P12 thêm zalo) + enabledAdapterChannels (11/10/2026)', async () => {
    limitFor({ telegramAccounts: 0, whatsappAccounts: 5 });
    const res = makeRes();
    await userController.getChannelEntitlements({ user: { id: 7, role: 'user' } }, res);
    expect(res.body).toEqual({
      success: true,
      data: {
        telegram: false,
        whatsapp: true,
        zalo: true,
        limits: { telegram: 0, whatsapp: 5, zalo: null },
        enabledAdapterChannels: [
          { key: 'telegram', label: 'Telegram' },
          { key: 'whatsapp', label: 'WhatsApp' },
        ],
      },
    });
  });

  it('enabledAdapterChannels KHÔNG lọc theo gói: trần Telegram/WhatsApp đều 0 vẫn liệt kê cả hai (FE hiện thẻ khoá + gợi ý mua)', async () => {
    limitFor({ telegramAccounts: 0, whatsappAccounts: 0 });
    const res = makeRes();
    await userController.getChannelEntitlements({ user: { id: 7, role: 'user' } }, res);
    expect(res.body.data.telegram).toBe(false);
    expect(res.body.data.whatsapp).toBe(false);
    expect(res.body.data.enabledAdapterChannels.map((c) => c.key)).toEqual(['telegram', 'whatsapp']);
  });

  it('kênh HỆ THỐNG tắt (registry không có WhatsApp) -> không có trong danh sách; chỉ lộ key + label (không lộ sendNodeSubtype/policy)', async () => {
    limitFor({});
    systemAdapterChannels = [{ key: 'telegram', sendNodeSubtype: 'send_telegram', label: 'Telegram', policy: { perHourLimit: 1 } }];
    const res = makeRes();
    await userController.getChannelEntitlements({ user: { id: 7, role: 'user' } }, res);
    expect(res.body.data.enabledAdapterChannels).toEqual([{ key: 'telegram', label: 'Telegram' }]);
  });

  it('cờ hệ thống tắt hết -> mảng rỗng (khác với "không có trường" của backend cũ)', async () => {
    limitFor({});
    systemAdapterChannels = [];
    const res = makeRes();
    await userController.getChannelEntitlements({ user: { id: 7, role: 'user' } }, res);
    expect(res.body.data.enabledAdapterChannels).toEqual([]);
  });

  it('registry ném lỗi -> bỏ trường nhưng VẪN trả quyền kênh (200), để FE dùng đường cũ', async () => {
    limitFor({ telegramAccounts: 2 });
    registryShouldThrow = true;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await userController.getChannelEntitlements({ user: { id: 7, role: 'user' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.telegram).toBe(true);
    expect('enabledAdapterChannels' in res.body.data).toBe(false);
    errorSpy.mockRestore();
  });
});
