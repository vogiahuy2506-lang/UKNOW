/**
 * Test suite cho campaignExecutionLogs.js — module quan trọng nhất ở frontend
 * (504 dòng, transform logs từ backend thành workspace UI rows).
 *
 * Phạm vi:
 *   - parseExecutionPayload (string JSON, object, null, garbage)
 *   - buildFlowOrderIndex (BFS từ trigger nodes, ignore unreachable)
 *   - buildWorkspaceLogsFromExecution: aggregate items, status escalation,
 *     send-node short message, bounce → warning, schema strip messageText,
 *     flowOrder sort.
 */
import { describe, it, expect } from 'vitest';
import {
  parseExecutionPayload,
  buildFlowOrderIndex,
  buildWorkspaceLogsFromExecution,
} from '../campaignExecutionLogs';

describe('parseExecutionPayload', () => {
  it('null/undefined → null', () => {
    expect(parseExecutionPayload(null)).toBeNull();
    expect(parseExecutionPayload(undefined)).toBeNull();
  });

  it('object → trả nguyên object', () => {
    const obj = { foo: 'bar' };
    expect(parseExecutionPayload(obj)).toBe(obj);
  });

  it('JSON string hợp lệ → object parsed', () => {
    expect(parseExecutionPayload('{"a":1}')).toEqual({ a: 1 });
  });

  it('string không phải JSON → bọc { value: <string> }', () => {
    expect(parseExecutionPayload('hello')).toEqual({ value: 'hello' });
  });

  it('number/boolean → null (chỉ object|string mới hợp lệ)', () => {
    expect(parseExecutionPayload(42)).toBeNull();
    expect(parseExecutionPayload(true)).toBeNull();
  });
});

describe('buildFlowOrderIndex', () => {
  it('không có node/edge → Map rỗng', () => {
    expect(buildFlowOrderIndex([], [])).toEqual(new Map());
    expect(buildFlowOrderIndex(null, null)).toEqual(new Map());
  });

  it('không có trigger node → Map rỗng', () => {
    const nodes = [
      { id: 'a', data: { nodeType: 'action' } },
      { id: 'b', data: { nodeType: 'action' } },
    ];
    const edges = [{ source: 'a', target: 'b' }];
    expect(buildFlowOrderIndex(nodes, edges)).toEqual(new Map());
  });

  it('linear: trigger → action1 → action2 → order 0,1,2', () => {
    const nodes = [
      { id: 'trg', data: { nodeType: 'trigger' } },
      { id: 'a1', data: { nodeType: 'action' } },
      { id: 'a2', data: { nodeType: 'action' } },
    ];
    const edges = [
      { source: 'trg', target: 'a1' },
      { source: 'a1', target: 'a2' },
    ];
    const idx = buildFlowOrderIndex(nodes, edges);
    expect(idx.get('trg')).toBe(0);
    expect(idx.get('a1')).toBe(1);
    expect(idx.get('a2')).toBe(2);
  });

  it('node unreachable từ trigger không có trong index', () => {
    const nodes = [
      { id: 'trg', data: { nodeType: 'trigger' } },
      { id: 'a1', data: { nodeType: 'action' } },
      { id: 'orphan', data: { nodeType: 'action' } },
    ];
    const edges = [{ source: 'trg', target: 'a1' }];
    const idx = buildFlowOrderIndex(nodes, edges);
    expect(idx.has('trg')).toBe(true);
    expect(idx.has('a1')).toBe(true);
    expect(idx.has('orphan')).toBe(false);
  });

  it('id dạng số được normalize thành string', () => {
    const nodes = [
      { id: 1, data: { nodeType: 'trigger' } },
      { id: 2, data: { nodeType: 'action' } },
    ];
    const edges = [{ source: 1, target: 2 }];
    const idx = buildFlowOrderIndex(nodes, edges);
    expect(idx.get('1')).toBe(0);
    expect(idx.get('2')).toBe(1);
  });

  it('type "start" cũng được coi là trigger', () => {
    const nodes = [
      { id: 's', type: 'start' },
      { id: 'a', data: { nodeType: 'action' } },
    ];
    const edges = [{ source: 's', target: 'a' }];
    const idx = buildFlowOrderIndex(nodes, edges);
    expect(idx.get('s')).toBe(0);
    expect(idx.get('a')).toBe(1);
  });
});

