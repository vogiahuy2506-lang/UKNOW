import { describe, expect, it } from '@jest/globals';
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
