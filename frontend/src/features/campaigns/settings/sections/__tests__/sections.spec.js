import { describe, expect, it } from 'vitest';
import vi from '../../../../../i18n/vi';
import { createNodeConfigFormData } from '../../../utils/nodeConfigModal.helpers';
import { AUDIENCE_TYPES_BY_CHANNEL, EMPTY_AUDIENCE } from '../../../simple/simpleCampaign.helpers';
import { buildSettingsSkeleton } from '../../settingsGraph';
import {
  audienceChangeNeedsRebuild,
  buildAudienceGraph,
  countMissingSections,
  readAudience,
  readSender,
  readSettingsSections,
  validateAudience,
  writeAudience,
  writeSender,
} from '..';

const t = (key, params = {}) => {
  const raw = key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), vi);
  if (typeof raw !== 'string') return key;
  return raw.replace(/\{(\w+)\}/g, (_, name) => (params[name] === undefined ? `{${name}}` : String(params[name])));
};

const lookups = {
  emailTemplates: [{ id: 7, templateName: 'Chào mừng' }],
  zaloTemplates: [{ id: 21, templateName: 'Mời học' }],
  emailSettings: [{ id: 3, name: 'CSKH', email: 'cskh@abc.vn' }],
  zaloAccounts: [{ id: '5', displayName: 'Shop Hoa' }],
  telegramAccounts: [{ id: 4, name: 'Bot A', username: 'bota' }],
  whatsappAccounts: [{ sessionKey: '40-default', display: '+84 912 345 678' }],
};

const ctxFor = (campaignType, extra = {}) => ({ campaignType, locale: 'vi', lookups, t, ...extra });

const node = (id, nodeType, config = {}, label = '') => ({ id, type: 'task', position: { x: 0, y: 0 }, data: { label: label || nodeType, nodeType, config } });
const edge = (source, target) => ({ id: `${source}-${target}`, source, target });
const chain = (...ids) => ids.slice(1).map((id, index) => edge(ids[index], id));
const byType = (nodes, subtype) => nodes.find((item) => item.data.nodeType === subtype);

// ── Dữ liệu mẫu cho từng nguồn ───────────────────────────────────────────────────────────────────────────────────────
const SAMPLE = {
  email: {
    manual: { manualText: 'a@x.vn\nb@x.vn' },
    customers: {},
    landing: { slugs: ['trang-a', 'trang-b'] },
    form: { formIds: [3, 4] },
    sheet: { sheetUrl: 'https://docs.google.com/spreadsheets/d/abc', sheetName: '', sheetCheckedUrl: 'https://docs.google.com/spreadsheets/d/abc' },
  },
  zalo: {
    manual: { manualText: '0901234567\n0912345678' },
    customers: {},
    landing: { slugs: ['trang-a'] },
    form: { formIds: [3] },
    sheet: { sheetUrl: 'https://docs.google.com/spreadsheets/d/abc', sheetName: 'Tab 2', sheetCheckedUrl: 'https://docs.google.com/spreadsheets/d/abc' },
    zalo_friends: { uids: ['u1', 'u2'] },
    zalo_groups: { groupIds: ['g1', 'g2'], groupNames: ['A', 'B'] },
  },
  telegram: {
    conversations: {},
    telegram_groups: { groups: [{ recipientKey: '-100', display: 'Nhóm 1' }] },
  },
  whatsapp: {
    conversations: {},
    whatsapp_groups: { groups: [{ recipientKey: '84@g.us', display: 'Nhóm A' }] },
    customers: {},
    landing: { slugs: ['trang-a'] },
    form: { formIds: [3] },
    sheet: { sheetUrl: 'https://docs.google.com/spreadsheets/d/abc', sheetName: '', sheetCheckedUrl: 'https://docs.google.com/spreadsheets/d/abc' },
  },
};
const SENDER = { email: { id: 3, label: 'CSKH' }, zalo: { id: 5, label: 'Shop Hoa' }, telegram: { id: 4, label: 'Bot A' }, whatsapp: { id: '40-default', label: '+84' } };
const CASES = Object.entries(SAMPLE).flatMap(([channel, types]) => Object.entries(types).map(([type, data]) => [channel, type, { ...EMPTY_AUDIENCE, type, ...data }]));

const buildFor = (channel, type, audience) => {
  const campaignType = channel;
  const graph = buildAudienceGraph({ campaignType, audience, sender: SENDER[channel], locale: 'vi' });
  return { campaignType, ...graph };
};

describe('bảng phủ', () => {
  it('SAMPLE phủ ĐÚNG mọi cặp kênh × nguồn của AUDIENCE_TYPES_BY_CHANNEL', () => {
    const covered = CASES.map(([channel, type]) => `${channel}:${type}`).sort();
    const all = Object.entries(AUDIENCE_TYPES_BY_CHANNEL).flatMap(([channel, types]) => types.map((type) => `${channel}:${type}`)).sort();
    expect(covered).toEqual(all);
  });
});

