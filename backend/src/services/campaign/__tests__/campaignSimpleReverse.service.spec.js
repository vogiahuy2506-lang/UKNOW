import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PLAN_HAI_TAB_TUNG_BUOC_SO_DO_2026-10-17 PR-A — đọc ngược sơ đồ → form và so khớp khứ hồi.
 *
 * "Sơ đồ đã lưu" ở đây được dựng bằng CHÍNH pipeline tạo (normalizeSimpleBody → compileSimpleGraph → người nhận nhập sẵn) rồi đổi mã
 * khối sang số như khi ghi DB; chỉ các nguồn dữ liệu ngoài (landing → form, sở hữu biểu mẫu) bị giả lập.
 */
const mockApplyLandingAudienceResolution = jest.fn();
const mockGetFormIdsOwnedBy = jest.fn();

jest.unstable_mockModule('../../ai/landingAudienceResolver.service.js', () => ({
  applyLandingAudienceResolution: mockApplyLandingAudienceResolution,
  default: { applyLandingAudienceResolution: mockApplyLandingAudienceResolution },
}));
jest.unstable_mockModule('../../ai/aiCampaignDraft.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../ai/campaignConfirmation.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../readSheetAutoName.service.js', () => ({ fillReadSheetFirstTabNames: jest.fn() }));
jest.unstable_mockModule('../../../utils/userResourceLimit.util.js', () => ({ checkUserResourceLimit: jest.fn() }));
jest.unstable_mockModule('../../../repositories/ai/aiCampaign.repository.js', () => ({
  default: { getFormIdsOwnedBy: mockGetFormIdsOwnedBy },
}));
jest.unstable_mockModule('../../../repositories/customer/customerRead.repository.js', () => ({
  default: { countWorkspaceCustomers: jest.fn() },
}));

const { normalizeSimpleBody, compileSimpleGraph } = await import('../campaignSimple.service.js');
const { applyDirectRecipients } = await import('../../../utils/directRecipients.util.js');
const reverse = await import('../campaignSimpleReverse.service.js');
const { readSimpleFormFromGraph, isRoundTripEquivalent, carryOverLinkTracking, READ_ONLY_REASON_CODES: CODE } = reverse;
const { getNodeSubtype } = await import('../../../utils/nodeSubtype.util.js');

const OWNER = 7;

/** Đổi mã khối 'node_xxx' → số như DB ghi, kể cả các trường tham chiếu mã khối. */
function persist({ nodes, connections }) {
  const map = new Map(nodes.map((node, index) => [String(node.id), String(1000 + index)]));
  const remapConfig = (value, key) => {
    if (Array.isArray(value)) return value.map((item) => remapConfig(item, key));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remapConfig(v, k)]));
    }
    if (typeof value === 'string' && (/NodeId$/.test(key) || key === 'nodeId') && map.has(value)) return map.get(value);
    return value;
  };
  return {
    nodes: nodes.map((node) => ({
      id: map.get(String(node.id)),
      nodeType: node.nodeType,
      nodeSubtype: node.nodeSubtype,
      nodeName: node.nodeName,
      config: remapConfig(JSON.parse(JSON.stringify(node.config || {})), ''),
    })),
    connections: connections.map((conn) => ({
      id: Math.floor(Math.random() * 1e6),
      sourceNodeId: map.get(String(conn.sourceNodeId)),
      targetNodeId: map.get(String(conn.targetNodeId)),
      connectionType: 'default',
      connectionLabel: '',
      conditionConfig: null,
    })),
  };
}

async function build(body) {
  const input = await normalizeSimpleBody(body, { ownerId: OWNER, skipDbChecks: true });
  const graph = await compileSimpleGraph(input, { ownerId: OWNER });
  if (input.directRecipients) applyDirectRecipients({ nodes: graph.nodes }, input.directRecipients);
  return graph;
}

const tpl = (id) => ({ mode: 'template', templateId: id });
const fu = (delayValue, delayUnit, templateId) => ({ delayValue, delayUnit, content: tpl(templateId) });

const emailBody = (extra = {}) => ({
  channel: 'email', senderId: 5, audience: { type: 'manual', emails: ['a@x.com', 'b@x.com'] }, content: tpl(11), ...extra,
});
const zaloBody = (extra = {}) => ({
  channel: 'zalo', senderId: 9, audience: { type: 'manual', phones: ['0912345678', '0987654321'] }, content: tpl(21), ...extra,
});
const groupBody = (extra = {}) => ({
  channel: 'zalo_group', senderId: 9, audience: { type: 'zalo_groups', groupIds: ['111', '222'] }, content: tpl(31), ...extra,
});

/** Dựng "đã lưu" từ body, đọc ngược, dựng lại từ form đọc được rồi so khớp. */
async function roundTrip(body) {
  const stored = persist(await build(body));
  const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
  if (!read.form) return { stored, read, comparison: null };
  const rebuilt = await build({ channel: read.channel, ...read.form });
  return { stored, read, rebuilt, comparison: isRoundTripEquivalent(stored, rebuilt) };
}

const sendOf = (graph) => graph.nodes.find((node) => ['send_email', 'send_zalo_personal', 'send_zalo_group'].includes(getNodeSubtype(node)));
const stepsOf = (graph) => {
  const cfg = sendOf(graph).config;
  return cfg.emailSteps || cfg.zaloPersonalTemplateSteps || cfg.zaloGroupTemplateSteps;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockApplyLandingAudienceResolution.mockImplementation(async (intent) => intent);
  mockGetFormIdsOwnedBy.mockImplementation(async (_owner, ids) => ids);
});

