import customDomainService from '../services/customDomain.service.js';
import { isSuperAdmin, isUserAdmin } from '../utils/roleScope.util.js';

/**
 * Controller for custom domains.
 */
class CustomDomainController {
  /**
   * GET /api/custom-domains
   * List all domains for current user.
   */
  async list(req, res) {
    try {
      const userId = req.user?.id;
      const role = req.user?.role;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const domains = await customDomainService.listDomains({
        userId,
        role,
      });

      res.json({
        success: true,
        data: domains,
      });
    } catch (error) {
      console.error('[CustomDomain] List error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch domains',
      });
    }
  }

  /**
   * POST /api/custom-domains
   * Request a new custom domain.
   */
  async create(req, res) {
    try {
      const { domain, subdomain, landingPageId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      if (!domain || typeof domain !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Domain is required',
        });
      }

      const result = await customDomainService.requestDomain({
        userId,
        domain: domain.trim(),
        subdomain: subdomain?.trim() || null,
        landingPageId: landingPageId ? Number.parseInt(landingPageId, 10) : null,
      });

      res.status(201).json({
        success: true,
        data: result,
        message: result.message,
      });
    } catch (error) {
      console.error('[CustomDomain] Create error:', error);
      const status = error.message.includes('already registered') ? 409 : 500;
      res.status(status).json({
        success: false,
        message: error.message,
      });
    }
  }

}

export default new CustomDomainController();
