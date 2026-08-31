import { describe, expect, it } from '@jest/globals';
import {
  compareCompiledWithLegacy,
  getCompiledNodeSubtype,
  getLegacyNodeSubtype,
  runCompilerShadowCompare,
} from '../campaignCompilerShadow.service.js';

describe('PR-2.3 & PR-3.2: campaignCompilerShadow.service', () => {
  const sampleCompiledGraph = {
    nodes: [
      { id: 'node_trigger_1', nodeType: 'trigger', nodeSubtype: 'manual', config: {} },
      { id: 'node_read_sheet_1', nodeType: 'data', nodeSubtype: 'read_sheet', config: { sheetUrl: 'https://sheet.link' } },
      {
        id: 'node_send_email_1',
        nodeType: 'action',
        nodeSubtype: 'send_email',
        config: { fromEmailId: 5, recipientSource: 'node', emailSteps: [{ emailSubject: 'Hi' }] },
      },
    ],
    connections: [
      { sourceNodeId: 'node_trigger_1', targetNodeId: 'node_read_sheet_1' },
      { sourceNodeId: 'node_read_sheet_1', targetNodeId: 'node_send_email_1' },
    ],
    contentSlots: [{ slotId: 'slot_1' }],
  };

  it('siết chặt getCompiledNodeSubtype và getLegacyNodeSubtype', () => {
    // Compiler chỉ chấp nhận camelCase nodeSubtype
    expect(getCompiledNodeSubtype({ nodeSubtype: 'send_email' })).toBe('send_email');
    expect(getCompiledNodeSubtype({ node_subtype: 'send_email' })).toBe('');
    expect(getCompiledNodeSubtype({ type: 'send_email' })).toBe('');

    // Legacy chấp nhận nodeSubtype hoặc node_subtype hoặc subtype
    expect(getLegacyNodeSubtype({ nodeSubtype: 'send_email' })).toBe('send_email');
    expect(getLegacyNodeSubtype({ node_subtype: 'send_email' })).toBe('send_email');
    expect(getLegacyNodeSubtype({ subtype: 'send_email' })).toBe('send_email');
    expect(getLegacyNodeSubtype({ type: 'send_email' })).toBe(''); // Không fallback sang type
  });

  it('compareCompiledWithLegacy trả về match: true khi 2 graph khớp cấu trúc', () => {
    const legacyScript = {
      nodes: [
        { tempId: 'manual_1', node_subtype: 'manual', config: {} },
        { tempId: 'read_sheet_1', node_subtype: 'read_sheet', config: { sheetUrl: 'https://sheet.link' } },
        {
          tempId: 'send_email_1',
          node_subtype: 'send_email',
          config: { fromEmailId: 5, recipientSource: 'node', emailSteps: [{ emailSubject: 'Hi' }] },
        },
      ],
      connections: [
        { sourceNodeId: 'manual_1', targetNodeId: 'read_sheet_1' },
        { sourceNodeId: 'read_sheet_1', targetNodeId: 'send_email_1' },
      ],
    };

    const result = compareCompiledWithLegacy(sampleCompiledGraph, legacyScript);
    expect(result.match).toBe(true);
    expect(result.differences).toEqual([]);
    expect(result.summary.compiledNodeCount).toBe(3);
    expect(result.summary.legacyNodeCount).toBe(3);
  });

  it('compareCompiledWithLegacy phát hiện khác biệt khi thiếu node hoặc sai config', () => {
    const mismatchedLegacy = {
      nodes: [
        { tempId: 'manual_1', node_subtype: 'manual', config: {} },
        {
          tempId: 'send_email_1',
          node_subtype: 'send_email',
          config: { fromEmailId: 99, recipientSource: 'manual' }, // sai fromEmailId và recipientSource
        },
      ],
      connections: [
        { sourceNodeId: 'manual_1', targetNodeId: 'send_email_1' },
      ],
    };

    const result = compareCompiledWithLegacy(sampleCompiledGraph, mismatchedLegacy);
    expect(result.match).toBe(false);
    expect(result.differences.length).toBeGreaterThan(0);
    expect(result.differences.some((d) => d.includes('Số lượng nodes không khớp'))).toBe(true);
    expect(result.differences.some((d) => d.includes('fromEmailId khác nhau'))).toBe(true);
  });

  it('runCompilerShadowCompare chạy an toàn, không ném lỗi khi intent khuyết', () => {
    const resIncomplete = runCompilerShadowCompare({
      legacyScript: { nodes: [], connections: [] },
      gateState: {},
    });
    expect(resIncomplete.executed).toBe(false);
    expect(resIncomplete.reason).toContain('chưa đủ điều kiện compile');
  });

  it('runCompilerShadowCompare chạy thành công với email-once hợp lệ', () => {
    const legacyScript = {
      nodes: [
        { tempId: 'trigger_1', node_subtype: 'manual', config: {} },
        { tempId: 'read_sheet_1', node_subtype: 'read_sheet', config: { sheetUrl: 'https://sheet.link' } },
        {
          tempId: 'send_email_1',
          node_subtype: 'send_email',
          config: { fromEmailId: 7, recipientSource: 'node' },
        },
      ],
      connections: [
        { sourceNodeId: 'trigger_1', targetNodeId: 'read_sheet_1' },
        { sourceNodeId: 'read_sheet_1', targetNodeId: 'send_email_1' },
      ],
    };

    const gateState = {
      channel: 'email',
      senderAccountId: 7,
      dataSource: 'sheet',
      sheetUrl: 'https://sheet.link',
      schedule: { mode: 'once' },
    };

    const res = runCompilerShadowCompare({
      legacyScript,
      gateState,
    });

    expect(res.executed).toBe(true);
    expect(res.match).toBe(true);
  });

  it('runCompilerShadowCompare chạy thành công với Zalo cá nhân bạn bè', () => {
    const legacyScript = {
      nodes: [
        { tempId: 'trigger_1', node_subtype: 'manual', config: {} },
        { tempId: 'select_zalo_1', node_subtype: 'select_zalo_account', config: { zaloAccountId: 12 } },
        { tempId: 'friends_1', node_subtype: 'get_all_friends', config: {} },
        {
          tempId: 'send_zalo_1',
          node_subtype: 'send_zalo_personal',
          config: { zaloAccountId: 12, zaloRecipientSource: 'node' },
        },
      ],
      connections: [
        { sourceNodeId: 'trigger_1', targetNodeId: 'select_zalo_1' },
        { sourceNodeId: 'select_zalo_1', targetNodeId: 'friends_1' },
        { sourceNodeId: 'friends_1', targetNodeId: 'send_zalo_1' },
      ],
    };

    const gateState = {
      channel: 'zalo',
      senderAccountId: 12,
      dataSource: 'zalo_friends',
      zaloFriendIds: ['f1', 'f2'],
      schedule: { mode: 'once' },
    };

    const res = runCompilerShadowCompare({
      legacyScript,
      gateState,
    });

    expect(res.executed).toBe(true);
    expect(res.match).toBe(true);
  });
});
