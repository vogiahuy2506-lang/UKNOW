import landingPageRepository from '../../repositories/landingPage.repository.js';
import landingPageDomainRepository from '../../repositories/landingPageDomain.repository.js';
import landingPageDomainService from './landingPageDomain.service.js';
import landingPageVersionService from './landingPageVersion.service.js';
import cloudflareService from '../cloudflare.service.js';
import { linkAssetsToLandingPage } from '../landing/landingAsset.service.js';

import db from '../../config/database.js';
import formRepository from '../../repositories/form.repository.js';
import formService from '../form.service.js';
import { checkUserResourceLimit, enforceResourceLimitTx } from '../../utils/userResourceLimit.util.js';
import {
  prepareLandingHtmlOnSave,
  resolveFrontendOriginFromEnv,
  resolvePublicApiBaseFromEnv,
  countFormSlots,
  replaceFormSlotWithEmbed,
  buildFormEmbedSectionHtml,
} from '../../utils/landingHtmlInjection.util.js';
import {
  mergeLeadFormIntoCustomConfig,
  toPublicLeadFormConfig,
  validateAdminLeadFormConfig,
} from '../../utils/landingLeadFormConfig.util.js';
import { buildFormFieldsFromLeadFormConfig } from '../../utils/landingLeadFormToFormFields.util.js';
import { getWorkspaceContext, getWorkspaceScope } from '../../utils/workspaceContext.util.js';
import {
  invalidateDomainResolverPayload,
  invalidateDomainResolverHost,
} from '../../middleware/domainResolver.js';

/** Slug dành cho landing React cố định `/l` — không quản lý qua bảng `landing_pages`. */
const RESERVED_SLUG_FIXED_LANDING = 'l';

