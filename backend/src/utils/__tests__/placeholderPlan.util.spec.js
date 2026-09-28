import { describe, it, expect } from '@jest/globals';
import { isPlaceholderPlan, PLACEHOLDER_PLAN_CODES } from '../placeholderPlan.util.js';

describe('isPlaceholderPlan', () => {
  it('code custom, is_custom=false → true', () => {
    expect(isPlaceholderPlan({ code: 'custom', is_custom: false })).toBe(true);
  });

  it('code CUSTOM viết hoa → true (không phân biệt hoa/thường)', () => {
    expect(isPlaceholderPlan({ code: 'CUSTOM', is_custom: false })).toBe(true);
  });

  it('code contact, is_custom=false → true', () => {
    expect(isPlaceholderPlan({ code: 'contact', is_custom: false })).toBe(true);
  });

  it('code custom NHƯNG is_custom=true (gói custom thật trùng code) → false', () => {
    expect(isPlaceholderPlan({ code: 'custom', is_custom: true })).toBe(false);
  });

  it('code contact nhưng is_custom=true → false', () => {
    expect(isPlaceholderPlan({ code: 'contact', is_custom: true })).toBe(false);
  });

  it('code khác (pro) → false dù is_custom=false', () => {
    expect(isPlaceholderPlan({ code: 'pro', is_custom: false })).toBe(false);
  });

  it('is_custom thiếu (undefined, như findPlanByCode trả về khi không map cột) → vẫn coi là giữ chỗ theo code', () => {
    expect(isPlaceholderPlan({ code: 'custom' })).toBe(true);
  });

  it('plan null/undefined → false', () => {
    expect(isPlaceholderPlan(null)).toBe(false);
    expect(isPlaceholderPlan(undefined)).toBe(false);
  });

  it('PLACEHOLDER_PLAN_CODES chỉ gồm đúng 2 mã custom/contact', () => {
    expect([...PLACEHOLDER_PLAN_CODES].sort()).toEqual(['contact', 'custom']);
  });
});
