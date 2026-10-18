import { describe, expect, it } from 'vitest';
import vi from '../../../../i18n/vi';
import { AUDIENCE_TYPES_BY_CHANNEL } from '../../simple/simpleCampaign.helpers';
import { createBuilderNode, makeUniqueNodeName } from '../../utils/createBuilderNode';
import { validateNodeForRun } from '../../utils/campaignBuilderRunValidation';
import { countMissingSections, readSettingsSections } from '../sections';
import {
  analyzeSettingsGraph,
  appendSideStep,
  buildSettingsSkeleton,
  classifyAudienceChange,
  getSkeletonChain,
  removeSideStep,
  remapNodeReferences,
  replaceAudienceSource,
} from '../settingsGraph';

const t = (key, params = {}) => {
  const raw = key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), vi);
  if (typeof raw !== 'string') return key;
  return raw.replace(/\{(\w+)\}/g, (_, name) => (params[name] === undefined ? `{${name}}` : String(params[name])));
};

/** Bảng ghim TỪNG cặp (loại chiến dịch × nguồn) → dãy subtype theo ĐÚNG bộ biên dịch (campaignCompiler.service.js). */
const TRIG = 'manual_trigger';
const EXPECTED = [
  // email: khởi chạy → [nguồn] → send_email (nhập tay: khởi chạy → send_email)
  ['email', 'customers', [TRIG, 'read_interested_customers', 'send_email']],
  ['email', 'landing', [TRIG, 'read_landing_leads', 'send_email']],
  ['email', 'form', [TRIG, 'read_form_submissions', 'send_email']],
  ['email', 'sheet', [TRIG, 'read_sheet', 'send_email']],
  ['email', 'manual', [TRIG, 'send_email']],
  // Zalo cá nhân: khởi chạy → select_zalo_account → [nguồn] → send_zalo_personal
  ['zalo', 'customers', [TRIG, 'select_zalo_account', 'read_interested_customers', 'send_zalo_personal']],
  ['zalo', 'landing', [TRIG, 'select_zalo_account', 'read_landing_leads', 'send_zalo_personal']],
  ['zalo', 'form', [TRIG, 'select_zalo_account', 'read_form_submissions', 'send_zalo_personal']],
  ['zalo', 'sheet', [TRIG, 'select_zalo_account', 'read_sheet', 'send_zalo_personal']],
  ['zalo', 'manual', [TRIG, 'select_zalo_account', 'send_zalo_personal']],
  ['zalo', 'zalo_friends', [TRIG, 'select_zalo_account', 'get_all_friends', 'send_zalo_personal']],
  // Zalo nhóm: khởi chạy → select_zalo_account → get_all_groups → send_zalo_group
  ['zalo', 'zalo_groups', [TRIG, 'select_zalo_account', 'get_all_groups', 'send_zalo_group']],
  // Telegram: khởi chạy → send_telegram (người đã nhắn / nhóm nằm trong khối gửi)
  ['telegram', 'conversations', [TRIG, 'send_telegram']],
  ['telegram', 'telegram_groups', [TRIG, 'send_telegram']],
  // WhatsApp: khởi chạy → [nguồn đọc dữ liệu nếu có] → send_whatsapp
  ['whatsapp', 'conversations', [TRIG, 'send_whatsapp']],
  ['whatsapp', 'whatsapp_groups', [TRIG, 'send_whatsapp']],
  ['whatsapp', 'customers', [TRIG, 'read_interested_customers', 'send_whatsapp']],
  ['whatsapp', 'landing', [TRIG, 'read_landing_leads', 'send_whatsapp']],
  ['whatsapp', 'form', [TRIG, 'read_form_submissions', 'send_whatsapp']],
  ['whatsapp', 'sheet', [TRIG, 'read_sheet', 'send_whatsapp']],
];

const subtypes = (nodes) => nodes.map((node) => node.data.nodeType);
const ids = (nodes) => nodes.map((node) => node.id);

