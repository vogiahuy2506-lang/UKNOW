import landingPageSectionRepository from '../repositories/landingPageSection.repository.js';

const VALID_PAGES = ['hero', 'contact', 'pricing'];

class LandingPageSectionService {
  _validatePage(page) {
    if (!VALID_PAGES.includes(page)) {
      const err = new Error(`Invalid page. Must be one of: ${VALID_PAGES.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }
    return true;
  }

  async getAllSections() {
    return landingPageSectionRepository.findAll();
  }

  async getActiveSections() {
    return landingPageSectionRepository.findActive();
  }

  async getSectionsByPage(page) {
    this._validatePage(page);
    return landingPageSectionRepository.findByPage(page);
  }

  async getSectionById(id) {
    const section = await landingPageSectionRepository.findById(id);
    if (!section) {
      const err = new Error('Section not found');
      err.statusCode = 404;
      throw err;
    }
    return section;
  }

  async getSectionByPageAndSection(page, section) {
    this._validatePage(page);
    if (!section || !section.trim()) {
      const err = new Error('Section is required');
      err.statusCode = 400;
      throw err;
    }
    return landingPageSectionRepository.findByPageAndSection(page, section);
  }

  async createSection(body) {
    const b = body && typeof body === 'object' ? body : {};

    const page = String(b.page || '').trim().toLowerCase();
    const section = String(b.section || '').trim();

    if (!page || !section) {
      const err = new Error('page and section are required');
      err.statusCode = 400;
      throw err;
    }

    this._validatePage(page);

    return landingPageSectionRepository.upsert({
      page,
      section,
      htmlContent: b.htmlContent,
      cssContent: b.cssContent,
      config: b.config,
      isActive: b.isActive !== false,
    });
  }

  async updateSection(id, body) {
    const existing = await landingPageSectionRepository.findById(id);
    if (!existing) {
      const err = new Error('Section not found');
      err.statusCode = 404;
      throw err;
    }

    const b = body && typeof body === 'object' ? body : {};

    if (b.page) {
      this._validatePage(String(b.page).trim().toLowerCase());
    }

    return landingPageSectionRepository.updateById(id, {
      page: b.page ? String(b.page).trim().toLowerCase() : existing.page,
      section: b.section || existing.section,
      htmlContent: b.htmlContent !== undefined ? b.htmlContent : existing.htmlContent,
      cssContent: b.cssContent !== undefined ? b.cssContent : existing.cssContent,
      config: b.config !== undefined ? b.config : existing.config,
      isActive: b.isActive !== undefined ? b.isActive : existing.isActive,
    });
  }

  async upsertByPageAndSection(page, section, body) {
    this._validatePage(page);
    if (!section || !section.trim()) {
      const err = new Error('Section is required');
      err.statusCode = 400;
      throw err;
    }

    const b = body && typeof body === 'object' ? body : {};

    return landingPageSectionRepository.upsert({
      page,
      section: section.trim(),
      htmlContent: b.htmlContent !== undefined ? b.htmlContent : null,
      cssContent: b.cssContent !== undefined ? b.cssContent : null,
      config: b.config !== undefined ? b.config : null,
      isActive: b.isActive !== false,
    });
  }

  async deleteSection(id) {
    const existing = await landingPageSectionRepository.findById(id);
    if (!existing) {
      const err = new Error('Section not found');
      err.statusCode = 404;
      throw err;
    }

    const ok = await landingPageSectionRepository.deleteById(id);
    if (!ok) {
      const err = new Error('Failed to delete section');
      err.statusCode = 500;
      throw err;
    }
    return true;
  }

  async deleteByPageAndSection(page, section) {
    this._validatePage(page);
    if (!section || !section.trim()) {
      const err = new Error('Section is required');
      err.statusCode = 400;
      throw err;
    }

    const ok = await landingPageSectionRepository.deleteByPageAndSection(page, section.trim());
    if (!ok) {
      const err = new Error('Failed to delete section');
      err.statusCode = 500;
      throw err;
    }
    return true;
  }
}

export default new LandingPageSectionService();
