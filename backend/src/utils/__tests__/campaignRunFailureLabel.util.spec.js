import { describe, it, expect } from '@jest/globals';
import { labelCampaignRunFailure } from '../campaignRunFailureLabel.util.js';

describe('campaignRunFailureLabel.util — labelCampaignRunFailure', () => {
  // PR-4 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) Việc 1 — nhánh "lịch tự tắt sau" phải đứng
  // TRƯỚC mọi nhánh khác, nếu không message rơi vào nhánh con của phần sau dấu ':'.
  it('Lịch tự tắt sau N lần lỗi liên tiếp: message chứa "tự tắt" và nhãn của lỗi gần nhất', () => {
    const { message, actionHint } = labelCampaignRunFailure(
      'Lịch tự tắt sau 3 lần lỗi liên tiếp: Chỉ có thể chạy chiến dịch đang hoạt động'
    );
    expect(message).toContain('tự tắt');
    expect(message).toBe(
      'Lịch chạy đã tự tắt sau 3 lần lỗi liên tiếp. Lỗi gần nhất: Chiến dịch chưa ở trạng thái hoạt động nên không thể chạy.'
    );
    expect(actionHint).toBe('Sửa lỗi trên rồi bật lại lịch trong trang chiến dịch.');
  });

  it('Lịch tự tắt với lỗi gần nhất là message lạ → vẫn bọc được, không rơi vào nhánh con sai', () => {
    const { message } = labelCampaignRunFailure(
      'Lịch tự tắt sau 5 lần lỗi liên tiếp: Một lỗi hoàn toàn mới chưa từng thấy XYZ'
    );
    expect(message).toBe(
      'Lịch chạy đã tự tắt sau 5 lần lỗi liên tiếp. Lỗi gần nhất: Lỗi hệ thống khi chạy chiến dịch (Một lỗi hoàn toàn mới chưa từng thấy XYZ).'
    );
  });

  it('Chiến dịch không có node nào', () => {
    const { message, actionHint } = labelCampaignRunFailure('Chiến dịch không có node nào');
    expect(message).toBe('Chiến dịch chưa có bước gửi nào (luồng chưa cấu hình node nào).');
    expect(actionHint).toBeTruthy();
  });

  it('Tài khoản Zalo đã chọn chưa ở trạng thái sẵn sàng', () => {
    const { message } = labelCampaignRunFailure('Tài khoản Zalo đã chọn chưa ở trạng thái sẵn sàng');
    expect(message).toBe('Tài khoản Zalo dùng để gửi chưa sẵn sàng (có thể đang mất kết nối).');
  });

  it('Không tìm thấy tài khoản Zalo đã chọn', () => {
    const { message } = labelCampaignRunFailure('Không tìm thấy tài khoản Zalo đã chọn');
    expect(message).toBe('Không tìm thấy tài khoản Zalo đã chọn cho chiến dịch (có thể đã bị xoá).');
  });

  it('Chỉ có thể chạy chiến dịch đang hoạt động', () => {
    const { message } = labelCampaignRunFailure('Chỉ có thể chạy chiến dịch đang hoạt động');
    expect(message).toBe('Chiến dịch chưa ở trạng thái hoạt động nên không thể chạy.');
  });

  it('SMTP 535 / Invalid login', () => {
    const { message } = labelCampaignRunFailure('Invalid login: 535 5.7.8 Username and Password not accepted');
    expect(message).toBe('Lỗi xác thực tài khoản email dùng để gửi (SMTP).');
  });

  it('Phiên đăng nhập Zalo không còn hiệu lực', () => {
    const { message } = labelCampaignRunFailure(
      'Phiên đăng nhập Zalo của tài khoản đã chọn không còn hiệu lực. Vui lòng đăng nhập lại trong Cài đặt Zalo.'
    );
    expect(message).toBe('Phiên đăng nhập của tài khoản Zalo dùng để gửi đã hết hiệu lực.');
  });

  it('Thiếu nội dung tin nhắn Zalo', () => {
    const { message } = labelCampaignRunFailure('Thiếu nội dung tin nhắn Zalo');
    expect(message).toBe('Thiếu nội dung tin nhắn Zalo trong cấu hình chiến dịch.');
  });

  it('value too long (lỗi Postgres nguyên văn)', () => {
    const { message } = labelCampaignRunFailure('value too long for type character varying(255)');
    expect(message).toBe('Một trường dữ liệu vượt quá độ dài cho phép khi lưu.');
  });

  it('lỗi mạng khi khởi tạo', () => {
    const { message } = labelCampaignRunFailure('Lỗi kết nối mạng trong lúc khởi tạo danh sách người nhận: ECONNRESET');
    expect(message).toBe('Lỗi kết nối mạng khi hệ thống đang xử lý chiến dịch.');
  });

  it.each([
    'Gói đã hết hạn (đã qua thời gian ân hạn). Vui lòng gia hạn để tiếp tục gửi.',
    'Tài khoản chưa có gói dịch vụ. Vui lòng đăng ký gói để tiếp tục gửi.',
    'Vượt giới hạn gửi của gói dịch vụ.',
    'Tính năng gửi tin nhắn không được hỗ trợ trong gói dịch vụ hiện tại. Vui lòng liên hệ admin để nâng gói.',
  ])('hạn mức/gói "%s" → KHÔNG phải "Lỗi hệ thống"', (raw) => {
    const { message, actionHint } = labelCampaignRunFailure(raw);
    expect(message).toBe('Gói dịch vụ không còn cho phép gửi (hết hạn, chưa có gói hoặc đã dùng hết hạn mức).');
    expect(actionHint).toContain('Gói & thanh toán');
  });

  it('lượt bị đóng sổ vì bỏ rơi khi khởi động lại (câu không dấu trên production)', () => {
    const { message } = labelCampaignRunFailure(
      'Luot chay bi bo roi (tien trinh khoi dong lai), khong co hoat dong > 24 gio — dong so thu cong'
    );
    expect(message).toBe('Lượt chạy bị gián đoạn khi hệ thống khởi động lại và đã được đóng.');
  });

  it.each([
    ['Tài khoản Telegram đã mất phiên đăng nhập hoặc mất kết nối. Chiến dịch đã được tạm dừng, vui lòng đăng nhập lại tài khoản rồi kích hoạt lại chiến dịch.', 'Telegram'],
    ['Tài khoản WhatsApp đã mất phiên đăng nhập hoặc mất kết nối. Chiến dịch đã được tạm dừng, vui lòng đăng nhập lại tài khoản rồi kích hoạt lại chiến dịch.', 'WhatsApp'],
  ])('P2 — kênh adapter mất phiên (%#) → nêu đúng kênh, không phải "Lỗi hệ thống"', (raw, channelName) => {
    const { message, actionHint } = labelCampaignRunFailure(raw);
    expect(message).toContain(channelName);
    expect(message).not.toContain('Lỗi hệ thống');
    expect(actionHint).toContain(channelName);
  });

  it('message lạ (không khớp mục nào) → câu mặc định có message gốc', () => {
    const { message, actionHint } = labelCampaignRunFailure('Một lỗi hoàn toàn mới chưa từng thấy XYZ');
    expect(message).toBe('Lỗi hệ thống khi chạy chiến dịch (Một lỗi hoàn toàn mới chưa từng thấy XYZ).');
    expect(actionHint).toBeTruthy();
  });

  it('message rỗng/null → câu mặc định không rõ nguyên nhân', () => {
    expect(labelCampaignRunFailure('').message).toBe('Lỗi hệ thống khi chạy chiến dịch (không rõ nguyên nhân).');
    expect(labelCampaignRunFailure(null).message).toBe('Lỗi hệ thống khi chạy chiến dịch (không rõ nguyên nhân).');
    expect(labelCampaignRunFailure(undefined).message).toBe('Lỗi hệ thống khi chạy chiến dịch (không rõ nguyên nhân).');
  });
});
