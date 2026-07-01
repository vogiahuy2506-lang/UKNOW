import landingPageOverrideRepository from '../repositories/landingPageOverride.repository.js';
import landingPageSectionRepository from '../repositories/landingPageSection.repository.js';
import {
  LANDING_CUSTOMIZER_PAGES,
  LANDING_DISPLAY_MODES,
  LANDING_FULL_PAGE_SECTION,
} from '../constants/landingCustomizer.constants.js';

class LandingCustomizerService {
  async getAllOverrides() {
    return landingPageOverrideRepository.findAll();
  }

  async getActiveOverrides() {
    return landingPageOverrideRepository.findActive();
  }

  async getOverridesByPage(page) {
    const validPages = ['hero', 'contact', 'pricing'];
    if (!validPages.includes(page)) {
      const err = new Error('Invalid page. Must be one of: hero, contact, pricing');
      err.statusCode = 400;
      throw err;
    }
    const overrides = await landingPageOverrideRepository.findByPage(page);
    // Return as flat object with key -> { valueVi, valueEn }
    const overridesMap = {};
    for (const o of overrides) {
      overridesMap[o.key] = {
        valueVi: o.valueVi,
        valueEn: o.valueEn,
      };
    }
    return { overrides: overridesMap, raw: overrides };
  }

  async getOverrideById(id) {
    const override = await landingPageOverrideRepository.findById(id);
    if (!override) {
      const err = new Error('Override not found');
      err.statusCode = 404;
      throw err;
    }
    return override;
  }

  async createOverride(body) {
    const b = body && typeof body === 'object' ? body : {};
    
    const page = String(b.page || '').trim().toLowerCase();
    const section = String(b.section || '').trim();
    const key = String(b.key || '').trim();
    
    if (!page || !section || !key) {
      const err = new Error('page, section, and key are required');
      err.statusCode = 400;
      throw err;
    }

    const validPages = ['hero', 'contact', 'pricing'];
    if (!validPages.includes(page)) {
      const err = new Error('Invalid page. Must be one of: hero, contact, pricing');
      err.statusCode = 400;
      throw err;
    }

    return landingPageOverrideRepository.upsert({
      page,
      section,
      key,
      valueVi: b.valueVi,
      valueEn: b.valueEn,
      extraData: b.extraData,
      isActive: b.isActive !== false,
    });
  }

  async updateOverride(id, body) {
    const existing = await landingPageOverrideRepository.findById(id);
    if (!existing) {
      const err = new Error('Override not found');
      err.statusCode = 404;
      throw err;
    }

    const b = body && typeof body === 'object' ? body : {};
    
    const page = b.page ? String(b.page).trim().toLowerCase() : existing.page;
    const validPages = ['hero', 'contact', 'pricing'];
    if (!validPages.includes(page)) {
      const err = new Error('Invalid page. Must be one of: hero, contact, pricing');
      err.statusCode = 400;
      throw err;
    }

    return landingPageOverrideRepository.updateById(id, {
      page,
      section: b.section || existing.section,
      key: b.key || existing.key,
      valueVi: b.valueVi !== undefined ? b.valueVi : existing.valueVi,
      valueEn: b.valueEn !== undefined ? b.valueEn : existing.valueEn,
      extraData: b.extraData !== undefined ? b.extraData : existing.extraData,
      isActive: b.isActive !== undefined ? b.isActive : existing.isActive,
    });
  }

  async deleteOverride(id) {
    const existing = await landingPageOverrideRepository.findById(id);
    if (!existing) {
      const err = new Error('Override not found');
      err.statusCode = 404;
      throw err;
    }

    const ok = await landingPageOverrideRepository.deleteById(id);
    if (!ok) {
      const err = new Error('Failed to delete override');
      err.statusCode = 500;
      throw err;
    }
    return true;
  }

  async bulkUpsert(items) {
    if (!Array.isArray(items) || items.length === 0) {
      const err = new Error('items must be a non-empty array');
      err.statusCode = 400;
      throw err;
    }

    const validPages = ['hero', 'contact', 'pricing'];
    for (const item of items) {
      if (!item.page || !item.section || !item.key) {
        const err = new Error('Each item must have page, section, and key');
        err.statusCode = 400;
        throw err;
      }
      if (!validPages.includes(item.page)) {
        const err = new Error(`Invalid page: ${item.page}. Must be one of: hero, contact, pricing`);
        err.statusCode = 400;
        throw err;
      }
    }

    return landingPageOverrideRepository.bulkUpsert(items);
  }

  getOverridesMap(overrides) {
    const map = {};
    for (const override of overrides) {
      if (!map[override.page]) {
        map[override.page] = {};
      }
      if (!map[override.page][override.section]) {
        map[override.page][override.section] = {};
      }
      map[override.page][override.section][override.key] = {
        valueVi: override.valueVi,
        valueEn: override.valueEn,
        extraData: override.extraData,
      };
    }
    return map;
  }

