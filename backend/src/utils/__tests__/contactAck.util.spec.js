import { describe, it, expect } from '@jest/globals';
import { buildContactAck } from '../contactAck.util.js';

describe('contactAck.util — buildContactAck', () => {
  it('danh sách liên hệ rỗng → trả về null', () => {
    expect(buildContactAck([])).toBeNull();
    expect(buildContactAck(null)).toBeNull();
  });

  it('1 SĐT → note chứa SĐT và footer đúng định dạng', () => {
    const contacts = [{ type: 'phone', value: '0844790999' }];
    const res = buildContactAck(contacts);

    expect(res).not.toBeNull();
    expect(res.note).toContain('0844790999');
    expect(res.note).toContain('LƯU Ý HỆ THỐNG: Khách vừa để lại liên hệ: 0844790999');
    expect(res.note).toContain('TUYỆT ĐỐI không nói rằng bạn không thể gọi/nhắn');
    expect(res.footer).toBe('Đã ghi nhận số điện thoại 0844790999. Chủ doanh nghiệp sẽ liên hệ lại với bạn sớm.');
    expect(res.footer).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u); // Không emoji
  });

  it('1 email → note chứa email và footer đúng định dạng', () => {
    const contacts = [{ type: 'email', value: 'khach@example.com' }];
    const res = buildContactAck(contacts);

    expect(res).not.toBeNull();
    expect(res.note).toContain('khach@example.com');
    expect(res.footer).toBe('Đã ghi nhận email khach@example.com. Chủ doanh nghiệp sẽ liên hệ lại với bạn sớm.');
  });

  it('SĐT + email → note và footer chứa cả hai thông tin', () => {
    const contacts = [
      { type: 'phone', value: '0844790999' },
      { type: 'email', value: 'khach@example.com' },
    ];
    const res = buildContactAck(contacts);

    expect(res).not.toBeNull();
    expect(res.note).toContain('0844790999, khach@example.com');
    expect(res.footer).toBe('Đã ghi nhận số điện thoại 0844790999 và email khach@example.com. Chủ doanh nghiệp sẽ liên hệ lại với bạn sớm.');
  });

  it('loại liên hệ trùng số điện thoại hoặc email của chính chủ shop', () => {
    const ownerContact = {
      phone: '0901234567',
      email: 'owner@uknow.vn',
    };

    // Khách nhắn trùng số chủ shop
    const contactsOnlyOwner = [
      { type: 'phone', value: '0901234567' },
      { type: 'email', value: 'owner@uknow.vn' },
    ];
    expect(buildContactAck(contactsOnlyOwner, ownerContact)).toBeNull();

    // Khách nhắn cả số chủ shop và số mới
    const contactsMixed = [
      { type: 'phone', value: '0901234567' }, // số chủ shop -> loại
      { type: 'phone', value: '0844790999' }, // số khách -> giữ
    ];
    const res = buildContactAck(contactsMixed, ownerContact);
    expect(res).not.toBeNull();
    expect(res.note).toContain('0844790999');
    expect(res.note).not.toContain('0901234567');
    expect(res.footer).toBe('Đã ghi nhận số điện thoại 0844790999. Chủ doanh nghiệp sẽ liên hệ lại với bạn sớm.');
  });
});
