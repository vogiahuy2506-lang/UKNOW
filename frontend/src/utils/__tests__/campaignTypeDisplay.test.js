import { describe, it, expect } from 'vitest';
import { getCampaignTypeMeta } from '../campaignTypeDisplay';

describe('getCampaignTypeMeta', () => {
  it('trả về meta đúng cho email', () => {
    const meta = getCampaignTypeMeta('email');
    expect(meta.label).toBe('Email');
    expect(meta.className).toContain('blue');
  });

  it('trả về meta đúng cho zalo', () => {
    const meta = getCampaignTypeMeta('zalo');
    expect(meta.label).toBe('Zalo cá nhân');
    expect(meta.className).toContain('emerald');
  });

  it('trả về meta đúng cho zalo_group', () => {
    const meta = getCampaignTypeMeta('zalo_group');
    expect(meta.label).toBe('Zalo nhóm');
    expect(meta.className).toContain('violet');
  });

  it('không phân biệt hoa thường', () => {
    expect(getCampaignTypeMeta('EMAIL').label).toBe('Email');
    expect(getCampaignTypeMeta('ZALO').label).toBe('Zalo cá nhân');
  });

  it('trả về fallback cho loại không xác định', () => {
    const meta = getCampaignTypeMeta('sms');
    expect(meta.label).toBe('sms');
    expect(meta.className).toContain('gray');
  });

  it('trả về "--" khi giá trị null hoặc undefined', () => {
    expect(getCampaignTypeMeta(null).label).toBe('--');
    expect(getCampaignTypeMeta(undefined).label).toBe('--');
  });
});