describe('buildSettingsSkeleton — bảng kênh × nguồn', () => {
  it('bảng ghim phủ ĐÚNG mọi cặp của AUDIENCE_TYPES_BY_CHANNEL', () => {
    const covered = new Set(EXPECTED.map(([channel, audience]) => `${channel}:${audience}`));
    const all = Object.entries(AUDIENCE_TYPES_BY_CHANNEL).flatMap(([channel, types]) => types.map((type) => `${channel}:${type}`));
    expect([...covered].sort()).toEqual([...all].sort());
  });

  it.each(EXPECTED)('%s × %s → dãy khối đúng, cạnh nối liên tiếp, mỗi khối đúng hình dạng createBuilderNode', (channel, audienceType, expectedChain) => {
    const { nodes, edges, sendNodeId } = buildSettingsSkeleton({ campaignType: channel, audienceType });
    expect(subtypes(nodes)).toEqual(expectedChain);
    expect(getSkeletonChain(channel, audienceType)).toEqual(expectedChain);
    // Cạnh: khối i → khối i+1, không thừa không thiếu.
    expect(edges.map((edge) => [edge.source, edge.target])).toEqual(ids(nodes).slice(0, -1).map((id, index) => [id, ids(nodes)[index + 1]]));
    expect(sendNodeId).toBe(nodes[nodes.length - 1].id);
    // Id không trùng; hình dạng khớp createBuilderNode (start cho khởi chạy, task cho còn lại).
    expect(new Set(ids(nodes)).size).toBe(nodes.length);
    nodes.forEach((node, index) => {
      const reference = createBuilderNode(node.data.nodeType, node.position, { id: node.id, locale: 'vi', registry: [] });
      expect(node.type).toBe(reference.type);
      expect(node.type).toBe(index === 0 ? 'start' : 'task');
      expect(Object.keys(node.data).filter((key) => key !== 'config').sort()).toEqual(['label', 'nodeType']);
      expect(String(node.data.label).length).toBeGreaterThan(0);
    });
    // Vị trí xếp trái → phải đều nhau.
    const xs = nodes.map((node) => node.position.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs.slice(1).map((x, i) => x - xs[i])).size).toBe(1);
  });

  it('nguồn không thuộc kênh → ném lỗi', () => {
    expect(() => buildSettingsSkeleton({ campaignType: 'telegram', audienceType: 'sheet' })).toThrow();
    expect(() => buildSettingsSkeleton({ campaignType: 'email', audienceType: 'zalo_groups' })).toThrow();
    expect(() => buildSettingsSkeleton({ campaignType: 'mixed', audienceType: 'sheet' })).toThrow();
  });

  it('khối gửi tham chiếu đúng khối nguồn bằng trường bộ biên dịch ghi', () => {
    const email = buildSettingsSkeleton({ campaignType: 'email', audienceType: 'sheet' });
    const emailSend = email.nodes[2].data.config;
    expect(emailSend).toMatchObject({ recipientSource: 'node', recipientNodeId: email.nodes[1].id, recipientField: '' });
    expect(buildSettingsSkeleton({ campaignType: 'email', audienceType: 'customers' }).nodes[2].data.config.recipientField).toBe('email');
    expect(buildSettingsSkeleton({ campaignType: 'email', audienceType: 'manual' }).nodes[1].data.config).toMatchObject({ recipientSource: 'manual', recipientNodeId: '' });

    const zalo = buildSettingsSkeleton({ campaignType: 'zalo', audienceType: 'landing' });
    expect(zalo.nodes[3].data.config).toMatchObject({ zaloRecipientSource: 'node', zaloRecipientNodeId: zalo.nodes[2].id, zaloRecipientField: 'phone', zaloRecipientType: 'phone' });

    const friends = buildSettingsSkeleton({ campaignType: 'zalo', audienceType: 'zalo_friends' });
    expect(friends.nodes[2].data.config.zaloFriendAccountNodeId).toBe(friends.nodes[1].id);
    expect(friends.nodes[3].data.config).toMatchObject({ zaloRecipientSource: 'node', zaloRecipientNodeId: friends.nodes[2].id, zaloRecipientField: 'uid', zaloRecipientType: 'uid' });

    const groups = buildSettingsSkeleton({ campaignType: 'zalo', audienceType: 'zalo_groups' });
    expect(groups.nodes[2].data.config.zaloGroupAccountNodeId).toBe(groups.nodes[1].id);
    expect(groups.nodes[3].data.config).toMatchObject({ zaloGroupSource: 'node', zaloGroupNodeId: groups.nodes[2].id, zaloGroupField: 'groupId' });

    const wa = buildSettingsSkeleton({ campaignType: 'whatsapp', audienceType: 'form' });
    expect(wa.nodes[2].data.config).toMatchObject({ recipientSource: 'node', recipientNodeId: wa.nodes[1].id, recipientColumn: 'phone' });
    expect(buildSettingsSkeleton({ campaignType: 'whatsapp', audienceType: 'conversations' }).nodes[1].data.config.recipientSource).toBe('whatsapp_conversations');
    expect(buildSettingsSkeleton({ campaignType: 'whatsapp', audienceType: 'whatsapp_groups' }).nodes[1].data.config).toMatchObject({ recipientSource: 'whatsapp_groups', recipientKeys: [] });
    expect(buildSettingsSkeleton({ campaignType: 'telegram', audienceType: 'telegram_groups' }).nodes[1].data.config).toMatchObject({ recipientSource: 'telegram_groups', recipientKeys: [] });
    expect(buildSettingsSkeleton({ campaignType: 'telegram', audienceType: 'conversations' }).nodes[1].data.config.recipientSource).toBe('telegram_conversations');
  });

  it('loại chiến dịch zalo_group / telegram_group dùng bảng của kênh Zalo / Telegram', () => {
    expect(subtypes(buildSettingsSkeleton({ campaignType: 'zalo_group', audienceType: 'zalo_groups' }).nodes)).toEqual([TRIG, 'select_zalo_account', 'get_all_groups', 'send_zalo_group']);
    expect(subtypes(buildSettingsSkeleton({ campaignType: 'telegram_group', audienceType: 'telegram_groups' }).nodes)).toEqual([TRIG, 'send_telegram']);
  });
});

