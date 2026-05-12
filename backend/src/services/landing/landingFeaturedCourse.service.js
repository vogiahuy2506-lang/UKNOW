import landingFeaturedCourseRepository from '../../repositories/landingFeaturedCourse.repository.js';
import {
  deleteUploadedFileIfAny,
  extractStorageKeyFromImageUrl,
  moveTempUploadToPermanent,
  normalizeOptionalHttpImageUrl,
} from './landingImageAsset.helper.js';

/**
 * Kiểm tra link_url bắt buộc và hợp lệ (http/https).
 *
 * @param {string|null|undefined} raw
 * @param {string} fieldLabel
 * @returns {string}
 */
function assertHttpUrl(raw, fieldLabel = 'linkUrl') {
  const s = String(raw ?? '').trim();
  if (!s) {
    const err = new Error(`${fieldLabel} là bắt buộc`);
    err.statusCode = 400;
    throw err;
  }
  if (!/^https?:\/\//i.test(s)) {
    const err = new Error(`${fieldLabel} phải bắt đầu bằng http:// hoặc https://`);
    err.statusCode = 400;
    throw err;
  }
  return s;
}

class LandingFeaturedCourseService {
  async listPublic() {
    return landingFeaturedCourseRepository.findActiveOrdered();
  }

  async listAdmin(userId) {
    return landingFeaturedCourseRepository.findAllOrdered(userId);
  }

  /**
   * @param {object} body
   * @param {number} userId
   */
  async create(body, userId) {
    const b = body && typeof body === 'object' ? body : {};
    const titleVi = String(b.titleVi ?? '').trim();
    const titleEn = String(b.titleEn ?? '').trim();
    if (!titleVi) {
      const err = new Error('titleVi là bắt buộc');
      err.statusCode = 400;
      throw err;
    }
    if (!titleEn) {
      const err = new Error('titleEn là bắt buộc');
      err.statusCode = 400;
      throw err;
    }
    const linkUrl = assertHttpUrl(b.linkUrl);

    const tempId = String(b.imageTempId ?? '').trim();
    const orig = String(b.imageOriginalName ?? '').trim();
    const hasTemp = Boolean(tempId && orig);

    const payloadBase = {
      sortOrder: Number(b.sortOrder) || 0,
      titleVi,
      titleEn,
      tagVi: String(b.tagVi ?? '').trim(),
      tagEn: String(b.tagEn ?? '').trim(),
      linkUrl,
      isActive: b.isActive !== false,
    };

    if (hasTemp) {
      const newUrl = await moveTempUploadToPermanent(tempId, orig, userId);
      if (!newUrl) {
        const err = new Error('Không thể lưu file ảnh');
        err.statusCode = 500;
        throw err;
      }
      try {
        return await landingFeaturedCourseRepository.insert({
          ...payloadBase,
          imageUrl: newUrl,
          idUser: userId,
        });
      } catch (dbErr) {
        await deleteUploadedFileIfAny(extractStorageKeyFromImageUrl(newUrl), 'landingFeaturedCourseRollback');
        throw dbErr;
      }
    }

    const imageUrl = normalizeOptionalHttpImageUrl(b.imageUrl);
    return landingFeaturedCourseRepository.insert({
      ...payloadBase,
      imageUrl,
      idUser: userId,
    });
  }

  /**
   * @param {number|string} id
   * @param {object} body
   * @param {number} userId
   */
  async update(id, body, userId) {
    const existing = await landingFeaturedCourseRepository.findById(id);
    if (!existing) {
      const err = new Error('Không tìm thấy khóa học nổi bật');
      err.statusCode = 404;
      throw err;
    }
    const b = body && typeof body === 'object' ? body : {};
    const titleVi = b.titleVi !== undefined ? String(b.titleVi).trim() : existing.titleVi;
    const titleEn = b.titleEn !== undefined ? String(b.titleEn).trim() : existing.titleEn;
    if (!titleVi) {
      const err = new Error('titleVi là bắt buộc');
      err.statusCode = 400;
      throw err;
    }
    if (!titleEn) {
      const err = new Error('titleEn là bắt buộc');
      err.statusCode = 400;
      throw err;
    }

    const tempId = String(b.imageTempId ?? '').trim();
    const orig = String(b.imageOriginalName ?? '').trim();
    const hasTemp = Boolean(tempId && orig);

    const linkUrl =
      b.linkUrl !== undefined ? assertHttpUrl(b.linkUrl) : existing.linkUrl;

    const oldKey = extractStorageKeyFromImageUrl(existing.imageUrl);

    const mergePayload = (imageUrl) => ({
      sortOrder: b.sortOrder !== undefined ? Number(b.sortOrder) || 0 : existing.sortOrder,
      titleVi,
      titleEn,
      tagVi: b.tagVi !== undefined ? String(b.tagVi).trim() : existing.tagVi,
      tagEn: b.tagEn !== undefined ? String(b.tagEn).trim() : existing.tagEn,
      imageUrl,
      linkUrl,
      isActive: b.isActive !== undefined ? b.isActive : existing.isActive,
      idUser: userId,
    });

    if (hasTemp) {
      const newUrl = await moveTempUploadToPermanent(tempId, orig, userId);
      if (!newUrl) {
        const err = new Error('Không thể lưu file ảnh');
        err.statusCode = 500;
        throw err;
      }
      try {
        const row = await landingFeaturedCourseRepository.updateById(id, mergePayload(newUrl));
        const newKey = extractStorageKeyFromImageUrl(row.imageUrl);
        if (oldKey && oldKey !== newKey) {
          await deleteUploadedFileIfAny(oldKey, 'landingFeaturedCourse');
        }
        return row;
      } catch (dbErr) {
        await deleteUploadedFileIfAny(extractStorageKeyFromImageUrl(newUrl), 'landingFeaturedCourseRollback');
        throw dbErr;
      }
    }

    let imageUrl = existing.imageUrl;
    if (b.imageUrl !== undefined) {
      imageUrl = normalizeOptionalHttpImageUrl(b.imageUrl);
    }
    const row = await landingFeaturedCourseRepository.updateById(id, mergePayload(imageUrl));
    const newKey = extractStorageKeyFromImageUrl(row.imageUrl);
    if (oldKey && oldKey !== newKey) {
      await deleteUploadedFileIfAny(oldKey, 'landingFeaturedCourse');
    }
    return row;
  }
  /**
   * @param {number|string} id
   * @param {number} userId
   */
  async remove(id, userId) {
    const existing = await landingFeaturedCourseRepository.findById(id);
    if (!existing) {
      const err = new Error('Không tìm thấy khóa học nổi bật');
      err.statusCode = 404;
      throw err;
    }
    const fileKey = extractStorageKeyFromImageUrl(existing.imageUrl);
    const ok = await landingFeaturedCourseRepository.deleteById(id);
    if (!ok) {
      const err = new Error('Không tìm thấy khóa học nổi bật');
      err.statusCode = 404;
      throw err;
    }
    if (fileKey) {
      await deleteUploadedFileIfAny(fileKey, 'landingFeaturedCourse');
    }
    return true;
  }
}

export default new LandingFeaturedCourseService();
