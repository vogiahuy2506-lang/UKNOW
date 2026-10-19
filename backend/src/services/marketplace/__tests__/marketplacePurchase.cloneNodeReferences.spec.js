/**
 * PLAN_THAM_CHIEU_KHOI PR-1 Việc 1.3 — MUA marketplace (clone chiến dịch từ snapshot) phải đổi tham chiếu giữa các khối sang
 * id khối vừa tạo. Trước đây `config` chép nguyên văn → mỗi lượt mua sinh thêm một chiến dịch trỏ id khối của người bán.
 * Mock ranh giới đúng hình dạng thật: INSERT campaign_nodes ... RETURNING id trả id BIGSERIAL dạng CHUỖI.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockClient = { query: mockQuery, release: jest.fn() };

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

const { default: marketplacePurchaseService } = await import('../marketplacePurchase.service.js');

const snapshotNode = (id, subtype, config) => ({
  id, nodeType: subtype.includes('trigger') ? 'trigger' : 'action', nodeSubtype: subtype, nodeName: subtype, config,
});

describe('marketplacePurchase._cloneCampaign — đổi tham chiếu khối sang id khối mới', () => {
  let insertedNodeIds;
  let nodeUpdates;
  let connectionInserts;

  beforeEach(() => {
    jest.clearAllMocks();
    insertedNodeIds = ['510', '511', '512']; // pg trả BIGSERIAL dạng chuỗi
    nodeUpdates = [];
    connectionInserts = [];
    mockQuery.mockImplementation(async (sql, params) => {
      const text = String(sql);
      if (/INSERT INTO campaigns/.test(text)) return { rows: [{ id: '900' }] };
      if (/INSERT INTO campaign_nodes/.test(text)) return { rows: [{ id: insertedNodeIds.shift() }] };
      if (/UPDATE campaign_nodes SET config/.test(text)) {
        nodeUpdates.push({ config: JSON.parse(params[0]), nodeId: params[1] });
        return { rows: [] };
      }
      if (/INSERT INTO campaign_connections/.test(text)) {
        connectionInserts.push([params[1], params[2]]);
        return { rows: [] };
      }
      throw new Error(`unexpected sql: ${text}`);
    });
  });

  const listingOf = (nodes, connections) => ({
    description: 'Mô tả',
    snapshot_data: { campaignName: 'Bản mẫu', campaignType: 'zalo', flowJson: { nodes: [], connections: [] }, nodes, connections },
  });

  it('snapshot 3 khối (10 trigger → 11 get_all_groups → 12 send_zalo_group ref "11") → khối mới của 12 trỏ id mới của 11; ref ngoại "999" giữ nguyên', async () => {
    const listing = listingOf(
      [
        snapshotNode(10, 'manual_trigger', {}),
        snapshotNode(11, 'get_all_groups', {}),
        snapshotNode(12, 'send_zalo_group', {
          zaloGroupSource: 'node',
          zaloGroupNodeId: '11',
          zaloGroupAccountNodeId: '999',
          zaloGroupTemplateSteps: [{ templateMappings: [{ nodeId: 11 }] }],
        }),
      ],
      [
        { sourceNodeId: 10, targetNodeId: 11 },
        { sourceNodeId: 11, targetNodeId: 12 },
      ]
    );

    const result = await marketplacePurchaseService._cloneCampaign(mockClient, 5, listing);

    expect(result).toEqual({ id: '900', type: 'campaign' });
    expect(nodeUpdates).toHaveLength(1);
    expect(nodeUpdates[0].nodeId).toBe('512');
    expect(nodeUpdates[0].config).toEqual({
      zaloGroupSource: 'node',
      zaloGroupNodeId: '511',
      zaloGroupAccountNodeId: '999',
      zaloGroupTemplateSteps: [{ templateMappings: [{ nodeId: '511' }] }],
    });
    expect(connectionInserts).toEqual([['510', '511'], ['511', '512']]);
  });

  it('snapshot lưu id khối dạng chuỗi nhưng connections dạng số (hoặc ngược lại) vẫn nối đúng và đổi đúng tham chiếu', async () => {
    const listing = listingOf(
      [
        snapshotNode('10', 'manual_trigger', {}),
        snapshotNode('11', 'read_sheet', {}),
        snapshotNode('12', 'send_email', { recipientSource: 'node', recipientNodeId: 11 }),
      ],
      [
        { sourceNodeId: 10, targetNodeId: '11' },
        { sourceNodeId: '11', targetNodeId: 12 },
      ]
    );
    await marketplacePurchaseService._cloneCampaign(mockClient, 5, listing);
    expect(connectionInserts).toEqual([['510', '511'], ['511', '512']]);
    expect(nodeUpdates).toHaveLength(1);
    expect(nodeUpdates[0].config.recipientNodeId).toBe('511');
  });

  it('snapshot không có tham chiếu nào đổi → không UPDATE', async () => {
    const listing = listingOf(
      [snapshotNode(10, 'manual_trigger', {}), snapshotNode(11, 'send_zalo_group', { zaloGroupSource: 'manual', zaloGroupIds: 'g1' })],
      [{ sourceNodeId: 10, targetNodeId: 11 }]
    );
    insertedNodeIds = ['510', '511'];
    await marketplacePurchaseService._cloneCampaign(mockClient, 5, listing);
    expect(nodeUpdates).toEqual([]);
  });
});
