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
   * GET /api/custom-domains/:id
   * Get single domain details.
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const role = req.user?.role;

      const domain = await customDomainService.getDomainById(Number.parseInt(id, 10), {
        userId,
        role,
      });

      if (!domain) {
        return res.status(404).json({
          success: false,
          message: 'Domain not found',
        });
      }

      res.json({
        success: true,
        data: domain,
      });
    } catch (error) {
      console.error('[CustomDomain] GetById error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch domain',
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

  /**
   * PUT /api/custom-domains/:id
   * Update domain settings.
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { landingPageId, isActive, isPrimary } = req.body;
      const userId = req.user?.id;
      const role = req.user?.role;

      const domain = await customDomainService.updateDomain(
        Number.parseInt(id, 10),
        {
          landingPageId: landingPageId ? Number.parseInt(landingPageId, 10) : undefined,
          isActive,
          isPrimary,
        },
        { userId, role }
      );

      res.json({
        success: true,
        data: domain,
      });
    } catch (error) {
      console.error('[CustomDomain] Update error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * DELETE /api/custom-domains/:id
   * Delete a custom domain.
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const role = req.user?.role;

      await customDomainService.deleteDomain(Number.parseInt(id, 10), { userId, role });

      res.json({
        success: true,
        message: 'Domain deleted successfully',
      });
    } catch (error) {
      console.error('[CustomDomain] Delete error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * POST /api/custom-domains/:id/verify
   * Trigger domain verification.
   */
  async verify(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const role = req.user?.role;

      const result = await customDomainService.verifyDomain(Number.parseInt(id, 10), { userId, role });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[CustomDomain] Verify error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * GET /api/custom-domains/:id/verification-instructions
   * Get DNS configuration instructions.
   */
  async getVerificationInstructions(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const role = req.user?.role;

      const instructions = await customDomainService.getVerificationInstructions(
        Number.parseInt(id, 10),
        { userId, role }
      );

      res.json({
        success: true,
        data: instructions,
      });
    } catch (error) {
      console.error('[CustomDomain] Verification instructions error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * GET /api/custom-domains/:id/ssl-status
   * Get SSL certificate status.
   */
  async getSslStatus(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const role = req.user?.role;

      const status = await customDomainService.getSslStatus(Number.parseInt(id, 10), { userId, role });

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      console.error('[CustomDomain] SSL status error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

export default new CustomDomainController();
