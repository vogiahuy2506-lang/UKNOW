import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4a — kiểm đầu vào và ánh xạ kết quả của service số liệu gửi tin.
 * Repository và registry được giả lập: SQL thật do tests/integration/sendStats.test.js kiểm trên DB thật.
 * Trọng tâm ở đây: đầu vào sai phải NÉM LỖI (đặc biệt `ownerId` thiếu không được rơi sang "toàn hệ thống").
 */
const repository = {
  channelTotals: jest.fn(),
  dailySeries: jest.fn(),
  runTotals: jest.fn(),
  campaignTotals: jest.fn(),
  actorTotals: jest.fn(),
  finalFailures: jest.fn(),
};

const SAU_KENH = [
  { key: 'email', table: 'email_messages' },
  { key: 'zalo_personal', table: 'zalo_messages' },
  { key: 'zalo_group', table: 'zalo_messages' },
  { key: 'zalo_friend_request', table: 'zalo_messages' },
  { key: 'telegram', table: 'campaign_channel_messages' },
  { key: 'whatsapp', table: 'campaign_channel_messages' },
];
let registryChannels = SAU_KENH;

jest.unstable_mockModule('../../../repositories/stats/sendStats.repository.js', () => ({ default: repository }));
jest.unstable_mockModule('../../campaign/campaignChannelRegistry.service.js', () => ({
  default: { listChannelsForStats: () => registryChannels },
}));

const service = await import('../sendStats.service.js');

const KENH_CHO_REPOSITORY = {
  email: 'email',
  zalo: ['zalo_personal', 'zalo_group', 'zalo_friend_request'],
  adapter: ['telegram', 'whatsapp'],
};

beforeEach(() => {
  registryChannels = SAU_KENH;
  for (const fn of Object.values(repository)) fn.mockReset();
});

describe('normalizeScope', () => {
  it('một chủ: nhận số nguyên dương hoặc chuỗi số', () => {
    expect(service.normalizeScope({ ownerId: 39 })).toEqual({ ownerId: 39, excludeOwnerIds: [] });
    expect(service.normalizeScope({ ownerId: '39' })).toEqual({ ownerId: 39, excludeOwnerIds: [] });
  });

  it('toàn hệ thống CHỈ khi ownerId là null tường minh; excludeOwnerIds được chuẩn hoá và bỏ trùng', () => {
    expect(service.normalizeScope({ ownerId: null })).toEqual({ ownerId: null, excludeOwnerIds: [] });
    expect(service.normalizeScope({ ownerId: null, excludeOwnerIds: [39, '116', 39] }))
      .toEqual({ ownerId: null, excludeOwnerIds: [39, 116] });
  });

  it.each([
    ['không có scope', undefined],
    ['scope null', null],
    ['scope không phải object', 39],
    ['ownerId thiếu', {}],
    ['ownerId undefined', { ownerId: undefined }],
    ['ownerId 0', { ownerId: 0 }],
    ['ownerId âm', { ownerId: -1 }],
    ['ownerId thập phân', { ownerId: 1.5 }],
    ['ownerId chữ', { ownerId: 'abc' }],
    ['ownerId chuỗi rỗng', { ownerId: '' }],
    ['excludeOwnerIds đi kèm một chủ', { ownerId: 5, excludeOwnerIds: [1] }],
    ['excludeOwnerIds không phải mảng', { ownerId: null, excludeOwnerIds: 'x' }],
    ['excludeOwnerIds có phần tử sai', { ownerId: null, excludeOwnerIds: [1, 'x'] }],
  ])('ném lỗi: %s', (_ten, scope) => {
    expect(() => service.normalizeScope(scope)).toThrow();
  });
});