describe('readSimpleFormFromGraph — đọc ngược theo từng loại nguồn', () => {
  const cases = [
    ['email + manual', emailBody(), { type: 'manual', emails: ['a@x.com', 'b@x.com'] }],
    ['email + customers', emailBody({ audience: { type: 'customers' } }), { type: 'customers' }],
    ['email + landing', emailBody({ audience: { type: 'landing', slugs: ['khoa-1', 'khoa-2'] } }), { type: 'landing', slugs: ['khoa-1', 'khoa-2'] }],
    ['email + form', emailBody({ audience: { type: 'form', formIds: [7, 8] } }), { type: 'form', formIds: [7, 8] }],
    ['email + sheet (có tên tab)', emailBody({ audience: { type: 'sheet', sheetUrl: 'https://docs.google.com/spreadsheets/d/abc123/edit', sheetName: 'Tab 2' } }),
      { type: 'sheet', sheetUrl: 'https://docs.google.com/spreadsheets/d/abc123/edit', sheetName: 'Tab 2' }],
    ['email + sheet (không tên tab)', emailBody({ audience: { type: 'sheet', sheetUrl: 'https://docs.google.com/spreadsheets/d/abc123/edit' } }),
      { type: 'sheet', sheetUrl: 'https://docs.google.com/spreadsheets/d/abc123/edit' }],
    ['zalo + manual (SĐT)', zaloBody(), { type: 'manual', phones: ['0912345678', '0987654321'] }],
    ['zalo + customers', zaloBody({ audience: { type: 'customers' } }), { type: 'customers' }],
    ['zalo + zalo_friends (uid)', zaloBody({ audience: { type: 'zalo_friends', uids: ['1234567890', '9876543210'] } }), { type: 'zalo_friends', uids: ['1234567890', '9876543210'] }],
    ['zalo + landing', zaloBody({ audience: { type: 'landing', slugs: ['a'] } }), { type: 'landing', slugs: ['a'] }],
    ['zalo + form', zaloBody({ audience: { type: 'form', formIds: [3] } }), { type: 'form', formIds: [3] }],
    ['zalo nhóm + nhóm đã chọn', groupBody(), { type: 'zalo_groups', groupIds: ['111', '222'] }],
  ];

  it.each(cases)('%s → audience đúng và khứ hồi khớp', async (_name, body, expectedAudience) => {
    const { read, comparison } = await roundTrip(body);
    expect(read.reasons).toEqual([]);
    expect(read.channel).toBe(body.channel);
    expect(read.form.senderId).toBe(body.senderId);
    expect(read.form.audience).toEqual(expectedAudience);
    expect(read.form.content).toEqual(body.content);
    expect(read.form.followUps).toEqual([]);
    expect(comparison).toEqual({ ok: true, diffs: [] });
  });

  it('đơn vị phút: đọc ngược ra đúng followUps (không unsupported_delay), cả email lẫn zalo', async () => {
    const body = emailBody({ content: tpl(11), followUps: [fu(30, 'minutes', 12), fu(2, 'days', 13)] });
    const { read } = await roundTrip(body);
    expect(read.reasons).toEqual([]);
    expect(read.form.followUps).toEqual([fu(30, 'minutes', 12), fu(2, 'days', 13)]);
    const zalo = await roundTrip(zaloBody({ followUps: [fu(45, 'minutes', 22)] }));
    expect(zalo.read.form.followUps).toEqual([fu(45, 'minutes', 22)]);
  });

  it('chuỗi 3 tin: followUps mang đúng độ trễ + templateId từng bước; content = tin 1', async () => {
    const body = emailBody({ content: tpl(11), followUps: [fu(2, 'days', 12), fu(5, 'hours', 13)] });
    const { read, comparison } = await roundTrip(body);
    expect(read.form.content).toEqual(tpl(11));
    expect(read.form.followUps).toEqual([fu(2, 'days', 12), fu(5, 'hours', 13)]);
    expect(comparison.ok).toBe(true);
  });

  it.each([
    ['zalo', zaloBody({ followUps: [fu(1, 'days', 22), fu(3, 'days', 23)] })],
    ['zalo_group', groupBody({ followUps: [fu(12, 'hours', 32)] })],
  ])('chuỗi tin kênh %s khứ hồi khớp', async (_name, body) => {
    const { read, comparison } = await roundTrip(body);
    expect(read.form.followUps).toEqual(body.followUps);
    expect(comparison).toEqual({ ok: true, diffs: [] });
  });

  it('chuỗi tối đa 10 tin đọc được; 11 tin → too_many_steps', async () => {
    const ten = await roundTrip(emailBody({ followUps: Array.from({ length: 9 }, (_, i) => fu(1, 'days', 20 + i)) }));
    expect(ten.read.form.followUps).toHaveLength(9);
    const stored = persist(await build(emailBody({ followUps: Array.from({ length: 9 }, (_, i) => fu(1, 'days', 20 + i)) })));
    sendOf(stored).config.emailSteps.push({ ...sendOf(stored).config.emailSteps[1] });
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    expect(read.form).toBeNull();
    expect(read.reasons.map((item) => item.code)).toEqual([CODE.TOO_MANY_STEPS]);
  });
});

