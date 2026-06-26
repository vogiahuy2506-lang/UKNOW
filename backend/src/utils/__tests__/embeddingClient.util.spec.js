import { describe, expect, it } from '@jest/globals';
import { extractEmbeddingUsage } from '../embeddingClient.util.js';

describe('extractEmbeddingUsage', () => {
  it('maps usageMetadata token counts', () => {
    expect(extractEmbeddingUsage({
      usageMetadata: { promptTokenCount: 12, totalTokenCount: 12 },
    })).toEqual({ promptTokens: 12, outputTokens: 0, totalTokens: 12 });
  });

  it('estimates from billableCharacterCount when tokens missing', () => {
    expect(extractEmbeddingUsage({
      usageMetadata: { billableCharacterCount: 40 },
    })).toEqual({ promptTokens: 10, outputTokens: 0, totalTokens: 10 });
  });

  it('falls back to text length estimate', () => {
    expect(extractEmbeddingUsage({}, 20)).toEqual({ promptTokens: 5, outputTokens: 0, totalTokens: 5 });
  });
});
