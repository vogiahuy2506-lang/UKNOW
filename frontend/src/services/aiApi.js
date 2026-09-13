import api from './api';

function formatLandingFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return undefined;
  return files.map((f) => {
    const item = {
      originalName: f.originalName || f.name,
      contentType: f.contentType || f.type || 'application/octet-stream',
      size: f.size,
    };
    if (f.storageKey || f.storage_key) {
      item.storageKey = f.storageKey || f.storage_key;
    } else if (f.tempId) {
      item.tempId = f.tempId;
    }
    return item;
  });
}

const aiApi = {
  /**
   * Generate campaign script from AI (V2 - Registry-based, multi-step support).
   * @param {string} prompt
   * @param {Array} files Array of { tempId, originalName, ... }
   */
  generateCampaignV2: async (prompt, files = []) => {
    const response = await api.post('/ai/generate-campaign-v2', { prompt, files }, {
      timeout: 120000
    });
    return response.data;
  },

  /**
   * Generate campaign script from AI (Legacy).
   * @param {string} prompt
   * @param {Array} files Array of { tempId, originalName, ... }
   */
  generateCampaign: async (prompt, files = []) => {
    const response = await api.post('/ai/generate-campaign', { prompt, files }, {
      timeout: 120000 // 2 minutes for thinking models
    });
    return response.data;
  },

  /**
   * Execute (Create & Run) the generated campaign.
   * @param {object} script The campaign script from generateCampaign
   * @param {boolean} autoRun Whether to run the campaign immediately
   */
  executeCampaign: async (script, autoRun = true) => {
    const response = await api.post('/ai/execute-campaign', { ...script, autoRun });
    return response.data;
  },

  /**
   * Create campaign from AI draft (NO auto-run).
   * User will review and run manually.
   * @param {object} script The campaign script from AI
   */
  createCampaignFromDraft: async (script, resourceVersions = [], directRecipients = null) => {
    const response = await api.post('/ai/create-from-draft', { script, resourceVersions, ...(directRecipients ? { directRecipients } : {}) });
    return response.data;
  },

  prepareCampaign: async (script, directRecipients = null) => {
    const response = await api.post('/ai/prepare-campaign', { script, ...(directRecipients ? { directRecipients } : {}) });
    return response.data;
  },

  /**
   * Push AI script to an existing campaign.
   * @param {number} campaignId Target campaign ID
   * @param {object} script The campaign script
   * @param {boolean} autoRun Whether to run the campaign immediately
   */
  pushToCampaign: async (campaignId, script, autoRun = false) => {
    const response = await api.post(`/ai/push-to-campaign/${campaignId}`, { script, autoRun });
    return response.data;
  },

  /**
   * Create AND RUN campaign automatically (no confirmation).
   * @param {object} script The campaign script from AI
   */
  createAndRunCampaign: async (script) => {
    const response = await api.post('/ai/create-and-run-campaign', { script }, {
      timeout: 120000
    });
    return response.data;
  },

  /**
   * Smart interactive chat.
   * @param {Array} history Array of { role, content }
   * @param {Array} files Array of current attached files
   * @param {number|null} sessionId Active session ID (null = tạo session mới)
   */
  // Model AI do hệ thống quyết định (super admin chọn 1 model duy nhất) —
  // client không gửi model nữa, backend luôn resolve về model hệ thống.
  /**
   * @param {string|null} planSlotKey Định danh slot trong kế hoạch nội dung ("d1-s2").
   *   Gửi TƯỜNG MINH thay vì để backend regex lại prompt văn xuôi — xem chú thích ở
   *   aiCampaign.service.js chỗ gắn planSlotKey.
   */
  chat: async (history, files = [], sessionId = null, locale = 'vi', intent = null, planSlotKey = null) => {
    const payload = { history, files, sessionId, locale };
    if (intent) payload.intent = intent;
    if (planSlotKey) payload.planSlotKey = planSlotKey;
    const response = await api.post('/ai/chat', payload, {
      timeout: 120000
    });
    return response.data;
  },

  /**
   * Smart interactive chat V2 - multi-step support.
   * @param {Array} history Array of { role, content }
   * @param {Array} files Array of current attached files
   */
  chatV2: async (history, files = [], locale = 'vi') => {
    const response = await api.post('/ai/chat-v2', { history, files, locale }, {
      timeout: 120000
    });
    return response.data;
  },

  getSessions: async () => {
    const response = await api.get('/ai/sessions');
    return response.data;
  },

  getSessionMessages: async (sessionId) => {
    const response = await api.get(`/ai/sessions/${sessionId}/messages`);
    return response.data;
  },

  deleteSession: async (sessionId) => {
    const response = await api.delete(`/ai/sessions/${sessionId}`);
    return response.data;
  },

  // Ghi wizard state trực tiếp từ nút bấm (approve_plan, record_template_saved,
  // reset_plan, mark_campaign_created, set_sheet_url) — không tốn AI credit
  patchWizardState: async (sessionId, action, payload = {}) => {
    const response = await api.patch(`/ai/sessions/${sessionId}/wizard-state`, { action, payload });
    return response.data;
  },

  getBusinessProfile: async () => {
    const response = await api.get('/ai/business-profile');
    return response.data;
  },

  saveBusinessProfile: async (data) => {
    const response = await api.put('/ai/business-profile', data);
    return response.data;
  },

  // Landing Page Templates
  getLandingTemplates: async (category = null) => {
    const params = category ? { category } : {};
    const response = await api.get('/landing-templates', { params });
    return response.data;
  },

  getLandingTemplateCategories: async () => {
    const response = await api.get('/landing-templates/categories');
    return response.data;
  },

  getLandingTemplate: async (id) => {
    const response = await api.get(`/landing-templates/${id}`);
    return response.data;
  },

  /**
   * Sinh landing page HTML đầy đủ (Tailwind + nội dung thật, không {{placeholder}}).
   */
  generateLandingPage: async (prompt, _templateId = null, files = [], sessionId = null, userSummary = null, landingBrief = null) => {
    const payload = { prompt, sessionId, userSummary };
    if (landingBrief) {
      payload.landingBrief = landingBrief;
      if (landingBrief.contentLocale) payload.locale = landingBrief.contentLocale;
    }
    const formattedFiles = formatLandingFiles(files);
    if (formattedFiles) {
      payload.files = formattedFiles;
    }
    const response = await api.post('/ai/generate-landing-html', payload, { timeout: 120000 });
    return response.data;
  },

  /**
   * Chỉnh sửa landing page HTML bằng AI (Tailwind + giữ nguyên cấu trúc/số liệu).
   * @param {{ instruction: string, currentHtml: string, locale?: string, sessionId?: string|null, messageId?: string|null, files?: Array }} params
   */
  editLandingHtml: async ({ instruction, currentHtml, locale = 'vi', sessionId = null, messageId = null, files = [] }) => {
    const formattedFiles = formatLandingFiles(files);
    const payload = {
      instruction,
      currentHtml,
      locale,
      sessionId,
      messageId,
      ...(formattedFiles ? { files: formattedFiles } : {}),
    };
    const response = await api.post('/ai/edit-landing-html', payload, {
      timeout: 120000
    });
    return response.data;
  },

  /**
   * Trích xuất danh sách người nhận (email/SĐT) từ file bảng tính (.xlsx, .xls, .csv)
   * hoặc từ link Google Sheet.
   * @param {{ tempId?: string, originalName?: string, contentType?: string, sheetUrl?: string, sheetName?: string }} source
   */
  extractRecipients: async ({ tempId, originalName, contentType, sheetUrl, sheetName }) => {
    const response = await api.post('/ai/extract-recipients', {
      tempId,
      originalName,
      contentType,
      sheetUrl,
      sheetName,
    });
    return response.data;
  },

  /**
   * "AI viết hộ" chỉ dẫn hệ thống cho chatbot (PLAN_AI_VIET_HO_CHI_DAN_CHATBOT_2026-09-13).
   * Mỗi lần gọi trừ 1 credit AI của khách — chỉ gọi khi khách bấm, không tự gọi.
   * @param {{ hint: string, language?: 'vi'|'en' }} input
   * @returns {Promise<{ success: boolean, data: { instruction: string, businessContextUsed: boolean } }>}
   */
  generateSystemInstruction: async ({ hint, language = 'vi' }) => {
    const response = await api.post('/ai/generate-system-instruction', { hint, language }, {
      timeout: 120000,
    });
    return response.data;
  },
};

export default aiApi;
