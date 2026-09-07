import db from '../../config/database.js';

/**
 * Danh sách bảng kế toán & tài chính TUYỆT ĐỐI KHÔNG ĐƯỢC PHÉP XOÁ.
 * Đây là chứng từ luật định bắt buộc lưu giữ tối thiểu 10 năm theo Luật Kế toán.
 *
 * ⚠️ RÀNG BUỘC NGẦM VỀ CASCADE:
 * Whitelist này bảo vệ ở TẦNG ỨNG DỤNG. Nó KHÔNG CHẶN ĐƯỢC `ON DELETE CASCADE`:
 * Nếu sau này ai thêm một khoá ngoại CASCADE từ bảng kế toán trỏ về `campaign_runs` / `customers` / `leads`,
 * xoá dòng cha sẽ kéo theo dòng kế toán và whitelist không hay biết gì.
 * Hiện trạng an toàn: Không bảng kế toán nào có FK CASCADE tới 3 bảng đó, và
 * `campaign_run_recipient_steps_backup_182` chỉ có `id_run BIGINT` không kèm `REFERENCES`.
 */
export const EXCLUDED_ACCOUNTING_TABLES = Object.freeze([
  'affiliate_ledger',
  'affiliate_periods',
  'affiliate_revenue_events',
  'affiliate_withdrawals',
  'orders',
  'einvoices',
  'campaign_run_recipient_steps_backup_182',
]);

/**
 * Danh sách bảng duy nhất được phép xử lý dọn dẹp dữ liệu cũ (whitelist).
 */
export const ALLOWED_CLEANUP_TABLES = Object.freeze([
  'customers',
  'leads',
  'campaign_runs',
  'landing_page_events',
  'contact_submissions',
]);

/**
 * Kiểm tra an toàn trước khi thực hiện câu lệnh xoá:
 * 1. Bảng đích phải thuộc danh sách cho phép (ALLOWED_CLEANUP_TABLES).
 * 2. Câu lệnh không được chứa bất kỳ bảng kế toán nào (EXCLUDED_ACCOUNTING_TABLES).
 */
function assertQuerySafety(tableName, sqlQuery) {
  if (!ALLOWED_CLEANUP_TABLES.includes(tableName)) {
    throw new Error(`[DataRetention] Bị từ chối: Bảng "${tableName}" không nằm trong danh sách bảng được phép dọn dẹp.`);
  }
  const lowerSql = sqlQuery.toLowerCase();
  for (const excluded of EXCLUDED_ACCOUNTING_TABLES) {
    if (lowerSql.includes(excluded.toLowerCase())) {
      throw new Error(`[DataRetention] NGUY HIỂM: Câu lệnh dọn dẹp vi phạm khi chạm vào bảng kế toán được bảo vệ "${excluded}".`);
    }
  }
}

/**
 * Xoá dữ liệu theo lô (batch) để tránh khoá bảng quá lâu trên các bảng có dữ liệu lớn.
 *
 * @param {string} tableName
 * @param {string} sqlQuery Câu lệnh DELETE kèm LIMIT $1
 * @param {number} batchSize
 * @returns {Promise<number>} Tổng số dòng đã xoá
 */
async function deleteInBatches(tableName, sqlQuery, batchSize = 1000) {
  assertQuerySafety(tableName, sqlQuery);
  const limit = Number.isFinite(Number(batchSize)) && Number(batchSize) > 0
    ? Math.floor(Number(batchSize))
    : 1000;

  let totalDeleted = 0;
  while (true) {
    const { rowCount } = await db.query(sqlQuery, [limit]);
    const deletedInBatch = rowCount || 0;
    totalDeleted += deletedInBatch;
    if (deletedInBatch < limit) {
      break;
    }
  }
  return totalDeleted;
}

/**
 * Thống kê số lượng dòng dữ liệu đạt điều kiện xoá (chế độ chỉ đọc, không sửa/xoá dữ liệu).
 * Phục vụ báo cáo dry-run và đối soát trước khi duyệt bật cron.
 */
