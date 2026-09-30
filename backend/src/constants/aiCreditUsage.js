/**
 * "Lượt AI đã dùng" trên sổ `usage_logs` (`resource_type = 'ai_credit'`) — MỘT định nghĩa dùng chung cho cổng chặn
 * (aiCreditMeter), trang khách, admin Thành viên và admin Chi phí AI
 * (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-2).
 *
 * Quy ước của sổ: `delta` DƯƠNG = lượt đã tiêu.
 *   - Một lượt trả lời AI: `delta = 1`, `metadata.feature = <tên tính năng>`.
 *   - MUA Marketplace: `delta = +giá` (phần trả bằng hạn mức gói), `metadata.feature = 'marketplace_purchase:<id>'`.
 *     Đây là tiêu thụ THẬT (cổng mua cho trả bằng hạn mức gói) nên PHẢI được cộng vào "đã dùng".
 *   - BÁN Marketplace: người bán từng được ghi `delta = +90% giá`, `metadata.type = 'marketplace_sale'`. Đó là THU NHẬP
 *     của người bán, ghi nhầm vào sổ tiêu thụ: bán được hàng lại bị MẤT hạn mức, thậm chí bị chặn AI. Nơi ghi đã gỡ ở
 *     4ba3b99b (26/09/2026); production còn 5 dòng lịch sử (dòng cuối 25/08). Không sửa dữ liệu, chỉ LOẠI ở mọi bộ đọc.
 *
 * Không "loại theo tiền tố feature `marketplace_%`": làm vậy bỏ luôn dòng MUA — chính là lượt đã tiêu.
 */
export const AI_CREDIT_SALE_ROW_TYPE = 'marketplace_sale';

/**
 * Điều kiện SQL "dòng này là TIÊU THỤ hạn mức lượt AI" (loại dòng thu nhập bán Marketplace).
 * Nối bằng `AND` vào truy vấn đã lọc `resource_type = 'ai_credit'`. `metadata` NULL hoặc không có khoá `type` vẫn được
 * tính (COALESCE) — chỉ đúng dấu `marketplace_sale` bị loại.
 *
 * @param {string} [alias] tên bảng/alias của `usage_logs` trong truy vấn (vd 'ul'); bỏ trống nếu không có alias.
 */
export function aiCreditConsumptionRowSql(alias = '') {
  const prefix = alias ? `${alias}.` : '';
  return `COALESCE(${prefix}metadata->>'type', '') <> '${AI_CREDIT_SALE_ROW_TYPE}'`;
}
