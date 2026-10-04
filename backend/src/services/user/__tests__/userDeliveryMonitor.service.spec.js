/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4b — ánh xạ của service trang "Giám sát gửi tin". SQL thật (đếm tin, lượt
 * chạy, cột thời gian naive) do tests/integration/userDeliveryMonitor*.test.js kiểm trên DB thật; ở đây giả lập module
 * đếm + repository để ghim các quyết định nằm trong JS: ngày "hôm nay" theo giờ VN, phạm vi chủ, kết bạn tách khỏi tin,
 * "cần gửi" chỉ khi bộ đếm đáng tin, lượt chờ / đang gửi, SMTP chặn.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const sendStats = {
  getChannelTotals: jest.fn(),
  getHourlySeries: jest.fn(),
  getRunTotals: jest.fn(),
  listFinalFailures: jest.fn(),
};
const userRepository = {
  listRecentRuns: jest.fn(),
  listRunningRuns: jest.fn(),
  findOwnedRun: jest.fn(),
  findOwnedRunForEstimate: jest.fn(),
};
const ledgerRepository = { summarizeRunProgress: jest.fn() };
const estimateForCampaign = jest.fn();
const safeQuery = jest.fn();

jest.unstable_mockModule('../../stats/sendStats.service.js', () => ({ default: sendStats }));
jest.unstable_mockModule('../../../repositories/user/userDeliveryMonitor.repository.js', () => ({ default: userRepository }));
jest.unstable_mockModule('../../../repositories/admin/deliveryMonitor.repository.js', () => ({ default: { safeQuery } }));
jest.unstable_mockModule('../../../repositories/campaign/recipientLedger.repository.js', () => ({ default: ledgerRepository }));
// Ranh giới ước tính: giữ NGUYÊN `summarizeLedgerForRemaining` thật (hàm thuần), chỉ giả `estimateForCampaign`.
const realEstimate = await import('../../campaign/campaignEstimate.service.js');
jest.unstable_mockModule('../../campaign/campaignEstimate.service.js', () => ({
  ...realEstimate,
  estimateForCampaign,
}));

const service = await import('../userDeliveryMonitor.service.js');

// 20:30 UTC ngày 29/09 = 03:30 giờ VN ngày 30/09 — giờ mà ngày UTC và ngày VN KHÁC nhau.
const NOW = new Date('2026-09-29T20:30:00.000Z');
const minutesFromNow = (n) => new Date(NOW.getTime() + n * 60_000).toISOString();

const EMPTY_TOTALS = [
  { channel: 'email', sent: 0, failed: 0, bounced: 0, opened: 0, clicked: 0 },
  { channel: 'zalo_personal', sent: 0, failed: 0, bounced: 0, opened: 0, clicked: 0 },
  { channel: 'zalo_group', sent: 0, failed: 0, bounced: 0, opened: 0, clicked: 0 },
  { channel: 'zalo_friend_request', sent: 0, failed: 0, bounced: 0, opened: 0, clicked: 0 },
  { channel: 'telegram', sent: 0, failed: 0, bounced: 0, opened: 0, clicked: 0 },
  { channel: 'whatsapp', sent: 0, failed: 0, bounced: 0, opened: 0, clicked: 0 },
];
const totalsWith = (byChannel) => EMPTY_TOTALS.map((row) => ({ ...row, ...(byChannel[row.channel] || {}) }));

const runRow = (overrides = {}) => ({
  id: '7',
  id_campaign: '3',
  campaign_name: 'Chiến dịch 7',
  campaign_type: 'email',
  status: 'completed',
  started_at: new Date('2026-09-29T11:00:00.000Z'),
  total_recipients: 0,
  counters_reliable: true,
  deferred_until: null,
  deferred_reason: null,
  email_rate_limit_at: null,
  ...overrides,
});

