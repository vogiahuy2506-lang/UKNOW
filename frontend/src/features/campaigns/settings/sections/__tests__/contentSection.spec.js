import { describe, expect, it } from 'vitest';
import vi from '../../../../../i18n/vi';
import { EMPTY_AUDIENCE } from '../../../simple/simpleCampaign.helpers';
import {
  buildAudienceGraph,
  createBlankContentStep,
  isContentValueChanged,
  maxStepsOf,
  readContent,
  readSettingsSections,
  validateContentValue,
  writeContent,
} from '..';

const t = (key, params = {}) => {
  const raw = key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), vi);
  if (typeof raw !== 'string') return key;
  return raw.replace(/\{(\w+)\}/g, (_, name) => (params[name] === undefined ? `{${name}}` : String(params[name])));
};

const lookups = {
  emailTemplates: [{ id: 7, templateName: 'Chào mừng' }, { id: 8, templateName: 'Nhắc lại' }],
  zaloTemplates: [{ id: 21, templateName: 'Mời học' }, { id: 22, templateName: 'Nhắc học' }],
  emailSettings: [{ id: 3, name: 'CSKH', email: 'cskh@abc.vn' }],
  zaloAccounts: [{ id: '5', displayName: 'Shop Hoa' }],
};
const ctx = (campaignType = 'email') => ({ campaignType, locale: 'vi', lookups, t });

const node = (id, nodeType, config = {}) => ({ id, type: 'task', position: { x: 0, y: 0 }, data: { label: nodeType, nodeType, config } });
const edge = (source, target) => ({ id: `${source}-${target}`, source, target });
const chain = (...ids) => ids.slice(1).map((id, index) => edge(ids[index], id));

const sendOf = (nodes, subtype) => nodes.find((item) => item.data.nodeType === subtype);
const stepsOf = (nodes, subtype, field) => sendOf(nodes, subtype).data.config[field];

/** Chiến dịch email dựng như `compileSimpleGraph` cho tin đơn: `sendMode 'all'`, một bước `delayFrom 'start'`. */
const emailOnce = (steps) => ({
  nodes: [
    node('start', 'manual_trigger'),
    node('sheet', 'read_sheet', { sheetUrl: 'https://x' }),
    node('mail', 'send_email', {
      fromEmailId: 3, recipientSource: 'node', recipientNodeId: 'sheet', recipientField: 'email', saveMessageLog: true, sendMode: 'all',
      emailSteps: steps || [{ templateId: 7, emailSubject: '', emailBody: '', delayValue: 0, delayUnit: 'days', delayFrom: 'start', enableLinkTracking: true, templateMappings: [] }],
    }),
  ],
  edges: chain('start', 'sheet', 'mail'),
});

/** Chuỗi email dựng như drip: `sendMode 'schedule'`, bước sau `delayFrom 'prev'`, kèm mapping dựng tay ở bước 2. */
const emailDripSteps = () => ([
  { templateId: 7, emailSubject: '', emailBody: '', delayValue: 0, delayUnit: 'days', delayFrom: 'prev', enableLinkTracking: true, templateMappings: [] },
  {
    templateId: 8, emailSubject: '', emailBody: '', delayValue: 2, delayUnit: 'days', delayFrom: 'prev', enableLinkTracking: true,
    templateMappings: [{ key: 'ten', sourceType: 'node', nodeId: 'sheet', field: 'Họ tên' }],
  },
]);
const withMode = (flow, mode) => ({
  ...flow,
  nodes: flow.nodes.map((item) => (item.id === 'mail' ? { ...item, data: { ...item.data, config: { ...item.data.config, sendMode: mode } } } : item)),
});

const emailDrip = () => withMode(emailOnce(emailDripSteps()), 'schedule');

