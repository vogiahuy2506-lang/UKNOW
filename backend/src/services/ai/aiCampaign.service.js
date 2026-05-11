import { generateGeminiContent } from '../../utils/geminiClient.util.js';
import businessProfileService from './businessProfile.service.js';
import { buildAdminContext } from './adminContext.service.js';
import uploadController from '../../controllers/upload.controller.js';
import axios from 'axios';

class AiCampaignService {
  /**
   * Generate campaign JSON structure from prompt and files.
   */
  async generateCampaignScript({ prompt, files = [], userId = null }) {
    const parts = [];

    // RAG: bơm context doanh nghiệp nếu user đã thiết lập hồ sơ
    let ragContext = '';
    if (userId) {
      try {
        ragContext = await businessProfileService.getContextForPrompt(userId, prompt);
      } catch (e) {
        console.warn('[AI] Không lấy được RAG context:', e.message);
      }
    }

    parts.push({
      text: `Bạn là một chuyên gia Marketing Automation cấp cao. 
Nhiệm vụ của bạn là đọc hiểu thông tin doanh nghiệp, sản phẩm/dịch vụ từ các tài liệu đính kèm và yêu cầu của người dùng để thiết kế một CHIẾN DỊCH MARKETING ĐA KÊNH (Email, Zalo Cá Nhân, Zalo Nhóm).

${ragContext ? ragContext + '\n\n' : ''}Dưới đây là yêu cầu từ khách hàng: "${prompt}"

Hãy phân tích tài liệu (nếu có) và tạo ra một kịch bản chiến dịch hoàn chỉnh dưới định dạng JSON để hệ thống có thể thực thi ngay lập tức.

QUY TẮC THIẾT KẾ:
1. Luôn bắt đầu bằng một node "trigger" (Subtype: "manual" hoặc "read_landing_leads").
2. Sử dụng các node "action" để gửi thông điệp:
   - "email": Gửi email (cần subject, content).
   - "zalo_personal": Gửi tin nhắn Zalo cá nhân (cần content).
   - "zalo_group": Gửi tin nhắn vào nhóm Zalo (cần content).
3. Sử dụng các node "logic" để tạo độ trễ (Subtype: "wait_time" - config: { amount, unit: 'minutes'|'hours'|'days' }).
4. Các node phải được nối với nhau qua mảng "connections".

CẤU TRÚC JSON PHẢI TRẢ VỀ (VÀ CHỈ TRẢ VỀ JSON):
{
  "campaignName": "Tên chiến dịch hấp dẫn",
  "description": "Mô tả ngắn gọn mục tiêu chiến dịch",
  "campaignType": "mixed",
  "nodes": [
    {
      "tempId": "node_1",
      "nodeType": "trigger",
      "nodeSubtype": "manual",
      "nodeName": "Bắt đầu chiến dịch",
      "nodeDescription": "Kích hoạt thủ công",
      "positionX": 100,
      "positionY": 100,
      "config": {}
    },
    {
      "tempId": "node_2",
      "nodeType": "action",
      "nodeSubtype": "email",
      "nodeName": "Email chào mừng",
      "nodeDescription": "Gửi ngay sau khi bắt đầu",
      "positionX": 400,
      "positionY": 100,
      "config": {
        "subject": "Tiêu đề email hấp dẫn",
        "content": "Nội dung email chi tiết, chuyên nghiệp, cá nhân hóa..."
      }
    }
  ],
  "connections": [
    { "sourceNodeId": "node_1", "targetNodeId": "node_2", "connectionType": "default" }
  ],
  "landingPage": {
    "title": "Tiêu đề trang đích",
    "html": "Mã HTML (không cần thẻ body/html, chỉ nội dung bên trong)",
    "css": "Mã CSS tùy chỉnh để làm trang đẹp hơn"
  }
}

LƯU Ý QUAN TRỌNG: 
- Bạn BẮT BUỘC phải viết nội dung chi tiết cho từng email (subject, content) và tin nhắn zalo (content). Không được để trống hoặc dùng nội dung giữ chỗ.
- Nội dung phải mang tính thuyết phục cao, cá nhân hóa theo thông tin doanh nghiệp/sản phẩm đã cung cấp.
- Thiết kế một Landing Page hấp dẫn (HTML/CSS) phù hợp với mục tiêu chiến dịch.
- Chỉ trả về duy nhất khối JSON, không có văn bản giải thích bên ngoài.`
    });

    for (const file of files) {
      try {
        const buffer = await uploadController.readTempFileBuffer(file.tempId, file.originalName);
        parts.push({
          inlineData: {
            mimeType: file.contentType,
            data: buffer.toString('base64'),
          },
        });
      } catch (err) {
        console.warn(`Could not read file ${file.tempId} for AI:`, err.message);
      }
    }

    console.log(`[AI] Sending prompt + ${parts.length - 1} files to Gemini...`);
    const { text } = await generateGeminiContent({
      parts,
      jsonMode: true,
      temperature: 0.7,
    });
    console.log(`[AI] Gemini response received (${text?.length || 0} chars)`);

    return this._parseJson(text);
  }