describe('Gửi cho ai — đọc / ghi từng kênh × nguồn', () => {
  it.each(CASES)('%s × %s: khung dựng bằng panel → đọc lại đúng dữ liệu, sửa được, đủ, hợp lệ', (channel, type, audience) => {
    const { campaignType, nodes, edges } = buildFor(channel, type, audience);
    const read = readAudience(nodes, edges, ctxFor(campaignType));
    expect(read.editable).toBe(true);
    expect(read.value.type).toBe(type);
    expect(read.value.channel).toBe(channel);
    expect(read.status).toBe('ok');
    expect(validateAudience(channel, read.value.audience)).toBe(true);
    // Dữ liệu panel vào khối đúng rồi đọc ra y như đã nhập.
    const expected = { ...audience };
    if (type === 'zalo_groups') expected.groupNames = ['', ''];
    if (type === 'landing') expected.landingTitles = [...audience.slugs];
    if (type === 'form') expected.formTitles = audience.formIds.map((id) => `#${id}`);
    expect(read.value.audience).toMatchObject(Object.fromEntries(Object.entries(expected).filter(([key]) => !['customerTotal'].includes(key))));
    expect(read.summary).not.toMatch(/khối|node/i);
  });

  it.each(CASES)('%s × %s: write(read(x)) KHÔNG đổi gì (cùng tham chiếu nodes và edges)', (channel, type, audience) => {
    const { campaignType, nodes, edges } = buildFor(channel, type, audience);
    const read = readAudience(nodes, edges, ctxFor(campaignType));
    const written = writeAudience(nodes, edges, read.value.audience, ctxFor(campaignType));
    expect(written.nodes).toBe(nodes);
    expect(written.edges).toBe(edges);
  });

  it('khung mới chưa điền: thiếu, đúng câu nhắc của từng nguồn (không phải "tất cả")', () => {
    const cases = [
      ['email', 'manual', 'Chưa nhập danh sách email'],
      ['zalo', 'manual', 'Chưa nhập danh sách số điện thoại'],
      ['email', 'landing', vi.campaignSettings.section.audience.missing.landing],
      ['email', 'form', vi.campaignSettings.section.audience.missing.form],
      ['email', 'sheet', vi.campaignSettings.section.audience.missing.sheet],
      ['zalo', 'zalo_friends', vi.campaignSettings.section.audience.missing.zalo_friends],
      ['zalo', 'zalo_groups', vi.campaignSettings.section.audience.missing.zalo_groups],
      ['telegram', 'telegram_groups', vi.campaignSettings.section.audience.missing.telegram_groups],
      ['whatsapp', 'whatsapp_groups', vi.campaignSettings.section.audience.missing.whatsapp_groups],
    ];
    cases.forEach(([channel, type, message]) => {
      const { nodes, edges } = buildSettingsSkeleton({ campaignType: channel, audienceType: type, sender: SENDER[channel] });
      const read = readAudience(nodes, edges, ctxFor(channel));
      expect(read, `${channel}:${type}`).toMatchObject({ status: 'missing', editable: true, summary: message });
      expect(read.value.type).toBe(type);
    });
  });

  it('đổi dữ liệu cùng loại nguồn chỉ vá đúng trường: mọi trường lạ của khối nguồn và khối gửi còn nguyên', () => {
    const { nodes, edges } = buildFor('email', 'sheet', { ...EMPTY_AUDIENCE, type: 'sheet', ...SAMPLE.email.sheet });
    const tagged = nodes.map((item) => ({ ...item, data: { ...item.data, config: { ...item.data.config, truongLa: `giu-${item.data.nodeType}` } } }));
    const read = readAudience(tagged, edges, ctxFor('email'));
    const next = writeAudience(tagged, edges, { ...read.value.audience, sheetUrl: 'https://docs.google.com/spreadsheets/d/xyz', sheetCheckedUrl: 'https://docs.google.com/spreadsheets/d/xyz' }, ctxFor('email'));
    const sheet = byType(next.nodes, 'read_sheet').data.config;
    expect(sheet.sheetUrl).toBe('https://docs.google.com/spreadsheets/d/xyz');
    expect(sheet.truongLa).toBe('giu-read_sheet');
    expect(sheet.headerRow).toBe(1);
    expect(byType(next.nodes, 'send_email').data.config).toEqual(byType(tagged, 'send_email').data.config);
    expect(next.nodes.length).toBe(tagged.length);
    expect(next.edges).toBe(edges);
    // Nút của khối khác không bị chạm.
    expect(byType(next.nodes, 'manual_trigger')).toBe(byType(tagged, 'manual_trigger'));
  });

  it('khung Google Sheet: điền link thì cột người nhận (trống) được điền cột mặc định của kênh', () => {
    const email = buildFor('email', 'sheet', { ...EMPTY_AUDIENCE, type: 'sheet', ...SAMPLE.email.sheet });
    expect(byType(email.nodes, 'send_email').data.config.recipientField).toBe('email');
    const zalo = buildFor('zalo', 'sheet', { ...EMPTY_AUDIENCE, type: 'sheet', ...SAMPLE.zalo.sheet });
    expect(byType(zalo.nodes, 'send_zalo_personal').data.config.zaloRecipientField).toBe('phone');
    expect(byType(zalo.nodes, 'read_sheet').data.config.sheetName).toBe('Tab 2');
    const wa = buildFor('whatsapp', 'sheet', { ...EMPTY_AUDIENCE, type: 'sheet', ...SAMPLE.whatsapp.sheet });
    expect(byType(wa.nodes, 'send_whatsapp').data.config.recipientColumn).toBe('phone');
  });

  it('đổi link Google Sheet bỏ cột đã đọc của file cũ; cùng link thì giữ', () => {
    const { nodes, edges } = buildFor('email', 'sheet', { ...EMPTY_AUDIENCE, type: 'sheet', ...SAMPLE.email.sheet });
    const withColumns = nodes.map((item) => (item.data.nodeType === 'read_sheet' ? { ...item, data: { ...item.data, config: { ...item.data.config, columns: ['email', 'ten'], dataSelectedColumns: ['email'] } } } : item));
    const same = writeAudience(withColumns, edges, readAudience(withColumns, edges, ctxFor('email')).value.audience, ctxFor('email'));
    expect(byType(same.nodes, 'read_sheet').data.config.columns).toEqual(['email', 'ten']);
    const url = 'https://docs.google.com/spreadsheets/d/khac';
    const changed = writeAudience(withColumns, edges, { ...SAMPLE.email.sheet, ...EMPTY_AUDIENCE, type: 'sheet', sheetUrl: url, sheetCheckedUrl: url }, ctxFor('email'));
    expect(byType(changed.nodes, 'read_sheet').data.config).toMatchObject({ sheetUrl: url, columns: [], dataSelectedColumns: [] });
  });

  it('nhóm Zalo: lưu khoá danh sách; chọn lại thì mở khoá, danh sách rỗng giữ khoá (0 nhóm, không phải tất cả)', () => {
    const { nodes, edges } = buildSettingsSkeleton({ campaignType: 'zalo', audienceType: 'zalo_groups', sender: SENDER.zalo });
    const groups = byType(nodes, 'get_all_groups').data.config;
    expect(groups).toMatchObject({ zaloSelectedGroupIds: [], zaloGroupSelectionSnapshotLocked: true });
    const next = writeAudience(nodes, edges, { ...EMPTY_AUDIENCE, type: 'zalo_groups', groupIds: ['g1'] }, ctxFor('zalo'));
    expect(byType(next.nodes, 'get_all_groups').data.config).toMatchObject({ zaloSelectedGroupIds: ['g1'], zaloGroupSelectionSnapshotLocked: false });
  });

  it('bạn bè Zalo: khung mới là "fixed" rỗng (chưa chọn), chọn xong lưu theo uid', () => {
    const { nodes, edges } = buildSettingsSkeleton({ campaignType: 'zalo', audienceType: 'zalo_friends', sender: SENDER.zalo });
    expect(byType(nodes, 'get_all_friends').data.config).toMatchObject({ zaloFriendSelectionMode: 'fixed', zaloSelectedFriendIds: [] });
    const next = writeAudience(nodes, edges, { ...EMPTY_AUDIENCE, type: 'zalo_friends', uids: ['u9'] }, ctxFor('zalo'));
    expect(byType(next.nodes, 'get_all_friends').data.config.zaloSelectedFriendIds).toEqual(['u9']);
  });

  it('danh sách nhập tay: ghi dạng chuẩn hoá; cùng danh sách (chỉ khác cách viết) thì giữ nguyên chuỗi đã lưu', () => {
    const { nodes, edges } = buildFor('email', 'manual', { ...EMPTY_AUDIENCE, type: 'manual', manualText: 'A@X.vn, b@x.vn' });
    expect(byType(nodes, 'send_email').data.config.recipientEmails).toBe('a@x.vn\nb@x.vn');
    const handTyped = nodes.map((item) => (item.data.nodeType === 'send_email' ? { ...item, data: { ...item.data, config: { ...item.data.config, recipientEmails: 'A@X.vn, b@x.vn' } } } : item));
    const same = writeAudience(handTyped, edges, { ...EMPTY_AUDIENCE, type: 'manual', manualText: 'a@x.vn\nb@x.vn' }, ctxFor('email'));
    expect(same.nodes).toBe(handTyped);
  });

  describe('đổi loại nguồn giữ nguyên mọi cài đặt khác', () => {
    const templated = (nodes, nodeType, patch) => nodes.map((item) => (item.data.nodeType === nodeType ? { ...item, data: { ...item.data, config: { ...item.data.config, ...patch } } } : item));

    it('nguồn đọc dữ liệu → nguồn đọc dữ liệu khác: thay tại chỗ, tài khoản + mẫu giữ, tham chiếu trỏ sang khối mới', () => {
      const built = buildFor('email', 'customers', { ...EMPTY_AUDIENCE, type: 'customers' });
      const steps = [{ templateId: 7, delayValue: 0, delayUnit: 'days', delayFrom: 'start', templateMappings: [{ variableName: 'ten', sourceType: 'node', nodeId: byType(built.nodes, 'read_interested_customers').id, field: 'name' }] }];
      const nodes = templated(built.nodes, 'send_email', { emailSteps: steps });
      const next = writeAudience(nodes, built.edges, { ...EMPTY_AUDIENCE, type: 'landing', slugs: ['trang-a'] }, ctxFor('email'));
      const source = byType(next.nodes, 'read_landing_leads');
      const send = byType(next.nodes, 'send_email').data.config;
      expect(source.data.config.landingLeadsSlugs).toEqual(['trang-a']);
      expect(send).toMatchObject({ fromEmailId: 3, recipientSource: 'node', recipientNodeId: source.id });
      expect(send.emailSteps[0].templateId).toBe(7);
      expect(send.emailSteps[0].templateMappings[0].nodeId).toBe(source.id);
      expect(next.nodes.map((item) => item.data.nodeType)).toEqual(['manual_trigger', 'read_landing_leads', 'send_email']);
    });

    it('nhập tay → Google Sheet: chèn khối nguồn trước khối gửi, nối lại cạnh, mẫu + tài khoản giữ', () => {
      const built = buildFor('email', 'manual', { ...EMPTY_AUDIENCE, type: 'manual', manualText: 'a@x.vn' });
      const nodes = templated(built.nodes, 'send_email', { emailSteps: [{ templateId: 7, delayValue: 0, delayUnit: 'days', delayFrom: 'start', templateMappings: [] }] });
      const next = writeAudience(nodes, built.edges, { ...EMPTY_AUDIENCE, type: 'sheet', ...SAMPLE.email.sheet }, ctxFor('email'));
      expect(next.nodes.map((item) => item.data.nodeType)).toEqual(['manual_trigger', 'send_email', 'read_sheet']);
      const sheet = byType(next.nodes, 'read_sheet');
      const send = byType(next.nodes, 'send_email');
      const trigger = byType(next.nodes, 'manual_trigger');
      expect(next.edges.map((item) => [item.source, item.target]).sort()).toEqual([[trigger.id, sheet.id], [sheet.id, send.id]].sort());
      expect(send.data.config).toMatchObject({ fromEmailId: 3, recipientSource: 'node', recipientNodeId: sheet.id, recipientField: 'email' });
      expect(send.data.config.emailSteps[0].templateId).toBe(7);
      expect(send.position.x).toBeGreaterThan(sheet.position.x);
      expect(readAudience(next.nodes, next.edges, ctxFor('email'))).toMatchObject({ status: 'ok', editable: true });
    });

    it('Google Sheet → nhập tay: gỡ khối nguồn, nối khối trước với khối gửi, tham chiếu tới khối đã gỡ bị xoá', () => {
      const built = buildFor('email', 'sheet', { ...EMPTY_AUDIENCE, type: 'sheet', ...SAMPLE.email.sheet });
      const sheetId = byType(built.nodes, 'read_sheet').id;
      const nodes = templated(built.nodes, 'send_email', { emailSteps: [{ templateId: 7, delayValue: 0, delayUnit: 'days', delayFrom: 'start', templateMappings: [{ variableName: 'ten', sourceType: 'node', nodeId: sheetId, field: 'ten' }] }] });
      const next = writeAudience(nodes, built.edges, { ...EMPTY_AUDIENCE, type: 'manual', manualText: 'a@x.vn' }, ctxFor('email'));
      expect(next.nodes.map((item) => item.data.nodeType)).toEqual(['manual_trigger', 'send_email']);
      const send = byType(next.nodes, 'send_email').data.config;
      expect(send).toMatchObject({ recipientSource: 'manual', recipientNodeId: '', recipientEmails: 'a@x.vn', fromEmailId: 3 });
      expect(send.emailSteps[0].templateMappings[0].nodeId).toBe('');
      expect(next.edges).toHaveLength(1);
    });

    it('Zalo: bạn bè → nhóm cùng khối gửi là không thể; cá nhân ⇄ nhóm cần dựng lại (hỏi xác nhận trước)', () => {
      const built = buildFor('zalo', 'sheet', { ...EMPTY_AUDIENCE, type: 'sheet', ...SAMPLE.zalo.sheet });
      expect(audienceChangeNeedsRebuild(built.nodes, built.edges, 'zalo_groups', ctxFor('zalo'))).toBe(true);
      expect(audienceChangeNeedsRebuild(built.nodes, built.edges, 'landing', ctxFor('zalo'))).toBe(false);
      expect(writeAudience(built.nodes, built.edges, { ...EMPTY_AUDIENCE, type: 'zalo_groups', groupIds: ['g1'] }, ctxFor('zalo'))).toEqual({ rebuild: true });
      const friends = writeAudience(built.nodes, built.edges, { ...EMPTY_AUDIENCE, type: 'zalo_friends', uids: ['u1'] }, ctxFor('zalo'));
      expect(friends.nodes.map((item) => item.data.nodeType)).toEqual(['manual_trigger', 'select_zalo_account', 'get_all_friends', 'send_zalo_personal']);
      expect(byType(friends.nodes, 'send_zalo_personal').data.config).toMatchObject({ zaloRecipientType: 'uid', zaloRecipientField: 'uid' });
      expect(byType(friends.nodes, 'select_zalo_account').data.config.zaloAccountId).toBe(5);
    });

    it('WhatsApp: người đã nhắn → nhóm chỉ vá trường người nhận; người đã nhắn → Google Sheet chèn khối nguồn', () => {
      const built = buildFor('whatsapp', 'conversations', { ...EMPTY_AUDIENCE, type: 'conversations' });
      const groups = writeAudience(built.nodes, built.edges, { ...EMPTY_AUDIENCE, type: 'whatsapp_groups', ...SAMPLE.whatsapp.whatsapp_groups }, ctxFor('whatsapp'));
      expect(byType(groups.nodes, 'send_whatsapp').data.config).toMatchObject({ whatsappSessionKey: '40-default', recipientSource: 'whatsapp_groups', recipientKeys: SAMPLE.whatsapp.whatsapp_groups.groups });
      expect(groups.nodes).toHaveLength(2);
      const sheet = writeAudience(built.nodes, built.edges, { ...EMPTY_AUDIENCE, type: 'sheet', ...SAMPLE.whatsapp.sheet }, ctxFor('whatsapp'));
      expect(sheet.nodes.map((item) => item.data.nodeType)).toEqual(['manual_trigger', 'send_whatsapp', 'read_sheet']);
    });
  });
});

