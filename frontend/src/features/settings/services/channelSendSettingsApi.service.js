import api from '../../../services/api';

/**
 * PLAN_TG_WA_DAY_DU_2026-09-29 P4 — trần gửi/ngày + tốc độ gửi theo tài khoản Telegram/WhatsApp.
 * `accountRef`: Telegram = id tài khoản; WhatsApp = sessionKey.
 * Body PATCH: `sendSpeed` ('safe' | 'fast' | 'very_fast') và/hoặc `userDailySendLimit` (số nguyên hoặc `null` để bỏ giới
 * hạn). Trường vắng = giữ nguyên; body rỗng bị backend chặn 400.
 */
const channelSendSettingsApiService = {
  get(channel, accountRef) {
    return api.get(`/campaigns/channels/${channel}/accounts/${encodeURIComponent(accountRef)}/send-settings`);
  },

  update(channel, accountRef, body) {
    return api.patch(`/campaigns/channels/${channel}/accounts/${encodeURIComponent(accountRef)}/send-settings`, body);
  },
};

export default channelSendSettingsApiService;
