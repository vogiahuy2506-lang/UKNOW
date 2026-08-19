import landingPageRepository from '../../repositories/landingPage.repository.js';
import landingPageDomainService from './landingPageDomain.service.js';
import landingPageVersionService from './landingPageVersion.service.js';
import db from '../../config/database.js';
import { checkUserResourceLimit, enforceResourceLimitTx } from '../../utils/userResourceLimit.util.js';
import {
  prepareLandingHtmlOnSave,
  resolveFrontendOriginFromEnv,
  resolvePublicApiBaseFromEnv,
} from '../../utils/landingHtmlInjection.util.js';
import {
  mergeLeadFormIntoCustomConfig,
  toPublicLeadFormConfig,
} from '../../utils/landingLeadFormConfig.util.js';

/** Slug dành cho landing React cố định `/l` — không quản lý qua bảng `landing_pages`. */
const RESERVED_SLUG_FIXED_LANDING = 'l';

function buildScopeFromAuthUser(authUser) {
  return {
    userId: authUser?.id,
    roleCode: authUser?.role,
    ownerId: authUser?.activeContext?.ownerId,
  };
}

function toAdminLandingDto(row) {
  if (!row) return null;
  const { customConfig, ...rest } = row;
  return {
    ...rest,
    leadFormConfig: toPublicLeadFormConfig(customConfig),
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
    return rows
      .filter((r) => String(r.slug || '').trim().toLowerCase() !== RESERVED_SLUG_FIXED_LANDING)
      .map((r) => toAdminLandingDto(r));
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
    return toAdminLandingDto(row);
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

    const slugRaw = body?.slug;
    const slug = typeof slugRaw === 'string' ? slugRaw.trim().toLowerCase() : null;
    const domainType = body?.domainType === 'custom' ? 'custom' : 'system';
    const domainSubtype = domainType === 'custom'
      ? (body?.domainSubtype === 'apex' ? 'apex' : 'subdomain')
      : null;
    this.assertNotReservedSlug(slug);
    if (!landingPageRepository.isValidSlug(slug)) {
      const err = new Error('Slug không hợp lệ (chữ thường, số, dấu - và _; bắt đầu bằng chữ hoặc số)');
      err.statusCode = 400;
      throw err;
    }
    if (slug) {
      const existing = await landingPageRepository.findBySlugAny(slug);
      if (existing) {
        const err = new Error('Slug đã tồn tại');
        err.statusCode = 409;
        throw err;
      }
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
        domainType,
        domainSubtype,
        customConfig: mergeLeadFormIntoCustomConfig({}, body?.leadFormConfig),
      }, client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // Tự động cấp subdomain slug.founderai.biz qua Cloudflare (chỉ khi user chọn system domain
    // VÀ đã nhập slug). Nếu slug rỗng, không cấp subdomain miễn phí — landing phải gắn custom domain.
    // Lỗi CF không làm fail toàn bộ request.
    if (domainType === 'system' && slug) {
      const domainResult = await landingPageDomainService.autoProvisionSubdomain(lp.id, slug);
      return {
        ...toAdminLandingDto(lp),
        customDomain: domainResult.hostname,
        cfManaged: domainResult.cfManaged,
        customDomainProvisioned: domainResult.ok === true,
        customDomainMessage: domainResult.message || null,
      };
    }
    return toAdminLandingDto(lp);
  }

  /**
   * @param {number} id
   * @param {object} body
   * @param {{ id: number|string, role_code?: string }} authUser
   * @returns {Promise<object>}
   */
  async update(id, body, authUser) {
    const slugRaw = body?.slug;
    const slug = typeof slugRaw === 'string' ? slugRaw.trim().toLowerCase() : null;
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
    if (slug && slug !== current.slug) {
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

    // domainType / domainSubtype chỉ thay đổi khi user gửi lên rõ ràng.
    const incomingType = body?.domainType;
    const nextDomainType = incomingType === 'custom' || incomingType === 'system'
      ? incomingType
      : (current.domainType || 'system');
    const nextDomainSubtype = nextDomainType === 'custom'
      ? (body?.domainSubtype === 'apex' ? 'apex' : 'subdomain')
      : null;
    const typeChanged = nextDomainType !== (current.domainType || 'system');

    const nextCustomConfig = Object.prototype.hasOwnProperty.call(body || {}, 'leadFormConfig')
      ? mergeLeadFormIntoCustomConfig(current.customConfig, body.leadFormConfig)
      : mergeLeadFormIntoCustomConfig(current.customConfig, undefined);

    const updated = await landingPageRepository.updateById(id, {
      slug,
      title: body?.title,
      htmlContent,
      isPublished: body?.isPublished !== undefined ? Boolean(body.isPublished) : current.isPublished,
      idUser: current.idUser,
      domainType: nextDomainType,
      domainSubtype: nextDomainSubtype,
      customConfig: nextCustomConfig,
    });

    // Nếu HTML thay đổi và bản hiện tại đã có HTML, chụp lại phiên bản cũ lên GCS sau khi update DB thành công
    let snapshotWarning = null;
    if (current.htmlContent && current.htmlContent !== htmlContent) {
      const snapRes = await landingPageVersionService.createSnapshotIfChanged({
        landingPageId: id,
        userId: current.idUser,
        actorUserId: authUser?.id,
        oldHtml: current.htmlContent,
        title: current.title,
        source: body?.versionSource || 'manual',
      }).catch((snapErr) => {
        console.warn('[LandingPageAdmin.update] createSnapshotIfChanged failed:', snapErr.message);
        return null;
      });
      if (snapRes?.warning) {
        snapshotWarning = snapRes.warning;
      }
    }

    // Đồng bộ DNS:
    //  - system → custom : xóa CF subdomain cũ (nếu có) để giải phóng DNS, user sẽ tự cấu hình hostname mới.
    //  - custom → system : xóa custom hostname (nếu có), cấp lại slug.founderai.biz qua CF (nếu slug có).
    //  - system → system (slug đổi): giữ behavior cũ (removeSubdomain + autoProvision) — chỉ khi slug có.
    if (typeChanged) {
      if (nextDomainType === 'custom') {
        // Chuyển sang custom: gỡ CF subdomain miễn phí, để user nhập hostname riêng.
        await landingPageDomainService.removeSubdomain(id).catch((e) =>
          console.warn('[LandingPageAdmin.update] removeSubdomain on switch→custom failed:', e.message)
        );
      } else {
        // Chuyển về system: gỡ custom hostname (nếu có) rồi cấp slug.founderai.biz (nếu slug).
        await landingPageDomainService.removeSubdomain(id).catch((e) =>
          console.warn('[LandingPageAdmin.update] removeSubdomain on switch→system failed:', e.message)
        );
        if (slug) {
          await landingPageDomainService.autoProvisionSubdomain(id, slug).catch((e) =>
            console.warn('[LandingPageAdmin.update] autoProvisionSubdomain on switch→system failed:', e.message)
          );
        }
      }
    } else if (slug && slug !== current.slug) {
      // System → system mà slug đổi: giữ behavior cũ.
      await landingPageDomainService.removeSubdomain(id).catch((e) =>
        console.warn('[LandingPageAdmin.update] removeSubdomain failed:', e.message)
      );
      await landingPageDomainService.autoProvisionSubdomain(id, slug).catch((e) =>
        console.warn('[LandingPageAdmin.update] autoProvisionSubdomain failed:', e.message)
      );
    }

    const dto = toAdminLandingDto(updated);
    if (snapshotWarning && dto) {
      dto.warning = snapshotWarning;
    }
    return dto;
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

  /**
   * Lấy danh sách các phiên bản của landing page
   */
  async listVersions(id, authUser) {
    const current = await landingPageRepository.findByIdInScope(id, buildScopeFromAuthUser(authUser));
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    return landingPageVersionService.listVersions(id, current.idUser);
  }

  /**
   * Xem trước nội dung HTML của một phiên bản
   */
  async previewVersion(id, versionId, authUser) {
    const current = await landingPageRepository.findByIdInScope(id, buildScopeFromAuthUser(authUser));
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    return landingPageVersionService.getVersionHtml(versionId, id, current.idUser);
  }

  /**
   * Khôi phục landing page về phiên bản chỉ định
   */
  async restoreVersion(id, versionId, authUser) {
    const current = await landingPageRepository.findByIdInScope(id, buildScopeFromAuthUser(authUser));
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    const versionData = await landingPageVersionService.getVersionHtml(versionId, id, current.idUser);
    return this.update(
      id,
      {
        slug: current.slug,
        title: current.title,
        htmlContent: versionData.htmlContent,
        versionSource: 'rollback',
      },
      authUser
    );
  }

  /**
   * Xóa một phiên bản lịch sử
   */
  async deleteVersion(id, versionId, authUser) {
    const current = await landingPageRepository.findByIdInScope(id, buildScopeFromAuthUser(authUser));
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    return landingPageVersionService.deleteVersion(versionId, id, current.idUser);
  }
}

export default new LandingPageAdminService();