const runningRow = (overrides = {}) => ({
  id: '9',
  campaign_name: 'Đang chạy',
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
  for (const fn of [...Object.values(sendStats), ...Object.values(userRepository), safeQuery]) fn.mockReset();
  sendStats.getChannelTotals.mockResolvedValue(EMPTY_TOTALS);
  sendStats.getHourlySeries.mockResolvedValue([]);
  sendStats.getRunTotals.mockResolvedValue([]);
  userRepository.listRecentRuns.mockResolvedValue([]);
  userRepository.listRunningRuns.mockResolvedValue([]);
  safeQuery.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('getVnToday', () => {
  it('ngày theo GIỜ VN, không phải ngày UTC: 16:59:59Z còn 29/09, 17:00:00Z đã sang 30/09', () => {
    expect(service.getVnToday(new Date('2026-09-29T16:59:59.000Z'))).toBe('2026-09-29');
    expect(service.getVnToday(new Date('2026-09-29T17:00:00.000Z'))).toBe('2026-09-30');
    expect(service.getVnToday(new Date('2026-12-31T20:00:00.000Z'))).toBe('2027-01-01');
  });
});

describe('getUserDeliveryMonitorOverview — phạm vi và cửa sổ', () => {
  it('dùng NGÀY VN cho "hôm nay" (03:30 VN ngày 30/09 → 30/09 dù UTC còn 29/09), phạm vi đúng chủ, biểu đồ 24 giờ, 10 lượt', async () => {
    await service.getUserDeliveryMonitorOverview({ userId: 39 });

    expect(sendStats.getChannelTotals).toHaveBeenCalledWith({ ownerId: 39 }, { fromDate: '2026-09-30', toDate: '2026-09-30' });
    expect(sendStats.getHourlySeries).toHaveBeenCalledWith({ ownerId: 39 }, { hours: 24 });
    expect(userRepository.listRecentRuns).toHaveBeenCalledWith({ ownerId: 39, limit: 10 });
    expect(userRepository.listRunningRuns).toHaveBeenCalledWith({ ownerId: 39 });
  });

  it('chuỗi số ("39") được chấp nhận; thiếu / sai chủ thì ném lỗi và KHÔNG chạm DB (không rơi sang toàn hệ thống)', async () => {
    await service.getUserDeliveryMonitorOverview({ userId: '39' });
    expect(sendStats.getChannelTotals).toHaveBeenCalledWith({ ownerId: 39 }, expect.anything());

    jest.clearAllMocks();
    for (const bad of [undefined, null, 0, -3, 1.5, 'abc', '']) {
      await expect(service.getUserDeliveryMonitorOverview({ userId: bad })).rejects.toThrow(TypeError);
    }
    await expect(service.getUserDeliveryMonitorOverview()).rejects.toThrow(TypeError);
    expect(sendStats.getChannelTotals).not.toHaveBeenCalled();
    expect(userRepository.listRecentRuns).not.toHaveBeenCalled();
  });

  it('số theo lượt chạy hỏi đúng các lượt vừa liệt kê, id ở dạng số', async () => {
    userRepository.listRecentRuns.mockResolvedValue([runRow({ id: '12' }), runRow({ id: '8' })]);
    await service.getUserDeliveryMonitorOverview({ userId: 39 });
    expect(sendStats.getRunTotals).toHaveBeenCalledWith({ ownerId: 39 }, [12, 8]);
  });
});

describe('getUserDeliveryMonitorOverview — today', () => {
  it('lời mời kết bạn TÁCH khỏi sent/failed tổng và khỏi byChannel; byChannel đủ 5 kênh "tin" đúng thứ tự', async () => {
    sendStats.getChannelTotals.mockResolvedValue(totalsWith({
      email: { sent: 5, failed: 1, bounced: 2, opened: 3 },
      zalo_personal: { sent: 1, failed: 1 },
      zalo_friend_request: { sent: 40, failed: 6 },
      telegram: { sent: 2, failed: 0 },
    }));
    const { today } = await service.getUserDeliveryMonitorOverview({ userId: 39 });

    expect(today).toEqual({
      date: '2026-09-30',
      sent: 8, // 5 + 1 + 0 + 2 — 40 lời mời kết bạn KHÔNG cộng vào
      failed: 2, // 1 + 1 — 6 lời mời lỗi KHÔNG cộng vào
      byChannel: [
        { channel: 'email', sent: 5, failed: 1 },
        { channel: 'zalo_personal', sent: 1, failed: 1 },
        { channel: 'zalo_group', sent: 0, failed: 0 },
        { channel: 'telegram', sent: 2, failed: 0 },
        { channel: 'whatsapp', sent: 0, failed: 0 },
      ],
      friendRequests: { sent: 40, failed: 6 },
    });
  });

  it('registry không có kênh kết bạn thì friendRequests = 0/0 (không vỡ)', async () => {
    sendStats.getChannelTotals.mockResolvedValue(EMPTY_TOTALS.filter((row) => row.channel !== 'zalo_friend_request'));
    const { today } = await service.getUserDeliveryMonitorOverview({ userId: 39 });
    expect(today.friendRequests).toEqual({ sent: 0, failed: 0 });
  });

  it('biểu đồ giờ bỏ dòng của kênh kết bạn, giữ nguyên các dòng còn lại', async () => {
    const rows = [
      { hour: '2026-09-29T16:00:00.000Z', channel: 'email', sent: 3, failed: 0 },
      { hour: '2026-09-29T16:00:00.000Z', channel: 'zalo_friend_request', sent: 9, failed: 0 },
      { hour: '2026-09-29T17:00:00.000Z', channel: 'telegram', sent: 1, failed: 1 },
    ];
    sendStats.getHourlySeries.mockResolvedValue(rows);
    const { hourly } = await service.getUserDeliveryMonitorOverview({ userId: 39 });
    expect(hourly).toEqual([rows[0], rows[2]]);
  });
});

describe('getUserDeliveryMonitorOverview — runs', () => {
  it('cộng mọi kênh của lượt; lượt không có dòng tin nào = 0; startedAt là ISO; đủ trường theo lệnh giao', async () => {
    userRepository.listRecentRuns.mockResolvedValue([
      runRow({ id: '7', total_recipients: 100 }),
      runRow({ id: '8', campaign_name: 'Trống', campaign_type: 'zalo' }),
    ]);
    sendStats.getRunTotals.mockResolvedValue([
      { runId: 7, channel: 'email', sent: 30, failed: 4 },
      { runId: 7, channel: 'zalo_friend_request', sent: 5, failed: 1 },
      { runId: 7, channel: 'telegram', sent: 2, failed: 0 },
    ]);
    const { runs } = await service.getUserDeliveryMonitorOverview({ userId: 39 });

    expect(runs).toEqual([
      {
        runId: 7, campaignId: 3, campaignName: 'Chiến dịch 7', campaignType: 'email', status: 'completed',
        startedAt: '2026-09-29T11:00:00.000Z', waitingUntil: null, waitingReason: null,
        sent: 37, failed: 5, planned: 100,
      },
      {
        runId: 8, campaignId: 3, campaignName: 'Trống', campaignType: 'zalo', status: 'completed',
        startedAt: '2026-09-29T11:00:00.000Z', waitingUntil: null, waitingReason: null,
        sent: 0, failed: 0, planned: null,
      },
    ]);
  });

  it.each([
    ['bộ đếm đáng tin, total ≥ sent', { counters_reliable: true, total_recipients: 500 }, 480, 500],
    ['total đúng bằng sent', { counters_reliable: true, total_recipients: 480 }, 480, 480],
    ['lượt tạo TRƯỚC mốc sửa 26/09 20:36 (bộ đếm phình / về 0)', { counters_reliable: false, total_recipients: 500 }, 480, null],
    ['total < sent (bộ đếm sai)', { counters_reliable: true, total_recipients: 479 }, 480, null],
    ['total = 0 nghĩa là chưa biết, không phải "cần gửi 0 tin"', { counters_reliable: true, total_recipients: 0 }, 0, null],
    ['cờ đáng tin thiếu (NULL)', { counters_reliable: null, total_recipients: 500 }, 480, null],
  ])('planned: %s', async (_ten, overrides, sent, expected) => {
    userRepository.listRecentRuns.mockResolvedValue([runRow({ id: '7', ...overrides })]);
    sendStats.getRunTotals.mockResolvedValue(sent > 0 ? [{ runId: 7, channel: 'email', sent, failed: 0 }] : []);
    const { runs } = await service.getUserDeliveryMonitorOverview({ userId: 39 });
    expect(runs[0].sent).toBe(sent);
    expect(runs[0].planned).toBe(expected);
  });

  it('mốc chờ chỉ có nghĩa với lượt RUNNING và còn ở tương lai: lượt xong / dừng / lỗi, hoặc mốc đã qua → null', async () => {
    const future = minutesFromNow(90);
    const past = minutesFromNow(-5);
    userRepository.listRecentRuns.mockResolvedValue([
      runRow({ id: '1', status: 'running', deferred_until: future, deferred_reason: 'quiet_hours' }),
      runRow({ id: '2', status: 'completed', deferred_until: future, deferred_reason: 'quiet_hours' }),
      runRow({ id: '3', status: 'stopped', deferred_until: future, deferred_reason: 'quiet_hours' }),
      runRow({ id: '4', status: 'failed', deferred_until: future, deferred_reason: 'quiet_hours' }),
      runRow({ id: '5', status: 'running', deferred_until: past, deferred_reason: 'quiet_hours' }),
      runRow({ id: '6', status: 'running', deferred_until: 'không phải ngày', deferred_reason: 'quiet_hours' }),
      runRow({ id: '10', status: 'running' }),
    ]);
    const { runs } = await service.getUserDeliveryMonitorOverview({ userId: 39 });
    const waiting = Object.fromEntries(runs.map((run) => [run.runId, [run.waitingUntil, run.waitingReason]]));
    expect(waiting).toEqual({
      1: [future, 'quiet_hours'],
      2: [null, null],
      3: [null, null],
      4: [null, null],
      5: [null, null],
      6: [null, null],
      10: [null, null],
    });
  });

  it('lượt đang chờ: sent / failed lấy NGUYÊN từ module đếm — chờ KHÔNG được cộng vào "chưa gửi được" (ở hàng lượt chạy lẫn thẻ hôm nay)', async () => {
    const until = minutesFromNow(90);
    userRepository.listRecentRuns.mockResolvedValue([
      runRow({ id: '1', status: 'running', deferred_until: until, deferred_reason: 'quiet_hours' }),
    ]);
    userRepository.listRunningRuns.mockResolvedValue([runningRow({ id: '1', deferred_until: until, deferred_reason: 'quiet_hours' })]);
    sendStats.getRunTotals.mockResolvedValue([{ runId: 1, channel: 'zalo_personal', sent: 3, failed: 0 }]);
    sendStats.getChannelTotals.mockResolvedValue(totalsWith({ zalo_personal: { sent: 3, failed: 0 } }));

    const data = await service.getUserDeliveryMonitorOverview({ userId: 39 });

    expect(data.runs[0]).toMatchObject({ status: 'running', waitingReason: 'quiet_hours', sent: 3, failed: 0 });
    expect(data.today).toMatchObject({ sent: 3, failed: 0 });
    expect(data.waiting.count).toBe(1);
  });

  it('SMTP chặn: cùng mã "chờ bước kế" nhưng emailRateLimitAt trong khung 13 giờ → smtp_rate_limited; mốc cũ hoặc xa thì giữ mã gốc', async () => {
    const nextDue = 'all_recipients_waiting_next_due';
    userRepository.listRecentRuns.mockResolvedValue([
      runRow({ id: '1', status: 'running', deferred_until: minutesFromNow(700), deferred_reason: nextDue, email_rate_limit_at: minutesFromNow(-10) }), // 710' < 13h
      runRow({ id: '2', status: 'running', deferred_until: minutesFromNow(900), deferred_reason: nextDue, email_rate_limit_at: minutesFromNow(-10) }), // 910' > 13h
      runRow({ id: '3', status: 'running', deferred_until: minutesFromNow(60), deferred_reason: nextDue, email_rate_limit_at: null }),
      runRow({ id: '4', status: 'running', deferred_until: minutesFromNow(60), deferred_reason: 'quiet_hours', email_rate_limit_at: minutesFromNow(-10) }), // mã khác: không đổi
      runRow({ id: '5', status: 'running', deferred_until: minutesFromNow(60), deferred_reason: nextDue, email_rate_limit_at: minutesFromNow(120) }), // đặt SAU mốc chờ: vô lý, không đổi
    ]);
    const { runs } = await service.getUserDeliveryMonitorOverview({ userId: 39 });
    expect(runs.map((run) => run.waitingReason)).toEqual([
      'smtp_rate_limited', nextDue, nextDue, 'quiet_hours', nextDue,
    ]);
  });
});

describe('getUserDeliveryMonitorOverview — waiting / running / signals', () => {
  it('đếm trên MỌI lượt running (không chỉ 10 lượt mới nhất); first = lượt sớm nhất tự chạy lại; running = số còn lại', async () => {
    userRepository.listRunningRuns.mockResolvedValue([
      runningRow({ id: '1', campaign_name: 'Chờ 2 giờ', deferred_until: minutesFromNow(120), deferred_reason: 'quiet_hours' }),
      runningRow({ id: '2', campaign_name: 'Chờ 30 phút', deferred_until: minutesFromNow(30), deferred_reason: 'plan_quota_daily' }),
      runningRow({ id: '3', campaign_name: 'Mốc đã qua', deferred_until: minutesFromNow(-1), deferred_reason: 'rate_limited' }),
      runningRow({ id: '4', campaign_name: 'Đang gửi' }),
    ]);
    const data = await service.getUserDeliveryMonitorOverview({ userId: 39 });
    expect(data.waiting).toEqual({
      count: 2,
      first: { campaignName: 'Chờ 30 phút', waitingReason: 'plan_quota_daily', waitingUntil: minutesFromNow(30) },
    });
    expect(data.running).toBe(2); // "Mốc đã qua" và "Đang gửi"
  });

  it('không có lượt chạy nào: waiting rỗng (first null), running 0', async () => {
    const data = await service.getUserDeliveryMonitorOverview({ userId: 39 });
    expect(data.waiting).toEqual({ count: 0, first: null });
    expect(data.running).toBe(0);
  });

  it('tín hiệu Zalo "gửi mà không tới" giữ nguyên: truy vấn 1 giờ theo chủ, lọc ngưỡng ở JS', async () => {
    safeQuery.mockResolvedValue([
      { account_id: 11, account_name: 'Acc A', attempts: 10, silent_drops: 5 },
      { account_id: 12, account_name: 'Acc B', attempts: 4, silent_drops: 4 }, // dưới ngưỡng tối thiểu 10 lượt
    ]);
    const { signals } = await service.getUserDeliveryMonitorOverview({ userId: 39 });
    expect(safeQuery.mock.calls[0][1]).toEqual([39]);
    expect(safeQuery.mock.calls[0][0]).toContain('c.id_user = $1');
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ code: 'zalo_silent_drop_high', accountId: 11, level: 'critical', value: 50 });
  });

  // PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3 — nhân viên chỉ thấy tín hiệu của tài khoản Zalo được giao.
  describe('lọc tín hiệu theo tài khoản được giao (G3)', () => {
    it('nhân viên: truy vấn mang accountScoped + tham số $2 = danh sách được giao; chủ tài khoản vẫn là $1', async () => {
      await service.getUserDeliveryMonitorOverview({ userId: 39, accessibleZaloAccountIds: [11, 13] });
      expect(safeQuery.mock.calls[0][1]).toEqual([39, [11, 13]]);
      expect(safeQuery.mock.calls[0][0]).toContain('c.id_user = $1');
      expect(safeQuery.mock.calls[0][0]).toContain('zm.account_id = ANY($2::bigint[])');
    });

    it('nhân viên chưa được giao gì: truy vấn vẫn có lọc với mảng RỖNG (không phải bản không lọc)', async () => {
      await service.getUserDeliveryMonitorOverview({ userId: 39, accessibleZaloAccountIds: [] });
      expect(safeQuery.mock.calls[0][1]).toEqual([39, []]);
      expect(safeQuery.mock.calls[0][0]).toContain('zm.account_id = ANY($2::bigint[])');
    });

    it('CHỦ (null) và người gọi cũ (bỏ trống): không lọc tài khoản, tham số chỉ [chủ]', async () => {
      await service.getUserDeliveryMonitorOverview({ userId: 39, accessibleZaloAccountIds: null });
      expect(safeQuery.mock.calls[0][1]).toEqual([39]);
      expect(safeQuery.mock.calls[0][0]).not.toContain('ANY($2');
      await service.getUserDeliveryMonitorOverview({ userId: 39 });
      expect(safeQuery.mock.calls[1][1]).toEqual([39]);
    });
  });

  it('generatedAt là giờ của phản hồi (ISO)', async () => {
    const data = await service.getUserDeliveryMonitorOverview({ userId: 39 });
    expect(data.generatedAt).toBe(NOW.toISOString());
  });
});

