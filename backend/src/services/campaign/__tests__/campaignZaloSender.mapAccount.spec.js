/**
 * PLAN_GIOI_HAN_GUI_THEO_NGAY_2026-09-22, Việc 4 — mapCampaignZaloAccount() phải map
 * `zalo_settings.user_daily_send_limit` sang `userDailySendLimit` trên account model, cùng khuôn
 * với 3 field zalo_personal_outbound_* đã có (undefined nếu NULL/không hợp lệ, không tự bịa 0).
 */
import { describe, expect, it } from '@jest/globals';
import campaignZaloSenderService from '../campaignZaloSender.service.js';

const BASE_ROW = {
  id: 42,
  id_user: 7,
  display_name: 'Nick chính',
  status: 'connected',
  is_active: true,
  is_default: false,
};

describe('mapCampaignZaloAccount — userDailySendLimit', () => {
  it('user_daily_send_limit là số dương → có mặt trên model, đúng kiểu number', () => {
    const model = campaignZaloSenderService.mapCampaignZaloAccount({ ...BASE_ROW, user_daily_send_limit: 100 });
    expect(model.userDailySendLimit).toBe(100);
  });

  it('user_daily_send_limit là NULL (mặc định, chưa ai đặt) → field vắng mặt, không phải 0/null', () => {
    const model = campaignZaloSenderService.mapCampaignZaloAccount({ ...BASE_ROW, user_daily_send_limit: null });
    expect(model).not.toHaveProperty('userDailySendLimit');
    expect(model.userDailySendLimit).toBeUndefined();
  });

  it('cột không có trong row (SELECT cũ, trước migration 236) → field vắng mặt, không throw', () => {
    expect(() => campaignZaloSenderService.mapCampaignZaloAccount({ ...BASE_ROW })).not.toThrow();
    const model = campaignZaloSenderService.mapCampaignZaloAccount({ ...BASE_ROW });
    expect(model.userDailySendLimit).toBeUndefined();
  });

  it('user_daily_send_limit = 0 → coi như KHÔNG hợp lệ (giống quy tắc của 3 field zalo_personal_outbound_*), field vắng mặt', () => {
    const model = campaignZaloSenderService.mapCampaignZaloAccount({ ...BASE_ROW, user_daily_send_limit: 0 });
    expect(model.userDailySendLimit).toBeUndefined();
  });

  it('không ảnh hưởng tới 3 field giờ đã có — vẫn map đúng như trước', () => {
    const model = campaignZaloSenderService.mapCampaignZaloAccount({
      ...BASE_ROW,
      zalo_personal_outbound_per_hour_limit: 30,
      zalo_personal_outbound_delay_min_ms: 80000,
      zalo_personal_outbound_delay_max_ms: 150000,
      user_daily_send_limit: 200,
    });
    expect(model).toMatchObject({
      id: '42',
      userId: 7,
      displayName: 'Nick chính',
      zaloPersonalOutboundPerHourLimit: 30,
      zaloPersonalOutboundDelayMinMs: 80000,
      zaloPersonalOutboundDelayMaxMs: 150000,
      userDailySendLimit: 200,
    });
  });
});
