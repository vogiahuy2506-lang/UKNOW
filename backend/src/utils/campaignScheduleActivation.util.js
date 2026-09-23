/**
 * Lịch chạy chỉ gửi được khi chiến dịch đang `active`.
 *
 * Bối cảnh 21/09/2026: chiến dịch 395 còn `draft`, người dùng đặt hai lịch bật, tới giờ
 * createCampaignRunRecord ném 400 "Chỉ có thể chạy chiến dịch đang hoạt động" (lịch KHÔNG được tự
 * kích hoạt chiến dịch — xem campaignRun.service.js, cờ `source !== 'schedule'`), scheduler chỉ
 * console.error. Chặn từ lúc đặt lịch và nói đúng việc cần làm, thay vì để lịch xanh mướt mà chết.
 */

export const CAMPAIGN_NOT_ACTIVE_CODE = 'CAMPAIGN_NOT_ACTIVE';

const STATUS_LABELS_VI = {
  draft: 'Nháp',
  paused: 'Tạm dừng',
};

/** `draft` → "Nháp", `paused` → "Tạm dừng", trạng thái khác → dùng nguyên mã. */
export function describeCampaignStatusVi(status) {
  const key = String(status ?? '').trim();
  return STATUS_LABELS_VI[key] || key;
}

/** Chiến dịch có đang ở trạng thái mà lịch chạy được gửi thật không. */
export function isCampaignActiveForSchedule(status) {
  return status === 'active';
}

export function buildCampaignNotActiveMessage(status) {
  return (
    `Chiến dịch đang ở trạng thái ${describeCampaignStatusVi(status)} nên lịch sẽ không chạy. ` +
    'Hãy chọn «Kích hoạt & tạo lịch» — hệ thống bật chiến dịch mà không gửi tin nào ngay.'
  );
}
