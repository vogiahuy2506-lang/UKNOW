import { MAX_AI_MANUAL_RECIPIENTS } from './manualRecipients.util.js';

/** Trần số dòng của khối "Lấy dữ liệu khách" loại interested / purchased / both. */
export const INTERESTED_LIMIT_CAP = 5000;

/**
 * Trần số khách của loại `all` (toàn bộ khách workspace) — bằng trần người nhận nhập tay/trợ lý AI (50.000)
 * để "gửi cho khách đã lưu" không bị cắt còn 5.000 (PLAN_TAO_CHIEN_DICH_TUNG_BUOC PR-5).
 */
export const ALL_CUSTOMERS_LIMIT_CAP = MAX_AI_MANUAL_RECIPIENTS;
