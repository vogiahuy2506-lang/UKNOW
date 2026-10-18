import { describe, expect, it } from 'vitest';
import vi from '../../../../i18n/vi';
import buildSettingsChecklist from '../buildSettingsChecklist';

const t = (key, params = {}) => {
  const raw = key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), vi);
  if (typeof raw !== 'string') return key;
  return raw.replace(/\{(\w+)\}/g, (_, name) => (params[name] === undefined ? `{${name}}` : String(params[name])));
};

const node = (id, nodeType, config = {}, label = '') => ({ id, type: 'task', data: { label, nodeType, config } });
const edge = (source, target) => ({ id: `${source}-${target}`, source, target });
const chain = (...ids) => ids.slice(1).map((id, index) => edge(ids[index], id));

const lookups = {
  emailTemplates: [{ id: 7, templateName: 'Chào mừng' }],
  zaloTemplates: [{ id: 21, templateName: 'Mời học' }],
  emailSettings: [{ id: 3, name: 'CSKH', email: 'cskh@abc.vn' }],
  zaloAccounts: [{ id: '5', displayName: 'Shop Hoa' }],
  telegramAccounts: [{ id: 4, name: 'Bot A', username: 'bota' }],
  whatsappAccounts: [{ sessionKey: '40-default', display: '+84 912 345 678' }],
};

const run = (nodes, edges, extras) => buildSettingsChecklist(nodes, edges, lookups, t, extras);
const statuses = (rows) => Object.fromEntries(rows.map((row) => [row.key, row.status]));