// ── Mục không biểu diễn được: editable false, KHÔNG ghi ─────────────────────────────────────────────────────────────────
describe('Gửi cho ai — cấu hình ngoài khả năng của panel', () => {
  const formConfig = (nodeType, config) => createNodeConfigFormData({ config, nodeType, campaignType: 'email' });

  const unsupported = [
    ['Google Sheet chọn cột người nhận riêng', () => {
      const nodes = [node('t', 'manual_trigger'), node('s', 'read_sheet', formConfig('read_sheet', { sheetUrl: 'https://docs.google.com/spreadsheets/d/abc', sheetName: 'Tab' })),
        node('e', 'send_email', formConfig('send_email', { recipientSource: 'node', recipientNodeId: 's', recipientField: 'Mail lien he', fromEmailId: 3 }))];
      return { campaignType: 'email', nodes, edges: chain('t', 's', 'e'), reason: 'column' };
    }],
    ['khách đã lưu lọc theo loại "quan tâm"', () => {
      const nodes = [node('t', 'manual_trigger'), node('c', 'read_interested_customers', formConfig('read_interested_customers', { interestedCustomerType: 'interested' })),
        node('e', 'send_email', formConfig('send_email', { recipientSource: 'node', recipientNodeId: 'c', recipientField: 'email' }))];
      return { campaignType: 'email', nodes, edges: chain('t', 'c', 'e'), reason: 'filtered' };
    }],
    ['khách đã lưu chọn tay từng người', () => {
      const nodes = [node('t', 'manual_trigger'), node('c', 'read_interested_customers', { interestedCustomerType: 'all', interestedSelectionMode: 'fixed', interestedSelectedCustomerIds: [1, 2] }),
        node('e', 'send_email', { recipientSource: 'node', recipientNodeId: 'c', recipientField: 'email' })];
      return { campaignType: 'email', nodes, edges: chain('t', 'c', 'e'), reason: 'filtered' };
    }],
    ['landing lọc theo khoảng ngày', () => {
      const nodes = [node('t', 'manual_trigger'), node('l', 'read_landing_leads', formConfig('read_landing_leads', { landingLeadsSlugs: ['a'], landingLeadsUseDateRange: true, landingLeadsDateFrom: '2026-01-01', landingLeadsDateTo: '2026-02-01' })),
        node('e', 'send_email', { recipientSource: 'node', recipientNodeId: 'l', recipientField: 'email' })];
      return { campaignType: 'email', nodes, edges: chain('t', 'l', 'e'), reason: 'filtered' };
    }],
    ['bạn bè Zalo "tất cả"', () => {
      const nodes = [node('t', 'manual_trigger'), node('a', 'select_zalo_account', { zaloAccountId: 5 }), node('f', 'get_all_friends', { zaloFriendAccountNodeId: 'a' }),
        node('z', 'send_zalo_personal', { zaloRecipientSource: 'node', zaloRecipientNodeId: 'f', zaloRecipientField: 'uid', zaloRecipientType: 'uid' })];
      return { campaignType: 'zalo', nodes, edges: chain('t', 'a', 'f', 'z'), reason: 'filtered' };
    }],
    ['Zalo cá nhân nhập UID tay', () => {
      const nodes = [node('t', 'manual_trigger'), node('a', 'select_zalo_account', { zaloAccountId: 5 }), node('z', 'send_zalo_personal', { zaloRecipientSource: 'manual', zaloRecipientType: 'uid', zaloRecipientPhones: '123\n456' })];
      return { campaignType: 'zalo', nodes, edges: chain('t', 'a', 'z'), reason: 'uidList' };
    }],
    ['Zalo nhóm nhập mã nhóm tay', () => {
      const nodes = [node('t', 'manual_trigger'), node('a', 'select_zalo_account', { zaloAccountId: 5 }), node('g', 'send_zalo_group', { zaloGroupSource: 'manual', zaloGroupIds: 'g1\ng2' })];
      return { campaignType: 'zalo_group', nodes, edges: chain('t', 'a', 'g'), reason: 'groupListManual' };
    }],
    ['Telegram nhập chat id tay', () => {
      const nodes = [node('t', 'manual_trigger'), node('g', 'send_telegram', { telegramAccountId: 4, recipientSource: 'manual', recipientKeys: '1\n2' })];
      return { campaignType: 'telegram', nodes, edges: chain('t', 'g'), reason: 'recipientSource' };
    }],
    ['WhatsApp nhập số tay', () => {
      const nodes = [node('t', 'manual_trigger'), node('w', 'send_whatsapp', { whatsappSessionKey: '40-default', recipientSource: 'manual', recipientKeys: '84912345678' })];
      return { campaignType: 'whatsapp', nodes, edges: chain('t', 'w'), reason: 'recipientSource' };
    }],
    ['nguồn khoá học (không phải nguồn của trình từng bước) làm nguồn email', () => {
      const nodes = [node('t', 'manual_trigger'), node('c', 'read_courses_db', { coursesDbSelectedIds: [1] }), node('e', 'send_email', { recipientSource: 'node', recipientNodeId: 'c', recipientField: 'email' })];
      return { campaignType: 'email', nodes, edges: chain('t', 'c', 'e'), reason: 'sourceMismatch' };
    }],
    ['khối gửi tham chiếu khối nguồn không nằm trong chuỗi', () => {
      const nodes = [node('t', 'manual_trigger'), node('s', 'read_sheet', { sheetUrl: 'u' }), node('e', 'send_email', { recipientSource: 'node', recipientNodeId: 'x', recipientField: 'email' })];
      return { campaignType: 'email', nodes, edges: chain('t', 's', 'e'), reason: 'sourceMismatch' };
    }],
    ['sơ đồ rẽ nhánh (khối Điều kiện)', () => {
      const nodes = [node('t', 'manual_trigger'), node('c', 'condition', { rules: [] }), node('e1', 'send_email', { recipientSource: 'manual', recipientEmails: 'a@x.vn' }), node('e2', 'send_email', { recipientSource: 'manual', recipientEmails: 'b@x.vn' })];
      return { campaignType: 'email', nodes, edges: [edge('t', 'c'), edge('c', 'e1'), edge('c', 'e2')], reason: 'branched' };
    }],
    ['hai khối gửi song song (email + Zalo)', () => {
      const nodes = [node('t', 'manual_trigger'), node('e', 'send_email', { recipientSource: 'manual', recipientEmails: 'a@x.vn' }), node('z', 'send_zalo_personal', { zaloRecipientSource: 'manual', zaloRecipientPhones: '0901234567' })];
      return { campaignType: 'email', nodes, edges: [edge('t', 'e'), edge('t', 'z')], reason: 'branched' };
    }],
    ['khối gửi lời mời kết bạn', () => {
      const nodes = [node('t', 'manual_trigger'), node('f', 'send_zalo_friend_request', { zaloFriendSource: 'manual', zaloFriendPhones: '0901234567' })];
      return { campaignType: 'zalo', nodes, edges: chain('t', 'f'), reason: 'friendRequest' };
    }],
  ];

  it.each(unsupported)('%s → editable false, có tóm tắt bằng chữ thường, write KHÔNG ghi (trả null), nodes không đổi', (_name, make) => {
    const { campaignType, nodes, edges, reason } = make();
    const snapshot = JSON.stringify(nodes);
    const read = readAudience(nodes, edges, ctxFor(campaignType));
    expect(read.editable).toBe(false);
    expect(read.reasonIfNotEditable).toBe(reason);
    expect(read.summary.length).toBeGreaterThan(0);
    expect(read.summary).not.toMatch(/khối|node/i);
    expect(read.advancedNodeId).toBeTruthy();
    expect(writeAudience(nodes, edges, { ...EMPTY_AUDIENCE, type: 'manual', manualText: 'x@y.vn' }, ctxFor(campaignType))).toBeNull();
    expect(JSON.stringify(nodes)).toBe(snapshot);
  });

  it('Google Sheet với cột riêng: tóm tắt nêu link + tên cột bằng chữ thường', () => {
    const { campaignType, nodes, edges } = unsupported[0][1]();
    expect(readAudience(nodes, edges, ctxFor(campaignType)).summary).toBe('Danh sách Google Sheet: https://docs.google.com/spreadsheets/d/abc · Tab · cột “Mail lien he”');
  });
});

