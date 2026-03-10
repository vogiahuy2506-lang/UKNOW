import api from '../../../services/api';

/**
 * Upload and attachment helper APIs for email template editor.
 */
export const emailTemplateUploadApiService = {
  uploadTempFile(payload, config = {}) {
    return api.post('/uploads/temp', payload, config);
  },

  /**
   * Lấy URL mở file theo storage key.
   * Nếu bật `preview`, backend sẽ trả link inline để trình duyệt tự render file.
   *
   * @param {string} key storage key của file
   * @param {{ preview?: boolean }} [options] tùy chọn lấy link
   * @returns {Promise<any>} response chứa URL truy cập file
   */
  getSignedUrlByKey(key, { preview = false } = {}) {
    return api.get('/attachments/presigned-by-key', {
      params: {
        key,
        ...(preview ? { preview: 'true' } : {}),
      },
    });
  },

  deleteTempFile(tempId) {
    return api.delete(`/uploads/temp/${tempId}`);
  },
};

export default emailTemplateUploadApiService;
