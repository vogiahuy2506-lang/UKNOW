import db from '../../config/database.js';

// Hai điều kiện khoảng ngày dùng CHUNG cho đếm lượt (aggregateFormFunnelByProduct) và danh sách thô để gộp người
// (listFormSubmissionsForPeople) — một luật ngày duy nhất. $2/$3 = mốc nửa mở [startAt, endExclusive).
const IN_CREATED = `($2::timestamptz IS NULL OR fs.created_at >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR fs.created_at < $3::timestamptz)`;
const IN_PAID = `fs.paid_confirmed_at IS NOT NULL
          AND ($2::timestamptz IS NULL OR fs.paid_confirmed_at >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR fs.paid_confirmed_at < $3::timestamptz)`;

class ProductFunnelRepository {
  /**
   * Phễu theo sản phẩm — PR-1: phần biểu mẫu (bài nộp của biểu mẫu gắn `forms.product_id`).
   *
   * - `submitted`  : bài nộp chưa huỷ, lọc theo `created_at`.
   * - `registered` : `pending_payment` | `confirmed`, lọc theo `created_at`.
   * - `paid`       : đã được chủ xác nhận — `paid_confirmed_at IS NOT NULL`, lọc theo `paid_confirmed_at`
   *                  (KHÔNG dùng `status='confirmed'`: đặt lịch không thu tiền cũng là confirmed).
   * - `revenue`    : SUM(`payment_amount`) của chính các dòng `paid`.
   * - `registered` của sản phẩm `kind='event'`: mọi bài nộp chưa huỷ (xem `registeredStatus`).
   * - `awaitingConfirm` / `awaitingAmount`: "Chờ xác nhận" — bài `pending_payment` mà khách ĐÃ BÁO chuyển khoản
   *                  (`payer_reported_paid_at` hoặc `payment_receipt_key` có giá trị): việc chủ còn phải làm. Là trạng thái HIỆN TẠI,
   *                  KHÔNG lọc theo khoảng ngày (khách báo từ 60 ngày trước mà chủ chưa bấm vẫn phải hiện). `awaitingAmount` = SUM(`payment_amount`).
   *
   * Mốc là nửa mở `[startAt, endExclusive)` (00:00 giờ VN) do `dashboardAnalytics.parseDateRange` tính; null = không chặn.
   * Mọi sản phẩm của workspace đều có dòng (không có bài nộp thì 0).
   *
   * @param {{ workspaceOwnerId: number, startAt?: string|null, endExclusive?: string|null }} params
   * @returns {Promise<Array<{ productId: number, submitted: number, registered: number, paid: number, revenue: number, awaitingConfirm: number, awaitingAmount: number, kind: 'sale'|'event', hasPaidForm: boolean, formIds: number[] }>>}
   */
  async aggregateFormFunnelByProduct({ workspaceOwnerId, startAt = null, endExclusive = null }) {
    const inCreated = IN_CREATED;
    const inPaid = IN_PAID;
    const awaiting = `fs.status = 'pending_payment'
          AND (fs.payer_reported_paid_at IS NOT NULL OR fs.payment_receipt_key IS NOT NULL)`;
    // Đăng ký theo loại: sale = chờ thanh toán / đã xác nhận; event (miễn phí, không đặt lịch) = mọi bài nộp chưa huỷ —
    // bài nộp CHÍNH LÀ lượt đăng ký. Chỉ `registered` đổi theo loại; `submitted` giữ nguyên (service quyết "Để lại thông tin").
    const registeredStatus = `(CASE WHEN pk.kind = 'event' THEN fs.status <> 'cancelled'
                                ELSE fs.status IN ('pending_payment', 'confirmed') END)`;
    const result = await db.query(
      `SELECT
         p.id AS "productId",
         COALESCE(s.submitted, 0)::int AS submitted,
         COALESCE(s.registered, 0)::int AS registered,
         COALESCE(s.paid, 0)::int AS paid,
         COALESCE(s.revenue, 0)::bigint AS revenue,
         p.kind AS kind,
         EXISTS (
           SELECT 1 FROM forms f3
           WHERE f3.product_id = p.id AND f3.workspace_owner_id = $1
             AND f3.payment_config->>'enabled' = 'true'
         ) AS "hasPaidForm",
         COALESCE(s.awaiting_confirm, 0)::int AS "awaitingConfirm",
         COALESCE(s.awaiting_amount, 0)::bigint AS "awaitingAmount",
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
           COUNT(*) FILTER (WHERE ${registeredStatus} AND ${inCreated}) AS registered,
           COUNT(*) FILTER (WHERE ${inPaid}) AS paid,
           SUM(fs.payment_amount) FILTER (WHERE ${inPaid}) AS revenue,
           COUNT(*) FILTER (WHERE ${awaiting}) AS awaiting_confirm,
           SUM(fs.payment_amount) FILTER (WHERE ${awaiting}) AS awaiting_amount
         FROM form_submissions fs
         JOIN forms f ON f.id = fs.form_id
         JOIN products pk ON pk.id = f.product_id
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
      awaitingConfirm: Number(r.awaitingConfirm || 0),
      awaitingAmount: Number(r.awaitingAmount || 0),
      kind: r.kind === 'event' ? 'event' : 'sale',
      hasPaidForm: Boolean(r.hasPaidForm),
      formIds: (r.formIds || []).map(Number),
    }));
  }

  /**
   * Đợt 3 (đếm NGƯỜI): các bài nộp thô của biểu mẫu gắn sản phẩm để service gộp người trong JS (khối lượng nhỏ).
   * Chỉ lấy bài có liên quan tới khoảng: tạo trong khoảng (`inCreated`) HOẶC được xác nhận đã trả trong khoảng (`inPaid`) —
   * hai cờ này dùng ĐÚNG điều kiện của `aggregateFormFunnelByProduct`. Không lọc `status` ở đây (service quyết theo loại sản phẩm).
   *
   * @returns {Promise<Array<{ id: number, productId: number, phone: string|null, email: string|null, status: string, inCreated: boolean, inPaid: boolean }>>}
   */
  async listFormSubmissionsForPeople({ workspaceOwnerId, startAt = null, endExclusive = null }) {
    const result = await db.query(
      `SELECT fs.id, f.product_id AS "productId", fs.respondent_phone AS phone, fs.respondent_email AS email,
              fs.status, (${IN_CREATED}) AS "inCreated", (${IN_PAID}) AS "inPaid"
       FROM form_submissions fs
       JOIN forms f ON f.id = fs.form_id
       WHERE f.workspace_owner_id = $1
         AND fs.workspace_owner_id = $1
         AND f.product_id IS NOT NULL
         AND ((${IN_CREATED}) OR (${IN_PAID}))
       ORDER BY fs.id`,
      [workspaceOwnerId, startAt, endExclusive]
    );
    return result.rows.map((r) => ({
      id: Number(r.id),
      productId: Number(r.productId),
      phone: r.phone || null,
      email: r.email || null,
      status: r.status,
      inCreated: Boolean(r.inCreated),
      inPaid: Boolean(r.inPaid),
    }));
  }

  /**
   * Đợt 3 (đếm NGƯỜI): các lead thô (landing_page_slug nằm trong `slugs`, cùng workspace, trong khoảng `created_at`).
   * Service gắn lead vào sản phẩm theo slug rồi gộp người cùng bài nộp.
   *
   * @param {{ workspaceOwnerId: number, slugs: string[], startAt?: string|null, endExclusive?: string|null }} params
   * @returns {Promise<Array<{ id: number, slug: string, phone: string|null, email: string|null }>>}
   */
  async listLeadsForPeople({ workspaceOwnerId, slugs, startAt = null, endExclusive = null }) {
    if (!Array.isArray(slugs) || slugs.length === 0) return [];
    const result = await db.query(
      `SELECT l.id, l.landing_page_slug AS slug, l.phone, l.email
       FROM leads l
       WHERE l.landing_page_slug = ANY($1::text[])
         AND COALESCE(l.workspace_owner_id, l.id_user) = $4
         AND ($2::timestamptz IS NULL OR l.created_at >= $2::timestamptz)
         AND ($3::timestamptz IS NULL OR l.created_at < $3::timestamptz)
       ORDER BY l.id`,
      [slugs, startAt, endExclusive, workspaceOwnerId]
    );
    return result.rows.map((r) => ({
      id: Number(r.id),
      slug: r.slug,
      phone: r.phone || null,
      email: r.email || null,
    }));
  }

  /**
   * PR-2: landing "thuộc" sản phẩm = landing có biểu mẫu gắn sản phẩm (`forms.landing_page_id` + `forms.product_id`),
   * cùng workspace. Trả mỗi sản phẩm: `productUrl`, danh sách landing (slug + tên miền đang `active`) để PR-3 dựng địa chỉ
   * công khai, và hai số theo slug trong khoảng `created_at`: `landingViews` (landing_page_events `view` — LƯỢT XEM, `lp-track.js`
   * chỉ gửi `{slug}`) và `leads` (bảng `leads`, cùng workspace).
   *
   * @param {{ workspaceOwnerId: number, startAt?: string|null, endExclusive?: string|null }} params
   * @returns {Promise<Array<{ productId: number, productUrl: string|null, landings: Array<{ id: number, slug: string, hostnames: string[] }>, landingViews: number, leads: number }>>}
   */
  async aggregateLandingFunnelByProduct({ workspaceOwnerId, startAt = null, endExclusive = null }) {
    const products = await db.query(
      `SELECT p.id AS "productId", p.product_url AS "productUrl"
       FROM products p
       WHERE COALESCE(p.workspace_owner_id, p.id_user) = $1
       ORDER BY p.id`,
      [workspaceOwnerId]
    );
    const links = await db.query(
      `SELECT DISTINCT f.product_id AS "productId", lp.id AS "landingId", lp.slug,
              ARRAY(
                SELECT d.hostname FROM landing_page_domains d
                WHERE d.landing_page_id = lp.id AND d.status = 'active'
                ORDER BY d.id
              ) AS hostnames
       FROM forms f
       JOIN landing_pages lp ON lp.id = f.landing_page_id
       WHERE f.workspace_owner_id = $1
         AND f.product_id IS NOT NULL
         AND COALESCE(lp.workspace_owner_id, lp.id_user) = $1`,
      [workspaceOwnerId]
    );
    const slugs = [...new Set(links.rows.map((r) => r.slug).filter(Boolean))];
    const viewsBySlug = new Map();
    const leadsBySlug = new Map();
    if (slugs.length > 0) {
      const views = await db.query(
        `SELECT lpe.landing_page_slug AS slug, COUNT(*)::int AS n
         FROM landing_page_events lpe
         WHERE lpe.event_type = 'view'
           AND lpe.landing_page_slug = ANY($1::text[])
           AND ($2::timestamptz IS NULL OR lpe.created_at >= $2::timestamptz)
           AND ($3::timestamptz IS NULL OR lpe.created_at < $3::timestamptz)
         GROUP BY lpe.landing_page_slug`,
        [slugs, startAt, endExclusive]
      );
      for (const r of views.rows) viewsBySlug.set(r.slug, Number(r.n));
      const leads = await db.query(
        `SELECT l.landing_page_slug AS slug, COUNT(*)::int AS n
         FROM leads l
         WHERE l.landing_page_slug = ANY($1::text[])
           AND COALESCE(l.workspace_owner_id, l.id_user) = $4
           AND ($2::timestamptz IS NULL OR l.created_at >= $2::timestamptz)
           AND ($3::timestamptz IS NULL OR l.created_at < $3::timestamptz)
         GROUP BY l.landing_page_slug`,
        [slugs, startAt, endExclusive, workspaceOwnerId]
      );
      for (const r of leads.rows) leadsBySlug.set(r.slug, Number(r.n));
    }
    return products.rows.map((p) => {
      const landings = links.rows
        .filter((l) => Number(l.productId) === Number(p.productId))
        .map((l) => ({ id: Number(l.landingId), slug: l.slug, hostnames: l.hostnames || [] }));
      const uniqueSlugs = [...new Set(landings.map((l) => l.slug))];
      return {
        productId: Number(p.productId),
        productUrl: p.productUrl || null,
        landings,
        landingViews: uniqueSlugs.reduce((sum, s) => sum + (viewsBySlug.get(s) || 0), 0),
        leads: uniqueSlugs.reduce((sum, s) => sum + (leadsBySlug.get(s) || 0), 0),
      };
    });
  }

  /**
   * PR-3: các lượt bấm link trong chiến dịch (email/Zalo) của workspace, lọc thô theo SQL. So khớp URL làm trong JS.
   * Cả hai đường ghi khi khách bấm (`customerEmailTracking` / `customerZaloTracking`) ghi `customer_journey.id_campaign`
   * (không phải `campaign_id`), nên chủ = `COALESCE(c.workspace_owner_id, c.id_user)` của chiến dịch đó.
   * `event_at` là TIMESTAMP không múi giờ, ghi bằng CURRENT_TIMESTAMP theo múi giờ phiên (VN) → so với mốc timestamptz đúng.
   *
   * @returns {Promise<Array<{ id: number, customerId: number|null, targetUrl: string }>>}
   */
  async listCampaignClicks({ workspaceOwnerId, startAt = null, endExclusive = null }) {
    const result = await db.query(
      `SELECT cj.id, cj.id_customer AS "customerId", cj.event_data->>'targetUrl' AS "targetUrl"
       FROM customer_journey cj
       JOIN campaigns c ON c.id = cj.id_campaign
       WHERE cj.event_type IN ('email_clicked', 'zalo_clicked')
         AND COALESCE(c.workspace_owner_id, c.id_user) = $1
         AND COALESCE(cj.event_data->>'targetUrl', '') <> ''
         AND ($2::timestamptz IS NULL OR cj.event_at >= $2::timestamptz)
         AND ($3::timestamptz IS NULL OR cj.event_at < $3::timestamptz)`,
      [workspaceOwnerId, startAt, endExclusive]
    );
    return result.rows.map((r) => ({
      id: Number(r.id),
      customerId: r.customerId === null || r.customerId === undefined ? null : Number(r.customerId),
      targetUrl: r.targetUrl,
    }));
  }
}

export default new ProductFunnelRepository();
