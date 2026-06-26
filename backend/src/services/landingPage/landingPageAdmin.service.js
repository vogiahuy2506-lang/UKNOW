import landingPageRepository from '../../repositories/landingPage.repository.js';
import landingPageDomainService from './landingPageDomain.service.js';
import db from '../../config/database.js';
import { checkUserResourceLimit, enforceResourceLimitTx } from '../../utils/userResourceLimit.util.js';
import {
  prepareLandingHtmlOnSave,
  resolveFrontendOriginFromEnv,
  resolvePublicApiBaseFromEnv,
} from '../../utils/landingHtmlInjection.util.js';

/** Slug dành cho landing React cố định `/l` — không quản lý qua bảng `landing_pages`. */
const RESERVED_SLUG_FIXED_LANDING = 'l';

function buildScopeFromAuthUser(authUser) {
  return {
    userId: authUser?.id,
    roleCode: authUser?.role,
    ownerId: authUser?.activeContext?.ownerId,
  };
}

/**
 * CRUD landing page HTML theo phạm vi quyền user.
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
   * Lấy danh sách landing trong phạm vi quyền của user hiện tại.
   *
   * @param {{ userId: number|string, roleCode?: string }} scope
   * @returns {Promise<object[]>}
   */
  async list(scope = {}) {
    const rows = await landingPageRepository.listByScope(scope);
    return rows.filter((r) => String(r.slug || '').trim().toLowerCase() !== RESERVED_SLUG_FIXED_LANDING);
  }

  /**
   * @param {number} id
   * @param {{ userId: number|string, roleCode?: string }} scope
   * @returns {Promise<object>}
   */
  async getById(id, scope = {}) {
    const row = await landingPageRepository.findByIdInScope(id, scope);
    if (!row) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    return row;
  }

  /**
   * @param {object} body
   * @param {{ id: number|string, role_code?: string }} authUser
   * @returns {Promise<object>}
   */
  async create(body, authUser) {
    const userId = Number.parseInt(authUser?.id, 10);
    if (!Number.isFinite(userId)) {
      const err = new Error('Thiếu thông tin người dùng');
      err.statusCode = 401;
      throw err;
    }

    const limitCheck = await checkUserResourceLimit({
      userId,
      roleCode: authUser?.role,
      resourceKey: 'landingPages',
    });
    if (!limitCheck.allowed) {
      const err = new Error(limitCheck.message || 'Đã đạt giới hạn landing page cho tài khoản hiện tại');
      err.statusCode = 400;
      err.limitReached = true;
      throw err;
    }

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
    /** Khi lưu: gỡ khối Founder AI cũ, đổi href http(s) sang link tracking, chèn lp-track.js (không tự chèn iframe). */
    const htmlContent = prepareLandingHtmlOnSave(body?.htmlContent ?? '', {
      slug,
      frontendOrigin: resolveFrontendOriginFromEnv(),
      apiBase: resolvePublicApiBaseFromEnv(),
    });

    const client = await db.getClient();
    let lp;
    try {
      await client.query('BEGIN');
      await enforceResourceLimitTx(client, {
        userId,
        roleCode: authUser?.role,
        resourceKey: 'landingPages',
      });
      lp = await landingPageRepository.insert({
        slug,
        title: body?.title,
        htmlContent,
        isPublished: Boolean(body?.isPublished),
        idUser: userId,
      }, client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // Tự động cấp subdomain slug.founderai.biz qua Cloudflare (lỗi CF không làm fail)
    const domainResult = await landingPageDomainService.autoProvisionSubdomain(lp.id, slug);
    return {
      ...lp,
      customDomain: domainResult.hostname,
      cfManaged: domainResult.cfManaged,
      customDomainProvisioned: domainResult.ok === true,
      customDomainMessage: domainResult.message || null,
    };
  }

  /**
   * @param {number} id
   * @param {object} body
   * @param {{ id: number|string, role_code?: string }} authUser
   * @returns {Promise<object>}
   */
  async update(id, body, authUser) {
    const slug = String(body?.slug || '').trim().toLowerCase();
    this.assertNotReservedSlug(slug);
    if (!landingPageRepository.isValidSlug(slug)) {
      const err = new Error('Slug không hợp lệ (chữ thường, số, dấu - và _; bắt đầu bằng chữ hoặc số)');
      err.statusCode = 400;
      throw err;
    }
    const current = await landingPageRepository.findByIdInScope(id, buildScopeFromAuthUser(authUser));
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
      idUser: current.idUser,
    });

    // Nếu slug thay đổi → xóa subdomain cũ, cấp subdomain mới (lỗi CF không fail request)
    if (slug !== current.slug) {
      await landingPageDomainService.removeSubdomain(id).catch((e) =>
        console.warn('[LandingPageAdmin.update] removeSubdomain failed:', e.message)
      );
      await landingPageDomainService.autoProvisionSubdomain(id, slug).catch((e) =>
        console.warn('[LandingPageAdmin.update] autoProvisionSubdomain failed:', e.message)
      );
    }

    return updated;
  }

  /**
   * @param {number} id
   * @param {{ userId: number|string, roleCode?: string }} scope
   * @returns {Promise<boolean>}
   */
  async remove(id, scope = {}) {
    const current = await landingPageRepository.findByIdInScope(id, scope);
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
    // Xóa subdomain Cloudflare trước khi xóa bản ghi (lỗi CF không fail request)
    await landingPageDomainService.removeSubdomain(id).catch((e) =>
      console.warn('[LandingPageAdmin.remove] removeSubdomain failed:', e.message)
    );

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
