import { describe, it, expect } from 'vitest';
import {
  KNOWN_ESTIMATE_WARNING_CODES,
  buildEstimateView,
  describeEstimateDuration,
  describeEstimateWarning,
  describeOverlapSuggestions,
  extractScheduleOverlapError,
  formatEstimateDateTime,
  resolveScheduleEstimateStartAt,
} from '../campaignEstimate.helpers';
import { ESTIMATE_438 } from './campaignEstimate.fixtures';
import viDict from '../../../../i18n/vi';
import enDict from '../../../../i18n/en';

/** `t` đọc thẳng từ từ điển thật + nội suy `{param}` như useI18n; thiếu khoá → trả lại khoá (giống bản thật). */
const makeT = (dict) => (key, params = {}) => {
  let current = dict;
  for (const part of key.split('.')) current = current?.[part];
  const text = typeof current === 'string' ? current : key;
  return text.replace(/\{(\w+)\}/g, (_, name) => (params[name] !== undefined ? String(params[name]) : `{${name}}`));
};

/** Mẫu `params` đúng hợp đồng cho TỪNG mã cảnh báo (backend `campaignSendEstimate.util.js` / `campaignEstimate.service.js`). */
const WARNING_SAMPLES = {
  multi_day: { days: 4, finishAtLatest: '2026-10-08T14:25:00.000Z' },
  zalo_over_safe_daily: { accountKey: 'zalo:101', date: '2026-10-05', actions: 560, safeLimit: 150, accounts: ['zalo:101'], days: 3 },
  account_daily_limit: { accountKey: 'zalo:101', limit: 100 },
  continuous_mode: {},
  estimate_incomplete: { reason: 'too_many_steps' },
  recipient_count_unknown: { nodeId: 'n1', reason: 'source_not_countable' },
  account_unavailable: { accountKey: 'zalo:101', channel: 'zalo' },
  sender_missing: { nodeId: 'n1' },
  no_send_node: {},
  plan_quota_insufficient: { channel: 'zalo', required: 1596, limit: 1000, currentCount: 900, limitType: 'monthly', resetAt: null },
  shared_account: { accountKey: 'zalo:101', label: 'Nick Minh Zalo', campaigns: [{ id: 440, name: 'Chăm khách cũ', reason: 'running' }] },
  zalo_phone_lookup_unmodeled: { nodes: ['n1'] },
};

describe('formatEstimateDateTime — giờ Việt Nam dạng dd/MM HH:mm', () => {
  it('đổi UTC sang giờ VN (UTC+7), không theo múi giờ trình duyệt', () => {
    expect(formatEstimateDateTime('2026-10-08T14:25:00.000Z')).toBe('08/10 21:25');
    expect(formatEstimateDateTime('2026-10-07T00:25:00.000Z')).toBe('07/10 07:25');
  });

  it('qua nửa đêm VN thì sang ngày kế (17:30Z = 00:30 hôm sau ở VN)', () => {
    expect(formatEstimateDateTime('2026-10-07T17:30:00.000Z')).toBe('08/10 00:30');
  });

  it('giá trị rỗng / sai → chuỗi rỗng, không ném', () => {
    expect(formatEstimateDateTime(null)).toBe('');
    expect(formatEstimateDateTime('không phải ngày')).toBe('');
  });
});

describe('describeEstimateDuration', () => {
  it('từ 1 ngày: làm tròn LÊN theo ngày (cùng cách backend tính multi_day.days) — 05/10 06:00 → 08/10 21:25 = 4 ngày', () => {
    expect(describeEstimateDuration(ESTIMATE_438.startAt, ESTIMATE_438.finishAtLatest)).toEqual({ unit: 'days', value: 4 });
  });

  it('dưới 1 ngày: giờ, rồi phút, rồi dưới 1 phút', () => {
    expect(describeEstimateDuration('2026-10-05T00:00:00Z', '2026-10-05T03:10:00Z')).toEqual({ unit: 'hours', value: 3 });
    expect(describeEstimateDuration('2026-10-05T00:00:00Z', '2026-10-05T00:07:00Z')).toEqual({ unit: 'minutes', value: 7 });
    expect(describeEstimateDuration('2026-10-05T00:00:00Z', '2026-10-05T00:00:20Z')).toEqual({ unit: 'lessThanMinute', value: 0 });
  });
});

