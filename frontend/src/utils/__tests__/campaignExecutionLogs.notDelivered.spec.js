import { describe, expect, it } from 'vitest';

import { buildWorkspaceLogsFromExecution } from '../campaignExecutionLogs.js';

/**
 * Sự cố production 23/10/2026: node gửi Zalo hiện "Đã gửi 19" trong khi thực tế chỉ 5 tin
 * tới nơi, vì item `skipped` (không tìm thấy user Zalo / người nhận chặn tin / Zalo không xác
 * nhận phát tin) bị cộng vào "đã gửi". Các test dưới khoá lại cách tách bộ đếm mới.
 */

const zaloItem = (status, extra = {}) => ({
  status,
  recipient: extra.recipient || '0900000001',
  messageText: 'Đã gửi 1/30',
  ...extra,
});

const buildFromItems = (items) => buildWorkspaceLogsFromExecution(
  [{
    id: 1,
    nodeId: 'node-300',
    nodeName: 'Gửi Zalo cá nhân',
    nodeSubtype: 'send_zalo_personal',
    status: 'success',
    createdAt: '2026-09-12T02:00:00.000Z',
    progressCurrent: items.length,
    progressTotal: 30,
    executionData: { items, schema: [{ key: 'status', type: 'string' }] },
  }],
);

const statsOf = (items) => buildFromItems(items)[0].result.output.meta;

describe('buildWorkspaceLogsFromExecution — bộ đếm node gửi', () => {
  it('tách "không tới nơi" ra khỏi "đã gửi" (sự cố 19/200)', () => {
    const stats = statsOf([
      zaloItem('success'),
      zaloItem('success'),
      zaloItem('success'),
      zaloItem('success'),
      zaloItem('success'),
      zaloItem('skipped', { skipReason: 'zalo_user_not_found' }),
      zaloItem('skipped', { skipReason: 'zalo_user_not_found' }),
      zaloItem('skipped', { skipReason: 'zalo_sender_blocked' }),
      zaloItem('failed'),
      zaloItem('failed'),
      zaloItem('aborted'),
    ]);

    expect(stats.sentCount).toBe(5);
    expect(stats.failedCount).toBe(2);
    expect(stats.notDeliveredCount).toBe(6);
    expect(stats.skippedCount).toBe(4);
  });

  it('tính partial (gửi được một phần) là chưa tới nơi trọn vẹn, không phải đã gửi', () => {
    const stats = statsOf([zaloItem('success'), zaloItem('partial')]);

    expect(stats.sentCount).toBe(1);
    expect(stats.failedCount).toBe(1);
    expect(stats.notDeliveredCount).toBe(1);
  });

  it('mọi người nhận đều bị chặn thì sentCount = 0, không có tin nào tới nơi', () => {
    const stats = statsOf([
      zaloItem('skipped', { skipReason: 'zalo_sender_blocked' }),
      zaloItem('skipped', { skipReason: 'zalo_sender_blocked' }),
    ]);

    expect(stats.sentCount).toBe(0);
    expect(stats.notDeliveredCount).toBe(2);
  });

  it('item không có status thì mặc định tính là đã gửi (tương thích ngược)', () => {
    const stats = statsOf([{ recipient: '0900000001' }, { recipient: '0900000002' }]);

    expect(stats.sentCount).toBe(2);
    expect(stats.notDeliveredCount).toBe(0);
  });

  it('node không phải node gửi thì không gắn bộ đếm gửi', () => {
    const logs = buildWorkspaceLogsFromExecution([{
      id: 1,
      nodeId: 'node-100',
      nodeName: 'Đọc danh sách',
      nodeSubtype: 'read_sheet',
      status: 'success',
      createdAt: '2026-09-12T02:00:00.000Z',
      executionData: { items: [{ a: 1 }] },
    }]);

    expect(logs[0].result.output.meta.totalItems).toBe(1);
    expect(logs[0].result.output.meta.sentCount).toBeUndefined();
  });
});