import { describe, it, expect } from 'vitest';
import {
  buildEditBody,
  buildScheduleUpdatePayload,
  buildStateFromServer,
  fingerprintEditState,
  parseServerSchedules,
  planScheduleSync,
  scheduleSignature,
} from '../simpleCampaign.edit.helpers';

const FOLLOW_UPS = [{ delayValue: 2, delayUnit: 'days', content: { mode: 'template', templateId: 5 } }];

const serverData = (patch = {}) => ({
  campaignName: 'Chiến dịch A',
  channel: 'email',
  form: {
    senderId: 11,
    audience: { type: 'manual', emails: ['a@x.vn', 'b@x.vn'] },
    content: { mode: 'custom', subject: 'Chào', body: 'Nội dung' },
    followUps: [],
  },
  schedules: [],
  ...patch,
});

describe('parseServerSchedules', () => {
  it('không có lịch → Chạy tay (type now), không khoá', () => {
    const parsed = parseServerSchedules([]);
    expect(parsed).toMatchObject({ schedule: { type: 'now' }, original: null, locked: false });
  });

  it('lịch hằng tuần thứ Hai 09:00 → recurring weekly, giữ id lịch', () => {
    const parsed = parseServerSchedules([{ id: 55, scheduleType: 'weekly', cronExpression: '0 9 * * 1', enabled: true }]);
    expect(parsed.schedule).toEqual({ type: 'recurring', frequency: 'weekly', weeklyDay: '1', time: '09:00' });
    expect(parsed.original).toMatchObject({ id: 55, enabled: true });
    expect(parsed.locked).toBe(false);
  });

  it('hằng ngày, hằng tháng ngày 1 đọc ngược đúng', () => {
    expect(parseServerSchedules([{ id: 1, scheduleType: 'daily', cronExpression: '30 8 * * *' }]).schedule)
      .toMatchObject({ type: 'recurring', frequency: 'daily', time: '08:30' });
    expect(parseServerSchedules([{ id: 2, scheduleType: 'monthly', cronExpression: '0 7 1 * *' }]).schedule)
      .toMatchObject({ type: 'recurring', frequency: 'monthly', time: '07:00' });
  });

  it('hẹn một lần → scheduled với ngày YYYY-MM-DD và giờ HH:MM', () => {
    const parsed = parseServerSchedules([{ id: 3, scheduleType: 'once', cronExpression: '15 14 20 10 *' }]);
    expect(parsed.schedule.type).toBe('scheduled');
    expect(parsed.schedule.time).toBe('14:15');
    expect(parsed.schedule.date).toMatch(/^\d{4}-10-20$/);
  });

  it('từ 2 lịch trở lên → khoá (chỉ xem), kèm cron để hiện', () => {
    const parsed = parseServerSchedules([
      { id: 1, scheduleType: 'daily', cronExpression: '0 9 * * *' },
      { id: 2, scheduleType: 'weekly', cronExpression: '0 9 * * 1' },
    ]);
    expect(parsed.locked).toBe(true);
    expect(parsed.lockedCron).toContain('0 9 * * *');
  });

  it('cron tuỳ chỉnh (không phải dạng trình tạo ghi) → khoá, không đoán', () => {
    expect(parseServerSchedules([{ id: 4, scheduleType: 'custom_interval', cronExpression: '0 9 */3 * *' }]).locked).toBe(true);
    expect(parseServerSchedules([{ id: 5, scheduleType: 'daily', cronExpression: '0 9 * 2 *' }]).locked).toBe(true);
  });
});

describe('buildStateFromServer', () => {
  it('điền kênh, tài khoản gửi, danh sách tự nhập, nội dung tự soạn và tên', () => {
    const state = buildStateFromServer(serverData());
    expect(state.channel).toBe('email');
    expect(state.sender).toEqual({ id: 11, label: '' });
    expect(state.audience.type).toBe('manual');
    expect(state.audience.manualText).toBe('a@x.vn\nb@x.vn');
    expect(state.content).toMatchObject({ mode: 'custom', subject: 'Chào', body: 'Nội dung' });
    expect(state.campaignName).toBe('Chiến dịch A');
    expect(state.schedule).toEqual({ type: 'now' });
  });

  it('nguồn Google Sheet: đánh dấu đã kiểm đúng đường dẫn để bước Người nhận không bắt kiểm lại', () => {
    const state = buildStateFromServer(serverData({
      form: { ...serverData().form, audience: { type: 'sheet', sheetUrl: ' https://docs.google.com/x ', sheetName: 'Trang 1' } },
    }));
    expect(state.audience.sheetCheckedUrl).toBe(state.audience.sheetUrl.trim());
  });

  it('mẫu có sẵn → templateId số; followUps giữ nguyên', () => {
    const state = buildStateFromServer(serverData({
      form: { ...serverData().form, content: { mode: 'template', templateId: '9' }, followUps: FOLLOW_UPS },
    }));
    expect(state.content).toMatchObject({ mode: 'template', templateId: 9 });
    expect(state.followUps).toEqual(FOLLOW_UPS);
  });

  it('form = null (không đọc ngược được) → null', () => {
    expect(buildStateFromServer(serverData({ form: null }))).toBeNull();
  });
});

