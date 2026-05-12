import { describe, it, expect } from 'vitest';
import { getCampaignTypeMeta } from '../campaignTypeDisplay';

describe('getCampaignTypeMeta', () => {
  it('email → label "Email" + class xanh', () => {
    const meta = getCampaignTypeMeta('email');
    expect(meta.label).toBe('Email');
    expect(meta.className).toContain('bg-blue-100');
  });

  it('zalo → label "Zalo cá nhân" + class emerald', () => {
    const meta = getCampaignTypeMeta('zalo');
    expect(meta.label).toBe('Zalo cá nhân');
    expect(meta.className).toContain('bg-emerald-100');
  });

  it('zalo_group → label "Zalo nhóm" + class violet', () => {
    const meta = getCampaignTypeMeta('zalo_group');
    expect(meta.label).toBe('Zalo nhóm');
    expect(meta.className).toContain('bg-violet-100');
  });

  it('chuẩn hoá whitespace + case', () => {
    expect(getCampaignTypeMeta('  EMAIL  ').label).toBe('Email');
    expect(getCampaignTypeMeta('Zalo_Group').label).toBe('Zalo nhóm');
  });

  it('unknown type → fallback label trả về nguyên giá trị + class gray', () => {
    const meta = getCampaignTypeMeta('sms');
    expect(meta.label).toBe('sms');
    expect(meta.className).toContain('bg-gray-100');
  });

  it('null/undefined/empty → label "--" + class gray', () => {
    expect(getCampaignTypeMeta(null).label).toBe('--');
    expect(getCampaignTypeMeta(undefined).label).toBe('--');
    expect(getCampaignTypeMeta('').label).toBe('--');
    expect(getCampaignTypeMeta('').className).toContain('bg-gray-100');
  });
});