// ── Kiểm thật: khung + điền đủ ở Thiết lập → validateNodeForRun sạch, không còn mục nào thiếu ────────────────────────────────
const fillSkeleton = (nodes) => nodes.map((node) => {
  const config = { ...(node.data.config || {}) };
  switch (node.data.nodeType) {
    case 'send_email':
      config.emailSteps = [{ ...config.emailSteps[0], templateId: 7 }];
      if (config.recipientSource === 'manual') config.recipientEmails = 'a@b.vn';
      if (config.recipientSource === 'node' && !config.recipientField) config.recipientField = 'email';
      break;
    case 'send_zalo_personal':
      config.zaloPersonalTemplateSteps = [{ ...config.zaloPersonalTemplateSteps[0], templateId: 21 }];
      if (config.zaloRecipientSource === 'manual') config.zaloRecipientPhones = '0912345678';
      if (config.zaloRecipientSource === 'node' && !config.zaloRecipientField) config.zaloRecipientField = 'phone';
      break;
    case 'send_zalo_group':
      config.zaloGroupTemplateSteps = [{ ...config.zaloGroupTemplateSteps[0], templateId: 21 }];
      break;
    case 'send_telegram':
      config.telegramAccountId = 4;
      config.steps = [{ templateId: null, message: 'Xin chào' }];
      if (config.recipientSource === 'telegram_groups') config.recipientKeys = [{ recipientKey: 'g1', display: 'Nhóm 1' }];
      break;
    case 'send_whatsapp':
      config.whatsappSessionKey = '40-default';
      config.steps = [{ templateId: null, message: 'Xin chào' }];
      if (config.recipientSource === 'whatsapp_groups') config.recipientKeys = [{ recipientKey: 'g1', display: 'Nhóm 1' }];
      if (config.recipientSource === 'node' && !config.recipientColumn) config.recipientColumn = 'phone';
      break;
    case 'select_zalo_account':
      config.zaloAccountId = '5';
      break;
    case 'read_form_submissions':
      config.formIds = [1];
      break;
    case 'read_sheet':
      config.sheetUrl = 'https://docs.google.com/spreadsheets/d/abc';
      break;
    case 'read_landing_leads':
      config.landingLeadsSlugs = ['trang-a'];
      break;
    case 'get_all_friends':
      config.zaloSelectedFriendIds = ['u1'];
      break;
    case 'get_all_groups':
      config.zaloSelectedGroupIds = ['g1'];
      config.zaloGroupSelectionSnapshotLocked = false;
      break;
    default:
      break;
  }
  return { ...node, data: { ...node.data, config } };
});

