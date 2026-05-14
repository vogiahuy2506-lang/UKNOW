import { generateGeminiContent } from '../../utils/geminiClient.util.js';
import businessProfileService from './businessProfile.service.js';
import { buildAdminContext } from './adminContext.service.js';
import landingTemplateService from '../landingTemplate/landingTemplate.service.js';
import uploadController from '../../controllers/upload.controller.js';
import axios from 'axios';
import db from '../../config/database.js';

class AiCampaignService {
  /**
   * Lấy danh sách email templates của user để AI điền sẵn config.
   * @param {number} userId
   * @returns {Promise<Array>}
   */
  async getEmailTemplates(userId) {
    try {
      const result = await db.query(
        `SELECT id, template_name, subject, category
         FROM email_templates
         WHERE id_user = $1 AND is_active = true
         ORDER BY usage_count DESC, created_at DESC
         LIMIT 10`,
        [userId]
      );
      return result.rows.map(r => ({
        id: r.id,
        name: r.template_name,
        subject: r.subject,
        category: r.category,
      }));
    } catch (e) {
      console.warn('[AI] Không lấy được email templates:', e.message);
      return [];
    }
  }

  /**
   * Lấy danh sách tài khoản Zalo đã kết nối của user.
   * @param {number} userId
   * @returns {Promise<Array>}
   */
  async getZaloAccounts(userId) {
    try {
      const result = await db.query(
        `SELECT id, display_name, zalo_name, status
         FROM zalo_settings
         WHERE id_user = $1 AND status = 'connected'
         ORDER BY is_default DESC, created_at DESC
         LIMIT 5`,
        [userId]
      );
      return result.rows.map(r => ({
        id: r.id,
        displayName: r.display_name,
        zaloName: r.zalo_name,
        status: r.status,
      }));
    } catch (e) {
      console.warn('[AI] Không lấy được Zalo accounts:', e.message);
      return [];
    }
  }

  /**
   * Lấy danh sách nhóm Zalo từ tài khoản đầu tiên của user.
   * @param {number} userId
   * @returns {Promise<Array>}
   */
  async getZaloGroups(userId) {
    try {
      // Lấy account đầu tiên đã kết nối
      const accountResult = await db.query(
        `SELECT id FROM zalo_settings
         WHERE id_user = $1 AND status = 'connected'
         ORDER BY is_default DESC LIMIT 1`,
        [userId]
      );
      if (!accountResult.rows.length) return [];

      const accountId = accountResult.rows[0].id;
      // Lấy groups từ bảng zalo_groups (nếu có)
      const groupResult = await db.query(
        `SELECT id, group_id, group_name, member_count
         FROM zalo_groups
         WHERE id_zalo_setting = $1
         ORDER BY member_count DESC
         LIMIT 10`,
        [accountId]
      );
      return groupResult.rows.map(r => ({
        id: r.id,
        groupId: r.group_id,
        groupName: r.group_name,
        memberCount: r.member_count,
      }));
    } catch (e) {
      console.warn('[AI] Không lấy được Zalo groups:', e.message);
      return [];
    }
  }

  /**
   * Lấy thông tin khuyến nghị campaign type dựa trên profile doanh nghiệp.
   * @param {number} userId
   * @returns {Promise<string>}
   */
  async getRecommendedCampaignType(userId) {
    try {
      const profile = await businessProfileService.getProfile(userId);
      if (!profile) return 'mixed';

      const industry = String(profile.industry || '').toLowerCase();
      const products = String(profile.products || '').toLowerCase();
      const targetAudience = String(profile.target_audience || '').toLowerCase();

      // Heuristics để gợi ý campaign type phù hợp
      // B2B: Nên dùng email nhiều hơn
      if (industry.includes('b2b') || industry.includes('doanh nghiệp') ||
          industry.includes('công nghệ') || industry.includes('phần mềm')) {
        return 'email';
      }

      // B2C / Consumer: Zalo hiệu quả hơn
      if (industry.includes('b2c') || industry.includes('retail') ||
          industry.includes('fmcg') || industry.includes('thực phẩm') ||
          industry.includes('giáo dục') || industry.includes('sức khỏe')) {
        // Check nếu có Zalo accounts thì gợi Zalo
        const zaloAccounts = await this.getZaloAccounts(userId);
        if (zaloAccounts.length > 0) {
          return 'zalo';
        }
      }

      // Mặc định là mixed để kết hợp đa kênh
      return 'mixed';
    } catch (e) {
      console.warn('[AI] Không xác định được campaign type:', e.message);
      return 'mixed';
    }
  }

