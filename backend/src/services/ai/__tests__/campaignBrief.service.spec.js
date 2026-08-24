import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindByIdAndUser = jest.fn();
const mockFindByIdsAndUser = jest.fn();
const mockGetCourses = jest.fn();

jest.unstable_mockModule('../../../repositories/courses/course.repository.js', () => ({
  default: {
    findByIdAndUser: mockFindByIdAndUser,
    findByIdsAndUser: mockFindByIdsAndUser,
  },
}));

jest.unstable_mockModule('../aiPromptResources.service.js', () => ({
  default: { getCourses: mockGetCourses },
}));

const {
  createEmptyCampaignBrief,
  parseCampaignBriefMarker,
  mergeCampaignBrief,
  isCampaignBriefReady,
  clearCampaignBriefProductFacts,
  resolveCampaignBrief,
  buildCampaignBriefContext,
  extractCampaignBriefFromHistory,
} = await import('../campaignBrief.service.js');

describe('campaignBrief.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseCampaignBriefMarker', () => {
    it('parses single_product catalog', () => {
      const brief = parseCampaignBriefMarker({
        gate: 'campaignBrief',
        contentMode: 'single_product',
        productId: 12,
      });
      expect(brief).toMatchObject({
        contentMode: 'single_product',
        productMode: 'catalog',
        productIds: [12],
      });
    });

    it('parses single_product other with name length bounds', () => {
      expect(() => parseCampaignBriefMarker({
        gate: 'campaignBrief',
        contentMode: 'single_product',
        productMode: 'other',
        productName: 'A',
      })).toThrow(expect.objectContaining({ code: 'CAMPAIGN_PRODUCT_NAME_REQUIRED' }));

      const brief = parseCampaignBriefMarker({
        gate: 'campaignBrief',
        contentMode: 'single_product',
        productId: 'other',
        productName: '  Khóa AI Shop  ',
        productDescription: 'Mô tả',
      });
      expect(brief.productMode).toBe('other');
      expect(brief.productName).toBe('Khóa AI Shop');
      expect(brief.productIds).toEqual([]);
    });

    it('rejects overlong product name', () => {
      expect(() => parseCampaignBriefMarker({
        gate: 'campaignBrief',
        contentMode: 'single_product',
        productMode: 'other',
        productName: 'x'.repeat(161),
      })).toThrow(expect.objectContaining({ code: 'CAMPAIGN_BRIEF_INVALID' }));
    });

    it('parses custom_topic', () => {
      const brief = parseCampaignBriefMarker({
        gate: 'campaignBrief',
        contentMode: 'custom_topic',
        topicText: 'Email cảm ơn sau mua',
      });
      expect(brief).toMatchObject({
        contentMode: 'custom_topic',
        productMode: 'context',
        topicText: 'Email cảm ơn sau mua',
      });
    });

    it('parses attached_file', () => {
      const brief = parseCampaignBriefMarker({
        gate: 'campaignBrief',
        contentMode: 'attached_file',
      });
      expect(brief).toMatchObject({
        contentMode: 'attached_file',
        productMode: 'attached_file',
      });
    });

    it('rejects contentMode=context from client', () => {
      expect(() => parseCampaignBriefMarker({
        gate: 'campaignBrief',
        contentMode: 'context',
      })).toThrow(expect.objectContaining({ code: 'CAMPAIGN_BRIEF_INVALID' }));
    });

    it('multiple_products ignores client productIds', () => {
      const brief = parseCampaignBriefMarker({
        gate: 'campaignBrief',
        contentMode: 'multiple_products',
        productIds: [1, 2, 3],
      });
      expect(brief.productMode).toBe('catalog_set');
      expect(brief.productIds).toEqual([]);
    });
  });

  describe('isCampaignBriefReady / merge / clear', () => {
    it('ready checks per mode', () => {
      expect(isCampaignBriefReady(createEmptyCampaignBrief())).toBe(false);
      expect(isCampaignBriefReady({
        contentMode: 'single_product',
        productMode: 'catalog',
        productIds: [1],
      })).toBe(true);
      expect(isCampaignBriefReady({
        contentMode: 'single_product',
        productMode: 'other',
        productName: 'AB',
      })).toBe(true);
      expect(isCampaignBriefReady({
        contentMode: 'multiple_products',
        productMode: 'catalog_set',
        productIds: [1, 2],
      })).toBe(true);
      expect(isCampaignBriefReady({
        contentMode: 'multiple_products',
        productMode: 'catalog_set',
        productIds: [],
      })).toBe(true);
      expect(isCampaignBriefReady({
        contentMode: 'custom_topic',
        topicText: 'ok',
      })).toBe(true);
      expect(isCampaignBriefReady({
        contentMode: 'attached_file',
      })).toBe(false);
      expect(isCampaignBriefReady({
        contentMode: 'attached_file',
        hasAttachedFile: false,
      })).toBe(false);
      expect(isCampaignBriefReady({
        contentMode: 'attached_file',
        hasAttachedFile: true,
      })).toBe(true);
      expect(isCampaignBriefReady({
        contentMode: 'attached_file',
        files: [{ tempId: '1' }],
      })).toBe(true);
    });

    it('merge prefers derived contentMode and default locale when neither side has locale', () => {
      const merged = mergeCampaignBrief(
        { contentMode: 'custom_topic', topicText: 'old topic' },
        { contentMode: 'single_product', productMode: 'catalog', productIds: [9] },
        { defaultContentLocale: 'en' }
      );
      expect(merged.contentMode).toBe('single_product');
      expect(merged.productIds).toEqual([9]);
      expect(merged.contentLocale).toBe('en');
    });

    it('clearCampaignBriefProductFacts keeps contentMode', () => {
      const cleared = clearCampaignBriefProductFacts({
        contentMode: 'single_product',
        productMode: 'catalog',
        productIds: [5],
        productName: 'X',
        contentLocale: 'vi',
      });
      expect(cleared.contentMode).toBe('single_product');
      expect(cleared.productIds).toEqual([]);
      expect(cleared.productMode).toBeNull();
      expect(cleared.productName).toBeNull();
    });
  });

  describe('extractCampaignBriefFromHistory', () => {
    it('returns latest campaignBrief marker', () => {
      const found = extractCampaignBriefFromHistory([
        { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"old"}\n' },
        { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
        {
          role: 'user',
          content: '[wizard]{"gate":"campaignBrief","contentMode":"single_product","productId":3}\nSP',
        },
      ]);
      expect(found.invalid).toBe(false);
      expect(found.brief).toMatchObject({
        contentMode: 'single_product',
        productMode: 'catalog',
        productIds: [3],
      });
    });

    it('invalid latest marker does not fall back to older brief', () => {
      const found = extractCampaignBriefFromHistory([
        {
          role: 'user',
          content: '[wizard]{"gate":"campaignBrief","contentMode":"single_product","productId":1}\nA',
        },
        {
          role: 'user',
          content: '[wizard]{"gate":"campaignBrief","contentMode":"single_product","productMode":"other","productName":"x"}\nbad',
        },
      ]);
      expect(found.invalid).toBe(true);
      expect(found.brief).toBeNull();
      expect(found.preferredContentMode).toBe('single_product');
    });

    it('older malformed campaignBrief marker does not poison a newer valid one', () => {
      const found = extractCampaignBriefFromHistory([
        {
          role: 'user',
          content: '[wizard]{"gate":"campaignBrief","contentMode":\nbroken',
        },
        {
          role: 'user',
          content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Email cảm ơn"}\nok',
        },
      ]);
      expect(found.invalid).toBe(false);
      expect(found.brief).toMatchObject({
        contentMode: 'custom_topic',
        topicText: 'Email cảm ơn',
      });
    });
  });

  describe('mergeCampaignBrief locale', () => {
    it('keeps sticky persisted locale when derived contentLocale is null', () => {
      const persisted = createEmptyCampaignBrief('vi');
      persisted.contentMode = 'custom_topic';
      persisted.productMode = 'context';
      persisted.topicText = 'Thanks';
      persisted.contentLocale = 'vi';
      const merged = mergeCampaignBrief(
        persisted,
        {
          contentMode: 'custom_topic',
          productMode: 'context',
          topicText: 'Thanks',
          contentLocale: null,
        },
        { defaultContentLocale: 'en' }
      );
      expect(merged.contentLocale).toBe('vi');
    });

    it('uses defaultContentLocale only when neither side has locale', () => {
      const merged = mergeCampaignBrief(
        null,
        {
          contentMode: 'custom_topic',
          productMode: 'context',
          topicText: 'Hello',
          contentLocale: null,
        },
        { defaultContentLocale: 'en' }
      );
      expect(merged.contentLocale).toBe('en');
    });
  });

  describe('resolveCampaignBrief + context', () => {
    it('single catalog resolves via findByIdAndUser and builds DATA block', async () => {
      mockFindByIdAndUser.mockResolvedValue({
        id: 7,
        course_name: 'DB Course',
        description: 'From DB',
        category: 'AI',
        price: 100,
      });
      const { brief, briefContext } = await resolveCampaignBrief({
        brief: {
          contentMode: 'single_product',
          productMode: 'catalog',
          productIds: [7],
          contentLocale: 'vi',
        },
        ownerUserId: 1,
      });
      expect(mockFindByIdAndUser).toHaveBeenCalledWith(7, 1);
      expect(brief.productIds).toEqual([7]);
      expect(briefContext).toContain('CAMPAIGN_BRIEF DATA');
      expect(briefContext).toContain('DB Course');
      expect(briefContext).toContain('interestedCourseIds');
    });

    it('multiple_products narrows snapshot only when sourcePrompt matches ≥2 catalog names', async () => {
      const catalog = [
        { id: 1, name: 'Khóa A' },
        { id: 2, name: 'Khóa B' },
        { id: 3, name: 'Khóa C' },
      ];
      mockFindByIdsAndUser.mockImplementation(async (ids) => ids.map((id) => ({
        id,
        course_name: catalog.find((c) => c.id === id)?.name,
      })));

      const narrowed = await resolveCampaignBrief({
        brief: {
          contentMode: 'multiple_products',
          productMode: 'catalog_set',
          productIds: [],
        },
        ownerUserId: 1,
        sourcePrompt: 'Quảng bá Khóa A và Khóa B cùng lúc',
        catalogCourses: catalog,
      });
      expect(narrowed.brief.productIds).toEqual([1, 2]);

      const withComma = await resolveCampaignBrief({
        brief: {
          contentMode: 'multiple_products',
          productMode: 'catalog_set',
          productIds: [],
        },
        ownerUserId: 1,
        sourcePrompt: 'Quảng bá Khóa A, Khóa B cùng lúc',
        catalogCourses: catalog,
      });
      expect(withComma.brief.productIds).toEqual([1, 2]);

      const full = await resolveCampaignBrief({
        brief: {
          contentMode: 'multiple_products',
          productMode: 'catalog_set',
          productIds: [],
        },
        ownerUserId: 1,
        sourcePrompt: 'Quảng bá Khóa A thôi',
        catalogCourses: catalog,
      });
      expect(full.brief.productIds).toEqual([1, 2, 3]);
    });

    it('does not treat short course names as substrings inside other words', async () => {
      const catalog = [
        { id: 1, name: 'AI' },
        { id: 2, name: 'Khóa B' },
      ];
      mockFindByIdsAndUser.mockImplementation(async (ids) => ids.map((id) => ({
        id,
        course_name: catalog.find((c) => c.id === id)?.name,
      })));

      const result = await resolveCampaignBrief({
        brief: {
          contentMode: 'multiple_products',
          productMode: 'catalog_set',
          productIds: [],
        },
        ownerUserId: 1,
        sourcePrompt: 'Gửi email cảm ơn và Khóa B',
        catalogCourses: catalog,
      });
      // "AI" must not match inside "email"; only 1 exact name → keep full snapshot
      expect(result.brief.productIds).toEqual([1, 2]);
    });

    it('missing catalog product → CAMPAIGN_PRODUCT_NOT_FOUND', async () => {
      mockFindByIdAndUser.mockResolvedValue(null);
      await expect(resolveCampaignBrief({
        brief: {
          contentMode: 'single_product',
          productMode: 'catalog',
          productIds: [99],
        },
        ownerUserId: 1,
      })).rejects.toMatchObject({ code: 'CAMPAIGN_PRODUCT_NOT_FOUND' });
    });

    it('buildCampaignBriefContext for custom_topic', () => {
      const ctx = buildCampaignBriefContext({
        brief: {
          contentMode: 'custom_topic',
          productMode: 'context',
          topicText: 'Cảm ơn sau mua',
          flowMode: 'standard',
        },
      });
      expect(ctx).toContain('Cảm ơn sau mua');
      expect(ctx).toContain('Do not force product promotion');
    });

    it('resolves and builds context for attached_file', async () => {
      const resolved = await resolveCampaignBrief({
        brief: {
          contentMode: 'attached_file',
          productMode: 'attached_file',
          flowMode: 'standard',
        },
        ownerUserId: 1,
      });
      expect(resolved.brief.contentMode).toBe('attached_file');
      expect(resolved.brief.productMode).toBe('attached_file');
      expect(resolved.briefContext).toContain('contentMode=attached_file');
      expect(resolved.briefContext).toContain('attached file');
    });
  });
});
