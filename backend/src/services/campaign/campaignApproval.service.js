import db from '../../config/database.js';
import { logWorkspace, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit.service.js';

/**
 * Số người nhận ƯỚC TÍNH của chiến dịch — MỘT nguồn cho ngưỡng duyệt (evaluateApprovalThreshold) và cho
 * hộp thoại "Duyệt & gửi" (danh sách chiến dịch). Trước đây hộp thoại đọc `totalCustomers` của API danh
 * sách (= COUNT(campaign_customers)), luôn 0 với chiến dịch nhân viên gửi lên chờ duyệt vì chưa chạy lần
 * nào → chủ bấm duyệt đợt gửi lớn khi màn nói "0 người nhận" (C-28).
 *
 * @param {number|string} campaignId
 * @returns {Promise<number>}
 */
export async function countCampaignRecipientsEstimate(campaignId) {
  const { rows: countRows } = await db.query(
    `SELECT COUNT(*)::int AS count FROM campaign_customers WHERE id_campaign = $1`,
    [campaignId]
  );
  let totalCustomers = Number(countRows[0]?.count) || 0;

  // Chưa đổ dữ liệu vào campaign_customers (vd node đọc trực tiếp từ config) — đếm tạm qua config node.
  if (totalCustomers === 0) {
    const { rows: nodeRows } = await db.query(
      `SELECT node_type, node_subtype, config FROM campaign_nodes WHERE id_campaign = $1`,
      [campaignId]
    );
    for (const n of nodeRows) {
      const cfg = typeof n.config === 'string' ? JSON.parse(n.config || '{}') : (n.config || {});
      if (Array.isArray(cfg.customers)) {
        totalCustomers += cfg.customers.length;
      } else if (Array.isArray(cfg.selectedCustomerIds)) {
        totalCustomers += cfg.selectedCustomerIds.length;
      } else if (Array.isArray(cfg.phoneNumbers)) {
        totalCustomers += cfg.phoneNumbers.length;
      } else if (Array.isArray(cfg.recipients)) {
        totalCustomers += cfg.recipients.length;
      }
    }
  }
  return totalCustomers;
}

/**
 * Ngưỡng duyệt chiến dịch (users.employee_campaign_approval_threshold) — nhân viên chạy chiến dịch
 * vượt ngưỡng thì phải chờ chủ duyệt. Tách khỏi campaign.controller.js#run() để scheduler
 * (utils/scheduler.js) dùng chung, tránh né qua đường hẹn lịch (RA_SOAT_NHAN_VIEN_PHAN_QUYEN_2026-09-28
 * mục 4, PLAN_VA_NHAN_VIEN_PHAN_QUYEN PR-3).
 *
 * @param {{ ownerId: number, campaignId: number }} input
 * @returns {Promise<{ threshold: number|null, totalCustomers: number, requiresApproval: boolean }>}
 */
export async function evaluateApprovalThreshold({ ownerId, campaignId }) {
  const { rows: ownerRows } = await db.query(
    `SELECT employee_campaign_approval_threshold FROM users WHERE id = $1`,
    [ownerId]
  );
  const threshold = ownerRows[0]?.employee_campaign_approval_threshold;
  if (threshold == null || threshold <= 0) {
    return { threshold: null, totalCustomers: 0, requiresApproval: false };
  }

  const totalCustomers = await countCampaignRecipientsEstimate(campaignId);

  return { threshold, totalCustomers, requiresApproval: totalCustomers >= threshold };
}

/**
 * Chuyển chiến dịch sang chờ chủ duyệt + ghi audit CAMPAIGN_APPROVAL_REQUESTED. KHÔNG tạo
 * campaign_runs — gọi trước khi bất kỳ nơi nào tạo run.
 *
 * @param {{ campaignId: number, auditContext: object, threshold: number, totalCustomers: number, actorUserId: number }} input
 */
export async function markPendingOwnerApproval({ campaignId, auditContext, threshold, totalCustomers, actorUserId }) {
  await db.query(
    `UPDATE campaigns SET status = 'pending_owner_approval', updated_at = NOW() WHERE id = $1`,
    [campaignId]
  );
  try {
    await logWorkspace(
      auditContext,
      AUDIT_ACTIONS.CAMPAIGN_APPROVAL_REQUESTED,
      AUDIT_ENTITY_TYPES.CAMPAIGN,
      campaignId,
      { threshold, totalCustomers, actorUserId }
    );
  } catch (auditErr) {
    console.warn('[Campaign] CAMPAIGN_APPROVAL_REQUESTED audit failed:', auditErr?.message);
  }
}
