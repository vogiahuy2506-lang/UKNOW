import landingTemplateService from '../services/landingTemplate/landingTemplate.service.js';

/**
 * Controller for landing page templates.
 */
class LandingTemplateController {
  /**
   * GET /api/landing-templates
   * Get all templates or filter by category.
   */
  async list(req, res) {
    try {
      const { category } = req.query;

      let templates;
      if (category) {
        templates = await landingTemplateService.getTemplatesByCategory(category);
      } else {
        templates = await landingTemplateService.getTemplates();
      }

      res.json({
        success: true,
        data: templates,
      });
    } catch (error) {
      console.error('[LandingTemplate] List error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch templates',
      });
    }
  }

  /**
   * GET /api/landing-templates/categories
   * Get available categories with count.
   */
  async getCategories(req, res) {
    try {
      const categories = await landingTemplateService.getCategories();
      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      console.error('[LandingTemplate] Categories error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch categories',
      });
    }
  }

  /**
   * GET /api/landing-templates/:id
   * Get single template details.
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const template = await landingTemplateService.getTemplateById(Number.parseInt(id, 10));

      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Template not found',
        });
      }

      res.json({
        success: true,
        data: template,
      });
    } catch (error) {
      console.error('[LandingTemplate] GetById error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch template',
      });
    }
  }

  /**
   * GET /api/landing-templates/:id/html
   * Get template HTML structure only.
   */
  async getHtml(req, res) {
    try {
      const { id } = req.params;
      const template = await landingTemplateService.getTemplateById(Number.parseInt(id, 10));

      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Template not found',
        });
      }

      res.json({
        success: true,
        data: {
          id: template.id,
          name: template.name,
          category: template.category,
          htmlStructure: template.htmlStructure,
          cssVariables: template.cssVariables,
          defaultConfig: template.defaultConfig,
        },
      });
    } catch (error) {
      console.error('[LandingTemplate] GetHtml error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch template HTML',
      });
    }
  }

  /**
   * POST /api/landing-templates/generate
   * Generate landing page from prompt using AI.
   */
  async generate(req, res) {
    try {
      const { prompt, templateId, files } = req.body;

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Prompt must be at least 10 characters',
        });
      }

      // Get userId from auth middleware if available
      const userId = req.user?.id || null;

      const result = await landingTemplateService.generateLandingPage({
        prompt: prompt.trim(),
        templateId: templateId ? Number.parseInt(templateId, 10) : null,
        userId,
        files: files || [],
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[LandingTemplate] Generate error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate landing page',
      });
    }
  }
}

export default new LandingTemplateController();
