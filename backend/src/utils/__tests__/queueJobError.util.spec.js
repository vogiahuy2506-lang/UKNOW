import { describe, it, expect } from '@jest/globals';
import {
  QUEUE_JOB_ERROR_MARK,
  isSerializedJobError,
  reviveJobError,
  serializeJobError,
} from '../queueJobError.util.js';

describe('queueJobError.util (PR-Q2 việc d)', () => {
  it('serialize giữ code / message / zaloRetry / stage ở mức trên cùng và qua được JSON', () => {
    const error = new Error('Zalo không phản hồi');
    error.code = 'ETIMEDOUT';
    error.zaloRetry = { operationName: 'send_message', attempt: 4, maxAttempts: 4 };
    error.stage = 'send';
    const serialized = JSON.parse(JSON.stringify(serializeJobError(error, { jobType: 'zalo.personal.send' })));

    expect(serialized).toMatchObject({
      ok: false,
      code: 'ETIMEDOUT',
      message: 'Zalo không phản hồi',
      zaloRetry: { attempt: 4, maxAttempts: 4 },
      stage: 'send',
      jobType: 'zalo.personal.send',
      [QUEUE_JOB_ERROR_MARK]: true,
    });
    expect(isSerializedJobError(serialized)).toBe(true);
  });

  it('thuộc tính phụ đi vào details, bỏ hàm / vòng tham chiếu / giá trị quá lớn', () => {
    const error = new Error('smtp');
    error.responseCode = 450;
    error.response = '450 4.7.1 slow down';
    error.onDone = () => {};
    const circular = {};
    circular.self = circular;
    error.circular = circular;
    error.huge = { text: 'x'.repeat(10_000) };
    const { details } = serializeJobError(error);

    expect(details).toEqual({ responseCode: 450, response: '450 4.7.1 slow down' });
  });

  it('revive dựng lại Error đủ thuộc tính; khoá *At/*Until thành Date (resetAt dùng new Date(...).getTime())', () => {
    const original = new Error('Đã đạt giới hạn gửi trong ngày');
    original.code = 'RESOURCE_LIMIT_EXCEEDED';
    original.limitType = 'daily';
    original.resetAt = new Date('2026-10-12T17:00:00.000Z');
    original.phoneLookupCooldownUntil = new Date('2026-10-12T17:00:00.000Z');
    const revived = reviveJobError(JSON.parse(JSON.stringify(serializeJobError(original))));

    expect(revived).toBeInstanceOf(Error);
    expect(revived.message).toBe(original.message);
    expect(revived.code).toBe('RESOURCE_LIMIT_EXCEEDED');
    expect(revived.limitType).toBe('daily');
    expect(revived.resetAt).toBeInstanceOf(Date);
    expect(revived.resetAt.getTime()).toBe(original.resetAt.getTime());
    expect(revived.phoneLookupCooldownUntil).toBeInstanceOf(Date);
    expect(revived.fromQueueJob).toBe(true);
  });

  it('lỗi không phải Error (chuỗi / null) vẫn chuẩn hoá được', () => {
    expect(serializeJobError('Tìm số điện thoại quá nhiều').message).toBe('Tìm số điện thoại quá nhiều');
    expect(serializeJobError(null).message).toBe('Lỗi không xác định');
  });

  it('isSerializedJobError: nhận dạng có cờ lẫn dạng rút gọn, từ chối kết quả nghiệp vụ bình thường', () => {
    expect(isSerializedJobError({ ok: false, code: 'X', message: 'm' })).toBe(true);
    expect(isSerializedJobError({ [QUEUE_JOB_ERROR_MARK]: true })).toBe(true);
    expect(isSerializedJobError({ status: 'failed', error: 'x' })).toBe(false);
    expect(isSerializedJobError({ ok: false })).toBe(false);
    expect(isSerializedJobError(null)).toBe(false);
    expect(isSerializedJobError([1])).toBe(false);
    expect(isSerializedJobError(new Error('x'))).toBe(false);
  });
});
