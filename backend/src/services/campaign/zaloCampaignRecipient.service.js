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
   * @returns {Promise<void>}
   */
  async markPhoneUnreachableFromError(userId, rawPhone, error) {
    const normalized = this.normalizePhone(rawPhone);
    if (!normalized) return;
    const reason = inferZaloUnreachableReason(error);
    await zaloCampaignRecipientRepository.upsertUnreachablePhone(userId, normalized, reason);
  }

  /**
   * @param {number|string} userId
   * @param {string} rawPhone
   * @returns {Promise<number|null>}
   */
  async getBoundSenderAccountId(userId, rawPhone) {
    const normalized = this.normalizePhone(rawPhone);
    if (!normalized) return null;
    return zaloCampaignRecipientRepository.getSenderBindingAccountId(userId, normalized);
  }

  /**
   * @param {number|string} userId
   * @param {string} rawPhone
   * @param {number|string} zaloAccountId
   * @returns {Promise<void>}
   */
  async bindSenderAccount(userId, rawPhone, zaloAccountId) {
    const normalized = this.normalizePhone(rawPhone);
    if (!normalized) return;
    await zaloCampaignRecipientRepository.upsertSenderBinding(userId, normalized, zaloAccountId);
  }
}

export default new ZaloCampaignRecipientService();
