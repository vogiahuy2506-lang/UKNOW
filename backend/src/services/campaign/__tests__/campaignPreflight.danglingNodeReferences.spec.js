/**
 * PLAN_THAM_CHIEU_KHOI PR-1 Việc 1.5 — preflight CHẶN CỨNG chiến dịch có khối gửi lấy dữ liệu từ khối không còn tồn tại
 * (thường sinh ra do nhân bản). Chạy chuỗi thật preflight → campaignNodeReferences → campaignFlow (đồ thị thật); chỉ SQL được mock
 * theo nội dung câu lệnh, id khối trả dạng CHUỖI như pg BIGSERIAL.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({ default: { query: mockQuery } }));
jest.unstable_mockModule('../../../utils/topupLockGate.util.js', () => ({ resourceIsLocked: jest.fn(async () => false) }));
jest.unstable_mockModule('../channelEntitlement.service.js', () => ({
  assertChannelEntitled: jest.fn(async () => undefined),
  default: { assertChannelEntitled: jest.fn(async () => undefined) },
}));

const { validateCampaignPreflight } = await import('../campaignPreflight.service.js');

const row = (id, subtype, config, name = subtype) => ({
  id: String(id),
  node_type: subtype.includes('trigger') ? 'trigger' : 'action',
  node_subtype: subtype,
  node_name: name,
  execution_order: Number(id),
  config,
});

let nodeRows;
let connectionRows;
let flowJson;
let sqlSeen;

beforeEach(() => {
  jest.clearAllMocks();
  sqlSeen = [];
  flowJson = { nodes: [] };
  mockQuery.mockImplementation(async (sql) => {
    const text = String(sql);
    sqlSeen.push(text);
    if (/FROM campaign_nodes/.test(text)) return { rows: nodeRows };
    if (/FROM campaign_connections/.test(text)) return { rows: connectionRows };
    if (/FROM campaigns WHERE id/.test(text)) return { rows: [{ flow_json: flowJson }] };
    throw new Error(`unexpected sql: ${text}`);
  });
});

describe('validateCampaignPreflight — tham chiếu khối hụt (DANGLING_NODE_REFERENCE)', () => {
  // Hình #424: khối gửi email lấy người nhận từ khối 4030 (của chiến dịch GỐC); nguồn thật của bản sao là 4065.
  const shapeOf = (recipientNodeId, extra = {}) => {
    nodeRows = [
      row(4064, 'manual_trigger', {}),
      row(4065, 'read_sheet', {}, 'Đọc sheet'),
      row(4066, 'send_email', { recipientSource: 'node', recipientNodeId, ...extra }, 'Gửi email chăm sóc'),
    ];
    connectionRows = [
      { source_node_id: '4064', target_node_id: '4065' },
      { source_node_id: '4065', target_node_id: '4066' },
    ];
  };

  it('hình #424 → ném DANGLING_NODE_REFERENCE 400, message có tên khối và hướng dẫn chọn lại', async () => {
    shapeOf('4030');
    const error = await validateCampaignPreflight({ campaignId: 424, workspaceOwnerId: 39 }).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('DANGLING_NODE_REFERENCE');
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe(
      'Khối "Gửi email chăm sóc" đang lấy dữ liệu từ một khối không còn tồn tại (thường gặp sau khi nhân bản chiến dịch). '
      + 'Mở khối này, chọn lại khối dữ liệu rồi lưu chiến dịch.'
    );
    expect(error.details).toEqual([expect.objectContaining({ nodeId: '4066', field: 'recipientNodeId', ref: '4030', reason: 'dangling' })]);
  });

  it('hình #420 (tham chiếu nội bộ) → qua', async () => {
    shapeOf('4065');
    await expect(validateCampaignPreflight({ campaignId: 420, workspaceOwnerId: 39 })).resolves.toMatchObject({ valid: true });
  });

  it('tham chiếu là id sơ đồ (flow_json) khớp subtype + nhãn → engine cứu được → qua', async () => {
    shapeOf('flow-sheet');
    flowJson = { nodes: [{ id: 'flow-sheet', type: 'read_sheet', data: { nodeType: 'read_sheet', label: 'Đọc sheet' } }] };
    await expect(validateCampaignPreflight({ campaignId: 420, workspaceOwnerId: 39 })).resolves.toMatchObject({ valid: true });
  });

  it('trường mềm (templateMappings[].nodeId) hụt → KHÔNG chặn', async () => {
    shapeOf('4065', { emailSteps: [{ templateId: 1, templateMappings: [{ nodeId: '4030' }] }] });
    await expect(validateCampaignPreflight({ campaignId: 420, workspaceOwnerId: 39 })).resolves.toMatchObject({ valid: true });
  });

  it('chế độ manual còn ref cũ (hình #433) → KHÔNG chặn', async () => {
    nodeRows = [
      row(1, 'manual_trigger', {}),
      row(2, 'send_email', { recipientSource: 'manual', recipientEmails: 'a@b.vn', recipientNodeId: '4030' }, 'Gửi email'),
    ];
    connectionRows = [{ source_node_id: '1', target_node_id: '2' }];
    await expect(validateCampaignPreflight({ campaignId: 433, workspaceOwnerId: 39 })).resolves.toMatchObject({ valid: true });
  });

  it('chiến dịch không có khối nào thuộc diện kiểm → KHÔNG đọc thêm kết nối / flow_json', async () => {
    nodeRows = [
      row(1, 'manual_trigger', {}),
      row(2, 'send_email', { recipientSource: 'manual', recipientEmails: 'a@b.vn' }, 'Gửi email'),
    ];
    connectionRows = [{ source_node_id: '1', target_node_id: '2' }];
    await validateCampaignPreflight({ campaignId: 5, workspaceOwnerId: 39 });
    expect(sqlSeen.some((text) => /campaign_connections/.test(text))).toBe(false);
    expect(sqlSeen.some((text) => /FROM campaigns WHERE id/.test(text))).toBe(false);
  });

  it('chế độ node mà chưa chọn khối (Zalo nhóm) → chặn reason=missing', async () => {
    nodeRows = [
      row(1, 'manual_trigger', {}),
      row(2, 'send_zalo_group', { zaloGroupSource: 'node', zaloGroupNodeId: '', zaloAccountId: 5 }, 'Gửi nhóm'),
    ];
    connectionRows = [{ source_node_id: '1', target_node_id: '2' }];
    const error = await validateCampaignPreflight({ campaignId: 6, workspaceOwnerId: 39 }).catch((e) => e);
    expect(error.code).toBe('DANGLING_NODE_REFERENCE');
    expect(error.details[0].reason).toBe('missing');
  });

  it('get_all_groups.zaloGroupAccountNodeId hụt (trường mềm, engine có đường lui) → KHÔNG chặn bằng lỗi tham chiếu', async () => {
    nodeRows = [
      row(1, 'manual_trigger', {}),
      row(2, 'get_all_groups', { zaloGroupAccountNodeId: '4030', zaloAccountId: 5 }, 'Lấy nhóm'),
      row(3, 'send_zalo_group', { zaloGroupSource: 'node', zaloGroupNodeId: '2', zaloAccountId: 5 }, 'Gửi nhóm'),
    ];
    connectionRows = [{ source_node_id: '1', target_node_id: '2' }, { source_node_id: '2', target_node_id: '3' }];
    // Không đủ mock cho phần kiểm tài khoản Zalo phía sau — chỉ cần chắc chắn lỗi (nếu có) KHÔNG phải DANGLING_NODE_REFERENCE.
    const error = await validateCampaignPreflight({ campaignId: 7, workspaceOwnerId: 39 }).catch((e) => e);
    expect(error?.code).not.toBe('DANGLING_NODE_REFERENCE');
  });
});
