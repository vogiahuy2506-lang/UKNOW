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

  it('sends landingBrief và luôn gọi /ai/generate-landing-html kể cả khi có files', async () => {
    const { default: aiApi } = await import('../aiApi.js');
    const brief = { version: 1, source: 'assistant_wizard', productMode: 'context' };

    await aiApi.generateLandingPage('prompt only', null, [], 1, 'sum', brief);
    expect(post).toHaveBeenCalledWith(
      '/ai/generate-landing-html',
      expect.objectContaining({ prompt: 'prompt only', landingBrief: brief }),
      expect.any(Object),
    );

    post.mockClear();
    await aiApi.generateLandingPage('prompt files', null, [{ tempId: 'a', originalName: 'logo.png', contentType: 'image/png', size: 1234 }], 1, 'sum', brief);
    expect(post).toHaveBeenCalledWith(
      '/ai/generate-landing-html',
      expect.objectContaining({
        prompt: 'prompt files',
        files: [{ tempId: 'a', originalName: 'logo.png', contentType: 'image/png', size: 1234 }],
        landingBrief: brief,
      }),
      expect.any(Object),
    );

    post.mockClear();
    await aiApi.editLandingHtml({
      instruction: 'Đổi nền xanh',
      currentHtml: '<div>Test</div>',
      files: [{ tempId: 'b', originalName: 'banner.jpg', contentType: 'image/jpeg', size: 5678 }],
    });
    expect(post).toHaveBeenCalledWith(
      '/ai/edit-landing-html',
      expect.objectContaining({
        instruction: 'Đổi nền xanh',
        currentHtml: '<div>Test</div>',
        files: [{ tempId: 'b', originalName: 'banner.jpg', contentType: 'image/jpeg', size: 5678 }],
      }),
      expect.any(Object),
    );
  });
});
