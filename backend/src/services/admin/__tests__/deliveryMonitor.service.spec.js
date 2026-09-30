/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-6 — ánh xạ của service trang "Giám sát gửi tin" của ADMIN. SQL thật (đếm tin,
 * lượt chạy, cột thời gian naive) do tests/integration/adminDeliveryMonitor*.test.js kiểm trên DB thật; ở đây giả lập
 * module đếm + repository để ghim các quyết định nằm trong JS: cửa sổ theo NGÀY VN, phạm vi (loại nội bộ / lọc một chủ),
 * kết bạn tách khỏi tin, % chưa gửi được, lượt chờ / đang gửi, lý do chờ, tín hiệu hạ tầng.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const sendStats = {
  getChannelTotals: jest.fn(),
  getHourlySeries: jest.fn(),
  getDailySeries: jest.fn(),
  getRunTotals: jest.fn(),
  getFailureReasons: jest.fn(),
  getOwnerTotals: jest.fn(),
};
const repository = {
  listRunningRuns: jest.fn(),
  listRecentRuns: jest.fn(),
  countFailedRuns: jest.fn(),
  countOpenAlertRules: jest.fn(),
  countStrangerBlocked: jest.fn(),
  findOwners: jest.fn(),
  safeQuery: jest.fn(),
};
const queue = { getQueueMetrics: jest.fn() };

// normalizeScope thật có ở sendStats.service.js (đã có spec riêng); ở đây chỉ cần hình dạng đầu ra.
const normalizeScope = (scope) => ({ ownerId: scope.ownerId, excludeOwnerIds: scope.excludeOwnerIds ?? [] });

jest.unstable_mockModule('../../stats/sendStats.service.js', () => ({ default: sendStats, normalizeScope }));
jest.unstable_mockModule('../../../repositories/admin/deliveryMonitor.repository.js', () => ({ default: repository }));
jest.unstable_mockModule('../../queue/outboundMessageQueue.service.js', () => ({ default: queue }));

const service = await import('../deliveryMonitor.service.js');

// 20:30 UTC ngày 29/09 = 03:30 giờ VN ngày 30/09 — giờ mà ngày UTC và ngày VN KHÁC nhau.
const NOW = new Date('2026-09-29T20:30:00.000Z');
const minutesFromNow = (n) => new Date(NOW.getTime() + n * 60_000).toISOString();

const CHANNELS = ['email', 'zalo_personal', 'zalo_group', 'zalo_friend_request', 'telegram', 'whatsapp'];
const totalsWith = (byChannel = {}) => CHANNELS.map((channel) => ({
  channel, sent: 0, failed: 0, bounced: 0, opened: 0, clicked: 0, ...(byChannel[channel] || {}),
}));

const runRow = (overrides = {}) => ({
  id: '7',
  id_campaign: '3',
  campaign_name: 'Chiến dịch 7',
  campaign_type: 'email',
  status: 'completed',
  started_at: new Date('2026-09-29T11:00:00.000Z'),
  total_recipients: 0,
  counters_reliable: true,
  owner_id: '5',
  deferred_until: null,
  deferred_reason: null,
  email_rate_limit_at: null,
  ...overrides,
});

const runningRow = (overrides = {}) => ({
  id: '9',
  campaign_name: 'Đang chạy',
  owner_id: '5',
  deferred_until: null,
  deferred_reason: null,
  email_rate_limit_at: null,
  ...overrides,
});

beforeEach(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'hrtime', 'performance', 'queueMicrotask'],
  });
  for (const fn of [...Object.values(sendStats), ...Object.values(repository), queue.getQueueMetrics]) fn.mockReset();
  delete process.env.INTERNAL_USER_IDS;
  sendStats.getChannelTotals.mockResolvedValue(totalsWith());
  sendStats.getHourlySeries.mockResolvedValue([]);
  sendStats.getDailySeries.mockResolvedValue([]);
  sendStats.getRunTotals.mockResolvedValue([]);
  sendStats.getFailureReasons.mockResolvedValue([]);
  sendStats.getOwnerTotals.mockResolvedValue([]);
  repository.listRunningRuns.mockResolvedValue([]);
  repository.listRecentRuns.mockResolvedValue([]);
  repository.countFailedRuns.mockResolvedValue(0);
  repository.countOpenAlertRules.mockResolvedValue(0);
  repository.countStrangerBlocked.mockResolvedValue(0);
  repository.findOwners.mockResolvedValue([]);
  repository.safeQuery.mockResolvedValue([]);
  queue.getQueueMetrics.mockResolvedValue(null);
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env.INTERNAL_USER_IDS;
});

