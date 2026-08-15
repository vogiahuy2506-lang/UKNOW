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

    await aiCampaignDraftService.autoCreateZaloTemplates(nodes, 42);

    expect(nodes[0].config.zaloGroupTemplateSteps[0].templateId).toBe(101);
    expect(nodes[0].config.zaloGroupTemplateSteps[1].templateId).toBe(102);
    expect(nodes[1].config.zaloPersonalTemplateSteps[0].templateId).toBe(103);
    expect(created.length).toBe(3);
    expect(created[0].userId).toBe(42);
    expect(created[0].bodyText).toBe('Tin 1 chào nhóm');

    // Idempotent: calling again should not create new templates
    await aiCampaignDraftService.autoCreateZaloTemplates(nodes, 42);
    expect(created.length).toBe(3);

    spy.mockRestore();
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

