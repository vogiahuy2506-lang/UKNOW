/**
 * Khoá chống trùng cho các node dữ liệu trong campaign chạy liên tục (continuous mode).
 *
 * Tách ra khỏi closure trong `campaignRun.service.js` (`_doExecuteCampaign`) để có thể unit test
 * trực tiếp — bản gốc định nghĩa `buildContinuousDataNodeItemKey` làm hàm cục bộ bên trong một
 * phương thức rất dài, không export, nên không có cách nào gọi/kiểm nó từ bên ngoài
 * (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-6a — yêu cầu "khoá nằm trong closure, nếu
 * không test được thì tách thành hàm export có test").
 *
 * Hàm thuần — không phụ thuộc DB/state của run, an toàn để tách.
 */

/**
 * Chuẩn hoá object để so sánh ổn định (sort key trước khi stringify).
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function canonicalizeComparableValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeComparableValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalizeComparableValue(value[key]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * Chuỗi hoá một item để so sánh/fallback khi không có khoá nghiệp vụ ổn định.
 *
 * @param {unknown} item
 * @returns {string}
 */
export function stringifyComparableItem(item) {
  if (item == null) return '';
  if (typeof item !== 'object') return String(item);
  try {
    return JSON.stringify(canonicalizeComparableValue(item));
  } catch {
    return String(item);
  }
}

/**
 * Tạo khóa dedupe cho các node dữ liệu trong continuous mode.
 *
 * Luồng hoạt động:
 * 1. Ưu tiên khóa nghiệp vụ ổn định theo từng node (customerId/uid/courseId/submissionId...).
 * 2. Fallback về fingerprint object để tránh mất bản ghi khi thiếu khóa chính.
 *
 * @param {string} nodeSubtype subtype node hiện tại
 * @param {Record<string, any>} item bản ghi dữ liệu
 * @returns {string}
 */
export function buildContinuousDataNodeItemKey(nodeSubtype, item = {}) {
  const subtype = String(nodeSubtype || '').trim().toLowerCase();
  const row = item && typeof item === 'object' ? item : {};
  if (subtype === 'read_courses_db') {
    const courseId = row.id ?? row.courseId ?? row.course_code ?? row.courseCode;
    if (courseId != null && String(courseId).trim()) return `course:${String(courseId).trim()}`;
  }
  if (subtype === 'read_products_db') {
    const productId = row.id ?? row.productId ?? row.product_code ?? row.productCode;
    if (productId != null && String(productId).trim()) return `product:${String(productId).trim()}`;
  }
  if (subtype === 'get_all_friends') {
    const uid = row.uid ?? row.zalo_id ?? row.zaloId ?? row.id;
    if (uid != null && String(uid).trim()) return `friend_uid:${String(uid).trim()}`;
    const phone = row.phone ?? row.phoneNumber ?? row.zaloPhone;
    if (phone != null && String(phone).trim()) return `friend_phone:${String(phone).trim()}`;
  }
  if (subtype === 'read_interested_customers' || subtype === 'interested_customers') {
    const customerId = row.id_customer ?? row.customer_id ?? row.customerId ?? row.id;
    if (customerId != null && String(customerId).trim()) return `customer:${String(customerId).trim()}`;
    const email = String(row.email || '').trim().toLowerCase();
    const phone = String(row.phone || '').trim();
    if (email || phone) return `customer_contact:${email}|${phone}`;
  }
  if (subtype === 'read_sheet' || subtype === 'google_sheet') {
    const email = String(row.email || '').trim().toLowerCase();
    const phone = String(row.phone || row.dien_thoai || '').trim();
    if (email || phone) return `sheet_contact:${email}|${phone}`;
  }
  if (subtype === 'read_landing_leads') {
    const leadId = row.leadId ?? row.id ?? row.lead_id;
    if (leadId != null && String(leadId).trim()) return `lead:${String(leadId).trim()}`;
    const email = String(row.email || '').trim().toLowerCase();
    const phone = String(row.phone || '').trim();
    if (email || phone) return `lead_contact:${email}|${phone}`;
  }
  if (subtype === 'read_form_submissions') {
    const submissionId = row.submissionId ?? row.id;
    if (submissionId != null && String(submissionId).trim()) {
      return `form_submission:${String(submissionId).trim()}`;
    }
    const email = String(row.email || '').trim().toLowerCase();
    const phone = String(row.phone || '').trim();
    if (email || phone) return `form_submission_contact:${email}|${phone}`;
  }
  return `raw:${stringifyComparableItem(row)}`;
}
