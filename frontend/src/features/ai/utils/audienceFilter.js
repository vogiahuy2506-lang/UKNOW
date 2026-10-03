/**
 * Một dòng mô tả bộ lọc người nhận do server dựng (`step.recipients.filters`): loại khách, khoá học, khoá bị loại, giới hạn.
 * Thẻ xác nhận trước đây chỉ ghi "Lấy dữ liệu khách hàng" nên người dùng không thể thấy email sắp đi tới ai (rà soát C P1-3).
 * Khoá học luôn hiện bằng TÊN; chưa tra được tên thì hiện `#id` — không bao giờ ẩn bộ lọc.
 *
 * @param {{ customerType?: string|null, limit?: number|null, courses?: Array<{id:number,name:string|null}>, excludedCourses?: Array<{id:number,name:string|null}> }|null} filters
 * @param {(key: string, params?: object) => string} t
 * @returns {string}
 */
export function describeAudienceFilter(filters, t) {
  if (!filters || typeof filters !== 'object') return '';
  const names = (courses) => (Array.isArray(courses) ? courses : [])
    .map((course) => course?.name || `#${course?.id}`)
    .join(', ');
  const parts = [];
  if (filters.customerType === 'purchased') parts.push(t('aiChatbot.confirmation.filterPurchased'));
  else if (filters.customerType === 'interested') parts.push(t('aiChatbot.confirmation.filterInterested'));
  if (Array.isArray(filters.courses) && filters.courses.length > 0) {
    parts.push(t('aiChatbot.confirmation.filterCourses', { names: names(filters.courses) }));
  }
  if (Array.isArray(filters.excludedCourses) && filters.excludedCourses.length > 0) {
    parts.push(t('aiChatbot.confirmation.filterExcluded', { names: names(filters.excludedCourses) }));
  }
  if (Number.isFinite(Number(filters.limit)) && Number(filters.limit) > 0) {
    parts.push(t('aiChatbot.confirmation.filterLimit', { count: Number(filters.limit) }));
  }
  return parts.join(' · ');
}
