import landingTestimonialRepository from '../../repositories/landingTestimonial.repository.js';
import { isAdminRole } from '../../utils/roleScope.util.js';
import {
  deleteUploadedFileIfAny,
  extractStorageKeyFromImageUrl,
  moveTempUploadToPermanent,
  normalizeOptionalHttpImageUrl,
} from './landingImageAsset.helper.js';

/**
 * Sao đánh giá hợp lệ 1–5.
 *
 * @param {unknown} raw
 * @returns {number}
 */
function normalizeStarRating(raw) {
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1 || n > 5) {
    const err = new Error('starRating phải từ 1 đến 5');
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function assertRecordOwnership(existing, userId, roleCode, notFoundMessage) {
  if (Number(existing.idUser) !== Number(userId) && !isAdminRole(roleCode)) {
    const err = new Error(notFoundMessage);
    err.statusCode = 404;
    throw err;
  }
}

class LandingTestimonialService {
  async listPublic() {
    return landingTestimonialRepository.findActiveOrdered();
  }

  async listAdmin(userId) {
    return landingTestimonialRepository.findAllOrdered(userId);
  }

  /**
   * @param {object} body
   * @param {number} userId
   */
  async create(body, userId) {
    const b = body && typeof body === 'object' ? body : {};
    const starRating = normalizeStarRating(b.starRating);
    const quoteVi = String(b.quoteVi ?? '').trim();
    const quoteEn = String(b.quoteEn ?? '').trim();
    const nameVi = String(b.nameVi ?? '').trim();
    const nameEn = String(b.nameEn ?? '').trim();
    if (!quoteVi) {
      const err = new Error('quoteVi là bắt buộc');
      err.statusCode = 400;
      throw err;
    }
    if (!quoteEn) {
      const err = new Error('quoteEn là bắt buộc');
      err.statusCode = 400;
      throw err;
    }
    if (!nameVi) {
      const err = new Error('nameVi là bắt buộc');
      err.statusCode = 400;
      throw err;
    }
    if (!nameEn) {
      const err = new Error('nameEn là bắt buộc');
      err.statusCode = 400;
      throw err;
    }

    const tempId = String(b.imageTempId ?? '').trim();
    const orig = String(b.imageOriginalName ?? '').trim();
    const hasTemp = Boolean(tempId && orig);

    const payloadBase = {
      sortOrder: Number(b.sortOrder) || 0,
      quoteVi,
      quoteEn,
      starRating,
      nameVi,
      nameEn,
      roleVi: String(b.roleVi ?? '').trim(),
      roleEn: String(b.roleEn ?? '').trim(),
      locationVi: String(b.locationVi ?? '').trim(),
      locationEn: String(b.locationEn ?? '').trim(),
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
        return await landingTestimonialRepository.insert({
          ...payloadBase,
          imageUrl: newUrl,
          idUser: userId,
        });
      } catch (dbErr) {
        await deleteUploadedFileIfAny(extractStorageKeyFromImageUrl(newUrl), 'landingTestimonialRollback');
        throw dbErr;
      }
    }

    const imageUrl = normalizeOptionalHttpImageUrl(b.imageUrl);
    return landingTestimonialRepository.insert({
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
  async update(id, body, userId, roleCode = null) {
    const existing = await landingTestimonialRepository.findById(id);
    if (!existing) {
      const err = new Error('Không tìm thấy đánh giá landing');
      err.statusCode = 404;
      throw err;
    }
    assertRecordOwnership(existing, userId, roleCode, 'Không tìm thấy đánh giá landing');
    const b = body && typeof body === 'object' ? body : {};
    const starRating =
      b.starRating !== undefined ? normalizeStarRating(b.starRating) : existing.starRating;
    const quoteVi = b.quoteVi !== undefined ? String(b.quoteVi).trim() : existing.quoteVi;
    const quoteEn = b.quoteEn !== undefined ? String(b.quoteEn).trim() : existing.quoteEn;
    const nameVi = b.nameVi !== undefined ? String(b.nameVi).trim() : existing.nameVi;
    const nameEn = b.nameEn !== undefined ? String(b.nameEn).trim() : existing.nameEn;
    if (!quoteVi) {
      const err = new Error('quoteVi là bắt buộc');
      err.statusCode = 400;
      throw err;
    }
    if (!quoteEn) {
      const err = new Error('quoteEn là bắt buộc');
      err.statusCode = 400;
      throw err;
    }
    if (!nameVi) {
      const err = new Error('nameVi là bắt buộc');
      err.statusCode = 400;
      throw err;
    }
    if (!nameEn) {
      const err = new Error('nameEn là bắt buộc');
      err.statusCode = 400;
      throw err;
    }

    const tempId = String(b.imageTempId ?? '').trim();
    const orig = String(b.imageOriginalName ?? '').trim();
    const hasTemp = Boolean(tempId && orig);

    const oldKey = extractStorageKeyFromImageUrl(existing.imageUrl);

    const mergePayload = (imageUrl) => ({
      sortOrder: b.sortOrder !== undefined ? Number(b.sortOrder) || 0 : existing.sortOrder,
      quoteVi,
      quoteEn,
      starRating,
      nameVi,
      nameEn,
      roleVi: b.roleVi !== undefined ? String(b.roleVi).trim() : existing.roleVi,
      roleEn: b.roleEn !== undefined ? String(b.roleEn).trim() : existing.roleEn,
      locationVi: b.locationVi !== undefined ? String(b.locationVi).trim() : existing.locationVi,
      locationEn: b.locationEn !== undefined ? String(b.locationEn).trim() : existing.locationEn,
      imageUrl,
      isActive: b.isActive !== undefined ? b.isActive : existing.isActive,
    });

    if (hasTemp) {
      const newUrl = await moveTempUploadToPermanent(tempId, orig, userId);
      if (!newUrl) {
        const err = new Error('Không thể lưu file ảnh');
        err.statusCode = 500;
        throw err;
      }
      try {
        const row = await landingTestimonialRepository.updateById(id, mergePayload(newUrl));
        const newKey = extractStorageKeyFromImageUrl(row.imageUrl);
        if (oldKey && oldKey !== newKey) {
          await deleteUploadedFileIfAny(oldKey, 'landingTestimonial');
        }
        return row;
      } catch (dbErr) {
        await deleteUploadedFileIfAny(extractStorageKeyFromImageUrl(newUrl), 'landingTestimonialRollback');
        throw dbErr;
      }
    }

    let imageUrl = existing.imageUrl;
    if (b.imageUrl !== undefined) {
      imageUrl = normalizeOptionalHttpImageUrl(b.imageUrl);
    }
    const row = await landingTestimonialRepository.updateById(id, mergePayload(imageUrl));
    const newKey = extractStorageKeyFromImageUrl(row.imageUrl);
    if (oldKey && oldKey !== newKey) {
      await deleteUploadedFileIfAny(oldKey, 'landingTestimonial');
    }
    return row;
  }

  /**
   * Xóa bản ghi và file ảnh trên `uploads/` nếu URL trỏ về file nội bộ.
   *
   * @param {number|string} id
   * @param {number} userId
   */
  async remove(id, userId, roleCode = null) {
    const existing = await landingTestimonialRepository.findById(id);
    if (!existing) {
      const err = new Error('Không tìm thấy đánh giá landing');
      err.statusCode = 404;
      throw err;
    }
    assertRecordOwnership(existing, userId, roleCode, 'Không tìm thấy đánh giá landing');
    const fileKey = extractStorageKeyFromImageUrl(existing.imageUrl);
    const ok = await landingTestimonialRepository.deleteById(id);
    if (!ok) {
      const err = new Error('Không tìm thấy đánh giá landing');
      err.statusCode = 404;
      throw err;
    }
    if (fileKey) {
      await deleteUploadedFileIfAny(fileKey, 'landingTestimonial');
    }
    return true;
  }
}

export default new LandingTestimonialService();