const zaloPersonal = (steps, mode = 'schedule') => ({
  nodes: [
    node('start', 'manual_trigger'),
    node('acc', 'select_zalo_account', { zaloAccountId: 5 }),
    node('sheet', 'read_sheet', { sheetUrl: 'https://x' }),
    node('zalo', 'send_zalo_personal', {
      zaloRecipientSource: 'node', zaloRecipientNodeId: 'sheet', zaloRecipientField: 'phone', zaloPersonalSendMode: mode, zaloPersonalTemplateSteps: steps,
    }),
  ],
  edges: chain('start', 'acc', 'sheet', 'zalo'),
});
const zaloGroup = (steps) => ({
  nodes: [
    node('start', 'manual_trigger'),
    node('acc', 'select_zalo_account', { zaloAccountId: 5 }),
    node('grp', 'get_all_groups', {}),
    node('zg', 'send_zalo_group', { zaloGroupSource: 'node', zaloGroupNodeId: 'grp', zaloGroupField: 'groupId', zaloGroupSendMode: 'schedule', zaloGroupTemplateSteps: steps }),
  ],
  edges: chain('start', 'acc', 'grp', 'zg'),
});
const adapterFlow = (subtype, steps) => ({
  nodes: [node('start', 'manual_trigger'), node('tg', subtype, { recipientSource: `${subtype === 'send_telegram' ? 'telegram' : 'whatsapp'}_conversations`, steps })],
  edges: chain('start', 'tg'),
});

const groupOf = (flow, campaignType, nodeId) => readContent(flow.nodes, flow.edges, ctx(campaignType)).items.find((item) => item.nodeId === nodeId);
const asValue = (group) => JSON.parse(JSON.stringify(group.value));

const ZALO_STEPS = [
  { templateId: 21, message: '', delayValue: 0, delayUnit: 'days', delayFrom: 'prev', enableLinkTracking: true, templateMappings: [] },
  { templateId: 22, message: '', delayValue: 3, delayUnit: 'hours', delayFrom: 'prev', enableLinkTracking: true, templateMappings: [{ key: 'ten', sourceType: 'node', nodeId: 'sheet', field: 'ten' }] },
];
const TG_STEPS = [
  { templateId: 21, message: 'Chào bạn', attachments: [{ name: 'a.png' }] },
  { templateId: null, message: 'Nhắc lại nhé', delayValue: 30, delayUnit: 'minutes' },
];

describe('Nội dung — đọc từng kênh', () => {
  it.each([
    ['email', emailOnce(), 'mail', 1],
    ['email', emailDrip(), 'mail', 2],
    ['zalo', zaloPersonal(ZALO_STEPS), 'zalo', 2],
    ['zalo_group', zaloGroup([{ templateId: 21, message: '', delayValue: 0, delayUnit: 'days', delayFrom: 'prev', templateMappings: [] }]), 'zg', 1],
    ['telegram', adapterFlow('send_telegram', TG_STEPS), 'tg', 2],
    ['whatsapp', adapterFlow('send_whatsapp', [{ templateId: null, message: 'Xin chào' }]), 'tg', 1],
  ])('%s: sửa được, đủ số tin, tên mẫu lấy từ danh sách, không có chữ khối/node trong tóm tắt', (campaignType, flow, nodeId, count) => {
    const result = readContent(flow.nodes, flow.edges, ctx(campaignType));
    const item = result.items[0];
    expect(item.nodeId).toBe(nodeId);
    expect(item.editable).toBe(true);
    expect(item.value.steps).toHaveLength(count);
    expect(item.value.maxSteps).toBe(maxStepsOf(item.value.channel));
    expect(item.lines.map((line) => `${line.label} ${line.value}`).join(' ')).not.toMatch(/khối|node/i);
    expect(result.status).toBe('ok');
  });

  it('hiện tên mẫu và cách chờ: email drip bước 2 "2 ngày sau tin trước", bước dựng tay start "sau tin đầu"', () => {
    const drip = groupOf(emailDrip(), 'email', 'mail');
    expect(drip.value.steps[1].content).toMatchObject({ mode: 'template', templateId: 8, templateName: 'Nhắc lại' });
    expect(drip.value.steps[1]).toMatchObject({ delayValue: 2, delayUnit: 'days', delayFrom: 'prev' });
    const handBuilt = withMode(emailOnce([
      { templateId: 7, delayValue: 0, delayUnit: 'minutes', delayFrom: 'start' },
      { templateId: 8, delayValue: 5, delayUnit: 'hours', delayFrom: 'start' },
    ]), 'schedule');
    const item = groupOf(handBuilt, 'email', 'mail');
    expect(item.value.steps[1].delayFrom).toBe('start');
    expect(item.lines[1].value).toContain('sau tin đầu');
  });

  it('tin Telegram dùng mẫu: giữ tệp đính kèm của bước; tin tự soạn: mode custom', () => {
    const item = groupOf(adapterFlow('send_telegram', TG_STEPS), 'telegram', 'tg');
    expect(item.value.steps[0].content).toMatchObject({ mode: 'template', templateId: 21, templateAttachments: [{ name: 'a.png' }], templateBodyLength: 8 });
    expect(item.value.steps[1].content).toMatchObject({ mode: 'custom', body: 'Nhắc lại nhé' });
  });

  it('khung trống (bước rỗng của bộ dựng khung): sửa được, thiếu, một tin trống', () => {
    const flow = buildAudienceGraph({ campaignType: 'email', audience: { ...EMPTY_AUDIENCE, type: 'customers' }, sender: { id: 3, label: 'CSKH' }, locale: 'vi' });
    const result = readSettingsSections(flow.nodes, flow.edges, ctx('email')).content;
    expect(result.status).toBe('missing');
    expect(result.items[0].editable).toBe(true);
    expect(result.items[0].value.steps).toHaveLength(1);
    expect(result.items[0].value.steps[0].content).toMatchObject({ mode: 'template', templateId: null });
  });
});

