import { describe, it, expect } from 'vitest';
import {
  formatCampaignDateTime,
  formatCampaignTime,
  getTodayDateInHanoiForInput,
} from '../campaignDateTime.helpers';

describe('formatCampaignDateTime', () => {
  it('null/undefined/empty → fallback', () => {
    expect(formatCampaignDateTime(null)).toBe('-');
    expect(formatCampaignDateTime(undefined)).toBe('-');
    expect(formatCampaignDateTime('')).toBe('-');
    expect(formatCampaignDateTime('   ')).toBe('-');
  });

  it('fallback tùy chỉnh', () => {
    expect(formatCampaignDateTime(null, 'N/A')).toBe('N/A');
    expect(formatCampaignDateTime('not-a-date', 'invalid')).toBe('invalid');
  });

  it('chuỗi không kèm múi giờ (wall-clock) — giữ số giờ phút', () => {
    const result = formatCampaignDateTime('2026-03-15 09:30:00');
    expect(result).toMatch(/15\/0?3\/2026/);
    expect(result).toContain('09:30');
  });

  it('chuỗi ISO format YYYY-MM-DDTHH:mm — parse wall-clock', () => {
    const result = formatCampaignDateTime('2026-03-15T09:30:00');
    expect(result).toMatch(/15\/0?3\/2026/);
    expect(result).toContain('09:30');
  });

  it('Date object hợp lệ', () => {
    const date = new Date(2026, 2, 15, 9, 30, 0);
    const result = formatCampaignDateTime(date);
    expect(result).toMatch(/15\/0?3\/2026/);
    expect(result).toContain('09:30');
  });

  it('Date invalid → fallback', () => {
    expect(formatCampaignDateTime(new Date('not-a-date'))).toBe('-');
  });

  it('chuỗi với Z (UTC) — convert sang Asia/Ho_Chi_Minh (+7)', () => {
    const result = formatCampaignDateTime('2026-03-15T02:00:00Z');
    expect(result).toMatch(/15\/0?3\/2026/);
    expect(result).toContain('09:00');
  });
});

describe('formatCampaignTime', () => {
  it('null → fallback', () => {
    expect(formatCampaignTime(null)).toBe('-');
    expect(formatCampaignTime(undefined, '—')).toBe('—');
  });

  it('parse wall-clock, format time only theo vi-VN', () => {
    const result = formatCampaignTime('2026-03-15 14:25:30');
    expect(result).toContain('14:25');
  });
});

describe('getTodayDateInHanoiForInput', () => {
  it('trả chuỗi YYYY-MM-DD hợp lệ', () => {
    const out = getTodayDateInHanoiForInput();
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