describe('buildEditBody / fingerprintEditState', () => {
  it('body PUT = body tạo + followUps khi có; không có followUps thì không gửi khoá đó', () => {
    const base = buildStateFromServer(serverData());
    expect(buildEditBody(base)).not.toHaveProperty('followUps');
    const withFollow = { ...base, followUps: FOLLOW_UPS };
    expect(buildEditBody(withFollow).followUps).toEqual(FOLLOW_UPS);
    expect(buildEditBody(base)).toMatchObject({
      channel: 'email',
      senderId: 11,
      audience: { type: 'manual', emails: ['a@x.vn', 'b@x.vn'] },
      content: { mode: 'custom', subject: 'Chào', body: 'Nội dung' },
      campaignName: 'Chiến dịch A',
    });
  });

  it('đổi nội dung / tên / lịch → dấu vân tay đổi; đổi tên mẫu hiển thị hay nhãn tài khoản thì KHÔNG đổi', () => {
    const base = buildStateFromServer(serverData());
    const fp = fingerprintEditState(base);
    expect(fingerprintEditState({ ...base, content: { ...base.content, body: 'Khác' } })).not.toBe(fp);
    expect(fingerprintEditState({ ...base, campaignName: 'Tên khác' })).not.toBe(fp);
    expect(fingerprintEditState({ ...base, schedule: { type: 'recurring', frequency: 'daily', weeklyDay: '1', time: '09:00' } })).not.toBe(fp);
    expect(fingerprintEditState({ ...base, sender: { id: 11, label: 'shop@abc.vn' } })).toBe(fp);
    expect(fingerprintEditState({ ...base, audience: { ...base.audience, customerTotal: 99 } })).toBe(fp);
  });
});

describe('planScheduleSync', () => {
  const daily = { type: 'recurring', frequency: 'daily', weeklyDay: '1', time: '09:00' };
  const original = { id: 55, scheduleType: 'daily', cronExpression: '0 9 * * *', enabled: true };

  it('chưa có lịch: chọn Chạy tay → none; chọn hẹn / lặp → create', () => {
    expect(planScheduleSync({ original: null, schedule: { type: 'now' }, locked: false })).toBe('none');
    expect(planScheduleSync({ original: null, schedule: daily, locked: false })).toBe('create');
  });

  it('đã có lịch: giữ nguyên → none; đổi → update; chọn Chạy tay → delete', () => {
    expect(planScheduleSync({ original, schedule: daily, locked: false })).toBe('none');
    expect(planScheduleSync({ original, schedule: { ...daily, time: '10:00' }, locked: false })).toBe('update');
    expect(planScheduleSync({ original, schedule: { type: 'now' }, locked: false })).toBe('delete');
  });

  it('lịch khoá (nhiều lịch / dạng lạ) → luôn none, kể cả khi trạng thái bị đổi', () => {
    expect(planScheduleSync({ original, schedule: { type: 'now' }, locked: true })).toBe('none');
  });
});

describe('scheduleSignature / buildScheduleUpdatePayload', () => {
  it('chữ ký chỉ gồm trường người dùng chỉnh; weeklyDay chỉ tính khi hằng tuần', () => {
    expect(scheduleSignature({ type: 'recurring', frequency: 'daily', weeklyDay: '3', time: '09:00' }))
      .toBe(scheduleSignature({ type: 'recurring', frequency: 'daily', weeklyDay: '5', time: '09:00' }));
    expect(scheduleSignature({ type: 'recurring', frequency: 'weekly', weeklyDay: '3', time: '09:00' }))
      .not.toBe(scheduleSignature({ type: 'recurring', frequency: 'weekly', weeklyDay: '5', time: '09:00' }));
  });

  it('payload sửa lịch chỉ có kiểu + cron (giữ tên và bật/tắt)', () => {
    expect(buildScheduleUpdatePayload({ type: 'recurring', frequency: 'weekly', weeklyDay: '1', time: '09:00' }))
      .toEqual({ scheduleType: 'weekly', cronExpression: '00 09 * * 1' });
  });
});
