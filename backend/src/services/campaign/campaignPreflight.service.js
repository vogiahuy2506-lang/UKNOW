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
import campaignChannelRegistry from './campaignChannelRegistry.service.js';
import { validateChannelSteps } from '../../utils/channelSteps.util.js';
import { assertChannelEntitled } from './channelEntitlement.service.js';
import { resolveZaloAccountEntries } from '../../utils/campaignZaloAccountResolve.util.js';
import { assertRunZaloAccountsAssigned } from './campaignZaloAccess.service.js';
import { assertRunChannelAccountsAssigned } from './campaignChannelAccess.service.js';

// PR-1 (tách tầng kênh gửi) — nguồn kênh gửi đọc từ registry thay vì ghi cứng. `send_zalo` (chuỗi
// cũ) đã BỎ: 0 node trên production, engine không còn xử lý (xem fallback bên dưới ~dòng 177 và
// mục 1 plan) — giữ trong tập này chỉ khiến preflight tưởng nhầm là node gửi hợp lệ.
export const SEND_NODE_SUBTYPES = new Set(campaignChannelRegistry.getSendNodeSubtypes());

/**
 * Validates campaign readiness before run execution.
 *
 * @param {object} params
 * @param {number|string} params.campaignId
 * @param {number|string} [params.workspaceOwnerId]
 * @param {Function} [params.sheetCheckFn] - Optional override for unit tests
 * @param {Function} [params.resourceIsLockedFn] - Optional override for unit tests
 * @param {Function} [params.assertChannelEntitledFn] - Optional override for unit tests
 * @param {Array<number|string|null>} [params.actorUserIds] - Người liên quan tới lượt chạy (người tạo chiến dịch, người bấm
 *   chạy / tạo lịch). Có nhân viên trong đó thì MỌI tài khoản Zalo của chiến dịch phải được giao cho nhân viên đó, không thì
 *   ném 403 ZALO_ACCOUNT_NOT_ASSIGNED (PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3). Chủ tạo + chủ chạy → không lọc.
 *   Engine kiểm lại ở đầu mỗi chu kỳ chạy nên bỏ trống ở đây không mở lối gửi — chỉ mất lời báo sớm.
 * @param {Function} [params.assertZaloAccountsAssignedFn] - Optional override for unit tests
 * @param {Function} [params.assertChannelAccountsAssignedFn] - Optional override for unit tests. PLAN_GIAO_TK_TG_WA PR-H2: cùng
 *   khuôn `actorUserIds` ở trên cho node Telegram / WhatsApp — nhân viên có trong đó mà chưa được giao tài khoản của node →
 *   ném 403 CHANNEL_ACCOUNT_NOT_ASSIGNED TRƯỚC kiểm kết nối (lời báo đúng là "chưa được giao", không phải "mất kết nối").
 * @returns {Promise<{ valid: true, nodes: Array }>}
 */
