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

export const formatDateOnly = (value) => {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleDateString('vi-VN');
};

/**
 * Format thời gian hiển thị trên màn hình khách hàng theo chuẩn UTC.
 *
 * Luồng hoạt động:
 * 1. Kiểm tra dữ liệu đầu vào có hợp lệ hay không.
 * 2. Parse sang Date và chặn giá trị không hợp lệ.
 * 3. Format theo `vi-VN` nhưng cố định `UTC` để tránh bị cộng thêm lệch +7 giờ.
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
      timeZone: 'UTC',
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
