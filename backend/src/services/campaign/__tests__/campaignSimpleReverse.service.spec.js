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
const { readSimpleFormFromGraph, isRoundTripEquivalent, READ_ONLY_REASON_CODES: CODE } = reverse;
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

  it('đơn vị chờ phút / số thập phân → unsupported_delay; tin đầu có chờ → first_step_delay', async () => {
    const minutes = persist(await build(emailBody({ followUps: [fu(1, 'days', 12)] })));
    stepsOf(minutes)[1].delayUnit = 'minutes';
    expect(readSimpleFormFromGraph(minutes.nodes, minutes.connections).reasons.map((item) => item.code)).toEqual([CODE.UNSUPPORTED_DELAY]);

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

  it('khối chọn tài khoản Zalo và khối gửi trỏ hai tài khoản khác nhau → không đọc được', async () => {
    const stored = persist(await build(zaloBody()));
    stored.nodes.find((node) => node.nodeSubtype === 'select_zalo_account').config.zaloAccountId = 99;
    expect(readSimpleFormFromGraph(stored.nodes, stored.connections).form).toBeNull();
  });

  it('sơ đồ rỗng → not_simple', () => {
    expect(readSimpleFormFromGraph([], []).reasons[0].code).toBe(CODE.NOT_SIMPLE);
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

  it('tài khoản Zalo lệch ở khối chọn tài khoản hoặc khối gửi → không editable', async () => {
    const select = await pair(zaloPersonalBody(), ({ stored }) => { stored.nodes.find((n) => n.nodeSubtype === 'select_zalo_account').config.zaloAccountId = 77; });
    expect(select.ok).toBe(false);
    const send = await pair(zaloPersonalBody(), ({ stored }) => { sendOf(stored).config.zaloAccountId = 77; });
    expect(send.ok).toBe(false);
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

  it('nhóm Zalo lệch (trên khối nguồn hoặc khối gửi) → không editable', async () => {
    const onSource = await pair(zaloGroupBody(), ({ stored }) => { stored.nodes.find((n) => n.nodeSubtype === 'get_all_groups').config.zaloSelectedGroupIds = ['111']; });
    expect(onSource.ok).toBe(false);
    const onSend = await pair(zaloGroupBody(), ({ stored }) => { sendOf(stored).config.zaloGroupIds = ['999']; });
    expect(onSend.ok).toBe(false);
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
