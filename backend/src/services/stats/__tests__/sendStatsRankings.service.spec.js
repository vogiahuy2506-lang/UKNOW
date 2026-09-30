import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-6 — kiểm đầu vào và ánh xạ của hai hàm xếp hạng THÊM vào module đếm gửi tin:
 * getFailureReasons, getOwnerTotals. Repository và registry được giả lập; SQL thật do
 * tests/integration/sendStatsRankings.test.js kiểm trên DB thật. Trọng tâm: đầu vào sai phải NÉM LỖI (đặc biệt scope thiếu
 * không được rơi sang "toàn hệ thống"), `limit` được cắt ở SQL (tham số của repository), kênh loại đi bằng excludeChannels.
 */
const repository = {
  failureReasons: jest.fn(),
  ownerTotals: jest.fn(),
};

const SAU_KENH = [
  { key: 'email', table: 'email_messages' },
  { key: 'zalo_personal', table: 'zalo_messages' },
  { key: 'zalo_group', table: 'zalo_messages' },
  { key: 'zalo_friend_request', table: 'zalo_messages' },
  { key: 'telegram', table: 'campaign_channel_messages' },
  { key: 'whatsapp', table: 'campaign_channel_messages' },
];

jest.unstable_mockModule('../../../repositories/stats/sendStats.repository.js', () => ({ default: repository }));
jest.unstable_mockModule('../../campaign/campaignChannelRegistry.service.js', () => ({
  default: { listChannelsForStats: () => SAU_KENH },
}));

const service = await import('../sendStats.service.js');

const WINDOW = { fromDate: '2026-09-30', toDate: '2026-09-30' };

beforeEach(() => {
  repository.failureReasons.mockReset().mockResolvedValue([]);
  repository.ownerTotals.mockReset().mockResolvedValue([]);
});

describe.each([
  ['getFailureReasons', () => repository.failureReasons, (...args) => service.getFailureReasons(...args)],
  ['getOwnerTotals', () => repository.ownerTotals, (...args) => service.getOwnerTotals(...args)],
])('%s — đầu vào và tham số truyền cho repository', (_name, getRepoFn, call) => {
  it('scope / cửa sổ chuẩn hoá; kênh đủ 6 theo bảng; limit mặc định 10', async () => {
    await call({ ownerId: null, excludeOwnerIds: [39, '116'] }, WINDOW);
    expect(getRepoFn()).toHaveBeenCalledWith({
      scope: { ownerId: null, excludeOwnerIds: [39, 116] },
      window: { kind: 'range', fromDate: '2026-09-30', toDate: '2026-09-30' },
      channels: { email: 'email', zalo: ['zalo_personal', 'zalo_group', 'zalo_friend_request'], adapter: ['telegram', 'whatsapp'] },
      limit: 10,
    });
  });

  it('window kiểu { days } được nhận', async () => {
    await call({ ownerId: 5 }, { days: 30 });
    expect(getRepoFn().mock.calls[0][0].window).toEqual({ kind: 'days', days: 30 });
  });

  it('excludeChannels bỏ kênh NGAY từ danh sách gửi cho repository (không lọc sau khi gom)', async () => {
    await call({ ownerId: null }, WINDOW, { excludeChannels: ['zalo_friend_request'], limit: 3 });
    const args = getRepoFn().mock.calls[0][0];
    expect(args.channels).toEqual({ email: 'email', zalo: ['zalo_personal', 'zalo_group'], adapter: ['telegram', 'whatsapp'] });
    expect(args.limit).toBe(3);
  });

  it.each([
    ['không có scope', undefined],
    ['scope null', null],
    ['thiếu ownerId (không được rơi sang toàn hệ thống)', {}],
    ['ownerId undefined', { ownerId: undefined }],
    ['ownerId 0', { ownerId: 0 }],
    ['ownerId chữ', { ownerId: 'abc' }],
  ])('scope sai (%s) → TypeError và KHÔNG chạm repository', async (_label, scope) => {
    await expect(call(scope, WINDOW)).rejects.toThrow(TypeError);
    expect(getRepoFn()).not.toHaveBeenCalled();
  });

  it.each([
    ['không có window', undefined],
    ['window rỗng', {}],
    ['ngày sai', { fromDate: '2026-02-30', toDate: '2026-03-01' }],
    ['days = 0', { days: 0 }],
  ])('window sai (%s) → lỗi và KHÔNG chạm repository', async (_label, window) => {
    await expect(call({ ownerId: 5 }, window)).rejects.toThrow();
    expect(getRepoFn()).not.toHaveBeenCalled();
  });

  it.each([[0], [-1], [101], [1.5], ['10'], [Number.NaN]])('limit sai (%p) → RangeError', async (limit) => {
    await expect(call({ ownerId: 5 }, WINDOW, { limit })).rejects.toThrow(RangeError);
    expect(getRepoFn()).not.toHaveBeenCalled();
  });

  it('limit biên 1 và 100 được nhận', async () => {
    await call({ ownerId: 5 }, WINDOW, { limit: 1 });
    await call({ ownerId: 5 }, WINDOW, { limit: 100 });
    expect(getRepoFn().mock.calls.map((callArgs) => callArgs[0].limit)).toEqual([1, 100]);
  });

  it('excludeChannels có khoá lạ → TypeError (không âm thầm không loại gì); loại hết kênh → TypeError', async () => {
    await expect(call({ ownerId: 5 }, WINDOW, { excludeChannels: ['zalo_friend'] })).rejects.toThrow(TypeError);
    await expect(call({ ownerId: 5 }, WINDOW, { excludeChannels: SAU_KENH.map((channel) => channel.key) })).rejects.toThrow(TypeError);
    expect(getRepoFn()).not.toHaveBeenCalled();
  });
});

