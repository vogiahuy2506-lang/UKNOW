import { generateGeminiContent } from '../../utils/geminiClient.util.js';
import uploadController from '../../controllers/upload.controller.js';
import axios from 'axios';
import path from 'path';

class AiCampaignService {
  /**
   * Generate campaign JSON structure from prompt and files.
   *
   * @param {object} input
   * @param {string} input.prompt
   * @param {Array<object>} input.files Array of { tempId, originalName, contentType, tempPath }
   * @returns {Promise<object>}
   */
  async generateCampaignScript({ prompt, files = [] }) {
    const parts = [];

    // Add prompt text
    parts.push({
      text: `Bạn là một chuyên gia Marketing Automation cấp cao. 
Nhiệm vụ của bạn là đọc hiểu thông tin doanh nghiệp, sản phẩm/dịch vụ từ các tài liệu đính kèm và yêu cầu của người dùng để thiết kế một CHIẾN DỊCH MARKETING ĐA KÊNH (Email, Zalo Cá Nhân, Zalo Nhóm).

Dưới đây là yêu cầu từ khách hàng: "${prompt}"

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
    },
    {
        "tempId": "node_3",
        "nodeType": "logic",
        "nodeSubtype": "wait_time",
        "nodeName": "Chờ 1 ngày",
        "positionX": 400,
        "positionY": 300,
        "config": { "amount": 1, "unit": "days" }
    },
    {
      "tempId": "node_4",
      "nodeType": "action",
      "nodeSubtype": "zalo_personal",
      "nodeName": "Tin nhắn Zalo nhắc nhở",
      "nodeDescription": "Gửi sau 1 ngày",
      "positionX": 700,
      "positionY": 300,
      "config": {
        "content": "Nội dung tin nhắn Zalo thân thiện, chuyên nghiệp..."
      }
    }
  ],
  "connections": [
    { "sourceNodeId": "node_1", "targetNodeId": "node_2", "connectionType": "default" },
    { "sourceNodeId": "node_2", "targetNodeId": "node_3", "connectionType": "default" },
    { "sourceNodeId": "node_3", "targetNodeId": "node_4", "connectionType": "default" }
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

    // Add files to parts
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

    try {
      // Aggressive JSON extraction: find the first '{' and last '}'
      let jsonStr = text.trim();
      
      // Try markdown first
      const jsonMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/) || jsonStr.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      } else {
        // Find first '{' and last '}'
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }
      }
      
      // Clean trailing commas (common AI mistake)
      jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
      
      console.log(`[AI] Extracted JSON length: ${jsonStr.length}`);
      
      try {
        return JSON.parse(jsonStr); // Try original first
      } catch (firstErr) {
        // If it fails, try to aggressively clean only the values
        console.warn('Initial JSON parse failed, attempting sanitization...', firstErr.message);
        
        // This regex finds content between quotes and escapes literal newlines within them
        const sanitized = jsonStr.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (match, p1) => {
          return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
        });
        
        return JSON.parse(sanitized);
      }
    } catch (err) {
      console.error('Final JSON parse failed:', text);
      throw new Error('AI không thể tạo kịch bản đúng định dạng. Vui lòng thử lại với yêu cầu chi tiết hơn.');
    }
  }

  /**
   * Process interactive chat with context.
   *
   * @param {object} input
   * @param {Array<object>} input.history Message history [{ role: 'user'|'assistant', content: string }]
   * @param {Array<object>} input.files Current attached files
   * @returns {Promise<object>} { type: 'text'|'script', content: string, data?: object }
   */
  async processSmartChat({ history = [], files = [] }) {
    const contents = [];

    // System instruction
    const systemPrompt = `Bạn là UKNOW AI - Trợ lý Marketing thông minh.
Nhiệm vụ của bạn là tương tác và hỗ trợ người dùng trong các hoạt động Marketing.

QUY TẮC PHẢN HỒI:
1. Nếu người dùng chỉ chào hỏi, hỏi thông tin chung hoặc thảo luận, hoặc YÊU CẦU VIẾT MỘT ĐOẠN VĂN/MẪU TIN NHẮN đơn thuần để tham khảo, hãy trả lời bằng văn bản tự nhiên (type: "text").
2. Chỉ sử dụng type: "script" khi người dùng muốn TẠO CHIẾN DỊCH, QUY TRÌNH TỰ ĐỘNG, hoặc THIẾT KẾ TRANG ĐÍCH để có thể thực thi trên hệ thống.
3. CHỈ TẠO NHỮNG GÌ NGƯỜI DÙNG YÊU CẦU:
   - Chỉ tạo "nodes" (kịch bản tin nhắn) nếu người dùng yêu cầu kịch bản, chiến dịch, hoặc quy trình tự động.
   - Chỉ tạo "landingPage" nếu người dùng yêu cầu trang đích, trang web, hoặc giao diện giới thiệu.
   - Nếu người dùng chỉ yêu cầu một thứ, hãy để các trường khác là null.
4. Nếu tạo script, bạn BẮT BUỘC phải trả về cấu trúc JSON sau trong trường "data":
    {
      "campaignName": "Tên chiến dịch/Yêu cầu",
      "description": "Mô tả ngắn",
      "campaignType": "mixed",
      "nodes": [
        { "tempId": "n1", "nodeType": "trigger", "nodeSubtype": "manual", "nodeName": "Bắt đầu", "positionX": 100, "positionY": 100 },
        { "tempId": "n2", "nodeType": "action", "nodeSubtype": "email", "nodeName": "Gửi Email", "positionX": 400, "positionY": 100, "config": { ... } }
      ],
      "connections": [
        { "sourceNodeId": "n1", "targetNodeId": "n2", "connectionType": "default" }
      ],
      "landingPage": { ... } | null
    }
6. Các nodeSubtype hợp lệ: email, zalo_personal, zalo_group, wait_time.
5. Khi viết nội dung tin nhắn (trong nodes.config), hãy viết cực kỳ chi tiết và chuyên nghiệp.

ĐỊNH DẠNG TRẢ VỀ (BẮT BUỘC JSON):
{
  "type": "text" | "script",
  "content": "Lời nhắn của bạn cho người dùng",
  "data": null | { ... }
}`;

    // Prepare contents for Gemini (including history)
    // Map history to Gemini format
    const geminiHistory = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content || '(no text)' }]
    }));

    // For the last message, we might have files
    const lastMessage = geminiHistory[geminiHistory.length - 1];
    
    // If there are files, we need to add them to the last user message parts
    if (files.length > 0) {
      for (const file of files) {
        try {
          const buffer = await uploadController.readTempFileBuffer(file.tempId, file.originalName);
          lastMessage.parts.push({
            inlineData: {
              mimeType: file.contentType,
              data: buffer.toString('base64'),
            },
          });
        } catch (err) {
          console.warn(`Could not read file ${file.tempId} for AI:`, err.message);
        }
      }
    }

    // Call Gemini
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    const modelName = String(process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    // Call Gemini using axios (already in project)
    try {
      const { data: result } = await axios.post(url, {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: geminiHistory,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.8,
        }
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000
      });

      if (!result.candidates || result.candidates.length === 0) {
        if (result.promptFeedback?.blockReason) {
          throw new Error(`Yêu cầu bị chặn: ${result.promptFeedback.blockReason}`);
        }
        throw new Error('AI không phản hồi, vui lòng thử lại.');
      }

      const text = result.candidates[0].content?.parts?.[0]?.text;
      if (!text) throw new Error('AI trả về kết quả rỗng.');

      try {
        return JSON.parse(text); // Try original first
      } catch (firstErr) {
        // If it fails, try to aggressively clean only the values
        console.warn('Initial JSON parse failed, attempting sanitization...', firstErr.message);
        
        // This regex finds content between quotes and escapes literal newlines within them
        const sanitized = text.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (match, p1) => {
          return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
        });
        
        return JSON.parse(sanitized);
      }
    } catch (err) {
      if (err.response) {
        console.error('Gemini API Error Detail:', JSON.stringify(err.response.data, null, 2));
        throw new Error(`Gemini API Error (${err.response.status}): ${JSON.stringify(err.response.data)}`);
      }
      throw err;
    }
  }
}

export default new AiCampaignService();
