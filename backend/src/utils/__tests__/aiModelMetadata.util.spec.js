import { describe, expect, it } from '@jest/globals';
import {
  extractGoogleModelMetadata,
  formatTokenLimit,
  isRelevantChatModel,
} from '../aiModelMetadata.util.js';

describe('aiModelMetadata.util', () => {
  it('filters preview and non-gemini chat models', () => {
    expect(isRelevantChatModel('gemini-2.5-flash')).toBe(true);
    expect(isRelevantChatModel('gemini-2.5-flash-preview-09-2025')).toBe(false);
    expect(isRelevantChatModel('gemma-3-27b-it')).toBe(false);
  });

  it('extracts Google ListModels metadata', () => {
    expect(extractGoogleModelMetadata({
      name: 'models/gemini-2.5-flash',
      displayName: 'Gemini 2.5 Flash',
      description: 'Fast model',
      version: '2.5',
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      thinking: true,
    })).toEqual({
      modelId: 'gemini-2.5-flash',
      displayName: 'Gemini 2.5 Flash',
      description: 'Fast model',
      version: '2.5',
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      thinking: true,
    });
  });

  it('formats token limits for display', () => {
    expect(formatTokenLimit(1048576)).toBe('1M');
    expect(formatTokenLimit(65536)).toBe('65.5K');
    expect(formatTokenLimit(null)).toBe('—');
  });
});