describe('buildEstimateView', () => {
  it('không phải object → null (thẻ AI estimate:null không vỡ)', () => {
    expect(buildEstimateView(null)).toBeNull();
    expect(buildEstimateView(undefined)).toBeNull();
    expect(buildEstimateView('x')).toBeNull();
  });

  it('số chính là finishAtLatest; khoảng nhanh–chậm chỉ khi hai mốc khác nhau', () => {
    const view = buildEstimateView(ESTIMATE_438);
    expect(view.finishAtLatest).toBe('2026-10-08T14:25:00.000Z');
    expect(view.hasRange).toBe(true);
    const same = buildEstimateView({ ...ESTIMATE_438, finishAtEarliest: ESTIMATE_438.finishAtLatest });
    expect(same.hasRange).toBe(false);
  });

  it('bảng ngày dùng nhãn tài khoản từ accounts[].label; thiếu nhãn thì rơi về key', () => {
    const view = buildEstimateView(ESTIMATE_438);
    expect(view.perDay[0].rows).toEqual([{ key: 'zalo:101', label: 'Nick Minh Zalo', actions: 560 }]);
    const noAccounts = buildEstimateView({ ...ESTIMATE_438, accounts: [] });
    expect(noAccounts.perDay[0].rows[0].label).toBe('zalo:101');
  });

  it('mảng thiếu → rỗng, không ném', () => {
    const view = buildEstimateView({ startAt: '2026-10-05T00:00:00Z', finishAtLatest: null });
    expect(view.perDay).toEqual([]);
    expect(view.warnings).toEqual([]);
    expect(view.totalActions).toBe(0);
  });
});

describe('describeEstimateWarning — i18n vi + en cho TỪNG mã trong hợp đồng', () => {
  it('danh sách mã mẫu phủ đủ 12 mã hợp đồng', () => {
    expect([...KNOWN_ESTIMATE_WARNING_CODES].sort()).toEqual(Object.keys(WARNING_SAMPLES).sort());
  });

  [['vi', viDict], ['en', enDict]].forEach(([locale, dict]) => {
    const t = makeT(dict);
    KNOWN_ESTIMATE_WARNING_CODES.forEach((code) => {
      it(`[${locale}] ${code}: ra câu thật (không phải khoá trần, không còn {param} chưa thay)`, () => {
        const out = describeEstimateWarning({ code, params: WARNING_SAMPLES[code] }, t, (key) => `Nick ${key}`);
        expect(out.text).toBeTruthy();
        expect(out.text).not.toContain('campaignEstimate.');
        expect(out.text).not.toMatch(/\{\w+\}/);
      });
    });
  });

  it('multi_day nêu số ngày + giờ xong theo giờ VN; zalo_over_safe_daily nêu nhãn nick + mức khuyến nghị', () => {
    const t = makeT(viDict);
    expect(describeEstimateWarning({ code: 'multi_day', params: WARNING_SAMPLES.multi_day }, t).text)
      .toBe('Chiến dịch chạy kéo dài khoảng 4 ngày (dự kiến xong 08/10 21:25).');
    const over = describeEstimateWarning({ code: 'zalo_over_safe_daily', params: WARNING_SAMPLES.zalo_over_safe_daily }, t, () => 'Nick Minh Zalo').text;
    expect(over).toContain('Nick Minh Zalo');
    expect(over).toContain('150');
    expect(over).toContain('560');
  });

  it('account_daily_limit với limit 0 dùng câu "không gửi được" riêng', () => {
    const t = makeT(viDict);
    const out = describeEstimateWarning({ code: 'account_daily_limit', params: { accountKey: 'zalo:101', limit: 0 } }, t, () => 'Nick A').text;
    expect(out).toContain('0 tin');
    expect(out).toContain('chưa gửi được');
  });

  it('shared_account liệt kê id + tên chiến dịch đang dùng chung', () => {
    const t = makeT(viDict);
    const out = describeEstimateWarning({ code: 'shared_account', params: WARNING_SAMPLES.shared_account }, t).text;
    expect(out).toContain('#440 Chăm khách cũ');
  });

  it('mã LẠ (backend thêm sau) → câu chung, không vỡ, không lộ khoá trần', () => {
    const out = describeEstimateWarning({ code: 'ma_moi_chua_biet', params: { x: 1 } }, makeT(viDict));
    expect(out.text).toBe(viDict.campaignEstimate.warning.unknown);
    expect(out.text).not.toContain('campaignEstimate.');
    expect(() => describeEstimateWarning({}, makeT(viDict))).not.toThrow();
    expect(() => describeEstimateWarning({ code: 'multi_day', params: null }, makeT(viDict))).not.toThrow();
  });
});

