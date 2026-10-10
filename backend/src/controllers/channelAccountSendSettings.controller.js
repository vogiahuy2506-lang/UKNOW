import auditService, { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../services/audit.service.js';
import {
  getChannelAccountSendSettings,
  updateChannelAccountSendSettings,
} from '../services/campaign/channelAccountSendSettings.service.js';
import { getWorkspaceContext } from '../utils/workspaceContext.util.js';
import { accessChannelOfRoute, assertChannelAccountAccess } from '../services/user/memberChannelAccess.service.js';

/**
 * PLAN_GIAO_TK_TG_WA PR-H2 — nhân viên (có `chatbot_channels_manage`) chỉ xem / đổi cấu hình gửi của tài khoản ĐƯỢC GIAO
 * (403 CHANNEL_ACCOUNT_NOT_ASSIGNED). Kênh lạ → bỏ qua, service trả lỗi như cũ.
 */
async function assertAssignedSendSettingsAccount(req) {
  const accessChannel = accessChannelOfRoute(req.params.channel);
  if (accessChannel) {
    await assertChannelAccountAccess(getWorkspaceContext(req.user), accessChannel, req.params.accountRef);
  }
}

/**
 * PLAN_TG_WA_DAY_DU_2026-09-29 P4 — trần gửi/ngày + tốc độ gửi theo tài khoản Telegram/WhatsApp.
 * Route: `/api/campaigns/channels/:channel/accounts/:accountRef/send-settings` (campaign.routes.js).
 */
class ChannelAccountSendSettingsController {
  /**
   * GET — cấu hình hiện tại + `sentToday` + `warnThreshold` (Telegram 150/ngày, WhatsApp 100/ngày; chỉ cảnh báo).
   */
  async get(req, res) {
    try {
      await assertAssignedSendSettingsAccount(req);
      const { workspaceOwnerId } = getWorkspaceContext(req.user);
      const data = await getChannelAccountSendSettings({
        channel: req.params.channel,
        accountRef: req.params.accountRef,
        ownerUserId: workspaceOwnerId,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return this.handleError(res, error, 'Không thể lấy cấu hình gửi của tài khoản');
    }
  }

  /**
   * PATCH — body `{ sendSpeed?: 'safe'|'fast'|'very_fast', userDailySendLimit?: number|null }` (vắng = giữ nguyên).
   * Ghi audit CHANNEL_ACCOUNT_SEND_SETTINGS_UPDATED với giá trị cũ/mới.
   */
  async update(req, res) {
    try {
      await assertAssignedSendSettingsAccount(req);
      const { actorUserId, workspaceOwnerId } = getWorkspaceContext(req.user);
      const channel = req.params.channel;
      const result = await updateChannelAccountSendSettings({
        channel,
        accountRef: req.params.accountRef,
        ownerUserId: workspaceOwnerId,
        body: req.body || {},
      });

      await auditService.log({
        userId: actorUserId,
        ownerId: workspaceOwnerId,
        category: 'workspace',
        action: AUDIT_ACTIONS.CHANNEL_ACCOUNT_SEND_SETTINGS_UPDATED,
        entityType: channel === 'telegram' ? AUDIT_ENTITY_TYPES.TELEGRAM_ACCOUNT : AUDIT_ENTITY_TYPES.WHATSAPP_ACCOUNT,
        entityId: channel === 'telegram' ? Number(result.account.accountRef) : null,
        details: {
          channel,
          accountKey: result.account.accountKey,
          previous: result.previous,
          next: result.next,
        },
        ipAddress: req.ip,
        userAgent: req.get?.('user-agent') || null,
      });

      const data = await getChannelAccountSendSettings({
        channel,
        accountRef: req.params.accountRef,
        ownerUserId: workspaceOwnerId,
      });
      return res.json({ success: true, message: 'Đã cập nhật cấu hình gửi', data });
    } catch (error) {
      return this.handleError(res, error, 'Không thể cập nhật cấu hình gửi của tài khoản');
    }
  }

  handleError(res, error, fallbackMessage) {
    const status = error?.status || error?.statusCode;
    if (status && status < 600) {
      return res.status(status).json({ success: false, message: error.message, code: error.code });
    }
    console.error('[ChannelAccountSendSettings]', error);
    return res.status(500).json({ success: false, message: fallbackMessage });
  }
}

export default new ChannelAccountSendSettingsController();
