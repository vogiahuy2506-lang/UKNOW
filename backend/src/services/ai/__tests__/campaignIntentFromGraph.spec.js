import { describe, expect, it } from '@jest/globals';
import { deriveIntentFromGraph } from '../campaignIntentFromGraph.service.js';

describe('Backtest - Việc 1: campaignIntentFromGraph.service', () => {
  it('rút intent thành công từ graph Email Once (manual_trigger + read_sheet + send_email + end)', () => {
    const nodes = [
      { id: 1, node_type: 'trigger', node_subtype: 'manual_trigger', config: {} },
      { id: 2, node_type: 'data', node_subtype: 'read_sheet', config: { sheetUrl: 'https://docs.google.com/spreadsheets/d/abc' } },
      {
        id: 3,
        node_type: 'action',
        node_subtype: 'send_email',
        config: { fromEmailId: 5, recipientSource: 'node', emailSteps: [{ emailSubject: 'Test' }] },
      },
      { id: 4, node_type: 'end', node_subtype: 'end', config: {} },
    ];

    const res = deriveIntentFromGraph(nodes, []);
    expect(res.unsupported).toEqual([]);
    expect(res.intent).toEqual({
      version: 1,
      channel: 'email',
      sender: { type: 'email_account', id: 5 },
      audience: {
        type: 'sheet',
        url: 'https://docs.google.com/spreadsheets/d/abc',
        recipientKind: 'email',
      },
      schedule: { type: 'once' },
    });
  });

  it('rút intent thành công từ graph Email Drip (nhiều steps)', () => {
    const nodes = [
      { id: 1, node_subtype: 'manual', config: {} },
      { id: 2, node_subtype: 'interested_customers', config: {} },
      {
        id: 3,
        node_subtype: 'send_email',
        config: {
          fromEmailId: 2,
          emailSteps: [
            { delayValue: 0, delayUnit: 'days' },
            { delayValue: 1, delayUnit: 'days' },
            { delayValue: 2, delayUnit: 'days' },
          ],
        },
      },
      { id: 4, node_subtype: 'end', config: {} },
    ];

    const res = deriveIntentFromGraph(nodes, []);
    expect(res.unsupported).toEqual([]);
    expect(res.intent.channel).toBe('email');
    expect(res.intent.schedule).toEqual({ type: 'drip', days: 3, slotsPerDay: 1 });
    expect(res.intent.audience.type).toBe('db');
  });

  it('rút intent thành công từ graph Zalo cá nhân (select_zalo_account + get_all_friends + send_zalo_personal)', () => {
    const nodes = [
      { id: 1, node_subtype: 'manual', config: {} },
      { id: 2, node_subtype: 'select_zalo_account', config: { zaloAccountId: 10 } },
      { id: 3, node_subtype: 'get_all_friends', config: {} },
      {
        id: 4,
        node_subtype: 'send_zalo_personal',
        config: { zaloAccountId: 10, zaloRecipientSource: 'node' },
      },
      { id: 5, node_subtype: 'end', config: {} },
    ];

    const res = deriveIntentFromGraph(nodes, []);
    expect(res.unsupported).toEqual([]);
    expect(res.intent).toEqual({
      version: 1,
      channel: 'zalo',
      sender: { type: 'zalo_account', id: 10 },
      audience: {
        type: 'zalo_contacts',
        recipientKind: 'phone',
      },
      schedule: { type: 'once' },
    });
  });

  it('phát hiện đúng các node chưa hỗ trợ (condition, save_customer...) và trả về unsupported', () => {
    const nodes = [
      { id: 1, node_subtype: 'manual', config: {} },
      { id: 2, node_subtype: 'read_sheet', config: { sheetUrl: 'https://sheet.url' } },
      { id: 3, node_subtype: 'condition', config: {} }, // node chưa hỗ trợ
      { id: 4, node_subtype: 'send_email', config: { fromEmailId: 1 } },
    ];

    const res = deriveIntentFromGraph(nodes, []);
    expect(res.intent).toBeNull();
    expect(res.unsupported).toContain('condition');
  });

  it('xử lý an toàn khi đồ thị rỗng hoặc không có send node', () => {
    const emptyRes = deriveIntentFromGraph([], []);
    expect(emptyRes.intent).toBeNull();
    expect(emptyRes.unsupported).toContain('empty_graph');

    const noSendRes = deriveIntentFromGraph([
      { id: 1, node_subtype: 'manual', config: {} },
      { id: 2, node_subtype: 'read_sheet', config: {} },
    ], []);
    expect(noSendRes.intent).toBeNull();
    expect(noSendRes.unsupported).toContain('no_send_node');
  });
});