describe('dữ liệu prod 17/10/2026: cạnh `custom` của trình dựng + khối `end` của trợ lý AI cũ', () => {
  it('cạnh `custom` (trình dựng lưu) là nối thường → đọc ngược + khứ hồi khớp', async () => {
    const stored = persist(await build(emailBody({ followUps: [fu(2, 'days', 12)] })));
    stored.connections.forEach((conn) => { conn.connectionType = 'custom'; });
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    expect(read.reasons).toEqual([]);
    const rebuilt = await build({ channel: read.channel, ...read.form });
    expect(isRoundTripEquivalent(stored, rebuilt)).toEqual({ ok: true, diffs: [] });
  });

  it('khối `end` ở CUỐI đường bị bỏ qua → đọc ngược được, khứ hồi khớp (sơ đồ dựng lại không có end)', async () => {
    const stored = persist(await build(zaloBody()));
    const last = stored.nodes[stored.nodes.length - 1];
    stored.nodes.push({ id: '9999', nodeType: 'end', nodeSubtype: 'end', nodeName: 'Kết thúc', config: {} });
    stored.connections.push({ id: 1, sourceNodeId: last.id, targetNodeId: '9999', connectionType: 'default', connectionLabel: '', conditionConfig: null });
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    expect(read.reasons).toEqual([]);
    const rebuilt = await build({ channel: read.channel, ...read.form });
    expect(isRoundTripEquivalent(stored, rebuilt)).toEqual({ ok: true, diffs: [] });
  });

  it('trình dựng lưu khối gửi Zalo với `zaloAccountId: ""`, tài khoản chỉ nằm ở khối chọn tài khoản → đọc được, khứ hồi khớp', async () => {
    for (const body of [zaloBody({ followUps: [fu(1, 'days', 22)] }), groupBody()]) {
      const stored = persist(await build(body));
      sendOf(stored).config.zaloAccountId = '';
      const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
      expect(read.reasons).toEqual([]);
      expect(read.form.senderId).toBe(9);
      const rebuilt = await build({ channel: read.channel, ...read.form });
      expect(isRoundTripEquivalent(stored, rebuilt)).toEqual({ ok: true, diffs: [] });
    }
  });

  it('khối chọn tài khoản mang túi trường mặc định của trình dựng (lúc chạy không đọc) → khứ hồi vẫn khớp', async () => {
    const stored = persist(await build(zaloBody()));
    Object.assign(stored.nodes.find((node) => node.nodeSubtype === 'select_zalo_account').config, {
      bccEnabled: false,
      ccEnabled: true,
      conditions: [{ field: '', operator: 'equals', value: '' }],
      dataStartRow: 2,
      saveCustomerFieldMap: { phone: { mode: 'column', value: '' } },
      sendMode: 'sequential',
      zaloAccountName: 'Nhật Minh',
      zaloPoolMultiAccountEnabled: false,
      zaloPoolAccountIds: [],
    });
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    const rebuilt = await build({ channel: read.channel, ...read.form });
    expect(isRoundTripEquivalent(stored, rebuilt)).toEqual({ ok: true, diffs: [] });
  });

  it('khối chọn tài khoản cũ không có cờ `zaloPoolMultiAccountEnabled` (bản dựng lại ghi false) → coi như nhau, khứ hồi khớp', async () => {
    const stored = persist(await build(zaloBody()));
    delete stored.nodes.find((node) => node.nodeSubtype === 'select_zalo_account').config.zaloPoolMultiAccountEnabled;
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    const rebuilt = await build({ channel: read.channel, ...read.form });
    expect(rebuilt.nodes.find((node) => node.nodeSubtype === 'select_zalo_account').config.zaloPoolMultiAccountEnabled).toBe(false);
    expect(isRoundTripEquivalent(stored, rebuilt)).toEqual({ ok: true, diffs: [] });
  });

  it('khối `end` ở GIỮA đường (còn cạnh đi ra) vẫn bị từ chối như khối nâng cao', async () => {
    const stored = persist(await build(emailBody()));
    const [first, second] = stored.nodes;
    stored.nodes.push({ id: '9998', nodeType: 'end', nodeSubtype: 'end', nodeName: 'Kết thúc', config: {} });
    const conn = stored.connections.find((item) => item.sourceNodeId === first.id && item.targetNodeId === second.id);
    conn.targetNodeId = '9998';
    stored.connections.push({ id: 2, sourceNodeId: '9998', targetNodeId: second.id, connectionType: 'default', connectionLabel: '', conditionConfig: null });
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    expect(read.form).toBeNull();
    expect(read.reasons.map((item) => item.code)).toContain(CODE.NOT_SIMPLE);
  });
});

describe('nhóm Zalo dựng tay (prod 17/10/2026): chỉ so trường lúc chạy thật đọc', () => {
  const groupsOf = (graph) => graph.nodes.find((node) => node.nodeSubtype === 'get_all_groups');
  const selectOf = (graph) => graph.nodes.find((node) => node.nodeSubtype === 'select_zalo_account');

  /**
   * Sơ đồ nhóm Zalo kiểu trình dựng lưu: không có bản chép danh sách nhóm thừa, túi trường mặc định, cờ / bước dạng mặc định.
   * Mặc định một tin (compiler ghi `zaloGroupSendMode: 'all'` → bản lưu để rỗng tương đương); chuỗi tin thì compiler ghi 'schedule'.
   */
  async function builderGroupGraph(body = groupBody()) {
    const chain = Array.isArray(body.followUps) && body.followUps.length > 0;
    const stored = persist(await build(body));
    const groups = groupsOf(stored);
    const send = sendOf(stored);
    delete groups.config.zaloGroupIds;
    delete send.config.zaloGroupIds;
    delete send.config.zaloSelectedGroupIds;
    Object.assign(groups.config, {
      zaloAccountId: 77, // khối chọn tài khoản đứng trước thắng — lúc chạy không đọc

      zaloGroupSelectionSnapshotLocked: false,
      bccEnabled: false,
      conditions: [{ field: '', operator: 'equals', value: '' }],
      sheetName: 'Trang tính1',
      saveMessageLog: true,
      zaloGroupSendMode: 'all',
    });
    Object.assign(send.config, {
      zaloAccountId: '',
      zaloGroupField: '',
      ...(chain ? {} : { zaloGroupSendMode: '' }),
      bccEnabled: false,
      hasExtraCondition: false,
      landingLeadsLimit: 500,
      zaloSelectedGroupIds: [],
    });
    send.config.zaloGroupTemplateSteps.forEach((step, index) => {
      step.id = `step_${index}`;
      step.enableLinkTracking = true;
    });
    return stored;
  }

  async function roundTripOf(stored) {
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    expect(read.reasons).toEqual([]);
    const rebuilt = await build({ channel: read.channel, ...read.form });
    return isRoundTripEquivalent(stored, rebuilt);
  }

  it('bản chép thừa danh sách nhóm, túi trường mặc định, mặc định lúc chạy, `id` bước, theo dõi link = true → khứ hồi khớp', async () => {
    expect(await roundTripOf(await builderGroupGraph())).toEqual({ ok: true, diffs: [] });
    expect(await roundTripOf(await builderGroupGraph(groupBody({ followUps: [fu(1, 'days', 32)] })))).toEqual({ ok: true, diffs: [] });
  });

  it('tham chiếu tài khoản của khối lấy nhóm: rỗng / trỏ khối chọn / trỏ khối không còn trên sơ đồ → khớp; trỏ khối khác trên đường → lệch', async () => {
    for (const ref of ['', 'select', '424242']) {
      const stored = await builderGroupGraph();
      groupsOf(stored).config.zaloGroupAccountNodeId = ref === 'select' ? selectOf(stored).id : ref;
      expect(await roundTripOf(stored)).toEqual({ ok: true, diffs: [] });
    }
    const stored = await builderGroupGraph();
    groupsOf(stored).config.zaloGroupAccountNodeId = stored.nodes[0].id;
    const result = await roundTripOf(stored);
    expect(result.ok).toBe(false);
    expect(result.diffs.join('\n')).toContain('zaloGroupAccountNodeId');
  });

  it('cài đặt thật vẫn chặn: tắt theo dõi link, chế độ gửi khác "all", khoá danh sách nhóm, nguồn nhập tay với danh sách khác', async () => {
    const cases = [
      ['enableLinkTracking', (g) => { sendOf(g).config.zaloGroupTemplateSteps[0].enableLinkTracking = false; }],
      ['zaloGroupSendMode', (g) => { sendOf(g).config.zaloGroupSendMode = 'schedule'; }],
      ['zaloGroupSelectionSnapshotLocked', (g) => { groupsOf(g).config.zaloGroupSelectionSnapshotLocked = true; }],
      ['zaloGroupSource', (g) => { Object.assign(sendOf(g).config, { zaloGroupSource: 'manual', zaloGroupIds: '999' }); }],
    ];
    for (const [key, mutate] of cases) {
      const stored = await builderGroupGraph();
      mutate(stored);
      const result = await roundTripOf(stored);
      expect(result.ok).toBe(false);
      expect(result.diffs.join('\n')).toContain(key);
    }
  });
});

