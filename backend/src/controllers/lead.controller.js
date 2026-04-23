import leadService from '../services/lead/lead.service.js';
import { clampLandingLeadsLimit } from '../utils/landingLeadsLimit.util.js';

/**
 * Parse query chung cho preview và danh sách admin (lọc lead landing).
 *
 * @param {Record<string, unknown>} q
 * @returns {object}
 */
function parseLandingLeadFilters(q) {
  let occupations = [];
  let interests = [];
  let landingSlugs = [];
  try {
    if (q.landingLeadsOccupations) {
      occupations = JSON.parse(String(q.landingLeadsOccupations));
    }
  } catch {
    occupations = [];
  }
  try {
    if (q.landingLeadsInterests) {
      interests = JSON.parse(String(q.landingLeadsInterests));
    }
  } catch {
    interests = [];
  }
  try {
    if (q.landingLeadsSlugs) {
      landingSlugs = JSON.parse(String(q.landingLeadsSlugs));
    }
  } catch {
    landingSlugs = [];
  }

  return {
    landingLeadsUseDateRange: String(q.landingLeadsUseDateRange || '').toLowerCase() === 'true'
      || q.landingLeadsUseDateRange === true
      || q.landingLeadsUseDateRange === '1',
    landingLeadsDateFrom: q.landingLeadsDateFrom || '',
    landingLeadsDateTo: q.landingLeadsDateTo || '',
    landingLeadsOccupations: Array.isArray(occupations) ? occupations : [],
    landingLeadsInterests: Array.isArray(interests) ? interests : [],
    landingLeadsSlugs: Array.isArray(landingSlugs) ? landingSlugs : [],
    landingLeadsLimit: q.landingLeadsLimit,
  };
}

/**
 * Controller lead có auth — preview dữ liệu cho Campaign Builder + danh sách admin.
 */
class LeadController {
  /**
   * GET /api/leads/preview
   * Query: landingLeadsUseDateRange, landingLeadsDateFrom, landingLeadsDateTo,
   *        landingLeadsOccupations (JSON array string), landingLeadsInterests (JSON array string),
   *        landingLeadsSlugs (JSON array string slug landing, rỗng = không lọc theo slug),
   *        landingLeadsLimit
   *
   * Response: { success, data: { items, pagination: { total, limit, fetched } } }
   */
  async preview(req, res) {
    try {
      const config = parseLandingLeadFilters(req.query || {});
      const { items, total } = await leadService.getLeadsForCampaignConfig(config);
      const limitNorm = clampLandingLeadsLimit(config.landingLeadsLimit, 1000);

      return res.json({
        success: true,
        data: {
          items,
          pagination: {
            total,
            limit: limitNorm,
            fetched: items.length,
          },
        },
      });
    } catch (error) {
      console.error('[LeadController.preview]', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Không thể tải dữ liệu lead',
      });
    }
  }

  /**
   * GET /api/leads
   * Danh sách lead form landing cho màn hình quản trị (có phân trang).
   *
   * Query:
   * - page (mặc định 1)
   * - pageSize (mặc định 20, tối đa 100)
   * - Cùng bộ tham số lọc như preview: landingLeadsUseDateRange, landingLeadsDateFrom, landingLeadsDateTo,
   *   landingLeadsOccupations, landingLeadsInterests, landingLeadsSlugs (JSON array string; rỗng = mọi slug)
   *
   * Response: { success, data: { items, pagination: { total, page, pageSize, totalPages } } }
   */
  async list(req, res) {
    try {
      const q = req.query || {};
      const base = parseLandingLeadFilters(q);
      const page = Math.max(1, parseInt(String(q.page), 10) || 1);
      const pageSizeRaw = parseInt(String(q.pageSize), 10);
      const pageSize = Math.min(100, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 20));

      const { items, total, totalPages } = await leadService.listAdminPaginated({
        ...base,
        page,
        pageSize,
      });

      return res.json({
        success: true,
        data: {
          items,
          pagination: {
            total,
            page,
            pageSize,
            totalPages,
          },
        },
      });
    } catch (error) {
      console.error('[LeadController.list]', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Không thể tải danh sách lead',
      });
    }
  }

  /**
   * GET /api/leads/export
   * Tải file Excel danh sách lead landing — cùng tham số lọc như GET /api/leads (không phân trang).
   * Tối đa 10.000 dòng dữ liệu; nếu vượt, chỉ xuất 10.000 mới nhất (header `X-Export-Truncated: true`).
   *
   * Query: landingLeadsUseDateRange, landingLeadsDateFrom, landingLeadsDateTo,
   *        landingLeadsOccupations, landingLeadsInterests, landingLeadsSlugs (JSON array string)
   *
   * Response: binary .xlsx (attachment)
   */
  async exportXlsx(req, res) {
    try {
      const base = parseLandingLeadFilters(req.query || {});
      const { buffer, total, exportedCount, truncated } = await leadService.exportAdminFilteredXlsx(base);

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const fname = `landing-leads-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
        now.getHours()
      )}${pad(now.getMinutes())}.xlsx`;

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
      res.setHeader('X-Export-Total', String(total));
      res.setHeader('X-Export-Count', String(exportedCount));
      if (truncated) {
        res.setHeader('X-Export-Truncated', 'true');
      }

      return res.send(buffer);
    } catch (error) {
      console.error('[LeadController.exportXlsx]', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Không thể xuất file Excel',
      });
    }
  }
}

export default new LeadController();
