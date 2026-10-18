import { describe, expect, it } from 'vitest';
import {
  applyChannelChange,
  buildRunBody,
  buildScheduleCron,
  buildSchedulePayload,
  buildSimpleCampaignBody,
  buildSimplePreviewBody,
  createDefaultSchedule,
  createInitialWizardState,
  getAvailableWhenOptions,
  isScheduleBased,
  isStepComplete,
  reconcileSchedule,
  resolveScheduleStartAt,
  validateSchedule,
} from '../simpleCampaign.helpers';
import { describeWhen, formatPollInterval } from '../simpleCampaign.summary';

const stateWith = (patch = {}) => {
  const base = createInitialWizardState();
  return {
    ...base,
    channel: 'email',
    sender: { id: 11, label: 'shop@abc.vn' },
    content: { ...base.content, mode: 'template', templateId: 5, templateName: 'Ưu đãi' },
    ...patch,
    audience: { ...base.audience, ...(patch.audience || {}) },
  };
};

// 17/10/2026 09:00 giờ VN = 02:00 UTC.
const NOW = new Date('2026-10-17T02:00:00.000Z');

describe('cron của từng cách gửi (ghim chuỗi cụ thể, giờ Việt Nam)', () => {
  it('hẹn một thời điểm: 20/10/2026 14:30 → "30 14 20 10 *"', () => {
    expect(buildScheduleCron({ type: 'scheduled', date: '2026-10-20', time: '14:30' })).toBe('30 14 20 10 *');
  });

  it('hằng ngày 08:30 → "30 08 * * *"', () => {
    expect(buildScheduleCron({ type: 'recurring', frequency: 'daily', weeklyDay: '1', time: '08:30' })).toBe('30 08 * * *');
  });

  it('hằng tuần Thứ Hai 09:00 → "00 09 * * 1"; Chủ nhật là 0', () => {
    expect(buildScheduleCron({ type: 'recurring', frequency: 'weekly', weeklyDay: '1', time: '09:00' })).toBe('00 09 * * 1');
    expect(buildScheduleCron({ type: 'recurring', frequency: 'weekly', weeklyDay: '0', time: '09:00' })).toBe('00 09 * * 0');
  });

  it('hằng tháng 07:15 → "15 07 1 * *" (chỉ ngày 1)', () => {
    expect(buildScheduleCron({ type: 'recurring', frequency: 'monthly', weeklyDay: '1', time: '07:15' })).toBe('15 07 1 * *');
  });

  it('gửi ngay / tự động gửi không có cron', () => {
    expect(buildScheduleCron({ type: 'now' })).toBe('');
    expect(buildScheduleCron({ type: 'continuous', pollIntervalMinutes: 180 })).toBe('');
  });
});

describe('payload tạo lịch', () => {
  it('hẹn giờ → scheduleType once, bật ngay và kích hoạt chiến dịch nháp', () => {
    expect(buildSchedulePayload({ type: 'scheduled', date: '2026-10-20', time: '14:30' }, { campaignId: '900', scheduleName: 'Chiến dịch A' })).toEqual({
      campaignId: '900',
      scheduleName: 'Chiến dịch A',
      scheduleType: 'once',
      cronExpression: '30 14 20 10 *',
      enabled: true,
      activateCampaign: true,
    });
  });

  it('lặp lại → scheduleType = tần suất', () => {
    const payload = buildSchedulePayload({ type: 'recurring', frequency: 'weekly', weeklyDay: '3', time: '10:00' }, { campaignId: 1, scheduleName: 'x' });
    expect(payload.scheduleType).toBe('weekly');
    expect(payload.cronExpression).toBe('00 10 * * 3');
  });
});

describe('validateSchedule — hẹn giờ phải ≥ 2 phút sau hiện tại (giờ VN)', () => {
  it('thiếu ngày hoặc giờ → chưa đủ', () => {
    expect(validateSchedule({ type: 'scheduled', date: '', time: '10:00' }, NOW)).toEqual({ ok: false, reason: 'incomplete' });
    expect(validateSchedule({ type: 'scheduled', date: '2026-10-17', time: '' }, NOW)).toEqual({ ok: false, reason: 'incomplete' });
  });

  it('09:01 khi bây giờ là 09:00 VN → quá sớm; 09:02 → vừa đủ', () => {
    expect(validateSchedule({ type: 'scheduled', date: '2026-10-17', time: '09:01' }, NOW)).toEqual({ ok: false, reason: 'too_soon' });
    expect(validateSchedule({ type: 'scheduled', date: '2026-10-17', time: '09:02' }, NOW)).toEqual({ ok: true });
  });

  it('ngày trong quá khứ → quá sớm; ngày mai → hợp lệ', () => {
    expect(validateSchedule({ type: 'scheduled', date: '2026-10-16', time: '23:00' }, NOW).ok).toBe(false);
    expect(validateSchedule({ type: 'scheduled', date: '2026-10-18', time: '08:00' }, NOW).ok).toBe(true);
  });

  it('bước "Khi nào gửi?" bị khoá khi giờ hẹn quá sớm', () => {
    const tooSoon = stateWith({ schedule: { type: 'scheduled', date: '2026-10-17', time: '09:01' }, audience: { type: 'manual' } });
    expect(isStepComplete('when', tooSoon, NOW)).toBe(false);
    const fine = stateWith({ schedule: { type: 'scheduled', date: '2026-10-17', time: '10:00' }, audience: { type: 'manual' } });
    expect(isStepComplete('when', fine, NOW)).toBe(true);
  });

  it('lặp lại: cần giờ; hằng tuần cần thứ', () => {
    expect(validateSchedule({ type: 'recurring', frequency: 'daily', weeklyDay: '1', time: '' }, NOW).ok).toBe(false);
    expect(validateSchedule({ type: 'recurring', frequency: 'weekly', weeklyDay: '', time: '09:00' }, NOW).ok).toBe(false);
    expect(validateSchedule({ type: 'recurring', frequency: 'monthly', weeklyDay: '', time: '09:00' }, NOW).ok).toBe(true);
  });
});