describe('cửa sổ theo NGÀY VN', () => {
  it.each([
    ['today', '2026-09-30'],
    ['7d', '2026-09-24'],
    ['30d', '2026-09-01'],
  ])('%s: từ %s tới hôm nay (03:30 VN ngày 30/09 → 30/09 dù UTC còn 29/09), gồm trọn hôm nay', async (key, fromDate) => {
    const data = await service.getDeliveryMonitorOverview({ window: key });
    expect(data.window).toEqual({ key, fromDate, toDate: '2026-09-30' });
    expect(sendStats.getChannelTotals).toHaveBeenCalledWith(expect.anything(), { fromDate, toDate: '2026-09-30' });
    expect(sendStats.getFailureReasons).toHaveBeenCalledWith(expect.anything(), { fromDate, toDate: '2026-09-30' }, expect.anything());
    expect(sendStats.getOwnerTotals).toHaveBeenCalledWith(expect.anything(), { fromDate, toDate: '2026-09-30' }, expect.anything());
    expect(repository.countFailedRuns).toHaveBeenCalledWith({ scope: expect.anything(), window: { fromDate, toDate: '2026-09-30' } });
  });

  it('qua ranh giới tháng và năm: 7d ngày 02/01 bắt đầu từ 27/12 năm trước', async () => {
    jest.setSystemTime(new Date('2027-01-02T03:00:00.000Z')); // 10:00 VN ngày 02/01/2027
    const data = await service.getDeliveryMonitorOverview({ window: '7d' });
    expect(data.window).toEqual({ key: '7d', fromDate: '2026-12-27', toDate: '2027-01-02' });
  });

  it('mặc định today; window lạ → lỗi 400 và KHÔNG chạm DB', async () => {
    expect((await service.getDeliveryMonitorOverview()).window.key).toBe('today');
    expect((await service.getDeliveryMonitorOverview({ window: '' })).window.key).toBe('today');
    jest.clearAllMocks();
    for (const bad of ['90d', '7', 'week', 'TODAY']) {
      await expect(service.getDeliveryMonitorOverview({ window: bad })).rejects.toMatchObject({ status: 400 });
    }
    expect(sendStats.getChannelTotals).not.toHaveBeenCalled();
    expect(repository.listRunningRuns).not.toHaveBeenCalled();
  });

  it('biểu đồ: hôm nay theo GIỜ từ 00:00 tới giờ hiện tại (03:30 → 4 giờ); 7d / 30d theo NGÀY', async () => {
    const hourly = [{ hour: '2026-09-29T17:00:00.000Z', channel: 'email', sent: 3, failed: 0 }];
    sendStats.getHourlySeries.mockResolvedValue(hourly);
    const today = await service.getDeliveryMonitorOverview({ window: 'today' });
    expect(sendStats.getHourlySeries).toHaveBeenCalledWith(expect.anything(), { hours: 4 });
    expect(sendStats.getDailySeries).not.toHaveBeenCalled();
    expect(today.series).toEqual({ unit: 'hour', rows: hourly });

    jest.clearAllMocks();
    const daily = [{ day: '2026-09-28', channel: 'email', sent: 3, failed: 0 }];
    sendStats.getDailySeries.mockResolvedValue(daily);
    const week = await service.getDeliveryMonitorOverview({ window: '7d' });
    expect(sendStats.getDailySeries).toHaveBeenCalledWith(expect.anything(), { fromDate: '2026-09-24', toDate: '2026-09-30' });
    expect(sendStats.getHourlySeries).not.toHaveBeenCalled();
    expect(week.series).toEqual({ unit: 'day', rows: daily });
  });

  it('lúc 00:10 VN (giờ 0): biểu đồ hôm nay có 1 giờ; 23:59 VN: 24 giờ', async () => {
    jest.setSystemTime(new Date('2026-09-29T17:10:00.000Z')); // 00:10 VN ngày 30/09
    await service.getDeliveryMonitorOverview({ window: 'today' });
    expect(sendStats.getHourlySeries).toHaveBeenLastCalledWith(expect.anything(), { hours: 1 });
    jest.setSystemTime(new Date('2026-09-30T16:59:00.000Z')); // 23:59 VN ngày 30/09
    await service.getDeliveryMonitorOverview({ window: 'today' });
    expect(sendStats.getHourlySeries).toHaveBeenLastCalledWith(expect.anything(), { hours: 24 });
  });

  it('biểu đồ bỏ dòng của kênh kết bạn (không phải "tin")', async () => {
    sendStats.getHourlySeries.mockResolvedValue([
      { hour: 'h', channel: 'zalo_friend_request', sent: 9, failed: 0 },
      { hour: 'h', channel: 'email', sent: 1, failed: 0 },
    ]);
    const { series } = await service.getDeliveryMonitorOverview();
    expect(series.rows).toEqual([{ hour: 'h', channel: 'email', sent: 1, failed: 0 }]);
  });
});

