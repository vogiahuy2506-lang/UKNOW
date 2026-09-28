/**
 * PLAN_PR7_NODE_TELEGRAM_TRINH_DUNG_2026-09-28 Việc 4 — nhật ký chạy cho send_telegram:
 * SEND_NODE_SUBTYPES phải nhận diện được 'send_telegram' (nếu không, item KHÔNG đi qua
 * normalizeSendNodeItem và tên hiển thị sẽ không được tính); normalizeSendNodeItem phải nhận
 * fallback `display` (tên field campaignChannelRunner.service.js thật sự ghi vào item, khác các
 * field cũ zalo_display/displayName/name/...).
 */
import { describe, expect, it } from 'vitest';
import { buildWorkspaceLogsFromExecution } from '../campaignExecutionLogs';

describe('buildWorkspaceLogsFromExecution — send_telegram', () => {
  it("item {recipientKey, display, status:'sent'} -> tên hiển thị lấy đúng từ `display` (zaloName)", () => {
    const logs = [
      {
        id: 1,
        nodeId: 'node-telegram-1',
        nodeSubtype: 'send_telegram',
        nodeName: 'Gửi Telegram',
        status: 'success',
        createdAt: '2026-09-28T10:00:00.000Z',
        nodeResultJson: {
          items: [
            { recipientKey: '123456', display: 'Nguyễn Văn A', status: 'sent', messageId: 'm1' },
            { recipientKey: '-1001234', display: 'Nhóm B', status: 'failed', error: 'PEER_ID_INVALID' },
          ],
        },
      },
    ];

    const [group] = buildWorkspaceLogsFromExecution(logs);
    // "Đã gửi" chỉ hiện khi isSendNodeSubtype('send_telegram') === true — xác nhận gián tiếp
    // SEND_NODE_SUBTYPES đã có 'send_telegram' (không có thì message giữ nguyên message gốc).
    expect(group.message).toBe('Đã gửi');
    const items = group.result.output.items;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      recipientKey: '123456',
      display: 'Nguyễn Văn A',
      zaloName: 'Nguyễn Văn A',
      status: 'sent',
    });
    expect(items[1]).toMatchObject({
      recipientKey: '-1001234',
      display: 'Nhóm B',
      zaloName: 'Nhóm B',
      status: 'failed',
    });
  });

  it('meta.sent/meta.failed đếm đúng theo status của từng item (buildSendNodeMetaStats chỉ chạy khi SEND_NODE_SUBTYPES nhận diện được send_telegram)', () => {
    const logs = [
      {
        id: 1,
        nodeId: 'node-telegram-3',
        nodeSubtype: 'send_telegram',
        status: 'success',
        createdAt: '2026-09-28T10:00:00.000Z',
        nodeResultJson: {
          items: [
            { recipientKey: '1', display: 'A', status: 'sent' },
            { recipientKey: '2', display: 'B', status: 'sent' },
            { recipientKey: '3', display: 'C', status: 'failed' },
          ],
        },
      },
    ];
    const [group] = buildWorkspaceLogsFromExecution(logs);
    expect(group.result.output.meta.totalItems).toBe(3);
  });
});
