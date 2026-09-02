import { describe, it, expect } from '@jest/globals';
import { getNodeSubtype } from '../nodeSubtype.util.js';

describe('getNodeSubtype util', () => {
  it('đọc đúng từ khoá nodeSubtype (camelCase)', () => {
    expect(getNodeSubtype({ nodeSubtype: 'send_email' })).toBe('send_email');
    expect(getNodeSubtype({ nodeSubtype: 'send_zalo_personal' })).toBe('send_zalo_personal');
  });

  it('đọc đúng từ khoá node_subtype (snake_case từ DB)', () => {
    expect(getNodeSubtype({ node_subtype: 'send_email' })).toBe('send_email');
    expect(getNodeSubtype({ node_subtype: 'send_zalo_personal' })).toBe('send_zalo_personal');
  });

  it('đọc đúng từ khoá subtype', () => {
    expect(getNodeSubtype({ subtype: 'send_zalo_group' })).toBe('send_zalo_group');
    expect(getNodeSubtype({ subtype: 'manual' })).toBe('manual');
  });

  it('chuẩn hoá chữ HOA và khoảng trắng thừa (trim + toLowerCase)', () => {
    expect(getNodeSubtype({ nodeSubtype: '  SEND_EMAIL  ' })).toBe('send_email');
    expect(getNodeSubtype({ node_subtype: ' Send_Zalo_Personal ' })).toBe('send_zalo_personal');
    expect(getNodeSubtype({ subtype: '  SUBTYPE_TEST ' })).toBe('subtype_test');
  });

  it('ưu tiên nodeSubtype > node_subtype > subtype khi có nhiều khoá', () => {
    expect(getNodeSubtype({ nodeSubtype: 'first', node_subtype: 'second', subtype: 'third' })).toBe('first');
    expect(getNodeSubtype({ node_subtype: 'second', subtype: 'third' })).toBe('second');
  });

  it('TUYỆT ĐỐI KHÔNG nhận nhầm phân loại cấp 1 (type, nodeType, node_type)', () => {
    // Node chỉ có type: 'send_email' không được coi là có subtype
    expect(getNodeSubtype({ type: 'send_email' })).toBe('');
    expect(getNodeSubtype({ nodeType: 'action' })).toBe('');
    expect(getNodeSubtype({ node_type: 'action' })).toBe('');
    expect(getNodeSubtype({ nodeType: 'action', type: 'send_email' })).toBe('');
    expect(getNodeSubtype({ node_type: 'trigger', type: 'manual' })).toBe('');
  });

  it('trả về chuỗi rỗng an toàn cho null, undefined, object rỗng hoặc giá trị không hợp lệ', () => {
    expect(getNodeSubtype(null)).toBe('');
    expect(getNodeSubtype(undefined)).toBe('');
    expect(getNodeSubtype({})).toBe('');
    expect(getNodeSubtype({ config: {} })).toBe('');
    expect(getNodeSubtype('not_an_object')).toBe('');
    expect(getNodeSubtype(123)).toBe('');
  });
});