describe('getRunFailures', () => {
  it('tham số sai → 400, KHÔNG chạm DB', async () => {
    for (const [userId, runId] of [[39, 'abc'], [39, '12x'], [39, 0], [39, -1], [39, 1.5], [39, ''], [39, undefined], ['x', 5], [0, 5]]) {
      await expect(service.getRunFailures({ userId, runId })).rejects.toMatchObject({ status: 400 });
    }
    expect(userRepository.findOwnedRun).not.toHaveBeenCalled();
    expect(sendStats.listFinalFailures).not.toHaveBeenCalled();
  });

  it('lượt không thuộc chủ / không tồn tại → 404 và KHÔNG đọc danh sách người nhận', async () => {
    userRepository.findOwnedRun.mockResolvedValue(null);
    await expect(service.getRunFailures({ userId: 39, runId: 406 })).rejects.toMatchObject({ status: 404 });
    expect(userRepository.findOwnedRun).toHaveBeenCalledWith({ ownerId: 39, runId: 406 });
    expect(sendStats.listFinalFailures).not.toHaveBeenCalled();
  });

  it('đọc qua module đếm với phạm vi chủ + lượt, trần 200; ánh xạ dòng; giữ recipientAudit', async () => {
    const at = new Date('2026-09-29T11:00:00.000Z');
    const audit = { sourceRows: 6, attempted: 2 };
    userRepository.findOwnedRun.mockResolvedValue({ id: '406', recipient_audit: audit });
    sendStats.listFinalFailures.mockResolvedValue([
      { runId: 406, campaignId: 3, channel: 'whatsapp', recipient: '8490', recipientDisplay: 'Chị Lan', reason: 'hard: x', attempts: 2, at },
      { runId: 406, campaignId: 3, channel: 'email', recipient: 'a@t.vn', recipientDisplay: null, reason: null, attempts: 1, at },
    ]);

    const result = await service.getRunFailures({ userId: '39', runId: '406' });

    expect(sendStats.listFinalFailures).toHaveBeenCalledWith({ ownerId: 39 }, { runId: 406, limit: 200 });
    expect(result).toEqual({
      runId: 406,
      recipientAudit: audit,
      failures: [
        { channel: 'whatsapp', recipient: '8490', recipientDisplay: 'Chị Lan', reason: 'hard: x', attempts: 2, lastAt: at },
        { channel: 'email', recipient: 'a@t.vn', recipientDisplay: null, reason: null, attempts: 1, lastAt: at },
      ],
    });
  });

  it('lượt không có recipientAudit → null', async () => {
    userRepository.findOwnedRun.mockResolvedValue({ id: '406', recipient_audit: null });
    sendStats.listFinalFailures.mockResolvedValue([]);
    expect(await service.getRunFailures({ userId: 39, runId: 406 })).toEqual({ runId: 406, recipientAudit: null, failures: [] });
  });
});


