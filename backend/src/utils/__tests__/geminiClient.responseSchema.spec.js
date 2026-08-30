import { describe, expect, it, jest } from '@jest/globals';
import { generateGeminiContent } from '../geminiClient.util.js';

describe('PR-2: generateGeminiContent with responseSchema', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalApiKey;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('gọi có responseSchema → body gửi đi chứa cả responseMimeType lẫn responseSchema', async () => {
    let capturedBody = null;
    global.fetch = jest.fn(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: '{"version":1,"channel":"email"}' }] },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: { totalTokenCount: 50 },
        }),
      };
    });

    const mockSchema = {
      type: 'object',
      properties: {
        version: { type: 'integer' },
        channel: { type: 'string' },
      },
      required: ['version', 'channel'],
    };

    const res = await generateGeminiContent({
      parts: [{ text: 'Create campaign' }],
      responseSchema: mockSchema,
    });

    expect(res.text).toBe('{"version":1,"channel":"email"}');
    expect(capturedBody).not.toBeNull();
    expect(capturedBody.generationConfig.responseMimeType).toBe('application/json');
    expect(capturedBody.generationConfig.responseSchema).toEqual(mockSchema);
  });

  it('gọi không truyền responseSchema → body không chứa trường responseSchema', async () => {
    let capturedBody = null;
    global.fetch = jest.fn(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: 'Plain response' }] },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: { totalTokenCount: 20 },
        }),
      };
    });

    const res = await generateGeminiContent({
      parts: [{ text: 'Hello' }],
    });

    expect(res.text).toBe('Plain response');
    expect(capturedBody).not.toBeNull();
    expect(capturedBody.generationConfig).not.toHaveProperty('responseSchema');
    expect(capturedBody.generationConfig).not.toHaveProperty('responseMimeType');
  });

  it('gọi jsonMode = true mà không có responseSchema → chỉ có responseMimeType', async () => {
    let capturedBody = null;
    global.fetch = jest.fn(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: '{"ok":true}' }] },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: { totalTokenCount: 15 },
        }),
      };
    });

    const res = await generateGeminiContent({
      parts: [{ text: 'Hello JSON' }],
      jsonMode: true,
    });

    expect(res.text).toBe('{"ok":true}');
    expect(capturedBody).not.toBeNull();
    expect(capturedBody.generationConfig.responseMimeType).toBe('application/json');
    expect(capturedBody.generationConfig).not.toHaveProperty('responseSchema');
  });
});