// ── Hình dạng do trình dựng tay lưu (đủ trường mặc định của form) ───────────────────────────────────────────────────────
describe('Gửi cho ai — chiến dịch dựng tay kiểu production', () => {
  it('form lưu đủ mọi trường mặc định: nhập tay email, sheet cột "Email" viết hoa, landing — đọc được, sửa được, ghi vẫn giữ trường mặc định', () => {
    const emailConfig = (extra) => createNodeConfigFormData({ config: { fromEmailId: 3, ...extra }, nodeType: 'send_email', campaignType: 'email', label: 'Gửi' });
    const manualNodes = [node('t', 'manual_trigger'), node('e', 'send_email', emailConfig({ recipientSource: 'manual', recipientEmails: 'a@x.vn\nb@x.vn' }))];
    const manual = readAudience(manualNodes, chain('t', 'e'), ctxFor('email'));
    expect(manual).toMatchObject({ editable: true, status: 'ok', summary: '2 email nhập tay' });

    const sheetNodes = [node('t', 'manual_trigger'), node('s', 'read_sheet', createNodeConfigFormData({ config: { sheetUrl: 'https://docs.google.com/spreadsheets/d/abc', sheetName: 'Sheet1', columns: ['Email', 'Ten'] }, nodeType: 'read_sheet' })),
      node('e', 'send_email', emailConfig({ recipientSource: 'node', recipientNodeId: 's', recipientField: 'Email' }))];
    const sheet = readAudience(sheetNodes, chain('t', 's', 'e'), ctxFor('email'));
    expect(sheet).toMatchObject({ editable: true, status: 'ok' });
    const next = writeAudience(sheetNodes, chain('t', 's', 'e'), { ...sheet.value.audience, sheetName: 'Tab 3' }, ctxFor('email'));
    const config = byType(next.nodes, 'read_sheet').data.config;
    expect(config).toMatchObject({ sheetName: 'Tab 3', headerRow: 1, dataStartRow: 2, columns: [] });
    expect(byType(next.nodes, 'send_email').data.config.recipientField).toBe('Email');
  });
});

