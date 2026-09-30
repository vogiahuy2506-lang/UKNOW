/**
 * P7 — hằng số/kiểm tra bước của node send_telegram / send_whatsapp PHẢN CHIẾU backend `channelSteps.util.js`
 * (tối đa 5 bước, độ trễ tối đa 30 ngày). Ghim từng giá trị để lệch backend là đỏ.
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_CHANNEL_STEPS,
  MAX_CHANNEL_STEP_DELAY_MS,
  createEmptyChannelStep,
  describeChannelStepsProblem,
} from '../channelSteps';

const steps = (count, extra = {}) => Array.from({ length: count }, (_, i) => (i === 0 ? { message: 'a' } : { message: `m${i}`, ...extra }));

describe('channelSteps (P7)', () => {
  it('hằng số khớp backend', () => {
    expect(MAX_CHANNEL_STEPS).toBe(5);
    expect(MAX_CHANNEL_STEP_DELAY_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('bước rỗng: bước 1 không có trễ; bước 2+ có sẵn 0 phút', () => {
    expect(createEmptyChannelStep(0)).toEqual({ message: '' });
    expect(createEmptyChannelStep(1)).toEqual({ message: '', delayValue: 0, delayUnit: 'minutes' });
  });

  it('hợp lệ: 1 bước, 5 bước có trễ, trễ 0, đúng 30 ngày', () => {
    expect(describeChannelStepsProblem(steps(1))).toBe('');
    expect(describeChannelStepsProblem(steps(5, { delayValue: 2, delayUnit: 'hours' }))).toBe('');
    expect(describeChannelStepsProblem(steps(2, { delayValue: 0 }))).toBe('');
    expect(describeChannelStepsProblem(steps(2, { delayValue: 30, delayUnit: 'days' }))).toBe('');
  });

  it('6 bước / trễ âm / không nguyên / đơn vị lạ / quá 30 ngày -> có câu báo lỗi', () => {
    expect(describeChannelStepsProblem(steps(6))).toContain('tối đa 5 bước');
    expect(describeChannelStepsProblem(steps(2, { delayValue: -1 }))).toContain('bước 2');
    expect(describeChannelStepsProblem(steps(2, { delayValue: 1.5 }))).toContain('số nguyên');
    expect(describeChannelStepsProblem(steps(2, { delayValue: 3, delayUnit: 'weeks' }))).toContain('Đơn vị');
    expect(describeChannelStepsProblem(steps(2, { delayValue: 31, delayUnit: 'days' }))).toContain('30 ngày');
  });

  it('bước ĐẦU: độ trễ bị bỏ qua (giống backend)', () => {
    expect(describeChannelStepsProblem([{ message: 'a', delayValue: -9 }, { message: 'b' }])).toBe('');
  });
});
