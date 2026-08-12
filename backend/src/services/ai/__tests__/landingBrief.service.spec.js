import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindByIdAndUser = jest.fn();

jest.unstable_mockModule('../../../repositories/courses/course.repository.js', () => ({
  default: { findByIdAndUser: mockFindByIdAndUser },
}));

const {
  resolveLandingBrief,
  buildLandingBriefContext,
  resolveOwnerUserId,
} = await import('../landingBrief.service.js');

describe('landingBrief.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolveOwnerUserId uses activeContext.ownerId for employees', () => {
    expect(resolveOwnerUserId({ id: 9, activeContext: { type: 'employee', ownerId: 3 } })).toBe(3);
    expect(resolveOwnerUserId({ id: 9 })).toBe(9);
  });

  it('returns null when landingBrief is omitted', async () => {
    await expect(resolveLandingBrief({ landingBrief: undefined, user: { id: 1 } })).resolves.toBeNull();
  });

  it('other missing name → LANDING_PRODUCT_NAME_REQUIRED', async () => {
    await expect(resolveLandingBrief({
      landingBrief: {
        version: 1,
        source: 'assistant_wizard',
        productMode: 'other',
        productName: ' ',
      },
      user: { id: 1 },
    })).rejects.toMatchObject({ status: 400, code: 'LANDING_PRODUCT_NAME_REQUIRED' });
    expect(mockFindByIdAndUser).not.toHaveBeenCalled();
  });

  it('other valid → context contains trimmed name/description', async () => {
    const resolved = await resolveLandingBrief({
      landingBrief: {
        version: 1,
        source: 'assistant_wizard',
        productMode: 'other',
        productName: '  Khóa AI shop  ',
        productDescription: '  Mô tả ngắn  ',
        pageGoal: 'lead',
        formFields: { preset: 'basic', customText: 'ignore me' },
      },
      user: { id: 1 },
    });
    expect(resolved.normalizedBrief.productName).toBe('Khóa AI shop');
    expect(resolved.normalizedBrief.productDescription).toBe('Mô tả ngắn');
    expect(resolved.normalizedBrief.formFields.customText).toBeNull();
    const ctx = buildLandingBriefContext(resolved);
    expect(ctx).toContain('Khóa AI shop');
    expect(ctx).toContain('Mô tả ngắn');
    expect(ctx).toContain('productMode: other');
  });

  it('catalog uses DB facts and ignores client productName', async () => {
    mockFindByIdAndUser.mockResolvedValue({
      id: 7,
      course_name: 'DB Course',
      description: 'From DB',
      category: 'AI',
      price: 199000,
      original_price: 299000,
    });
    const resolved = await resolveLandingBrief({
      landingBrief: {
        version: 1,
        source: 'assistant_wizard',
        productMode: 'catalog',
        productId: 7,
        productName: 'Fake client name',
        productDescription: 'Fake desc',
      },
      user: { id: 1 },
    });
    expect(mockFindByIdAndUser).toHaveBeenCalledWith(7, 1);
    expect(resolved.resolvedProduct.course_name).toBe('DB Course');
    const ctx = buildLandingBriefContext(resolved);
    expect(ctx).toContain('DB Course');
    expect(ctx).not.toContain('Fake client name');
  });

  it('catalog missing/wrong tenant → 404 LANDING_PRODUCT_NOT_FOUND', async () => {
    mockFindByIdAndUser.mockResolvedValue(null);
    await expect(resolveLandingBrief({
      landingBrief: {
        version: 1,
        source: 'assistant_wizard',
        productMode: 'catalog',
        productId: 99,
      },
      user: { id: 1, activeContext: { type: 'employee', ownerId: 5 } },
    })).rejects.toMatchObject({ status: 404, code: 'LANDING_PRODUCT_NOT_FOUND' });
    expect(mockFindByIdAndUser).toHaveBeenCalledWith(99, 5);
  });

  it('context mode strips client product fields and adds no-invent grounding', async () => {
    const resolved = await resolveLandingBrief({
      landingBrief: {
        version: 1,
        source: 'assistant_wizard',
        productMode: 'context',
        productId: 3,
        productName: 'Should ignore',
        productDescription: 'Also ignore',
        contentLocale: 'en',
      },
      user: { id: 2 },
    });
    expect(resolved.normalizedBrief.productId).toBeNull();
    expect(resolved.normalizedBrief.productName).toBeNull();
    expect(resolved.normalizedBrief.contentLocale).toBe('en');
    expect(buildLandingBriefContext(resolved)).toMatch(/do NOT invent/i);
    expect(mockFindByIdAndUser).not.toHaveBeenCalled();
  });

  it('rejects invalid enums / drops customText when preset is not custom', async () => {
    await expect(resolveLandingBrief({
      landingBrief: {
        version: 1,
        source: 'assistant_wizard',
        productMode: 'context',
        pageGoal: 'hack',
      },
      user: { id: 1 },
    })).rejects.toMatchObject({ status: 400, code: 'LANDING_BRIEF_INVALID' });

    const resolved = await resolveLandingBrief({
      landingBrief: {
        version: 1,
        source: 'assistant_wizard',
        productMode: 'context',
        formFields: { preset: 'extended', customText: 'Company' },
      },
      user: { id: 1 },
    });
    expect(resolved.normalizedBrief.formFields).toEqual({ preset: 'extended', customText: null });
  });
});