describe('normalizeWindow', () => {
  it('{ days } và { fromDate, toDate } hợp lệ', () => {
    expect(service.normalizeWindow({ days: 30 }, { required: true })).toEqual({ kind: 'days', days: 30 });
    expect(service.normalizeWindow({ fromDate: '2026-02-28', toDate: '2026-03-01' }, { required: true }))
      .toEqual({ kind: 'range', fromDate: '2026-02-28', toDate: '2026-03-01' });
    expect(service.normalizeWindow({ fromDate: '2026-03-01', toDate: '2026-03-01' }, { required: true }))
      .toEqual({ kind: 'range', fromDate: '2026-03-01', toDate: '2026-03-01' });
  });

  it('null: ném lỗi khi bắt buộc, trả null khi không bắt buộc', () => {
    expect(() => service.normalizeWindow(undefined, { required: true })).toThrow(TypeError);
    expect(() => service.normalizeWindow(null, { required: true })).toThrow(TypeError);
    expect(service.normalizeWindow(null, { required: false })).toBeNull();
    expect(service.normalizeWindow(undefined, { required: false })).toBeNull();
  });

  it.each([
    ['days = 0', { days: 0 }],
    ['days thập phân', { days: 1.5 }],
    ['days là chuỗi', { days: '7' }],
    ['days quá lớn', { days: 4000 }],
    ['thiếu toDate', { fromDate: '2026-03-01' }],
    ['ngày không tồn tại', { fromDate: '2026-02-30', toDate: '2026-03-01' }],
    ['ngày sai định dạng', { fromDate: '2026-3-1', toDate: '2026-03-01' }],
    ['ngày là Date của JS', { fromDate: new Date('2026-03-01'), toDate: new Date('2026-03-02') }],
    ['fromDate sau toDate', { fromDate: '2026-03-02', toDate: '2026-03-01' }],
    ['cả hai dạng', { days: 7, fromDate: '2026-03-01', toDate: '2026-03-02' }],
    ['object rỗng', {}],
    ['không phải object', 7],
  ])('ném lỗi: %s', (_ten, window) => {
    expect(() => service.normalizeWindow(window, { required: true })).toThrow();
  });
});

describe('getChannelTotals', () => {
  it('đổi chuỗi của pg sang số, bù kênh không có dữ liệu bằng 0, theo thứ tự registry; chuẩn hoá đầu vào cho repository', async () => {
    repository.channelTotals.mockResolvedValue([
      { channel: 'telegram', sent: '5', failed: '1', bounced: '0', opened: '0', clicked: '0' },
      { channel: 'email', sent: '12', failed: '2', bounced: '3', opened: '4', clicked: '1' },
    ]);
    const totals = await service.getChannelTotals({ ownerId: '39' }, { days: 30 });
    expect(totals).toEqual([
      { channel: 'email', sent: 12, failed: 2, bounced: 3, opened: 4, clicked: 1 },
      { channel: 'zalo_personal', sent: 0, failed: 0, bounced: 0, opened: 0, clicked: 0 },
      { channel: 'zalo_group', sent: 0, failed: 0, bounced: 0, opened: 0, clicked: 0 },
      { channel: 'zalo_friend_request', sent: 0, failed: 0, bounced: 0, opened: 0, clicked: 0 },
      { channel: 'telegram', sent: 5, failed: 1, bounced: 0, opened: 0, clicked: 0 },
      { channel: 'whatsapp', sent: 0, failed: 0, bounced: 0, opened: 0, clicked: 0 },
    ]);
    expect(repository.channelTotals).toHaveBeenCalledWith({
      scope: { ownerId: 39, excludeOwnerIds: [] },
      window: { kind: 'days', days: 30 },
      channels: KENH_CHO_REPOSITORY,
    });
  });

  it('đầu vào sai thì ném lỗi và KHÔNG chạm repository', async () => {
    await expect(service.getChannelTotals({}, { days: 7 })).rejects.toThrow(TypeError);
    await expect(service.getChannelTotals({ ownerId: 1 })).rejects.toThrow(TypeError);
    expect(repository.channelTotals).not.toHaveBeenCalled();
  });

  it('registry khai hai kênh email thì báo lỗi cấu hình', async () => {
    registryChannels = [...SAU_KENH, { key: 'email_2', table: 'email_messages' }];
    await expect(service.getChannelTotals({ ownerId: 1 }, { days: 7 })).rejects.toThrow(/kênh email/);
  });

  it('kênh thêm vào registry tự có mặt (kênh adapter mới không cần sửa service)', async () => {
    registryChannels = [...SAU_KENH, { key: 'zalo_oa', table: 'campaign_channel_messages' }];
    repository.channelTotals.mockResolvedValue([]);
    const totals = await service.getChannelTotals({ ownerId: 1 }, { days: 7 });
    expect(totals.map((row) => row.channel)).toEqual([...SAU_KENH.map((channel) => channel.key), 'zalo_oa']);
    expect(repository.channelTotals.mock.calls[0][0].channels.adapter).toEqual(['telegram', 'whatsapp', 'zalo_oa']);
  });
});

