import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { checkScheduleOverlap, buildScheduleOverlapMessage } from '../campaignScheduleOverlap.service.js';

/**
 * Mock ở RANH GIỚI: repository lịch trả dòng `campaign_schedules` snake_case; `estimateForCampaign` trả đúng hình dạng
 * hợp đồng PR-1 (`finishAtLatest` ISO UTC, `totalActions`, `warnings:[{code,params}]`). Giờ VN = UTC+7.
 * Số TÍNH TAY: chiến dịch 438 chạy ở nhịp chậm nhất xong sau 87 giờ 25 phút (PR-1: 05/10 06:00 → 08/10 21:25).
 */
const vn = (text) => new Date(`${text}+07:00`);
const NOW = vn('2026-10-02T20:00:00');
const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

const saved = (id, scheduleType, cronExpression, over = {}) => ({
  id, id_campaign: 438, schedule_type: scheduleType, cron_expression: cronExpression, enabled: true,
  last_run_at: null, created_at: '2026-09-30T01:00:00.000Z', ...over,
});

let savedRows;
let durationMs;
const scheduleRepo = { findEnabledByCampaign: jest.fn() };
const estimateForCampaign = jest.fn();
const deps = () => ({ scheduleRepo, estimateForCampaign, now: () => NOW });

const check = (candidate) => checkScheduleOverlap({ campaignId: 438, ownerUserId: 39, candidate, deps: deps() });

beforeEach(() => {
  jest.clearAllMocks();
  savedRows = [];
  durationMs = 87 * HOUR + 25 * MIN;
  scheduleRepo.findEnabledByCampaign.mockImplementation(async () => savedRows);
  estimateForCampaign.mockImplementation(async ({ startAt }) => ({
    finishAtLatest: new Date(startAt.getTime() + durationMs).toISOString(),
    totalActions: 1596,
    warnings: [],
  }));
});