describe('phạm vi: loại tài khoản nội bộ / lọc một chủ', () => {
  const scopeOfEveryCall = () => [
    sendStats.getChannelTotals.mock.calls[0][0],
    sendStats.getFailureReasons.mock.calls[0][0],
    sendStats.getOwnerTotals.mock.calls[0][0],
    sendStats.getHourlySeries.mock.calls[0][0],
    repository.listRunningRuns.mock.calls[0][0].scope,
    repository.listRecentRuns.mock.calls[0][0].scope,
    repository.countFailedRuns.mock.calls[0][0].scope,
    repository.countStrangerBlocked.mock.calls[0][0].scope,
  ];

  it('mặc định: toàn hệ thống (ownerId null TƯỜNG MINH) trừ 39 và 116 — ở MỌI truy vấn', async () => {
    const data = await service.getDeliveryMonitorOverview();
    for (const scope of scopeOfEveryCall()) expect(scope).toEqual({ ownerId: null, excludeOwnerIds: [39, 116] });
    expect(data.filter).toEqual({ ownerId: null, includeInternal: false, excludedOwnerIds: [39, 116] });
  });

  it('includeInternal → không loại ai', async () => {
    const data = await service.getDeliveryMonitorOverview({ includeInternal: true });
    for (const scope of scopeOfEveryCall()) expect(scope).toEqual({ ownerId: null, excludeOwnerIds: [] });
    expect(data.filter).toEqual({ ownerId: null, includeInternal: true, excludedOwnerIds: [] });
  });

  it('env INTERNAL_USER_IDS đổi danh sách và được đọc LÚC GỌI', async () => {
    process.env.INTERNAL_USER_IDS = '5, 6';
    expect((await service.getDeliveryMonitorOverview()).filter.excludedOwnerIds).toEqual([5, 6]);
    process.env.INTERNAL_USER_IDS = '7';
    expect((await service.getDeliveryMonitorOverview()).filter.excludedOwnerIds).toEqual([7]);
    delete process.env.INTERNAL_USER_IDS;
    expect((await service.getDeliveryMonitorOverview()).filter.excludedOwnerIds).toEqual([39, 116]);
  });

  it('ownerId (số hoặc chuỗi số): một chủ, ghi đè việc loại nội bộ; Zalo silent-drop theo đúng chủ', async () => {
    const data = await service.getDeliveryMonitorOverview({ ownerId: '39' });
    for (const scope of scopeOfEveryCall()) expect(scope).toEqual({ ownerId: 39, excludeOwnerIds: [] });
    expect(data.filter).toEqual({ ownerId: 39, includeInternal: false, excludedOwnerIds: [] });
    const [sql, params] = repository.safeQuery.mock.calls[0];
    expect(sql).toContain('c.id_user = $1');
    expect(params).toEqual([39]);
  });

  it('toàn hệ thống: silent-drop không có điều kiện chủ', async () => {
    await service.getDeliveryMonitorOverview();
    const [sql, params] = repository.safeQuery.mock.calls[0];
    expect(sql).not.toContain('c.id_user');
    expect(params).toEqual([]);
  });

  it.each([['abc'], ['0'], ['-3'], ['1.5'], [0], [-1], [['1']]])('ownerId sai (%p) → 400 và KHÔNG chạm DB', async (bad) => {
    await expect(service.getDeliveryMonitorOverview({ ownerId: bad })).rejects.toMatchObject({ status: 400 });
    expect(sendStats.getChannelTotals).not.toHaveBeenCalled();
  });

  it('ownerId rỗng / null = không lọc', async () => {
    for (const empty of [undefined, null, '']) {
      const data = await service.getDeliveryMonitorOverview({ ownerId: empty });
      expect(data.filter.ownerId).toBeNull();
    }
  });
});

