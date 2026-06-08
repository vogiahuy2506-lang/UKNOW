import landingTemplateRepository from '../../repositories/landingTemplate.repository.js';
import { generateGeminiContent } from '../../utils/geminiClient.util.js';
import businessProfileService from '../ai/businessProfile.service.js';
import uploadController from '../../controllers/upload.controller.js';
import { extractTextFromBuffer } from '../../utils/fileParser.util.js';

/**
 * Service for landing page templates and AI generation.
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
   * Get template by ID.
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async getTemplateById(id) {
    return landingTemplateRepository.findActiveById(id);
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

  /**
   * Generate landing page HTML from prompt using AI.
   * @param {object} params
   * @param {string} params.prompt - User's request
   * @param {number} [params.templateId] - Optional template ID to base on
   * @param {number} [params.userId] - User ID for RAG context
   * @param {Array} [params.files] - Files attached to request
   * @returns {Promise<object>} - { title, html, css, variables }
   */
  async generateLandingPage({ prompt, templateId = null, userId = null, files = [] }) {
    // 1. Get template if specified
    let template = null;
    if (templateId) {
      template = await landingTemplateRepository.findActiveById(templateId);
    }

    // 2. Build RAG context from business profile
    let ragContext = '';
    let businessProfile = null;
    if (userId) {
      try {
        ragContext = await businessProfileService.getContextForPrompt(userId, prompt);
        businessProfile = await businessProfileService.getProfile(userId);
      } catch (e) {
        console.warn('[LandingTemplate] RAG context unavailable:', e.message);
      }
    }

    // 3. Build system prompt with template structure
    const templateInfo = template
      ? `
=== TEMPLATE BASE ===
Template Name: ${template.name}
Template Category: ${template.category}
Template Structure:
${template.html_structure}

CSS Variables: ${JSON.stringify(template.cssVariables || {})}
Default Config: ${JSON.stringify(template.defaultConfig || {})}
`
      : '';

    const systemPrompt = `Bạn là chuyên gia thiết kế Landing Page với 10+ năm kinh nghiệm.
Nhiệm vụ: Tạo landing page HTML đẹp, chuyên nghiệp dựa trên yêu cầu của khách hàng.

${templateInfo}

${ragContext ? ragContext + '\n' : ''}
=== YÊU CẦU CỦA KHÁCH HÀNG ===
"${prompt}"

=== QUY TẮC THIẾT KẾ ===
1. Sử dụng Tailwind CSS (CDN) cho styling
2. HTML phải là FRAGMENT - không cần html/head/body tags
3. Nội dung phải SÚC TÍNH, THUYẾT PHỤC, PHÙ HỢP thương hiệu
4. Form đăng ký PHẢI dùng đúng các thuộc tính name sau để hệ thống lưu lead tự động:
   - Thêm data-lp-lead-form='1' vào thẻ <form>
   - input name='lastName' (Họ - bắt buộc)
   - input name='firstName' (Tên - bắt buộc)
   - input type='email' name='email' (Email - bắt buộc)
   - input type='tel' name='phone' (Số điện thoại - bắt buộc)
   - Nếu yêu cầu thêm trường nghề nghiệp: input name='occupation'
   - Nếu yêu cầu thêm trường lĩnh vực: input name='interestArea'
   - Checkbox name='marketingConsent' với label ngắn gọn đồng ý nhận thông tin (KHÔNG bắt buộc check trước)
   - KHÔNG thêm thuộc tính onsubmit vào form (hệ thống xử lý tự động qua script)
5. Call-to-Action rõ ràng, nổi bật
6. Responsive trên mobile
7. Sử dụng emoji hợp lý cho visual appeal

=== CÁC BIẾN CÓ THỂ SỬ DỤNG ===
Nếu có template, thay thế các placeholder trong template bằng nội dung phù hợp.
Các placeholder có format: {{variable_name}}
VD: {{business_name}}, {{product_name}}, {{cta_text}}, {{headline}}, v.v.

=== ĐỊNH DẠNG TRẢ VỀ (JSON) ===
{
  "title": "Tiêu đề trang (cho browser tab)",
  "html": "Nội dung HTML (FRAGMENT - không có html/head/body)",
  "css": "CSS bổ sung nếu cần (tùy chọn, có thể để trống)",
  "variables": {
    "variable_name": "giá trị đã thay thế"
  },
  "config": {
    "primaryColor": "#màu chính",
    "secondaryColor": "#màu phụ"
  }
}

QUAN TRỌNG:
- Trả về JSON trong một code block: \`\`\`json ... \`\`\`
- HTML phải hoàn chỉnh, có thể dán trực tiếp vào iframe
- BẮTBUỘC dùng SINGLE QUOTES trong mọi HTML attribute (class='...', href='...', onclick='...')
- Không dùng double quotes trong HTML để tránh lỗi JSON encoding`;

    // 4. Call AI
    const parts = [{ text: systemPrompt }];

    // 5. Attach files if any
    for (const file of files) {
      try {
        const buffer = await uploadController.readTempFileBuffer(file.tempId, file.originalName);
        const mimeType = String(file.contentType || '').toLowerCase();
        if (mimeType.startsWith('image/')) {
          parts.push({
            inlineData: {
              mimeType: file.contentType,
              data: buffer.toString('base64'),
            },
          });
        } else {
          const extractedText = await extractTextFromBuffer(buffer, file.originalName, file.contentType);
          if (extractedText.trim()) {
            parts.push({
              text: `[Nội dung tệp đính kèm: "${file.originalName}"]:\n${extractedText}\n[Hết nội dung tệp: "${file.originalName}"]`
            });
          }
        }
      } catch (err) {
        console.warn(`[LandingTemplate] Could not read file ${file.tempId}:`, err.message);
      }
    }

    console.log('[LandingTemplate] Generating landing page...');
    const { text, finishReason } = await generateGeminiContent({
      parts,
      jsonMode: false,
      temperature: 0.7,
    });

    // 6. Parse response
    const result = this._parseJson(text, finishReason);
    return {
      ...result,
      templateId: templateId || null,
      templateName: template?.name || null,
    };
  }

  /**
   * Parse JSON from AI response.
   * @param {string} text
   * @param {string} [finishReason]
   * @returns {object}
   */
  _parseJson(text, finishReason) {
    let jsonStr = String(text || '').trim();

    // Extract from markdown code blocks
    const jsonMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/) || jsonStr.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }
    }

    // Remove trailing commas
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');

    // Attempt 1: direct parse
    try {
      return JSON.parse(jsonStr);
    } catch { /* fall through */ }

    // Attempt 2: sanitize whitespace inside string values
    try {
      const sanitized = jsonStr.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (match, p1) => {
        return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
      });
      return JSON.parse(sanitized);
    } catch { /* fall through */ }

    // Attempt 3: manually extract title + html via regex (handles unescaped quotes in HTML)
    try {
      const titleM = jsonStr.match(/"title"\s*:\s*"([^"]+)"/);
      // html value: everything between "html": " and the next top-level field or end
      const htmlM = jsonStr.match(/"html"\s*:\s*"([\s\S]+)"(?:\s*,\s*"(?:css|variables|config)"|[\s\S]*?\}$)/);
      if (htmlM) {
        const rawHtml = htmlM[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
        return {
          title: titleM ? titleM[1] : '',
          html: rawHtml,
          css: '',
          variables: {},
          config: {},
        };
      }
    } catch { /* fall through */ }

    const msg = finishReason === 'MAX_TOKENS'
      ? 'AI sinh HTML quá dài bị cắt ngắn. Hãy thử yêu cầu ngắn gọn hơn.'
      : 'Failed to parse AI response as JSON';
    throw new Error(msg);
  }
}

export default new LandingTemplateService();
