import { describe, it, expect } from '@jest/globals';
import {
  clampModelToMax,
  listModelsUpToTier,
  getModelTierIndex,
} from '../aiModelTier.util.js';

describe('aiModelTier.util', () => {
  it('clampModelToMax hạ model cao hơn gói', () => {
    expect(clampModelToMax('gemini-2.5-pro', 'gemini-2.0-flash')).toBe('gemini-2.0-flash');
  });

  it('clampModelToMax giữ model trong tier', () => {
    expect(clampModelToMax('gemini-2.0-flash', 'gemini-2.5-flash')).toBe('gemini-2.0-flash');
  });

  it('listModelsUpToTier trả đủ model ≤ max', () => {
    const models = listModelsUpToTier('gemini-2.0-flash');
    expect(models).toEqual([
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash',
      'gemini-2.0-flash',
    ]);
    expect(models).not.toContain('gemini-2.5-flash');
  });

  it('model lạ được coi tier cao → clamp', () => {
    expect(getModelTierIndex('unknown-model-x')).toBeGreaterThan(getModelTierIndex('gemini-2.5-flash'));
    expect(clampModelToMax('unknown-model-x', 'gemini-2.0-flash')).toBe('gemini-2.0-flash');
  });
});
