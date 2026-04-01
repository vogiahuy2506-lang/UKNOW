import leadService from '../services/lead/lead.service.js';
import { clampLandingLeadsLimit } from '../utils/landingLeadsLimit.util.js';

/**
 * Controller lead có auth — preview dữ liệu cho Campaign Builder.
 */
class LeadController {
  /**
   * GET /api/leads/preview
   * Query: landingLeadsUseDateRange, landingLeadsDateFrom, landingLeadsDateTo,
   *        landingLeadsOccupations (JSON array string), landingLeadsInterests (JSON array string),
   *        landingLeadsLimit
   *
   * Response: { success, data: { items, pagination: { total, limit, fetched } } }
   */
  async preview(req, res) {
    try {
      const q = req.query || {};
      let occupations = [];
      let interests = [];
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

      const config = {
        landingLeadsUseDateRange: String(q.landingLeadsUseDateRange || '').toLowerCase() === 'true'
          || q.landingLeadsUseDateRange === true
          || q.landingLeadsUseDateRange === '1',
        landingLeadsDateFrom: q.landingLeadsDateFrom || '',
        landingLeadsDateTo: q.landingLeadsDateTo || '',
        landingLeadsOccupations: Array.isArray(occupations) ? occupations : [],
        landingLeadsInterests: Array.isArray(interests) ? interests : [],
        landingLeadsLimit: q.landingLeadsLimit,
      };

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
}

export default new LeadController();