describe('getRunEstimate — thời gian CÒN LẠI của lượt đang chạy (PR-5)', () => {
  const ownedRun = (overrides = {}) => ({
    id: '9', id_campaign: '438', status: 'running', is_continuous: false,
    deferred_until: null, deferred_reason: null, email_rate_limit_at: null, ...overrides,
  });
  const ESTIMATE = { finishAtLatest: '2026-10-06T02:45:00.000Z', totalActions: 499, warnings: [] };

  beforeEach(() => {
    service.clearRunEstimateCache();
    userRepository.findOwnedRunForEstimate.mockReset();
    ledgerRepository.summarizeRunProgress.mockReset().mockResolvedValue([]);
    estimateForCampaign.mockReset().mockResolvedValue(ESTIMATE);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('lượt của người khác / không có → 404, KHÔNG đụng sổ hay ước tính', async () => {
    userRepository.findOwnedRunForEstimate.mockResolvedValue(null);
    await expect(service.getRunEstimate({ userId: 5, runId: '9', now: NOW })).rejects.toMatchObject({ status: 404 });
    expect(userRepository.findOwnedRunForEstimate).toHaveBeenCalledWith({ ownerId: 5, runId: 9 });
    expect(ledgerRepository.summarizeRunProgress).not.toHaveBeenCalled();
    expect(estimateForCampaign).not.toHaveBeenCalled();
  });

  it('lượt người khác không đọc được kết quả đã đệm của chủ: kiểm quyền chạy TRƯỚC bộ nhớ đệm', async () => {
    userRepository.findOwnedRunForEstimate.mockResolvedValueOnce(ownedRun());
    await service.getRunEstimate({ userId: 5, runId: 9, now: NOW });
    userRepository.findOwnedRunForEstimate.mockResolvedValueOnce(null);
    await expect(service.getRunEstimate({ userId: 6, runId: 9, now: NOW })).rejects.toMatchObject({ status: 404 });
  });

  it('runId rác → 400', async () => {
    await expect(service.getRunEstimate({ userId: 5, runId: 'abc', now: NOW })).rejects.toMatchObject({ status: 400 });
  });

  it('lượt đã hoàn tất → estimate null, không tính', async () => {
    userRepository.findOwnedRunForEstimate.mockResolvedValue(ownedRun({ status: 'completed' }));
    await expect(service.getRunEstimate({ userId: 5, runId: 9, now: NOW })).resolves.toEqual({ runId: 9, continuous: false, estimate: null });
    expect(estimateForCampaign).not.toHaveBeenCalled();
  });

  it('lượt chạy liên tục → { continuous: true }, không tính', async () => {
    userRepository.findOwnedRunForEstimate.mockResolvedValue(ownedRun({ is_continuous: true }));
    await expect(service.getRunEstimate({ userId: 5, runId: 9, now: NOW })).resolves.toEqual({ runId: 9, continuous: true, estimate: null });
    expect(estimateForCampaign).not.toHaveBeenCalled();
  });

  it('lượt đang chạy: gọi ước tính với chiến dịch + chủ + startAt = bây giờ + sổ đổi thành "còn lại" (done/partial theo node)', async () => {
    userRepository.findOwnedRunForEstimate.mockResolvedValue(ownedRun());
    const due = new Date('2026-10-06T00:00:00.000Z');
    ledgerRepository.summarizeRunProgress.mockResolvedValue([
      { id_node: '3', done: true, last_completed_step: 1, next_due_at: null, total: 799 },
      { id_node: '4', done: true, last_completed_step: 1, next_due_at: null, total: 300 },
      { id_node: '4', done: false, last_completed_step: 1, next_due_at: due, total: 2 },
    ]);
    const result = await service.getRunEstimate({ userId: 5, runId: 9, now: NOW });
    expect(result).toEqual({ runId: 9, continuous: false, estimate: ESTIMATE });
    expect(ledgerRepository.summarizeRunProgress).toHaveBeenCalledWith(9);
    const args = estimateForCampaign.mock.calls[0][0];
    expect(args.campaignId).toBe(438);
    expect(args.ownerUserId).toBe(5);
    expect(args.startAt).toEqual(NOW);
    expect([...args.remaining.entries()]).toEqual([
      ['3', { doneCount: 799, partial: [] }],
      ['4', { doneCount: 300, partial: [{ stepsDone: 1, dueAtMs: due.getTime(), count: 2 }] }],
    ]);
  });

  it('lượt đang CHỜ (quota ngày / SMTP tạm dừng…) → mô phỏng bắt đầu từ mốc chờ, không phải bây giờ', async () => {
    const until = minutesFromNow(90);
    userRepository.findOwnedRunForEstimate.mockResolvedValue(ownedRun({ deferred_until: until, deferred_reason: 'plan_quota_daily' }));
    await service.getRunEstimate({ userId: 5, runId: 9, now: NOW });
    expect(estimateForCampaign.mock.calls[0][0].startAt).toEqual(new Date(until));
  });

  it('mốc chờ đã qua (dấu vết chưa dọn) → coi như không chờ, bắt đầu từ bây giờ', async () => {
    userRepository.findOwnedRunForEstimate.mockResolvedValue(ownedRun({ deferred_until: minutesFromNow(-10), deferred_reason: 'quiet_hours' }));
    await service.getRunEstimate({ userId: 5, runId: 9, now: NOW });
    expect(estimateForCampaign.mock.calls[0][0].startAt).toEqual(NOW);
  });

  it('bộ nhớ đệm 5 phút theo lượt: lần 2 trong 5 phút không tính lại; sau 5 phút tính lại; lượt khác không dùng chung', async () => {
    userRepository.findOwnedRunForEstimate.mockResolvedValue(ownedRun());
    await service.getRunEstimate({ userId: 5, runId: 9, now: NOW });
    await service.getRunEstimate({ userId: 5, runId: 9, now: new Date(NOW.getTime() + 4 * 60_000 + 59_000) });
    expect(estimateForCampaign).toHaveBeenCalledTimes(1);
    await service.getRunEstimate({ userId: 5, runId: 9, now: new Date(NOW.getTime() + 5 * 60_000 + 1_000) });
    expect(estimateForCampaign).toHaveBeenCalledTimes(2);
    userRepository.findOwnedRunForEstimate.mockResolvedValue(ownedRun({ id: '10' }));
    await service.getRunEstimate({ userId: 5, runId: 10, now: NOW });
    expect(estimateForCampaign).toHaveBeenCalledTimes(3);
  });

  it('ước tính ném lỗi → 200 với estimate null (không ném), và kết quả lỗi cũng được đệm', async () => {
    userRepository.findOwnedRunForEstimate.mockResolvedValue(ownedRun());
    estimateForCampaign.mockRejectedValue(new Error('Sheet 504'));
    await expect(service.getRunEstimate({ userId: 5, runId: 9, now: NOW })).resolves.toEqual({ runId: 9, continuous: false, estimate: null });
    await service.getRunEstimate({ userId: 5, runId: 9, now: NOW });
    expect(estimateForCampaign).toHaveBeenCalledTimes(1);
  });

  it('đọc sổ lỗi → estimate null, không ném', async () => {
    userRepository.findOwnedRunForEstimate.mockResolvedValue(ownedRun());
    ledgerRepository.summarizeRunProgress.mockRejectedValue(new Error('db'));
    await expect(service.getRunEstimate({ userId: 5, runId: 9, now: NOW })).resolves.toMatchObject({ estimate: null });
  });

  it('chiến dịch đã bị xoá (estimateForCampaign trả null) → estimate null', async () => {
    userRepository.findOwnedRunForEstimate.mockResolvedValue(ownedRun());
    estimateForCampaign.mockResolvedValue(null);
    await expect(service.getRunEstimate({ userId: 5, runId: 9, now: NOW })).resolves.toMatchObject({ estimate: null });
  });
});
