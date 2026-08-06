import zaloSettingRepository from '../../repositories/zalo/zaloSetting.repository.js';
import {
  createZaloLiveElsewhereError,
  mapUniqueViolationToZaloLiveElsewhere,
} from '../../utils/zaloOneWorkspace.util.js';

/**
 * Chặn / map lỗi khi một số Zalo đã sống ở workspace khác.
 */
class ZaloOneWorkspaceService {
  /**
   * No-op khi thiếu zaloUserId (không đủ dữ liệu để kết luận).
   * @param {number} userId
   * @param {string|null|undefined} zaloUserId
   * @param {{ revealOwner?: boolean }} [opts]
   */
  async assertZaloNotLiveElsewhere(userId, zaloUserId, { revealOwner = false } = {}) {
    const id = String(zaloUserId || '').trim();
    if (!id) return;

    const live = await zaloSettingRepository.findLiveConnectionInOtherWorkspace(userId, id);
    if (!live) return;

    throw createZaloLiveElsewhereError({
      ownerEmail: live.owner_email,
      revealOwner,
    });
  }

  /**
   * Chạy write; nếu Postgres 23505 trên unique live-zalo → ném 409 thân thiện.
   * @template T
   * @param {() => Promise<T>} writeFn
   * @param {{ revealOwner?: boolean, ownerEmail?: string|null }} [opts]
   * @returns {Promise<T>}
   */
  async withUniqueMapped(writeFn, opts = {}) {
    try {
      return await writeFn();
    } catch (error) {
      const mapped = mapUniqueViolationToZaloLiveElsewhere(error, opts);
      if (mapped) throw mapped;
      throw error;
    }
  }
}

export default new ZaloOneWorkspaceService();
