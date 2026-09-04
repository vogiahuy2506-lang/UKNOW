import landingPageAdminService from '../services/landingPage/landingPageAdmin.service.js';
import landingPageDomainService from '../services/landingPage/landingPageDomain.service.js';
import { logWorkspace, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../services/audit.service.js';
import { getWorkspaceAuditContext } from '../utils/auditContext.util.js';

/**
 * API quản trị — CRUD landing page HTML (auth + admin).
 */
class LandingPageAdminController {
  /**
   * GET /api/admin/landing-pages
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async list(req, res) {
    try {
      const rows = await landingPageAdminService.list(req.user);
      return res.json({ success: true, data: rows });
    } catch (error) {
      console.error('[LandingPageAdminController.list]', error);
      return res.status(500).json({ success: false, message: 'Không thể tải danh sách' });
    }
  }

  /**
   * GET /api/admin/landing-pages/:id
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getById(req, res) {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
      }
      const row = await landingPageAdminService.getById(id, req.user);
      return res.json({ success: true, data: row });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.getById]', error);
      return res.status(status).json({ success: false, message: error.message || 'Lỗi' });
    }
  }

  /**
   * POST /api/admin/landing-pages
   *
   * Body: slug, title?, htmlContent?, isPublished?
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async create(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Thiếu thông tin người dùng' });
      }
      const row = await landingPageAdminService.create(req.body || {}, req.user);
      await logWorkspace(
        getWorkspaceAuditContext(req),
        AUDIT_ACTIONS.LANDING_PAGE_CREATED,
        AUDIT_ENTITY_TYPES.LANDING_PAGE,
        row.id,
        { slug: row.slug, title: row.title, isPublished: row.isPublished }
      );
      return res.status(201).json({ success: true, data: row });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.create]', error);
      return res.status(status).json({ success: false, message: error.message || 'Không thể tạo', ...(error.limitReached && { limitReached: true }) });
    }
  }

  /**
   * PUT /api/admin/landing-pages/:id
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async update(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Thiếu thông tin người dùng' });
      }
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
      }
      const row = await landingPageAdminService.update(id, req.body || {}, req.user);
      await logWorkspace(
        getWorkspaceAuditContext(req),
        AUDIT_ACTIONS.LANDING_PAGE_UPDATED,
        AUDIT_ENTITY_TYPES.LANDING_PAGE,
        id,
        { slug: row.slug, title: row.title, isPublished: row.isPublished }
      );
      const response = { success: true, data: row };
      if (row?.warning) {
        response.warning = row.warning;
      }
      return res.json(response);
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.update]', error);
      return res.status(status).json({ success: false, message: error.message || 'Không thể cập nhật' });
    }
  }

  /**
   * DELETE /api/admin/landing-pages/:id
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async remove(req, res) {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
      }
      await landingPageAdminService.remove(id, req.user);
      await logWorkspace(
        getWorkspaceAuditContext(req),
        AUDIT_ACTIONS.LANDING_PAGE_DELETED,
        AUDIT_ENTITY_TYPES.LANDING_PAGE,
        id,
        {}
      );
      return res.json({ success: true });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.remove]', error);
      return res.status(status).json({ success: false, message: error.message || 'Không thể xóa' });
    }
  }

  /**
   * GET /api/admin/landing-pages/:id/custom-domain
   */
  async getCustomDomain(req, res) {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
      }
      const data = await landingPageDomainService.getForLanding(id, req.user);
      return res.json({ success: true, data });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.getCustomDomain]', error);
      return res.status(status).json({ success: false, message: error.message || 'Lỗi' });
    }
  }

  /**
   * PUT /api/admin/landing-pages/:id/custom-domain
   * Body: { hostname: "www.example.com", isApexDomain: false }
   */
  async putCustomDomain(req, res) {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
      }
      const hostname = String(req.body?.hostname || '').trim();
      const isApexDomain = Boolean(req.body?.isApexDomain);
      const data = await landingPageDomainService.setHostname(id, hostname, isApexDomain, req.user);
      await logWorkspace(
        getWorkspaceAuditContext(req),
        AUDIT_ACTIONS.LANDING_DOMAIN_UPDATED,
        AUDIT_ENTITY_TYPES.LANDING_PAGE_DOMAIN,
        id,
        { hostname: data.hostname || hostname, status: data.status, isApexDomain }
      );
      return res.json({ success: true, data });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.putCustomDomain]', error);
      return res.status(status).json({ success: false, message: error.message || 'Không thể lưu' });
    }
  }

  /**
   * POST /api/admin/landing-pages/:id/custom-domain/verify
   */
  async postCustomDomainVerify(req, res) {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
      }
      const data = await landingPageDomainService.verifyDns(id, req.user);
      await logWorkspace(
        getWorkspaceAuditContext(req),
        AUDIT_ACTIONS.LANDING_DOMAIN_VERIFIED,
        AUDIT_ENTITY_TYPES.LANDING_PAGE_DOMAIN,
        id,
        { hostname: data.hostname, status: data.status }
      );
      return res.json({ success: true, data });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.postCustomDomainVerify]', error);
      return res.status(status).json({ success: false, message: error.message || 'Xác minh thất bại' });
    }
  }

  /**
   * POST /api/admin/landing-pages/:id/custom-domain/provision-ssl
   */
  async postCustomDomainProvisionSsl(req, res) {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
      }
      const data = await landingPageDomainService.provisionSslForDomain(id, req.user);
      await logWorkspace(
        getWorkspaceAuditContext(req),
        AUDIT_ACTIONS.LANDING_DOMAIN_SSL_PROVISIONED,
        AUDIT_ENTITY_TYPES.LANDING_PAGE_DOMAIN,
        id,
        { hostname: data.hostname, status: data.status }
      );
      return res.json({ success: true, data });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.postCustomDomainProvisionSsl]', error);
      return res.status(status).json({ success: false, message: error.message || 'Cấp SSL thất bại' });
    }
  }

  /**
   * DELETE /api/admin/landing-pages/:id/custom-domain
   */
  async deleteCustomDomain(req, res) {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
      }
      const data = await landingPageDomainService.remove(id, req.user);
      await logWorkspace(
        getWorkspaceAuditContext(req),
        AUDIT_ACTIONS.LANDING_DOMAIN_DELETED,
        AUDIT_ENTITY_TYPES.LANDING_PAGE_DOMAIN,
        id,
        {}
      );
      return res.json({ success: true, data });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.deleteCustomDomain]', error);
      return res.status(status).json({ success: false, message: error.message || 'Không thể xóa' });
    }
  }

  /**
   * GET /api/admin/landing-pages/:id/versions
   */
  async listVersions(req, res) {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
      }
      const data = await landingPageAdminService.listVersions(id, req.user);
      return res.json({ success: true, data });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.listVersions]', error);
      return res.status(status).json({ success: false, message: error.message || 'Không thể tải danh sách phiên bản' });
    }
  }

  /**
   * GET /api/admin/landing-pages/:id/versions/:versionId/preview
   */
  async previewVersion(req, res) {
    try {
      const id = parseInt(String(req.params.id), 10);
      const versionId = parseInt(String(req.params.versionId), 10);
      if (!Number.isFinite(id) || !Number.isFinite(versionId)) {
        return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
      }
      const data = await landingPageAdminService.previewVersion(id, versionId, req.user);
      return res.json({ success: true, data });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.previewVersion]', error);
      return res.status(status).json({ success: false, message: error.message || 'Không thể xem trước phiên bản' });
    }
  }

  /**
   * POST /api/admin/landing-pages/:id/versions/:versionId/restore
   */
  async restoreVersion(req, res) {
    try {
      const id = parseInt(String(req.params.id), 10);
      const versionId = parseInt(String(req.params.versionId), 10);
      if (!Number.isFinite(id) || !Number.isFinite(versionId)) {
        return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
      }
      const data = await landingPageAdminService.restoreVersion(id, versionId, req.user);
      await logWorkspace(
        getWorkspaceAuditContext(req),
        AUDIT_ACTIONS.LANDING_VERSION_RESTORED,
        AUDIT_ENTITY_TYPES.LANDING_PAGE_VERSION,
        versionId,
        { landingPageId: id }
      );
      return res.json({ success: true, data, message: 'Khôi phục phiên bản thành công' });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.restoreVersion]', error);
      return res.status(status).json({ success: false, message: error.message || 'Không thể khôi phục phiên bản' });
    }
  }

  /**
   * DELETE /api/admin/landing-pages/:id/versions/:versionId
   */
  async deleteVersion(req, res) {
    try {
      const id = parseInt(String(req.params.id), 10);
      const versionId = parseInt(String(req.params.versionId), 10);
      if (!Number.isFinite(id) || !Number.isFinite(versionId)) {
        return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
      }
      const data = await landingPageAdminService.deleteVersion(id, versionId, req.user);
      await logWorkspace(
        getWorkspaceAuditContext(req),
        AUDIT_ACTIONS.LANDING_VERSION_DELETED,
        AUDIT_ENTITY_TYPES.LANDING_PAGE_VERSION,
        versionId,
        { landingPageId: id }
      );
      return res.json({ success: true, data, message: 'Đã xóa phiên bản thành công' });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.deleteVersion]', error);
      return res.status(status).json({ success: false, message: error.message || 'Không thể xóa phiên bản' });
    }
  }

  /**
   * GET /api/admin/landing-pages/:id/sheets-sync
   * Trả về cấu hình Google Sheets sync hiện tại của landing page.
   */
  async getSheetsSync(req, res) {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
      }
      const data = await landingPageAdminService.getSheetsSync(id, req.user);
      return res.json({ success: true, data });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.getSheetsSync]', error);
      return res.status(status).json({ success: false, message: error.message || 'Lỗi' });
    }
  }

  /**
   * PUT /api/admin/landing-pages/:id/sheets-sync
   * Body: { enabled: bool, webhookUrl: string, sheetName?: string, secret?: string }
   * - Cho phép admin bật/tắt auto-sync lead sang Google Sheets (qua Google Apps Script webhook).
   * - Không ghi đè các key khác trong customConfig.
   */
  async putSheetsSync(req, res) {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
      }
      const data = await landingPageAdminService.updateSheetsSync(id, req.body || {}, req.user);
      await logWorkspace(
        getWorkspaceAuditContext(req),
        AUDIT_ACTIONS.LANDING_PAGE_UPDATED,
        AUDIT_ENTITY_TYPES.LANDING_PAGE,
        id,
        { sheetsSync: data }
      );
      return res.json({ success: true, data, message: 'Đã lưu cấu hình Google Sheets' });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.putSheetsSync]', error);
      return res.status(status).json({ success: false, message: error.message || 'Không thể lưu cấu hình' });
    }
  }
}

export default new LandingPageAdminController();

