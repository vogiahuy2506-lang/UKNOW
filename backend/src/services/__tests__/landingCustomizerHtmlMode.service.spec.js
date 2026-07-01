import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindByPageAndSection = jest.fn();
const mockUpsert = jest.fn();

jest.unstable_mockModule('../../repositories/landingPageOverride.repository.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../repositories/landingPageSection.repository.js', () => ({
  default: {
    findByPageAndSection: mockFindByPageAndSection,
    upsert: mockUpsert,
  },
}));

const { default: landingCustomizerService } = await import('../landingCustomizer.service.js');

describe('landingCustomizer.service full-page HTML mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns default mode when no section row exists', async () => {
    mockFindByPageAndSection.mockResolvedValue(null);
    const result = await landingCustomizerService.getFullPageHtmlMode('hero');
    expect(result).toEqual({
      page: 'hero',
      displayMode: 'default',
      htmlContentVi: '',
      htmlContentEn: '',
      cssContent: '',
      updatedAt: null,
    });
  });

  it('rejects enabling html mode without content', async () => {
    mockFindByPageAndSection.mockResolvedValue(null);
    await expect(landingCustomizerService.saveFullPageHtmlMode('hero', {
      displayMode: 'html',
      htmlContentVi: '   ',
      htmlContentEn: '',
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('maps public html payload for active html mode', async () => {
    mockFindByPageAndSection.mockResolvedValue({
      page: 'hero',
      htmlContent: '<div>VI</div>',
      cssContent: '',
      config: { displayMode: 'html', htmlContentEn: '<div>EN</div>' },
      updatedAt: '2026-01-01',
    });

    const vi = await landingCustomizerService.getPublicFullPageHtml('hero', 'vi');
    expect(vi.displayMode).toBe('html');
    expect(vi.htmlContent).toBe('<div>VI</div>');

    const en = await landingCustomizerService.getPublicFullPageHtml('hero', 'en');
    expect(en.htmlContent).toBe('<div>EN</div>');
  });
});
