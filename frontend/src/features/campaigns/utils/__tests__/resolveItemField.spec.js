import { describe, it, expect } from 'vitest';
import { resolveItemField, resolveColumnKey } from '../campaignBuilderRuntime.js';

/**
 * Regression (bug thật 25/08/2026): chiến dịch do trợ lý AI dựng đọc Google Sheet thành công
 * 3 dòng, nhưng node gửi email ra 0 người nhận và KHÔNG báo lỗi. Không thư nào được gửi.
 *
 * Gốc: AI luôn sinh `recipientField: "email"` (chữ thường, cố định ở
 * `aiCampaignDraft.service.js:522`), còn tiêu đề cột trong tệp của người dùng là `Email`.
 * Bộ chạy tra khoá thô `item['email']` → `undefined` → danh sách rỗng.
 */
describe('resolveItemField — tra cột không phân biệt hoa/thường', () => {
  it('lấy đúng giá trị khi tiêu đề cột viết hoa', () => {
    const row = { 'Họ Tên': 'minh', Email: 'minh@example.com' };

    expect(resolveItemField(row, 'email')).toBe('minh@example.com');
  });

  it('khớp chính xác được ưu tiên hơn khớp không phân biệt hoa/thường', () => {
    const row = { email: 'thuong@example.com', Email: 'hoa@example.com' };

    expect(resolveItemField(row, 'email')).toBe('thuong@example.com');
    expect(resolveItemField(row, 'Email')).toBe('hoa@example.com');
  });

  it('bỏ qua khoảng trắng thừa trong tiêu đề cột', () => {
    const row = { ' Email ': 'a@example.com' };

    expect(resolveItemField(row, 'email')).toBe('a@example.com');
  });

  it('không có cột nào khớp thì trả undefined', () => {
    expect(resolveItemField({ Phone: '0901234567' }, 'email')).toBeUndefined();
  });

  it('chịu được item rỗng / không phải object / tên cột rỗng', () => {
    expect(resolveItemField(null, 'email')).toBeUndefined();
    expect(resolveItemField(undefined, 'email')).toBeUndefined();
    expect(resolveItemField('chuỗi', 'email')).toBeUndefined();
    expect(resolveItemField({ Email: 'a@b.com' }, '')).toBeUndefined();
    expect(resolveItemField({ Email: 'a@b.com' }, '   ')).toBeUndefined();
  });

  it('giữ nguyên giá trị mảng để bên gọi tự trải ra', () => {
    const row = { Email: ['a@example.com', 'b@example.com'] };

    expect(resolveItemField(row, 'email')).toEqual(['a@example.com', 'b@example.com']);
  });

  describe('Tầng 3: khớp theo NGHĨA khi tên cột tiếng Việt khác từ khoá chuẩn', () => {
    it('lấy đúng số điện thoại khi cột là "SĐT" và field="phone"', () => {
      const row = { 'Họ Tên': 'Nguyễn Văn A', 'SĐT': '0901234567' };
      expect(resolveItemField(row, 'phone')).toBe('0901234567');
    });

    it('lấy đúng số điện thoại khi cột là "Số điện thoại"', () => {
      const row = { 'Số điện thoại': '0912345678' };
      expect(resolveItemField(row, 'phone')).toBe('0912345678');
    });

    it('lấy đúng email khi cột là "Thư điện tử"', () => {
      const row = { 'Thư điện tử': 'test@example.com' };
      expect(resolveItemField(row, 'email')).toBe('test@example.com');
    });

    it('lấy đúng họ tên khi cột là "Tên khách hàng" và field="name"', () => {
      const row = { 'Tên khách hàng': 'Trần Thị B' };
      expect(resolveItemField(row, 'name')).toBe('Trần Thị B');
    });

    it('ưu tiên cột "Email" hơn "Email phụ" khi cả hai cùng xuất hiện', () => {
      const row = { 'Email phụ': 'phu@example.com', 'Email': 'chinh@example.com' };
      expect(resolveItemField(row, 'email')).toBe('chinh@example.com');
    });
  });

  /**
   * Chốt lại lý do tồn tại của hàm này: `resolveColumnKey` KHÔNG thay thế được, vì nó coi chuỗi
   * toàn chữ cái là tên cột kiểu Excel. Ai đó "dọn dẹp" bằng cách gộp hai hàm sẽ làm hỏng lại
   * đúng bug này — test dưới đây nói rõ vì sao.
   */
  it('resolveColumnKey KHÔNG dùng được cho tên cột: "email" bị hiểu thành cột Excel', () => {
    const row = { 'Họ Tên': 'minh', Email: 'minh@example.com' };

    const wrongKey = resolveColumnKey(row, 'email');

    expect(wrongKey).toMatch(/^col_\d+$/);
    expect(row[wrongKey]).toBeUndefined();
  });
});