  /**
   * Process interactive smart chat with intent detection.
   * Returns: { type, content, data, missing_fields }
   */
  async processSmartChat({ history = [], files = [], userId = null, userRole = 'user_admin' }) {
    let contextBlock = '';

    if (userRole === 'super_admin') {
      // Super admin: inject số liệu nền tảng real-time
      try {
        contextBlock = await buildAdminContext();
      } catch (e) {
        console.warn('[AI] Không lấy được admin context:', e.message);
      }

      const adminSystemPrompt = `Bạn là UKNOW AI - Trợ lý thông minh cho System Admin của nền tảng UKNOW.
Nhiệm vụ của bạn là phân tích số liệu, tư vấn chiến lược và trả lời câu hỏi về tình trạng hoạt động của nền tảng.

${contextBlock}

QUY TẮC:
- Luôn dựa trên dữ liệu thực được cung cấp ở trên, không được bịa số liệu.
- Trả lời súc tích, rõ ràng. Dùng bullet points khi liệt kê.
- Nếu người dùng hỏi về dữ liệu không có trong context (ví dụ: chi tiết từng user cụ thể), hãy nói rõ rằng bạn chỉ có số liệu tổng quan.
- Có thể đưa ra nhận xét, phân tích xu hướng, và gợi ý hành động dựa trên số liệu.

ĐỊNH DẠNG TRẢ VỀ (BẮT BUỘC JSON):
{
  "type": "text",
  "content": "Câu trả lời của bạn (tiếng Việt)",
  "missing_fields": [],
  "data": null
}`;

      return this._runChat(adminSystemPrompt, history, files);
    }

    // User admin: RAG context từ hồ sơ doanh nghiệp
    if (userId && history.length > 0) {
      const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        try {
          contextBlock = await businessProfileService.getContextForPrompt(userId, lastUserMsg.content);
        } catch (e) {
          console.warn('[AI] Không lấy được RAG context:', e.message);
        }
      }
    }

