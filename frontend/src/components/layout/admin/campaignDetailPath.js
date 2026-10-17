/**
 * Trang chi tiết MỘT chiến dịch: `/app/campaigns/:id` (id số), link cũ `/:id/builder` và `/:id/simple` — cùng tô sáng mục Chiến dịch.
 * KHÔNG khớp `/app/campaigns/simple` (trang TẠO từng bước), `/app/campaigns/new` và danh sách `/app/campaigns`.
 */
export const CAMPAIGN_DETAIL_PATH = /^\/app\/campaigns\/(\d+(\/|$)|[^/]+\/(builder|simple)(\/|$))/;

export default CAMPAIGN_DETAIL_PATH;
