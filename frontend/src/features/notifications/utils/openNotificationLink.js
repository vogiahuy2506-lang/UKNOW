import { getSafeLinkUrl } from '../../../utils/safeUrl.util';

/**
 * Mở link của một thông báo. Backend đã lọc (chỉ `/đường-dẫn-nội-bộ` hoặc http/https), nhưng FE KHÔNG tin dữ liệu:
 *  - `/app/...` → điều hướng trong app (từ chối `//host` và `/\host` là URL giao thức-tương-đối trá hình);
 *  - http/https tuyệt đối → tab mới, `noopener`;
 *  - mọi thứ khác (`javascript:`, `data:`, rỗng) → bỏ qua.
 *
 * @param {unknown} link
 * @param {(to: string) => void} navigate
 * @returns {boolean} true nếu đã mở được
 */
export function openNotificationLink(link, navigate) {
  if (typeof link !== 'string') return false;
  const value = link.trim();
  if (!value) return false;

  if (value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) {
    navigate(value);
    return true;
  }

  const safe = getSafeLinkUrl(value);
  if (safe && /^https?:/i.test(safe)) {
    window.open(safe, '_blank', 'noopener,noreferrer');
    return true;
  }
  return false;
}
