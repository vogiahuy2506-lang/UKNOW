import api from '../../../services/api';
import { postAiTurn } from '../../../services/aiTurnStream';

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

  getSection(page, section) {
    return api.get(`/admin/landing-sections/${page}/${section}`);
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

  getHtmlMode(page) {
    return api.get(`/admin/landing-customizer/${page}/html-mode`);
  },

  saveHtmlMode(page, payload) {
    return api.put(`/admin/landing-customizer/${page}/html-mode`, payload);
  },

  /**
   * Sinh HTML landing bằng AI (trừ 1 AI credit mỗi lần — kể cả admin khi forceBillable).
   *
   * @param {{ prompt: string, title?: string, homepagePage?: string, locale?: string }} params
   */
  async generateHomepageHtmlWithAi({ prompt, title, homepagePage, locale } = {}) {
    // PR-9 (B-4): đọc phản hồi LUỒNG (không còn 524 sau 100 giây). Giữ hình dạng cũ `{ data: <thân JSON> }` (nơi gọi đọc `res.data`).
    const data = await postAiTurn('/ai/generate-landing-html', {
      prompt,
      title,
      homepagePage,
      locale,
      forceBillable: true,
    });
    return { data };
  },
};

export default landingCustomizerApiService;
