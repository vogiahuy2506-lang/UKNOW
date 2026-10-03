import db from '../../config/database.js';

class ProductFunnelRepository {
  /**
   * Phễu theo sản phẩm — PR-1: phần biểu mẫu (bài nộp của biểu mẫu gắn `forms.product_id`).
   *
   * - `submitted`  : bài nộp chưa huỷ, lọc theo `created_at`.
   * - `registered` : `pending_payment` | `confirmed`, lọc theo `created_at`.
   * - `paid`       : đã được chủ xác nhận — `paid_confirmed_at IS NOT NULL`, lọc theo `paid_confirmed_at`
   *                  (KHÔNG dùng `status='confirmed'`: đặt lịch không thu tiền cũng là confirmed).
   * - `revenue`    : SUM(`payment_amount`) của chính các dòng `paid`.
   *
   * Mốc là nửa mở `[startAt, endExclusive)` (00:00 giờ VN) do `dashboardAnalytics.parseDateRange` tính; null = không chặn.
   * Mọi sản phẩm của workspace đều có dòng (không có bài nộp thì 0).
   *
   * @param {{ workspaceOwnerId: number, startAt?: string|null, endExclusive?: string|null }} params
   * @returns {Promise<Array<{ productId: number, submitted: number, registered: number, paid: number, revenue: number, formIds: number[] }>>}
   */
  async aggregateFormFunnelByProduct({ workspaceOwnerId, startAt = null, endExclusive = null }) {
    const inCreated = `($2::timestamptz IS NULL OR fs.created_at >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR fs.created_at < $3::timestamptz)`;
    const inPaid = `fs.paid_confirmed_at IS NOT NULL
          AND ($2::timestamptz IS NULL OR fs.paid_confirmed_at >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR fs.paid_confirmed_at < $3::timestamptz)`;
    const result = await db.query(
      `SELECT
         p.id AS "productId",
         COALESCE(s.submitted, 0)::int AS submitted,
         COALESCE(s.registered, 0)::int AS registered,
         COALESCE(s.paid, 0)::int AS paid,
         COALESCE(s.revenue, 0)::bigint AS revenue,
         ARRAY(
           SELECT f2.id FROM forms f2
           WHERE f2.product_id = p.id AND f2.workspace_owner_id = $1
           ORDER BY f2.id
         ) AS "formIds"
       FROM products p
       LEFT JOIN (
         SELECT
           f.product_id,
           COUNT(*) FILTER (WHERE fs.status <> 'cancelled' AND ${inCreated}) AS submitted,
           COUNT(*) FILTER (WHERE fs.status IN ('pending_payment', 'confirmed') AND ${inCreated}) AS registered,
           COUNT(*) FILTER (WHERE ${inPaid}) AS paid,
           SUM(fs.payment_amount) FILTER (WHERE ${inPaid}) AS revenue
         FROM form_submissions fs
         JOIN forms f ON f.id = fs.form_id
         WHERE f.workspace_owner_id = $1
           AND fs.workspace_owner_id = $1
           AND f.product_id IS NOT NULL
         GROUP BY f.product_id
       ) s ON s.product_id = p.id
       WHERE COALESCE(p.workspace_owner_id, p.id_user) = $1
       ORDER BY p.id`,
      [workspaceOwnerId, startAt, endExclusive]
    );
    return result.rows.map((r) => ({
      productId: Number(r.productId),
      submitted: Number(r.submitted || 0),
      registered: Number(r.registered || 0),
      paid: Number(r.paid || 0),
      revenue: Number(r.revenue || 0),
      formIds: (r.formIds || []).map(Number),
    }));
  }
}

export default new ProductFunnelRepository();
