import api from './api';

/**
 * Gửi form liên hệ từ trang /contact.
 * @param {{ name: string, email: string, phone?: string, company?: string, companySize?: string, message: string }} payload
 */
export const submitContactForm = (payload) => api.post('/contact', payload);
