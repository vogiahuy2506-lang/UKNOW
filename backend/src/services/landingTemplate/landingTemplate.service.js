import landingTemplateRepository from '../../repositories/landingTemplate.repository.js';
import { isAdminRole } from '../../utils/roleScope.util.js';

/**
 * Service for landing page templates.
 */
class LandingTemplateService {
  /**
   * Get all available templates (public only).
   * @returns {Promise<object[]>}
   */
  async getTemplates() {
    return landingTemplateRepository.listPublic();
  }

  /**
   * Get templates by category.
   * @param {string} category
   * @returns {Promise<object[]>}
   */
  async getTemplatesByCategory(category) {
    return landingTemplateRepository.listByCategory(category);
  }

  /**
   * Get template by ID (respects isPublic + owner; superadmin bypass).
   * @param {number} id
   * @param {{ userId?: number|null, roleCode?: string|null }} [scope]
   * @returns {Promise<object|null>}
   */
  async getTemplateById(id, scope = {}) {
    const template = await landingTemplateRepository.findActiveById(id);
    if (!template) return null;

    const { userId = null, roleCode = null } = scope;
    const isPublic = template.isPublic === true || template.isPublic === 'true';
    if (!isPublic
      && Number(template.userId) !== Number(userId)
      && !isAdminRole(roleCode)) {
      return null;
    }
    return template;
  }

  /**
   * Get available categories.
   * @returns {Promise<object[]>}
   */
  async getCategories() {
    return landingTemplateRepository.getCategoriesWithCount();
  }

  /**
   * Get templates created by user.
   * @param {number} userId
   * @returns {Promise<object[]>}
   */
  async getMyTemplates(userId) {
    return landingTemplateRepository.listByUser(userId);
  }

  /**
   * Create a new template.
   * @param {object} data
   * @returns {Promise<object>}
   */
  async createTemplate(data) {
    return landingTemplateRepository.create(data);
  }

  /**
   * Delete a template (only by owner).
   * @param {number} id
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async deleteTemplate(id, userId) {
    const deleted = await landingTemplateRepository.deleteByIdAndUser(id, userId);
    if (!deleted) {
      throw new Error('Template not found or you do not have permission to delete it');
    }
    return true;
  }

  /**
   * Update an existing template (only by owner).
   * @param {number} id
   * @param {number} userId
   * @param {object} data
   * @returns {Promise<object|null>}
   */
  async updateTemplate(id, userId, data) {
    return landingTemplateRepository.updateByIdAndUser(id, userId, data);
  }
}

export default new LandingTemplateService();
