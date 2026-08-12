import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('../api', () => ({
  default: {
    post,
    get: vi.fn(),
  },
}));

describe('aiApi.generateLandingPage landingBrief', () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ data: { success: true, data: {} } });
  });

  it('sends landingBrief on both no-file and file/template branches', async () => {
    const { default: aiApi } = await import('../aiApi.js');
    const brief = { version: 1, source: 'assistant_wizard', productMode: 'context' };

    await aiApi.generateLandingPage('prompt only', null, [], 1, 'sum', brief);
    expect(post).toHaveBeenCalledWith(
      '/ai/generate-landing-html',
      expect.objectContaining({ prompt: 'prompt only', landingBrief: brief }),
      expect.any(Object),
    );

    post.mockClear();
    await aiApi.generateLandingPage('prompt files', null, [{ tempId: 'a' }], 1, 'sum', brief);
    expect(post).toHaveBeenCalledWith(
      '/landing-templates/generate',
      expect.objectContaining({ prompt: 'prompt files', files: [{ tempId: 'a' }], landingBrief: brief }),
      expect.any(Object),
    );

    post.mockClear();
    await aiApi.generateLandingPage('prompt template', 9, [], 1, 'sum', brief);
    expect(post).toHaveBeenCalledWith(
      '/landing-templates/generate',
      expect.objectContaining({ templateId: 9, landingBrief: brief }),
      expect.any(Object),
    );
  });
});