// ── Gửi từ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('Gửi từ — đọc / ghi', () => {
  const sender = (nodes, edges = []) => readSender(nodes, edges, ctxFor('email'));

  it('email: trống = tài khoản mặc định (đủ, không phải thiếu); có id thì hiện tên; ghi vá đúng fromEmailId', () => {
    const nodes = [node('t', 'manual_trigger'), node('e', 'send_email', { recipientSource: 'manual', recipientEmails: 'a@x.vn', ccEnabled: true })];
    const blank = sender(nodes);
    expect(blank).toMatchObject({ status: 'ok', editable: true, value: null, summary: 'Tài khoản mặc định: CSKH (cskh@abc.vn)' });
    const next = writeSender(nodes, [], { id: 3, label: 'CSKH' });
    expect(byType(next.nodes, 'send_email').data.config).toEqual({ recipientSource: 'manual', recipientEmails: 'a@x.vn', ccEnabled: true, fromEmailId: 3 });
    expect(sender(next.nodes)).toMatchObject({ status: 'ok', value: { id: 3 }, summary: 'CSKH (cskh@abc.vn)' });
  });

  it('email: không có tài khoản nào và để trống → thiếu', () => {
    const nodes = [node('t', 'manual_trigger'), node('e', 'send_email', {})];
    expect(readSender(nodes, [], { ...ctxFor('email'), lookups: { ...lookups, emailSettings: [] } }).status).toBe('missing');
  });

  it('write(read(x)) không đổi (cùng tham chiếu), kể cả id lưu dạng chuỗi', () => {
    const nodes = [node('t', 'manual_trigger'), node('a', 'select_zalo_account', { zaloAccountId: '5' }), node('z', 'send_zalo_personal', { zaloAccountId: 5 })];
    const read = readSender(nodes, [], ctxFor('zalo'));
    expect(read).toMatchObject({ editable: true, value: { id: 5 } });
    expect(writeSender(nodes, [], read.value).nodes).toBe(nodes);
  });

  it('Zalo có khối chọn tài khoản: ghi vào khối chọn, id riêng của khối gửi giữ cho khớp; đổi tài khoản xoá nhóm / bạn bè đã chọn', () => {
    const nodes = [node('t', 'manual_trigger'), node('a', 'select_zalo_account', { zaloAccountId: 5, zaloPoolMultiAccountEnabled: false }),
      node('g', 'get_all_groups', { zaloGroupAccountNodeId: 'a', zaloSelectedGroupIds: ['g1'] }),
      node('z', 'send_zalo_group', { zaloAccountId: 5, zaloGroupSource: 'node', zaloGroupNodeId: 'g', zaloGroupIds: ['g1'], zaloSelectedGroupIds: ['g1'] })];
    const next = writeSender(nodes, chain('t', 'a', 'g', 'z'), { id: 9, label: 'Khác' });
    expect(byType(next.nodes, 'select_zalo_account').data.config.zaloAccountId).toBe(9);
    expect(byType(next.nodes, 'send_zalo_group').data.config).toMatchObject({ zaloAccountId: 9, zaloGroupIds: [], zaloSelectedGroupIds: [] });
    expect(byType(next.nodes, 'get_all_groups').data.config).toMatchObject({ zaloSelectedGroupIds: [], zaloGroupSelectionSnapshotLocked: true });
    // Lần đầu chọn (chưa có tài khoản cũ) thì không xoá gì.
    const fresh = [node('t', 'manual_trigger'), node('a', 'select_zalo_account', { zaloAccountId: '' }), node('g', 'get_all_groups', { zaloSelectedGroupIds: ['g1'] }), node('z', 'send_zalo_group', {})];
    expect(byType(writeSender(fresh, [], { id: 5 }).nodes, 'get_all_groups').data.config.zaloSelectedGroupIds).toEqual(['g1']);
  });

  it('Zalo dựng tay không có khối chọn tài khoản: ghi vào chính khối gửi', () => {
    const nodes = [node('t', 'manual_trigger'), node('z', 'send_zalo_personal', { zaloRecipientSource: 'manual', zaloRecipientPhones: '0901234567' })];
    expect(readSender(nodes, [], ctxFor('zalo'))).toMatchObject({ status: 'missing', editable: true });
    expect(byType(writeSender(nodes, [], { id: 5 }).nodes, 'send_zalo_personal').data.config.zaloAccountId).toBe(5);
  });

  it('Telegram / WhatsApp: đúng trường; đổi tài khoản xoá nhóm đã chọn', () => {
    const tg = [node('t', 'manual_trigger'), node('g', 'send_telegram', { telegramAccountId: 4, recipientSource: 'telegram_groups', recipientKeys: [{ recipientKey: '-1', display: 'N' }] })];
    const tgNext = writeSender(tg, [], { id: 8, label: 'Bot B' });
    expect(byType(tgNext.nodes, 'send_telegram').data.config).toMatchObject({ telegramAccountId: 8, recipientKeys: [] });
    const wa = [node('t', 'manual_trigger'), node('w', 'send_whatsapp', { whatsappSessionKey: '40-default', recipientSource: 'whatsapp_conversations' })];
    const waNext = writeSender(wa, [], { id: '41-main' });
    expect(byType(waNext.nodes, 'send_whatsapp').data.config).toMatchObject({ whatsappSessionKey: '41-main', recipientSource: 'whatsapp_conversations' });
    expect(readSender(wa, [], ctxFor('whatsapp')).summary).toBe('+84 912 345 678');
  });

  it.each([
    ['Zalo bật luân phiên nhiều tài khoản', () => [node('t', 'manual_trigger'), node('a', 'select_zalo_account', { zaloPoolMultiAccountEnabled: true, zaloPoolAccountIds: ['5', '6'] }), node('z', 'send_zalo_personal', {})], 'pool', 'Gửi luân phiên 2 tài khoản'],
    ['hai khối chọn tài khoản Zalo', () => [node('t', 'manual_trigger'), node('a', 'select_zalo_account', {}), node('b', 'select_zalo_account', {}), node('z', 'send_zalo_personal', {})], 'multiAccount', null],
    ['hai khối gửi', () => [node('t', 'manual_trigger'), node('e', 'send_email', {}), node('z', 'send_zalo_personal', {})], 'multiSend', null],
  ])('%s → editable false, KHÔNG ghi', (_name, make, reason, summary) => {
    const nodes = make();
    const read = readSender(nodes, [], ctxFor('zalo'));
    expect(read).toMatchObject({ editable: false, reasonIfNotEditable: reason });
    if (summary) expect(read.summary).toBe(summary);
    expect(writeSender(nodes, [], { id: 9 })).toBeNull();
  });
});

