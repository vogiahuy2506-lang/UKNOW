import { describe, expect, it } from '@jest/globals';
import {
  addDaysToIsoDate,
  COUNTER_TRUSTED_FROM_VN,
  getVnHour,
  getVnToday,
  resolvePlanned,
  resolveWaiting,
  runCountersReliableSql,
  toIso,
} from '../runDisplay.util.js';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4b / PR-6 — hàm hiển thị lượt chạy DÙNG CHUNG giữa trang Giám sát của người
 * dùng và của admin. Hành vi giữ NGUYÊN như bản chép trong userDeliveryMonitor.service.js trước khi tách.
 */
const NOW_MS = Date.parse('2026-09-29T20:30:00.000Z');
const at = (minutes) => new Date(NOW_MS + minutes * 60_000).toISOString();

describe('getVnToday / getVnHour', () => {
  it('ngày và giờ theo GIỜ VN, không phải UTC', () => {
    expect(getVnToday(new Date('2026-09-29T16:59:59.000Z'))).toBe('2026-09-29');
    expect(getVnToday(new Date('2026-09-29T17:00:00.000Z'))).toBe('2026-09-30');
    expect(getVnHour(new Date('2026-09-29T16:59:59.000Z'))).toBe(23);
    expect(getVnHour(new Date('2026-09-29T17:00:00.000Z'))).toBe(0); // nửa đêm là 0, không phải 24
    expect(getVnHour(new Date('2026-09-29T20:30:00.000Z'))).toBe(3);
  });
});

describe('addDaysToIsoDate', () => {
  it.each([
    ['2026-09-30', -6, '2026-09-24'],
    ['2026-09-30', -29, '2026-09-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2028-03-01', -1, '2028-02-29'],
    ['2027-01-02', -6, '2026-12-27'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-09-30', 0, '2026-09-30'],
  ])('%s %i ngày → %s', (date, delta, expected) => {
    expect(addDaysToIsoDate(date, delta)).toBe(expected);
  });
});

describe('toIso', () => {
  it('Date / chuỗi hợp lệ → ISO; rỗng hoặc sai → null', () => {
    expect(toIso(new Date('2026-09-29T11:00:00.000Z'))).toBe('2026-09-29T11:00:00.000Z');
    expect(toIso('2026-09-29T11:00:00Z')).toBe('2026-09-29T11:00:00.000Z');
    expect(toIso(null)).toBeNull();
    expect(toIso(undefined)).toBeNull();
    expect(toIso('không phải ngày')).toBeNull();
  });
});

describe('resolveWaiting', () => {
  it('mốc còn ở tương lai → { until ISO, reason }; mốc đã qua / bằng hiện tại / hỏng / rỗng → null', () => {
    expect(resolveWaiting({ deferred_until: at(30), deferred_reason: 'quiet_hours' }, NOW_MS)).toEqual({ until: at(30), reason: 'quiet_hours' });
    expect(resolveWaiting({ deferred_until: at(-1), deferred_reason: 'quiet_hours' }, NOW_MS)).toBeNull();
    expect(resolveWaiting({ deferred_until: at(0), deferred_reason: 'quiet_hours' }, NOW_MS)).toBeNull();
    expect(resolveWaiting({ deferred_until: 'hỏng', deferred_reason: 'x' }, NOW_MS)).toBeNull();
    expect(resolveWaiting({ deferred_until: null, deferred_reason: 'x' }, NOW_MS)).toBeNull();
  });

  it('lý do rỗng → null; khoảng trắng được cắt', () => {
    expect(resolveWaiting({ deferred_until: at(5), deferred_reason: '' }, NOW_MS).reason).toBeNull();
    expect(resolveWaiting({ deferred_until: at(5), deferred_reason: ' quiet_hours ' }, NOW_MS).reason).toBe('quiet_hours');
  });

  it('SMTP chặn: mã "chờ bước kế" + emailRateLimitAt trong khung 13 giờ trước mốc → smtp_rate_limited', () => {
    const row = (limitedAt, until) => ({ deferred_until: until, deferred_reason: 'all_recipients_waiting_next_due', email_rate_limit_at: limitedAt });
    expect(resolveWaiting(row(at(-1), at(360)), NOW_MS).reason).toBe('smtp_rate_limited');
    expect(resolveWaiting(row(at(-3 * 24 * 60), at(3 * 24 * 60)), NOW_MS).reason).toBe('all_recipients_waiting_next_due'); // mốc cũ
    expect(resolveWaiting(row(null, at(60)), NOW_MS).reason).toBe('all_recipients_waiting_next_due');
    expect(resolveWaiting(row(at(10), at(5)), NOW_MS).reason).toBe('all_recipients_waiting_next_due'); // chặn SAU mốc chờ
    // Biên 13 giờ: đúng 13h trước mốc vẫn là SMTP, hơn 1 phút thì không.
    expect(resolveWaiting(row(at(0), at(13 * 60)), NOW_MS).reason).toBe('smtp_rate_limited');
    expect(resolveWaiting(row(at(0), at(13 * 60 + 1)), NOW_MS).reason).toBe('all_recipients_waiting_next_due');
  });

  it('mã lý do khác không bị đổi thành SMTP dù có emailRateLimitAt', () => {
    expect(resolveWaiting({ deferred_until: at(60), deferred_reason: 'plan_quota_daily', email_rate_limit_at: at(-1) }, NOW_MS).reason).toBe('plan_quota_daily');
  });
});

describe('resolvePlanned', () => {
  it.each([
    ['đáng tin, total ≥ sent', { counters_reliable: true, total_recipients: 500 }, 3, 500],
    ['total đúng bằng sent', { counters_reliable: true, total_recipients: 3 }, 3, 3],
    ['lượt cũ (bộ đếm không đáng tin)', { counters_reliable: false, total_recipients: 500 }, 3, null],
    ['cờ thiếu (NULL)', { counters_reliable: null, total_recipients: 500 }, 3, null],
    ['total < sent (bộ đếm sai)', { counters_reliable: true, total_recipients: 2 }, 3, null],
    ['total = 0 nghĩa là chưa biết', { counters_reliable: true, total_recipients: 0 }, 3, null],
    ['total dạng chuỗi (pg) được ép số', { counters_reliable: true, total_recipients: '40' }, 3, 40],
  ])('%s', (_label, row, sent, expected) => {
    expect(resolvePlanned(row, sent)).toBe(expected);
  });
});

describe('runCountersReliableSql', () => {
  it('so created_at với mốc 26/09/2026 20:36 giờ VN, thay bí danh vào biểu thức', () => {
    expect(COUNTER_TRUSTED_FROM_VN).toBe('2026-09-26 20:36:00');
    expect(runCountersReliableSql('cr')).toBe("(cr.created_at >= TIMESTAMP '2026-09-26 20:36:00')");
    expect(runCountersReliableSql('run')).toBe("(run.created_at >= TIMESTAMP '2026-09-26 20:36:00')");
  });
});
