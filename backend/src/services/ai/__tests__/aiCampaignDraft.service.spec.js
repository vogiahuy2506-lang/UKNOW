import { describe, expect, it, jest } from '@jest/globals';
import aiCampaignDraftService from '../aiCampaignDraft.service.js';
import campaignNodeRegistryService from '../../campaign/campaignNodeRegistry.service.js';

describe('aiCampaignDraftService.canonicalizeScript', () => {
  it('is idempotent and normalizes legacy Zalo account references by subtype', () => {
    const draft = {
      nodes: [
        { nodeType: 'action', nodeSubtype: 'select_zalo_account', config: {} },
        { tempId: 'groups', nodeType: 'data', nodeSubtype: 'get_all_groups', config: { zaloAccountNodeId: 'ai-node-1' } },
      ],
      connections: [{ source: 'ai-node-1', target: 'groups' }],
    };
    const once = aiCampaignDraftService.canonicalizeScript(draft);
    const twice = aiCampaignDraftService.canonicalizeScript(once);

    expect(twice).toEqual(once);
    expect(once.nodes[1].config).toMatchObject({ zaloGroupAccountNodeId: 'ai-node-1' });
    expect(once.nodes[1].config.zaloAccountNodeId).toBeUndefined();
  });

  it('rejects duplicate node ids and dangling graph references', () => {
    expect(() => aiCampaignDraftService.canonicalizeScript({
      nodes: [{ id: 'same' }, { tempId: 'same' }], connections: [],
    })).toThrow('Node ID bị trùng');
    expect(() => aiCampaignDraftService.canonicalizeScript({
      nodes: [{ id: 'one' }], connections: [{ source: 'one', target: 'missing' }],
    })).toThrow('Kết nối đang trỏ');
  });

  /**
   * Hồi quy: canonicalize đổi tên zaloAccountNodeId -> zalo{Group,Friend}AccountNodeId rồi XOÁ tên cũ,
   * nhưng registry vẫn require tên cũ nên createCampaignFromDraft chặn mọi campaign Zalo nhóm do AI tạo
   * ("Trường zaloAccountNodeId là bắt buộc"). Bất biến: output của canonicalize PHẢI qua được validate.
   */
  it.each([
    ['get_all_groups', 'zaloGroupAccountNodeId'],
    ['get_all_friends', 'zaloFriendAccountNodeId'],
  ])('canonicalize output passes registry validation for %s', (subtype, expectedField) => {
    const canonical = aiCampaignDraftService.canonicalizeScript({
      nodes: [
        { tempId: 'acc', nodeType: 'action', nodeSubtype: 'select_zalo_account', config: { zaloAccountId: 7 } },
        { tempId: 'list', nodeType: 'data', nodeSubtype: subtype, config: { zaloAccountNodeId: 'acc' } },
      ],
      connections: [{ source: 'acc', target: 'list' }],
    });

    const listNode = canonical.nodes.find((n) => (n.nodeSubtype || n.node_subtype) === subtype);
    expect(listNode.config[expectedField]).toBeTruthy();

    const validation = campaignNodeRegistryService.validateNodeConfig(subtype, listNode.config);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });
});

