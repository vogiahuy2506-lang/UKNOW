import landingPageRepository from '../../repositories/landingPage.repository.js';
import {
  prepareLandingHtmlOnSave,
  resolveFrontendOriginFromEnv,
  resolvePublicApiBaseFromEnv,
} from '../../utils/landingHtmlInjection.util.js';

/** Slug dành cho landing React cố định `/l` — không quản lý qua bảng `landing_pages`. */
const RESERVED_SLUG_FIXED_LANDING = 'l';

/**
 * CRUD landing page HTML (admin).
 */
class LandingPageAdminService {
  /**
   * @param {string} slug
   */
  assertNotReservedSlug(slug) {
    if (String(slug || '').trim().toLowerCase() === RESERVED_SLUG_FIXED_LANDING) {
      const err = new Error(
        'Slug "l" dành cho landing cố định tại đường dẫn /l; không tạo/sửa qua CMS này.'
      );
      err.statusCode = 400;
      throw err;
    }
  }

  /**
   * @returns {Promise<object[]>}
   */
  async list() {
    const rows = await landingPageRepository.listAllForAdmin();
    return rows.filter((r) => String(r.slug || '').trim().toLowerCase() !== RESERVED_SLUG_FIXED_LANDING);
  }

  /**
   * @param {number} id
   * @returns {Promise<object>}
   */
  async getById(id) {
    const row = await landingPageRepository.findById(id);
    if (!row) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    return row;
  }

  /**
   * @param {object} body
   * @param {number} idUser
   * @returns {Promise<object>}
   */
  async create(body, idUser) {
    const slug = String(body?.slug || '').trim().toLowerCase();
    this.assertNotReservedSlug(slug);
    if (!landingPageRepository.isValidSlug(slug)) {
      const err = new Error('Slug không hợp lệ (chữ thường, số, dấu - và _; bắt đầu bằng chữ hoặc số)');
      err.statusCode = 400;
      throw err;
    }
    const existing = await landingPageRepository.findBySlugAny(slug);
    if (existing) {
      const err = new Error('Slug đã tồn tại');
      err.statusCode = 409;
      throw err;
    }
    /** Khi lưu: gỡ khối UKnow cũ, đổi href http(s) sang link tracking, chèn lp-track.js (không tự chèn iframe). */
    const htmlContent = prepareLandingHtmlOnSave(body?.htmlContent ?? '', {
      slug,
      frontendOrigin: resolveFrontendOriginFromEnv(),
      apiBase: resolvePublicApiBaseFromEnv(),
    });
    return landingPageRepository.insert({
      slug,
      title: body?.title,
      htmlContent,
      isPublished: Boolean(body?.isPublished),
      idUser,
    });
  }

  /**
   * @param {number} id
   * @param {object} body
   * @param {number} idUser
   * @returns {Promise<object>}
   */
  async update(id, body, idUser) {
    const slug = String(body?.slug || '').trim().toLowerCase();
    this.assertNotReservedSlug(slug);
    if (!landingPageRepository.isValidSlug(slug)) {
      const err = new Error('Slug không hợp lệ (chữ thường, số, dấu - và _; bắt đầu bằng chữ hoặc số)');
      err.statusCode = 400;
      throw err;
    }
    const current = await landingPageRepository.findById(id);
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    if (String(current.slug || '').trim().toLowerCase() === RESERVED_SLUG_FIXED_LANDING) {
      const err = new Error('Không được sửa bản ghi slug "l" — đây là landing hệ thống.');
      err.statusCode = 403;
      throw err;
    }
    if (slug !== current.slug) {
      const clash = await landingPageRepository.findBySlugAny(slug);
      if (clash) {
        const err = new Error('Slug đã được dùng cho landing khác');
        err.statusCode = 409;
        throw err;
      }
    }
    const htmlContent = prepareLandingHtmlOnSave(body?.htmlContent ?? '', {
      slug,
      frontendOrigin: resolveFrontendOriginFromEnv(),
      apiBase: resolvePublicApiBaseFromEnv(),
    });
    const updated = await landingPageRepository.updateById(id, {
      slug,
      title: body?.title,
      htmlContent,
      isPublished: body?.isPublished !== undefined ? Boolean(body.isPublished) : current.isPublished,
      idUser,
    });
    return updated;
  }

  /**
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  async remove(id) {
    const current = await landingPageRepository.findById(id);
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    if (String(current.slug || '').trim().toLowerCase() === RESERVED_SLUG_FIXED_LANDING) {
      const err = new Error('Không được xóa landing slug "l" — đây là landing hệ thống.');
      err.statusCode = 403;
      throw err;
    }
    const ok = await landingPageRepository.deleteById(id);
    if (!ok) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    return true;
  }
}

export default new LandingPageAdminService();