    const systemPrompt = `Bạn là UKNOW AI - Trợ lý Marketing thông minh, chuyên hỗ trợ tạo template tin nhắn, chiến dịch marketing và landing page.

## NGUYÊN TẮC QUAN TRỌNG NHẤT:
- KHÔNG BAO GIỜ tự bịa thông tin về sản phẩm, doanh nghiệp, tên công ty, giá cả, khuyến mãi.
- Nếu thiếu thông tin cần thiết → type: "ask_more", hỏi cụ thể những gì còn thiếu.
- Chỉ tạo nội dung khi đã có đủ thông tin từ người dùng.

${contextBlock ? contextBlock + '\n\n' : ''}## PHÂN LOẠI Ý ĐỊNH (intent):

### 1. type: "text"
Khi người dùng: chào hỏi, hỏi thông tin chung, thảo luận không liên quan đến tạo nội dung.

### 2. type: "ask_more"
Khi người dùng muốn tạo template/chiến dịch/landing page NHƯNG THIẾU thông tin:

Thông tin cần có để viết TEMPLATE EMAIL:
- Tên doanh nghiệp / sản phẩm / dịch vụ
- Mục tiêu email (chào mừng, khuyến mãi, nhắc nhở, thông báo...)
- Tông giọng (chuyên nghiệp, thân thiện, khẩn cấp...)
- Thông tin ưu đãi hoặc nội dung chính muốn truyền đạt

Thông tin cần có để viết TEMPLATE ZALO:
- Tên doanh nghiệp / sản phẩm / dịch vụ
- Mục tiêu tin nhắn
- Nội dung chính (ngắn gọn, dưới 4000 ký tự)

Thông tin cần có để tạo CHIẾN DỊCH:
- Tên doanh nghiệp / sản phẩm
- Mục tiêu chiến dịch (bán hàng, chăm sóc khách hàng, re-engagement...)
- Kênh muốn dùng (Email / Zalo / cả hai)
- Đối tượng khách hàng

Thông tin cần có để tạo LANDING PAGE:
- Tên doanh nghiệp / sản phẩm
- Mục tiêu trang (thu thập lead, giới thiệu sản phẩm, đăng ký dùng thử...)
- Nội dung chính muốn hiển thị

### 3. type: "template_draft"
Khi người dùng muốn tạo MẪU TIN NHẮN (email hoặc Zalo) và đã có ĐỦ thông tin.

Data structure:
{
  "channel": "email" | "zalo",
  "templateName": "Tên template gợi ý",
  "subject": "Tiêu đề (chỉ khi channel=email)",
  "bodyHtml": "Nội dung HTML đầy đủ và đẹp (chỉ khi channel=email, phải là HTML hoàn chỉnh với style inline)",
  "bodyText": "Nội dung văn bản thuần (bắt buộc cho Zalo, tùy chọn cho Email)"
}

Khi viết bodyHtml: Hãy viết HTML đẹp, chuyên nghiệp với màu sắc hài hòa, font chữ rõ ràng, có heading/paragraph/button CTA, style INLINE.

### 4. type: "campaign_script"
Khi người dùng muốn TẠO CHIẾN DỊCH và đã có ĐỦ thông tin.

Data structure (giống campaign nodes):
{
  "campaignName": "...",
  "description": "...",
  "campaignType": "mixed",
  "nodes": [...],
  "connections": [...],
  "landingPage": null
}

### 5. type: "landing_page"
Khi người dùng muốn TẠO LANDING PAGE và đã có ĐỦ thông tin.

Data structure:
{
  "title": "Tiêu đề trang",
  "html": "Nội dung HTML (không cần thẻ html/head/body)",
  "css": "CSS tùy chỉnh"
}

## ĐỊNH DẠNG TRẢ VỀ (BẮT BUỘC JSON):
{
  "type": "text" | "ask_more" | "template_draft" | "campaign_script" | "landing_page",
  "content": "Lời nhắn cho người dùng (tiếng Việt, thân thiện)",
  "missing_fields": [] | ["tên sản phẩm", "mục tiêu email"],
  "data": null | { ... }
}

Khi type="ask_more": content là câu hỏi cụ thể, missing_fields liệt kê những gì cần.
Khi type="template_draft": content mô tả template vừa tạo, data chứa template.
Khi type="campaign_script": content mô tả chiến dịch, data chứa script.
Khi type="landing_page": content mô tả trang, data chứa html/css.`;

    return this._runChat(systemPrompt, history, files);
  }

  /**
   * Shared Gemini chat runner — builds history, attaches files, calls API.
   * @param {string} systemPrompt
   * @param {Array}  history  — [{role, content}]
   * @param {Array}  files    — [{tempId, originalName, contentType}]
   */
  async _runChat(systemPrompt, history, files) {
    const geminiHistory = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content || '(no text)' }]
    }));

    const lastMessage = geminiHistory[geminiHistory.length - 1];

    if (files.length > 0) {
      for (const file of files) {
        try {
          const buffer = await uploadController.readTempFileBuffer(file.tempId, file.originalName);
          lastMessage.parts.push({
            inlineData: { mimeType: file.contentType, data: buffer.toString('base64') },
          });
        } catch (err) {
          console.warn(`Could not read file ${file.tempId} for AI:`, err.message);
        }
      }
    }

    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    const modelName = String(process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
      const { data: result } = await axios.post(url, {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: geminiHistory,
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 120000 });

      if (!result.candidates || result.candidates.length === 0) {
        if (result.promptFeedback?.blockReason) {
          throw new Error(`Yêu cầu bị chặn: ${result.promptFeedback.blockReason}`);
        }
        throw new Error('AI không phản hồi, vui lòng thử lại.');
      }

      const text = result.candidates[0].content?.parts?.[0]?.text;
      if (!text) throw new Error('AI trả về kết quả rỗng.');

      return this._parseJson(text);
    } catch (err) {
      if (err.response) {
        console.error('Gemini API Error Detail:', JSON.stringify(err.response.data, null, 2));
        throw new Error(`Gemini API Error (${err.response.status}): ${JSON.stringify(err.response.data)}`);
      }
      throw err;
    }
  }

  /**
   * Robustly parse JSON from AI output.
   */
  _parseJson(text) {
    let jsonStr = text.trim();
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
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');

    try {
      return JSON.parse(jsonStr);
    } catch {
      const sanitized = jsonStr.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (match, p1) => {
        return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
      });
      return JSON.parse(sanitized);
    }
  }
}

export default new AiCampaignService();