export async function countRetentionEligibleRows() {
  const [
    customersRes,
    leadsRes,
    campaignRunsRes,
    landingEventsRes,
    contactSubmissionsRes,
    legacyDeletedUsersRes,
  ] = await Promise.all([
    // 1. customers: 90 ngày sau khi tài khoản chủ sở hữu bị xoá (deleted_at < NOW() - 90 days)
    db.query(`
      SELECT COUNT(*) AS count FROM customers c
      JOIN users u ON u.id = COALESCE(c.workspace_owner_id, c.id_user)
      WHERE u.deleted_at IS NOT NULL
        AND u.deleted_at < NOW() - INTERVAL '90 days'
    `),
    // 2. leads: 24 tháng từ created_at, HOẶC 90 ngày sau users.deleted_at
    db.query(`
      SELECT COUNT(*) AS count FROM leads l
      LEFT JOIN users u ON u.id = COALESCE(l.workspace_owner_id, l.id_user)
      WHERE l.created_at < NOW() - INTERVAL '24 months'
         OR (u.deleted_at IS NOT NULL AND u.deleted_at < NOW() - INTERVAL '90 days')
    `),
    // 3. campaign_runs: 24 tháng từ ngày tạo
    db.query(`
      SELECT COUNT(*) AS count FROM campaign_runs cr
      WHERE cr.created_at < NOW() - INTERVAL '24 months'
    `),
    // 4. landing_page_events: 13 tháng từ ngày tạo
    db.query(`
      SELECT COUNT(*) AS count FROM landing_page_events lpe
      WHERE lpe.created_at < NOW() - INTERVAL '13 months'
    `),
    // 5. contact_submissions: 24 tháng từ ngày tạo
    db.query(`
      SELECT COUNT(*) AS count FROM contact_submissions cs
      WHERE cs.created_at < NOW() - INTERVAL '24 months'
    `),
    // 6. users: tài khoản xoá mềm cũ nhưng deleted_at IS NULL (không bị dọn dẹp)
    db.query(`
      SELECT COUNT(*) AS count FROM users u
      WHERE u.status = 'deleted' AND u.deleted_at IS NULL
    `),
  ]);

  const customers = Number.parseInt(customersRes.rows[0]?.count || 0, 10);
  const leads = Number.parseInt(leadsRes.rows[0]?.count || 0, 10);
  const campaign_runs = Number.parseInt(campaignRunsRes.rows[0]?.count || 0, 10);
  const landing_page_events = Number.parseInt(landingEventsRes.rows[0]?.count || 0, 10);
  const contact_submissions = Number.parseInt(contactSubmissionsRes.rows[0]?.count || 0, 10);
  const legacy_deleted_users = Number.parseInt(legacyDeletedUsersRes.rows[0]?.count || 0, 10);

  return {
    customers,
    leads,
    campaign_runs,
    landing_page_events,
    contact_submissions,
    legacy_deleted_users,
    totalEligible: customers + leads + campaign_runs + landing_page_events + contact_submissions,
    customersEligible: customers,
    leadsEligible: leads,
    campaignRunsEligible: campaign_runs,
    landingPageEventsEligible: landing_page_events,
    contactSubmissionsEligible: contact_submissions,
  };
}

/**
 * Thực thi dọn dẹp dữ liệu theo chính sách lưu trữ đã được duyệt 06/09/2026.
 *
 * Kiểm soát qua cờ biến môi trường DATA_RETENTION_ENABLED:
 * - Mặc định tắt (false): không xoá bất kỳ dữ liệu nào, trả về trạng thái noop.
 * - Khi bật (true) hoặc force=true (dành riêng cho integration test): xoá theo lô và ghi log chi tiết.
 *
 * @param {object} [options]
 * @param {boolean} [options.force=false] Cho phép ép chạy trong môi trường test độc lập
 * @param {number} [options.batchSize=1000] Kích thước mỗi lô xoá
 * @returns {Promise<{ status: string, totalDeleted: number, deletedCounts: object, reason?: string }>}
 */
