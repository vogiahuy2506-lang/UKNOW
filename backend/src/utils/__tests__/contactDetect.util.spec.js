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

  // 14/09/2026: khách gõ "liên hệ tôi qua số 844790999" (mất số 0), bot hiểu nhưng máy quét bỏ qua.
  describe('số 9 chữ số mất số 0 đầu — chỉ nhận khi có ngữ cảnh liên hệ quanh đó', () => {
    it('có từ liên hệ đứng trước → nhận và phục hồi số 0', () => {
      expect(extractContacts('liên hệ trực tiếp tôi qua số 844790999')).toEqual([
        { type: 'phone', value: '0844790999', raw: '844790999' },
      ]);
      expect(extractContacts('gọi 912 345 678 nhé')).toEqual([
        { type: 'phone', value: '0912345678', raw: '912 345 678' },
      ]);
      expect(extractContacts('sdt: 987.654.321')).toEqual([
        { type: 'phone', value: '0987654321', raw: '987.654.321' },
      ]);
    });

    it('từ liên hệ đứng sau cũng tính', () => {
      expect(extractContacts('912345678 là zalo của mình')).toEqual([
        { type: 'phone', value: '0912345678', raw: '912345678' },
      ]);
    });

    it('không có ngữ cảnh liên hệ → bỏ qua (mã đơn, mã khách)', () => {
      expect(extractContacts('Mã đơn hàng 912345678')).toEqual([]);
      expect(extractContacts('Mã khách 987654321 đã thanh toán')).toEqual([]);
    });

    it('có ngữ cảnh nhưng không đúng dạng di động → bỏ qua', () => {
      // đầu số 2 không phải di động
      expect(extractContacts('gọi số 212345678')).toEqual([]);
      // dãy dài hơn 9 chữ số
      expect(extractContacts('số 123456789012')).toEqual([]);
      // ngữ cảnh nằm ngoài cửa sổ 24 ký tự trước
      expect(extractContacts('liên hệ ......................................... 912345678')).toEqual([]);
    });

    it('không trùng với tầng có tiền tố: cùng số viết hai kiểu chỉ ra một phần tử', () => {
      expect(extractContacts('số 0912345678 hoặc 912345678')).toEqual([
        { type: 'phone', value: '0912345678', raw: '0912345678' },
      ]);
    });
  });

  it('xử lý an toàn khi tin nhắn rỗng hoặc không có chuỗi string', () => {
    expect(extractContacts('')).toEqual([]);
    expect(extractContacts('   ')).toEqual([]);
    expect(extractContacts(null)).toEqual([]);
    expect(extractContacts(undefined)).toEqual([]);
  });

  describe('PR-4 — Siết đầu số di động thật (loại trừ hash ảnh, MST, đầu số không tồn tại)', () => {
    it('nhận số trên danh thiếp thật (0326886627)', () => {
      expect(extractContacts('0326886627')).toEqual([
        { type: 'phone', value: '0326886627', raw: '0326886627' },
      ]);
    });

    it('nhận ca cơ bản có khoảng trắng (Chị gọi em nhé 0912 345 678)', () => {
      expect(extractContacts('Chị gọi em nhé 0912 345 678')).toEqual([
        { type: 'phone', value: '0912345678', raw: '0912 345 678' },
      ]);
    });

    it('không nhận hash ảnh có chứa chuỗi dạng 080... (080 không phải đầu số)', () => {
      expect(extractContacts('photo-stal-31.zdn.vn/no/jpg/0ebb982ddc0800565919/2aOboQ')).toEqual([]);
    });

    it('không nhận mã số thuế doanh nghiệp dạng 031... (031 không phải đầu số di động)', () => {
      expect(extractContacts('DIGISO (MST) 0318700853')).toEqual([]);
      expect(extractContacts('CÔNG TY … TÂY NAM Á, MST 0319390322')).toEqual([]);
    });

    it('tầng B cũ: nhận và phục hồi số 0 cho số 9 chữ số hợp lệ (liên hệ tôi qua số 844790999)', () => {
      expect(extractContacts('liên hệ tôi qua số 844790999')).toEqual([
        { type: 'phone', value: '0844790999', raw: '844790999' },
      ]);
    });

    it('khách hỏi xin số của shop (Cho em xin sdt của shop với) -> không nhận', () => {
      expect(extractContacts('Cho em xin sdt của shop với')).toEqual([]);
    });
  });
});
