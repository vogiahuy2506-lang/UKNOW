/**
 * Resolve display name from customer-like object.
 *
 * @param {Object} customer customer payload
 * @returns {string}
 */
export const getCustomerDisplayName = (customer) => {
  if (!customer) return '';
  return (
    customer.fullName ||
    `${customer.firstName || ''} ${customer.lastName || ''}`.trim() ||
    customer.email ||
    customer.phone ||
    ''
  );
};

/** Múi giờ hiển thị cố định cho người dùng Việt Nam (UTC+7, không DST). */
const DISPLAY_TZ = 'Asia/Ho_Chi_Minh';

/**
 * Chỉ lấy phần ngày (dd/mm/yyyy) theo giờ Việt Nam.
 *
 * Luồng hoạt động:
 * 1. Parse instant từ API (thường là ISO UTC hoặc timestamptz).
 * 2. Format theo lịch ngày tại Asia/Ho_Chi_Minh để "Ngày đặt" khớp giờ địa phương.
 *
 * @param {string|number|Date|null|undefined} value Thời điểm đầu vào.
 * @returns {string} Ngày hiển thị hoặc `--`.
 */
export const formatDateOnly = (value) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('vi-VN', {
    timeZone: DISPLAY_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

/**
 * Format ngày giờ hiển thị cho màn khách hàng / đơn hàng theo giờ Việt Nam.
 *
 * Luồng hoạt động:
 * 1. Kiểm tra và parse chuỗi hoặc timestamp từ backend.
 * 2. Hiển thị bằng `toLocaleString` với `timeZone: Asia/Ho_Chi_Minh` để đồng nhất,
 *    không phụ thuộc múi giờ trình duyệt của máy người xem.
 *
 * @param {string|number|Date|null|undefined} value Giá trị thời gian đầu vào.
 * @returns {string} Chuỗi thời gian hiển thị hoặc `--` nếu không hợp lệ.
 */
export const formatDateTime = (value) => {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '--'
    : date.toLocaleString('vi-VN', {
      hour12: false,
      timeZone: DISPLAY_TZ,
    });
};

export const formatMoney = (value, currency = 'VND') => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '--';
  if (currency === 'VND') {
    return `${amount.toLocaleString('vi-VN')} ₫`;
  }
  return `${amount.toLocaleString('vi-VN')} ${currency}`;
};

export const decodeHtmlEntities = (value) => {
  const raw = String(value || '');
  if (!raw || typeof document === 'undefined') return raw;
  const el = document.createElement('textarea');
  el.innerHTML = raw;
  return el.value;
};