describe('Nội dung — write(read(x)) không đổi gì', () => {
  it.each([
    ['email once', 'email', emailOnce(), 'mail'],
    ['email drip (có mapping dựng tay)', 'email', emailDrip(), 'mail'],
    ['email gửi tay (không có sendMode)', 'email', emailOnce([{ templateId: 7, delayValue: 0, delayUnit: 'days' }]), 'mail'],
    ['email bước sau thiếu delayFrom', 'email', withMode(emailOnce([{ templateId: 7, delayValue: 0, delayUnit: 'days' }, { templateId: 8, delayValue: 1, delayUnit: 'days' }]), 'schedule'), 'mail'],
    ['zalo cá nhân', 'zalo', zaloPersonal(ZALO_STEPS), 'zalo'],
    ['zalo nhóm', 'zalo_group', zaloGroup([{ templateId: 21, message: '', delayValue: 0, delayUnit: 'days', delayFrom: 'prev', templateMappings: [] }]), 'zg'],
    ['telegram có tệp + tin tự soạn', 'telegram', adapterFlow('send_telegram', TG_STEPS), 'tg'],
    ['whatsapp', 'whatsapp', adapterFlow('send_whatsapp', [{ templateId: null, message: 'Xin chào' }]), 'tg'],
  ])('%s: cùng tham chiếu nodes', (_name, campaignType, flow, nodeId) => {
    const item = groupOf(flow, campaignType, nodeId);
    const written = writeContent(flow.nodes, flow.edges, nodeId, asValue(item));
    expect(written.nodes).toBe(flow.nodes);
    expect(written.edges).toBe(flow.edges);
  });
});