// ── Cả 5 mục ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('readSettingsSections', () => {
  it('khung vừa dựng: còn Nội dung thiếu; điền mẫu thì hết; chữ không nhắc "khối"/"node"', () => {
    const { nodes, edges } = buildFor('email', 'manual', { ...EMPTY_AUDIENCE, type: 'manual', manualText: 'a@x.vn' });
    const sections = readSettingsSections(nodes, edges, ctxFor('email', { scheduleSummary: '' }));
    expect(['sender', 'audience', 'content', 'timing', 'after'].map((key) => [key, sections[key].status])).toEqual([
      ['sender', 'ok'], ['audience', 'ok'], ['content', 'missing'], ['timing', 'ok'], ['after', 'ok'],
    ]);
    expect(countMissingSections(sections)).toBe(1);
    expect(sections.content.items[0].lines[0].value).toMatch(/Chưa chọn mẫu/);
    const filled = nodes.map((item) => (item.data.nodeType === 'send_email' ? { ...item, data: { ...item.data, config: { ...item.data.config, emailSteps: [{ ...item.data.config.emailSteps[0], templateId: 7 }] } } } : item));
    const done = readSettingsSections(filled, edges, ctxFor('email'));
    expect(countMissingSections(done)).toBe(0);
    expect(done.timing.summary).toBe(vi.campaignSettings.section.timing.manual);
  });

  it('bước phụ: liệt kê gắn thẻ / cập nhật / lưu khách với tóm tắt chữ thường, xoá được khi thẳng hàng', () => {
    const nodes = [node('t', 'manual_trigger'), node('e', 'send_email', { recipientSource: 'manual', recipientEmails: 'a@x.vn' }),
      node('g', 'tag_contact', { tagName: 'vip', tagSourceNodeId: 'e' }, 'Gắn tag'), node('s', 'save_customer', {}, 'Lưu khách'),
      node('u', 'update_attribute', { attributeField: 'city', attributeSourceNodeId: 'e' }, 'Cập nhật')];
    const sections = readSettingsSections(nodes, chain('t', 'e', 'g', 's', 'u'), ctxFor('email'));
    expect(sections.after.items.map((item) => [item.subtype, item.removable])).toEqual([['tag_contact', true], ['save_customer', true], ['update_attribute', true]]);
    expect(sections.after.items[0].summary).toBe('Gắn tag “vip”');
    // Từ PR-T2 máy chủ chạy thật tag_contact; chỉ update_attribute còn bị bỏ qua khi gửi thật → cờ notRun.
    expect(sections.after.items.map((item) => item.notRun)).toEqual([false, false, true]);
    // Gắn tag có biểu mẫu riêng (tagValue); bước khác thì không.
    expect(sections.after.items.map((item) => item.tagValue)).toEqual([{ action: 'add', name: 'vip' }, null, null]);
    expect(sections.after.canAdd).toBe(true);
  });
});
