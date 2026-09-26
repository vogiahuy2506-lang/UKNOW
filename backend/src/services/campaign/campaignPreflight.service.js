/**
 * Campaign Preflight Validation Service
 *
 * Preflight checks executed right before creating run records and running a campaign.
 * Guards against running campaigns with disconnected senders, inaccessible/invalid sheets,
 * or missing send nodes.
 */

import db from '../../config/database.js';
import { checkSheetForChannel } from '../ai/sheetRecipientCheck.service.js';
import { MAX_SHEET_RECIPIENTS } from '../../utils/manualRecipients.util.js';
import { resourceIsLocked } from '../../utils/topupLockGate.util.js';

export const SEND_NODE_SUBTYPES = new Set([
  'send_email',
  'send_zalo',
  'send_zalo_personal',
  'send_zalo_group',
  'send_zalo_friend_request',
]);

/**
 * Validates campaign readiness before run execution.
 *
 * @param {object} params
 * @param {number|string} params.campaignId
 * @param {number|string} [params.workspaceOwnerId]
 * @param {Function} [params.sheetCheckFn] - Optional override for unit tests
 * @param {Function} [params.resourceIsLockedFn] - Optional override for unit tests
 * @returns {Promise<{ valid: true, nodes: Array }>}
 */
export async function validateCampaignPreflight({
  campaignId,
  workspaceOwnerId = null,
  sheetCheckFn = checkSheetForChannel,
  resourceIsLockedFn = resourceIsLocked,
}) {
  const parsedCampaignId = parseInt(campaignId, 10);
  if (!Number.isFinite(parsedCampaignId)) {
    const error = new Error('ID chiến dịch không hợp lệ');
    error.code = 'INVALID_CAMPAIGN_ID';
    error.statusCode = 400;
    throw error;
  }

  const { rows: nodes } = await db.query(
    `SELECT id, node_type, node_subtype, config FROM campaign_nodes WHERE id_campaign = $1`,
    [parsedCampaignId]
  );

  // 1. Kiểm tra NO_SEND_NODE: phải có ít nhất 1 node gửi tin nhắn
  const hasSendNode = nodes.some((node) => {
    const subtype = String(node.node_subtype || '').trim();
    return SEND_NODE_SUBTYPES.has(subtype) || (node.node_type === 'action' && subtype.startsWith('send_'));
  });

  if (!hasSendNode) {
    const error = new Error('Chiến dịch không có node gửi tin nhắn nào.');
    error.code = 'NO_SEND_NODE';
    error.statusCode = 400;
    throw error;
  }

  // 2. Xác định các tài khoản Zalo được dùng và kiểm tra kết nối (SENDER_DISCONNECTED)
  //
  // PR-4 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) Việc 2 — trước đây kiểm `config.zaloAccountId ??
  // config.accountId` cho MỌI node select_zalo_account/send_zalo*, bất kể đó có phải id engine
  // THẬT SỰ sẽ dùng hay không (prod: 25 chiến dịch pool còn `zaloAccountId` sót lại từ trước khi
  // bật pool — kiểm nhầm id không dùng). Đổi sang mô phỏng đúng thứ tự ưu tiên engine dùng khi
  // giải id cho từng node (xem campaignRun.service.js `_doExecuteCampaign`, các nhánh
  // `nodeSubtype === '...'`).
  const zaloAccountIds = new Set();
  let hasZaloSendNode = false;
  let hasEmailSendNode = false;

  const hasSelectZaloAccountNode = nodes.some(
    (node) => String(node.node_subtype || '').trim() === 'select_zalo_account'
  );

  // campaignRun.service.js:2950 `isTruthyConfigFlag` là closure cục bộ trong `_doExecuteCampaign`
  // (~7.300 dòng), không export được — chép lại đúng luật ở đây (tránh lỗi `Boolean("false") === true`
  // khi giá trị lưu dạng chuỗi không chuẩn).
  const isTruthyConfigFlag = (cfg, key) => {
    if (!cfg || typeof cfg !== 'object') return false;
    const v = cfg[key];
    if (v === true || v === 1) return true;
    if (v === false || v === 0 || v == null) return false;
    const s = String(v).trim().toLowerCase();
    return s === 'true' || s === '1';
  };

  const uniqueNonEmptyIds = (arr) => [...new Set(
    (Array.isArray(arr) ? arr : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )];

  const addZaloAccountId = (rawId) => {
    const parsedId = parseInt(rawId, 10);
    if (Number.isFinite(parsedId) && parsedId > 0) {
      zaloAccountIds.add(parsedId);
    }
  };

  for (const node of nodes) {
    const subtype = String(node.node_subtype || '').trim();
    const config = node.config || {};

    if (subtype.startsWith('send_zalo') || subtype === 'send_zalo') {
      hasZaloSendNode = true;
    }
    if (subtype === 'send_email') {
      hasEmailSendNode = true;
    }

    // select_zalo_account (R:3450) — pool bật + có id: dùng poolIds[0] (id engine sẽ giải),
    // bỏ qua zaloAccountId còn sót trên node.
    if (subtype === 'select_zalo_account') {
      const poolEnabled = isTruthyConfigFlag(config, 'zaloPoolMultiAccountEnabled');
      const poolIds = uniqueNonEmptyIds(config.zaloPoolAccountIds);
      addZaloAccountId(poolEnabled && poolIds.length > 0 ? poolIds[0] : config.zaloAccountId);
      continue;
    }

    // send_zalo_personal / send_zalo_friend_request / send_zalo_group / get_all_friends /
    // get_all_groups đều ưu tiên `selectedZaloAccount` của node select_zalo_account đứng trước
    // (R:4685, 6651, 7557, 4519, 4617) — khi flow CÓ node đó, id riêng của các node dưới đây
    // không phải id engine dùng, đã được kiểm ở nhánh select_zalo_account phía trên.
    if (subtype === 'send_zalo_personal') {
      if (!hasSelectZaloAccountNode) {
        const multiIds = uniqueNonEmptyIds(config.zaloPersonalAccountIds);
        const multiEnabled = multiIds.length > 0 && isTruthyConfigFlag(config, 'zaloPersonalMultiAccountEnabled');
        addZaloAccountId(multiEnabled ? multiIds[0] : config.zaloAccountId);
      }
      continue;
    }

    if (subtype === 'send_zalo_friend_request') {
      if (!hasSelectZaloAccountNode) {
        const multiIds = uniqueNonEmptyIds(config.zaloFriendAccountIds);
        const multiEnabled = multiIds.length > 0 && isTruthyConfigFlag(config, 'zaloFriendMultiAccountEnabled');
        addZaloAccountId(multiEnabled ? multiIds[0] : config.zaloAccountId);
      }
      continue;
    }

    if (subtype === 'send_zalo_group') {
      if (!hasSelectZaloAccountNode) {
        addZaloAccountId(config.zaloAccountId);
      }
      continue;
    }

    // get_all_friends/get_all_groups (R:4485/4605): nguồn tài khoản riêng qua
    // zaloFriendAccountNodeId/zaloGroupAccountNodeId trỏ tới output của một node khác (thường là
    // select_zalo_account) — không thể giải tĩnh nội dung node đó sẽ xuất ra lúc chạy, nên bỏ qua
    // (nếu đúng flow, id thật đã được kiểm ở nhánh select_zalo_account).
    if (subtype === 'get_all_friends') {
      const accountSourceNodeId = String(config.zaloFriendAccountNodeId || '').trim();
      if (!accountSourceNodeId && !hasSelectZaloAccountNode) {
        addZaloAccountId(config.zaloAccountId);
      }
      continue;
    }

    if (subtype === 'get_all_groups') {
      const accountSourceNodeId = String(config.zaloGroupAccountNodeId || '').trim();
      if (!accountSourceNodeId && !hasSelectZaloAccountNode) {
        addZaloAccountId(config.zaloAccountId);
      }
      continue;
    }

    // Fallback: subtype zalo khác chưa được mô hình hoá riêng ở trên (vd `send_zalo` cũ, không
    // còn được _doExecuteCampaign xử lý nhưng có thể còn tồn tại trên dữ liệu cũ) — giữ hành vi
    // gom id như trước đây để không bỏ lọt kiểm tra.
    if (subtype.startsWith('send_zalo') || subtype === 'send_zalo') {
      addZaloAccountId(config.zaloAccountId ?? config.accountId);
    }
  }

  if (zaloAccountIds.size > 0) {
    const parsedWorkspaceOwnerId = parseInt(workspaceOwnerId, 10);
    if (!Number.isFinite(parsedWorkspaceOwnerId) || parsedWorkspaceOwnerId <= 0) {
      const error = new Error('Không xác định được chủ tài khoản sở hữu chiến dịch để kiểm tra tài khoản Zalo.');
      error.code = 'WORKSPACE_CONTEXT_REQUIRED';
      error.statusCode = 500;
      throw error;
    }

    const ids = Array.from(zaloAccountIds);
    const { rows: accounts } = await db.query(
      `SELECT id, is_active, status
       FROM zalo_settings
       WHERE id = ANY($1::int[]) AND id_user = $2`,
      [ids, parsedWorkspaceOwnerId]
    );

    const accountMap = new Map(accounts.map((a) => [Number(a.id), a]));
    for (const accId of ids) {
      const acc = accountMap.get(accId);
      if (
        !acc
        || acc.is_active === false
        || acc.status !== 'connected'
        || await resourceIsLockedFn('zalo_accounts', accId)
      ) {
        const error = new Error(
          'Tài khoản Zalo gửi tin đã bị ngắt kết nối hoặc không khả dụng. Vui lòng kết nối lại tài khoản trước khi chạy.'
        );
        error.code = 'SENDER_DISCONNECTED';
        error.statusCode = 400;
        throw error;
      }
    }
  }

  if (hasZaloSendNode && zaloAccountIds.size === 0) {
    const error = new Error(
      'Chưa chọn tài khoản Zalo gửi tin hoặc tài khoản đã không còn khả dụng. Vui lòng chọn và kết nối lại tài khoản trước khi chạy.'
    );
    error.code = 'SENDER_DISCONNECTED';
    error.statusCode = 400;
    throw error;
  }

  // 3. Kiểm tra các node đọc Google Sheet
  const requiredChannels = [
    ...(hasEmailSendNode ? ['email'] : []),
    ...(hasZaloSendNode ? ['zalo'] : []),
  ];

  for (const node of nodes) {
    const subtype = String(node.node_subtype || '').trim();
    if (subtype === 'read_sheet' || subtype === 'google_sheet') {
      const sheetUrl = String(node.config?.sheetUrl || '').trim();
      if (sheetUrl) {
        for (const targetChannel of requiredChannels) {
          const sheetResult = await sheetCheckFn(sheetUrl, targetChannel);

          if (sheetResult.status === 'not_public') {
            const error = new Error(
              'Google Sheet chưa được mở quyền truy cập công khai ("Bất kỳ ai có đường liên kết").'
            );
            error.code = 'SHEET_NOT_ACCESSIBLE';
            error.statusCode = 400;
            throw error;
          }

          if (sheetResult.status === 'invalid_url') {
            const error = new Error('Đường dẫn Google Sheet không hợp lệ.');
            error.code = 'SHEET_NOT_ACCESSIBLE';
            error.statusCode = 400;
            throw error;
          }

          if (sheetResult.status === 'wrong_channel') {
            const msg =
              targetChannel === 'zalo'
                ? 'Google Sheet có email nhưng thiếu cột số điện thoại (bắt buộc đối với kênh Zalo).'
                : 'Google Sheet có số điện thoại nhưng thiếu cột email (bắt buộc đối với kênh Email).';
            const error = new Error(msg);
            error.code = 'RECIPIENT_COLUMN_MISSING';
            error.statusCode = 400;
            throw error;
          }

          if (sheetResult.status === 'no_contact') {
            const error = new Error(
              'Google Sheet không có địa chỉ email hoặc số điện thoại hợp lệ nào.'
            );
            error.code = 'ZERO_VALID_RECIPIENTS';
            error.statusCode = 400;
            throw error;
          }

          if (sheetResult.status === 'too_many') {
            const limit = sheetResult.limit || MAX_SHEET_RECIPIENTS;
            const total = sheetResult.totalCount || 0;
            const error = new Error(
              `Google Sheet có ${total.toLocaleString('vi-VN')} người nhận, vượt quá giới hạn tối đa ${limit.toLocaleString('vi-VN')} người mỗi chiến dịch.`
            );
            error.code = 'RECIPIENTS_LIMIT_EXCEEDED';
            error.statusCode = 400;
            throw error;
          }

          if (sheetResult.status === 'unknown') {
            console.warn(
              '[CampaignPreflight] Google Sheet check returned unknown (transient error), allowing campaign run:',
              sheetResult.error || 'Network error'
            );
          }
        }
      }
    }
  }

  return { valid: true, nodes };
}