  // Element positions
  async getElementPositions(page) {
    const validPages = ['hero', 'contact', 'pricing'];
    if (!validPages.includes(page)) {
      const err = new Error('Invalid page');
      err.statusCode = 400;
      throw err;
    }
    return landingPageOverrideRepository.findPositionsByPage(page);
  }

  async saveElementPositions(page, positions) {
    if (!Array.isArray(positions)) {
      const err = new Error('positions must be an array');
      err.statusCode = 400;
      throw err;
    }
    return landingPageOverrideRepository.savePositions(page, positions);
  }

  async deleteElementPosition(page, elementKey) {
    return landingPageOverrideRepository.deletePositionByKey(page, elementKey);
  }

  _validateCustomizerPage(page) {
    if (!LANDING_CUSTOMIZER_PAGES.includes(page)) {
      const err = new Error(`Invalid page. Must be one of: ${LANDING_CUSTOMIZER_PAGES.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }
  }

  _mapFullPageHtmlRow(row) {
    const config = row?.config && typeof row.config === 'object' ? row.config : {};
    const displayMode = LANDING_DISPLAY_MODES.includes(config.displayMode)
      ? config.displayMode
      : 'default';

    return {
      page: row?.page || null,
      displayMode,
      htmlContentVi: row?.htmlContent || '',
      htmlContentEn: config.htmlContentEn || '',
      cssContent: row?.cssContent || '',
      updatedAt: row?.updatedAt || null,
    };
  }

  _emptyFullPageHtml(page) {
    return {
      page,
      displayMode: 'default',
      htmlContentVi: '',
      htmlContentEn: '',
      cssContent: '',
      updatedAt: null,
    };
  }

  async getFullPageHtmlMode(page) {
    this._validateCustomizerPage(page);
    const row = await landingPageSectionRepository.findByPageAndSection(page, LANDING_FULL_PAGE_SECTION);
    if (!row) {
      return this._emptyFullPageHtml(page);
    }
    return this._mapFullPageHtmlRow(row);
  }

  async saveFullPageHtmlMode(page, body = {}) {
    this._validateCustomizerPage(page);

    const existing = await landingPageSectionRepository.findByPageAndSection(page, LANDING_FULL_PAGE_SECTION);
    const existingConfig = existing?.config && typeof existing.config === 'object' ? existing.config : {};

    const displayMode = body.displayMode !== undefined
      ? String(body.displayMode).trim().toLowerCase()
      : (existingConfig.displayMode || 'default');

    if (!LANDING_DISPLAY_MODES.includes(displayMode)) {
      const err = new Error('displayMode must be "default" or "html"');
      err.statusCode = 400;
      throw err;
    }

    const htmlContentVi = body.htmlContentVi !== undefined
      ? String(body.htmlContentVi)
      : (existing?.htmlContent || '');

    const htmlContentEn = body.htmlContentEn !== undefined
      ? String(body.htmlContentEn)
      : (existingConfig.htmlContentEn || '');

    const cssContent = body.cssContent !== undefined
      ? String(body.cssContent)
      : (existing?.cssContent || '');

    if (displayMode === 'html') {
      const hasVi = htmlContentVi.trim().length > 0;
      const hasEn = htmlContentEn.trim().length > 0;
      if (!hasVi && !hasEn) {
        const err = new Error('Cần nhập HTML (Tiếng Việt hoặc English) trước khi bật chế độ HTML');
        err.statusCode = 400;
        throw err;
      }
    }

    const saved = await landingPageSectionRepository.upsert({
      page,
      section: LANDING_FULL_PAGE_SECTION,
      htmlContent: htmlContentVi,
      cssContent,
      config: {
        ...existingConfig,
        displayMode,
        htmlContentEn,
      },
      isActive: true,
    });

    return this._mapFullPageHtmlRow(saved);
  }

  async getPublicFullPageHtml(page, locale = 'vi') {
    this._validateCustomizerPage(page);
    const row = await landingPageSectionRepository.findByPageAndSection(page, LANDING_FULL_PAGE_SECTION);
    if (!row) {
      return { displayMode: 'default', htmlContent: '', cssContent: '' };
    }

    const mapped = this._mapFullPageHtmlRow(row);
    if (mapped.displayMode !== 'html') {
      return { displayMode: 'default', htmlContent: '', cssContent: '' };
    }

    const useEn = String(locale || 'vi').toLowerCase() === 'en';
    const htmlContent = useEn
      ? (mapped.htmlContentEn || mapped.htmlContentVi || '')
      : (mapped.htmlContentVi || mapped.htmlContentEn || '');

    if (!htmlContent.trim()) {
      return { displayMode: 'default', htmlContent: '', cssContent: '' };
    }

    return {
      displayMode: 'html',
      htmlContent,
      cssContent: mapped.cssContent || '',
    };
  }
}

export default new LandingCustomizerService();