export async function runDataRetentionCleanup({ force = false, batchSize = 1000 } = {}) {
  const isEnabled = process.env.DATA_RETENTION_ENABLED === 'true' || force === true;

  if (!isEnabled) {
    console.log('[DataRetention] Cờ DATA_RETENTION_ENABLED đang TẮT. Bỏ qua không xoá dữ liệu.');
    return {
      status: 'noop',
      enabled: false,
      totalDeleted: 0,
      reason: 'DATA_RETENTION_ENABLED is false',
      message: 'DATA_RETENTION_ENABLED is false, skipping cleanup',
      deletedCounts: {
        customers: 0,
        leads: 0,
        campaign_runs: 0,
        landing_page_events: 0,
        contact_submissions: 0,
      },
      customersDeleted: 0,
      leadsDeleted: 0,
      campaignRunsDeleted: 0,
      landingPageEventsDeleted: 0,
      contactSubmissionsDeleted: 0,
    };
  }

  console.log('[DataRetention] Bắt đầu dọn dẹp dữ liệu theo thời hạn lưu trữ (batchSize=' + batchSize + ')...');

  // 1. Dọn customers: 90 ngày sau khi tài khoản chủ sở hữu bị xoá (users.deleted_at < NOW() - 90 days)
  const customersDeleted = await deleteInBatches(
    'customers',
    `DELETE FROM customers
      WHERE id IN (
        SELECT c.id FROM customers c
        JOIN users u ON u.id = COALESCE(c.workspace_owner_id, c.id_user)
        WHERE u.deleted_at IS NOT NULL
          AND u.deleted_at < NOW() - INTERVAL '90 days'
        LIMIT $1
      )`,
    batchSize
  );

  // 2. Dọn leads: 24 tháng kể từ ngày tạo, HOẶC 90 ngày sau khi users.deleted_at
  const leadsDeleted = await deleteInBatches(
    'leads',
    `DELETE FROM leads
      WHERE id IN (
        SELECT l.id FROM leads l
        LEFT JOIN users u ON u.id = COALESCE(l.workspace_owner_id, l.id_user)
        WHERE l.created_at < NOW() - INTERVAL '24 months'
           OR (u.deleted_at IS NOT NULL AND u.deleted_at < NOW() - INTERVAL '90 days')
        LIMIT $1
      )`,
    batchSize
  );

  // 3. Dọn campaign_runs: 24 tháng kể từ ngày tạo (cascade xoá executions, recipient_steps, node_items)
  const campaignRunsDeleted = await deleteInBatches(
    'campaign_runs',
    `DELETE FROM campaign_runs
      WHERE id IN (
        SELECT cr.id FROM campaign_runs cr
        WHERE cr.created_at < NOW() - INTERVAL '24 months'
        LIMIT $1
      )`,
    batchSize
  );

  // 4. Dọn landing_page_events: 13 tháng kể từ ngày tạo
  const landingEventsDeleted = await deleteInBatches(
    'landing_page_events',
    `DELETE FROM landing_page_events
      WHERE id IN (
        SELECT lpe.id FROM landing_page_events lpe
        WHERE lpe.created_at < NOW() - INTERVAL '13 months'
        LIMIT $1
      )`,
    batchSize
  );

  // 5. Dọn contact_submissions: 24 tháng kể từ ngày tạo
  const contactSubmissionsDeleted = await deleteInBatches(
    'contact_submissions',
    `DELETE FROM contact_submissions
      WHERE id IN (
        SELECT cs.id FROM contact_submissions cs
        WHERE cs.created_at < NOW() - INTERVAL '24 months'
        LIMIT $1
      )`,
    batchSize
  );

  const deletedCounts = {
    customers: customersDeleted,
    leads: leadsDeleted,
    campaign_runs: campaignRunsDeleted,
    landing_page_events: landingEventsDeleted,
    contact_submissions: contactSubmissionsDeleted,
  };

  const totalDeleted = Object.values(deletedCounts).reduce((sum, count) => sum + count, 0);

  console.log('[DataRetention] Hoàn thành dọn dẹp. Tổng số dòng đã xoá: ' + totalDeleted, deletedCounts);

  return {
    status: totalDeleted === 0 ? 'noop' : 'success',
    enabled: true,
    totalDeleted,
    deletedCounts,
    customersDeleted,
    leadsDeleted,
    campaignRunsDeleted,
    landingPageEventsDeleted: landingEventsDeleted,
    contactSubmissionsDeleted,
  };
}
