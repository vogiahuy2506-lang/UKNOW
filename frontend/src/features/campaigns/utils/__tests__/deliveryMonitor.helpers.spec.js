import { describe, expect, it } from 'vitest';
import vi from '../../../../i18n/vi';
import en from '../../../../i18n/en';

// Máy dev ở VN che mất lỗi "thiếu timeZone" (giờ máy trùng giờ VN nên mọi phép thử vẫn xanh) — chính là lỗi mà người
// dùng ở nước ngoài hoặc CI chạy UTC sẽ gặp. Ép múi giờ TIẾN TRÌNH sang nơi khác VN TRƯỚC khi nạp module (bộ định dạng
// giờ được dựng lúc nạp) để phép thử có nghĩa ở mọi máy. Vitest pool 'forks' nên chỉ ảnh hưởng tiến trình con này.
process.env.TZ = 'America/New_York';
const {
  ALL_WAIT_REASON_I18N_KEYS,
  HOURLY_CHART_CHANNELS,
  buildHourlySlots,
  formatVnDayMonthTime,
  formatVnResumeTime,
  formatVnTime,
  getWaitReasonI18nKey,
} = await import('../deliveryMonitor.helpers');

const lookup = (dict, key) => key.split('.').reduce((acc, part) => acc?.[part], dict);

// Mốc thử: 20:30 UTC ngày 29/09 = 03:30 giờ VN ngày 30/09 — lúc ngày UTC và ngày VN khác nhau.
const NOW = new Date('2026-09-29T20:30:00.000Z');

describe('định dạng giờ VN cố định (không phụ thuộc múi giờ máy)', () => {
  it('formatVnTime: 11:00 UTC = 18:00 VN; nửa đêm là 00:00 (không phải 24:00)', () => {
    expect(formatVnTime('2026-09-29T11:00:00.000Z')).toBe('18:00');
    expect(formatVnTime('2026-09-29T16:30:00.000Z')).toBe('23:30');
    expect(formatVnTime('2026-09-29T17:00:00.000Z')).toBe('00:00');
    expect(formatVnTime(new Date('2026-09-29T17:05:00.000Z'))).toBe('00:05');
  });

  it('formatVnDayMonthTime: dd/MM HH:mm, qua nửa đêm sang ngày kế của giờ VN', () => {
    expect(formatVnDayMonthTime('2026-09-29T11:00:00.000Z')).toBe('29/09 18:00');
    expect(formatVnDayMonthTime('2026-09-29T17:00:00.000Z')).toBe('30/09 00:00');
    expect(formatVnDayMonthTime('2026-12-31T20:00:00.000Z')).toBe('01/01 03:00');
  });

  it('giá trị rỗng / sai → chuỗi dự phòng', () => {
    for (const bad of [null, undefined, '', 'không phải ngày']) {
      expect(formatVnTime(bad)).toBe('-');
      expect(formatVnDayMonthTime(bad)).toBe('-');
      expect(formatVnResumeTime(bad, NOW)).toBe('-');
    }
    expect(formatVnTime(null, '—')).toBe('—');
  });

  it('formatVnResumeTime: cùng ngày VN với `now` chỉ HH:mm; khác ngày thì thêm dd/MM', () => {
    // now = 03:30 VN ngày 30/09.
    expect(formatVnResumeTime('2026-09-29T23:00:00.000Z', NOW)).toBe('06:00'); // 06:00 VN ngày 30/09 — cùng ngày
    expect(formatVnResumeTime('2026-09-30T16:59:00.000Z', NOW)).toBe('23:59'); // 23:59 VN ngày 30/09 — vẫn cùng ngày
    expect(formatVnResumeTime('2026-09-30T17:00:00.000Z', NOW)).toBe('01/10 00:00'); // sang ngày 01/10
    expect(formatVnResumeTime('2026-10-02T02:00:00.000Z', NOW)).toBe('02/10 09:00');
  });

  it('cùng ngày VN nhưng khác ngày UTC vẫn tính là cùng ngày (không so ngày UTC)', () => {
    // now = 03:30 VN 30/09 (UTC còn 29/09). Mốc 00:30 VN 30/09 = 17:30 UTC 29/09.
    expect(formatVnResumeTime('2026-09-29T17:30:00.000Z', NOW)).toBe('00:30');
  });
});

