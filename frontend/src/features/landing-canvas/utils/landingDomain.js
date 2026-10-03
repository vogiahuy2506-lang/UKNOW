/**
 * Phân biệt tên miền HỆ THỐNG (miễn phí `<slug>.founderai.biz`) với tên miền RIÊNG của khách.
 *
 * Gốc lỗi: bảng `landing_page_domains` lưu CẢ hai loại, nên API quản trị trả `customDomainHostname`
 * = `<slug>.founderai.biz` cho trang dùng tên miền miễn phí (cột `cf_managed = true`). Modal Cài đặt
 * trang trước đây coi mọi hostname có giá trị là "tên miền riêng" → mở nhầm tab + hướng dẫn CNAME
 * `<slug>` → `founderai.biz.` vô nghĩa, và bấm "Lưu tên miền" còn đẩy `domainType:'custom'` lên (backend
 * gỡ subdomain miễn phí). Phân loại ở FRONTEND (không đổi API) để không ảnh hưởng các nơi khác đọc
 * `customDomainHostname` (danh sách landing, chia sẻ, marketplace) và vẫn đúng với nháp localStorage cũ.
 */

export const SYSTEM_BASE_DOMAIN = 'founderai.biz';

function normalizeHostname(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
}

/** `founderai.biz`, `www.founderai.biz` hoặc `<gì-đó>.founderai.biz` = tên miền của hệ thống. */
export function isSystemHostname(hostname) {
  const h = normalizeHostname(hostname);
  if (!h) return false;
  return h === SYSTEM_BASE_DOMAIN || h.endsWith(`.${SYSTEM_BASE_DOMAIN}`);
}

/**
 * Hostname tên miền RIÊNG của form (rỗng nếu trang dùng tên miền miễn phí / chưa có tên miền riêng).
 * @param {{ customDomainHostname?: string|null }|null|undefined} form
 * @returns {string}
 */
export function getCustomHostname(form) {
  const h = normalizeHostname(form?.customDomainHostname);
  if (!h || isSystemHostname(h)) return '';
  return h;
}