describe('Nội dung — email', () => {
  it('thêm tin 2 chờ 30 phút vào email gửi một tin: bước 2 đúng hình dạng bộ biên dịch, sendMode thành schedule, tin 1 không bị chạm', () => {
    const flow = emailOnce();
    const value = asValue(groupOf(flow, 'email', 'mail'));
    value.steps.push({ ...createBlankContentStep(), delayValue: 30, delayUnit: 'minutes', content: { ...createBlankContentStep().content, templateId: 8, templateName: 'Nhắc lại' } });
    const written = writeContent(flow.nodes, flow.edges, 'mail', value);
    const steps = stepsOf(written.nodes, 'send_email', 'emailSteps');
    expect(steps).toHaveLength(2);
    expect(steps[0]).toBe(flow.nodes[2].data.config.emailSteps[0]);
    expect(steps[1]).toEqual({
      templateId: 8, emailSubject: '', emailBody: '', delayValue: 30, delayUnit: 'minutes', delayFrom: 'prev', enableLinkTracking: true, templateMappings: [],
    });
    expect(sendOf(written.nodes, 'send_email').data.config.sendMode).toBe('schedule');
    // Trường khác của khối gửi nguyên vẹn.
    expect(sendOf(written.nodes, 'send_email').data.config).toMatchObject({ fromEmailId: 3, recipientNodeId: 'sheet', saveMessageLog: true });
    expect(written.nodes[0]).toBe(flow.nodes[0]);
  });

  it('đổi mẫu của bước 2 → mapping dựng lại như bộ biên dịch ([]); bước 1 không đổi giữ NGUYÊN object, mapping dựng tay của bước KHÔNG đổi mẫu được giữ', () => {
    const flow = emailDrip();
    const value = asValue(groupOf(flow, 'email', 'mail'));
    value.steps[0].content = { ...value.steps[0].content, templateId: 8, templateName: 'Nhắc lại' };
    const written = writeContent(flow.nodes, flow.edges, 'mail', value);
    const [first, second] = stepsOf(written.nodes, 'send_email', 'emailSteps');
    expect(first.templateId).toBe(8);
    expect(first.templateMappings).toEqual([]);
    expect(second).toBe(flow.nodes[2].data.config.emailSteps[1]);
    expect(second.templateMappings).toEqual([{ key: 'ten', sourceType: 'node', nodeId: 'sheet', field: 'Họ tên' }]);
  });

  it('đổi mẫu của bước có mapping dựng tay → mapping bị dựng lại (không còn trỏ cột của mẫu cũ)', () => {
    const flow = emailDrip();
    const value = asValue(groupOf(flow, 'email', 'mail'));
    value.steps[1].content = { ...value.steps[1].content, templateId: 7, templateName: 'Chào mừng' };
    const written = writeContent(flow.nodes, flow.edges, 'mail', value);
    expect(stepsOf(written.nodes, 'send_email', 'emailSteps')[1].templateMappings).toEqual([]);
    expect(stepsOf(written.nodes, 'send_email', 'emailSteps')[1].delayFrom).toBe('prev');
  });

  it('chỉ đổi khoảng chờ của bước 2: giữ templateId + mapping + delayFrom, đổi đúng delayValue/delayUnit', () => {
    const flow = emailDrip();
    const value = asValue(groupOf(flow, 'email', 'mail'));
    Object.assign(value.steps[1], { delayValue: 4, delayUnit: 'hours' });
    const written = writeContent(flow.nodes, flow.edges, 'mail', value);
    expect(stepsOf(written.nodes, 'send_email', 'emailSteps')[1]).toEqual({
      ...flow.nodes[2].data.config.emailSteps[1], delayValue: 4, delayUnit: 'hours',
    });
  });

  it('bước dựng tay delayFrom "start" / thiếu: đổi độ trễ không tự đổi sang "prev"', () => {
    const flow = withMode(emailOnce([
      { templateId: 7, delayValue: 0, delayUnit: 'minutes', delayFrom: 'start' },
      { templateId: 8, delayValue: 5, delayUnit: 'hours', delayFrom: 'start' },
      { templateId: 8, delayValue: 1, delayUnit: 'days' },
    ]), 'schedule');
    const value = asValue(groupOf(flow, 'email', 'mail'));
    value.steps[1].delayValue = 6;
    value.steps[2].delayValue = 2;
    const written = writeContent(flow.nodes, flow.edges, 'mail', value);
    const steps = stepsOf(written.nodes, 'send_email', 'emailSteps');
    expect(steps[1]).toEqual({ templateId: 8, delayValue: 6, delayUnit: 'hours', delayFrom: 'start' });
    expect(steps[2]).toEqual({ templateId: 8, delayValue: 2, delayUnit: 'days' });
    expect(steps[2]).not.toHaveProperty('delayFrom');
  });

  it('xoá tin 2: còn 1 bước, bước 1 nguyên vẹn', () => {
    const flow = emailDrip();
    const value = asValue(groupOf(flow, 'email', 'mail'));
    value.steps.pop();
    const written = writeContent(flow.nodes, flow.edges, 'mail', value);
    const steps = stepsOf(written.nodes, 'send_email', 'emailSteps');
    expect(steps).toHaveLength(1);
    expect(steps[0]).toBe(flow.nodes[2].data.config.emailSteps[0]);
  });

  it('tin tự soạn email CHƯA có mẫu → write từ chối (không ghi nửa vời); có mẫu rồi (customBody) thì ghi templateId, bỏ chữ trong bước', () => {
    const flow = emailOnce();
    const value = asValue(groupOf(flow, 'email', 'mail'));
    value.steps[0].content = { ...value.steps[0].content, mode: 'custom', subject: 'Chào', body: 'Nội dung' };
    expect(writeContent(flow.nodes, flow.edges, 'mail', value)).toBeNull();
    value.steps[0].content = { ...value.steps[0].content, mode: 'template', templateId: 99, templateName: 'Mẫu mới' };
    const written = writeContent(flow.nodes, flow.edges, 'mail', value);
    expect(stepsOf(written.nodes, 'send_email', 'emailSteps')[0]).toMatchObject({ templateId: 99, emailSubject: '', emailBody: '', templateMappings: [] });
  });
});