describe('buildSettingsChecklist', () => {
  it('chiến dịch trống → ba dòng đầu thiếu "Chưa có", không có khối đích; Thời điểm luôn ✓', () => {
    const rows = run([], []);
    expect(rows.map((row) => row.key)).toEqual(['sender', 'audience', 'content', 'timing']);
    expect(statuses(rows)).toEqual({ sender: 'missing', audience: 'missing', content: 'missing', timing: 'ok' });
    expect(rows[0].summary).toBe(vi.campaignSettings.checklist.none);
    expect(rows.map((row) => row.targetNodeId)).toEqual([null, null, null, null]);
  });

  describe('chiến dịch trống có thẻ bắt đầu (extras.start)', () => {
    const start = (channel, sender = null) => ({ start: { channel, sender } });

    it('không chọn gì, email có tài khoản mặc định: Gửi từ ✓ "mặc định" (nút đưa tới phần Gửi từ), Gửi cho ai chờ chọn, Nội dung mờ không tính', () => {
      const rows = run([], [], start('email'));
      expect(statuses(rows)).toEqual({ sender: 'ok', audience: 'missing', content: 'idle', timing: 'ok' });
      expect(rows[0].summary).toBe('Tài khoản mặc định: CSKH (cskh@abc.vn)');
      expect(rows[0].anchor).toBe('sender');
      expect(rows[1]).toMatchObject({ summary: vi.campaignSettings.checklist.chooseBelow, anchor: 'audience', soft: true, targetNodeId: null });
      expect(rows[2]).toMatchObject({ summary: vi.campaignSettings.checklist.contentAfterAudience, targetNodeId: null });
      expect(rows[2].anchor).toBeUndefined();
    });

    it('đã chọn tài khoản → Gửi từ hiện đúng tài khoản đó, kể cả khi email có mặc định', () => {
      const rows = run([], [], start('email', { id: 9, label: 'sale@abc.vn' }));
      expect(rows[0]).toMatchObject({ status: 'ok', summary: 'sale@abc.vn', anchor: 'sender' });
    });

    it.each(['zalo', 'telegram', 'whatsapp'])('%s chưa chọn tài khoản: Gửi từ chưa đủ (soft, không đỏ), có nút tới phần Gửi từ', (channel) => {
      const rows = run([], [], start(channel));
      expect(rows[0]).toMatchObject({ status: 'missing', soft: true, summary: vi.campaignSettings.checklist.chooseBelow, anchor: 'sender' });
    });

    it('email không có tài khoản nào: Gửi từ chưa đủ; số mục "còn" = Gửi từ + Gửi cho ai, Nội dung không tính', () => {
      const rows = buildSettingsChecklist([], [], { ...lookups, emailSettings: [] }, t, start('email'));
      expect(rows.filter((row) => row.status === 'missing').map((row) => row.key)).toEqual(['sender', 'audience']);
    });

    it('chỉ có khối khởi chạy thủ công vẫn là "trống"; có thêm khối khác thì quay về cách tính theo khối', () => {
      const trig = node('s', 'manual_trigger');
      expect(run([trig], [], start('email'))[2].status).toBe('idle');
      const rows = run([trig, node('m', 'send_email', {})], [edge('s', 'm')], start('email'));
      expect(rows[2].status).toBe('missing');
      expect(rows[2].targetNodeId).toBe('m');
    });

    it('không truyền start → cách cũ "Chưa có"', () => {
      expect(run([], [])[0].summary).toBe(vi.campaignSettings.checklist.none);
    });
  });

  it('email đủ: cả ba dòng ✓, nút Sửa trỏ khối đầu tiên của vai', () => {
    const nodes = [
      node('start', 'manual_trigger'),
      node('mail', 'send_email', {
        fromEmailId: 3, recipientSource: 'manual', recipientEmails: 'a@b.vn',
        emailSteps: [{ templateId: 7, delayValue: 0, delayUnit: 'minutes', delayFrom: 'start' }],
      }),
    ];
    const rows = run(nodes, chain('start', 'mail'));
    expect(statuses(rows)).toEqual({ sender: 'ok', audience: 'ok', content: 'ok', timing: 'ok' });
    expect(rows[0].summary).toContain('CSKH');
    expect(rows[0].targetNodeId).toBe('mail');
    expect(rows[2].summary).toContain('Chào mừng');
  });

  it('email trống tài khoản gửi: có tài khoản đang hoạt động → Gửi từ ✓ "mặc định"; danh sách rỗng → ⚠. Thiếu mẫu → Nội dung ⚠', () => {
    const nodes = [
      node('start', 'manual_trigger'),
      node('mail', 'send_email', { recipientSource: 'manual', recipientEmails: 'a@b.vn', emailSteps: [{ templateId: '' }] }),
    ];
    const withDefault = run(nodes, chain('start', 'mail'));
    expect(statuses(withDefault)).toEqual({ sender: 'ok', audience: 'ok', content: 'missing', timing: 'ok' });
    expect(withDefault[0].summary).toBe('Tài khoản mặc định: CSKH (cskh@abc.vn)');

    const noAccounts = buildSettingsChecklist(nodes, chain('start', 'mail'), { ...lookups, emailSettings: [] }, t);
    expect(statuses(noAccounts)).toEqual({ sender: 'missing', audience: 'ok', content: 'missing', timing: 'ok' });
    expect(noAccounts[0].targetNodeId).toBe('mail');
  });

  it('Sửa trỏ khối giữ dòng thiếu ĐẦU TIÊN của vai (không phải khối đầu tiên của vai)', () => {
    const nodes = [
      node('start', 'manual_trigger'),
      node('sheetA', 'read_sheet', { sheetUrl: 'https://docs.google.com/spreadsheets/d/x' }),
      node('sheetB', 'read_sheet', {}),
      node('mail', 'send_email', { fromEmailId: 3, recipientSource: 'node', recipientNodeId: 'sheetA', recipientField: 'email', emailSteps: [{ templateId: 7 }] }),
    ];
    const rows = run(nodes, [edge('start', 'sheetA'), edge('sheetA', 'sheetB'), edge('sheetB', 'mail')]);
    const audience = rows.find((row) => row.key === 'audience');
    expect(audience.status).toBe('missing');
    expect(audience.targetNodeId).toBe('sheetB');
  });

  it('zalo cá nhân: tài khoản ở khối Chọn tài khoản = Gửi từ; thiếu tin = Nội dung ⚠', () => {
    const nodes = [
      node('start', 'manual_trigger'),
      node('acc', 'select_zalo_account', { zaloAccountId: '5' }),
      node('send', 'send_zalo_personal', { zaloRecipientSource: 'manual', zaloRecipientPhones: '0912345678' }),
    ];
    const rows = run(nodes, chain('start', 'acc', 'send'));
    expect(statuses(rows)).toEqual({ sender: 'ok', audience: 'ok', content: 'missing', timing: 'ok' });
    expect(rows[0].targetNodeId).toBe('acc');
    expect(rows[2].targetNodeId).toBe('send');
  });

  it('zalo nhóm: nguồn nhóm là Gửi cho ai; thiếu danh sách nhóm → ⚠', () => {
    const nodes = [
      node('start', 'manual_trigger'),
      node('acc', 'select_zalo_account', { zaloAccountId: '5' }),
      node('send', 'send_zalo_group', { zaloGroupSource: 'manual', zaloGroupIds: [], zaloGroupTemplateSteps: [{ templateId: 21 }] }),
    ];
    const rows = run(nodes, chain('start', 'acc', 'send'));
    expect(statuses(rows)).toEqual({ sender: 'ok', audience: 'missing', content: 'ok', timing: 'ok' });
    expect(rows[1].targetNodeId).toBe('send');
  });

  it('telegram: đủ (người đã nhắn) và thiếu tài khoản + tin', () => {
    const full = [node('start', 'manual_trigger'), node('tg', 'send_telegram', { telegramAccountId: 4, recipientSource: 'telegram_conversations', steps: [{ message: 'Chào' }] })];
    expect(statuses(run(full, chain('start', 'tg')))).toEqual({ sender: 'ok', audience: 'ok', content: 'ok', timing: 'ok' });
    const empty = [node('start', 'manual_trigger'), node('tg', 'send_telegram', { recipientSource: 'telegram_conversations' })];
    expect(statuses(run(empty, chain('start', 'tg')))).toEqual({ sender: 'missing', audience: 'ok', content: 'missing', timing: 'ok' });
  });

  it('telegram nhóm: chưa chọn nhóm → Gửi cho ai ⚠, chọn rồi → ✓', () => {
    const base = { telegramAccountId: 4, recipientSource: 'telegram_groups', steps: [{ message: 'Chào' }] };
    const none = [node('start', 'manual_trigger'), node('tg', 'send_telegram', { ...base, recipientKeys: [] })];
    expect(statuses(run(none, chain('start', 'tg'))).audience).toBe('missing');
    const some = [node('start', 'manual_trigger'), node('tg', 'send_telegram', { ...base, recipientKeys: ['-100'] })];
    expect(statuses(run(some, chain('start', 'tg'))).audience).toBe('ok');
  });

  it('whatsapp: thiếu tài khoản → Gửi từ ⚠; đủ → tất cả ✓', () => {
    const bad = [node('start', 'manual_trigger'), node('wa', 'send_whatsapp', { recipientSource: 'whatsapp_conversations', steps: [{ message: 'Hi' }] })];
    expect(statuses(run(bad, chain('start', 'wa'))).sender).toBe('missing');
    const ok = [node('start', 'manual_trigger'), node('wa', 'send_whatsapp', { whatsappSessionKey: '40-default', recipientSource: 'whatsapp_conversations', steps: [{ message: 'Hi' }] })];
    expect(statuses(run(ok, chain('start', 'wa')))).toEqual({ sender: 'ok', audience: 'ok', content: 'ok', timing: 'ok' });
  });

  it('Thời điểm: lấy tóm tắt lịch chạy nếu có, mặc định "chạy khi bấm Chạy"; luôn ✓', () => {
    expect(run([], [], { scheduleSummary: 'Hằng ngày 08:00' }).find((row) => row.key === 'timing'))
      .toMatchObject({ status: 'ok', summary: 'Hằng ngày 08:00' });
    expect(run([], []).find((row) => row.key === 'timing').summary).toBe(vi.campaignSettings.checklist.timingManual);
  });

  describe('tóm tắt theo KHỐI, "+N" = số khối / tin còn lại', () => {
    const mail = (extra = {}) => node('mail', 'send_email', {
      fromEmailId: 3, recipientSource: 'node', recipientNodeId: 'src', recipientField: 'email',
      emailSteps: [{ templateId: 7, delayValue: 0, delayUnit: 'minutes', delayFrom: 'start' }], ...extra,
    });
    const audienceOf = (rows) => rows.find((row) => row.key === 'audience');

    it('email + khách đã lưu: "Tất cả khách hàng" KHÔNG có "+" (bỏ dòng tham chiếu trong khối gửi và dòng thứ hai của khối nguồn)', () => {
      const nodes = [node('start', 'manual_trigger'), node('src', 'read_interested_customers', { interestedCustomerType: 'all' }), mail()];
      const row = audienceOf(run(nodes, chain('start', 'src', 'mail')));
      expect(row.summary).toBe('Tất cả khách hàng');
      expect(row.summary).not.toContain('+');
      expect(row.targetNodeId).toBe('src');
    });

    it('hai khối read_sheet song song: "+1" (đếm khối)', () => {
      const sheetA = node('a', 'read_sheet', { sheetUrl: 'https://docs.google.com/spreadsheets/d/a', sheetName: 'A' });
      const sheetB = node('b', 'read_sheet', { sheetUrl: 'https://docs.google.com/spreadsheets/d/b', sheetName: 'B' });
      const nodes = [node('start', 'manual_trigger'), sheetA, sheetB, mail({ recipientNodeId: 'a' })];
      const row = audienceOf(run(nodes, [edge('start', 'a'), edge('start', 'b'), edge('a', 'mail'), edge('b', 'mail')]));
      expect(row.summary).toMatch(/\+1$/);
      expect(row.summary).toContain('docs.google.com');
    });

    it('Telegram người đã nhắn (không có khối nguồn): dùng dòng audience của khối gửi', () => {
      const nodes = [node('start', 'manual_trigger'), node('tg', 'send_telegram', { telegramAccountId: 4, recipientSource: 'telegram_conversations', steps: [{ message: 'Chào' }] })];
      const row = audienceOf(run(nodes, chain('start', 'tg')));
      expect(row.summary).toBe(vi.campaignSettings.telegramConversations);
      expect(row.targetNodeId).toBe('tg');
    });

    it('nội dung 3 tin: "Tin 1: … +2" (đếm tin)', () => {
      const steps = [7, 8, 7].map((templateId) => ({ templateId, delayValue: 0, delayUnit: 'minutes', delayFrom: 'start' }));
      const nodes = [node('start', 'manual_trigger'), node('src', 'read_interested_customers', {}), mail({ emailSteps: steps })];
      const row = run(nodes, chain('start', 'src', 'mail')).find((r) => r.key === 'content');
      expect(row.summary).toMatch(/^Tin 1: .*\+2$/);
    });

    it('trạng thái ⚠ và targetNodeId giữ logic dòng thiếu đầu tiên', () => {
      const nodes = [node('start', 'manual_trigger'), node('src', 'read_sheet', {}), mail()];
      const row = audienceOf(run(nodes, chain('start', 'src', 'mail')));
      expect(row).toMatchObject({ status: 'missing', targetNodeId: 'src' });
    });
  });
});