/**
 * Convert DB row → admin DTO. Strip `customConfig` (raw JSONB), trả `leadFormConfig` đã chuẩn hoá.
 *
 * @param {object|null} row
 * @returns {object|null}
 */
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
   * @param {object} authUser
   * @returns {Promise<object[]>}
   */
  async list(authUser) {
    const rows = await landingPageRepository.listByScope(getWorkspaceScope(authUser));
    return rows
      .filter((r) => String(r.slug || '').trim().toLowerCase() !== RESERVED_SLUG_FIXED_LANDING)
      .map((r) => toAdminLandingDto(r));
  }

  /**
   * @param {number} id
   * @param {object} authUser
   * @returns {Promise<object>}
   */
  async getById(id, authUser) {
    const row = await landingPageRepository.findByIdInScope(id, getWorkspaceScope(authUser));
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
    const context = getWorkspaceContext(authUser);

    const limitCheck = await checkUserResourceLimit({
      userId: context.workspaceOwnerId,
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
    /** Merge `body.leadFormConfig` vào customConfig JSONB (giữ key khác nếu có). */
    const customConfig = mergeLeadFormIntoCustomConfig(
      {},
      body?.leadFormConfig
    );

    // PR-5b-2a — chỗ trống Biểu mẫu (không phụ thuộc AI_LANDING_FORM_MODE — người dùng có thể dán
    // tay <div data-founderai-form-slot></div>). 2+ → 400, không lưu gì, không tạo gì. Đúng 1:
    // landing CHƯA có id lúc này (insert bên dưới) nên tạo form TRƯỚC (landing_page_id để trống),
    // gắn lại NGAY TRONG transaction insert landing (client.query bên dưới) — lỡ transaction đó
    // rollback thì form (tạo qua pool, khác connection nên không tự rollback theo) mồ côi tạm
    // thời, dọn ở nhánh catch. Landing trong DB, nếu có, LUÔN mang HTML đã resolve — không bao
    // giờ lưu chỗ trống trơ (khách mở ra thấy khoảng trống im lặng).
    const rawHtml = body?.htmlContent ?? '';
    const slotCount = countFormSlots(rawHtml);
    if (slotCount > 1) {
      const err = new Error(`Trang có ${slotCount} chỗ trống biểu mẫu, chỉ được đúng 1.`);
      err.statusCode = 400;
      throw err;
    }
    let htmlWithFormResolved = rawHtml;
    let newForm = null;
    if (slotCount === 1) {
      const fields = buildFormFieldsFromLeadFormConfig(customConfig.leadForm);
      const formTitle = String(body?.title || '').trim().slice(0, 200) || slug || 'Biểu mẫu landing';
      newForm = await formService.createForm({
        workspaceOwnerId: context.workspaceOwnerId,
        createdByUserId: context.actorUserId,
        title: formTitle,
        fields,
        settings: { consentEnabled: true, notifyOwner: true },
      });
      await formService.publishForm(newForm.id, context.workspaceOwnerId, true);
      const embedHtml = buildFormEmbedSectionHtml({
        publicKey: newForm.publicKey,
        origin: resolveFrontendOriginFromEnv(),
      });
      htmlWithFormResolved = replaceFormSlotWithEmbed(rawHtml, embedHtml);
    }

    /** Khi lưu: gỡ khối script cũ, đổi href http(s) sang link tracking, chèn lp-track.js + founderai-capture.js. */
    const htmlContent = prepareLandingHtmlOnSave(htmlWithFormResolved, {
      slug,
      frontendOrigin: resolveFrontendOriginFromEnv(),
      apiBase: resolvePublicApiBaseFromEnv(),
    });

    const client = await db.getClient();
    let lp;
    try {
      await client.query('BEGIN');
      await enforceResourceLimitTx(client, {
        userId: context.workspaceOwnerId,
        roleCode: authUser?.role,
        resourceKey: 'landingPages',
      });
      lp = await landingPageRepository.insert({
        slug,
        title: body?.title,
        htmlContent,
        isPublished: Boolean(body?.isPublished),
        idUser: context.workspaceOwnerId,
        workspaceOwnerId: context.workspaceOwnerId,
        createdBy: context.actorUserId,
        domainType,
        domainSubtype,
        customConfig,
      }, client);
      if (newForm) {
        await formRepository.setLandingPageId(newForm.id, lp.id, client);
      }
      await linkAssetsToLandingPage({
        html: htmlContent,
        ownerUserId: context.workspaceOwnerId,
        landingPageId: lp.id,
        client,
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (newForm) {
        // Form đã tạo (pool) nhưng landing chưa từng tồn tại (transaction rollback) → mồ côi,
        // dọn ngay thay vì để lại một Biểu mẫu không gắn landing nào, không ai biết tới.
        await formService.deleteForm(newForm.id, context.workspaceOwnerId).catch((cleanupErr) => {
          console.warn('[LandingPageAdmin.create] Không xoá được form mồ côi sau lỗi lưu landing:', cleanupErr.message);
        });
      }
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
    const context = getWorkspaceContext(authUser);
    const scope = getWorkspaceScope(authUser);
    const slugRaw = body?.slug;
    const slug = typeof slugRaw === 'string' ? slugRaw.trim().toLowerCase() : null;
    this.assertNotReservedSlug(slug);
    if (!landingPageRepository.isValidSlug(slug)) {
      const err = new Error('Slug không hợp lệ (chữ thường, số, dấu - và _; bắt đầu bằng chữ hoặc số)');
      err.statusCode = 400;
      throw err;
    }
    const current = await landingPageRepository.findByIdInScope(id, scope);
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    const resourceOwnerId = context.isSuperAdmin
      ? Number(current.workspaceOwnerId || current.idUser)
      : context.workspaceOwnerId;
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

    /** Merge `body.leadFormConfig` vào customConfig hiện tại (giữ key khác nếu có). */
    const nextCustomConfig = mergeLeadFormIntoCustomConfig(
      current.customConfig,
      body?.leadFormConfig
    );

    // PR-5b-2a — chỗ trống Biểu mẫu (không phụ thuộc AI_LANDING_FORM_MODE — người dùng có thể dán
    // tay <div data-founderai-form-slot></div>). 2+ → 400, không lưu gì. Đúng 1: landing ĐÃ có id
    // (khác create()) nên KHÔNG có cửa sổ mồ côi — form đã gắn landing này thì DÙNG LẠI nguyên
    // trạng (không ghi đè trường — chủ có thể đã tự sửa form trong trình soạn Biểu mẫu riêng),
    // chưa có thì tạo mới VỚI landing_page_id=id ngay trong một lần INSERT.
    const rawHtml = body?.htmlContent ?? '';
    const slotCount = countFormSlots(rawHtml);
    if (slotCount > 1) {
      const err = new Error(`Trang có ${slotCount} chỗ trống biểu mẫu, chỉ được đúng 1.`);
      err.statusCode = 400;
      throw err;
    }
    let htmlWithFormResolved = rawHtml;
    if (slotCount === 1) {
      let form = await formRepository.findByLandingPageId(id, resourceOwnerId);
      if (!form) {
        const fields = buildFormFieldsFromLeadFormConfig(nextCustomConfig.leadForm);
        const formTitle = String(body?.title || current.title || '').trim().slice(0, 200)
          || slug || current.slug || 'Biểu mẫu landing';
        const createdForm = await formService.createForm({
          workspaceOwnerId: resourceOwnerId,
          createdByUserId: context.actorUserId,
          title: formTitle,
          fields,
          settings: { consentEnabled: true, notifyOwner: true },
          landingPageId: id,
        });
        await formService.publishForm(createdForm.id, resourceOwnerId, true);
        form = createdForm;
      }
      const embedHtml = buildFormEmbedSectionHtml({
        publicKey: form.publicKey,
        origin: resolveFrontendOriginFromEnv(),
      });
      htmlWithFormResolved = replaceFormSlotWithEmbed(rawHtml, embedHtml);
    }

    const htmlContent = prepareLandingHtmlOnSave(htmlWithFormResolved, {
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

    const updated = await landingPageRepository.updateByIdInScope(id, {
      slug,
      title: body?.title,
      htmlContent,
      isPublished: body?.isPublished !== undefined ? Boolean(body.isPublished) : current.isPublished,
      idUser: resourceOwnerId,
      domainType: nextDomainType,
      domainSubtype: nextDomainSubtype,
      customConfig: nextCustomConfig,
    }, scope);
    if (!updated) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }

    await linkAssetsToLandingPage({
      html: htmlContent,
      ownerUserId: resourceOwnerId,
      landingPageId: id,
    });

    // Nếu HTML thay đổi và bản hiện tại đã có HTML, chụp lại phiên bản cũ lên GCS sau khi update DB thành công
    let snapshotWarning = null;
    if (current.htmlContent && current.htmlContent !== htmlContent) {
      const snapRes = await landingPageVersionService.createSnapshotIfChanged({
        landingPageId: id,
        workspaceOwnerId: resourceOwnerId,
        actorUserId: context.actorUserId,
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

    // Invalidate L1 domain resolver caches & find domain hostname
    let activeHostname = null;
    try {
      invalidateDomainResolverPayload(id, current.slug);
      if (slug && slug !== current.slug) {
        invalidateDomainResolverPayload(id, slug);
      }
      const domainRow = await landingPageDomainRepository.findByLandingPageId(id).catch(() => null);
      if (domainRow?.hostname) {
        activeHostname = domainRow.hostname;
        invalidateDomainResolverHost(domainRow.hostname);
      }
    } catch (e) {
      console.warn('[LandingPageAdmin.update] cache invalidation failed:', e.message);
    }

    // Trigger non-blocking Cloudflare purge for updated page (both slug and hostname)
    cloudflareService.purgeLandingCache({
      slug: slug || current.slug,
      hostname: activeHostname,
    }).catch((e) =>
      console.warn('[LandingPageAdmin.update] Cloudflare purge failed:', e.message)
    );

    const dto = toAdminLandingDto(updated);
    if (snapshotWarning && dto) {
      dto.warning = snapshotWarning;
    }
    return dto;
  }

  /**
   * @param {number} id
   * @param {object} authUser
   * @returns {Promise<boolean>}
   */
  async remove(id, authUser) {
    const scope = getWorkspaceScope(authUser);
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

    // Lấy domain record trước khi xóa
    let activeHostname = null;
    try {
      const domainRow = await landingPageDomainRepository.findByLandingPageId(id).catch(() => null);
      if (domainRow?.hostname) {
        activeHostname = domainRow.hostname;
      }
    } catch {
      // ignore
    }

    // Xóa subdomain Cloudflare trước khi xóa bản ghi (lỗi CF không fail request)
    await landingPageDomainService.removeSubdomain(id).catch((e) =>
      console.warn('[LandingPageAdmin.remove] removeSubdomain failed:', e.message)
    );

    const ok = await landingPageRepository.deleteByIdInScope(id, scope);
    if (!ok) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }

    // Invalidate L1 domain resolver cache
    try {
      invalidateDomainResolverPayload(id, current.slug);
      if (activeHostname) {
        invalidateDomainResolverHost(activeHostname);
      }
    } catch (e) {
      console.warn('[LandingPageAdmin.remove] cache invalidation failed:', e.message);
    }

    // Trigger non-blocking Cloudflare purge
    cloudflareService.purgeLandingCache({
      slug: current.slug,
      hostname: activeHostname,
    }).catch((e) =>
      console.warn('[LandingPageAdmin.remove] Cloudflare purge failed:', e.message)
    );

    return true;
  }


  /**
   * Lấy danh sách các phiên bản của landing page
   */
  async listVersions(id, authUser) {
    const current = await landingPageRepository.findByIdInScope(id, getWorkspaceScope(authUser));
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    return landingPageVersionService.listVersions(id, current.workspaceOwnerId || current.idUser);
  }

  /**
   * Xem trước nội dung HTML của một phiên bản
   */
  async previewVersion(id, versionId, authUser) {
    const current = await landingPageRepository.findByIdInScope(id, getWorkspaceScope(authUser));
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    return landingPageVersionService.getVersionHtml(
      versionId,
      id,
      current.workspaceOwnerId || current.idUser
    );
  }

  /**
   * Khôi phục landing page về phiên bản chỉ định
   */
  async restoreVersion(id, versionId, authUser) {
    const current = await landingPageRepository.findByIdInScope(id, getWorkspaceScope(authUser));
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    const versionData = await landingPageVersionService.getVersionHtml(
      versionId,
      id,
      current.workspaceOwnerId || current.idUser
    );
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
    const current = await landingPageRepository.findByIdInScope(id, getWorkspaceScope(authUser));
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    return landingPageVersionService.deleteVersion(
      versionId,
      id,
      current.workspaceOwnerId || current.idUser
    );
  }

  /**
   * Lấy cấu hình Google Sheets sync của landing page.
   * DTO an toàn — không lộ secret.
   *
   * @param {number} id
   * @param {object} authUser
   */
  async getSheetsSync(id, authUser) {
    const current = await landingPageRepository.findByIdInScope(id, getWorkspaceScope(authUser));
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    const cfg = (current.customConfig && current.customConfig.googleSheetsSync) || {};
    const webhookUrl = String(cfg.webhookUrl || '').trim();
    const sheetName = String(cfg.sheetName || '').trim();
    const hasSecret = Boolean(cfg.secret);
    return {
      enabled: Boolean(cfg.enabled),
      webhookUrl,
      sheetName,
      hasSecret,
      lastSyncAt: current.customConfig?.googleSheetsLastSyncAt || null,
      lastError: current.customConfig?.googleSheetsLastError || null,
    };
  }

  /**
   * Cập nhật cấu hình Google Sheets sync — lưu vào customConfig.googleSheetsSync.
   * Validate URL (chỉ https hoặc localhost).
   *
   * @param {number} id
   * @param {{enabled?: boolean, webhookUrl?: string, sheetName?: string, secret?: string|null}} body
   * @param {object} authUser
   */
  async updateSheetsSync(id, body, authUser) {
    const scope = getWorkspaceScope(authUser);
    const current = await landingPageRepository.findByIdInScope(id, scope);
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }

    const enabled = body?.enabled === true;
    const rawUrl = String(body?.webhookUrl || '').trim();
    const sheetName = String(body?.sheetName || '').trim().slice(0, 100);
    const incomingSecret = body?.secret;
    const removeSecret = incomingSecret === null || incomingSecret === '';

    let safeUrl = '';
    if (enabled) {
      if (!rawUrl) {
        const err = new Error('Bật sync thì phải nhập Webhook URL của Google Apps Script');
        err.statusCode = 400;
        throw err;
      }
      try {
        const u = new URL(rawUrl);
        const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
        if (u.protocol !== 'https:' && !isLocal) {
          throw new Error('Webhook URL phải là https:// (Google Apps Script luôn dùng https)');
        }
        if (!/(^|\.)googleusercontent\.com$|(^|\.)script\.google\.com$|(^|\.)googleapis\.com$/.test(u.hostname) && !isLocal) {
          throw new Error('URL phải thuộc script.google.com hoặc *.googleusercontent.com (Google Apps Script)');
        }
        safeUrl = u.toString();
      } catch (e) {
        const err = new Error(e.message || 'Webhook URL không hợp lệ');
        err.statusCode = 400;
        throw err;
      }
    }

    // Merge vào customConfig hiện tại - không ghi đè các key khác
    const existingCustom = (current.customConfig && typeof current.customConfig === 'object')
      ? { ...current.customConfig }
      : {};
    delete existingCustom.__proto__;

    const nextSheetsSync = {
      enabled,
      webhookUrl: enabled ? safeUrl : '',
      sheetName,
    };
    if (removeSecret) {
      delete nextSheetsSync.secret;
    } else if (typeof incomingSecret === 'string' && incomingSecret.length > 0) {
      nextSheetsSync.secret = String(incomingSecret).slice(0, 200);
    } else if (existingCustom.googleSheetsSync?.secret) {
      nextSheetsSync.secret = existingCustom.googleSheetsSync.secret;
    }
    // Khi tắt → xóa hẳn để payload gọn
    if (!enabled) {
      delete existingCustom.googleSheetsSync;
    } else {
      existingCustom.googleSheetsSync = nextSheetsSync;
    }

    const updated = await landingPageRepository.updateByIdInScope(id, {
      customConfig: existingCustom,
    }, scope);
    if (!updated) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }

    return {
      enabled,
      webhookUrl: enabled ? safeUrl : '',
      sheetName,
      hasSecret: Boolean(nextSheetsSync.secret),
    };
  }
}

export default new LandingPageAdminService();

