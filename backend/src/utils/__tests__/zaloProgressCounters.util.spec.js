/**
 * Bộ đếm tiến độ Zalo — tách "đã xử lý" khỏi "đã gửi thật".
 *
 * Sự cố production 23/10/2026: UI hiện "Đã gửi 19/200" trong khi Zalo thực tế chỉ nhận ~5 tin.
 * Nguyên nhân: bộ đếm cũ cộng `successfulSends + failedSends + skippedSends` — tức "đã xử lý".
 */

import { describe, expect, it } from '@jest/globals';

import {
  buildZaloPersonalProgressMessage,
  buildZaloProgressForLog,
  resolveZaloProgressCounters,
} from '../zaloProgressCounters.util.js';

describe('resolveZaloProgressCounters', () => {
  it('tách 3 nhóm: đã gửi / không tới nơi / đã xử lý', () => {
    expect(resolveZaloProgressCounters({
      successfulSends: 5,
      failedSends: 3,
      skippedSends: 4,
    })).toEqual({
      processed: 12,
      sent: 5,
      notDelivered: 7,
      failed: 3,
      skipped: 4,
    });
  });

  it('bộ đếm rỗng / âm không làm hỏng phép tính', () => {
    expect(resolveZaloProgressCounters({})).toEqual({
      processed: 0, sent: 0, notDelivered: 0, failed: 0, skipped: 0,
    });
    expect(resolveZaloProgressCounters({ successfulSends: -3 })).toMatchObject({ sent: 0, processed: 0 });
  });
});

describe('buildZaloPersonalProgressMessage', () => {
  it('không có lỗi/bỏ qua → giữ khuôn cũ "Đã gửi X/Y"', () => {
    expect(buildZaloPersonalProgressMessage(
      { successfulSends: 19, failedSends: 0, skippedSends: 0 },
      200,
    )).toBe('Đã gửi 19/200');
  });

  it('có lần hỏng → hiện số gửi THẬT + số không tới nơi', () => {
    expect(buildZaloPersonalProgressMessage(
      { successfulSends: 10, failedSends: 10, skippedSends: 0 },
      20,
    )).toBe('Đã gửi 10/20 (không tới nơi: 10)');
  });

  it('có người bị bỏ qua → cũng tính vào "không tới nơi"', () => {
    expect(buildZaloPersonalProgressMessage(
      { successfulSends: 5, failedSends: 0, skippedSends: 14 },
      19,
    )).toBe('Đã gửi 5/19 (không tới nơi: 14)');
  });

  it('nhiều template: offset đưa mốc về phạm vi template hiện tại', () => {
    // Template 1: 5 tin đã gửi. Template 2 bắt đầu, offset = 5.
    expect(buildZaloPersonalProgressMessage(
      { successfulSends: 5, failedSends: 0, skippedSends: 0 },
      19,
      5,
    )).toBe('Đã gửi 0/19');
  });
});

describe('buildZaloProgressForLog', () => {
  it('progress_current = số đã XỬ LÝ (mốc tiến độ), kèm số gửi thật / không tới nơi', () => {
    expect(buildZaloProgressForLog(
      { successfulSends: 5, failedSends: 2, skippedSends: 3 },
      20,
    )).toEqual({ current: 10, total: 20, sent: 5, notDelivered: 5 });
  });

  it('offset không làm mốc âm', () => {
    expect(buildZaloProgressForLog(
      { successfulSends: 3, failedSends: 0, skippedSends: 0 },
      20,
      10,
    )).toEqual({ current: 0, total: 20, sent: 3, notDelivered: 0 });
  });
});
