/**
 * PLAN_WHATSAPP_DAY_DU_2026-09-29 PR-W4b — nhật ký chạy cho send_whatsapp: SEND_NODE_SUBTYPES phải
 * nhận diện 'send_whatsapp' (không thì item không đi qua normalizeSendNodeItem, không có meta đếm).
 */
import { describe, expect, it } from 'vitest';
import { buildWorkspaceLogsFromExecution } from '../campaignExecutionLogs';

describe('buildWorkspaceLogsFromExecution — send_whatsapp', () => {
  it("item {recipientKey, display, status} -> hiển thị tên từ `display`, message 'Đã gửi', meta đếm đủ", () => {
    const logs = [
      {
        id: 1,
        nodeId: 'node-wa-1',
        nodeSubtype: 'send_whatsapp',
        nodeName: 'Gửi WhatsApp',
        status: 'success',
        createdAt: '2026-09-29T10:00:00.000Z',
        nodeResultJson: {
          items: [
            { recipientKey: '84912345678', display: 'Nguyễn Văn A', status: 'sent', messageId: 'm1' },
            { recipientKey: '84913456789', display: 'Trần B', status: 'failed', error: 'Số không dùng WhatsApp' },
          ],
        },
      },
    ];
    const [group] = buildWorkspaceLogsFromExecution(logs);
    expect(group.message).toBe('Đã gửi');
    const items = group.result.output.items;
    expect(items[0]).toMatchObject({ recipientKey: '84912345678', zaloName: 'Nguyễn Văn A', status: 'sent' });
    expect(items[1]).toMatchObject({ recipientKey: '84913456789', zaloName: 'Trần B', status: 'failed' });
    expect(group.result.output.meta.totalItems).toBe(2);
  });
});
