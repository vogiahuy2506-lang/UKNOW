import { describe, expect, it } from 'vitest';
import {
  findFirstMissingRole,
  pickFirstMissingTarget,
  resolveSectionForNode,
  resolveSectionForRole,
  ROLE_PRIORITY,
  SECTION_BY_SUBTYPE_ROLE,
} from '../resolveEditSection';
import buildSettingsOrder from '../buildSettingsOrder';

// t trả khoá: đủ để describeNodeSettings chạy, ta chỉ xét tone / role.
const t = (key) => key;
const node = (id, nodeType, config = {}) => ({ id, type: nodeType === 'manual_trigger' ? 'start' : 'task', data: { label: id, nodeType, config } });
const edge = (source, target) => ({ id: `${source}-${target}`, source, target });

describe('resolveSectionForRole — ghim từng cặp (loại khối × vai) theo id mục THẬT của form', () => {
  const cases = [
    ['send_email', 'sender', 'basic'],
    ['send_email', 'audience', 'recipient'],
    ['send_email', 'content', 'templates'],
    ['send_zalo_personal', 'audience', 'basic'],
    ['send_zalo_personal', 'content', 'templates'],
    ['send_zalo_group', 'audience', 'basic'],
    ['send_zalo_group', 'content', 'templates'],
    ['read_sheet', 'audience', 'basic'],
    ['read_interested_customers', 'audience', 'test'],
    ['read_courses_db', 'audience', 'select'],
    ['read_products_db', 'audience', 'select'],
  ];
  it.each(cases)('%s × %s → %s', (subtype, role, expected) => {
    expect(resolveSectionForRole(subtype, role)).toBe(expected);
  });

  it('bảng không có cặp thừa: số cặp trong bảng = số cặp được ghim ở trên', () => {
    const total = Object.values(SECTION_BY_SUBTYPE_ROLE).reduce((sum, byRole) => sum + Object.keys(byRole).length, 0);
    expect(total).toBe(cases.length);
  });

  it.each([
    ['send_telegram', 'audience'],
    ['send_whatsapp', 'content'],
    ['send_zalo_friend_request', 'audience'],
    ['read_landing_leads', 'audience'],
    ['read_form_submissions', 'audience'],
    ['select_zalo_account', 'sender'],
    ['send_zalo_personal', 'sender'],
    ['send_email', 'timing'],
    ['khong_co', 'audience'],
  ])('%s × %s → null (form một trang / không có mục)', (subtype, role) => {
    expect(resolveSectionForRole(subtype, role)).toBeNull();
  });
});

describe('resolveSectionForNode / findFirstMissingRole', () => {
  const lookups = { emailSettings: [{ id: 3 }] };

  it('email nhập tay chưa có email → dòng thiếu đầu tiên là audience → mục recipient', () => {
    const mail = node('mail', 'send_email', { fromEmailId: 3, recipientSource: 'manual', recipientEmails: '', emailSteps: [{ templateId: 7 }] });
    expect(findFirstMissingRole(mail, lookups, t)).toBe('audience');
    expect(resolveSectionForNode(mail, lookups, t)).toBe('recipient');
  });

  it('email đủ nguồn nhưng chưa chọn mẫu → templates; không thiếu gì → null (mục đầu)', () => {
    const noTemplate = node('mail', 'send_email', { fromEmailId: 3, recipientSource: 'manual', recipientEmails: 'a@x.vn', emailSteps: [] });
    expect(resolveSectionForNode(noTemplate, lookups, t)).toBe('templates');
    const full = node('mail', 'send_email', { fromEmailId: 3, recipientSource: 'manual', recipientEmails: 'a@x.vn', emailSteps: [{ templateId: 7 }] });
    expect(findFirstMissingRole(full, lookups, t)).toBeNull();
    expect(resolveSectionForNode(full, lookups, t)).toBeNull();
  });
});

describe('pickFirstMissingTarget — thứ tự tự mở thẻ sau khi dựng khung', () => {
  const lookups = { emailSettings: [{ id: 3 }] };
  const orderedOf = (nodes, edges) => buildSettingsOrder(nodes, edges).ordered;

  it('ưu tiên vai audience (người dùng vừa chọn nguồn) trước content', () => {
    const nodes = [
      node('start', 'manual_trigger'),
      node('mail', 'send_email', { fromEmailId: 3, recipientSource: 'manual', recipientEmails: '', emailSteps: [] }),
    ];
    const target = pickFirstMissingTarget(orderedOf(nodes, [edge('start', 'mail')]), lookups, t);
    expect(target).toMatchObject({ role: 'audience', section: 'recipient' });
    expect(target.node.id).toBe('mail');
  });

  it('nguồn là khối đọc sheet chưa có link → mở khối sheet (mục basic), dù khối gửi cũng thiếu mẫu', () => {
    const nodes = [
      node('start', 'manual_trigger'),
      node('sheet', 'read_sheet', { sheetUrl: '' }),
      node('mail', 'send_email', { fromEmailId: 3, recipientSource: 'node', recipientNodeId: 'sheet', recipientField: 'email', emailSteps: [] }),
    ];
    const target = pickFirstMissingTarget(orderedOf(nodes, [edge('start', 'sheet'), edge('sheet', 'mail')]), lookups, t);
    expect(target.node.id).toBe('sheet');
    expect(target).toMatchObject({ role: 'audience', section: 'basic' });
  });

  it('audience đủ, chỉ thiếu nội dung → mở khối gửi ở mục templates', () => {
    const nodes = [
      node('start', 'manual_trigger'),
      node('mail', 'send_email', { fromEmailId: 3, recipientSource: 'manual', recipientEmails: 'a@x.vn', emailSteps: [] }),
    ];
    const target = pickFirstMissingTarget(orderedOf(nodes, [edge('start', 'mail')]), lookups, t);
    expect(target).toMatchObject({ role: 'content', section: 'templates' });
  });

  it('không thiếu gì → null; khối khởi chạy không bao giờ được chọn', () => {
    const nodes = [node('start', 'manual_trigger')];
    expect(pickFirstMissingTarget(orderedOf(nodes, []), {}, t)).toBeNull();
    expect(ROLE_PRIORITY.slice(0, 2)).toEqual(['audience', 'content']);
  });
});
