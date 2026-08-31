/**
 * Campaign Resource Resolver (Giai đoạn 2 & 3 - Việc 2.2 & 3.2)
 *
 * Nhiệm vụ: Xác thực và giải quyết tài nguyên thật (accounts, sheets, landing pages, zalo groups)
 * TRƯỚC KHI biên dịch intent thành đồ thị. Tách biệt hoàn toàn tầng I/O bất đồng bộ
 * khỏi compiler thuần túy.
 */

import { isUsableZaloAccount } from './aiCampaignWizard.service.js';
import { checkSheetForChannel } from './sheetRecipientCheck.service.js';

/**
 * Giải quyết và kiểm tra các tài nguyên cần thiết cho một CampaignIntentV1.
 *
 * @param {object} intent - CampaignIntentV1
 * @param {object} context - Context chứa resources hoặc repositories
 * @param {Array<object>} [context.emailSenders] - Danh sách email senders của user
 * @param {Array<object>} [context.zaloAccounts] - Danh sách zalo accounts của user
 * @param {Array<object>} [context.zaloGroups] - Danh sách nhóm Zalo của user/account
 * @param {Function} [context.checkSheetFn] - Hàm kiểm tra sheet (tuỳ chọn override cho test)
 * @returns {Promise<{ ok: boolean, resolved: object, errors: string[] }>}
 */
export async function resolveCampaignResources(intent, context = {}) {
  const errors = [];
  const resolved = {
    senderAccount: null,
    sheetCheck: null,
    zaloGroups: null,
  };

  if (!intent || typeof intent !== 'object') {
    return { ok: false, resolved, errors: ['Intent không hợp lệ'] };
  }

  const { channel, sender, audience } = intent;

  // 1. Resolve & Preflight Sender Account
  if (sender?.id != null) {
    const senderId = Number(sender.id);
    if (channel === 'email') {
      const emailSenders = Array.isArray(context.emailSenders) ? context.emailSenders : [];
      const found = emailSenders.find((s) => Number(s.id) === senderId);
      if (!found) {
        errors.push(`Tài khoản gửi email (ID: ${senderId}) không tồn tại hoặc không thuộc quyền sở hữu.`);
      } else if (found.status === 'inactive' || found.is_active === false) {
        errors.push(`Tài khoản gửi email "${found.name || found.email || senderId}" đang ở trạng thái không hoạt động.`);
      } else {
        resolved.senderAccount = found;
      }
    } else if (channel === 'zalo' || channel === 'zalo_group') {
      const zaloAccounts = Array.isArray(context.zaloAccounts) ? context.zaloAccounts : [];
      const found = zaloAccounts.find((a) => Number(a.id) === senderId);
      if (!found) {
        errors.push(`Tài khoản Zalo (ID: ${senderId}) không tồn tại hoặc không thuộc quyền sở hữu.`);
      } else if (!isUsableZaloAccount(found)) {
        errors.push(`Tài khoản Zalo "${found.displayName || found.name || senderId}" đã mất kết nối hoặc bị khoá.`);
      } else {
        resolved.senderAccount = found;
      }
    }
  }

  // 2. Resolve & Preflight Audience Source
  if (audience?.type === 'sheet') {
    const sheetUrl = String(audience.url || '').trim();
    if (!sheetUrl) {
      errors.push('Đường dẫn Google Sheet không được để trống.');
    } else {
      const checkFn = context.checkSheetFn || checkSheetForChannel;
      const sheetCheck = await checkFn(sheetUrl, channel);
      resolved.sheetCheck = sheetCheck;

      if (sheetCheck.status === 'invalid_url') {
        errors.push('Đường dẫn Google Sheet không hợp lệ.');
      } else if (sheetCheck.status === 'wrong_channel') {
        const expectedKind = channel === 'email' ? 'email' : 'số điện thoại Zalo';
        errors.push(`Google Sheet không có cột chứa thông tin ${expectedKind} hợp lệ cho kênh ${channel}.`);
      } else if (sheetCheck.status === 'no_contact') {
        errors.push('Google Sheet không chứa dữ liệu liên hệ nào.');
      } else if (sheetCheck.status === 'not_public') {
        errors.push('Google Sheet không thể truy cập (hãy bật quyền chia sẻ "Bất kỳ ai có đường liên kết").');
      }
    }
  }

  // 3. Resolve & Preflight Zalo Group Audience
  if (channel === 'zalo_group') {
    if (Array.isArray(audience?.groupIds) && audience.groupIds.length > 0) {
      if (Array.isArray(context.zaloGroups) && context.zaloGroups.length > 0) {
        const existingGroupIds = new Set(context.zaloGroups.map((g) => String(g.groupId || g.id)));
        const missingGroups = audience.groupIds.filter((gid) => !existingGroupIds.has(String(gid)));
        if (missingGroups.length > 0) {
          errors.push(`Có ${missingGroups.length} nhóm Zalo không tồn tại hoặc tài khoản không còn là thành viên.`);
        } else {
          resolved.zaloGroups = audience.groupIds;
        }
      } else {
        resolved.zaloGroups = audience.groupIds;
      }
    }
  }

  return {
    ok: errors.length === 0,
    resolved,
    errors,
  };
}

export default {
  resolveCampaignResources,
};