describe('checkScheduleOverlap — chặn lịch chồng của cùng một chiến dịch', () => {
  it('2 lịch once 3/10 và 4/10 trên chiến dịch cần 87h25 → CHẶN: 03/10 06:00 + 87h25 = 06/10 21:25 > 04/10 06:00', async () => {
    savedRows = [saved(10, 'once', '0 6 3 10 *')];
    const result = await check({ id: null, scheduleType: 'once', cronExpression: '0 6 4 10 *' });

    expect(result.overlap).toEqual({
      previousFireAt: '2026-10-02T23:00:00.000Z', // 03/10 06:00 VN
      estimatedFinishAt: '2026-10-06T14:25:00.000Z', // 06/10 21:25 VN
      nextFireAt: '2026-10-03T23:00:00.000Z', // 04/10 06:00 VN
      scheduleIds: [10],
    });
    // Ước tính bắt đầu ĐÚNG ở lần nổ của lượt trước, theo chiến dịch + chủ.
    expect(estimateForCampaign).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 438, ownerUserId: 39, startAt: vn('2026-10-03T06:00:00'),
    }));
  });

  it('cùng cặp lịch nhưng chiến dịch chỉ chạy 20 giờ (< 24 giờ giữa hai lịch) → KHÔNG chặn', async () => {
    durationMs = 20 * HOUR;
    savedRows = [saved(10, 'once', '0 6 3 10 *')];
    const result = await check({ id: null, scheduleType: 'once', cronExpression: '0 6 4 10 *' });
    expect(result.overlap).toBeNull();
  });

  it('so bằng finishAtLatest: đúng 24 giờ thì KHÔNG chặn (xong đúng lúc lịch sau nổ), 24 giờ 1 phút thì chặn', async () => {
    savedRows = [saved(10, 'once', '0 6 3 10 *')];
    durationMs = 24 * HOUR;
    expect((await check({ id: null, scheduleType: 'once', cronExpression: '0 6 4 10 *' })).overlap).toBeNull();
    durationMs = 24 * HOUR + MIN;
    expect((await check({ id: null, scheduleType: 'once', cronExpression: '0 6 4 10 *' })).overlap).not.toBeNull();
  });

  it('lịch daily 06:00 cho chiến dịch 3 ngày → chồng với CHÍNH NÓ (lần 03/10 xong 06/10 06:00 > lần 04/10)', async () => {
    durationMs = 72 * HOUR;
    const result = await check({ id: 5, scheduleType: 'daily', cronExpression: '0 6 * * *' });
    expect(result.overlap).toEqual({
      previousFireAt: '2026-10-02T23:00:00.000Z', // 03/10 06:00 VN
      estimatedFinishAt: '2026-10-05T23:00:00.000Z', // 06/10 06:00 VN
      nextFireAt: '2026-10-03T23:00:00.000Z', // 04/10 06:00 VN
      scheduleIds: [5],
    });
  });

  it('lịch daily mà chiến dịch xong trong 20 giờ → không chặn, và chỉ ước tính MỘT lần (cùng giờ nổ dùng lại thời lượng)', async () => {
    durationMs = 20 * HOUR;
    const result = await check({ id: 5, scheduleType: 'daily', cronExpression: '0 6 * * *' });
    expect(result.overlap).toBeNull();
    expect(estimateForCampaign).toHaveBeenCalledTimes(1);
  });

  it('custom mỗi 2 ngày mà chiến dịch 72 giờ → chồng chính nó: lần 04/10 06:00 + 72h = 07/10 06:00 > lần 06/10', async () => {
    durationMs = 72 * HOUR;
    const result = await check({
      id: 6, scheduleType: 'custom', cronExpression: '0 6 */2 * *', createdAt: '2026-10-02T01:00:00.000Z',
    });
    expect(result.overlap).toEqual({
      previousFireAt: '2026-10-03T23:00:00.000Z', // 04/10 06:00 VN
      estimatedFinishAt: '2026-10-06T23:00:00.000Z', // 07/10 06:00 VN
      nextFireAt: '2026-10-05T23:00:00.000Z', // 06/10 06:00 VN
      scheduleIds: [6],
    });
  });

  it('lịch CŨ đã chồng nhau từ trước (03/10 và 04/10) KHÔNG chặn lịch mới xa hơn (20/10): cặp liền kề phải có lần của lịch mới', async () => {
    savedRows = [saved(10, 'once', '0 6 3 10 *'), saved(11, 'once', '0 6 4 10 *')];
    durationMs = 50 * HOUR; // 03/10→04/10 chồng, nhưng 04/10 06:00 + 50h = 06/10 08:00 << 20/10
    const result = await check({ id: null, scheduleType: 'once', cronExpression: '0 6 20 10 *' });
    expect(result.overlap).toBeNull();
    // Chỉ cặp (04/10, 20/10) có lịch mới → đúng 1 lần ước tính, bắt đầu ở 04/10 06:00; cặp cũ (03/10, 04/10) không đụng tới.
    expect(estimateForCampaign).toHaveBeenCalledTimes(1);
    expect(estimateForCampaign).toHaveBeenCalledWith(expect.objectContaining({ startAt: vn('2026-10-04T06:00:00') }));
  });

  it('sửa lịch: bản cũ của CHÍNH lịch đó trong DB bị loại; lịch sửa thành once một mình thì không còn cặp nào → không ước tính', async () => {
    savedRows = [saved(11, 'daily', '0 6 * * *')];
    const result = await check({ id: 11, scheduleType: 'once', cronExpression: '0 6 6 10 *' });
    expect(result.overlap).toBeNull();
    expect(estimateForCampaign).not.toHaveBeenCalled();
  });

  it('hai lịch nổ cùng một thời điểm (khác id) → chặn (khoảng cách 0 < thời lượng)', async () => {
    durationMs = HOUR;
    savedRows = [saved(3, 'daily', '0 6 * * *')];
    const result = await check({ id: null, scheduleType: 'once', cronExpression: '0 6 4 10 *' });
    expect(result.overlap).not.toBeNull();
    expect(result.overlap.previousFireAt).toBe(result.overlap.nextFireAt);
  });

  it('ước tính NÉM lỗi → không chặn', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      estimateForCampaign.mockRejectedValue(new Error('db down'));
      savedRows = [saved(10, 'once', '0 6 3 10 *')];
      const result = await check({ id: null, scheduleType: 'once', cronExpression: '0 6 4 10 *' });
      expect(result).toEqual({ overlap: null, warnings: [] });
    } finally {
      warn.mockRestore();
    }
  });

  it('repository lịch ném lỗi → không chặn, không ném', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      scheduleRepo.findEnabledByCampaign.mockRejectedValue(new Error('boom'));
      const result = await check({ id: null, scheduleType: 'daily', cronExpression: '0 6 * * *' });
      expect(result).toEqual({ overlap: null, warnings: [] });
    } finally {
      warn.mockRestore();
    }
  });

  it('không đếm được người nhận (recipient_count_unknown) → KHÔNG chặn dù finishAtLatest dài, và trả cảnh báo', async () => {
    estimateForCampaign.mockImplementation(async ({ startAt }) => ({
      finishAtLatest: new Date(startAt.getTime() + 72 * HOUR).toISOString(),
      totalActions: 10,
      warnings: [{ code: 'recipient_count_unknown', params: { nodeId: '7', reason: 'timeout' } }],
    }));
    const result = await check({ id: 5, scheduleType: 'daily', cronExpression: '0 6 * * *' });
    expect(result.overlap).toBeNull();
    expect(result.warnings).toEqual([{ code: 'recipient_count_unknown', params: { nodeId: '7', reason: 'timeout' } }]);
  });

  it('chiến dịch không có thao tác gửi nào (totalActions 0) → không chặn', async () => {
    estimateForCampaign.mockImplementation(async ({ startAt }) => ({
      finishAtLatest: startAt.toISOString(), totalActions: 0, warnings: [{ code: 'no_send_node', params: {} }],
    }));
    const result = await check({ id: 5, scheduleType: 'daily', cronExpression: '0 6 * * *' });
    expect(result.overlap).toBeNull();
  });

  it('cảnh báo khác (multi_day, shared_account…) KHÔNG làm mất khả năng chặn: vẫn chặn theo finishAtLatest', async () => {
    estimateForCampaign.mockImplementation(async ({ startAt }) => ({
      finishAtLatest: new Date(startAt.getTime() + 72 * HOUR).toISOString(),
      totalActions: 1596,
      warnings: [{ code: 'multi_day', params: { days: 3 } }, { code: 'shared_account', params: {} }],
    }));
    const result = await check({ id: 5, scheduleType: 'daily', cronExpression: '0 6 * * *' });
    expect(result.overlap).not.toBeNull();
  });
});

describe('buildScheduleOverlapMessage', () => {
  it('nêu giờ Hà Nội của lượt trước, ngày xong dự kiến, lịch kế tiếp và ba hướng gỡ', () => {
    const message = buildScheduleOverlapMessage({
      previousFireAt: '2026-10-02T23:00:00.000Z',
      estimatedFinishAt: '2026-10-06T14:25:00.000Z',
      nextFireAt: '2026-10-03T23:00:00.000Z',
    });
    expect(message).toBe(
      'Lượt chạy lúc 06:00 03/10 dự kiến xong khoảng 21:25 06/10, lịch kế tiếp lúc 06:00 04/10 sẽ bị bỏ qua. '
      + 'Hãy dùng chuỗi tin nhiều bước trong một node gửi, thêm tài khoản gửi, hoặc giãn lịch.'
    );
  });
});
