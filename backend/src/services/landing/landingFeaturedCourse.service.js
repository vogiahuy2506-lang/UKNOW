import landingFeaturedCourseRepository from '../../repositories/landingFeaturedCourse.repository.js';

/**
 * Chuẩn hóa chuỗi URL ảnh: cho phép http(s) hoặc rỗng (null).
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
function normalizeImageUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const err = new Error('imageUrl phải là URL http(s) hoặc để trống');
  err.statusCode = 400;
  throw err;
}

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

/**
 * Gộp payload ghi DB sau khi đã validate.
 *
 * @param {object} p
 */
function toRowPayload(p) {
  return {
    sortOrder: Number(p.sortOrder) || 0,
    titleVi: String(p.titleVi ?? '').trim(),
    titleEn: String(p.titleEn ?? '').trim(),
    tagVi: String(p.tagVi ?? '').trim(),
    tagEn: String(p.tagEn ?? '').trim(),
    imageUrl: normalizeImageUrl(p.imageUrl),
    linkUrl: assertHttpUrl(p.linkUrl),
    isActive: p.isActive !== false,
  };
}

class LandingFeaturedCourseService {
  async listPublic() {
    return landingFeaturedCourseRepository.findActiveOrdered();
  }

  async listAdmin() {
    return landingFeaturedCourseRepository.findAllOrdered();
  }

  /**
   * @param {object} body
   */
  async create(body) {
    const b = body && typeof body === 'object' ? body : {};
    const row = toRowPayload({
      sortOrder: b.sortOrder,
      titleVi: b.titleVi,
      titleEn: b.titleEn,
      tagVi: b.tagVi,
      tagEn: b.tagEn,
      imageUrl: b.imageUrl,
      linkUrl: b.linkUrl,
      isActive: b.isActive,
    });
    if (!row.titleVi) {
      const err = new Error('titleVi là bắt buộc');
      err.statusCode = 400;
      throw err;
    }
    if (!row.titleEn) {
      const err = new Error('titleEn là bắt buộc');
      err.statusCode = 400;
      throw err;
    }
    return landingFeaturedCourseRepository.insert(row);
  }

  /**
   * @param {number|string} id
   * @param {object} body
   */
  async update(id, body) {
    const existing = await landingFeaturedCourseRepository.findById(id);
    if (!existing) {
      const err = new Error('Không tìm thấy khóa học nổi bật');
      err.statusCode = 404;
      throw err;
    }
    const b = body && typeof body === 'object' ? body : {};
    const merged = {
      sortOrder: b.sortOrder !== undefined ? b.sortOrder : existing.sortOrder,
      titleVi: b.titleVi !== undefined ? b.titleVi : existing.titleVi,
      titleEn: b.titleEn !== undefined ? b.titleEn : existing.titleEn,
      tagVi: b.tagVi !== undefined ? b.tagVi : existing.tagVi,
      tagEn: b.tagEn !== undefined ? b.tagEn : existing.tagEn,
      imageUrl: b.imageUrl !== undefined ? b.imageUrl : existing.imageUrl,
      linkUrl: b.linkUrl !== undefined ? b.linkUrl : existing.linkUrl,
      isActive: b.isActive !== undefined ? b.isActive : existing.isActive,
    };
    const row = toRowPayload(merged);
    if (!row.titleVi) {
      const err = new Error('titleVi là bắt buộc');
      err.statusCode = 400;
      throw err;
    }
    if (!row.titleEn) {
      const err = new Error('titleEn là bắt buộc');
      err.statusCode = 400;
      throw err;
    }
    return landingFeaturedCourseRepository.updateById(id, row);
  }

  /**
   * @param {number|string} id
   */
  async remove(id) {
    const ok = await landingFeaturedCourseRepository.deleteById(id);
    if (!ok) {
      const err = new Error('Không tìm thấy khóa học nổi bật');
      err.statusCode = 404;
      throw err;
    }
    return true;
  }
}

export default new LandingFeaturedCourseService();