describe('Nội dung — Zalo', () => {
  it('Zalo cá nhân: tin tự soạn vừa thành mẫu → templateId + chữ ở message + mapping ghép biến vào khối nguồn người nhận', () => {
    const flow = zaloPersonal([ZALO_STEPS[0]], 'all');
    const value = asValue(groupOf(flow, 'zalo', 'zalo'));
    value.steps.push({
      ...createBlankContentStep(),
      delayValue: 1,
      delayUnit: 'days',
      content: { mode: 'template', templateId: 55, templateName: 'Mẫu 2', customBody: 'Chào {{ten}}, hẹn {{ngay}}', subject: '', body: 'Chào {{ten}}, hẹn {{ngay}}' },
    });
    const written = writeContent(flow.nodes, flow.edges, 'zalo', value);
    const steps = stepsOf(written.nodes, 'send_zalo_personal', 'zaloPersonalTemplateSteps');
    expect(steps[1]).toEqual({
      templateId: 55,
      message: 'Chào {{ten}}, hẹn {{ngay}}',
      delayValue: 1,
      delayUnit: 'days',
      delayFrom: 'prev',
      enableLinkTracking: true,
      templateMappings: [
        { key: 'ten', sourceType: 'node', nodeId: 'sheet', field: 'ten' },
        { key: 'ngay', sourceType: 'node', nodeId: 'sheet', field: 'ngay' },
      ],
    });
    expect(sendOf(written.nodes, 'send_zalo_personal').data.config.zaloPersonalSendMode).toBe('schedule');
  });

  it('Zalo nhóm: bước mới KHÔNG có enableLinkTracking (đúng bộ biên dịch), ghép biến theo khối nhóm', () => {
    const flow = zaloGroup([{ templateId: 21, message: '', delayValue: 0, delayUnit: 'days', delayFrom: 'prev', templateMappings: [] }]);
    const value = asValue(groupOf(flow, 'zalo_group', 'zg'));
    value.steps.push({ ...createBlankContentStep(), delayValue: 2, delayUnit: 'days', content: { ...createBlankContentStep().content, templateId: 22, templateName: 'Nhắc học' } });
    const written = writeContent(flow.nodes, flow.edges, 'zg', value);
    const second = stepsOf(written.nodes, 'send_zalo_group', 'zaloGroupTemplateSteps')[1];
    expect(second).toEqual({ templateId: 22, message: '', delayValue: 2, delayUnit: 'days', delayFrom: 'prev', templateMappings: [] });
  });

  it('Zalo có chữ mà thiếu mẫu (dựng tay): mode custom + cần mẫu → write từ chối tới khi có mẫu', () => {
    const flow = zaloPersonal([{ templateId: null, message: 'Chào bạn', delayValue: 0, delayUnit: 'days', delayFrom: 'prev' }]);
    const item = groupOf(flow, 'zalo', 'zalo');
    expect(item.value.steps[0]).toMatchObject({ needsTemplate: true, content: { mode: 'custom', body: 'Chào bạn' } });
    expect(writeContent(flow.nodes, flow.edges, 'zalo', asValue(item))).toBeNull();
  });
});

