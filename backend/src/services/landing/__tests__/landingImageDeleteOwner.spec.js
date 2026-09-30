import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * `imageUrl` của đánh giá / khoá học nổi bật do người dùng nhập (URL http(s) bất kỳ), nên khi đổi
 * hoặc xoá bản ghi, lệnh xoá tệp phải mang theo chủ bản ghi (id_user) để deleteFromS3 chỉ xoá
 * trong `uploads/<id_user>/`.
 */

const mockDeleteFromS3 = jest.fn();
const mockTestimonialFindById = jest.fn();
const mockTestimonialDeleteById = jest.fn();
const mockTestimonialUpdateById = jest.fn();
const mockCourseFindById = jest.fn();
const mockCourseDeleteById = jest.fn();

jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
  default: {
    normalizeStorageKey: (input) => {
      const text = String(input || '').trim();
      const idx = text.indexOf('uploads/');
      return idx >= 0 ? text.slice(idx) : '';
    },
    deleteFromS3: mockDeleteFromS3,
    promoteTempToStorage: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../repositories/landingTestimonial.repository.js', () => ({
  default: {
    findById: mockTestimonialFindById,
    deleteById: mockTestimonialDeleteById,
    updateById: mockTestimonialUpdateById,
  },
}));

jest.unstable_mockModule('../../../repositories/landingFeaturedCourse.repository.js', () => ({
  default: {
    findById: mockCourseFindById,
    deleteById: mockCourseDeleteById,
  },
}));

const { deleteUploadedFileIfAny } = await import('../landingImageAsset.helper.js');
const { default: landingTestimonialService } = await import('../landingTestimonial.service.js');
const { default: landingFeaturedCourseService } = await import('../landingFeaturedCourse.service.js');

describe('landing image — xoá tệp kèm chủ bản ghi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteFromS3.mockResolvedValue({ success: true, deletedCount: 0, skippedCount: 0, errors: [] });
  });

  it('deleteUploadedFileIfAny truyền ownerUserId xuống deleteFromS3', async () => {
    await deleteUploadedFileIfAny('uploads/10/landing/a.png', 'tag', 10);
    expect(mockDeleteFromS3).toHaveBeenCalledWith(['uploads/10/landing/a.png'], { ownerUserId: 10 });
  });

  it('xoá đánh giá có imageUrl trỏ tệp workspace khác → lệnh xoá mang chủ bản ghi (không phải chủ key)', async () => {
    mockTestimonialFindById.mockResolvedValue({ id: 5, idUser: 10, imageUrl: 'https://app.example.com/uploads/999/nan-nhan.png' });
    mockTestimonialDeleteById.mockResolvedValue(true);

    await landingTestimonialService.remove(5, 10, 'user');

    expect(mockDeleteFromS3).toHaveBeenCalledWith(['uploads/999/nan-nhan.png'], { ownerUserId: 10 });
  });

  it('đổi imageUrl đánh giá → tệp cũ được xoá kèm chủ bản ghi', async () => {
    mockTestimonialFindById.mockResolvedValue({
      id: 5,
      idUser: 10,
      imageUrl: 'https://app.example.com/uploads/10/landing/cu.png',
      quoteVi: 'a', quoteEn: 'b', nameVi: 'c', nameEn: 'd', starRating: 5,
    });
    mockTestimonialUpdateById.mockResolvedValue({ id: 5, imageUrl: 'https://cdn.example.com/moi.png' });

    await landingTestimonialService.update(5, { imageUrl: 'https://cdn.example.com/moi.png' }, 10, 'user');

    expect(mockDeleteFromS3).toHaveBeenCalledWith(['uploads/10/landing/cu.png'], { ownerUserId: 10 });
  });

  it('xoá khoá học nổi bật → lệnh xoá mang chủ bản ghi', async () => {
    mockCourseFindById.mockResolvedValue({ id: 8, idUser: 10, imageUrl: 'https://app.example.com/uploads/999/x.png' });
    mockCourseDeleteById.mockResolvedValue(true);

    await landingFeaturedCourseService.remove(8, 10, 'user');

    expect(mockDeleteFromS3).toHaveBeenCalledWith(['uploads/999/x.png'], { ownerUserId: 10 });
  });
});
