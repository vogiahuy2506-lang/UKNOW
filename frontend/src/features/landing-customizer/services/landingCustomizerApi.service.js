import api from '../../../services/api';

const landingCustomizerApiService = {
  getAllOverrides() {
    return api.get('/admin/landing-customizer');
  },

  getOverridesByPage(page) {
    return api.get(`/admin/landing-customizer/${page}`);
  },

  createOverride(payload) {
    return api.post('/admin/landing-customizer', payload);
  },

  updateOverride(id, payload) {
    return api.patch(`/admin/landing-customizer/${id}`, payload);
  },

  deleteOverride(id) {
    return api.delete(`/admin/landing-customizer/${id}`);
  },

  bulkUpsert(items) {
    return api.post('/admin/landing-customizer/bulk', { items });
  },

  getPublicOverrides() {
    return api.get('/public/landing-overrides');
  },

  getPublicOverridesByPage(page) {
    return api.get(`/public/landing-overrides/${page}`);
  },

  getAllSections() {
    return api.get('/admin/landing-sections');
  },

  getSectionsByPage(page) {
    return api.get(`/admin/landing-sections/page/${page}`);
  },

  getSection(page, section) {
    return api.get(`/admin/landing-sections/${page}/${section}`);
  },

  createSection(payload) {
    return api.post('/admin/landing-sections', payload);
  },

  updateSection(id, payload) {
    return api.put(`/admin/landing-sections/${id}`, payload);
  },

  upsertSection(page, section, payload) {
    return api.put(`/admin/landing-sections/${page}/${section}`, payload);
  },

  deleteSection(id) {
    return api.delete(`/admin/landing-sections/${id}`);
  },

  deleteSectionByPageAndSection(page, section) {
    return api.delete(`/admin/landing-sections/${page}/${section}`);
  },

  getPageSource(page) {
    return api.get(`/admin/landing-customizer/source/${page}`);
  },

  // Override content methods
  getOverrides(page, lang = 'vi') {
    return api.get(`/admin/landing-customizer/${page}`, { params: { lang } });
  },

  saveOverrides(page, lang, overrides) {
    // Convert from { key: { valueVi, valueEn } } to array of items
    const items = Object.entries(overrides).map(([key, value]) => ({
      page,
      section: 'content',
      key,
      valueVi: value?.valueVi || value,
      valueEn: value?.valueEn || value,
    }));
    return api.post('/admin/landing-customizer/bulk', { items });
  },

  savePageSource(page, source) {
    return api.put(`/admin/landing-customizer/source/${page}`, { source });
  },

  // Element positions methods
  getElementPositions(page) {
    return api.get(`/admin/landing-customizer/${page}/positions`);
  },

  saveElementPositions(page, positions) {
    return api.put(`/admin/landing-customizer/${page}/positions`, { positions });
  },

  deleteElementPosition(page, elementKey) {
    return api.delete(`/admin/landing-customizer/${page}/positions/${elementKey}`);
  },
};

export default landingCustomizerApiService;
