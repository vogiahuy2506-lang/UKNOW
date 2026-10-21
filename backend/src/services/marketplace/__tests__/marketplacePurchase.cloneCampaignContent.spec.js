/**
 * Marketplace chiến dịch kèm mẫu — MUA (`_cloneCampaign`): config khối của người mua phải (1) hết dữ liệu gắn người bán, (2) trỏ id mẫu
 * BẢN SAO của người mua, ở CẢ `campaign_nodes.config` LẪN `flow_json` (trình dựng mở sơ đồ từ flow_json). Tham chiếu giữa các khối
 * vẫn được đổi sau khi gỡ/đổi. Mock ranh giới đúng hình dạng thật (id BIGSERIAL dạng chuỗi).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockClient = { query: mockQuery, release: jest.fn() };
const mockMaterialize = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { getClient: jest.fn().mockResolvedValue(mockClient), query: jest.fn().mockResolvedValue({ rows: [] }) },
}));
jest.unstable_mockModule('../../../repositories/marketplace/marketplaceListing.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../repositories/marketplace/marketplacePurchase.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../payment/usageTracking.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../ai/aiCreditMeter.service.js', () => ({ default: {}, AI_CREDIT_RESOURCE: 'ai_credit' }));
jest.unstable_mockModule('../../../utils/userResourceLimit.util.js', () => ({
  checkUserResourceLimit: jest.fn(),
  enforceResourceLimitTx: jest.fn(),
}));
jest.unstable_mockModule('../../ai/chatbotSlot.service.js', () => ({ assertChatbotSlotAvailable: jest.fn() }));
jest.unstable_mockModule('../../../repositories/ai/chatbotClone.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../marketplaceCampaignContent.service.js', () => ({
  default: {
    materializeTemplates: mockMaterialize,
    prepareForPurchase: jest.fn(),
    discardCopiedFiles: jest.fn(),
  },
}));

const { default: marketplacePurchaseService } = await import('../marketplacePurchase.service.js');
const { createTemplateIdMaps } = await import('../../../utils/campaignTemplateReference.util.js');

const snapshotNode = (id, subtype, config) => ({
  id, nodeType: subtype.includes('trigger') ? 'trigger' : 'action', nodeSubtype: subtype, nodeName: subtype, config,
});

describe('marketplacePurchase._cloneCampaign — dữ liệu người bán + id mẫu', () => {
  let insertedNodeIds;
  let campaignInsert;
  let nodeInserts;
  let nodeUpdates;

  beforeEach(() => {
    jest.clearAllMocks();
    insertedNodeIds = ['510', '511', '512', '513'];
    campaignInsert = null;
    nodeInserts = [];
    nodeUpdates = [];
    mockQuery.mockImplementation(async (sql, params) => {
      const text = String(sql);
      if (/INSERT INTO campaigns/.test(text)) {
        campaignInsert = { name: params[1], flowJson: JSON.parse(params[4]) };
        return { rows: [{ id: '900' }] };
      }
      if (/INSERT INTO campaign_nodes/.test(text)) {
        nodeInserts.push({ subtype: params[2], config: params[7] ? JSON.parse(params[7]) : null });
        return { rows: [{ id: insertedNodeIds.shift() }] };
      }
      if (/UPDATE campaign_nodes SET config/.test(text)) {
        nodeUpdates.push({ config: JSON.parse(params[0]), nodeId: params[1] });
        return { rows: [] };
      }
      if (/INSERT INTO campaign_connections/.test(text)) return { rows: [] };
      throw new Error(`unexpected sql: ${text}`);
    });
    mockMaterialize.mockResolvedValue({
      maps: (() => {
        const maps = createTemplateIdMaps();
        maps.zalo.set('31', '6001');
        maps.email.set('11', '5001');
        return maps;
      })(),
      templateCount: 2,
      fileCount: 0,
    });
  });

  const sellerSnapshot = () => ({
    campaignName: 'Ban mau',
    campaignType: 'zalo_group',
    flowJson: {
      nodes: [
        { id: 'a', type: 'task', data: { nodeType: 'select_zalo_account', label: 'Chon nick', config: { zaloAccountId: 3 } } },
        {
          id: 'b', type: 'task',
          data: { nodeType: 'send_zalo_group', label: 'Gui nhom', config: { zaloAccountId: 3, zaloGroupIds: 'g1,g2', zaloGroupTemplateSteps: [{ templateId: 31 }] } },
        },
        { id: 'c', type: 'task', data: { nodeType: 'send_email', label: 'Gui mail', config: { fromEmailId: 2, emailSteps: [{ templateId: '11' }] } } },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
    },
    nodes: [
      snapshotNode(10, 'manual_trigger', {}),
      snapshotNode(11, 'select_zalo_account', { zaloAccountId: 3, zaloPoolAccountIds: ['3', '4'] }),
      snapshotNode(12, 'send_zalo_group', {
        zaloAccountId: 3, zaloGroupSource: 'node', zaloGroupNodeId: '11', zaloGroupIds: 'g1,g2', zaloGroupTemplateSteps: [{ templateId: 31 }],
      }),
      snapshotNode(13, 'send_email', { fromEmailId: 2, recipientEmails: ['a@x.vn'], emailSteps: [{ templateId: '11' }], emailTemplateId: 77 }),
    ],
    connections: [{ sourceNodeId: 10, targetNodeId: 11 }, { sourceNodeId: 11, targetNodeId: 12 }],
  });

  it('nhận bản đồ id mẫu từ bước chép mẫu rồi đổi id trong config mọi khối (gồm id trỏ khối vẫn đổi)', async () => {
    const prepared = { totalBytes: 0, sources: {} };
    const copiedKeys = [];
    await marketplacePurchaseService._cloneCampaign(mockClient, 5, { description: 'd', snapshot_data: sellerSnapshot() }, prepared, copiedKeys);

    expect(mockMaterialize).toHaveBeenCalledWith(mockClient, { buyerId: 5, prepared, copiedKeys });
    const byType = Object.fromEntries(nodeInserts.map((n) => [n.subtype, n.config]));
    expect(byType.send_zalo_group.zaloGroupTemplateSteps).toEqual([{ templateId: 6001 }]);
    expect(byType.send_email.emailSteps).toEqual([{ templateId: '5001' }]);
    // emailTemplateId thừa 77 của người bán (không có trong bản đồ, engine không đọc) → null, không để lọt sang người mua
    expect(byType.send_email.emailTemplateId).toBeNull();
    // tham chiếu khối đổi sang id khối mới (511), không dính id người bán
    expect(nodeUpdates).toHaveLength(1);
    expect(nodeUpdates[0].nodeId).toBe('512');
    expect(nodeUpdates[0].config.zaloGroupNodeId).toBe('511');
    expect(nodeUpdates[0].config.zaloGroupTemplateSteps).toEqual([{ templateId: 6001 }]);
  });

  it('gỡ dữ liệu gắn người bán khỏi campaign_nodes.config: tài khoản gửi, danh sách pool, nhóm nhập tay, người nhận, tài khoản email', async () => {
    await marketplacePurchaseService._cloneCampaign(mockClient, 5, { snapshot_data: sellerSnapshot() }, { totalBytes: 0, sources: {} }, []);
    const byType = Object.fromEntries(nodeInserts.map((n) => [n.subtype, n.config]));
    expect('zaloAccountId' in byType.select_zalo_account).toBe(false);
    expect(byType.select_zalo_account.zaloPoolAccountIds).toEqual([]);
    expect('zaloAccountId' in byType.send_zalo_group).toBe(false);
    expect(byType.send_zalo_group.zaloGroupIds).toBe('');
    expect('fromEmailId' in byType.send_email).toBe(false);
    expect(byType.send_email.recipientEmails).toEqual([]);
    expect(JSON.stringify(nodeInserts)).not.toContain('"g1');
  });

  it('flow_json của chiến dịch mới cũng sạch dữ liệu người bán và trỏ id mẫu mới (id khối + cạnh giữ nguyên)', async () => {
    await marketplacePurchaseService._cloneCampaign(mockClient, 5, { snapshot_data: sellerSnapshot() }, { totalBytes: 0, sources: {} }, []);
    const flow = campaignInsert.flowJson;
    const cfg = (id) => flow.nodes.find((n) => n.id === id).data.config;
    expect('zaloAccountId' in cfg('a')).toBe(false);
    expect('zaloAccountId' in cfg('b')).toBe(false);
    expect(cfg('b').zaloGroupIds).toBe('');
    expect(cfg('b').zaloGroupTemplateSteps).toEqual([{ templateId: 6001 }]);
    expect('fromEmailId' in cfg('c')).toBe(false);
    expect(cfg('c').emailSteps).toEqual([{ templateId: '5001' }]);
    expect(flow.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(flow.edges).toEqual([{ id: 'e1', source: 'a', target: 'b' }]);
    expect(JSON.stringify(flow)).not.toMatch(/"templateId":(31|"11")/);
  });

  it('không có nội dung mẫu chuẩn bị (null): vẫn gỡ dữ liệu người bán; ô mẫu bắt buộc giữ nguyên (fail-closed), ô thừa → null', async () => {
    await marketplacePurchaseService._cloneCampaign(mockClient, 5, { snapshot_data: sellerSnapshot() });
    expect(mockMaterialize).not.toHaveBeenCalled();
    const byType = Object.fromEntries(nodeInserts.map((n) => [n.subtype, n.config]));
    expect('zaloAccountId' in byType.send_zalo_group).toBe(false);
    expect(byType.send_zalo_group.zaloGroupTemplateSteps).toEqual([{ templateId: 31 }]);
    expect(byType.send_email.emailTemplateId).toBeNull();
  });

  it('listing không có flowJson → flow_json mặc định rỗng như trước', async () => {
    const snapshot = sellerSnapshot();
    delete snapshot.flowJson;
    await marketplacePurchaseService._cloneCampaign(mockClient, 5, { snapshot_data: snapshot }, null, []);
    expect(campaignInsert.flowJson).toEqual({ nodes: [], connections: [] });
  });
});
