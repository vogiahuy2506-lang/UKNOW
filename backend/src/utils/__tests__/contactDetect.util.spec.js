import { describe, it, expect } from '@jest/globals';
import { extractContacts } from '../contactDetect.util.js';

describe('contactDetect.util — extractContacts', () => {
  it('nhận diện chính xác các định dạng số điện thoại di động Việt Nam có tiền tố', () => {
    // 0912345678 (viết liền)
    const res1 = extractContacts('Khách nhắn: 0912345678 gọi lại nhé');
    expect(res1).toEqual([
      { type: 'phone', value: '0912345678', raw: '0912345678' },
    ]);

    // 0912 345 678 (khoảng trắng)
    const res2 = extractContacts('Số của em 0912 345 678 ạ');
    expect(res2).toEqual([
      { type: 'phone', value: '0912345678', raw: '0912 345 678' },
    ]);

    // 0912.345.678 (dấu chấm)
    const res3 = extractContacts('Alo 0912.345.678');
    expect(res3).toEqual([
      { type: 'phone', value: '0912345678', raw: '0912.345.678' },
    ]);

    // +84 912-345-678 (+84 và gạch nối)
    const res4 = extractContacts('Liên hệ +84 912-345-678 giúp');
    expect(res4).toEqual([
      { type: 'phone', value: '0912345678', raw: '+84 912-345-678' },
    ]);

    // 84912345678 (tiền tố 84)
    const res5 = extractContacts('Gọi số 84912345678');
    expect(res5).toEqual([
      { type: 'phone', value: '0912345678', raw: '84912345678' },
    ]);

    // sđt: (0912) 345 678 (dấu ngoặc đơn)
    const res6 = extractContacts('sđt: (0912) 345 678');
    expect(res6).toEqual([
      { type: 'phone', value: '0912345678', raw: '(0912) 345 678' },
    ]);
  });

  it('nhận diện chính xác địa chỉ email trong văn bản tự do', () => {
    const res = extractContacts('Gửi báo giá qua email a.b+tag@x.vn nhé');
    expect(res).toEqual([
      { type: 'email', value: 'a.b+tag@x.vn', raw: 'a.b+tag@x.vn' },
    ]);
  });

  it('không nhận diện sai các chuỗi số không phải SĐT di động', () => {
    // 912345678 (thiếu tiền tố 0 / 84 / +84)
    expect(extractContacts('Mã đơn hàng 912345678')).toEqual([]);

    // 1.900.000đ (tiền tệ)
    expect(extractContacts('Giá sản phẩm là 1.900.000đ')).toEqual([]);

    // 2026 (năm)
    expect(extractContacts('Năm nay là 2026')).toEqual([]);

    // 123456789012 (dãy số dài)
    expect(extractContacts('Số CCCD 123456789012')).toEqual([]);

    // 02838221234 (số bàn cố định TP.HCM)
    expect(extractContacts('Gọi tổng đài bàn 02838221234')).toEqual([]);
  });

  it('loại trừ trùng lặp: cùng một số/email lặp lại trong tin nhắn chỉ trả về 1 phần tử', () => {
    const res = extractContacts('Nhắc lại: 0912345678 hoặc gọi 0912 345 678 nhé, email test@domain.com hay TEST@DOMAIN.COM cũng được');
    expect(res).toHaveLength(2);
    expect(res[0]).toEqual({ type: 'phone', value: '0912345678', raw: '0912345678' });
    expect(res[1]).toEqual({ type: 'email', value: 'test@domain.com', raw: 'test@domain.com' });
  });

  it('trích xuất được nhiều liên hệ khác nhau trong cùng một tin nhắn', () => {
    const res = extractContacts('Liên hệ sếp 0987654321 hoặc nhân viên 0912345678, email ceo@uknow.vn');
    expect(res).toHaveLength(3);
    expect(res).toEqual([
      { type: 'phone', value: '0987654321', raw: '0987654321' },
      { type: 'phone', value: '0912345678', raw: '0912345678' },
      { type: 'email', value: 'ceo@uknow.vn', raw: 'ceo@uknow.vn' },
    ]);
  });

  it('xử lý an toàn khi tin nhắn rỗng hoặc không có chuỗi string', () => {
    expect(extractContacts('')).toEqual([]);
    expect(extractContacts('   ')).toEqual([]);
    expect(extractContacts(null)).toEqual([]);
    expect(extractContacts(undefined)).toEqual([]);
  });
});
