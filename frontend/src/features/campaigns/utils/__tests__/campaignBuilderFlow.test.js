import { describe, it, expect } from 'vitest';
import {
  getAllowedActionNodeTypesByCampaignType,
  getAllowedDataNodeTypesByCampaignType,
  isTriggerNodeType,
  campaignFlowHasZaloPoolMulti,
} from '../campaignBuilderFlow';

describe('getAllowedActionNodeTypesByCampaignType', () => {
  it("email → chỉ send_email", () => {
    const set = getAllowedActionNodeTypesByCampaignType('email');
    expect([...set]).toEqual(['send_email']);
  });

  it("zalo (cá nhân) — bao gồm legacy aliases zalo-individual/zalo_individual/zalo_personal", () => {
    for (const t of ['zalo', 'zalo_personal', 'zalo-individual', 'zalo_individual']) {
      const set = getAllowedActionNodeTypesByCampaignType(t);
      expect([...set].sort()).toEqual(['send_zalo_friend_request', 'send_zalo_personal']);
    }
  });

  it("zalo_group + alias group_zalo/zalo-group", () => {
    for (const t of ['zalo_group', 'group_zalo', 'zalo-group']) {
      const set = getAllowedActionNodeTypesByCampaignType(t);
      expect([...set]).toEqual(['send_zalo_group']);
    }
  });

  it('campaign type rỗng/unknown → union tất cả action types', () => {
    const set = getAllowedActionNodeTypesByCampaignType('');
    expect(set.has('send_email')).toBe(true);
    expect(set.has('send_zalo_personal')).toBe(true);
    expect(set.has('send_zalo_group')).toBe(true);
    expect(set.size).toBe(4);
  });
});

describe('getAllowedDataNodeTypesByCampaignType', () => {
  it("email — chỉ common data nodes", () => {
    const set = getAllowedDataNodeTypesByCampaignType('email');
    expect(set.has('read_sheet')).toBe(true);
    expect(set.has('read_courses_db')).toBe(true);
    expect(set.has('save_customer')).toBe(true);
    expect(set.has('select_zalo_account')).toBe(false);
  });

  it("zalo cá nhân — bao gồm select_zalo_account + get_all_friends", () => {
    const set = getAllowedDataNodeTypesByCampaignType('zalo');
    expect(set.has('select_zalo_account')).toBe(true);
    expect(set.has('get_all_friends')).toBe(true);
    expect(set.has('get_all_groups')).toBe(false);
  });

  it("zalo_group — common + select_zalo_account + get_all_groups (không có read_interested_customers)", () => {
    const set = getAllowedDataNodeTypesByCampaignType('zalo_group');
    expect(set.has('get_all_groups')).toBe(true);
    expect(set.has('select_zalo_account')).toBe(true);
    expect(set.has('read_sheet')).toBe(true);
    expect(set.has('read_interested_customers')).toBe(false);
    expect(set.has('get_all_friends')).toBe(false);
  });

  it('unknown campaign type → null (không giới hạn)', () => {
    expect(getAllowedDataNodeTypesByCampaignType('')).toBeNull();
    expect(getAllowedDataNodeTypesByCampaignType('unknown')).toBeNull();
  });
});

describe('isTriggerNodeType', () => {
  it("'manual_trigger', 'start', chứa 'trigger' → true", () => {
    expect(isTriggerNodeType('manual_trigger')).toBe(true);
    expect(isTriggerNodeType('start')).toBe(true);
    expect(isTriggerNodeType('zalo_trigger')).toBe(true);
    expect(isTriggerNodeType('trigger_run')).toBe(true);
  });

  it("không phải trigger → false", () => {
    expect(isTriggerNodeType('send_email')).toBe(false);
    expect(isTriggerNodeType('end')).toBe(false);
    expect(isTriggerNodeType('')).toBe(false);
    expect(isTriggerNodeType(undefined)).toBe(false);
  });
});

describe('campaignFlowHasZaloPoolMulti', () => {
  it('không phải mảng / rỗng → false', () => {
    expect(campaignFlowHasZaloPoolMulti()).toBe(false);
    expect(campaignFlowHasZaloPoolMulti(null)).toBe(false);
    expect(campaignFlowHasZaloPoolMulti([])).toBe(false);
  });

  it('không có node select_zalo_account → false', () => {
    const nodes = [{ data: { nodeType: 'send_email', config: { zaloPoolMultiAccountEnabled: true } } }];
    expect(campaignFlowHasZaloPoolMulti(nodes)).toBe(false);
  });

  it('zaloPoolMultiAccountEnabled=false → false', () => {
    const nodes = [
      {
        data: {
          nodeType: 'select_zalo_account',
          config: { zaloPoolMultiAccountEnabled: false, zaloPoolAccountIds: ['1'] },
        },
      },
    ];
    expect(campaignFlowHasZaloPoolMulti(nodes)).toBe(false);
  });

  it('pool bật nhưng không có id hợp lệ → false', () => {
    const nodes = [
      {
        data: {
          nodeType: 'select_zalo_account',
          config: { zaloPoolMultiAccountEnabled: true, zaloPoolAccountIds: ['', '  ', null] },
        },
      },
    ];
    expect(campaignFlowHasZaloPoolMulti(nodes)).toBe(false);
  });

  it('pool bật + có ít nhất 1 id non-empty → true', () => {
    const nodes = [
      {
        data: {
          nodeType: 'select_zalo_account',
          config: { zaloPoolMultiAccountEnabled: true, zaloPoolAccountIds: ['1', 'abc'] },
        },
      },
    ];
    expect(campaignFlowHasZaloPoolMulti(nodes)).toBe(true);
  });
});
