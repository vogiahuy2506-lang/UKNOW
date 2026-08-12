import { describe, expect, it } from '@jest/globals';
import aiCampaignDraftService from '../aiCampaignDraft.service.js';

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
});
