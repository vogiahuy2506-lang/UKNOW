import { describe, expect, it } from '@jest/globals';
import crypto from 'crypto';
import campaignNodeRegistryService from '../../campaign/campaignNodeRegistry.service.js';
import { compileCampaign } from '../campaignCompiler.service.js';

describe('PR-2.1: campaignCompiler.service', () => {
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

  it('tên khoá của node do compiler sinh trùng đúng tham số của insertNodeTx và updateCampaign', () => {
    const graph = compileCampaign(sampleEmailSheetOnce);
    const requiredInsertNodeParams = [
      'nodeType',
      'nodeSubtype',
      'nodeName',
      'nodeDescription',
      'positionX',
      'positionY',
      'config',
    ];

    for (const node of graph.nodes) {
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('tempId');

      for (const param of requiredInsertNodeParams) {
        expect(node).toHaveProperty(param);
        expect(node[param]).not.toBeUndefined();
      }

      // Khẳng định KHÔNG còn dùng snake_case cũ trên node object
      expect(node).not.toHaveProperty('node_type');
      expect(node).not.toHaveProperty('node_subtype');
      expect(node).not.toHaveProperty('node_name');
      expect(node).not.toHaveProperty('node_description');
      expect(node).not.toHaveProperty('position_x');
      expect(node).not.toHaveProperty('position_y');
    }
  });

  it('biên dịch thành công luồng email-once với Database', () => {
    const intent = {
      version: 1,
      channel: 'email',
      sender: { type: 'email_account', id: 3 },
      audience: { type: 'db', recipientKind: 'email' },
      schedule: { type: 'once' },
    };

    const graph = compileCampaign(intent);
    expect(graph.nodes.length).toBe(3);
    expect(graph.nodes[1].nodeSubtype).toBe('interested_customers');
    expect(graph.nodes[2].config.fromEmailId).toBe(3);
  });

  it('mọi node do compiler sinh ra đều pass validateNodeConfig của registry', () => {
    const graph = compileCampaign(sampleEmailSheetOnce);

    for (const node of graph.nodes) {
      const validation = campaignNodeRegistryService.validateNodeConfig(
        node.nodeSubtype,
        node.config
      );
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
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
      channel: 'email',
      // thiếu sender, audience, schedule
    };

    expect(() => compileCampaign(incomplete)).toThrow(/Cannot compile incomplete intent/);
  });
});
