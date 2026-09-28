import { describe, it, expect } from 'vitest';
import { isPlaceholderPlan } from '../placeholderPlan.util.js';

describe('isPlaceholderPlan', () => {
  it('code custom, isCustom=false → true', () => {
    expect(isPlaceholderPlan({ code: 'custom', isCustom: false })).toBe(true);
  });

  it('code CUSTOM viết hoa → true', () => {
    expect(isPlaceholderPlan({ code: 'CUSTOM', isCustom: false })).toBe(true);
  });

  it('code contact, isCustom=false → true', () => {
    expect(isPlaceholderPlan({ code: 'contact', isCustom: false })).toBe(true);
  });

  it('code custom NHƯNG isCustom=true (gói custom thật) → false', () => {
    expect(isPlaceholderPlan({ code: 'custom', isCustom: true })).toBe(false);
  });

  it('code khác (pro) → false', () => {
    expect(isPlaceholderPlan({ code: 'pro', isCustom: false })).toBe(false);
  });

  it('không truyền gì → false', () => {
    expect(isPlaceholderPlan()).toBe(false);
  });
});
