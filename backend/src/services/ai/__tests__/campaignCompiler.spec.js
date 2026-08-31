import { describe, expect, it } from '@jest/globals';
import crypto from 'crypto';
import campaignNodeRegistryService from '../../campaign/campaignNodeRegistry.service.js';
import { compileCampaign } from '../campaignCompiler.service.js';

describe('PR-2.1 & PR-3.1: campaignCompiler.service', () => {
  const sampleEmailSheetOnce = {
    version: 1,
    channel: 'email',
    sender: { type: 'email_account', id: 7 },
    audience: {
      type: 'sheet',
      url: 'https://docs.google.com/spreadsheets/d/123456789/edit',
      recipientKind: 'email',
    },
    schedule: { type: 'once' },
    contentBrief: { topic: 'Ra mắt tính năng', locale: 'vi' },
  };

  it('biên dịch thành công luồng email-once với Google Sheet (camelCase contract)', () => {
    const graph = compileCampaign(sampleEmailSheetOnce);
    expect(graph).toHaveProperty('nodes');
    expect(graph).toHaveProperty('connections');
    expect(graph).toHaveProperty('contentSlots');

    expect(graph.nodes.length).toBe(3);
    const [triggerNode, audienceNode, sendEmailNode] = graph.nodes;

    expect(triggerNode.nodeSubtype).toBe('manual');
    expect(triggerNode.nodeType).toBe('trigger');
    expect(audienceNode.nodeSubtype).toBe('read_sheet');
    expect(audienceNode.nodeType).toBe('data');
    expect(audienceNode.config.sheetUrl).toBe('https://docs.google.com/spreadsheets/d/123456789/edit');

    expect(sendEmailNode.nodeSubtype).toBe('send_email');
    expect(sendEmailNode.nodeType).toBe('action');
    expect(sendEmailNode.config.fromEmailId).toBe(7);
    expect(sendEmailNode.config.recipientSource).toBe('node');
    expect(sendEmailNode.config.recipientNodeId).toBe(audienceNode.id);
    expect(Array.isArray(sendEmailNode.config.emailSteps)).toBe(true);
    expect(sendEmailNode.config.emailSteps.length).toBe(1);

    expect(graph.connections.length).toBe(2);
    expect(graph.connections[0].sourceNodeId).toBe(triggerNode.id);
    expect(graph.connections[0].targetNodeId).toBe(audienceNode.id);
    expect(graph.connections[1].sourceNodeId).toBe(audienceNode.id);
    expect(graph.connections[1].targetNodeId).toBe(sendEmailNode.id);

    expect(graph.contentSlots.length).toBe(1);
    expect(graph.contentSlots[0].channel).toBe('email');
    expect(graph.contentSlots[0].brief.topic).toBe('Ra mắt tính năng');
  });

  it('biên dịch thành công luồng Zalo cá nhân gửi một lần (bạn bè zalo_contacts)', () => {
    const intentZaloPersonal = {
      version: 1,
      channel: 'zalo',
      sender: { type: 'zalo_account', id: 12 },
      audience: { type: 'zalo_contacts', recipientKind: 'phone' },
      schedule: { type: 'once' },
      contentBrief: { topic: 'Nhắc lịch hẹn', locale: 'vi' },
    };

    const graph = compileCampaign(intentZaloPersonal);
    expect(graph.nodes.length).toBe(4); // trigger -> select_zalo_account -> get_all_friends -> send_zalo_personal
    const [triggerNode, selectNode, audienceNode, sendZaloNode] = graph.nodes;

    expect(triggerNode.nodeSubtype).toBe('manual');
    expect(selectNode.nodeSubtype).toBe('select_zalo_account');
    expect(selectNode.config.zaloAccountId).toBe(12);

    expect(audienceNode.nodeSubtype).toBe('get_all_friends');
    expect(audienceNode.config.zaloFriendAccountNodeId).toBe(selectNode.id);

    expect(sendZaloNode.nodeSubtype).toBe('send_zalo_personal');
    expect(sendZaloNode.config.zaloAccountId).toBe(12);
    expect(sendZaloNode.config.zaloRecipientSource).toBe('node');
    expect(sendZaloNode.config.zaloRecipientType).toBe('uid');
    expect(Array.isArray(sendZaloNode.config.zaloPersonalTemplateSteps)).toBe(true);
    expect(sendZaloNode.config.zaloPersonalTemplateSteps.length).toBe(1);

    expect(graph.connections.length).toBe(3);
    expect(graph.connections[0].sourceNodeId).toBe(triggerNode.id);
    expect(graph.connections[0].targetNodeId).toBe(selectNode.id);
    expect(graph.connections[1].sourceNodeId).toBe(selectNode.id);
    expect(graph.connections[1].targetNodeId).toBe(audienceNode.id);
    expect(graph.connections[2].sourceNodeId).toBe(audienceNode.id);
    expect(graph.connections[2].targetNodeId).toBe(sendZaloNode.id);

    expect(graph.contentSlots[0].channel).toBe('zalo');
    expect(graph.contentSlots[0].type).toBe('zalo');
  });

  it('biên dịch thành công luồng Zalo cá nhân Drip 3 ngày', () => {
    const intentZaloDrip = {
      version: 1,
      channel: 'zalo',
      sender: { type: 'zalo_account', id: 5 },
      audience: { type: 'sheet', url: 'https://docs.google.com/spreadsheets/d/abc', recipientKind: 'phone' },
      schedule: { type: 'drip', days: 3, slotsPerDay: 1 },
      contentBrief: { topic: 'Chuỗi chăm sóc Zalo', locale: 'vi' },
    };

    const graph = compileCampaign(intentZaloDrip);
    const sendNode = graph.nodes.find((n) => n.nodeSubtype === 'send_zalo_personal');
    expect(sendNode).not.toBeUndefined();
    expect(sendNode.config.zaloPersonalSendMode).toBe('schedule');
    expect(sendNode.config.zaloPersonalTemplateSteps.length).toBe(3);
    expect(graph.contentSlots.length).toBe(3);
  });

  it('biên dịch thành công luồng Zalo nhóm gửi một lần và Drip', () => {
    const intentZaloGroup = {
      version: 1,
      channel: 'zalo_group',
      sender: { type: 'zalo_account', id: 8 },
      audience: { type: 'zalo_contacts', groupIds: ['g1', 'g2'], recipientKind: 'phone' },
      schedule: { type: 'once' },
      contentBrief: { topic: 'Thông báo nhóm', locale: 'vi' },
    };

    const graph = compileCampaign(intentZaloGroup);
    expect(graph.nodes.length).toBe(4); // trigger -> select_zalo_account -> get_all_groups -> send_zalo_group
    const sendGroupNode = graph.nodes.find((n) => n.nodeSubtype === 'send_zalo_group');
    expect(sendGroupNode).not.toBeUndefined();
    expect(sendGroupNode.config.zaloAccountId).toBe(8);
    expect(Array.isArray(sendGroupNode.config.zaloGroupTemplateSteps)).toBe(true);
    expect(sendGroupNode.config.zaloGroupTemplateSteps.length).toBe(1);
  });

  it('tên khoá của node do compiler sinh trùng đúng tham số của insertNodeTx và updateCampaign', () => {
    const testIntents = [
      sampleEmailSheetOnce,
      {
        version: 1,
        channel: 'zalo',
        sender: { type: 'zalo_account', id: 12 },
        audience: { type: 'zalo_contacts', recipientKind: 'phone' },
        schedule: { type: 'once' },
      },
      {
        version: 1,
        channel: 'zalo_group',
        sender: { type: 'zalo_account', id: 8 },
        audience: { type: 'zalo_contacts', groupIds: ['g1'], recipientKind: 'phone' },
        schedule: { type: 'drip', days: 2, slotsPerDay: 1 },
      },
    ];

    const requiredInsertNodeParams = [
      'nodeType',
      'nodeSubtype',
      'nodeName',
      'nodeDescription',
      'positionX',
      'positionY',
      'config',
    ];

    for (const intent of testIntents) {
      const graph = compileCampaign(intent);
      for (const node of graph.nodes) {
        expect(node).toHaveProperty('id');
        expect(node).toHaveProperty('tempId');

        for (const param of requiredInsertNodeParams) {
          expect(node).toHaveProperty(param);
          expect(node[param]).not.toBeUndefined();
        }

        expect(node).not.toHaveProperty('node_type');
        expect(node).not.toHaveProperty('node_subtype');
        expect(node).not.toHaveProperty('node_name');
        expect(node).not.toHaveProperty('node_description');
        expect(node).not.toHaveProperty('position_x');
        expect(node).not.toHaveProperty('position_y');
      }
    }
  });

  it('mọi node do compiler sinh ra (Email, Zalo, Zalo Group) đều pass validateNodeConfig của registry', () => {
    const testIntents = [
      sampleEmailSheetOnce,
      {
        version: 1,
        channel: 'zalo',
        sender: { type: 'zalo_account', id: 12 },
        audience: { type: 'zalo_contacts', recipientKind: 'phone' },
        schedule: { type: 'once' },
      },
      {
        version: 1,
        channel: 'zalo_group',
        sender: { type: 'zalo_account', id: 8 },
        audience: { type: 'zalo_contacts', groupIds: ['g1'], recipientKind: 'phone' },
        schedule: { type: 'once' },
      },
    ];

    for (const intent of testIntents) {
      const graph = compileCampaign(intent);
      for (const node of graph.nodes) {
        const validation = campaignNodeRegistryService.validateNodeConfig(
          node.nodeSubtype,
          node.config
        );
        expect(validation.valid).toBe(true);
        expect(validation.errors).toEqual([]);
      }
    }
  });

  it('tiêu chí 1: Cùng một intent chạy 100 lần sinh ra chính xác cùng một graph hash (tính tất định)', () => {
    const hashGraph = (g) =>
      crypto.createHash('sha256').update(JSON.stringify(g)).digest('hex');

    const firstHash = hashGraph(compileCampaign(sampleEmailSheetOnce));
    for (let i = 0; i < 100; i++) {
      const currentHash = hashGraph(compileCampaign(sampleEmailSheetOnce));
      expect(currentHash).toBe(firstHash);
    }
  });

  it('từ chối intent khuyết dữ liệu và ném danh sách missing fields', () => {
    const incomplete = {
      version: 1,
      channel: 'zalo',
      // thiếu sender, audience, schedule
    };

    expect(() => compileCampaign(incomplete)).toThrow(/Cannot compile incomplete intent/);
  });
});