const lookups = {
  emailTemplates: [{ id: 7, templateName: 'Chào mừng' }],
  zaloTemplates: [{ id: 21, templateName: 'Mời học' }],
  emailSettings: [{ id: 3, name: 'CSKH', email: 'cskh@abc.vn' }],
  zaloAccounts: [{ id: '5', displayName: 'Shop Hoa' }],
  telegramAccounts: [{ id: 4, name: 'Bot A', username: 'bota' }],
  whatsappAccounts: [{ sessionKey: '40-default', display: '+84 912 345 678' }],
};

describe('khung khối dùng được thật', () => {
  it.each(EXPECTED)('%s × %s: vừa sinh còn thiếu, điền đủ thì không còn mục nào thiếu và validateNodeForRun không báo lỗi cấu trúc', (channel, audienceType) => {
    const skeleton = buildSettingsSkeleton({ campaignType: channel, audienceType });
    const ctx = { campaignType: channel, locale: 'vi', lookups, t };
    expect(countMissingSections(readSettingsSections(skeleton.nodes, skeleton.edges, ctx))).toBeGreaterThan(0);

    const filled = fillSkeleton(skeleton.nodes);
    expect(countMissingSections(readSettingsSections(filled, skeleton.edges, ctx))).toBe(0);
    filled.forEach((node) => {
      const result = validateNodeForRun(node);
      // Chỉ chấp nhận lỗi "chưa có dữ liệu thật để chạy" (vd sheet thiếu tab); không được thiếu id / nguồn / cột người nhận.
      if (result.status === 'failed') expect(result.message).not.toMatch(/Chưa chọn node dữ liệu|Chưa chọn nguồn người nhận|Chưa chọn cột|Chưa chọn email gửi/);
    });
  });
});

