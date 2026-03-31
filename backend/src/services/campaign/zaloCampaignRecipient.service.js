import zaloCampaignRecipientRepository from '../../repositories/campaign/zaloCampaignRecipient.repository.js';
import {
  normalizePhoneForZaloCampaign,
  inferZaloUnreachableReason,
} from '../../utils/zaloPhoneCampaign.util.js';

class ZaloCampaignRecipientService {
  normalizePhone(raw) {
    return normalizePhoneForZaloCampaign(raw);
  }

  /**
   * @param {number|string} userId
   * @param {string} rawPhone
   * @returns {Promise<boolean>}
   */
  async isPhoneUnreachable(userId, rawPhone) {
    const normalized = this.normalizePhone(rawPhone);
    if (!normalized) return false;
    return zaloCampaignRecipientRepository.isPhoneUnreachable(userId, normalized);
  }

  /**
   * @param {number|string} userId
   * @param {string} rawPhone
   * @param {unknown} error
   * @param {number|string} [campaignRunId] nếu có thì ghi thêm dòng lỗi theo lượt chạy trong bảng binding
   * @returns {Promise<void>}
   */
  async markPhoneUnreachableFromError(userId, rawPhone, error, campaignRunId = null) {
    const normalized = this.normalizePhone(rawPhone);
    if (!normalized) return;
    const reason = inferZaloUnreachableReason(error);
    await zaloCampaignRecipientRepository.upsertUnreachablePhone(userId, normalized, reason);
    const rid = Number.parseInt(campaignRunId, 10);
    if (Number.isFinite(rid) && rid > 0) {
      await zaloCampaignRecipientRepository.upsertSenderBindingError(
        userId,
        normalized,
        rid,
        reason
      );
    }
  }

  /**
   * @param {number|string} userId
   * @param {string} rawPhone
   * @param {number|string} campaignRunId
   * @returns {Promise<number|null>}
   */
  async getBoundSenderAccountId(userId, rawPhone, campaignRunId) {
    const normalized = this.normalizePhone(rawPhone);
    if (!normalized) return null;
    const rid = Number.parseInt(campaignRunId, 10);
    if (!Number.isFinite(rid) || rid <= 0) return null;
    return zaloCampaignRecipientRepository.getSenderBindingAccountId(userId, normalized, rid);
  }

  /**
   * @param {number|string} userId
   * @param {string} rawPhone
   * @param {number|string} zaloAccountId
   * @param {number|string} campaignRunId
   * @returns {Promise<void>}
   */
  async bindSenderAccount(userId, rawPhone, zaloAccountId, campaignRunId) {
    const normalized = this.normalizePhone(rawPhone);
    if (!normalized) return;
    const rid = Number.parseInt(campaignRunId, 10);
    if (!Number.isFinite(rid) || rid <= 0) return;
    await zaloCampaignRecipientRepository.upsertSenderBinding(
      userId,
      normalized,
      zaloAccountId,
      rid
    );
  }
}

export default new ZaloCampaignRecipientService();