describe('totals', () => {
  it('kết bạn TÁCH khỏi tổng và khỏi byChannel; byChannel đủ 5 kênh "tin" đúng thứ tự; % trên (đã gửi + chưa gửi được)', async () => {
    sendStats.getChannelTotals.mockResolvedValue(totalsWith({
      email: { sent: 6, failed: 1, bounced: 2, opened: 3 },
      zalo_personal: { sent: 1, failed: 1 },
      zalo_friend_request: { sent: 40, failed: 6 },
      telegram: { sent: 2, failed: 0 },
    }));
    const { totals } = await service.getDeliveryMonitorOverview();
    expect(totals).toEqual({
      sent: 9,
      failed: 2,
      failedPercent: 18.2, // 2 / 11
      byChannel: [
        { channel: 'email', sent: 6, failed: 1 },
        { channel: 'zalo_personal', sent: 1, failed: 1 },
        { channel: 'zalo_group', sent: 0, failed: 0 },
        { channel: 'telegram', sent: 2, failed: 0 },
        { channel: 'whatsapp', sent: 0, failed: 0 },
      ],
      friendRequests: { sent: 40, failed: 6 },
    });
  });

  it('không có tin nào → failedPercent null (không phải 0 hay NaN); registry thiếu kênh kết bạn → 0/0', async () => {
    sendStats.getChannelTotals.mockResolvedValue(totalsWith().filter((row) => row.channel !== 'zalo_friend_request'));
    const { totals } = await service.getDeliveryMonitorOverview();
    expect(totals.failedPercent).toBeNull();
    expect(totals.friendRequests).toEqual({ sent: 0, failed: 0 });
  });

  it('chỉ chưa gửi được (0 đã gửi) → 100%', async () => {
    sendStats.getChannelTotals.mockResolvedValue(totalsWith({ email: { failed: 4 } }));
    expect((await service.getDeliveryMonitorOverview()).totals.failedPercent).toBe(100);
  });

  it('bảng lý do và bảng khách bỏ kênh kết bạn; giới hạn 10 mỗi bảng', async () => {
    await service.getDeliveryMonitorOverview();
    expect(sendStats.getFailureReasons).toHaveBeenCalledWith(expect.anything(), expect.anything(), { limit: 10, excludeChannels: ['zalo_friend_request'] });
    expect(sendStats.getOwnerTotals).toHaveBeenCalledWith(expect.anything(), expect.anything(), { limit: 10, excludeChannels: ['zalo_friend_request'] });
  });
});

