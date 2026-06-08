import landingTemplateService from '../services/landingTemplate/landingTemplate.service.js';
import { saveMessages, saveAssistantMessage } from '../repositories/aiSession.repository.js';

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
   * GET /api/landing-templates/my
   * Get templates created by current user.
   */
  async getMyTemplates(req, res) {
    try {
      const userId = req.user.id;
      const templates = await landingTemplateService.getMyTemplates(userId);
      res.json({
        success: true,
        data: templates,
      });
    } catch (error) {
      console.error('[LandingTemplate] My templates error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch your templates',
      });
    }
  }

  /**
   * POST /api/landing-templates
   * Create a new template.
   */
  async create(req, res) {
    try {
      const { name, description, htmlStructure, category, thumbnailUrl, cssVariables, defaultConfig, isPublic } = req.body;

      if (!name || !htmlStructure) {
        return res.status(400).json({
          success: false,
          message: 'Name and HTML structure are required',
        });
      }

      const userId = req.user.id;
      const template = await landingTemplateService.createTemplate({
        name,
        description,
        htmlStructure,
        category: category || 'Custom',
        thumbnailUrl,
        cssVariables,
        defaultConfig,
        isPublic: Boolean(isPublic),
        userId,
      });

      res.json({
        success: true,
        data: template,
      });
    } catch (error) {
      console.error('[LandingTemplate] Create error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create template',
      });
    }
  }

  /**
   * PUT /api/landing-templates/:id
   * Update an existing template (only by owner).
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { name, description, category, thumbnailUrl, cssVariables, defaultConfig, isPublic } = req.body;

      const template = await landingTemplateService.updateTemplate(Number.parseInt(id, 10), userId, {
        name,
        description,
        category,
        thumbnailUrl,
        cssVariables,
        defaultConfig,
        isPublic,
      });

      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Template not found or you do not have permission to update it',
        });
      }

      res.json({
        success: true,
        data: template,
      });
    } catch (error) {
      console.error('[LandingTemplate] Update error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update template',
      });
    }
  }

  /**
   * DELETE /api/landing-templates/:id
   * Delete a template.
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      await landingTemplateService.deleteTemplate(Number.parseInt(id, 10), userId);
      
      res.json({
        success: true,
        message: 'Template deleted',
      });
    } catch (error) {
      console.error('[LandingTemplate] Delete error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete template',
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
      const { prompt, templateId, files, sessionId, userSummary } = req.body;

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Prompt must be at least 10 characters',
        });
      }

      const userId = req.user.id;

      const result = await landingTemplateService.generateLandingPage({
        prompt: prompt.trim(),
        templateId: templateId ? Number.parseInt(templateId, 10) : null,
        userId,
        files: files || [],
      });

      // Lưu cả user message + assistant (landing page) vào session
      if (sessionId) {
        try {
          const userContent = String(userSummary || prompt).trim();
          const assistantMsg = {
            content: `Đã tạo landing page "${result.title}" cho bạn! Bạn có thể xem trước và lưu vào thư viện.`,
            type: 'landing_page',
            data: { title: result.title, html: result.html, css: result.css },
          };
          await saveMessages(sessionId, userContent, assistantMsg);
        } catch (saveErr) {
          console.warn('[LandingTemplate] Could not save message to session:', saveErr.message);
        }
      }

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