describe('carryOverLinkTracking — giữ lựa chọn tắt theo dõi link khi dựng lại', () => {
  const linkFlags = (graph) => stepsOf(graph).map((step) => step.enableLinkTracking);

  it('mọi tin đã lưu đều tắt → mọi tin dựng lại (kể cả tin mới thêm) tắt, khứ hồi khớp', async () => {
    const stored = persist(await build(groupBody({ followUps: [fu(1, 'days', 32)] })));
    stepsOf(stored).forEach((step) => { step.enableLinkTracking = false; });
    const rebuilt = await build(groupBody({ followUps: [fu(1, 'days', 32), fu(2, 'days', 33)] }));
    carryOverLinkTracking(stored.nodes, rebuilt.nodes);
    expect(linkFlags(rebuilt)).toEqual([false, false, false]);

    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    const again = await build({ channel: read.channel, ...read.form });
    expect(isRoundTripEquivalent(stored, again).ok).toBe(false);
    carryOverLinkTracking(stored.nodes, again.nodes);
    expect(isRoundTripEquivalent(stored, again)).toEqual({ ok: true, diffs: [] });
  });

  it('chuỗi trộn bật/tắt hoặc không tin nào tắt → không chép gì', async () => {
    for (const flags of [[false, true], [false, undefined], [true, true]]) {
      const stored = persist(await build(emailBody({ followUps: [fu(1, 'days', 12)] })));
      stepsOf(stored).forEach((step, index) => { step.enableLinkTracking = flags[index]; });
      const rebuilt = await build(emailBody({ followUps: [fu(1, 'days', 12)] }));
      const before = JSON.stringify(rebuilt);
      carryOverLinkTracking(stored.nodes, rebuilt.nodes);
      expect(JSON.stringify(rebuilt)).toBe(before);
    }
  });
});