describe('getDailySeries', () => {
  it('sắp theo ngày rồi thứ tự kênh registry, số ở dạng số', async () => {
    repository.dailySeries.mockResolvedValue([
      { day: '2026-03-11', channel: 'telegram', sent: '2', failed: '1' },
      { day: '2026-03-10', channel: 'telegram', sent: '2', failed: '0' },
      { day: '2026-03-11', channel: 'email', sent: '2', failed: '0' },
      { day: '2026-03-10', channel: 'email', sent: '1', failed: '0' },
    ]);
    expect(await service.getDailySeries({ ownerId: 1 }, { fromDate: '2026-03-10', toDate: '2026-03-11' })).toEqual([
      { day: '2026-03-10', channel: 'email', sent: 1, failed: 0 },
      { day: '2026-03-10', channel: 'telegram', sent: 2, failed: 0 },
      { day: '2026-03-11', channel: 'email', sent: 2, failed: 0 },
      { day: '2026-03-11', channel: 'telegram', sent: 2, failed: 1 },
    ]);
  });
});

describe('getRunTotals', () => {
  it('danh sách lượt rỗng → [] và không truy vấn', async () => {
    expect(await service.getRunTotals({ ownerId: 1 }, [])).toEqual([]);
    expect(repository.runTotals).not.toHaveBeenCalled();
  });

  it('id sai / không phải mảng → ném lỗi; id trùng được gộp', async () => {
    await expect(service.getRunTotals({ ownerId: 1 }, undefined)).rejects.toThrow(TypeError);
    await expect(service.getRunTotals({ ownerId: 1 }, [1, 'x'])).rejects.toThrow(TypeError);
    await expect(service.getRunTotals({ ownerId: 1 }, Array.from({ length: 1001 }, (_, i) => i + 1))).rejects.toThrow(RangeError);
    repository.runTotals.mockResolvedValue([]);
    await service.getRunTotals({ ownerId: 1 }, [7, '7', 8]);
    expect(repository.runTotals.mock.calls[0][0].runIds).toEqual([7, 8]);
  });

  it('sắp theo lượt rồi kênh; runId là số', async () => {
    repository.runTotals.mockResolvedValue([
      { id_run: '9', channel: 'telegram', sent: '1', failed: '1' },
      { id_run: '3', channel: 'zalo_personal', sent: '1', failed: '2' },
      { id_run: '3', channel: 'email', sent: '3', failed: '1' },
    ]);
    expect(await service.getRunTotals({ ownerId: 1 }, [3, 9])).toEqual([
      { runId: 3, channel: 'email', sent: 3, failed: 1 },
      { runId: 3, channel: 'zalo_personal', sent: 1, failed: 2 },
      { runId: 9, channel: 'telegram', sent: 1, failed: 1 },
    ]);
  });
});

