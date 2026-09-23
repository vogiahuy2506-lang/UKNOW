import { describe, expect, it } from '@jest/globals';
import {
  CAMPAIGN_NOT_ACTIVE_CODE,
  describeCampaignStatusVi,
  isCampaignActiveForSchedule,
  buildCampaignNotActiveMessage,
} from '../campaignScheduleActivation.util.js';

describe('campaignScheduleActivation.util', () => {
  it('chỉ `active` mới gửi được theo lịch', () => {
    expect(isCampaignActiveForSchedule('active')).toBe(true);
    for (const status of ['draft', 'paused', 'pending_owner_approval', 'completed', '', null, undefined, 'ACTIVE']) {
      expect(isCampaignActiveForSchedule(status)).toBe(false);
    }
  });

  it('nhãn: draft → Nháp, paused → Tạm dừng, trạng thái khác → giữ nguyên mã', () => {
    expect(describeCampaignStatusVi('draft')).toBe('Nháp');
    expect(describeCampaignStatusVi('paused')).toBe('Tạm dừng');
    expect(describeCampaignStatusVi('pending_owner_approval')).toBe('pending_owner_approval');
    expect(describeCampaignStatusVi(null)).toBe('');
  });

  it('câu thông báo nói đúng trạng thái và đúng việc phải làm (nguyên văn lệnh giao 23/09 — không còn xui bấm «Chạy ngay»)', () => {
    expect(buildCampaignNotActiveMessage('draft')).toBe(
      'Chiến dịch đang ở trạng thái Nháp nên lịch sẽ không chạy. Tick "Kích hoạt chiến dịch khi tạo lịch" để hệ thống bật chiến dịch mà không gửi tin nào ngay.',
    );
    expect(buildCampaignNotActiveMessage('draft')).not.toContain('Chạy ngay');
    expect(buildCampaignNotActiveMessage('paused')).toContain('trạng thái Tạm dừng');
    expect(buildCampaignNotActiveMessage('archived')).toContain('trạng thái archived');
  });

  it('mã lỗi ổn định cho frontend', () => {
    expect(CAMPAIGN_NOT_ACTIVE_CODE).toBe('CAMPAIGN_NOT_ACTIVE');
  });
});
