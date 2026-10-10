import emailSuppressionRepository from '../../repositories/email/emailSuppression.repository.js';

/**
 * Danh sách cấm gửi email theo (workspace, email) — PLAN_RA_SOAT_DOT3 PR-Q1 việc 1.
 *
 * Lý do tồn tại: huỷ đăng ký / hard bounce trước đây chỉ ghi lên bảng customers nên người nhận đến từ nguồn khác
 * (Sheet, lead, form) huỷ đăng ký rồi vẫn nhận tiếp. Đây là điểm chặn chung, kiểm TRƯỚC reserveSendQuota().
 */
class EmailSuppressionService {
  /**
   * @param {unknown} email
   * @returns {string}
   */
  normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  /**
   * @param {{workspaceOwnerId: number|string, email: string}} input
   * @returns {Promise<'unsubscribe'|'hard_bounce'|null>}
   */
  async findSuppression({ workspaceOwnerId, email }) {
    const emailLower = this.normalizeEmail(email);
    const ownerId = Number.parseInt(workspaceOwnerId, 10);
    if (!emailLower || !Number.isFinite(ownerId)) return null;
    return emailSuppressionRepository.findReason(ownerId, emailLower);
  }

  /**
   * @param {{workspaceOwnerId: number|string, email: string, reason: 'unsubscribe'|'hard_bounce', source?: string}} input
   * @param {{query: Function}} [queryable] client của transaction đang mở (tuỳ chọn)
   * @returns {Promise<boolean>}
   */
  async suppress({ workspaceOwnerId, email, reason, source = null }, queryable) {
    const emailLower = this.normalizeEmail(email);
    const ownerId = Number.parseInt(workspaceOwnerId, 10);
    if (!emailLower || !Number.isFinite(ownerId)) return false;
    await emailSuppressionRepository.upsert({ workspaceOwnerId: ownerId, emailLower, reason, source }, queryable);
    return true;
  }

  /**
   * Cấm gửi theo người nhận của thư có tracking_token này (đường huỷ đăng ký + DSN hard bounce).
   *
   * @param {string} token
   * @param {{reason: 'unsubscribe'|'hard_bounce', source?: string}} input
   * @param {{query: Function}} [queryable]
   * @returns {Promise<boolean>}
   */
  async suppressByTrackingToken(token, { reason, source = null }, queryable) {
    if (!token) return false;
    return emailSuppressionRepository.upsertByTrackingToken(token, { reason, source }, queryable);
  }
}

export default new EmailSuppressionService();