describe('readSimpleFormFromGraph — lý do không đọc ngược được', () => {
  it('có khối nâng cao (Rẽ nhánh) → not_simple, nêu tên khối + subtype', async () => {
    const stored = persist(await build(emailBody()));
    stored.nodes.splice(1, 0, { id: '5000', nodeType: 'condition', nodeSubtype: 'condition', nodeName: 'Rẽ nhánh', config: {} });
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    expect(read.form).toBeNull();
    expect(read.reasons).toEqual([expect.objectContaining({ code: CODE.NOT_SIMPLE, subtypes: ['condition'], message: expect.stringContaining('Rẽ nhánh') })]);
  });

  it('hai khối gửi → multiple_send_nodes', async () => {
    const stored = persist(await build(emailBody()));
    stored.nodes.push({ ...sendOf(stored), id: '5001' });
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    expect(read.reasons.map((item) => item.code)).toContain(CODE.MULTIPLE_SEND_NODES);
    expect(read.form).toBeNull();
  });

  it('chuỗi đếm từ tin đầu (delayFrom start / vắng) → delay_from_start, KHÔNG tự quy đổi', async () => {
    for (const mutate of [(step) => { step.delayFrom = 'start'; }, (step) => { delete step.delayFrom; }]) {
      const stored = persist(await build(zaloBody({ followUps: [fu(1, 'days', 22)] })));
      mutate(stepsOf(stored)[1]);
      const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
      expect(read.form).toBeNull();
      expect(read.reasons.map((item) => item.code)).toEqual([CODE.DELAY_FROM_START]);
    }
  });

  it('tin soạn thẳng trong khối gửi (không templateId) → inline_content', async () => {
    const stored = persist(await build(emailBody()));
    stepsOf(stored)[0].templateId = null;
    stepsOf(stored)[0].emailBody = '<p>x</p>';
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    expect(read.reasons.map((item) => item.code)).toEqual([CODE.INLINE_CONTENT]);
  });

  it('đơn vị chờ lạ / số thập phân → unsupported_delay; tin đầu có chờ → first_step_delay', async () => {
    const weeks = persist(await build(emailBody({ followUps: [fu(1, 'days', 12)] })));
    stepsOf(weeks)[1].delayUnit = 'weeks';
    expect(readSimpleFormFromGraph(weeks.nodes, weeks.connections).reasons.map((item) => item.code)).toEqual([CODE.UNSUPPORTED_DELAY]);

    const decimal = persist(await build(emailBody({ followUps: [fu(1, 'days', 12)] })));
    stepsOf(decimal)[1].delayValue = 1.5;
    expect(readSimpleFormFromGraph(decimal.nodes, decimal.connections).reasons.map((item) => item.code)).toEqual([CODE.UNSUPPORTED_DELAY]);

    const first = persist(await build(emailBody({ followUps: [fu(1, 'days', 12)] })));
    stepsOf(first)[0].delayValue = 2;
    expect(readSimpleFormFromGraph(first.nodes, first.connections).reasons.map((item) => item.code)).toEqual([CODE.FIRST_STEP_DELAY]);
  });

  it('sơ đồ có nhánh / khối rời / nối điều kiện → not_simple', async () => {
    const orphan = persist(await build(emailBody()));
    orphan.nodes.push({ id: '6000', nodeType: 'data', nodeSubtype: 'interested_customers', nodeName: 'x', config: { interestedCustomerType: 'all' } });
    expect(readSimpleFormFromGraph(orphan.nodes, orphan.connections).reasons[0].code).toBe(CODE.NOT_SIMPLE);

    const conditional = persist(await build(emailBody()));
    conditional.connections[0].conditionConfig = { operator: 'equals' };
    expect(readSimpleFormFromGraph(conditional.nodes, conditional.connections).reasons[0].code).toBe(CODE.NOT_SIMPLE);
  });

  it('nguồn không biểu diễn được: customers loại khác `all`, Zalo nhóm không chọn nhóm (= mọi nhóm) → unsupported_audience', async () => {
    const interested = persist(await build(emailBody({ audience: { type: 'customers' } })));
    interested.nodes.find((node) => node.nodeSubtype === 'interested_customers').config.interestedCustomerType = 'purchased';
    expect(readSimpleFormFromGraph(interested.nodes, interested.connections).reasons.map((item) => item.code)).toEqual([CODE.UNSUPPORTED_AUDIENCE]);

    const group = persist(await build(groupBody()));
    const groupsNode = group.nodes.find((node) => node.nodeSubtype === 'get_all_groups');
    delete groupsNode.config.zaloSelectedGroupIds;
    delete groupsNode.config.zaloGroupIds;
    expect(readSimpleFormFromGraph(group.nodes, group.connections).reasons.map((item) => item.code)).toEqual([CODE.UNSUPPORTED_AUDIENCE]);
  });

  it('khối chọn tài khoản Zalo và khối gửi trỏ hai tài khoản khác nhau → lấy tài khoản ở khối chọn (lúc chạy nó thắng)', async () => {
    const stored = persist(await build(zaloBody()));
    stored.nodes.find((node) => node.nodeSubtype === 'select_zalo_account').config.zaloAccountId = 99;
    expect(readSimpleFormFromGraph(stored.nodes, stored.connections).form.senderId).toBe(99);
  });

  it('khối chọn tài khoản Zalo không có tài khoản → not_simple "chưa chọn tài khoản gửi" (kể cả khi khối gửi có)', async () => {
    const stored = persist(await build(zaloBody()));
    stored.nodes.find((node) => node.nodeSubtype === 'select_zalo_account').config.zaloAccountId = '';
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    expect(read.form).toBeNull();
    expect(read.reasons.map((item) => item.message).join('\n')).toContain('chưa chọn tài khoản gửi');
  });

  it('sơ đồ rỗng → not_simple', () => {
    expect(readSimpleFormFromGraph([], []).reasons[0].code).toBe(CODE.NOT_SIMPLE);
  });
});