  /**
   * Generate campaign JSON structure from prompt and files.
   */
  async generateCampaignScript({ prompt, files = [], userId = null }) {
    const parts = [];

    // RAG: bơm context doanh nghiệp nếu user đã thiết lập hồ sơ
    let ragContext = '';
    let businessProfile = null;
    if (userId) {
      try {
        ragContext = await businessProfileService.getContextForPrompt(userId, prompt);
        businessProfile = await businessProfileService.getProfile(userId);
      } catch (e) {
        console.warn('[AI] Không lấy được RAG context:', e.message);
      }
    }

    // Thu thập existing resources để AI điền sẵn config
    let existingResources = '';
    if (userId) {
      try {
        const emailTemplates = await this.getEmailTemplates(userId);
        const zaloAccounts = await this.getZaloAccounts(userId);
        const zaloGroups = await this.getZaloGroups(userId);
        const recommendedType = await this.getRecommendedCampaignType(userId);

        existingResources = `
=== TÀI NGUYÊN CÓ SẴN CỦA DOANH NGHIỆP ===
(Nên sử dụng các tài nguyên này để điền sẵn config cho nodes)

Khuyến nghị loại chiến dịch: ${recommendedType}
${recommendedType === 'email' ? '- Doanh nghiệp này phù hợp với Email marketing (B2B)' :
  recommendedType === 'zalo' ? '- Doanh nghiệp này phù hợp với Zalo marketing (B2C)' :
  '- Nên kết hợp đa kênh Email + Zalo'}

${emailTemplates.length > 0 ? `Email Templates có sẵn (ưu tiên dùng nếu phù hợp):
${emailTemplates.map(t => `- ID: ${t.id} | Tên: ${t.name} | Subject: ${t.subject} | Category: ${t.category || 'N/A'}`).join('\n')}` : 'Chưa có email template nào.'}

${zaloAccounts.length > 0 ? `Tài khoản Zalo đã kết nối (dùng làm zaloAccountId):
${zaloAccounts.map(a => `- ID: ${a.id} | Tên hiển thị: ${a.displayName} | Zalo Name: ${a.zaloName || 'N/A'}`).join('\n')}` : 'Chưa có tài khoản Zalo nào được kết nối.'}

${zaloGroups.length > 0 ? `Nhóm Zalo có sẵn (dùng làm zaloGroupNodeId):
${zaloGroups.map(g => `- ID: ${g.id} | Tên nhóm: ${g.groupName} | Thành viên: ${g.memberCount || 'N/A'}`).join('\n')}` : 'Chưa có nhóm Zalo nào.'}
`;
      } catch (e) {
        console.warn('[AI] Không lấy được existing resources:', e.message);
      }
    }

    parts.push({
      text: `Bạn là một chuyên gia Marketing Automation cấp cao.
Nhiệm vụ của bạn là đọc hiểu thông tin doanh nghiệp, sản phẩm/dịch vụ từ các tài liệu đính kèm và yêu cầu của người dùng để thiết kế một CHIẾN DỊCH MARKETING hoàn chỉnh.

LUỒNG HOẠT ĐỘNG MỚI:
1. AI sẽ tạo ra DRAFT chiến dịch (chưa khởi tạo thật sự)
2. User xem draft, chỉnh sửa nếu cần
3. User nhấn "Tạo chiến dịch" để khởi tạo thật sự

${ragContext ? ragContext + '\n\n' : ''}${existingResources ? existingResources + '\n\n' : ''}Dưới đây là yêu cầu từ khách hàng: "${prompt}"

QUY TẮC THIẾT KẾ:
1. Luôn bắt đầu bằng một node "trigger" (Subtype: "manual" hoặc "read_landing_leads").
2. Sử dụng các node "action" để gửi thông điệp:
   - "send_email": Gửi email (cần subject, bodyHtml/bodyText).
   - "send_zalo_personal": Gửi tin nhắn Zalo cá nhân (cần content).
   - "send_zalo_group": Gửi tin nhắn vào nhóm Zalo (cần content).
3. Sử dụng node "logic" với Subtype "wait_time" để tạo độ trễ giữa các bước (config: { amount, unit: 'minutes'|'hours'|'days' }).
4. **BẮT BUỘC phải điền config đầy đủ cho mỗi node:**

   **Node send_email BẮT BUỘC phải có config với các trường:**
   - emailTemplateId: ID_SỐ_HOẶC_NULL (VD: 1 hoặc null)
   - emailSubject: "Tiêu đề email hấp dẫn (bắt buộc)"
   - emailBody: "<h1>HTML...</h1> (bắt buộc, HTML hoàn chỉnh)"
   - templateMappings: []
   - enableLinkTracking: true
   - saveMessageLog: true

   **Node send_zalo_personal BẮT BUỘC phải có config với các trường:**
   - zaloAccountId: ID_SỐ_HOẶC_NULL (VD: 1 hoặc null)
   - recipientNodeId: null
   - message: "Nội dung tin nhắn Zalo (bắt buộc, dưới 4000 ký tự)"
   - zaloPersonalTemplateSteps: []
   - saveMessageLog: true

   **Node send_zalo_group BẮT BUỘC phải có config với các trường:**
   - zaloAccountId: ID_SỐ_HOẶC_NULL (VD: 1 hoặc null)
   - zaloGroupNodeId: ID_SỐ_HOẶC_NULL (VD: 1 hoặc null)
   - message: "Nội dung tin nhắn nhóm (bắt buộc)"
   - zaloGroupTemplateSteps: []
   - saveMessageLog: true

5. KẾ HOẠCH THỜI GIAN BẮT BUỘC cho mỗi bước gửi:
   - Tính từ thời điểm trigger
   - Email 1: gửi ngay (0 phút)
   - Zalo 1: gửi sau 5-10 phút
   - Email 2: gửi sau 2-3 ngày
   - Zalo 2: gửi sau 3-4 ngày
   - Email 3: gửi sau 7 ngày
   - Tạo node wait_time giữa các bước với thời gian phù hợp
6. Các node phải được nối với nhau qua mảng "connections".
7. **QUAN TRỌNG**: 
   - Điền emailTemplateId, zaloAccountId, zaloGroupNodeId từ danh sách có sẵn (nếu có)
   - Nếu không có tài nguyên, vẫn phải tạo config với giá trị mặc định: emailTemplateId=null, zaloAccountId=null, zaloGroupNodeId=null
   - KHONG DC de config trong {} cho cac node action

CẤU TRÚC JSON PHẢI TRẢ VỀ (VÀ CHỈ TRẢ VỀ JSON):
{
  "campaignName": "Tên chiến dịch hấp dẫn, có chứa từ khóa sản phẩm",
  "description": "Mô tả ngắn gọn mục tiêu chiến dịch (1-2 câu)",
  "campaignType": "mixed",
  "isAiDraft": true,
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
      "nodeSubtype": "send_email",
      "nodeName": "Email chào mừng - Giới thiệu sản phẩm",
      "nodeDescription": "Gửi email giới thiệu sản phẩm ngay khi kích hoạt",
      "positionX": 400,
      "positionY": 80,
      "config": {
        "emailTemplateId": null,
        "emailSubject": "🎉 Chào mừng bạn đến với [TÊN_SẢN_PHẨM]!",
        "emailBody": "<h1>Xin chào!</h1><p>Chúng tôi rất vui được giới thiệu đến bạn sản phẩm tuyệt vời này...</p>",
        "templateMappings": [],
        "enableLinkTracking": true,
        "saveMessageLog": true
      }
    },
    {
      "tempId": "node_3",
      "nodeType": "logic",
      "nodeSubtype": "wait_time",
      "nodeName": "Chờ 3 ngày",
      "nodeDescription": "Đợi 3 ngày sau email đầu tiên",
      "positionX": 700,
      "positionY": 80,
      "config": {
        "amount": 3,
        "unit": "days"
      }
    },
    {
      "tempId": "node_4",
      "nodeType": "action",
      "nodeSubtype": "send_zalo_personal",
      "nodeName": "Zalo cá nhân - Nhắc nhở ưu đãi",
      "nodeDescription": "Gửi tin nhắn Zalo nhắc nhở sau 3 ngày",
      "positionX": 1000,
      "positionY": 80,
      "config": {
        "zaloAccountId": null,
        "recipientNodeId": null,
        "message": "Xin chào! 👋\n\nChúng tôi có ưu đãi đặc biệt dành cho bạn. Nhấn vào đường link để xem chi tiết nhé!",
        "zaloPersonalTemplateSteps": [],
        "saveMessageLog": true
      }
    },
    {
      "tempId": "node_5",
      "nodeType": "action",
      "nodeSubtype": "send_zalo_group",
      "nodeName": "Zalo nhóm - Chia sẻ ưu đãi",
      "nodeDescription": "Gửi tin nhắn vào nhóm Zalo",
      "positionX": 1300,
      "positionY": 80,
      "config": {
        "zaloAccountId": null,
        "zaloGroupNodeId": null,
        "message": "📢 Thông báo ưu đãi!\n\nChia sẻ tin tuyệt vời này đến mọi người trong nhóm nhé!",
        "zaloGroupTemplateSteps": [],
        "saveMessageLog": true
      }
    }
  ],
  "connections": [
    { "sourceNodeId": "node_1", "targetNodeId": "node_2", "connectionType": "default" },
    { "sourceNodeId": "node_2", "targetNodeId": "node_3", "connectionType": "default" },
    { "sourceNodeId": "node_3", "targetNodeId": "node_4", "connectionType": "default" },
    { "sourceNodeId": "node_4", "targetNodeId": "node_5", "connectionType": "default" }
  ],
  "landingPage": null
}

LƯU Ý QUAN TRỌNG:
- Bạn BẮT BUỘC phải viết nội dung chi tiết cho từng email (subject, bodyHtml) và tin nhắn zalo (message). Không được để trống hoặc dùng nội dung giữ chỗ.
- Nội dung phải mang tính thuyết phục cao, cá nhân hóa theo thông tin doanh nghiệp/sản phẩm đã cung cấp.
- Nếu có email templates hoặc Zalo accounts trong danh sách trên, HÃY ĐIỀN ID THỰC TẾ vào config (emailTemplateId, zaloAccountId, zaloGroupNodeId).
- Nếu không có tài nguyên, vẫn phải tạo config ĐẦY ĐỦ với giá trị null: emailTemplateId=null, zaloAccountId=null, zaloGroupNodeId=null
- KHONG DC de config trong {} cho cac node action - phai co it nhat message/emailSubject/emailBody
- Thiết kế đa kênh: kết hợp Email + Zalo cá nhân + Zalo nhóm (ít nhất 2-3 kênh).
- Mỗi bước phải có kế hoạch thời gian rõ ràng, sử dụng node wait_time để tạo khoảng cách.
- Tổng chiến dịch nên có 4-6 bước gửi tin nhắn trong 10-14 ngày.
- ĐÂY LÀ DRAFT - user sẽ xem trước và nhấn "Tạo chiến dịch" để khởi tạo thật sự.
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
  async processSmartChat({ history = [], files = [], userId = null, userRole = 'user' }) {
    let contextBlock = '';

    if (userRole === 'admin') {
      // Super admin: inject số liệu nền tảng real-time
      try {
        contextBlock = await buildAdminContext();
      } catch (e) {
        console.warn('[AI] Không lấy được admin context:', e.message);
      }

      const adminSystemPrompt = `Bạn là Founder AI AI - Trợ lý thông minh cho System Admin của nền tảng Founder AI.
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

    // Thu thập existing resources cho non-admin users
    let existingResources = '';
    if (userId) {
      try {
        const emailTemplates = await this.getEmailTemplates(userId);
        const zaloAccounts = await this.getZaloAccounts(userId);
        const zaloGroups = await this.getZaloGroups(userId);
        const recommendedType = await this.getRecommendedCampaignType(userId);

        existingResources = `
=== TÀI NGUYÊN CÓ SẴN ===
${recommendedType === 'email' ? 'NÊN thiết kế chiến dịch Email (B2B).' :
  recommendedType === 'zalo' ? 'NÊN thiết kế chiến dịch Zalo (B2C).' :
  'Có thể kết hợp đa kênh.'}

${emailTemplates.length > 0 ? `Email Templates có sẵn:
${emailTemplates.map(t => `- ID: ${t.id} | ${t.name} | Subject: ${t.subject}`).join('\n')}` : 'Chưa có email template.'}

${zaloAccounts.length > 0 ? `Tài khoản Zalo đã kết nối:
${zaloAccounts.map(a => `- ID: ${a.id} | ${a.displayName}`).join('\n')}` : 'Chưa có tài khoản Zalo.'}

${zaloGroups.length > 0 ? `Nhóm Zalo:
${zaloGroups.map(g => `- ID: ${g.id} | ${g.groupName}`).join('\n')}` : 'Chưa có nhóm Zalo.'}
`;
      } catch (e) {
        console.warn('[AI] Không lấy được existing resources:', e.message);
      }
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

    const systemPrompt = `Bạn là Founder AI Coworker - Trợ lý Marketing thông minh, chuyên hỗ trợ tạo template tin nhắn, chiến dịch marketing và landing page.

## NGUYÊN TẮC QUAN TRỌNG NHẤT:
- KHÔNG BAO GIỜ tự bịa thông tin về sản phẩm, doanh nghiệp, tên công ty, giá cả, khuyến mãi.
- Nếu thiếu thông tin cần thiết → type: "ask_more", hỏi cụ thể những gì còn thiếu.
- Chỉ tạo nội dung khi đã có đủ thông tin từ người dùng.

${contextBlock ? contextBlock + '\n\n' : ''}${existingResources ? existingResources + '\n\n' : ''}## PHÂN LOẠI Ý ĐỊNH (intent):

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
**QUAN TRỌNG**: Đây là DRAFT - user sẽ xem và nhấn "Tạo chiến dịch" để khởi tạo thật sự. KHÔNG tự động chạy.

Data structure:
{
  "campaignName": "...",
  "description": "...",
  "campaignType": "mixed | email | zalo | zalo_group",
  "isAiDraft": true,
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
Khi type="campaign_script": content mô tả chiến dịch là DRAFT, data chứa script. Nhấn mạnh user cần nhấn "Tạo chiến dịch" để khởi tạo.
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
   * Generate landing page using AI with optional template.
   * @param {object} params
   * @param {string} params.prompt - User's request
   * @param {number} [params.templateId] - Optional template ID
   * @param {number} [params.userId] - User ID for RAG context
   * @param {Array} [params.files] - Attached files
   * @returns {Promise<object>}
   */
  async generateLandingPage({ prompt, templateId = null, userId = null, files = [] }) {
    return landingTemplateService.generateLandingPage({ prompt, templateId, userId, files });
  }

  /**
   * Get available landing page templates.
   * @param {string} [category] - Optional category filter
   * @returns {Promise<object[]>}
   */
  async getLandingTemplates(category = null) {
    if (category) {
      return landingTemplateService.getTemplatesByCategory(category);
    }
    return landingTemplateService.getTemplates();
  }

  /**
   * Get landing page template categories.
   * @returns {Promise<object[]>}
   */
  async getLandingTemplateCategories() {
    return landingTemplateService.getCategories();
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