describe('Nội dung — Telegram / WhatsApp', () => {
  it('đổi mẫu bước 1: CHÉP chữ + tệp của mẫu vào bước (bộ chạy không tra mẫu); bước 2 giữ nguyên', () => {
    const flow = adapterFlow('send_telegram', TG_STEPS);
    const value = asValue(groupOf(flow, 'telegram', 'tg'));
    value.steps[0].content = { ...value.steps[0].content, templateId: 22, templateName: 'Nhắc học', templateBody: 'Chữ của mẫu 22', templateBodyLength: 14, templateAttachments: [{ name: 'b.pdf' }] };
    const written = writeContent(flow.nodes, flow.edges, 'tg', value);
    const steps = stepsOf(written.nodes, 'send_telegram', 'steps');
    expect(steps[0]).toEqual({ templateId: 22, message: 'Chữ của mẫu 22', attachments: [{ name: 'b.pdf' }] });
    expect(steps[1]).toBe(flow.nodes[1].data.config.steps[1]);
  });

  it('thêm tin 2 tự soạn: ghi thẳng message, không có delayFrom; không đổi chế độ gửi (kênh này không có)', () => {
    const flow = adapterFlow('send_whatsapp', [{ templateId: null, message: 'Xin chào' }]);
    const value = asValue(groupOf(flow, 'whatsapp', 'tg'));
    value.steps.push({ ...createBlankContentStep(), delayValue: 2, delayUnit: 'hours', content: { ...createBlankContentStep().content, mode: 'custom', body: ' Nhắc bạn ' } });
    const written = writeContent(flow.nodes, flow.edges, 'tg', value);
    const steps = stepsOf(written.nodes, 'send_whatsapp', 'steps');
    expect(steps[1]).toEqual({ templateId: null, message: 'Nhắc bạn', delayValue: 2, delayUnit: 'hours' });
    expect(steps[1]).not.toHaveProperty('delayFrom');
    expect(sendOf(written.nodes, 'send_whatsapp').data.config).not.toHaveProperty('sendMode');
  });

  it('mẫu → tự soạn: bỏ tệp của mẫu; tự soạn sửa chữ: giữ tệp riêng của bước', () => {
    const flow = adapterFlow('send_telegram', [{ templateId: 21, message: 'Chào', attachments: [{ name: 'a.png' }] }, { templateId: null, message: 'Cũ', attachments: [{ name: 'c.png' }], delayValue: 1, delayUnit: 'hours' }]);
    const value = asValue(groupOf(flow, 'telegram', 'tg'));
    value.steps[0].content = { ...value.steps[0].content, mode: 'custom', body: 'Soạn lại' };
    value.steps[1].content = { ...value.steps[1].content, body: 'Mới' };
    const steps = stepsOf(writeContent(flow.nodes, flow.edges, 'tg', value).nodes, 'send_telegram', 'steps');
    expect(steps[0]).toEqual({ templateId: null, message: 'Soạn lại' });
    expect(steps[1]).toEqual({ templateId: null, message: 'Mới', attachments: [{ name: 'c.png' }], delayValue: 1, delayUnit: 'hours' });
  });
});

describe('Nội dung — không biểu diễn được thì KHÔNG sửa và KHÔNG ghi', () => {
  const cases = [
    ['gửi tất cả cùng lúc nhưng đã có 2 tin', 'email', withMode(emailDrip(), 'all'), 'mail', 'sendAll'],
    ['chế độ gửi lạ', 'email', withMode(emailOnce(), 'stagger'), 'mail', 'sendMode'],
    ['đơn vị chờ "weeks"', 'email', withMode(emailOnce([{ templateId: 7, delayValue: 0, delayUnit: 'days' }, { templateId: 8, delayValue: 1, delayUnit: 'weeks', delayFrom: 'prev' }]), 'schedule'), 'mail', 'step'],
    ['email còn chữ HTML nằm thẳng trong bước', 'email', emailOnce([{ templateId: null, emailSubject: 'A', emailBody: '<p>x</p>', delayValue: 0, delayUnit: 'days' }]), 'mail', 'step'],
    ['Zalo lưu kiểu cũ (zaloMessage, không có bước)', 'zalo', { nodes: [node('start', 'manual_trigger'), node('z', 'send_zalo_personal', { zaloMessage: 'Chào' })], edges: chain('start', 'z') }, 'z', 'legacy'],
    ['kết bạn Zalo', 'zalo', { nodes: [node('start', 'manual_trigger'), node('z', 'send_zalo_friend_request', {})], edges: chain('start', 'z') }, 'z', 'unsupported'],
    ['bước không phải object', 'zalo', zaloPersonal([null, 5]), 'zalo', 'step'],
  ];
  it.each(cases)('%s', (_name, campaignType, flow, nodeId, reason) => {
    const item = groupOf(flow, campaignType, nodeId);
    expect(item.editable).toBe(false);
    expect(item.reasonIfNotEditable).toBe(reason);
    expect(item.value).toBeNull();
    expect(writeContent(flow.nodes, flow.edges, nodeId, { nodeId, steps: [createBlankContentStep()], channel: 'email' })).toBeNull();
    expect(vi.campaignSettings.content.notEditable[reason]).toBeTruthy();
  });

  it('nhiều khối gửi: mỗi khối một nhóm riêng, sửa khối này không đụng khối kia', () => {
    const flow = {
      nodes: [
        node('start', 'manual_trigger'),
        node('mail', 'send_email', { emailSteps: [{ templateId: 7, delayValue: 0, delayUnit: 'days', delayFrom: 'start' }], sendMode: 'all' }),
        node('tg', 'send_telegram', { steps: [{ templateId: null, message: 'Chào' }] }),
      ],
      edges: chain('start', 'mail', 'tg'),
    };
    const result = readContent(flow.nodes, flow.edges, ctx('email'));
    expect(result.items.map((item) => item.nodeId)).toEqual(['mail', 'tg']);
    const value = asValue(result.items[1]);
    value.steps[0].content.body = 'Chào bạn';
    const written = writeContent(flow.nodes, flow.edges, 'tg', value);
    expect(written.nodes[1]).toBe(flow.nodes[1]);
    expect(stepsOf(written.nodes, 'send_telegram', 'steps')[0].message).toBe('Chào bạn');
  });
});