export async function validateCampaignPreflight({
  campaignId,
  workspaceOwnerId = null,
  actorUserIds = [],
  sheetCheckFn = checkSheetForChannel,
  resourceIsLockedFn = resourceIsLocked,
  assertChannelEntitledFn = assertChannelEntitled,
  assertZaloAccountsAssignedFn = assertRunZaloAccountsAssigned,
  assertChannelAccountsAssignedFn = assertRunChannelAccountsAssigned,
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

  // 1b. PR-1 (tách tầng kênh gửi) — cầu dao: node "có ý gửi" (registry biết, hoặc bắt đầu bằng
  // send_) mà registry KHÔNG biết cách xử lý → chặn ngay ở preflight thay vì để engine chạy xong
  // và báo "thành công" trong khi không gửi được gì (bẫy chí mạng 1, mục 1 plan).
  const unsupportedSendNode = nodes.find((node) => {
    const subtype = String(node.node_subtype || '').trim();
    return campaignChannelRegistry.isSendIntentSubtype(subtype) && !campaignChannelRegistry.isKnownSendSubtype(subtype);
  });
  if (unsupportedSendNode) {
    const subtype = String(unsupportedSendNode.node_subtype || '').trim();
    const error = new Error(`Loại node gửi "${subtype}" chưa được hỗ trợ (node ${unsupportedSendNode.id}).`);
    error.code = 'UNSUPPORTED_SEND_NODE';
    error.statusCode = 400;
    throw error;
  }

  // 1c. PR-3 (tách tầng kênh gửi) — node kênh 'adapter' (Telegram/WhatsApp từ PR-6+, mock ở test)
  // phải qua checkReadiness ở preflight, cùng tinh thần kiểm kết nối Zalo ở mục 2 dưới đây: phát
  // hiện thiếu cấu hình/tài khoản mất kết nối TRƯỚC khi chạy, không để tới lúc engine gửi mới lộ.
  if (Array.isArray(actorUserIds) && actorUserIds.length > 0
    && nodes.some((node) => campaignChannelRegistry.getAdapterDescriptorBySubtype(String(node.node_subtype || '').trim()))) {
    await assertChannelAccountsAssignedFn({ ownerId: workspaceOwnerId, actorUserIds, nodes });
  }
  for (const node of nodes) {
    const subtype = String(node.node_subtype || '').trim();
    const adapterDescriptor = campaignChannelRegistry.getAdapterDescriptorBySubtype(subtype);
    if (!adapterDescriptor) continue;
    // P7 — tối đa 5 bước, độ trễ giữa các bước >= 0 (chặn cả cấu hình nhập bằng API/trợ lý AI, không chỉ FE).
    const stepsProblem = validateChannelSteps(node?.config?.steps);
    if (stepsProblem) {
      const error = new Error(`${stepsProblem.message} (node ${node.id})`);
      error.code = stepsProblem.code;
      error.statusCode = 400;
      throw error;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await adapterDescriptor.adapter.checkReadiness({ userId: workspaceOwnerId, node });
    } catch (readinessError) {
      const error = new Error(
        readinessError?.message
          || `Kênh "${adapterDescriptor.key}" chưa sẵn sàng gửi (node ${node.id}).`
      );
      error.code = readinessError?.code || 'CHANNEL_NOT_READY';
      error.statusCode = 400;
      throw error;
    }
  }

  // 1d. P12 (PLAN_TG_WA_DAY_DU mục 19) — chiến dịch có node Zalo cá nhân/nhóm/kết bạn/chọn tài khoản mà gói của chủ
  // workspace không có kênh Zalo (trần tài khoản = 0) -> 403 CHANNEL_NOT_IN_PLAN rõ ràng, TRƯỚC khi báo "tài khoản
  // ngắt kết nối". Cùng cổng với Telegram/WhatsApp (`checkReadiness` của adapter). Chiến dịch cũ còn node Zalo cũng bị chặn ở đây.
  const hasZaloNode = nodes.some((node) => {
    const subtype = String(node.node_subtype || '').trim();
    return subtype.startsWith('send_zalo') || subtype === 'select_zalo_account';
  });
  if (hasZaloNode) {
    const ownerIdForEntitlement = parseInt(workspaceOwnerId, 10);
    if (Number.isFinite(ownerIdForEntitlement) && ownerIdForEntitlement > 0) {
      await assertChannelEntitledFn({ channel: 'zalo', ownerUserId: ownerIdForEntitlement });
    }
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
  // PR-9 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) Việc 2 — mỗi phần tử là danh sách id của MỘT
  // node pool/nhiều tài khoản; node đó ĐẠT nếu ÍT NHẤT MỘT id trong danh sách đạt tiêu chí (giống
  // engine sau PR-9 Việc 1 thử từng id theo thứ tự). KHÔNG dồn cả danh sách vào `zaloAccountIds`
  // (set đó đòi MỌI id đều đạt — dồn vào sẽ chặn nhầm pool còn sống, lỗi này PR-4 từng sửa cho
  // trường hợp id đơn lẻ).
  const zaloAccountIdGroups = [];
  let hasZaloSendNode = false;
  let hasEmailSendNode = false;

  // Luật "node nào dùng tài khoản Zalo nào" nằm ở utils/campaignZaloAccountResolve.util.js — DÙNG CHUNG với
  // bộ ước tính thời gian chiến dịch (PLAN_UOC_TINH_THOI_GIAN 3.2); đừng chép lại ở đây.
  const addZaloAccountId = (rawId) => {
    const parsedId = parseInt(rawId, 10);
    if (Number.isFinite(parsedId) && parsedId > 0) {
      zaloAccountIds.add(parsedId);
    }
  };

  // PR-9 Việc 2 — id đơn lẻ vẫn theo luật cũ (addZaloAccountId, phải đạt); pool/nhiều tài khoản
  // đi qua đây (đạt nếu ít nhất một id đạt).
  const addZaloAccountIdGroup = (rawIds) => {
    const parsedIds = (Array.isArray(rawIds) ? rawIds : [])
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isFinite(id) && id > 0);
    zaloAccountIdGroups.push(parsedIds);
  };

  for (const node of nodes) {
    const subtype = String(node.node_subtype || '').trim();
    if (subtype.startsWith('send_zalo') || subtype === 'send_zalo') {
      hasZaloSendNode = true;
    }
    if (subtype === 'send_email') {
      hasEmailSendNode = true;
    }
  }

  for (const entry of resolveZaloAccountEntries(nodes)) {
    if (entry.kind === 'group') {
      addZaloAccountIdGroup(entry.ids);
    } else {
      entry.ids.forEach(addZaloAccountId);
    }
  }

  const allGroupIds = zaloAccountIdGroups.flat();
  if (zaloAccountIds.size > 0 || allGroupIds.length > 0) {
    const parsedWorkspaceOwnerId = parseInt(workspaceOwnerId, 10);
    if (!Number.isFinite(parsedWorkspaceOwnerId) || parsedWorkspaceOwnerId <= 0) {
      const error = new Error('Không xác định được chủ tài khoản sở hữu chiến dịch để kiểm tra tài khoản Zalo.');
      error.code = 'WORKSPACE_CONTEXT_REQUIRED';
      error.statusCode = 500;
      throw error;
    }

    // PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3 — TRƯỚC kiểm kết nối: nhân viên chưa được giao tài khoản thì lời báo
    // đúng là "chưa được giao", không phải "mất kết nối". Mọi id (kể cả từng id trong pool) đều phải được giao — pool không
    // âm thầm co lại còn các tài khoản được giao.
    if (Array.isArray(actorUserIds) && actorUserIds.length > 0) {
      await assertZaloAccountsAssignedFn({
        ownerId: parsedWorkspaceOwnerId,
        actorUserIds,
        accountIds: [...zaloAccountIds, ...allGroupIds],
      });
    }

    const ids = Array.from(zaloAccountIds);
    // PR-9 — MỘT truy vấn cho cả id đơn lẻ lẫn mọi id trong các pool/nhóm, tránh N+1.
    const combinedIds = Array.from(new Set([...ids, ...allGroupIds]));
    const { rows: accounts } = await db.query(
      `SELECT id, is_active, status
       FROM zalo_settings
       WHERE id = ANY($1::int[]) AND id_user = $2`,
      [combinedIds, parsedWorkspaceOwnerId]
    );

    const accountMap = new Map(accounts.map((a) => [Number(a.id), a]));
    const isUsable = async (accId) => {
      const acc = accountMap.get(accId);
      return Boolean(
        acc
        && acc.is_active !== false
        && acc.status === 'connected'
        && !(await resourceIsLockedFn('zalo_accounts', accId))
      );
    };

    const senderDisconnectedError = () => {
      const error = new Error(
        'Tài khoản Zalo gửi tin đã bị ngắt kết nối hoặc không khả dụng. Vui lòng kết nối lại tài khoản trước khi chạy.'
      );
      error.code = 'SENDER_DISCONNECTED';
      error.statusCode = 400;
      return error;
    };

    // Id đơn lẻ: giữ nguyên luật cũ — MỖI id phải đạt.
    for (const accId of ids) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await isUsable(accId))) {
        throw senderDisconnectedError();
      }
    }

    // Pool/nhiều tài khoản: mỗi nhóm ĐẠT nếu ÍT NHẤT MỘT id trong nhóm đạt.
    for (const group of zaloAccountIdGroups) {
      let anyUsable = false;
      for (const accId of group) {
        // eslint-disable-next-line no-await-in-loop
        if (await isUsable(accId)) {
          anyUsable = true;
          break;
        }
      }
      if (!anyUsable) {
        throw senderDisconnectedError();
      }
    }
  }

  if (hasZaloSendNode && zaloAccountIds.size === 0 && zaloAccountIdGroups.length === 0) {
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