describe('readSimpleFormFromGraph — `view` (chỉ xem) khi bị chặn chỉ vì nhịp chờ', () => {
  const codes = (read) => read.reasons.map((item) => item.code);

  it('đọc đủ form (không lý do) → KHÔNG có view', async () => {
    const stored = persist(await build(emailBody({ followUps: [fu(1, 'days', 12)] })));
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    expect(read.form).not.toBeNull();
    expect(read).not.toHaveProperty('view');
  });

  it('delay_from_start → có view, giữ nguyên delayFrom/giá trị/đơn vị từng tin (không quy đổi)', async () => {
    const stored = persist(await build(zaloBody({ followUps: [fu(2, 'days', 22), fu(5, 'hours', 23)] })));
    const steps = stepsOf(stored);
    steps[1].delayFrom = 'start';
    steps[2].delayFrom = 'prev';
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    expect(read.form).toBeNull();
    expect(codes(read)).toEqual([CODE.DELAY_FROM_START]);
    expect(read.view).toEqual({
      senderId: 9,
      audience: { type: 'manual', phones: ['0912345678', '0987654321'] },
      content: tpl(21),
      firstStepDelay: { delayValue: 0, delayUnit: expect.any(String), delayFrom: expect.any(String) },
      followUps: [
        { delayValue: 2, delayUnit: 'days', delayFrom: 'start', content: tpl(22) },
        { delayValue: 5, delayUnit: 'hours', delayFrom: 'prev', content: tpl(23) },
      ],
    });
  });

  it('delayFrom vắng → giữ chuỗi rỗng (không tự điền start/prev)', async () => {
    const stored = persist(await build(zaloBody({ followUps: [fu(1, 'days', 22)] })));
    delete stepsOf(stored)[1].delayFrom;
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    expect(read.view.followUps[0]).toEqual({ delayValue: 1, delayUnit: 'days', delayFrom: '', content: tpl(22) });
  });

  it('unsupported_delay (thập phân, đơn vị lạ; tin phút hợp lệ đi cùng) → có view, giữ nguyên giá trị đã lưu', async () => {
    const stored = persist(await build(emailBody({ followUps: [fu(1, 'days', 12), fu(1, 'days', 13), fu(1, 'days', 14)] })));
    const steps = stepsOf(stored);
    steps[1].delayUnit = 'minutes'; steps[1].delayValue = 30;
    steps[2].delayUnit = 'days'; steps[2].delayValue = 1.5;
    steps[3].delayUnit = 'weeks'; steps[3].delayValue = 2;
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    expect(read.form).toBeNull();
    expect(codes(read)).toEqual([CODE.UNSUPPORTED_DELAY]);
    expect(read.view.followUps.map((item) => [item.delayValue, item.delayUnit, item.delayFrom])).toEqual([
      [30, 'minutes', 'prev'], [1.5, 'days', 'prev'], [2, 'weeks', 'prev'],
    ]);
  });

  it('first_step_delay → có view, tin 1 mang nhịp chờ gốc', async () => {
    const stored = persist(await build(emailBody({ followUps: [fu(1, 'days', 12)] })));
    stepsOf(stored)[0].delayValue = 3;
    stepsOf(stored)[0].delayUnit = 'hours';
    stepsOf(stored)[0].delayFrom = 'start';
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    expect(codes(read)).toEqual([CODE.FIRST_STEP_DELAY]);
    expect(read.view.firstStepDelay).toEqual({ delayValue: 3, delayUnit: 'hours', delayFrom: 'start' });
    expect(read.view.content).toEqual(tpl(11));
  });

  it('too_many_steps → có view đủ cả 11 tin', async () => {
    const stored = persist(await build(emailBody({ followUps: Array.from({ length: 9 }, (_, i) => fu(1, 'days', 20 + i)) })));
    sendOf(stored).config.emailSteps.push({ ...sendOf(stored).config.emailSteps[1] });
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    expect(codes(read)).toEqual([CODE.TOO_MANY_STEPS]);
    expect(read.view.followUps).toHaveLength(10);
  });

  it('nhiều lý do nhịp chờ cùng lúc vẫn có view', async () => {
    const stored = persist(await build(emailBody({ followUps: [fu(1, 'days', 12)] })));
    stepsOf(stored)[0].delayValue = 2;
    stepsOf(stored)[1].delayFrom = 'start';
    stepsOf(stored)[1].delayUnit = 'weeks'; // phút đã hợp lệ (D2) → dùng đơn vị thật sự lạ
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    expect(codes(read).sort()).toEqual([CODE.DELAY_FROM_START, CODE.FIRST_STEP_DELAY, CODE.UNSUPPORTED_DELAY].sort());
    expect(read.view).toBeDefined();
  });

  it('có thêm lý do ngoài nhóm nhịp chờ (tin soạn thẳng) → KHÔNG có view', async () => {
    const stored = persist(await build(emailBody({ followUps: [fu(1, 'days', 12)] })));
    stepsOf(stored)[1].delayFrom = 'start';
    stepsOf(stored)[0].templateId = null;
    const read = readSimpleFormFromGraph(stored.nodes, stored.connections);
    expect(codes(read)).toEqual(expect.arrayContaining([CODE.INLINE_CONTENT, CODE.DELAY_FROM_START]));
    expect(read).not.toHaveProperty('view');
  });

  it('khối nâng cao / nhiều khối gửi / nguồn lạ / thiếu tài khoản → KHÔNG có view', async () => {
    const advanced = persist(await build(emailBody({ followUps: [fu(1, 'days', 12)] })));
    stepsOf(advanced)[1].delayFrom = 'start';
    advanced.nodes.splice(1, 0, { id: '5000', nodeType: 'condition', nodeSubtype: 'condition', nodeName: 'Rẽ nhánh', config: {} });
    expect(readSimpleFormFromGraph(advanced.nodes, advanced.connections)).not.toHaveProperty('view');

    const two = persist(await build(emailBody({ followUps: [fu(1, 'days', 12)] })));
    stepsOf(two)[1].delayFrom = 'start';
    two.nodes.push({ ...sendOf(two), id: '5001' });
    expect(readSimpleFormFromGraph(two.nodes, two.connections)).not.toHaveProperty('view');

    const audience = persist(await build(emailBody({ audience: { type: 'customers' }, followUps: [fu(1, 'days', 12)] })));
    stepsOf(audience)[1].delayFrom = 'start';
    audience.nodes.find((node) => node.nodeSubtype === 'interested_customers').config.interestedCustomerType = 'purchased';
    expect(readSimpleFormFromGraph(audience.nodes, audience.connections)).not.toHaveProperty('view');

    const noSender = persist(await build(zaloBody({ followUps: [fu(1, 'days', 22)] })));
    stepsOf(noSender)[1].delayFrom = 'start';
    noSender.nodes.find((node) => node.nodeSubtype === 'select_zalo_account').config.zaloAccountId = '';
    expect(readSimpleFormFromGraph(noSender.nodes, noSender.connections)).not.toHaveProperty('view');
  });
});