describe('buildWorkspaceLogsFromExecution', () => {
  it('mảng rỗng → []', () => {
    expect(buildWorkspaceLogsFromExecution([])).toEqual([]);
    expect(buildWorkspaceLogsFromExecution(null)).toEqual([]);
  });

  it('1 log đơn giản → 1 row, status từ log', () => {
    const logs = [
      {
        id: 1,
        nodeId: 'n1',
        nodeName: 'Trigger',
        nodeSubtype: 'manual',
        status: 'success',
        createdAt: '2025-01-01T10:00:00Z',
      },
    ];
    const rows = buildWorkspaceLogsFromExecution(logs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'node-n1',
      status: 'success',
      nodeName: 'Trigger',
    });
  });

  it('cùng nodeId → gộp thành 1 group, lấy latestAt là log mới nhất', () => {
    const logs = [
      { id: 1, nodeId: 'n1', nodeName: 'Send', status: 'success', createdAt: '2025-01-01T10:00:00Z' },
      { id: 2, nodeId: 'n1', nodeName: 'Send', status: 'success', createdAt: '2025-01-01T10:05:00Z' },
    ];
    const rows = buildWorkspaceLogsFromExecution(logs);
    expect(rows).toHaveLength(1);
    expect(rows[0].timestamp).toEqual(new Date('2025-01-01T10:05:00Z'));
  });

  it('log status=failed thắng status success trước đó', () => {
    const logs = [
      { id: 1, nodeId: 'n1', status: 'success', createdAt: '2025-01-01T10:00:00Z' },
      { id: 2, nodeId: 'n1', status: 'failed', createdAt: '2025-01-01T10:05:00Z' },
    ];
    const rows = buildWorkspaceLogsFromExecution(logs);
    expect(rows[0].status).toBe('failed');
  });

  it('send_email node có message "Đã gửi" (override message gốc)', () => {
    const logs = [
      {
        id: 1,
        nodeId: 'n1',
        nodeSubtype: 'send_email',
        status: 'success',
        createdAt: '2025-01-01T10:00:00Z',
        nodeResultJson: JSON.stringify({
          items: [
            { to: 'a@x.com', status: 'success' },
            { to: 'b@x.com', status: 'success' },
          ],
          message: 'Gửi email thành công',
        }),
      },
    ];
    const rows = buildWorkspaceLogsFromExecution(logs);
    expect(rows[0].message).toBe('Đã gửi');
    expect(rows[0].result.output.items).toHaveLength(2);
    expect(rows[0].result.output.meta.totalItems).toBe(2);
    expect(rows[0].result.output.meta.sentCount).toBe(2);
    expect(rows[0].result.output.meta.failedCount).toBe(0);
  });

  it('send_email với item bounce → status escalate thành "warning"', () => {
    const logs = [
      {
        id: 1,
        nodeId: 'n1',
        nodeSubtype: 'send_email',
        status: 'success',
        createdAt: '2025-01-01T10:00:00Z',
        nodeResultJson: JSON.stringify({
          items: [
            { to: 'a@x.com', status: 'success' },
            { to: 'b@x.com', status: 'bounced', bounceType: 'hard' },
          ],
        }),
      },
    ];
    const rows = buildWorkspaceLogsFromExecution(logs);
    expect(rows[0].status).toBe('warning');
  });

  it('send_email với item failed thực sự → giữ status gốc (không warning)', () => {
    const logs = [
      {
        id: 1,
        nodeId: 'n1',
        nodeSubtype: 'send_email',
        status: 'failed',
        createdAt: '2025-01-01T10:00:00Z',
        nodeResultJson: JSON.stringify({
          items: [
            { to: 'a@x.com', status: 'failed', error: 'SMTP error' },
            { to: 'b@x.com', status: 'bounced' },
          ],
        }),
      },
    ];
    const rows = buildWorkspaceLogsFromExecution(logs);
    expect(rows[0].status).toBe('failed');
  });

  it('messageText bị loại khỏi aggregatedSchema', () => {
    const logs = [
      {
        id: 1,
        nodeId: 'n1',
        nodeSubtype: 'send_zalo_personal',
        status: 'success',
        createdAt: '2025-01-01T10:00:00Z',
        nodeResultJson: JSON.stringify({
          items: [{ to: 'u1', status: 'success', messageText: 'Đã gửi 1/2' }],
          schema: [
            { key: 'to', type: 'string' },
            { key: 'messageText', type: 'string' },
            { key: 'status', type: 'string' },
          ],
        }),
      },
    ];
    const rows = buildWorkspaceLogsFromExecution(logs);
    const keys = rows[0].result.output.schema.map((c) => c.key);
    expect(keys).not.toContain('messageText');
    expect(keys).toEqual(expect.arrayContaining(['to', 'status']));
  });

  it('flowOrderByNodeId sắp xếp output theo thứ tự flow (không theo thời gian)', () => {
    const logs = [
      // log của node B (flowOrder=1) đến TRƯỚC log node A (flowOrder=0)
      { id: 1, nodeId: 'B', nodeName: 'Send', status: 'success', createdAt: '2025-01-01T10:00:00Z' },
      { id: 2, nodeId: 'A', nodeName: 'Trigger', status: 'success', createdAt: '2025-01-01T10:05:00Z' },
    ];
    const flowOrder = new Map([['A', 0], ['B', 1]]);
    const rows = buildWorkspaceLogsFromExecution(logs, { flowOrderByNodeId: flowOrder });
    expect(rows.map((r) => r.nodeName)).toEqual(['Trigger', 'Send']);
  });

  it('snapshot mode: log sau chứa toàn bộ log trước → replace, không duplicate', () => {
    const logs = [
      {
        id: 1,
        nodeId: 'n1',
        nodeSubtype: 'send_zalo_personal',
        status: 'success',
        createdAt: '2025-01-01T10:00:00Z',
        nodeResultJson: JSON.stringify({
          items: [{ to: 'u1', status: 'success' }],
        }),
      },
      {
        id: 2,
        nodeId: 'n1',
        nodeSubtype: 'send_zalo_personal',
        status: 'success',
        createdAt: '2025-01-01T10:05:00Z',
        nodeResultJson: JSON.stringify({
          items: [
            { to: 'u1', status: 'success' },
            { to: 'u2', status: 'success' },
          ],
        }),
      },
    ];
    const rows = buildWorkspaceLogsFromExecution(logs);
    expect(rows[0].result.output.items).toHaveLength(2);
  });

  it('delta mode: log sau là chunk MỚI hoàn toàn → append', () => {
    const logs = [
      {
        id: 1,
        nodeId: 'n1',
        nodeSubtype: 'send_zalo_personal',
        status: 'success',
        createdAt: '2025-01-01T10:00:00Z',
        nodeResultJson: JSON.stringify({
          items: [{ to: 'u1', status: 'success' }],
        }),
      },
      {
        id: 2,
        nodeId: 'n1',
        nodeSubtype: 'send_zalo_personal',
        status: 'success',
        createdAt: '2025-01-01T10:05:00Z',
        nodeResultJson: JSON.stringify({
          items: [{ to: 'u2', status: 'success' }],
        }),
      },
    ];
    const rows = buildWorkspaceLogsFromExecution(logs);
    expect(rows[0].result.output.items).toHaveLength(2);
    expect(rows[0].result.output.items.map((it) => it.to)).toEqual(['u1', 'u2']);
  });

  it('payload format result.output (normalize) → vẫn lấy items đúng', () => {
    const logs = [
      {
        id: 1,
        nodeId: 'n1',
        nodeSubtype: 'send_email',
        status: 'success',
        createdAt: '2025-01-01T10:00:00Z',
        executionData: {
          result: {
            output: {
              items: [{ to: 'a@x.com', status: 'success' }],
              meta: { foo: 'bar' },
            },
          },
        },
      },
    ];
    const rows = buildWorkspaceLogsFromExecution(logs);
    expect(rows[0].result.output.items).toHaveLength(1);
    expect(rows[0].result.output.meta.foo).toBe('bar');
  });
});
