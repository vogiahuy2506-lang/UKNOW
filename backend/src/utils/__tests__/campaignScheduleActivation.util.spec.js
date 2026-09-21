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

  it('câu thông báo nói đúng trạng thái và đúng việc phải làm (nguyên văn lệnh giao 21/09)', () => {
    expect(buildCampaignNotActiveMessage('draft')).toBe(
      'Chiến dịch đang ở trạng thái Nháp nên lịch sẽ không chạy. Bấm «Chạy ngay» một lần để kích hoạt chiến dịch, rồi đặt lịch lại.',
    );
    expect(buildCampaignNotActiveMessage('paused')).toContain('trạng thái Tạm dừng');
    expect(buildCampaignNotActiveMessage('archived')).toContain('trạng thái archived');
  });

  it('mã lỗi ổn định cho frontend', () => {
    expect(CAMPAIGN_NOT_ACTIVE_CODE).toBe('CAMPAIGN_NOT_ACTIVE');
  });
});
