import { describe, it, expect } from 'vitest';
import {
  formatCampaignDateTimeShort,
  formatCampaignDateShort,
} from '../campaignDateTime.helpers';

// Ô "Cập nhật" của bảng Chiến dịch: bản vi-VN mặc định ra "11:16:03 29/9/2026" (có giây, ngày không
// đệm 0) nên hai ô ngày dính nhau ở ảnh production 10/10/2026. Bản gọn phải luôn HH:mm dd/MM/yyyy.
describe('formatCampaignDateTimeShort / formatCampaignDateShort', () => {
  it('HH:mm dd/MM/yyyy theo giờ Hà Nội, bỏ giây', () => {
    // 04:16:03 UTC = 11:16:03 Hà Nội
    expect(formatCampaignDateTimeShort('2026-09-29T04:16:03Z')).toBe('11:16 29/09/2026');
  });

  it('đệm số 0 cho ngày/tháng một chữ số', () => {
    expect(formatCampaignDateTimeShort('2026-03-05T02:07:00Z')).toBe('09:07 05/03/2026');
    expect(formatCampaignDateShort('2026-03-05T02:07:00Z')).toBe('05/03/2026');
  });

  it('nửa đêm hiện 00:00 (không phải 24:00) và sang ngày kế theo giờ Hà Nội', () => {
    // 17:00 UTC ngày 29 = 00:00 ngày 30 Hà Nội
    expect(formatCampaignDateTimeShort('2026-09-29T17:00:00Z')).toBe('00:00 30/09/2026');
    expect(formatCampaignDateShort('2026-09-29T17:00:00Z')).toBe('30/09/2026');
  });

  it('giá trị rỗng/không hợp lệ trả fallback', () => {
    expect(formatCampaignDateTimeShort(null)).toBe('-');
    expect(formatCampaignDateTimeShort('không phải ngày', '—')).toBe('—');
    expect(formatCampaignDateShort(undefined)).toBe('-');
    expect(formatCampaignDateShort('rác', '—')).toBe('—');
  });
});
