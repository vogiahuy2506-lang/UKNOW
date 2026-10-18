import { describe, expect, it } from 'vitest';
import { resolveSectionForRole, SECTION_BY_SUBTYPE_ROLE } from '../resolveEditSection';

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