describe('isRoundTripEquivalent — mỗi trường form điều khiển lệch một ca → ok:false', () => {
  const baseBody = () => emailBody({ audience: { type: 'landing', slugs: ['a'] }, content: tpl(11), followUps: [fu(2, 'days', 12), fu(3, 'days', 13)] });
  const zaloGroupBody = () => groupBody({ followUps: [fu(1, 'days', 32)] });
  const zaloPersonalBody = () => zaloBody({ followUps: [fu(1, 'days', 22)] });

  async function pair(body, mutate) {
    const stored = persist(await build(body));
    const rebuilt = persist(await build(body));
    mutate({ stored, rebuilt });
    return isRoundTripEquivalent(stored, rebuilt);
  }

  it('hai bản giống hệt (mã khối khác nhau) → ok', async () => {
    expect(await pair(baseBody(), () => {})).toEqual({ ok: true, diffs: [] });
  });

  it('templateId của tin 1 lệch → không editable', async () => {
    const result = await pair(baseBody(), ({ stored }) => { stepsOf(stored)[0].templateId = 999; });
    expect(result.ok).toBe(false);
    expect(result.diffs.join('\n')).toContain('templateId');
  });

  it('templateId của tin 3 lệch → không editable', async () => {
    const result = await pair(baseBody(), ({ stored }) => { stepsOf(stored)[2].templateId = 999; });
    expect(result.ok).toBe(false);
  });

  it('delayValue tin 2 lệch → không editable', async () => {
    const result = await pair(baseBody(), ({ stored }) => { stepsOf(stored)[1].delayValue = 9; });
    expect(result.ok).toBe(false);
    expect(result.diffs.join('\n')).toContain('delayValue');
  });

  it('delayUnit tin 2 lệch → không editable', async () => {
    const result = await pair(baseBody(), ({ stored }) => { stepsOf(stored)[1].delayUnit = 'hours'; });
    expect(result.ok).toBe(false);
  });

  it('khứ hồi khớp với phút; đổi phút → giờ ở bản lưu thì lệch', async () => {
    const body = () => emailBody({ audience: { type: 'landing', slugs: ['a'] }, content: tpl(11), followUps: [fu(30, 'minutes', 12)] });
    expect(await pair(body(), () => {})).toEqual({ ok: true, diffs: [] });
    const result = await pair(body(), ({ stored }) => { stepsOf(stored)[1].delayUnit = 'hours'; });
    expect(result.ok).toBe(false);
    expect(result.diffs.join('\n')).toContain('delayUnit');
  });

  it('delayFrom tin 2 lệch (prev → start) → không editable', async () => {
    const result = await pair(baseBody(), ({ stored }) => { stepsOf(stored)[1].delayFrom = 'start'; });
    expect(result.ok).toBe(false);
    expect(result.diffs.join('\n')).toContain('delayFrom');
  });

  it('số bước lệch → không editable', async () => {
    const result = await pair(baseBody(), ({ stored }) => { stepsOf(stored).pop(); });
    expect(result.ok).toBe(false);
  });

  it('tài khoản gửi email lệch → không editable', async () => {
    const result = await pair(baseBody(), ({ stored }) => { sendOf(stored).config.fromEmailId = 77; });
    expect(result.ok).toBe(false);
    expect(result.diffs.join('\n')).toContain('fromEmailId');
  });

  it('tài khoản Zalo lệch ở khối chọn tài khoản → không editable', async () => {
    const select = await pair(zaloPersonalBody(), ({ stored }) => { stored.nodes.find((n) => n.nodeSubtype === 'select_zalo_account').config.zaloAccountId = 77; });
    expect(select.ok).toBe(false);
    expect(select.diffs.join('\n')).toContain('select_zalo_account#1.zaloAccountId');
  });

  it('tài khoản Zalo lệch ở khối gửi: có khối chọn tài khoản đứng trước thì bỏ qua (lúc chạy không đọc), không có thì không editable', async () => {
    const withSelect = await pair(zaloPersonalBody(), ({ stored }) => { sendOf(stored).config.zaloAccountId = 77; });
    expect(withSelect).toEqual({ ok: true, diffs: [] });
    const dropSelect = (graph) => {
      const select = graph.nodes.find((n) => n.nodeSubtype === 'select_zalo_account');
      const into = graph.connections.find((c) => String(c.targetNodeId) === String(select.id));
      const out = graph.connections.find((c) => String(c.sourceNodeId) === String(select.id));
      graph.nodes.splice(graph.nodes.indexOf(select), 1);
      graph.connections = graph.connections.filter((c) => c !== into && c !== out);
      graph.connections.push({ sourceNodeId: into.sourceNodeId, targetNodeId: out.targetNodeId, connectionType: 'default' });
    };
    const noSelect = await pair(zaloPersonalBody(), ({ stored, rebuilt }) => {
      dropSelect(stored);
      dropSelect(rebuilt);
      sendOf(stored).config.zaloAccountId = 77;
    });
    expect(noSelect.ok).toBe(false);
    expect(noSelect.diffs.join('\n')).toContain('zaloAccountId');
  });

  it('slug landing lệch → không editable', async () => {
    const result = await pair(baseBody(), ({ stored }) => { stored.nodes.find((n) => n.nodeSubtype === 'read_landing_leads').config.landingLeadsSlugs = ['b']; });
    expect(result.ok).toBe(false);
  });

  it('nguồn đổi loại (landing → customers) → không editable', async () => {
    const result = await pair(baseBody(), ({ stored }) => {
      const node = stored.nodes.find((n) => n.nodeSubtype === 'read_landing_leads');
      node.nodeSubtype = 'interested_customers';
      node.config = { interestedCustomerType: 'all' };
    });
    expect(result.ok).toBe(false);
  });

  it('danh sách email nhập tay lệch (thêm 1 địa chỉ) → không editable', async () => {
    const result = await pair(emailBody(), ({ stored }) => { sendOf(stored).config.recipientEmails.push('c@x.com'); });
    expect(result.ok).toBe(false);
  });

  it('danh sách SĐT nhập tay lệch → không editable', async () => {
    const result = await pair(zaloBody(), ({ stored }) => { sendOf(stored).config.zaloRecipientPhones = ['0911111111']; });
    expect(result.ok).toBe(false);
  });

  it('nhóm Zalo lệch ở khối lấy nhóm (`zaloSelectedGroupIds` — chỗ lúc chạy đọc) → không editable', async () => {
    const onSource = await pair(zaloGroupBody(), ({ stored }) => { stored.nodes.find((n) => n.nodeSubtype === 'get_all_groups').config.zaloSelectedGroupIds = ['111']; });
    expect(onSource.ok).toBe(false);
  });

  it('danh sách nhóm ở khối gửi: nguồn là khối phía trước thì lúc chạy không đọc → bỏ qua; nguồn nhập tay thì lệch → không editable', async () => {
    const fromNode = await pair(zaloGroupBody(), ({ stored }) => { sendOf(stored).config.zaloGroupIds = ['999']; });
    expect(fromNode).toEqual({ ok: true, diffs: [] });
    const manual = await pair(zaloGroupBody(), ({ stored, rebuilt }) => {
      sendOf(stored).config.zaloGroupSource = 'manual';
      sendOf(rebuilt).config.zaloGroupSource = 'manual';
      sendOf(stored).config.zaloGroupIds = ['999'];
    });
    expect(manual.ok).toBe(false);
    expect(manual.diffs.join('\n')).toContain('zaloGroupIds');
  });

  it('sheet: URL / tên tab / cột đã chọn lệch → không editable', async () => {
    const body = emailBody({ audience: { type: 'sheet', sheetUrl: 'https://docs.google.com/spreadsheets/d/abc123/edit', sheetName: 'T1' } });
    const node = (stored) => stored.nodes.find((n) => n.nodeSubtype === 'read_sheet');
    expect((await pair(body, ({ stored }) => { node(stored).config.sheetUrl = 'https://docs.google.com/spreadsheets/d/zzz/edit'; })).ok).toBe(false);
    expect((await pair(body, ({ stored }) => { node(stored).config.sheetName = 'T2'; })).ok).toBe(false);
    expect((await pair(body, ({ stored }) => { node(stored).config.dataSelectedColumns = ['A']; })).ok).toBe(false);
  });

  it('biểu mẫu lệch → không editable', async () => {
    const result = await pair(emailBody({ audience: { type: 'form', formIds: [7] } }), ({ stored }) => { stored.nodes.find((n) => n.nodeSubtype === 'read_form_submissions').config.formIds = [8]; });
    expect(result.ok).toBe(false);
  });

  it('customers: loại khối khác `all` → không editable', async () => {
    const result = await pair(emailBody({ audience: { type: 'customers' } }), ({ stored }) => { stored.nodes.find((n) => n.nodeSubtype === 'interested_customers').config.interestedCustomerType = 'purchased'; });
    expect(result.ok).toBe(false);
  });

  it('thứ tự khối / thêm khối / bớt khối → không editable', async () => {
    const extra = await pair(baseBody(), ({ stored }) => {
      // Khối có tác dụng lúc chạy (chờ). Khối `end` ở cuối thì được bỏ qua có chủ đích — xem ca "dữ liệu prod 17/10/2026".
      stored.nodes.push({ id: '8000', nodeType: 'logic', nodeSubtype: 'wait_time', nodeName: 'Chờ', config: { waitValue: 1, waitUnit: 'days' } });
      stored.connections.push({ sourceNodeId: sendOf(stored).id, targetNodeId: '8000', connectionType: 'default' });
    });
    expect(extra.ok).toBe(false);
    const missing = await pair(zaloPersonalBody(), ({ stored }) => {
      const select = stored.nodes.find((n) => n.nodeSubtype === 'select_zalo_account');
      const trigger = stored.nodes[0];
      stored.nodes.splice(stored.nodes.indexOf(select), 1);
      stored.connections = [{ sourceNodeId: trigger.id, targetNodeId: stored.nodes[1].id, connectionType: 'default' }];
    });
    expect(missing.ok).toBe(false);
  });

  it('nối khối lệch (khối nối nhầm vào nhau / có nhánh) → không editable', async () => {
    const result = await pair(baseBody(), ({ stored }) => { stored.connections[0].connectionType = 'true'; });
    expect(result.ok).toBe(false);
  });

  it('cài đặt nâng cao form không điều khiển (file đính kèm, cc, tắt theo dõi link, chế độ gửi) lệch → không editable', async () => {
    expect((await pair(baseBody(), ({ stored }) => { stepsOf(stored)[0].attachments = [{ key: 'uploads/7/a.pdf' }]; })).ok).toBe(false);
    expect((await pair(baseBody(), ({ stored }) => { sendOf(stored).config.ccEnabled = true; })).ok).toBe(false);
    expect((await pair(baseBody(), ({ stored }) => { stepsOf(stored)[1].enableLinkTracking = false; })).ok).toBe(false);
    expect((await pair(baseBody(), ({ stored }) => { sendOf(stored).config.sendMode = 'all'; })).ok).toBe(false);
    expect((await pair(zaloPersonalBody(), ({ stored }) => { stored.nodes.find((n) => n.nodeSubtype === 'select_zalo_account').config.zaloPoolMultiAccountEnabled = true; })).ok).toBe(false);
  });

  it('thứ KHÔNG phải trường form điều khiển thì bỏ qua: tên khối, vị trí, nội dung chữ trong bước dùng mẫu, mã khối', async () => {
    const result = await pair(baseBody(), ({ stored }) => {
      stored.nodes.forEach((node) => { node.nodeName = 'Tên khác'; node.positionX = 9999; });
      stepsOf(stored)[0].emailSubject = 'chữ còn sót';
      stepsOf(stored)[1].templateMappings = [{ key: 'x' }];
    });
    expect(result).toEqual({ ok: true, diffs: [] });
  });

  it('bước 0 `delayFrom` start (Once) so với prev (Drip) không phải khác biệt khi tin đầu không chờ', async () => {
    const result = await pair(baseBody(), ({ stored }) => { stepsOf(stored)[0].delayFrom = 'start'; });
    expect(result.ok).toBe(true);
  });

  it('trigger `manual_trigger` coi như `manual`', async () => {
    const result = await pair(baseBody(), ({ stored }) => { stored.nodes[0].nodeSubtype = 'manual_trigger'; });
    expect(result.ok).toBe(true);
  });

  it('đồ thị không phải đường thẳng ở một trong hai bên → ok:false kèm lý do', () => {
    const a = { nodes: [{ id: '1', nodeSubtype: 'manual', config: {} }, { id: '2', nodeSubtype: 'send_email', config: {} }], connections: [] };
    const b = { nodes: [{ id: '1', nodeSubtype: 'manual', config: {} }], connections: [] };
    expect(isRoundTripEquivalent(a, b).ok).toBe(false);
  });
});
