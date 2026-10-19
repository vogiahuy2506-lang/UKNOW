/**
 * Tham chiếu khối (PLAN_THAM_CHIEU_KHOI PR-1) — hàm thuần, chạy trên campaignFlow.service THẬT (không mock đồ thị):
 * 1. remapNodeReferencesDeep — đổi id tham chiếu khi nhân bản / mua marketplace.
 * 2. findDanglingNodeReferences — tìm tham chiếu "cứng" hụt, phân giải đúng như runtime.
 */
import { describe, expect, it } from '@jest/globals';
import campaignNodeReferences, {
  buildDanglingReferenceMessage,
  collectBlockingNodeReferences,
  findDanglingNodeReferences,
  parseNodeConfig,
  remapNodeReferencesDeep,
} from '../campaignNodeReferences.service.js';

// pg trả BIGSERIAL dạng CHUỖI — dựng hàng đúng hình dạng đó.
const dbNode = (id, subtype, config = {}, extra = {}) => ({
  id: String(id),
  node_type: subtype.includes('trigger') ? 'trigger' : 'action',
  node_subtype: subtype,
  node_name: extra.name ?? subtype,
  execution_order: extra.order ?? 1,
  config,
});
const conn = (source, target) => ({ source_node_id: String(source), target_node_id: String(target) });

describe('remapNodeReferencesDeep', () => {
  it('đổi cả 3 chỗ (trường phẳng, templateMappings[].nodeId số, saveCustomerFieldMap.*.nodeId); trường khác giữ nguyên', () => {
    const config = {
      zaloGroupNodeId: '11',
      zaloGroupField: 'groupId',
      emailSteps: [{ templateId: 5, templateMappings: [{ nodeId: 11, key: 'ten' }] }],
      saveCustomerFieldMap: { name: { mode: 'node', nodeId: '11', field: 'full_name' } },
    };
    const next = remapNodeReferencesDeep(config, new Map([['11', '21']]));
    expect(next).toEqual({
      zaloGroupNodeId: '21',
      zaloGroupField: 'groupId',
      emailSteps: [{ templateId: 5, templateMappings: [{ nodeId: '21', key: 'ten' }] }],
      saveCustomerFieldMap: { name: { mode: 'node', nodeId: '21', field: 'full_name' } },
    });
    // không đột biến bản gốc
    expect(config.zaloGroupNodeId).toBe('11');
    expect(config.emailSteps[0].templateMappings[0].nodeId).toBe(11);
  });

  it('không có gì khớp → trả CÙNG tham chiếu object (để nơi gọi biết không cần UPDATE)', () => {
    const config = { zaloGroupNodeId: '999', emailSteps: [{ templateMappings: [{ nodeId: '999' }] }], note: '11' };
    expect(remapNodeReferencesDeep(config, new Map([['11', '21']]))).toBe(config);
  });

  it('chỉ đổi khoá kết thúc bằng NodeId — giá trị "11" ở khoá khác (note) giữ nguyên', () => {
    const next = remapNodeReferencesDeep({ note: '11', recipientNodeId: '11' }, new Map([['11', '21']]));
    expect(next).toEqual({ note: '11', recipientNodeId: '21' });
  });

  it('bản đồ rỗng → trả nguyên giá trị', () => {
    const config = { recipientNodeId: '11' };
    expect(remapNodeReferencesDeep(config, new Map())).toBe(config);
  });
});

describe('parseNodeConfig', () => {
  it('object giữ nguyên, chuỗi JSON parse được, rác → null', () => {
    const obj = { a: 1 };
    expect(parseNodeConfig(obj)).toBe(obj);
    expect(parseNodeConfig('{"a":1}')).toEqual({ a: 1 });
    expect(parseNodeConfig('không phải json')).toBeNull();
    expect(parseNodeConfig(null)).toBeNull();
  });
});