describe('getWaitReasonI18nKey', () => {
  it.each([
    ['quiet_hours', 'quickSend.deferredReasonQuietHours'],
    ['channel_quiet_hours', 'quickSend.deferredReasonQuietHours'],
    ['rate_limited', 'quickSend.deferredReasonRateLimited'],
    ['inter_message_delay', 'quickSend.deferredReasonInterMessageDelay'],
    ['phone_lookup_cooldown', 'quickSend.deferredReasonPhoneLookupCooldown'],
    ['phone_lookup_cooldown_api_error', 'quickSend.deferredReasonPhoneLookupCooldown'],
    ['all_accounts_phone_lookup_cooldown', 'quickSend.deferredReasonPhoneLookupCooldown'],
    ['channel_rate_limit', 'quickSendAdapter.deferredReasonProviderRateLimit'],
    ['smtp_rate_limited', 'userDeliveryMonitor.waitReason.smtpRateLimited'],
    ['smtp_transient_burst', 'userDeliveryMonitor.waitReason.smtpUnstable'],
    ['all_recipients_waiting_next_due', 'userDeliveryMonitor.waitReason.nextStep'],
    ['scheduled_step_email_2', 'userDeliveryMonitor.waitReason.nextStep'],
    ['scheduled_step_zalo_personal_1', 'userDeliveryMonitor.waitReason.nextStep'],
    ['plan_quota_daily', 'userDeliveryMonitor.waitReason.planQuota'],
    ['plan_quota_account_daily', 'userDeliveryMonitor.waitReason.planQuota'],
    ['plan_quota_account_daily_telegram', 'userDeliveryMonitor.waitReason.planQuota'],
    ['plan_quota', 'userDeliveryMonitor.waitReason.planQuota'],
  ])('mã %s → %s (mã thật campaignRun.service.js ghi vào run_metadata)', (code, key) => {
    expect(getWaitReasonI18nKey(code)).toBe(key);
  });

  it.each([[null], [undefined], [''], ['   '], ['ma_la_chua_tung_thay'], ['zalo_outbound_wait']])(
    'mã rỗng / lạ %j → "hệ thống đang bận" (không in mã thô)',
    (code) => {
      expect(getWaitReasonI18nKey(code)).toBe('quickSend.deferredReasonUnknown');
    }
  );

  it('MỌI khoá có thể trả đều có bản dịch chuỗi ở cả vi lẫn en (t() in khoá thô khi thiếu)', () => {
    expect(ALL_WAIT_REASON_I18N_KEYS.length).toBeGreaterThanOrEqual(10);
    for (const key of ALL_WAIT_REASON_I18N_KEYS) {
      expect(typeof lookup(vi, key), `vi thiếu ${key}`).toBe('string');
      expect(typeof lookup(en, key), `en thiếu ${key}`).toBe('string');
    }
  });
});

describe('buildHourlySlots', () => {
  const ROWS = [
    { hour: '2026-09-29T20:00:00.000Z', channel: 'email', sent: 30, failed: 2 }, // giờ hiện tại: 03:00 VN
    { hour: '2026-09-29T20:00:00.000Z', channel: 'telegram', sent: 4, failed: 0 },
    { hour: '2026-09-29T16:00:00.000Z', channel: 'zalo_personal', sent: 7, failed: 0 }, // 23:00 VN hôm qua
    { hour: '2026-09-28T21:00:00.000Z', channel: 'zalo_group', sent: 2, failed: 0 }, // giờ đầu tiên của cửa sổ: 04:00 VN
    { hour: '2026-09-29T20:00:00.000Z', channel: 'zalo_friend_request', sent: 99, failed: 0 }, // kênh không vẽ
    { hour: '2026-09-28T20:00:00.000Z', channel: 'email', sent: 500, failed: 0 }, // ngoài 24 cột (25 giờ trước)
  ];

  it('đúng 24 cột, cũ → mới, neo vào giờ của phản hồi (giờ hiện tại là cột cuối)', () => {
    const slots = buildHourlySlots(ROWS, NOW.toISOString());
    expect(slots).toHaveLength(24);
    expect(slots[23].hour).toBe('2026-09-29T20:00:00.000Z');
    expect(slots[0].hour).toBe('2026-09-28T21:00:00.000Z');
    // Nhãn theo giờ VN: cột cuối 03:00, cột đầu 04:00 (ngày hôm qua).
    expect(slots[23].label).toBe('03:00');
    expect(slots[0].label).toBe('04:00');
    // Mỗi cột cách nhau đúng một giờ.
    for (let i = 1; i < 24; i += 1) {
      expect(Date.parse(slots[i].hour) - Date.parse(slots[i - 1].hour)).toBe(3600_000);
    }
  });

  it('điền số vào đúng cột; giờ trống = 0; kênh lạ và dòng ngoài cửa sổ bị bỏ; total = cộng năm kênh', () => {
    const slots = buildHourlySlots(ROWS, NOW.toISOString());
    expect(slots[23]).toMatchObject({ email: 30, telegram: 4, zalo_personal: 0, zalo_group: 0, whatsapp: 0, total: 34 });
    expect(slots[19]).toMatchObject({ hour: '2026-09-29T16:00:00.000Z', zalo_personal: 7, total: 7 }); // 23:00 VN
    expect(slots[0]).toMatchObject({ zalo_group: 2, total: 2 });
    expect(slots.reduce((sum, slot) => sum + slot.total, 0)).toBe(34 + 7 + 2); // không có 99 (kết bạn) và 500 (ngoài cửa sổ)
    expect(slots.filter((slot) => slot.total === 0)).toHaveLength(21);
    for (const slot of slots) {
      for (const channel of HOURLY_CHART_CHANNELS) expect(typeof slot[channel]).toBe('number');
    }
  });

  it('cộng dồn nhiều dòng cùng (giờ, kênh); không có dữ liệu / generatedAt hỏng vẫn ra 24 cột', () => {
    const rows = [
      { hour: '2026-09-29T20:00:00.000Z', channel: 'email', sent: 3 },
      { hour: '2026-09-29T20:00:00.000Z', channel: 'email', sent: 4 },
    ];
    expect(buildHourlySlots(rows, NOW.toISOString())[23].email).toBe(7);
    expect(buildHourlySlots(undefined, NOW.toISOString())).toHaveLength(24);
    expect(buildHourlySlots([], 'không phải ngày')).toHaveLength(24);
    expect(buildHourlySlots(null, undefined).every((slot) => slot.total === 0)).toBe(true);
  });

  it('giờ trong phản hồi lệch phút / giây vẫn neo về đầu giờ (03:30 → cột 03:00)', () => {
    const slots = buildHourlySlots([], '2026-09-29T20:59:59.999Z');
    expect(slots[23].hour).toBe('2026-09-29T20:00:00.000Z');
  });
});