describe('lượt chạy: đang gửi / đang chờ / lỗi', () => {
  it('đếm trên MỌI lượt running; lượt chờ KHÔNG nằm trong đang gửi; lý do nhiều nhất trước, hoà thì theo mã; first = lượt tự chạy lại sớm nhất', async () => {
    repository.countFailedRuns.mockResolvedValue(4);
    repository.listRunningRuns.mockResolvedValue([
      runningRow({ id: '1', campaign_name: 'Đang gửi' }),
      runningRow({ id: '2', campaign_name: 'Mốc cũ', deferred_until: minutesFromNow(-10), deferred_reason: 'rate_limited' }),
      runningRow({ id: '3', campaign_name: 'Quota 1', deferred_until: minutesFromNow(200), deferred_reason: 'plan_quota_daily' }),
      runningRow({ id: '4', campaign_name: 'Quota 2', deferred_until: minutesFromNow(30), deferred_reason: 'plan_quota_daily' }),
      runningRow({ id: '5', campaign_name: 'Yên lặng', deferred_until: minutesFromNow(120), deferred_reason: 'quiet_hours' }),
    ]);
    const { runs } = await service.getDeliveryMonitorOverview();
    expect(runs.sending).toBe(2); // 'Đang gửi' + 'Mốc cũ' (mốc đã qua)
    expect(runs.failed).toBe(4);
    expect(runs.waiting).toEqual({
      count: 3,
      reasons: [{ reason: 'plan_quota_daily', count: 2 }, { reason: 'quiet_hours', count: 1 }],
      first: { campaignName: 'Quota 2', waitingReason: 'plan_quota_daily', waitingUntil: minutesFromNow(30) },
    });
  });

  it('không có lượt running: 0 / 0, waiting rỗng', async () => {
    const { runs } = await service.getDeliveryMonitorOverview();
    expect(runs).toEqual({ sending: 0, failed: 0, waiting: { count: 0, reasons: [], first: null } });
  });

  it('SMTP chặn: cùng mã "chờ bước kế" nhưng emailRateLimitAt trong khung 13 giờ → smtp_rate_limited; mốc cũ giữ mã gốc', async () => {
    repository.listRunningRuns.mockResolvedValue([
      runningRow({ id: '1', deferred_until: minutesFromNow(360), deferred_reason: 'all_recipients_waiting_next_due', email_rate_limit_at: minutesFromNow(-1) }),
      runningRow({ id: '2', deferred_until: minutesFromNow(3 * 24 * 60), deferred_reason: 'all_recipients_waiting_next_due', email_rate_limit_at: minutesFromNow(-3 * 24 * 60) }),
    ]);
    const { runs } = await service.getDeliveryMonitorOverview();
    expect(runs.waiting.reasons).toEqual([
      { reason: 'all_recipients_waiting_next_due', count: 1 },
      { reason: 'smtp_rate_limited', count: 1 },
    ]);
  });

  it('lượt chờ không có mã lý do → reason null (không mất khỏi bộ đếm)', async () => {
    repository.listRunningRuns.mockResolvedValue([runningRow({ deferred_until: minutesFromNow(5), deferred_reason: null })]);
    const { runs } = await service.getDeliveryMonitorOverview();
    expect(runs.waiting).toMatchObject({ count: 1, reasons: [{ reason: null, count: 1 }] });
    expect(runs.sending).toBe(0);
  });
});

describe('bảng lượt chạy', () => {
  it('20 lượt mới nhất toàn hệ thống; số tin hỏi module đếm với các lượt vừa liệt kê (id số), không đọc bộ đếm campaign_runs', async () => {
    repository.listRecentRuns.mockResolvedValue([runRow({ id: '12' }), runRow({ id: '8' })]);
    await service.getDeliveryMonitorOverview();
    expect(repository.listRecentRuns).toHaveBeenCalledWith({ scope: { ownerId: null, excludeOwnerIds: [39, 116] }, limit: 20 });
    expect(sendStats.getRunTotals).toHaveBeenCalledWith({ ownerId: null, excludeOwnerIds: [39, 116] }, [12, 8]);
  });

  it('cộng mọi kênh của lượt; lượt không có dòng tin = 0; đủ trường kèm chủ (tên hiển thị = họ tên, thiếu thì username)', async () => {
    repository.listRecentRuns.mockResolvedValue([
      runRow({ id: '7', owner_id: '5' }),
      runRow({ id: '8', owner_id: '6', campaign_name: 'Không tin' }),
    ]);
    sendStats.getRunTotals.mockResolvedValue([
      { runId: 7, channel: 'email', sent: 3, failed: 1 },
      { runId: 7, channel: 'zalo_friend_request', sent: 2, failed: 0 },
    ]);
    repository.findOwners.mockResolvedValue([
      { id: '5', username: 'chu5', full_name: ' Nguyễn Chủ ' },
      { id: '6', username: 'chu6', full_name: '' },
    ]);
    const { recentRuns } = await service.getDeliveryMonitorOverview();
    expect(recentRuns[0]).toEqual({
      runId: 7,
      campaignId: 3,
      campaignName: 'Chiến dịch 7',
      campaignType: 'email',
      ownerId: 5,
      ownerName: 'Nguyễn Chủ',
      ownerUsername: 'chu5',
      status: 'completed',
      startedAt: '2026-09-29T11:00:00.000Z',
      waitingUntil: null,
      waitingReason: null,
      sent: 5,
      failed: 1,
      planned: null,
    });
    expect(recentRuns[1]).toMatchObject({ runId: 8, ownerName: 'chu6', ownerUsername: 'chu6', sent: 0, failed: 0 });
  });

  it('planned: bộ đếm đáng tin và total ≥ sent → total; lượt cũ / total nhỏ hơn sent / total 0 → null', async () => {
    repository.listRecentRuns.mockResolvedValue([
      runRow({ id: '1', total_recipients: 500 }),
      runRow({ id: '2', total_recipients: 500, counters_reliable: false }),
      runRow({ id: '3', total_recipients: 2 }),
      runRow({ id: '4', total_recipients: 0 }),
      runRow({ id: '5', total_recipients: 500, counters_reliable: null }),
    ]);
    sendStats.getRunTotals.mockResolvedValue([1, 2, 3, 4, 5].map((runId) => ({ runId, channel: 'email', sent: 3, failed: 0 })));
    const { recentRuns } = await service.getDeliveryMonitorOverview();
    expect(recentRuns.map((run) => run.planned)).toEqual([500, null, null, null, null]);
  });

  it('mốc chờ chỉ có nghĩa với lượt RUNNING và còn ở tương lai: lượt xong / lỗi, hoặc mốc đã qua → null', async () => {
    const until = minutesFromNow(60);
    repository.listRecentRuns.mockResolvedValue([
      runRow({ id: '1', status: 'running', deferred_until: until, deferred_reason: 'quiet_hours' }),
      runRow({ id: '2', status: 'completed', deferred_until: until, deferred_reason: 'quiet_hours' }),
      runRow({ id: '3', status: 'failed', deferred_until: until, deferred_reason: 'quiet_hours' }),
      runRow({ id: '4', status: 'running', deferred_until: minutesFromNow(-5), deferred_reason: 'quiet_hours' }),
    ]);
    const { recentRuns } = await service.getDeliveryMonitorOverview();
    expect(recentRuns.map((run) => [run.waitingUntil, run.waitingReason])).toEqual([
      [until, 'quiet_hours'], [null, null], [null, null], [null, null],
    ]);
  });

  it('chủ không tìm thấy trong bảng users → tên null (không vỡ)', async () => {
    repository.listRecentRuns.mockResolvedValue([runRow({ owner_id: '99' })]);
    const { recentRuns } = await service.getDeliveryMonitorOverview();
    expect(recentRuns[0]).toMatchObject({ ownerId: 99, ownerName: null, ownerUsername: null });
  });
});

