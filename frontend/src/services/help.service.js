import api from './api';

// Public docs API
export const listHelpArticles = (locale = 'vi') =>
  api.get('/help/articles', { params: { locale } });

export const getHelpArticle = (slug, locale = 'vi') =>
  api.get(`/help/articles/${slug}`, { params: { locale } });

export const resolveHelpFeature = (featureKey, locale = 'vi') =>
  api.get(`/help/feature/${featureKey}`, { params: { locale } });

// Admin
export const adminListHelpArticles = () => api.get('/help/admin/articles');

export const adminGetHelpArticle = (id) => api.get(`/help/admin/articles/${id}`);

export const adminCreateHelpArticle = (payload) => api.post('/help/admin/articles', payload);

export const adminUpdateHelpArticle = (id, payload) => api.patch(`/help/admin/articles/${id}`, payload);

export const adminDeleteHelpArticle = (id) => api.delete(`/help/admin/articles/${id}`);

export const adminReindexHelpArticle = (id) => api.post(`/help/admin/articles/${id}/reindex`);

export const adminTranslateHelpArticle = (id, locale = 'en') =>
  api.post(`/help/admin/articles/${id}/translate`, { locale });

export const adminListUnansweredHelp = (limit) => api.get('/help/admin/unanswered', { params: limit ? { limit } : {} });

export const adminSeedHelpArticles = (reindex = false) => api.post('/help/admin/seed', { reindex });

export default {
  listHelpArticles,
  getHelpArticle,
  resolveHelpFeature,
  adminListHelpArticles,
  adminGetHelpArticle,
  adminCreateHelpArticle,
  adminUpdateHelpArticle,
  adminDeleteHelpArticle,
  adminReindexHelpArticle,
  adminTranslateHelpArticle,
  adminListUnansweredHelp,
  adminSeedHelpArticles,
};
