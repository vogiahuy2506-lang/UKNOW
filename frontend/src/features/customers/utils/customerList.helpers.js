/** Số khách mỗi trang ở tab "Tất cả khách" (backend trần 100). */
export const CUSTOMER_PAGE_SIZE = 20;

/** Nguồn dữ liệu lọc được — khớp `customers.consent_source` và khoá `campaignCustomers.consentSources.*`. */
export const CONSENT_SOURCE_OPTIONS = Object.freeze([
  'manual', 'import', 'landing_lead', 'webhook', 'zalo', 'form_submission',
]);

/** Trạng thái nhận email lọc được — khớp tham số `emailStatus` của `GET /api/customers`. */
export const EMAIL_STATUS_OPTIONS = Object.freeze(['subscribed', 'unsubscribed', 'bounced']);

/**
 * Tham số bộ lọc dùng CHUNG cho danh sách và xuất CSV, để file xuất luôn khớp cái đang nhìn thấy.
 * Giá trị rỗng bị bỏ (không gửi `search=`).
 *
 * @param {{ search?: string, consentSource?: string, emailStatus?: string }} filters
 * @returns {Record<string, string>}
 */
export function buildCustomerFilterParams({ search = '', consentSource = '', emailStatus = '' } = {}) {
  const params = {};
  const trimmedSearch = String(search || '').trim();
  if (trimmedSearch) params.search = trimmedSearch;
  if (consentSource) params.consentSource = consentSource;
  if (emailStatus) params.emailStatus = emailStatus;
  return params;
}

/** Lấy tên file từ header `Content-Disposition`, không có thì dùng `fallback`. */
export function filenameFromDisposition(disposition, fallback = 'khach-hang.csv') {
  const match = /filename="?([^";\n]+)"?/i.exec(String(disposition || ''));
  return match?.[1]?.trim() || fallback;
}

/** Tải một Blob về máy qua thẻ <a> tạm. */
export function saveBlobAsFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Cờ tên cho avatar chữ cái: chữ đầu của tên (hoặc email/SĐT), '?' nếu không có gì. */
export function getCustomerInitial(customer) {
  const name = customer?.fullName || customer?.email || customer?.phone || '';
  return name ? String(name).trim()[0]?.toUpperCase() || '?' : '?';
}
