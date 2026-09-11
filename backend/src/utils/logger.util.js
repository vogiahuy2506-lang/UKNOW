/**
 * Logger tối giản — hiện chỉ có `logError`, dùng cho các service không muốn gọi
 * console.error() rải rác. Không phải logging framework mới; nếu cần thêm cấp độ
 * (info/warn/debug) hay đích ghi khác console, mở rộng ở đây thay vì tạo file khác.
 */
export function logError(message, meta) {
  if (meta !== undefined) {
    console.error(message, meta);
  } else {
    console.error(message);
  }
}
