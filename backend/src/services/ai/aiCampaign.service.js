import { generateGeminiContent } from '../../utils/geminiClient.util.js';
import uploadController from '../../controllers/upload.controller.js';
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
        "content": "Nội dung tin nhắn Zalo thân thiện..."
      }
    }
  ],
  "connections": [
    { "sourceNodeId": "node_1", "targetNodeId": "node_2", "connectionType": "default" },
    { "sourceNodeId": "node_2", "targetNodeId": "node_3", "connectionType": "default" },
    { "sourceNodeId": "node_3", "targetNodeId": "node_4", "connectionType": "default" }
  ]
}

LƯU Ý: 
- Nội dung Email và Zalo phải cực kỳ chuyên nghiệp, đánh trúng tâm lý khách hàng dựa trên thông tin sản phẩm.
- Tự động tạo ít nhất 3-5 bước trong chiến dịch để tăng tỷ lệ chuyển đổi.
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
      
      return JSON.parse(jsonStr);
    } catch (err) {
      console.error('AI returned invalid JSON:', text);
      console.error('Extraction error:', err.message);
      throw new Error('AI không thể tạo kịch bản đúng định dạng. Vui lòng thử lại với yêu cầu chi tiết hơn.');
    }
  }
}

export default new AiCampaignService();