describe('thẻ "Tự động gửi cho người mới" chỉ hiện đúng nguồn + kênh', () => {
  const has = (state) => getAvailableWhenOptions(state).includes('continuous');

  it('landing / biểu mẫu / Google Sheet ở Email và Zalo cá nhân → có', () => {
    for (const channel of ['email', 'zalo']) {
      for (const type of ['landing', 'form', 'sheet']) {
        expect(has(stateWith({ channel, audience: { type } }))).toBe(true);
      }
    }
  });

  it('khách đã lưu / tự nhập / bạn bè Zalo → không (danh sách cố định)', () => {
    expect(has(stateWith({ channel: 'email', audience: { type: 'customers' } }))).toBe(false);
    expect(has(stateWith({ channel: 'email', audience: { type: 'manual' } }))).toBe(false);
    expect(has(stateWith({ channel: 'zalo', audience: { type: 'zalo_friends' } }))).toBe(false);
  });

  it('Zalo nhóm → không, dù nguồn nào', () => {
    expect(has(stateWith({ channel: 'zalo', audience: { type: 'zalo_groups' } }))).toBe(false);
    expect(has(stateWith({ channel: 'telegram', audience: { type: 'telegram_groups' } }))).toBe(false);
    expect(has(stateWith({ channel: 'whatsapp', audience: { type: 'whatsapp_groups' } }))).toBe(false);
  });

  it('đang chọn "Tự động gửi" rồi đổi sang nguồn Nhóm Zalo → về "Gửi ngay"', () => {
    const before = stateWith({
      channel: 'zalo',
      audience: { type: 'form', formIds: [7] },
      schedule: createDefaultSchedule('continuous', { pollIntervalMinutes: 180 }),
    });
    expect(reconcileSchedule({ ...before, audience: { ...before.audience, type: 'zalo_groups' } }).schedule).toEqual({ type: 'now' });
    expect(reconcileSchedule({ ...before, audience: { ...before.audience, type: 'manual' } }).schedule).toEqual({ type: 'now' });
    // Cách gửi khác vẫn giữ nguyên khi đổi kênh.
    const scheduled = stateWith({ schedule: { type: 'scheduled', date: '2026-10-20', time: '10:00' } });
    expect(applyChannelChange(scheduled, 'zalo').schedule).toEqual(scheduled.schedule);
  });
});

describe('body gửi server', () => {
  it('"Tự động gửi" → run có continuousMode + chu kỳ quét (phút, mili-giây, cycleMinutes)', () => {
    expect(buildRunBody({ type: 'continuous', pollIntervalMinutes: 180 }, 'Tên lượt')).toEqual({
      source: 'campaign_run',
      autoActivate: true,
      runName: 'Tên lượt',
      continuousMode: true,
      pollIntervalMs: 10800000,
      pollIntervalMinutes: 180,
      continuousCycleMinutes: 180,
    });
  });

  it('"Gửi ngay" → run KHÔNG có continuousMode (body y như PR-2)', () => {
    expect(buildRunBody({ type: 'now' }, 'Tên lượt')).toEqual({ source: 'campaign_run', autoActivate: true, runName: 'Tên lượt' });
  });

  it('preview: hẹn giờ mang startAt = giờ hẹn (ISO, giờ VN → UTC); body tạo KHÔNG mang startAt', () => {
    const state = stateWith({ audience: { type: 'manual', manualText: 'a@x.vn' }, schedule: { type: 'scheduled', date: '2026-10-20', time: '14:30' } });
    expect(buildSimplePreviewBody(state, NOW).startAt).toBe('2026-10-20T07:30:00.000Z');
    expect(buildSimplePreviewBody(state, NOW)).not.toHaveProperty('continuous');
    expect(buildSimpleCampaignBody(state)).not.toHaveProperty('startAt');
  });

  it('preview: lặp lại mang startAt = lần nổ kế tiếp; hằng ngày 10:00 khi đang 09:00 VN → 10:00 hôm nay', () => {
    const schedule = { type: 'recurring', frequency: 'daily', weeklyDay: '1', time: '10:00' };
    expect(resolveScheduleStartAt(schedule, NOW)).toBe('2026-10-17T03:00:00.000Z');
  });

  it('preview: tự động gửi mang continuous:true và không có startAt; gửi ngay không mang gì thêm', () => {
    const continuous = stateWith({ audience: { type: 'form', formIds: [7] }, schedule: { type: 'continuous', pollIntervalMinutes: 180 } });
    const body = buildSimplePreviewBody(continuous, NOW);
    expect(body.continuous).toBe(true);
    expect(body).not.toHaveProperty('startAt');
    const now = buildSimplePreviewBody(stateWith({ audience: { type: 'manual', manualText: 'a@x.vn' } }), NOW);
    expect(now).not.toHaveProperty('continuous');
    expect(now).not.toHaveProperty('startAt');
  });
});