describe('aiCampaignDraftService.autoCreateZaloTemplates', () => {
  it('creates Zalo templates for send_zalo_group and send_zalo_personal multi-step nodes', async () => {
    let templateCounter = 100;
    const created = [];

    const mockRepo = (await import('../../../repositories/ai/aiCampaignDraft.repository.js')).default;
    const spy = jest.spyOn(mockRepo, 'createZaloTemplate').mockImplementation(async (payload) => {
      templateCounter += 1;
      created.push({ id: templateCounter, ...payload });
      return { id: templateCounter };
    });

    const nodes = [
      {
        nodeType: 'action',
        nodeSubtype: 'send_zalo_group',
        nodeName: 'Zalo Nhóm Sale',
        config: {
          zaloGroupTemplateSteps: [
            { message: 'Tin 1 chào nhóm', delayValue: 0, delayUnit: 'days' },
            { message: 'Tin 2 ưu đãi', delayValue: 1, delayUnit: 'days' },
          ],
        },
      },
      {
        nodeType: 'action',
        nodeSubtype: 'send_zalo_personal',
        nodeName: 'Zalo Cá Nhân',
        config: {
          zaloPersonalTemplateSteps: [
            { message: 'Tin cá nhân 1', delayValue: 0, delayUnit: 'days' },
          ],
        },
      },
    ];

    const createdTemplates = { emailTemplateIds: [], zaloTemplateIds: [] };
    await aiCampaignDraftService.autoCreateZaloTemplates(nodes, 42, createdTemplates);

    expect(nodes[0].config.zaloGroupTemplateSteps[0].templateId).toBe(101);
    expect(nodes[0].config.zaloGroupTemplateSteps[1].templateId).toBe(102);
    expect(nodes[1].config.zaloPersonalTemplateSteps[0].templateId).toBe(103);
    expect(created.length).toBe(3);
    expect(created[0].userId).toBe(42);
    expect(created[0].bodyText).toBe('Tin 1 chào nhóm');
    expect(createdTemplates.zaloTemplateIds).toEqual([101, 102, 103]);

    // Idempotent: calling again should not create new templates
    await aiCampaignDraftService.autoCreateZaloTemplates(nodes, 42);
    expect(created.length).toBe(3);

    spy.mockRestore();
  });

  it('cleans up only tracked templates owned by the requesting user', async () => {
    const mockRepo = (await import('../../../repositories/ai/aiCampaignDraft.repository.js')).default;
    const deleteEmailSpy = jest.spyOn(mockRepo, 'deleteEmailTemplatesByIds').mockResolvedValue([{ id: 11 }]);
    const deleteZaloSpy = jest.spyOn(mockRepo, 'deleteZaloTemplatesByIds').mockResolvedValue([{ id: 22 }]);

    await aiCampaignDraftService.cleanupAutoCreatedTemplates({
      emailTemplateIds: [11],
      zaloTemplateIds: [22],
    }, 42);

    expect(deleteEmailSpy).toHaveBeenCalledWith({ userId: 42, ids: [11] });
    expect(deleteZaloSpy).toHaveBeenCalledWith({ userId: 42, ids: [22] });

    deleteEmailSpy.mockRestore();
    deleteZaloSpy.mockRestore();
  });

  it('handles single inline message on node without multi-step array', async () => {
    const mockRepo = (await import('../../../repositories/ai/aiCampaignDraft.repository.js')).default;
    const spy = jest.spyOn(mockRepo, 'createZaloTemplate').mockResolvedValue({ id: 999 });

    const nodes = [
      {
        nodeType: 'action',
        nodeSubtype: 'send_zalo_group',
        nodeName: 'Zalo Nhóm Đơn',
        config: {
          zaloGroupMessage: 'Tin nhắn đơn lẻ inline',
        },
      },
    ];

    await aiCampaignDraftService.autoCreateZaloTemplates(nodes, 10);

    expect(nodes[0].config.zaloGroupTemplateSteps).toBeDefined();
    expect(nodes[0].config.zaloGroupTemplateSteps[0].templateId).toBe(999);
    expect(nodes[0].config.zaloGroupTemplateSteps[0].message).toBe('Tin nhắn đơn lẻ inline');

    spy.mockRestore();
  });

  it('throws error when createZaloTemplate fails to return an id', async () => {
    const mockRepo = (await import('../../../repositories/ai/aiCampaignDraft.repository.js')).default;
    const spy = jest.spyOn(mockRepo, 'createZaloTemplate').mockResolvedValue(null);

    const nodes = [
      {
        nodeType: 'action',
        nodeSubtype: 'send_zalo_group',
        config: {
          zaloGroupTemplateSteps: [{ message: 'Tin fail' }],
        },
      },
    ];

    await expect(aiCampaignDraftService.autoCreateZaloTemplates(nodes, 10))
      .rejects.toThrow('Không thể tạo Zalo template');

    spy.mockRestore();
  });
});