describe('nguyên nhân chưa gửi được và khách gửi nhiều nhất', () => {
  it('lý do được phân loại; giữ nguyên thứ tự và số đếm từ module đếm', async () => {
    const lastAt = new Date('2026-09-30T01:00:00.000Z');
    sendStats.getFailureReasons.mockResolvedValue([
      { channel: 'email', reason: 'Mailbox not found', count: 5, lastAt },
      { channel: 'zalo_personal', reason: 'Zalo rate limit exceeded', count: 2, lastAt },
      { channel: 'telegram', reason: null, count: 1, lastAt },
    ]);
    const { failureReasons } = await service.getDeliveryMonitorOverview();
    expect(failureReasons).toEqual([
      { channel: 'email', reason: 'Mailbox not found', category: 'recipient_invalid', count: 5, lastAt },
      { channel: 'zalo_personal', reason: 'Zalo rate limit exceeded', category: 'rate_limit', count: 2, lastAt },
      { channel: 'telegram', reason: null, category: 'unknown', count: 1, lastAt },
    ]);
  });

  it('bảng khách: tên lấy từ bảng users, id số; chủ thiếu hồ sơ → tên null', async () => {
    sendStats.getOwnerTotals.mockResolvedValue([
      { ownerId: 5, sent: 10, failed: 2 },
      { ownerId: 6, sent: 4, failed: 0 },
    ]);
    repository.findOwners.mockResolvedValue([{ id: '5', username: 'chu5', full_name: 'Chủ Năm' }]);
    const { topOwners } = await service.getDeliveryMonitorOverview();
    expect(repository.findOwners).toHaveBeenCalledWith([5, 6]);
    expect(topOwners).toEqual([
      { ownerId: 5, name: 'Chủ Năm', username: 'chu5', sent: 10, failed: 2 },
      { ownerId: 6, name: null, username: null, sent: 4, failed: 0 },
    ]);
  });

  it('tra tên chủ MỘT lần cho cả hai bảng (không trùng id)', async () => {
    sendStats.getOwnerTotals.mockResolvedValue([{ ownerId: 5, sent: 1, failed: 0 }]);
    repository.listRecentRuns.mockResolvedValue([runRow({ owner_id: '5' }), runRow({ id: '8', owner_id: '6' })]);
    await service.getDeliveryMonitorOverview();
    expect(repository.findOwners).toHaveBeenCalledTimes(1);
    expect(repository.findOwners.mock.calls[0][0].sort()).toEqual([5, 6]);
  });
});