describe('isScheduleBased — nút chính', () => {
  it('hẹn giờ / lặp lại = "Đặt lịch"; gửi ngay / tự động = "Bắt đầu gửi"', () => {
    expect(isScheduleBased({ type: 'scheduled' })).toBe(true);
    expect(isScheduleBased({ type: 'recurring' })).toBe(true);
    expect(isScheduleBased({ type: 'now' })).toBe(false);
    expect(isScheduleBased({ type: 'continuous' })).toBe(false);
  });
});

describe('describeWhen — câu nêu đúng cách gửi', () => {
  const t = (key, params = {}) => `${key}|${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')}`;

  it('mỗi cách gửi có khoá + tham số riêng', () => {
    expect(describeWhen({ schedule: { type: 'now' }, t })).toBe('simpleCampaign.review.when.now|');
    expect(describeWhen({ schedule: { type: 'scheduled', date: '2026-10-20', time: '8:05' }, t }))
      .toBe('simpleCampaign.review.when.scheduled|time=08:05,date=20/10/2026');
    expect(describeWhen({ schedule: { type: 'continuous', pollIntervalMinutes: 180 }, t }))
      .toBe('simpleCampaign.review.when.continuous|interval=simpleCampaign.when.continuous.aboutHours|n=3');
    expect(describeWhen({ schedule: { type: 'recurring', frequency: 'daily', time: '08:30' }, t }))
      .toBe('simpleCampaign.review.when.recurringDaily|time=08:30');
    expect(describeWhen({ schedule: { type: 'recurring', frequency: 'monthly', time: '07:15' }, t }))
      .toBe('simpleCampaign.review.when.recurringMonthly|time=07:15');
    expect(describeWhen({ schedule: { type: 'recurring', frequency: 'weekly', weeklyDay: '1', time: '09:00' }, t }))
      .toBe('simpleCampaign.review.when.recurringWeekly|day=campaigns.monday|,time=09:00');
  });
});

describe('formatPollInterval — chu kỳ quét nói bằng lời, làm tròn', () => {
  const t = (key, params = {}) => `${key}:${params.n}`;

  it('từ 60 phút trở lên tính theo giờ làm tròn; dưới 60 phút tính theo phút', () => {
    expect(formatPollInterval(295, t)).toBe('simpleCampaign.when.continuous.aboutHours:5');
    expect(formatPollInterval(120, t)).toBe('simpleCampaign.when.continuous.aboutHours:2');
    expect(formatPollInterval(150, t)).toBe('simpleCampaign.when.continuous.aboutHours:3');
    expect(formatPollInterval(45, t)).toBe('simpleCampaign.when.continuous.aboutMinutes:45');
  });

  it('bản tiếng Việt thật: 295 → "khoảng 5 giờ", 120 → "khoảng 2 giờ", 45 → "khoảng 45 phút"', async () => {
    const viDict = (await import('../../../../i18n/vi.js')).default;
    const real = (key, params = {}) => String(key.split('.').reduce((acc, part) => acc?.[part], viDict)).replace(/\{(\w+)\}/g, (_, name) => params[name]);
    expect(formatPollInterval(295, real)).toBe('khoảng 5 giờ');
    expect(formatPollInterval(120, real)).toBe('khoảng 2 giờ');
    expect(formatPollInterval(45, real)).toBe('khoảng 45 phút');
  });

  it('số phút gửi server giữ nguyên (không bị làm tròn)', () => {
    expect(buildRunBody({ type: 'continuous', pollIntervalMinutes: 295 }, 'x').pollIntervalMinutes).toBe(295);
    expect(buildRunBody({ type: 'continuous', pollIntervalMinutes: 295 }, 'x').pollIntervalMs).toBe(295 * 60 * 1000);
  });
});