describe('aiCampaignDraftService.patchDeterministicZaloScript', () => {
  it('handles scenario 1: Zalo cá nhân from zalo_contacts missing select_zalo_account and with unwanted interested_customers', () => {
    const script = {
      nodes: [
        { id: 'n1', tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', config: {} },
        { id: 'n2', tempId: 'n2', nodeType: 'data', nodeSubtype: 'interested_customers', config: { interestedLimit: 1000 } },
        {
          id: 'n3',
          tempId: 'n3',
          nodeType: 'action',
          nodeSubtype: 'send_zalo_personal',
          config: {
            zaloRecipientSource: 'node',
            zaloRecipientNodeId: 'n2',
            message: 'Chào bạn',
          },
        },
        { id: 'n4', tempId: 'n4', nodeType: 'end', nodeSubtype: 'end', config: {} },
      ],
      connections: [
        { sourceNodeId: 'n1', targetNodeId: 'n2' },
        { sourceNodeId: 'n2', targetNodeId: 'n3' },
        { sourceNodeId: 'n3', targetNodeId: 'n4' },
      ],
    };

    const patched = aiCampaignDraftService.patchDeterministicZaloScript(script, {
      senderAccountId: 99,
      dataSource: 'zalo_contacts',
      zaloFriendIds: ['friend_1'],
    });

    // 1. interested_customers (n2) must be removed
    expect(patched.nodes.find((n) => n.id === 'n2')).toBeUndefined();

    // 2. select_zalo_account must be inserted
    const selectNode = patched.nodes.find((n) => (n.nodeSubtype || n.node_subtype) === 'select_zalo_account');
    expect(selectNode).toBeDefined();
    expect(selectNode.config.zaloAccountId).toBe(99);

    // 3. send_zalo_personal must have zaloAccountId = 99 and manual source
    const sendNode = patched.nodes.find((n) => (n.nodeSubtype || n.node_subtype) === 'send_zalo_personal');
    expect(sendNode.config.zaloAccountId).toBe(99);
    expect(sendNode.config.zaloRecipientSource).toBe('manual');
    expect(sendNode.config.zaloRecipientNodeId).toBeUndefined();

    // 4. Graph connections must be trigger -> select_zalo_account -> send_zalo_personal -> end
    expect(patched.connections.length).toBe(3);
    expect(patched.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceNodeId: 'n1', targetNodeId: selectNode.id }),
      expect.objectContaining({ sourceNodeId: selectNode.id, targetNodeId: 'n3' }),
      expect.objectContaining({ sourceNodeId: 'n3', targetNodeId: 'n4' }),
    ]));
  });

  it('handles scenario 2: Zalo cá nhân from DB keeps interested_customers and inserts select_zalo_account', () => {
    const script = {
      nodes: [
        { id: 'n1', tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', config: {} },
        { id: 'n2', tempId: 'n2', nodeType: 'data', nodeSubtype: 'interested_customers', config: { interestedLimit: 1000 } },
        { id: 'n3', tempId: 'n3', nodeType: 'action', nodeSubtype: 'send_zalo_personal', config: { message: 'Chào khách hàng' } },
        { id: 'n4', tempId: 'n4', nodeType: 'end', nodeSubtype: 'end', config: {} },
      ],
      connections: [
        { sourceNodeId: 'n1', targetNodeId: 'n2' },
        { sourceNodeId: 'n2', targetNodeId: 'n3' },
        { sourceNodeId: 'n3', targetNodeId: 'n4' },
      ],
    };

    const patched = aiCampaignDraftService.patchDeterministicZaloScript(script, {
      senderAccountId: 42,
      dataSource: 'db',
    });

    // interested_customers is kept
    expect(patched.nodes.find((n) => n.id === 'n2')).toBeDefined();

    // select_zalo_account inserted after trigger
    const selectNode = patched.nodes.find((n) => (n.nodeSubtype || n.node_subtype) === 'select_zalo_account');
    expect(selectNode).toBeDefined();
    expect(selectNode.config.zaloAccountId).toBe(42);

    // Connections: n1 -> selectNode -> n2 -> n3 -> n4
    expect(patched.connections.length).toBe(4);
    expect(patched.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceNodeId: 'n1', targetNodeId: selectNode.id }),
      expect.objectContaining({ sourceNodeId: selectNode.id, targetNodeId: 'n2' }),
      expect.objectContaining({ sourceNodeId: 'n2', targetNodeId: 'n3' }),
      expect.objectContaining({ sourceNodeId: 'n3', targetNodeId: 'n4' }),
    ]));
  });

  it('handles scenario 3: updates existing select_zalo_account when zaloAccountId is empty or specified', () => {
    const script = {
      nodes: [
        { id: 'n1', tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', config: {} },
        { id: 'n2', tempId: 'n2', nodeType: 'data', nodeSubtype: 'select_zalo_account', config: { zaloAccountId: null } },
        { id: 'n3', tempId: 'n3', nodeType: 'data', nodeSubtype: 'get_all_groups', config: { zaloGroupAccountNodeId: 'n2' } },
        { id: 'n4', tempId: 'n4', nodeType: 'action', nodeSubtype: 'send_zalo_group', config: { zaloGroupNodeId: 'n3' } },
        { id: 'n5', tempId: 'n5', nodeType: 'end', nodeSubtype: 'end', config: {} },
      ],
      connections: [
        { sourceNodeId: 'n1', targetNodeId: 'n2' },
        { sourceNodeId: 'n2', targetNodeId: 'n3' },
        { sourceNodeId: 'n3', targetNodeId: 'n4' },
        { sourceNodeId: 'n4', targetNodeId: 'n5' },
      ],
    };

    const patched = aiCampaignDraftService.patchDeterministicZaloScript(script, {
      senderAccountId: 88,
      dataSource: 'db',
    });

    const selectNodes = patched.nodes.filter((n) => (n.nodeSubtype || n.node_subtype) === 'select_zalo_account');
    expect(selectNodes.length).toBe(1);
    expect(selectNodes[0].config.zaloAccountId).toBe(88);

    const sendGroupNode = patched.nodes.find((n) => (n.nodeSubtype || n.node_subtype) === 'send_zalo_group');
    expect(sendGroupNode.config.zaloAccountId).toBe(88);
  });

  it('handles scenario 4: does not inject select_zalo_account into email campaign', () => {
    const script = {
      nodes: [
        { id: 'n1', tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', config: {} },
        { id: 'n2', tempId: 'n2', nodeType: 'data', nodeSubtype: 'interested_customers', config: {} },
        { id: 'n3', tempId: 'n3', nodeType: 'action', nodeSubtype: 'send_email', config: { recipientNodeId: 'n2' } },
        { id: 'n4', tempId: 'n4', nodeType: 'end', nodeSubtype: 'end', config: {} },
      ],
      connections: [
        { sourceNodeId: 'n1', targetNodeId: 'n2' },
        { sourceNodeId: 'n2', targetNodeId: 'n3' },
        { sourceNodeId: 'n3', targetNodeId: 'n4' },
      ],
    };

    const patched = aiCampaignDraftService.patchDeterministicCampaignScript(script, {
      senderAccountId: 10,
      dataSource: 'db',
    });

    expect(patched.nodes.length).toBe(4);
    expect(patched.nodes.find((n) => (n.nodeSubtype || n.node_subtype) === 'select_zalo_account')).toBeUndefined();
    expect(patched.nodes.find((n) => n.id === 'n2')).toBeDefined();
    // Email senderId is populated
    expect(patched.nodes.find((n) => n.id === 'n3').config.fromEmailId).toBe(10);
  });

  it('handles scenario 5: patches sheetUrl and inserts read_sheet node when missing', () => {
    const testSheetUrl = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit';
    const script = {
      nodes: [
        { id: 'n1', tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', config: {} },
        { id: 'n2', tempId: 'n2', nodeType: 'action', nodeSubtype: 'send_email', config: { emailSubject: 'Test' } },
        { id: 'n3', tempId: 'n3', nodeType: 'end', nodeSubtype: 'end', config: {} },
      ],
      connections: [
        { sourceNodeId: 'n1', targetNodeId: 'n2' },
        { sourceNodeId: 'n2', targetNodeId: 'n3' },
      ],
    };

    const patched = aiCampaignDraftService.patchDeterministicCampaignScript(script, {
      dataSource: 'sheet',
      sheetUrl: testSheetUrl,
      senderAccountId: 7,
    });

    const sheetNode = patched.nodes.find((n) => (n.nodeSubtype || n.node_subtype) === 'read_sheet');
    expect(sheetNode).toBeDefined();
    expect(sheetNode.config.sheetUrl).toBe(testSheetUrl);

    const emailNode = patched.nodes.find((n) => (n.nodeSubtype || n.node_subtype) === 'send_email');
    expect(emailNode.config.recipientNodeId).toBe(sheetNode.id);
    expect(emailNode.config.fromEmailId).toBe(7);

    // Graph wired: n1 -> sheetNode -> n2 -> n3
    expect(patched.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceNodeId: 'n1', targetNodeId: sheetNode.id }),
      expect.objectContaining({ sourceNodeId: sheetNode.id, targetNodeId: 'n2' }),
      expect.objectContaining({ sourceNodeId: 'n2', targetNodeId: 'n3' }),
    ]));
  });

  it('handles scenario 6: patches zaloGroupIds into send_zalo_group and get_all_groups', () => {
    const script = {
      nodes: [
        { id: 'n1', tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', config: {} },
        { id: 'n2', tempId: 'n2', nodeType: 'data', nodeSubtype: 'select_zalo_account', config: { zaloAccountId: 5 } },
        { id: 'n3', tempId: 'n3', nodeType: 'data', nodeSubtype: 'get_all_groups', config: {} },
        { id: 'n4', tempId: 'n4', nodeType: 'action', nodeSubtype: 'send_zalo_group', config: {} },
        { id: 'n5', tempId: 'n5', nodeType: 'end', nodeSubtype: 'end', config: {} },
      ],
      connections: [
        { sourceNodeId: 'n1', targetNodeId: 'n2' },
        { sourceNodeId: 'n2', targetNodeId: 'n3' },
        { sourceNodeId: 'n3', targetNodeId: 'n4' },
        { sourceNodeId: 'n4', targetNodeId: 'n5' },
      ],
    };

    const patched = aiCampaignDraftService.patchDeterministicCampaignScript(script, {
      zaloGroupIds: ['grp_123', 'grp_456'],
      senderAccountId: 5,
    });

    const groupDataNode = patched.nodes.find((n) => (n.nodeSubtype || n.node_subtype) === 'get_all_groups');
    const groupActionNode = patched.nodes.find((n) => (n.nodeSubtype || n.node_subtype) === 'send_zalo_group');

    expect(groupDataNode.config.zaloGroupIds).toEqual(['grp_123', 'grp_456']);
    expect(groupActionNode.config.zaloGroupIds).toEqual(['grp_123', 'grp_456']);
  });

  it('handles scenario 7: patches landingLeadsSlugs into read_landing_leads', () => {
    const script = {
      nodes: [
        { id: 'n1', tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', config: {} },
        { id: 'n2', tempId: 'n2', nodeType: 'data', nodeSubtype: 'read_landing_leads', config: {} },
        { id: 'n3', tempId: 'n3', nodeType: 'action', nodeSubtype: 'send_email', config: {} },
        { id: 'n4', tempId: 'n4', nodeType: 'end', nodeSubtype: 'end', config: {} },
      ],
      connections: [
        { sourceNodeId: 'n1', targetNodeId: 'n2' },
        { sourceNodeId: 'n2', targetNodeId: 'n3' },
        { sourceNodeId: 'n3', targetNodeId: 'n4' },
      ],
    };

    const patched = aiCampaignDraftService.patchDeterministicCampaignScript(script, {
      landingPageSlug: 'khoa-hoc-ielts-2026',
    });

    const landingNode = patched.nodes.find((n) => (n.nodeSubtype || n.node_subtype) === 'read_landing_leads');
    expect(landingNode.config.landingLeadsSlugs).toEqual(['khoa-hoc-ielts-2026']);
  });

  it('handles scenario 8: enforces zaloGroupSendMode="schedule" for Zalo group drip campaigns', () => {
    const script = {
      nodes: [
        { id: 'n1', tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', config: {} },
        { id: 'n2', tempId: 'n2', nodeType: 'data', nodeSubtype: 'select_zalo_account', config: { zaloAccountId: 1 } },
        { id: 'n3', tempId: 'n3', nodeType: 'data', nodeSubtype: 'get_all_groups', config: {} },
        {
          id: 'n4',
          tempId: 'n4',
          nodeType: 'action',
          nodeSubtype: 'send_zalo_group',
          config: {
            zaloGroupTemplateSteps: [
              { message: 'Tin 1', delayValue: 0 },
              { message: 'Tin 2', delayValue: 1 },
              { message: 'Tin 3', delayValue: 2 },
            ],
          },
        },
        { id: 'n5', tempId: 'n5', nodeType: 'end', nodeSubtype: 'end', config: {} },
      ],
      connections: [
        { sourceNodeId: 'n1', targetNodeId: 'n2' },
        { sourceNodeId: 'n2', targetNodeId: 'n3' },
        { sourceNodeId: 'n3', targetNodeId: 'n4' },
        { sourceNodeId: 'n4', targetNodeId: 'n5' },
      ],
    };

    const patched = aiCampaignDraftService.patchDeterministicCampaignScript(script, {
      schedule: { mode: 'drip', days: 3, slotsPerDay: 1 },
      senderAccountId: 1,
    });

    const groupNode = patched.nodes.find((n) => (n.nodeSubtype || n.node_subtype) === 'send_zalo_group');
    expect(groupNode.config.zaloGroupSendMode).toBe('schedule');
  });

  it('handles scenario 9: enforces zaloPersonalSendMode="schedule" for Zalo personal drip campaigns', () => {
    const script = {
      nodes: [
        { id: 'n1', tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', config: {} },
        { id: 'n2', tempId: 'n2', nodeType: 'data', nodeSubtype: 'select_zalo_account', config: { zaloAccountId: 2 } },
        {
          id: 'n3',
          tempId: 'n3',
          nodeType: 'action',
          nodeSubtype: 'send_zalo_personal',
          config: {
            zaloPersonalTemplateSteps: [
              { message: 'Chào bạn 1', delayValue: 0 },
              { message: 'Chào bạn 2', delayValue: 1 },
            ],
          },
        },
        { id: 'n4', tempId: 'n4', nodeType: 'end', nodeSubtype: 'end', config: {} },
      ],
      connections: [
        { sourceNodeId: 'n1', targetNodeId: 'n2' },
        { sourceNodeId: 'n2', targetNodeId: 'n3' },
        { sourceNodeId: 'n3', targetNodeId: 'n4' },
      ],
    };

    const patched = aiCampaignDraftService.patchDeterministicCampaignScript(script, {
      schedule: { mode: 'drip', days: 2 },
      senderAccountId: 2,
    });

    const personalNode = patched.nodes.find((n) => (n.nodeSubtype || n.node_subtype) === 'send_zalo_personal');
    expect(personalNode.config.zaloPersonalSendMode).toBe('schedule');
  });

  it('handles scenario 10: enforces sendMode="schedule" for email drip campaigns and "all" for once campaigns', () => {
    const dripScript = {
      nodes: [
        { id: 'n1', tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', config: {} },
        { id: 'n2', tempId: 'n2', nodeType: 'action', nodeSubtype: 'send_email', config: { emailSubject: 'Drip email', delayValue: 1 } },
        { id: 'n3', tempId: 'n3', nodeType: 'end', nodeSubtype: 'end', config: {} },
      ],
      connections: [
        { sourceNodeId: 'n1', targetNodeId: 'n2' },
        { sourceNodeId: 'n2', targetNodeId: 'n3' },
      ],
    };

    const patchedDrip = aiCampaignDraftService.patchDeterministicCampaignScript(dripScript, {
      schedule: { mode: 'drip', days: 2 },
    });
    expect(patchedDrip.nodes.find((n) => n.id === 'n2').config.sendMode).toBe('schedule');

    const onceScript = {
      nodes: [
        { id: 'n1', tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', config: {} },
        { id: 'n2', tempId: 'n2', nodeType: 'action', nodeSubtype: 'send_email', config: { emailSubject: 'Once email' } },
        { id: 'n3', tempId: 'n3', nodeType: 'end', nodeSubtype: 'end', config: {} },
      ],
      connections: [
        { sourceNodeId: 'n1', targetNodeId: 'n2' },
        { sourceNodeId: 'n2', targetNodeId: 'n3' },
      ],
    };

    const patchedOnce = aiCampaignDraftService.patchDeterministicCampaignScript(onceScript, {
      schedule: { mode: 'once' },
    });
    expect(patchedOnce.nodes.find((n) => n.id === 'n2').config.sendMode).toBe('all');
  });
});