describe('hàng đợi, cảnh báo, tín hiệu', () => {
  it('BullMQ tắt → { available: false }, không có tín hiệu backlog', async () => {
    const data = await service.getDeliveryMonitorOverview();
    expect(data.queue).toEqual({ available: false });
    expect(data.signals).toEqual([]);
  });

  it('hàng đợi: đang xử lý = waiting + active; delayed (hẹn thử lại) hiện riêng và KHÔNG cộng vào backlog', async () => {
    queue.getQueueMetrics.mockResolvedValue({ waiting: 40, active: 10, delayed: 5000, completed: 100, failed: 200, paused: 0 });
    const data = await service.getDeliveryMonitorOverview();
    expect(data.queue).toEqual({ available: true, waiting: 40, active: 10, delayed: 5000 });
    expect(data.signals.find((signal) => signal.code === 'queue_backlog')).toBeUndefined();
  });

  it('backlog: waiting + active ≥ 100 → cảnh báo warning kèm số', async () => {
    queue.getQueueMetrics.mockResolvedValue({ waiting: 90, active: 10, delayed: 0 });
    const data = await service.getDeliveryMonitorOverview();
    expect(data.signals).toEqual([{ level: 'warning', code: 'queue_backlog', value: 100 }]);
    queue.getQueueMetrics.mockResolvedValue({ waiting: 90, active: 9, delayed: 0 });
    expect((await service.getDeliveryMonitorOverview()).signals).toEqual([]);
  });

  it('cảnh báo đang mở: số luật', async () => {
    repository.countOpenAlertRules.mockResolvedValue(3);
    expect((await service.getDeliveryMonitorOverview()).alerts).toEqual({ open: 3 });
  });

  it('stranger_blocked > 0 → critical; đứng trước tín hiệu silent-drop', async () => {
    repository.countStrangerBlocked.mockResolvedValue(2);
    repository.safeQuery.mockResolvedValue([{ account_id: 7, account_name: 'Hot', attempts: 10, silent_drops: 5 }]);
    const { signals } = await service.getDeliveryMonitorOverview();
    expect(signals.map((signal) => signal.code)).toEqual(['stranger_blocked_detected', 'zalo_silent_drop_high']);
    expect(signals[0]).toEqual({ level: 'critical', code: 'stranger_blocked_detected', value: 2 });
    expect(signals[1]).toMatchObject({ level: 'critical', accountId: 7, silentDrops: 5, attempts: 10, value: 50 });
  });

  it('các tín hiệu của trang cũ đã bỏ: không bao giờ sinh high_failure_rate / stalled_runs / many_unreachable_zalo / provider_limit_detected', async () => {
    sendStats.getChannelTotals.mockResolvedValue(totalsWith({ email: { sent: 1, failed: 99 } }));
    repository.listRunningRuns.mockResolvedValue([runningRow({ deferred_until: minutesFromNow(600), deferred_reason: 'quiet_hours' })]);
    sendStats.getFailureReasons.mockResolvedValue([{ channel: 'email', reason: 'account banned rate limit', count: 99, lastAt: new Date() }]);
    const { signals } = await service.getDeliveryMonitorOverview();
    expect(signals).toEqual([]);
  });
});

describe('hình dạng phản hồi', () => {
  it('đúng tập khoá; generatedAt là giờ của phản hồi (ISO); không còn trường của trang cũ', async () => {
    const data = await service.getDeliveryMonitorOverview();
    expect(Object.keys(data).sort()).toEqual([
      'alerts', 'failureReasons', 'filter', 'generatedAt', 'queue', 'recentRuns', 'runs', 'series', 'signals', 'topOwners',
      'totals', 'window',
    ]);
    expect(data.generatedAt).toBe(NOW.toISOString());
  });

  it('lỗi truy vấn KHÔNG bị nuốt (khác safeQuery cũ): module đếm ném thì cả hàm ném', async () => {
    sendStats.getChannelTotals.mockRejectedValue(new Error('boom'));
    await expect(service.getDeliveryMonitorOverview()).rejects.toThrow('boom');
    sendStats.getChannelTotals.mockResolvedValue(totalsWith());
    repository.countFailedRuns.mockRejectedValue(new Error('cột sai'));
    await expect(service.getDeliveryMonitorOverview()).rejects.toThrow('cột sai');
  });
});