describe('findDanglingNodeReferences', () => {
  // Hình #424: bản sao, khối gửi nhóm trỏ khối 4030 của chiến dịch GỐC; khối lấy nhóm của chính bản sao là 4065.
  const copyNodes = (groupNodeRef, extraConfig = {}) => [
    dbNode(4064, 'manual_trigger', {}, { order: 1 }),
    dbNode(4065, 'get_all_groups', {}, { name: 'Lấy nhóm', order: 2 }),
    dbNode(4066, 'send_zalo_group', { zaloGroupSource: 'node', zaloGroupNodeId: groupNodeRef, ...extraConfig }, { name: 'Gửi nhóm', order: 3 }),
  ];
  const chain = [conn(4064, 4065), conn(4065, 4066)];

  it('hình #424 (ref 4030 ngoài chiến dịch, chế độ node) → 1 mục chặn, field=zaloGroupNodeId, reason=dangling', () => {
    const findings = findDanglingNodeReferences({ flowJson: null, nodes: copyNodes('4030'), connections: chain });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      nodeId: '4066', nodeName: 'Gửi nhóm', nodeSubtype: 'send_zalo_group', field: 'zaloGroupNodeId', ref: '4030', reason: 'dangling',
    });
  });

  it('hình #420 (ref nội bộ) → 0 mục chặn', () => {
    expect(findDanglingNodeReferences({ flowJson: null, nodes: copyNodes('4065'), connections: chain })).toEqual([]);
  });

  it('ref là số (config lưu số) vẫn so đúng với id chuỗi của pg', () => {
    expect(findDanglingNodeReferences({ flowJson: null, nodes: copyNodes(4065), connections: chain })).toEqual([]);
    expect(findDanglingNodeReferences({ flowJson: null, nodes: copyNodes(4030), connections: chain })).toHaveLength(1);
  });

  it('chế độ manual còn ref cũ (hình #433) → 0 mục chặn', () => {
    const nodes = copyNodes('4030', { zaloGroupSource: 'manual', zaloGroupIds: 'g1,g2' });
    expect(findDanglingNodeReferences({ flowJson: null, nodes, connections: chain })).toEqual([]);
  });

  it('zaloGroupSource để trống = mặc định manual → 0 mục chặn', () => {
    const nodes = copyNodes('4030', { zaloGroupSource: undefined });
    expect(findDanglingNodeReferences({ flowJson: null, nodes, connections: chain })).toEqual([]);
  });

  it('khối KHÔNG đi tới được từ trigger → 0 mục chặn', () => {
    const nodes = [...copyNodes('4030'), dbNode(4070, 'send_zalo_group', { zaloGroupSource: 'node', zaloGroupNodeId: '4999' }, { name: 'Mồ côi' })];
    // 4066 bị ngắt khỏi trigger, 4070 không có cạnh nào → cả hai không đi tới được
    const findings = findDanglingNodeReferences({ flowJson: null, nodes, connections: [conn(4064, 4065)] });
    expect(findings).toEqual([]);
  });

  it('ref trỏ khối có thật nhưng KHÔNG đi tới được → chặn (engine không chạy khối đó nên nguồn rỗng)', () => {
    const nodes = [...copyNodes('4071'), dbNode(4071, 'get_all_groups', {}, { name: 'Nhóm lạc' })];
    const findings = findDanglingNodeReferences({ flowJson: null, nodes, connections: chain });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ field: 'zaloGroupNodeId', ref: '4071', reason: 'dangling' });
  });

  it('ref là id sơ đồ (flow_json) khớp subtype+nhãn với khối DB → engine cứu được → 0 mục chặn', () => {
    const flowJson = {
      nodes: [
        { id: 'flow-trigger', type: 'manual_trigger', data: { nodeType: 'manual_trigger', label: 'manual_trigger' } },
        { id: 'flow-groups', type: 'get_all_groups', data: { nodeType: 'get_all_groups', label: 'Lấy nhóm' } },
        { id: 'flow-send', type: 'send_zalo_group', data: { nodeType: 'send_zalo_group', label: 'Gửi nhóm' } },
      ],
    };
    expect(findDanglingNodeReferences({ flowJson, nodes: copyNodes('flow-groups'), connections: chain })).toEqual([]);
    // cùng cấu hình nhưng KHÔNG có flow_json → id sơ đồ không phân giải được → hụt
    expect(findDanglingNodeReferences({ flowJson: null, nodes: copyNodes('flow-groups'), connections: chain })).toHaveLength(1);
  });

  it('flow_json là chuỗi JSON vẫn phân giải', () => {
    const flowJson = JSON.stringify({
      nodes: [{ id: 'flow-groups', type: 'get_all_groups', data: { nodeType: 'get_all_groups', label: 'Lấy nhóm' } }],
    });
    expect(findDanglingNodeReferences({ flowJson, nodes: copyNodes('flow-groups'), connections: chain })).toEqual([]);
  });

  it('get_all_groups.zaloGroupAccountNodeId hụt (trường mềm) → 0 mục chặn', () => {
    const nodes = copyNodes('4065');
    nodes[1].config = { zaloGroupAccountNodeId: '4030' };
    expect(findDanglingNodeReferences({ flowJson: null, nodes, connections: chain })).toEqual([]);
  });

  it('templateMappings[].nodeId hụt (trường mềm) → 0 mục chặn', () => {
    const nodes = copyNodes('4065', { zaloGroupTemplateSteps: [{ templateMappings: [{ nodeId: '4030' }] }] });
    expect(findDanglingNodeReferences({ flowJson: null, nodes, connections: chain })).toEqual([]);
  });

  it('khối gửi nhóm: chế độ node, ref rỗng → 1 mục chặn reason=missing', () => {
    const findings = findDanglingNodeReferences({ flowJson: null, nodes: copyNodes(''), connections: chain });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ field: 'zaloGroupNodeId', reason: 'missing' });
  });

  it('email: chế độ node + ref rỗng KHÔNG chặn (engine lui về đầu ra khối liền trước), ref hụt thì chặn', () => {
    const build = (ref) => [
      dbNode(1, 'manual_trigger'),
      dbNode(2, 'read_sheet'),
      dbNode(3, 'send_email', { recipientSource: 'node', recipientNodeId: ref }, { name: 'Gửi email' }),
    ];
    const connections = [conn(1, 2), conn(2, 3)];
    expect(findDanglingNodeReferences({ flowJson: null, nodes: build(''), connections })).toEqual([]);
    expect(findDanglingNodeReferences({ flowJson: null, nodes: build('2'), connections })).toEqual([]);
    const findings = findDanglingNodeReferences({ flowJson: null, nodes: build('777'), connections });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ nodeSubtype: 'send_email', field: 'recipientNodeId', ref: '777', reason: 'dangling' });
  });

  it('Zalo cá nhân: zaloRecipientNodeId ưu tiên, rỗng thì dùng recipientNodeId; nguồn lấy từ zaloRecipientSource || recipientSource', () => {
    const build = (config) => [
      dbNode(1, 'manual_trigger'),
      dbNode(2, 'read_sheet'),
      dbNode(3, 'send_zalo_personal', config, { name: 'Gửi cá nhân' }),
    ];
    const connections = [conn(1, 2), conn(2, 3)];
    const ok = findDanglingNodeReferences({ flowJson: null, nodes: build({ zaloRecipientSource: 'node', zaloRecipientNodeId: '2' }), connections });
    expect(ok).toEqual([]);
    const bad = findDanglingNodeReferences({ flowJson: null, nodes: build({ zaloRecipientSource: 'node', zaloRecipientNodeId: '555' }), connections });
    expect(bad[0]).toMatchObject({ field: 'zaloRecipientNodeId', ref: '555', reason: 'dangling' });
    const legacy = findDanglingNodeReferences({ flowJson: null, nodes: build({ recipientSource: 'node', recipientNodeId: '556' }), connections });
    expect(legacy[0]).toMatchObject({ field: 'recipientNodeId', ref: '556', reason: 'dangling' });
    const manual = findDanglingNodeReferences({ flowJson: null, nodes: build({ zaloRecipientSource: 'manual', zaloRecipientNodeId: '555' }), connections });
    expect(manual).toEqual([]);
    const missing = findDanglingNodeReferences({ flowJson: null, nodes: build({ zaloRecipientSource: 'node' }), connections });
    expect(missing[0]).toMatchObject({ reason: 'missing' });
  });

  it('kết bạn Zalo (send_zalo_friend_request): chế độ node + ref hụt → chặn; manual → không', () => {
    const build = (config) => [
      dbNode(1, 'manual_trigger'),
      dbNode(2, 'send_zalo_friend_request', config, { name: 'Kết bạn' }),
    ];
    const connections = [conn(1, 2)];
    expect(findDanglingNodeReferences({ flowJson: null, nodes: build({ zaloFriendSource: 'node', zaloFriendNodeId: '88' }), connections })[0])
      .toMatchObject({ field: 'zaloFriendNodeId', reason: 'dangling' });
    expect(findDanglingNodeReferences({ flowJson: null, nodes: build({ zaloFriendSource: 'manual', zaloFriendNodeId: '88' }), connections })).toEqual([]);
  });

  it('save_customer: saveCustomerNodeId khác rỗng mà hụt → chặn; rỗng → không', () => {
    const build = (ref) => [dbNode(1, 'manual_trigger'), dbNode(2, 'save_customer', { saveCustomerNodeId: ref }, { name: 'Lưu khách' })];
    const connections = [conn(1, 2)];
    expect(findDanglingNodeReferences({ flowJson: null, nodes: build('42'), connections })[0])
      .toMatchObject({ field: 'saveCustomerNodeId', reason: 'dangling' });
    expect(findDanglingNodeReferences({ flowJson: null, nodes: build(''), connections })).toEqual([]);
    expect(findDanglingNodeReferences({ flowJson: null, nodes: build('1'), connections })).toEqual([]);
  });

  it('Telegram / WhatsApp: nguồn node + ref hụt → chặn; ref rỗng không chặn (lui về đầu ra liền trước)', () => {
    ['send_telegram', 'send_whatsapp'].forEach((subtype) => {
      const build = (ref) => [dbNode(1, 'manual_trigger'), dbNode(2, subtype, { recipientSource: 'node', recipientNodeId: ref })];
      const connections = [conn(1, 2)];
      expect(findDanglingNodeReferences({ flowJson: null, nodes: build('31'), connections })[0])
        .toMatchObject({ nodeSubtype: subtype, field: 'recipientNodeId', reason: 'dangling' });
      expect(findDanglingNodeReferences({ flowJson: null, nodes: build(''), connections })).toEqual([]);
    });
  });

  it('config về dạng chuỗi JSON vẫn được kiểm', () => {
    const nodes = copyNodes('4030');
    nodes[2].config = JSON.stringify(nodes[2].config);
    expect(findDanglingNodeReferences({ flowJson: null, nodes, connections: chain })).toHaveLength(1);
  });

  it('không có khối nào thuộc diện kiểm → [] mà không dựng đồ thị', () => {
    const nodes = [dbNode(1, 'manual_trigger'), dbNode(2, 'send_zalo_group', { zaloGroupSource: 'manual' })];
    expect(findDanglingNodeReferences({ nodes, connections: [conn(1, 2)] })).toEqual([]);
    expect(findDanglingNodeReferences()).toEqual([]);
  });

  it('collectBlockingNodeReferences: subtype lạ → []; export mặc định gom đủ hàm', () => {
    expect(collectBlockingNodeReferences('get_all_groups', { zaloGroupAccountNodeId: '1' })).toEqual([]);
    expect(Object.keys(campaignNodeReferences)).toEqual(expect.arrayContaining([
      'parseNodeConfig', 'remapNodeReferencesDeep', 'collectBlockingNodeReferences', 'findDanglingNodeReferences', 'buildDanglingReferenceMessage',
    ]));
  });
});

describe('buildDanglingReferenceMessage', () => {
  it('hụt → câu có tên khối + hướng dẫn chọn lại; nhiều khối thì ghi số khối còn lại', () => {
    const one = buildDanglingReferenceMessage([{ nodeName: 'Gửi nhóm', reason: 'dangling' }]);
    expect(one).toBe('Khối "Gửi nhóm" đang lấy dữ liệu từ một khối không còn tồn tại (thường gặp sau khi nhân bản chiến dịch). Mở khối này, chọn lại khối dữ liệu rồi lưu chiến dịch.');
    const many = buildDanglingReferenceMessage([
      { nodeName: 'Gửi nhóm', reason: 'dangling' },
      { nodeName: 'Gửi email', reason: 'dangling' },
    ]);
    expect(many).toContain('(và 1 khối khác cũng bị tương tự)');
  });

  it('missing → câu riêng "chưa chọn khối dữ liệu"; rỗng → chuỗi rỗng', () => {
    expect(buildDanglingReferenceMessage([{ nodeName: 'Gửi nhóm', reason: 'missing' }])).toContain('chưa chọn khối dữ liệu');
    expect(buildDanglingReferenceMessage([])).toBe('');
  });
});
