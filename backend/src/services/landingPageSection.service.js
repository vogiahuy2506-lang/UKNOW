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

}

export default new LandingPageSectionService();
