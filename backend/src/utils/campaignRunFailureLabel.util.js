/**
 * PR-3 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) — dịch message lỗi kỹ thuật của một lượt chạy
 * chiến dịch hỏng sang câu tiếng Việt cho chủ chiến dịch đọc được, kèm một câu "cần làm gì".
 * Danh sách bên dưới lấy từ các lỗi thật đã xảy ra trên production trong 90 ngày (xem plan mục 1.4).
 * PR-8 (UI nói thật) dùng lại hàm này.
 */

const NETWORK_ERROR_REGEX = /econn|etimedout|enotfound|fetch failed|network/i;

// PR-4 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) Việc 1 — scheduler.js ghi message dạng
// "Lịch tự tắt sau N lần lỗi liên tiếp: <error_message của lượt failed mới nhất>" khi tự tắt lịch.
// Bắt tiền tố này TRƯỚC mọi nhánh khác, nếu không message rơi vào nhánh con của phần sau dấu ':'
// (vd "chưa ở trạng thái hoạt động") và email không nói rõ lịch đã tự tắt.
const AUTO_DISABLED_PREFIX_REGEX = /^lịch tự tắt sau (\d+) lần lỗi liên tiếp:\s*([\s\S]*)$/i;

/**
 * @param {string} message message gốc (thường là error.message của lỗi làm run fail)
 * @returns {{ message: string, actionHint: string }}
 */
export function labelCampaignRunFailure(message) {
  const raw = String(message || '').trim();
  const msg = raw.toLowerCase();

  if (!msg) {
    return {
      message: 'Lỗi hệ thống khi chạy chiến dịch (không rõ nguyên nhân).',
      actionHint: 'Thử chạy lại chiến dịch; nếu vẫn lỗi, liên hệ hỗ trợ kỹ thuật.',
    };
  }

  const autoDisabledMatch = raw.match(AUTO_DISABLED_PREFIX_REGEX);
  if (autoDisabledMatch) {
    const [, count, innerRaw] = autoDisabledMatch;
    const inner = labelCampaignRunFailure(innerRaw);
    return {
      message: `Lịch chạy đã tự tắt sau ${count} lần lỗi liên tiếp. Lỗi gần nhất: ${inner.message}`,
      actionHint: 'Sửa lỗi trên rồi bật lại lịch trong trang chiến dịch.',
    };
  }

  if (msg.includes('chiến dịch không có node nào')) {
    return {
      message: 'Chiến dịch chưa có bước gửi nào (luồng chưa cấu hình node nào).',
      actionHint: 'Vào chỉnh sửa chiến dịch, thêm ít nhất một bước gửi (email hoặc Zalo) rồi chạy lại.',
    };
  }

  if (msg.includes('tài khoản zalo đã chọn chưa ở trạng thái sẵn sàng')) {
    return {
      message: 'Tài khoản Zalo dùng để gửi chưa sẵn sàng (có thể đang mất kết nối).',
      actionHint: 'Vào Cài đặt Zalo, kết nối lại tài khoản rồi chạy lại chiến dịch.',
    };
  }

  if (msg.includes('không tìm thấy tài khoản zalo đã chọn')) {
    return {
      message: 'Không tìm thấy tài khoản Zalo đã chọn cho chiến dịch (có thể đã bị xoá).',
      actionHint: 'Vào chỉnh sửa chiến dịch, chọn lại tài khoản Zalo dùng để gửi.',
    };
  }

  if (msg.includes('chỉ có thể chạy chiến dịch đang hoạt động')) {
    return {
      message: 'Chiến dịch chưa ở trạng thái hoạt động nên không thể chạy.',
      actionHint: 'Vào chiến dịch, bật trạng thái hoạt động rồi thử chạy lại.',
    };
  }

  if (msg.includes('535') || msg.includes('invalid login')) {
    return {
      message: 'Lỗi xác thực tài khoản email dùng để gửi (SMTP).',
      actionHint: 'Kiểm tra lại thông tin đăng nhập email gửi trong Cài đặt kênh email.',
    };
  }

  if (msg.includes('phiên đăng nhập zalo') && msg.includes('không còn hiệu lực')) {
    return {
      message: 'Phiên đăng nhập của tài khoản Zalo dùng để gửi đã hết hiệu lực.',
      actionHint: 'Vào Cài đặt Zalo, đăng nhập lại tài khoản rồi chạy lại chiến dịch.',
    };
  }

  if (msg.includes('thiếu nội dung tin nhắn zalo')) {
    return {
      message: 'Thiếu nội dung tin nhắn Zalo trong cấu hình chiến dịch.',
      actionHint: 'Vào chỉnh sửa chiến dịch, bổ sung nội dung tin nhắn (hoặc mẫu) Zalo cho bước gửi.',
    };
  }

  if (msg.includes('value too long')) {
    return {
      message: 'Một trường dữ liệu vượt quá độ dài cho phép khi lưu.',
      actionHint: 'Rút ngắn nội dung hoặc tên trường liên quan rồi chạy lại; báo kỹ thuật nếu vẫn lỗi.',
    };
  }

  if (NETWORK_ERROR_REGEX.test(msg)) {
    return {
      message: 'Lỗi kết nối mạng khi hệ thống đang xử lý chiến dịch.',
      actionHint: 'Thường chỉ là sự cố tạm thời — thử chạy lại chiến dịch.',
    };
  }

  return {
    message: `Lỗi hệ thống khi chạy chiến dịch (${raw}).`,
    actionHint: 'Thử chạy lại chiến dịch; nếu vẫn lỗi, liên hệ hỗ trợ kỹ thuật kèm nội dung lỗi này.',
  };
}