describe('getFailureReasons — ánh xạ kết quả', () => {
  it('số đếm ở dạng chuỗi của pg → số; reason NULL giữ null; lastAt giữ nguyên Date; thứ tự do SQL quyết định', async () => {
    const lastAt = new Date('2026-09-30T01:00:00.000Z');
    repository.failureReasons.mockResolvedValue([
      { channel: 'email', reason: 'Mailbox full', failed: '620', last_at: lastAt },
      { channel: 'telegram', reason: null, failed: '1', last_at: lastAt },
    ]);
    expect(await service.getFailureReasons({ ownerId: 5 }, WINDOW)).toEqual([
      { channel: 'email', reason: 'Mailbox full', count: 620, lastAt },
      { channel: 'telegram', reason: null, count: 1, lastAt },
    ]);
  });
});

describe('getOwnerTotals — ánh xạ kết quả', () => {
  it('id và số đếm ở dạng chuỗi của pg → số; giữ thứ tự của SQL', async () => {
    repository.ownerTotals.mockResolvedValue([
      { owner_id: '12', sent: '5', failed: '0' },
      { owner_id: '3', sent: '5', failed: '2' },
    ]);
    expect(await service.getOwnerTotals({ ownerId: null }, WINDOW)).toEqual([
      { ownerId: 12, sent: 5, failed: 0 },
      { ownerId: 3, sent: 5, failed: 2 },
    ]);
  });

  it('không có dữ liệu → mảng rỗng', async () => {
    expect(await service.getOwnerTotals({ ownerId: null }, WINDOW)).toEqual([]);
    expect(await service.getFailureReasons({ ownerId: null }, WINDOW)).toEqual([]);
  });
});

describe('default export', () => {
  it('có đủ hai hàm mới và giữ các hàm cũ', () => {
    for (const name of ['getChannelTotals', 'getDailySeries', 'getHourlySeries', 'getRunTotals', 'getCampaignTotals', 'getActorTotals', 'listFinalFailures', 'getOwnerTotals', 'getFailureReasons']) {
      expect(typeof service.default[name]).toBe('function');
    }
  });
});