describe('buildSettingsSkeleton — tài khoản "Gửi từ" chọn trước (PR-C)', () => {
  /** Trường tài khoản đúng mà bộ biên dịch / form dùng, theo kênh: [subtype nhận, trường, giá trị mong đợi]. */
  const SENDER_FIELD = {
    email: ['send_email', 'fromEmailId', 7],
    zalo: ['select_zalo_account', 'zaloAccountId', 7],
    telegram: ['send_telegram', 'telegramAccountId', 7],
    whatsapp: ['send_whatsapp', 'whatsappSessionKey', '40-default'],
  };

  it.each(EXPECTED)('%s × %s: có sender → điền đúng trường của khối nhận, khối khác không dính', (channel, audienceType) => {
    const [subtype, field, expected] = SENDER_FIELD[channel];
    const sender = { id: channel === 'whatsapp' ? '40-default' : 7, label: 'Tài khoản thử' };
    const withSender = buildSettingsSkeleton({ campaignType: channel, audienceType, sender });
    const receiver = withSender.nodes.find((node) => node.data.nodeType === subtype);
    expect(receiver.data.config[field]).toBe(expected);
    // Chỉ khối nhận có trường tài khoản; Zalo: khối gửi KHÔNG ghi zaloAccountId (runtime lấy từ khối chọn tài khoản).
    withSender.nodes.filter((node) => node !== receiver).forEach((node) => {
      ['fromEmailId', 'zaloAccountId', 'telegramAccountId', 'whatsappSessionKey'].forEach((key) => expect(node.data.config?.[key]).toBeUndefined());
    });
    // Khung (chuỗi + cạnh) không đổi vì có sender.
    const without = buildSettingsSkeleton({ campaignType: channel, audienceType });
    expect(withSender.nodes.map((node) => node.data.nodeType)).toEqual(without.nodes.map((node) => node.data.nodeType));
    expect(withSender.edges).toHaveLength(without.edges.length);
  });

  it.each(EXPECTED)('%s × %s: không có sender → như cũ (email không có fromEmailId, Zalo để trống zaloAccountId, TG/WA không có trường)', (channel, audienceType) => {
    const [subtype, field] = SENDER_FIELD[channel];
    const receiver = buildSettingsSkeleton({ campaignType: channel, audienceType }).nodes.find((node) => node.data.nodeType === subtype);
    if (channel === 'zalo') expect(receiver.data.config.zaloAccountId).toBe('');
    else expect(receiver.data.config[field]).toBeUndefined();
  });

  it('Zalo nhóm: tài khoản vào khối chọn tài khoản, khối lấy nhóm vẫn trỏ khối đó', () => {
    const skeleton = buildSettingsSkeleton({ campaignType: 'zalo_group', audienceType: 'zalo_groups', sender: { id: '12' } });
    const [, account, groups, send] = skeleton.nodes;
    expect(account.data.config.zaloAccountId).toBe(12);
    expect(groups.data.config.zaloGroupAccountNodeId).toBe(account.id);
    expect(send.data.config.zaloAccountId).toBeUndefined();
  });

  it('sender có id rỗng / không phải số (email, Zalo, Telegram) → bỏ qua, không ghi NaN', () => {
    ['', null, undefined, 'abc'].forEach((id) => {
      const email = buildSettingsSkeleton({ campaignType: 'email', audienceType: 'manual', sender: { id } });
      expect(email.nodes[1].data.config.fromEmailId).toBeUndefined();
    });
  });

  it('chọn tài khoản → mục Gửi từ ✓ (Zalo / Telegram / WhatsApp); email để trống thì phụ thuộc có tài khoản mặc định', () => {
    const rowOf = (campaignType, audienceType, sender) => {
      const skeleton = buildSettingsSkeleton({ campaignType, audienceType, sender });
      return readSettingsSections(skeleton.nodes, skeleton.edges, { campaignType, locale: 'vi', lookups: { ...lookups, emailSettings: [] }, t }).sender;
    };
    expect(rowOf('zalo', 'customers', null).status).toBe('missing');
    expect(rowOf('zalo', 'customers', { id: 5 }).status).toBe('ok');
    expect(rowOf('telegram', 'conversations', null).status).toBe('missing');
    expect(rowOf('telegram', 'conversations', { id: 4 }).status).toBe('ok');
    expect(rowOf('whatsapp', 'conversations', null).status).toBe('missing');
    expect(rowOf('whatsapp', 'conversations', { id: '40-default' }).status).toBe('ok');
    expect(rowOf('email', 'manual', null).status).toBe('missing');
    expect(rowOf('email', 'manual', { id: 3 }).status).toBe('ok');
  });
});

// ── Phân tích rẽ nhánh ──────────────────────────────────────────────────────────────────────────────────────────────────
const emailSkeleton = () => buildSettingsSkeleton({ campaignType: 'email', audienceType: 'customers' });

describe('analyzeSettingsGraph', () => {
  it('chuỗi thẳng: không rẽ nhánh, chain theo thứ tự, không khối nào bị khoá', () => {
    const { nodes, edges } = emailSkeleton();
    const result = analyzeSettingsGraph(nodes, edges);
    expect(result.branched).toBe(false);
    expect(result.chain).toEqual(ids(nodes));
    expect(result.lockedIds.size).toBe(0);
  });

  it('một khối có 2 cạnh ra → rẽ nhánh; khối đó và hàng xóm bị khoá', () => {
    const { nodes, edges } = emailSkeleton();
    const extra = createBuilderNode('send_email', { x: 0, y: 0 }, { id: 'extra', registry: [] });
    const result = analyzeSettingsGraph([...nodes, extra], [...edges, { id: 'e-x', source: nodes[1].id, target: 'extra' }]);
    expect(result.branched).toBe(true);
    expect(result.chain).toEqual([]);
    expect(result.lockedIds.has(nodes[1].id)).toBe(true);
    expect(result.lockedIds.has(nodes[0].id)).toBe(true);
    expect(result.lockedIds.has('extra')).toBe(true);
  });

  it('có khối condition → coi là rẽ nhánh', () => {
    const { nodes, edges } = emailSkeleton();
    const cond = createBuilderNode('condition', { x: 0, y: 0 }, { id: 'cond', registry: [] });
    expect(analyzeSettingsGraph([...nodes, cond], edges).branched).toBe(true);
  });
});

