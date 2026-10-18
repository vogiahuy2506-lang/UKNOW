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

  it('email thiếu tài khoản + mẫu → ⚠ ở Gửi từ và Nội dung, Gửi cho vẫn ✓', () => {
    const nodes = [
      node('start', 'manual_trigger'),
      node('mail', 'send_email', { recipientSource: 'manual', recipientEmails: 'a@b.vn', emailSteps: [{ templateId: '' }] }),
    ];
    const rows = run(nodes, chain('start', 'mail'));
    expect(statuses(rows)).toEqual({ sender: 'missing', audience: 'ok', content: 'missing', timing: 'ok' });
    expect(rows[0].targetNodeId).toBe('mail');
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
});