describe('Nội dung — kiểm hợp lệ và trần số tin theo kênh', () => {
  it('trần: email / Zalo 10 tin, Telegram / WhatsApp 5 tin — vượt trần thì validate sai và write từ chối', () => {
    expect([maxStepsOf('email'), maxStepsOf('zalo'), maxStepsOf('telegram'), maxStepsOf('whatsapp')]).toEqual([10, 10, 5, 5]);
    const flow = adapterFlow('send_telegram', [{ templateId: null, message: 'Một' }]);
    const value = asValue(groupOf(flow, 'telegram', 'tg'));
    const filled = () => ({ ...createBlankContentStep(), content: { ...createBlankContentStep().content, mode: 'custom', body: 'Nội dung' } });
    value.steps.push(filled(), filled(), filled(), filled());
    expect(validateContentValue(value).ok).toBe(true);
    expect(writeContent(flow.nodes, flow.edges, 'tg', value)).not.toBeNull();
    value.steps.push(filled());
    expect(validateContentValue(value).ok).toBe(false);
    expect(writeContent(flow.nodes, flow.edges, 'tg', value)).toBeNull();
  });

  it('khoảng chờ: 0 / chữ / số lẻ sai khi mới thêm hoặc đổi; giữ nguyên giá trị đã lưu (kể cả 0 của Telegram) thì không báo lỗi; Telegram quá 30 ngày sai', () => {
    const flow = adapterFlow('send_telegram', [{ templateId: null, message: 'Một' }, { templateId: null, message: 'Hai', delayValue: 0, delayUnit: 'minutes' }]);
    const value = asValue(groupOf(flow, 'telegram', 'tg'));
    expect(validateContentValue(value).ok).toBe(true);
    value.steps[1].delayValue = 0;
    value.steps[1].delayUnit = 'hours';
    expect(validateContentValue(value).steps[1].delay).toBe('invalid');
    value.steps[1].delayValue = '1.5';
    expect(validateContentValue(value).steps[1].delay).toBe('invalid');
    value.steps[1].delayValue = 31;
    value.steps[1].delayUnit = 'days';
    expect(validateContentValue(value).steps[1].delay).toBe('tooLong');
    value.steps[1].delayValue = 30;
    expect(validateContentValue(value).steps[1].delay).toBe('');
  });

  it('tin tự soạn: Zalo quá 4000 ký tự, email thiếu tiêu đề / tiêu đề quá 150 → không hợp lệ', () => {
    const flow = emailOnce();
    const value = asValue(groupOf(flow, 'email', 'mail'));
    value.steps[0].content = { ...value.steps[0].content, mode: 'custom', body: 'x' };
    expect(validateContentValue(value).steps[0].content).toBe('incomplete');
    value.steps[0].content.subject = 'a'.repeat(151);
    expect(validateContentValue(value).steps[0].content).toBe('subjectTooLong');
    value.steps[0].content.subject = 'ok';
    expect(validateContentValue(value).ok).toBe(true);
    const zalo = asValue(groupOf(zaloPersonal([ZALO_STEPS[0]]), 'zalo', 'zalo'));
    zalo.steps[0].content = { ...zalo.steps[0].content, mode: 'custom', body: 'x'.repeat(4001) };
    expect(validateContentValue(zalo).steps[0].content).toBe('tooLong');
  });

  it('isContentValueChanged: không đụng gì = không đổi; đổi chữ / mẫu / chờ / thêm tin = đổi', () => {
    const flow = emailDrip();
    const initial = asValue(groupOf(flow, 'email', 'mail'));
    expect(isContentValueChanged(JSON.parse(JSON.stringify(initial)), initial)).toBe(false);
    const edited = JSON.parse(JSON.stringify(initial));
    edited.steps[1].delayValue = 3;
    expect(isContentValueChanged(edited, initial)).toBe(true);
  });
});