// ── Thêm / xoá bước phụ ────────────────────────────────────────────────────────────────────────────────────────────────
describe('appendSideStep / removeSideStep', () => {
  it('thêm Gắn thẻ vào cuối chuỗi: nối khối gửi → bước mới, tham chiếu danh bạ trỏ khối nguồn', () => {
    const { nodes, edges, sendNodeId, sourceNodeId } = emailSkeleton();
    const result = appendSideStep({ nodes, edges, subtype: 'tag_contact', registry: [] });
    expect(subtypes(result.nodes)).toEqual([TRIG, 'read_interested_customers', 'send_email', 'tag_contact']);
    expect(result.edges.map((edge) => [edge.source, edge.target])).toContainEqual([sendNodeId, result.newNodeId]);
    expect(result.edges).toHaveLength(edges.length + 1);
    expect(result.nodes.find((node) => node.id === result.newNodeId).data.config.tagSourceNodeId).toBe(sourceNodeId);
  });

  it('thêm hai bước liên tiếp: nối đúng thứ tự cuối chuỗi', () => {
    const first = appendSideStep({ ...emailSkeleton(), subtype: 'tag_contact', registry: [] });
    const second = appendSideStep({ nodes: first.nodes, edges: first.edges, subtype: 'update_attribute', registry: [] });
    const analysis = analyzeSettingsGraph(second.nodes, second.edges);
    expect(analysis.chain.slice(-2)).toEqual([first.newNodeId, second.newNodeId]);
    expect(analysis.branched).toBe(false);
  });

  it('chèn trước khối end nếu có', () => {
    const { nodes, edges, sendNodeId } = emailSkeleton();
    const end = createBuilderNode('end', { x: 900, y: 200 }, { id: 'end-1', registry: [] });
    const result = appendSideStep({ nodes: [...nodes, { ...end, type: 'end' }], edges: [...edges, { id: 'e-end', source: sendNodeId, target: 'end-1' }], subtype: 'tag_contact', registry: [] });
    const chain = analyzeSettingsGraph(result.nodes, result.edges).chain;
    expect(chain.slice(-3)).toEqual([sendNodeId, result.newNodeId, 'end-1']);
  });

  it('sơ đồ rẽ nhánh / loại bước lạ → không thêm', () => {
    const { nodes, edges } = emailSkeleton();
    const extra = createBuilderNode('send_email', { x: 0, y: 0 }, { id: 'extra', registry: [] });
    expect(appendSideStep({ nodes: [...nodes, extra], edges: [...edges, { id: 'e-x', source: nodes[1].id, target: 'extra' }], subtype: 'tag_contact', registry: [] })).toBeNull();
    expect(appendSideStep({ nodes, edges, subtype: 'condition', registry: [] })).toBeNull();
  });

  it('xoá bước phụ giữa chuỗi: nối lại khối trước với khối sau, gỡ tham chiếu tới nó', () => {
    const first = appendSideStep({ ...emailSkeleton(), subtype: 'tag_contact', registry: [] });
    const second = appendSideStep({ nodes: first.nodes, edges: first.edges, subtype: 'update_attribute', registry: [] });
    // Một khối khác tham chiếu tới bước sắp xoá.
    const withRef = second.nodes.map((node) => (node.id === second.newNodeId
      ? { ...node, data: { ...node.data, config: { ...node.data.config, attributeSourceNodeId: first.newNodeId } } }
      : node));
    const removed = removeSideStep({ nodes: withRef, edges: second.edges, nodeId: first.newNodeId });
    expect(removed.nodes.some((node) => node.id === first.newNodeId)).toBe(false);
    const sendId = withRef.find((node) => node.data.nodeType === 'send_email').id;
    expect(removed.edges.map((edge) => [edge.source, edge.target])).toContainEqual([sendId, second.newNodeId]);
    expect(removed.edges.some((edge) => edge.source === first.newNodeId || edge.target === first.newNodeId)).toBe(false);
    expect(removed.nodes.find((node) => node.id === second.newNodeId).data.config.attributeSourceNodeId).toBe('');
    expect(analyzeSettingsGraph(removed.nodes, removed.edges).chain).toHaveLength(4);
  });

  it('xoá bước cuối chuỗi: không để cạnh mồ côi', () => {
    const first = appendSideStep({ ...emailSkeleton(), subtype: 'tag_contact', registry: [] });
    const removed = removeSideStep({ nodes: first.nodes, edges: first.edges, nodeId: first.newNodeId });
    expect(removed.edges).toHaveLength(2);
    expect(analyzeSettingsGraph(removed.nodes, removed.edges).chain).toHaveLength(3);
  });

  it('KHÔNG cho xoá khối khởi chạy / nguồn / tài khoản / gửi', () => {
    const { nodes, edges } = buildSettingsSkeleton({ campaignType: 'zalo', audienceType: 'customers' });
    nodes.forEach((node) => expect(removeSideStep({ nodes, edges, nodeId: node.id })).toBeNull());
  });
});