describe('getCampaignTotals', () => {
  it('cần window hoặc campaignIds; danh sách chiến dịch rỗng → []', async () => {
    await expect(service.getCampaignTotals({ ownerId: 1 }, null, null)).rejects.toThrow(TypeError);
    expect(await service.getCampaignTotals({ ownerId: 1 }, null, [])).toEqual([]);
    expect(repository.campaignTotals).not.toHaveBeenCalled();
  });

  it('campaignId null (chiến dịch đã xoá) được giữ và xếp cuối', async () => {
    repository.campaignTotals.mockResolvedValue([
      { id_campaign: null, channel: 'email', sent: '1', failed: '0', opened: '0', clicked: '0' },
      { id_campaign: '5', channel: 'email', sent: '2', failed: '1', opened: '1', clicked: '0' },
    ]);
    expect(await service.getCampaignTotals({ ownerId: 1 }, { days: 7 }, null)).toEqual([
      { campaignId: 5, channel: 'email', sent: 2, failed: 1, opened: 1, clicked: 0 },
      { campaignId: null, channel: 'email', sent: 1, failed: 0, opened: 0, clicked: 0 },
    ]);
  });
});

describe('getActorTotals', () => {
  it('actorUserId null (chưa gắn người thực hiện) được giữ và xếp cuối', async () => {
    repository.actorTotals.mockResolvedValue([
      { actor_user_id: null, sent: '1', failed: '0' },
      { actor_user_id: '40', sent: '4', failed: '1' },
      { actor_user_id: '39', sent: '2', failed: '1' },
    ]);
    expect(await service.getActorTotals({ ownerId: 1 }, { days: 7 })).toEqual([
      { actorUserId: 39, sent: 2, failed: 1 },
      { actorUserId: 40, sent: 4, failed: 1 },
      { actorUserId: null, sent: 1, failed: 0 },
    ]);
  });
});

describe('listFinalFailures', () => {
  it('cần runId hoặc window; limit nằm trong 1..500 (mặc định 50)', async () => {
    await expect(service.listFinalFailures({ ownerId: 1 })).rejects.toThrow(TypeError);
    await expect(service.listFinalFailures({ ownerId: 1 }, {})).rejects.toThrow(TypeError);
    await expect(service.listFinalFailures({ ownerId: 1 }, { runId: 'x' })).rejects.toThrow(TypeError);
    await expect(service.listFinalFailures({ ownerId: 1 }, { runId: 5, limit: 0 })).rejects.toThrow(RangeError);
    await expect(service.listFinalFailures({ ownerId: 1 }, { runId: 5, limit: 501 })).rejects.toThrow(RangeError);
    await expect(service.listFinalFailures({ ownerId: 1 }, { runId: 5, limit: 1.5 })).rejects.toThrow(RangeError);
    repository.finalFailures.mockResolvedValue([]);
    await service.listFinalFailures({ ownerId: 1 }, { runId: '5' });
    expect(repository.finalFailures).toHaveBeenCalledWith({
      scope: { ownerId: 1, excludeOwnerIds: [] },
      runId: 5,
      window: null,
      limit: 50,
      channels: KENH_CHO_REPOSITORY,
    });
  });

  it('ánh xạ dòng: số ở dạng số, thiếu thì null, giữ nguyên thời điểm', async () => {
    const at = new Date('2026-03-15T06:00:00.000Z');
    repository.finalFailures.mockResolvedValue([
      {
        id_run: '5', id_campaign: '2', channel: 'telegram', recipient: 'peerx', recipient_display: 'A',
        reason: 'hard: x', attempts: '1', at,
      },
      {
        id_run: null, id_campaign: null, channel: 'email', recipient: 'a@t.vn', recipient_display: null,
        reason: null, attempts: '2', at,
      },
    ]);
    expect(await service.listFinalFailures({ ownerId: 1 }, { window: { days: 7 } })).toEqual([
      {
        runId: 5, campaignId: 2, channel: 'telegram', recipient: 'peerx', recipientDisplay: 'A',
        reason: 'hard: x', attempts: 1, at,
      },
      {
        runId: null, campaignId: null, channel: 'email', recipient: 'a@t.vn', recipientDisplay: null,
        reason: null, attempts: 2, at,
      },
    ]);
  });
});
