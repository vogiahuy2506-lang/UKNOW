import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Mock repository
const mockFindById = jest.fn();
const mockIncrementViewCount = jest.fn();
const mockHasPurchased = jest.fn();
const mockUpdate = jest.fn();

jest.unstable_mockModule('../../../repositories/marketplace/marketplaceListing.repository.js', () => ({
  default: {
    findById: mockFindById,
    incrementViewCount: mockIncrementViewCount,
    update: mockUpdate,
  },
}));

jest.unstable_mockModule('../../../repositories/marketplace/marketplacePurchase.repository.js', () => ({
  default: {
    findByUserAndListing: mockHasPurchased,
  },
}));

const { default: marketplaceListingService } = await import('../marketplaceListing.service.js');

describe('marketplaceListing.service getById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('KHÔNG tăng view_count khi chính chủ listing xem', async () => {
    mockFindById.mockResolvedValue({ id: 1, id_user: 42, title: 'My Listing' });

    const result = await marketplaceListingService.getById(1, 42);

    expect(result).toEqual({ id: 1, id_user: 42, title: 'My Listing' });
    expect(mockIncrementViewCount).not.toHaveBeenCalled();
  });

  it('CÓ tăng view_count khi người khác (không phải seller) xem', async () => {
    mockFindById.mockResolvedValue({ id: 1, id_user: 42, title: 'Other Listing' });

    const result = await marketplaceListingService.getById(1, 99);

    expect(result).toEqual({ id: 1, id_user: 42, title: 'Other Listing' });
    expect(mockIncrementViewCount).toHaveBeenCalledWith(1);
  });

  it('CÓ tăng view_count khi không truyền viewerUserId (khách vãng lai)', async () => {
    mockFindById.mockResolvedValue({ id: 1, id_user: 42, title: 'Public Listing' });

    const result = await marketplaceListingService.getById(1);

    expect(result).toEqual({ id: 1, id_user: 42, title: 'Public Listing' });
    expect(mockIncrementViewCount).toHaveBeenCalledWith(1);
  });

  it('KHÔNG tăng view_count khi listing không tồn tại', async () => {
    mockFindById.mockResolvedValue(null);

    const result = await marketplaceListingService.getById(999, 42);

    expect(result).toBeNull();
    expect(mockIncrementViewCount).not.toHaveBeenCalled();
  });

  it('so sánh id_user dạng string vs number đều đúng', async () => {
    // PostgreSQL có thể trả về id_user dạng string trong một số trường hợp
    mockFindById.mockResolvedValue({ id: 1, id_user: '42', title: 'Edge' });

    const result = await marketplaceListingService.getById(1, 42);

    expect(result).toEqual({ id: 1, id_user: '42', title: 'Edge' });
    // Không tăng view vì '42' == 42 (Number coercion)
    expect(mockIncrementViewCount).not.toHaveBeenCalled();
  });
});

describe('marketplaceListing.service pause - ownership check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throw 403 khi user không phải chủ listing', async () => {
    mockFindById.mockResolvedValue({ id: 1, id_user: 42 });

    await expect(marketplaceListingService.pause(1, 99)).rejects.toMatchObject({
      message: expect.stringContaining('không có quyền'),
      status: 403,
    });
  });

  it('throw 404 khi listing không tồn tại', async () => {
    mockFindById.mockResolvedValue(null);

    await expect(marketplaceListingService.pause(999, 42)).rejects.toMatchObject({
      message: expect.stringContaining('không tồn tại'),
      status: 404,
    });
  });
});

describe('marketplaceListing.service.update - validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ id: 1 });
  });

  it('reject category không hợp lệ', async () => {
    await expect(
      marketplaceListingService.update(1, 42, { category: 'invalid' })
    ).rejects.toMatchObject({ status: 400 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('cho phép category null (clear)', async () => {
    await expect(
      marketplaceListingService.update(1, 42, { category: null })
    ).resolves.not.toThrow();
  });

  it('reject visibility không hợp lệ', async () => {
    await expect(
      marketplaceListingService.update(1, 42, { visibility: 'private' })
    ).rejects.toMatchObject({ status: 400 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('reject price credits âm', async () => {
    await expect(
      marketplaceListingService.update(1, 42, { priceCredits: -100 })
    ).rejects.toMatchObject({ status: 400 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('reject price credits không phải số', async () => {
    await expect(
      marketplaceListingService.update(1, 42, { priceCredits: 'abc' })
    ).rejects.toMatchObject({ status: 400 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('floor price credits xuống số nguyên', async () => {
    await marketplaceListingService.update(1, 42, { priceCredits: 99.7 });
    // Kiểm tra priceCredits đã được floor xuống 99
    expect(mockUpdate).toHaveBeenCalledWith(
      1, 42, expect.objectContaining({ priceCredits: 99 })
    );
  });

  it('cho phép price = 0 (miễn phí)', async () => {
    await expect(
      marketplaceListingService.update(1, 42, { priceCredits: 0 })
    ).resolves.not.toThrow();
  });

  it('reject title rỗng', async () => {
    await expect(
      marketplaceListingService.update(1, 42, { title: '   ' })
    ).rejects.toMatchObject({ status: 400 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('reject title quá 255 ký tự', async () => {
    await expect(
      marketplaceListingService.update(1, 42, { title: 'a'.repeat(256) })
    ).rejects.toMatchObject({ status: 400 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('trim title trước khi lưu', async () => {
    await marketplaceListingService.update(1, 42, { title: '  Hello  ' });
    expect(mockUpdate).toHaveBeenCalledWith(
      1, 42, expect.objectContaining({ title: 'Hello' })
    );
  });

  it('reject description quá 2000 ký tự', async () => {
    await expect(
      marketplaceListingService.update(1, 42, { description: 'a'.repeat(2001) })
    ).rejects.toMatchObject({ status: 400 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