// ── Đổi nguồn ──────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('replaceAudienceSource / classifyAudienceChange', () => {
  it('email: customers → sheet thay tại chỗ, nối lại cạnh, tham chiếu recipientNodeId + templateMappings.nodeId sang id mới', () => {
    const skeleton = emailSkeleton();
    const [trigger, source, send] = skeleton.nodes;
    const nodes = skeleton.nodes.map((node) => (node.id === send.id
      ? {
        ...node,
        data: {
          ...node.data,
          config: {
            ...node.data.config,
            emailSteps: [{ templateId: 7, templateMappings: [{ key: 'ten', sourceType: 'node', nodeId: source.id, field: 'fullName' }] }],
          },
        },
      }
      : node));
    expect(classifyAudienceChange({ nodes, edges: skeleton.edges, campaignType: 'email', audienceType: 'sheet' })).toBe('in_place');
    const result = replaceAudienceSource({ nodes, edges: skeleton.edges, campaignType: 'email', audienceType: 'sheet', registry: [] });
    expect(subtypes(result.nodes)).toEqual([TRIG, 'read_sheet', 'send_email']);
    const newSource = result.nodes[1];
    expect(newSource.id).toBe(result.newNodeId);
    expect(newSource.id).not.toBe(source.id);
    expect(newSource.position).toEqual(source.position);
    // Cạnh: trigger → nguồn mới → gửi, không còn trỏ id cũ.
    expect(result.edges.map((edge) => [edge.source, edge.target])).toEqual([[trigger.id, newSource.id], [newSource.id, send.id]]);
    const sendConfig = result.nodes[2].data.config;
    expect(sendConfig.recipientNodeId).toBe(newSource.id);
    expect(sendConfig.recipientField).toBe('');
    expect(sendConfig.emailSteps[0].templateMappings[0].nodeId).toBe(newSource.id);
    expect(sendConfig.emailSteps[0].templateId).toBe(7);
    expect(JSON.stringify(result)).not.toContain(source.id);
  });

  it('Zalo cá nhân: customers → bạn bè Zalo đổi loại người nhận sang uid và trỏ khối bạn bè (nối với khối chọn tài khoản)', () => {
    const skeleton = buildSettingsSkeleton({ campaignType: 'zalo', audienceType: 'customers' });
    const result = replaceAudienceSource({ ...skeleton, campaignType: 'zalo', audienceType: 'zalo_friends', registry: [] });
    expect(subtypes(result.nodes)).toEqual([TRIG, 'select_zalo_account', 'get_all_friends', 'send_zalo_personal']);
    expect(result.nodes[2].data.config.zaloFriendAccountNodeId).toBe(result.nodes[1].id);
    expect(result.nodes[3].data.config).toMatchObject({ zaloRecipientNodeId: result.nodes[2].id, zaloRecipientType: 'uid', zaloRecipientField: 'uid' });
  });

  it('khác khối gửi hoặc khác có-không khối nguồn → rebuild, không thay tại chỗ', () => {
    const zaloPersonal = buildSettingsSkeleton({ campaignType: 'zalo', audienceType: 'customers' });
    expect(classifyAudienceChange({ ...zaloPersonal, campaignType: 'zalo', audienceType: 'zalo_groups' })).toBe('rebuild');
    expect(classifyAudienceChange({ ...zaloPersonal, campaignType: 'zalo', audienceType: 'manual' })).toBe('rebuild');
    const wa = buildSettingsSkeleton({ campaignType: 'whatsapp', audienceType: 'conversations' });
    expect(classifyAudienceChange({ ...wa, campaignType: 'whatsapp', audienceType: 'sheet' })).toBe('rebuild');
    expect(replaceAudienceSource({ ...wa, campaignType: 'whatsapp', audienceType: 'sheet', registry: [] })).toBeNull();
  });

  it('sơ đồ rẽ nhánh → không đổi nguồn (null)', () => {
    const { nodes, edges } = emailSkeleton();
    const extra = createBuilderNode('send_email', { x: 0, y: 0 }, { id: 'extra', registry: [] });
    const branchedEdges = [...edges, { id: 'e-x', source: nodes[1].id, target: 'extra' }];
    expect(classifyAudienceChange({ nodes: [...nodes, extra], edges: branchedEdges, campaignType: 'email', audienceType: 'sheet' })).toBeNull();
  });

  it('tên khối nguồn mới không đụng tên khối khác', () => {
    const { nodes, edges } = emailSkeleton();
    const result = replaceAudienceSource({ nodes, edges, campaignType: 'email', audienceType: 'landing', registry: [] });
    const labels = result.nodes.map((node) => node.data.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('remapNodeReferences / createBuilderNode', () => {
  it('đổi mọi tham chiếu *NodeId và nodeId trong mapping ở độ sâu bất kỳ, giữ nguyên tham chiếu khi không đổi', () => {
    const config = {
      recipientNodeId: 'a',
      zaloGroupNodeId: 'a',
      tagSourceNodeId: 'b',
      emailSteps: [{ templateMappings: [{ nodeId: 'a', field: 'x' }, { nodeId: 'b' }] }],
      nested: { saveCustomerNodeId: 'a' },
    };
    const out = remapNodeReferences(config, new Map([['a', 'z']]));
    expect(out.recipientNodeId).toBe('z');
    expect(out.zaloGroupNodeId).toBe('z');
    expect(out.tagSourceNodeId).toBe('b');
    expect(out.emailSteps[0].templateMappings.map((m) => m.nodeId)).toEqual(['z', 'b']);
    expect(out.nested.saveCustomerNodeId).toBe('z');
    const same = remapNodeReferences(config, new Map([['q', 'r']]));
    expect(same).toBe(config);
  });

  it('createBuilderNode: khối khởi chạy là start, còn lại task; tên không trùng; không có config khi không truyền', () => {
    const registry = [{ type: 'send_email', name: 'Send Email', nameVi: 'Gửi Email' }];
    const node = createBuilderNode('send_email', { x: 1, y: 2 }, { locale: 'vi', registry, existingNames: ['Gửi Email', 'Gửi Email 1'], id: 'n1' });
    expect(node).toEqual({ id: 'n1', type: 'task', position: { x: 1, y: 2 }, data: { label: 'Gửi Email 2', nodeType: 'send_email' } });
    expect(createBuilderNode('send_email', { x: 0, y: 0 }, { locale: 'en', registry }).data.label).toBe('Send Email');
    expect(createBuilderNode('manual_trigger', { x: 0, y: 0 }, { registry: [] }).type).toBe('start');
    expect(makeUniqueNodeName('A', ['A', 'A 1', 'A 3'])).toBe('A 2');
    expect(makeUniqueNodeName('A', ['B'])).toBe('A');
  });
});