describe('409 SCHEDULE_OVERLAP', () => {
  it('nhận ra mã + lấy message server + suggestions', () => {
    const error = {
      response: { status: 409, data: { success: false, code: 'SCHEDULE_OVERLAP', message: 'Lượt chạy lúc 03/10 dự kiến xong 06/10', suggestions: ['use_steps', 'add_accounts', 'spread_schedule'] } },
    };
    expect(extractScheduleOverlapError(error)).toEqual({
      message: 'Lượt chạy lúc 03/10 dự kiến xong 06/10',
      suggestions: ['use_steps', 'add_accounts', 'spread_schedule'],
    });
  });

  it('409 mã khác (CAMPAIGN_NOT_ACTIVE) và lỗi không phải 409 → null (luồng lỗi chung xử lý)', () => {
    expect(extractScheduleOverlapError({ response: { status: 409, data: { code: 'CAMPAIGN_NOT_ACTIVE', message: 'x' } } })).toBeNull();
    expect(extractScheduleOverlapError({ response: { status: 500, data: { code: 'SCHEDULE_OVERLAP' } } })).toBeNull();
    expect(extractScheduleOverlapError(new Error('mạng'))).toBeNull();
  });

  it('gợi ý dịch vi + en; gợi ý lạ bị bỏ', () => {
    const vi = describeOverlapSuggestions(['use_steps', 'spread_schedule', 'la_hoac'], makeT(viDict));
    expect(vi).toEqual([viDict.campaignEstimate.suggestion.use_steps, viDict.campaignEstimate.suggestion.spread_schedule]);
    expect(describeOverlapSuggestions(['add_accounts'], makeT(enDict))).toEqual([enDict.campaignEstimate.suggestion.add_accounts]);
    expect(describeOverlapSuggestions(undefined, makeT(viDict))).toEqual([]);
  });
});

describe('resolveScheduleEstimateStartAt', () => {
  const deps = {
    buildCron: (form) => (form.scheduleTime ? '0 6 * * *' : ''),
    resolveNextRunAt: () => new Date('2026-10-05T23:00:00.000Z'),
    buildDelayedRunDate: () => new Date('2026-10-05T01:02:45.500Z'),
  };

  it('lịch một lần: ngày + giờ là GIỜ TƯỜNG VN → UTC (05/10 06:00 VN = 04/10 23:00Z)', () => {
    expect(resolveScheduleEstimateStartAt({ scheduleType: 'once', scheduleDate: '2026-10-05', scheduleTime: '06:00' }, deps))
      .toBe('2026-10-04T23:00:00.000Z');
  });

  it('lịch một lần thiếu ngày hoặc giờ → null (không gọi API)', () => {
    expect(resolveScheduleEstimateStartAt({ scheduleType: 'once', scheduleDate: '', scheduleTime: '06:00' }, deps)).toBeNull();
    expect(resolveScheduleEstimateStartAt({ scheduleType: 'once', scheduleDate: '2026-10-05', scheduleTime: '' }, deps)).toBeNull();
  });

  it('sau một khoảng: làm tròn xuống phút để startAt ổn định', () => {
    expect(resolveScheduleEstimateStartAt({ scheduleType: 'after_delay', delayValue: '30', delayUnit: 'minutes' }, deps))
      .toBe('2026-10-05T01:02:00.000Z');
  });

  it('lịch lặp: lần nổ kế tiếp từ cron', () => {
    expect(resolveScheduleEstimateStartAt({ scheduleType: 'daily', scheduleTime: '06:00' }, deps)).toBe('2026-10-05T23:00:00.000Z');
    expect(resolveScheduleEstimateStartAt({ scheduleType: 'daily', scheduleTime: '' }, deps)).toBeNull();
  });
});
