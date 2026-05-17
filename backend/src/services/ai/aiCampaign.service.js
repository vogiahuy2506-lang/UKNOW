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
   * Lấy thống kê khách hàng của user để gợi ý audience.
   * Lưu ý: Tất cả khách hàng được cung cấp từ file/Google Sheet, không phải từ lịch sử mua hàng.
   * @param {number} userId
   * @returns {Promise<object>}
   */
  async getCustomerStats(userId) {
    try {
      // Lấy số liệu tổng quan
      const totalResult = await db.query(
        `SELECT COUNT(*) as total FROM customers WHERE id_user = $1`,
        [userId]
      );
      
      // Lấy số khách có email
      const emailResult = await db.query(
        `SELECT COUNT(*) as count FROM customers 
         WHERE id_user = $1 AND email IS NOT NULL AND email <> ''`,
        [userId]
      );
      
      // Lấy số khách có Zalo ID
      const zaloResult = await db.query(
        `SELECT COUNT(*) as count FROM customers 
         WHERE id_user = $1 AND (zalo_id IS NOT NULL OR zalo_phone IS NOT NULL)`,
        [userId]
      );

      // Lấy số khách có phone
      const phoneResult = await db.query(
        `SELECT COUNT(*) as count FROM customers 
         WHERE id_user = $1 AND phone IS NOT NULL AND phone <> ''`,
        [userId]
      );

      return {
        total: parseInt(totalResult.rows[0]?.total || 0, 10),
        hasEmail: parseInt(emailResult.rows[0]?.count || 0, 10),
        hasZalo: parseInt(zaloResult.rows[0]?.count || 0, 10),
        hasPhone: parseInt(phoneResult.rows[0]?.count || 0, 10),
      };
    } catch (e) {
      console.warn('[AI] Không lấy được customer stats:', e.message);
      return { total: 0, hasEmail: 0, hasZalo: 0, hasPhone: 0 };
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

QUY TẮC THIẾT KẾ CHIẾN DỊCH HOÀN CHỈNH:

## XÁC ĐỊNH LOẠI CHIẾN DỊCH (bắt buộc):
Dựa vào yêu cầu khách hàng, xác định loại chiến dịch:
- Nếu khách hàng nhắc đến "email", "hòm thư", "mail": → campaignType = "email"
- Nếu khách hàng nhắc đến "zalo cá nhân", "tin nhắn zalo", "nhắn zalo": → campaignType = "zalo"
- Nếu khách hàng nhắc đến "zalo nhóm", "gửi nhóm", "group": → campaignType = "zalo_group"

## CẤU TRÚC BẮT BUỘC THEO TỪNG LOẠI:

### A. CHIẾN DỊCH EMAIL (campaignType = "email"):
   - Node Trigger: Bắt đầu (trigger type: "manual")
   - Node Email 1: Gửi ngay (không delay)
   - Node DATA 1: Condition - rẽ nhánh theo hành vi (đã mở email chưa?)
     - Nhánh YES: Email 2 + Tag khách quan tâm
     - Nhánh NO: Email 2 + Tag khách cần nhắc nhở
   - Node End: Kết thúc

   Ví dụ: trigger -> Email1 -> Condition -> Email2 (YES) -> Tag -> End
                                      -> Email2 (NO) -> Tag -> End

### B. CHIẾN DỊCH ZALO CÁ NHÂN (campaignType = "zalo"):
   - Node Trigger: Bắt đầu
   - Node Zalo 1: Gửi ngay (không delay)
   - Node DATA 1: Filter - lọc đối tượng (ví dụ: theo thành phố, tag)
   - Node Zalo 2: Gửi sau delay, kèm Tag
   - Node End: Kết thúc

### C. CHIẾN DỊCH ZALO NHÓM (campaignType = "zalo_group"):
   - Node Trigger: Bắt đầu
   - Node Zalo Group 1: Gửi ngay
   - Node DATA 1: Tag - gắn tag cho thành viên
   - Node Zalo Group 2: Gửi sau 1 ngày, kèm Tag
   - Node End: Kết thúc

## NODE TYPES BẮT BUỘC PHẢI SỬ DỤNG (không chỉ có trigger và action):

### NODE TYPES:
1. **trigger** - Kích hoạt chiến dịch (loại: manual, form_submit, tag_added, etc.)
2. **action** - Thực hiện hành động (loại: send_email, send_zalo_personal, send_zalo_group)
3. **data** - Xử lý dữ liệu (LOẠI BẮT BUỘC THÊM VÀO!):
   - **condition**: Rẽ nhánh theo điều kiện
     * config: { "field": "field_name", "operator": "equals|contains|greater_than|less_than", "value": "giá trị", "thenLabel": "Nhãn nhánh YES", "elseLabel": "Nhãn nhánh NO" }
   - **filter**: Lọc contact theo điều kiện
     * config: { "filters": [{ "field": "field_name", "operator": "equals|contains", "value": "giá trị", "logic": "and|or" }] }
   - **tag_contact**: Gắn/Xóa tag cho contact
     * config: { "action": "add|remove", "tags": ["tag1", "tag2"] }
   - **update_attribute**: Cập nhật thuộc tính contact
     * config: { "field": "field_name", "value": "giá trị mới" }
   - **wait**: Chờ một khoảng thời gian
     * config: { "duration": SỐ, "unit": "minutes|hours|days" }
4. **end** - Kết thúc chiến dịch

### VÍ DỤ WORKFLOW CÓ DATA NODES:

Ví dụ 1 - Chiến dịch có rẽ nhánh theo hành vi:
  trigger -> Email1 -> Condition (đã mở email?)
    - YES: Email ưu đãi -> Tag "quan_tam" -> End
    - NO: Email nhắc nhở -> End

Ví dụ 2 - Chiến dịch có lọc và gắn tag:
  trigger -> Filter (chỉ khách ở HCM) -> Email1 -> Tag "da_gui_email1" -> Email2 -> End

Ví dụ 3 - Chiến dịch có nhiều nhánh:
  trigger -> Email1 -> Condition (đã mua?)
    - YES: Email cảm ơn -> Tag "khach_hang" -> End
    - NO: Email ưu đãi -> Email2 -> Condition (đã mở?)
      - YES: Tag "quan_tam" -> End
      - NO: Email nhắc -> Tag "chua_quan_tam" -> End

## ĐIỀU KIỆN BẮT BUỘC:
- Tối thiểu 3-4 nodes gửi tin cho mỗi chiến dịch
- Node đầu tiên: KHÔNG có delayValue (gửi ngay)
- Các node tiếp theo: BẮT BUỘC có delayValue và delayUnit
- Mỗi node phải có nội dung THỰC, không placeholder
- **BẮT BUỘC phải có ít nhất 1-2 DATA nodes** (condition, filter, tag_contact, etc.) - KHÔNG chỉ có trigger và action!
- Sử dụng condition nodes để tạo rẽ nhánh theo hành vi khách hàng
- Sử dụng tag_contact nodes để phân loại khách hàng

**LƯU Ý QUAN TRỌNG VỀ CONFIG:**
- Node gửi tin BẮT BUỘC có thêm config delay: config phải chứa "delayValue" và "delayUnit"
- Ví dụ Email 2 (chờ 2 ngày sau email 1):
  - emailTemplateId: null
  - emailSubject: "..."
  - emailBody: "..."
  - delayValue: 2
  - delayUnit: "days"
- Node đầu tiên (sau trigger): KHÔNG cần delayValue
- KHÔNG tạo node wait_time riêng - delay được đặt trong config của node gửi tin

CẤU TRÚC JSON PHẢI TRẢ VỀ (VÀ CHỈ TRẢ VỀ JSON):
YÊU CẦU: Tạo workflow HOÀN CHỈNH với TỐI THIỂU 5-6 nodes (không tính end node).
YÊU CẦU: Phải có ít nhất 1-2 DATA nodes (condition, filter, tag_contact, update_attribute)

VÍ DỤ WORKFLOW CÓ ĐẦY ĐỦ NODE TYPES (bao gồm DATA nodes):

=== VÍ DỤ CHIẾN DỊCH EMAIL CÓ RẼ NHÁNH (có condition và tag) ===
{
  "campaignName": "Chiến dịch Email [TÊN_SẢN_PHẨM] - Rẽ nhánh theo hành vi",
  "description": "Gửi email, theo dõi hành vi và rẽ nhánh: mở email → ưu đãi, không mở → nhắc nhở",
  "campaignType": "email",
  "isAiDraft": true,
  "nodes": [
    { "tempId": "node_1", "nodeType": "trigger", "nodeSubtype": "manual", "nodeName": "Bắt đầu chiến dịch", "nodeDescription": "Kích hoạt thủ công", "positionX": 100, "positionY": 300, "config": {} },
    { "tempId": "node_2", "nodeType": "action", "nodeSubtype": "send_email", "nodeName": "Email 1 - Chào mừng & Ưu đãi", "nodeDescription": "Gửi ngay email chào mừng kèm ưu đãi đặc biệt", "positionX": 400, "positionY": 300, "config": { "emailTemplateId": null, "emailSubject": "🎉 Chào mừng bạn đến với [TÊN_SẢN_PHẨM]! Giảm ngay 20%", "emailBody": "<h1>Xin chào!</h1><p>Chúng tôi dành tặng bạn ưu đãi đặc biệt...</p>", "templateMappings": [], "enableLinkTracking": true, "saveMessageLog": true } },
    { "tempId": "node_3", "nodeType": "data", "nodeSubtype": "condition", "nodeName": "Kiểm tra hành vi", "nodeDescription": "Rẽ nhánh theo việc đã mở email hay chưa", "positionX": 700, "positionY": 300, "config": { "field": "email_opened", "operator": "equals", "value": "true", "thenLabel": "Đã mở email", "elseLabel": "Chưa mở email" } },
    { "tempId": "node_4", "nodeType": "action", "nodeSubtype": "send_email", "nodeName": "Email 2 - Cảm ơn & Upsell", "nodeDescription": "Gửi cho nhánh ĐÃ MỞ: cảm ơn và giới thiệu sản phẩm cao cấp", "positionX": 1000, "positionY": 150, "config": { "emailTemplateId": null, "emailSubject": "Cảm ơn bạn! Đây là bản nâng cấp dành riêng", "emailBody": "<h1>Cảm ơn bạn đã quan tâm!</h1><p>Chúng tôi có sản phẩm premium...</p>", "delayValue": 1, "delayUnit": "days", "templateMappings": [], "enableLinkTracking": true, "saveMessageLog": true } },
    { "tempId": "node_5", "nodeType": "data", "nodeSubtype": "tag_contact", "nodeName": "Tag khách hàng quan tâm", "nodeDescription": "Gắn tag cho khách đã mở email", "positionX": 1300, "positionY": 150, "config": { "action": "add", "tags": ["da_mo_email", "quan_tam"] } },
    { "tempId": "node_6", "nodeType": "action", "nodeSubtype": "send_email", "nodeName": "Email 3 - Nhắc nhở ưu đãi", "nodeDescription": "Gửi cho nhánh CHƯA MỞ: nhắc nhở ưu đãi sắp hết hạn", "positionX": 1000, "positionY": 450, "config": { "emailTemplateId": null, "emailSubject": "⏰ Ưu đãi sắp kết thúc! Nhanh tay đăng ký", "emailBody": "<h1>Đừng bỏ lỡ!</h1><p>Ưu đãi của bạn sắp hết hạn...</p>", "delayValue": 2, "delayUnit": "days", "templateMappings": [], "enableLinkTracking": true, "saveMessageLog": true } },
    { "tempId": "node_7", "nodeType": "data", "nodeSubtype": "tag_contact", "nodeName": "Tag khách chưa quan tâm", "nodeDescription": "Gắn tag cho khách chưa mở email", "positionX": 1300, "positionY": 450, "config": { "action": "add", "tags": ["chua_mo_email", "can_nhac_nho"] } },
    { "tempId": "node_8", "nodeType": "end", "nodeSubtype": "end", "nodeName": "Kết thúc chiến dịch", "nodeDescription": "Hoàn thành chiến dịch", "positionX": 1600, "positionY": 300, "config": {} }
  ],
  "connections": [
    { "sourceNodeId": "node_1", "targetNodeId": "node_2" },
    { "sourceNodeId": "node_2", "targetNodeId": "node_3" },
    { "sourceNodeId": "node_3", "targetNodeId": "node_4", "label": "Đã mở email" },
    { "sourceNodeId": "node_3", "targetNodeId": "node_6", "label": "Chưa mở email" },
    { "sourceNodeId": "node_4", "targetNodeId": "node_5" },
    { "sourceNodeId": "node_5", "targetNodeId": "node_8" },
    { "sourceNodeId": "node_6", "targetNodeId": "node_7" },
    { "sourceNodeId": "node_7", "targetNodeId": "node_8" }
  ]
}

=== VÍ DỤ CHIẾN DỊCH ZALO NHÓM CÓ TAG ===
{
  "campaignName": "Chiến dịch Zalo Nhóm [TÊN_SẢN_PHẨM]",
  "description": "Gửi tin nhắn nhóm và phân loại thành viên bằng tag",
  "campaignType": "zalo_group",
  "isAiDraft": true,
  "nodes": [
    { "tempId": "node_1", "nodeType": "trigger", "nodeSubtype": "manual", "nodeName": "Bắt đầu chiến dịch", "nodeDescription": "Kích hoạt thủ công", "positionX": 100, "positionY": 300, "config": {} },
    { "tempId": "node_2", "nodeType": "action", "nodeSubtype": "send_zalo_group", "nodeName": "Zalo Group 1 - Thông báo", "nodeDescription": "Gửi ngay tin nhắn thông báo đầu tiên", "positionX": 400, "positionY": 300, "config": { "zaloAccountId": null, "zaloGroupNodeId": null, "message": "📢 Chào mọi người! Chúng tôi có thông tin quan trọng cần chia sẻ...", "zaloGroupTemplateSteps": [], "saveMessageLog": true } },
    { "tempId": "node_3", "nodeType": "data", "nodeSubtype": "tag_contact", "nodeName": "Tag thành viên đã nhận", "nodeDescription": "Gắn tag cho thành viên đã nhận tin", "positionX": 700, "positionY": 300, "config": { "action": "add", "tags": ["da_nhan_thong_bao"] } },
    { "tempId": "node_4", "nodeType": "action", "nodeSubtype": "send_zalo_group", "nodeName": "Zalo Group 2 - Ưu đãi", "nodeDescription": "Gửi sau 1 ngày, kèm ưu đãi đặc biệt", "positionX": 1000, "positionY": 300, "config": { "zaloAccountId": null, "zaloGroupNodeId": null, "message": "🎉 Ưu đãi đặc biệt dành riêng cho thành viên nhóm! Giảm ngay 30%...", "delayValue": 1, "delayUnit": "days", "zaloGroupTemplateSteps": [], "saveMessageLog": true } },
    { "tempId": "node_5", "nodeType": "end", "nodeSubtype": "end", "nodeName": "Kết thúc", "nodeDescription": "Hoàn thành chuỗi Zalo nhóm", "positionX": 1300, "positionY": 300, "config": {} }
  ],
  "connections": [
    { "sourceNodeId": "node_1", "targetNodeId": "node_2" },
    { "sourceNodeId": "node_2", "targetNodeId": "node_3" },
    { "sourceNodeId": "node_3", "targetNodeId": "node_4" },
    { "sourceNodeId": "node_4", "targetNodeId": "node_5" }
  ]
}

LƯU Ý QUAN TRỌNG:
- campaignType phải khớp: "email", "zalo", hoặc "zalo_group"
- KHÔNG tạo node wait_time - delay đặt TRONG config của node gửi tin tiếp theo
- Node đầu tiên (sau trigger): KHÔNG có delayValue
- Các node tiếp theo: BẮT BUỘC có "delayValue" và "delayUnit" trong config
- Ví dụ: node thứ 3 có "delayValue": 2, "delayUnit": "days" = chờ 2 ngày SAU KHI node 2 xong
- Chỉ trả về duy nhất khối JSON, không giải thích bên ngoài.`
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
      temperature: 0.8,
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
        const customerStats = await this.getCustomerStats(userId);

        existingResources = `
=== TÀI NGUYÊN CÓ SẴN ===
${recommendedType === 'email' ? 'NÊN thiết kế chiến dịch Email (B2B).' :
  recommendedType === 'zalo' ? 'NÊN thiết kế chiến dịch Zalo (B2C).' :
  'Có thể kết hợp đa kênh.'}

📊 THỐNG KÊ KHÁCH HÀNG:
- Tổng khách hàng: ${customerStats.total}
- Có email: ${customerStats.hasEmail}
- Có Zalo: ${customerStats.hasZalo}
- Có phone: ${customerStats.hasPhone}
*Lưu ý: Khách hàng được cung cấp từ FILE/GOOGLE SHEET do người dùng upload*

${emailTemplates.length > 0 ? `📧 Email Templates có sẵn:
${emailTemplates.map(t => `- ID: ${t.id} | ${t.name} | Subject: ${t.subject}`).join('\n')}` : '📧 Chưa có email template.'}

${zaloAccounts.length > 0 ? `💬 Tài khoản Zalo đã kết nối:
${zaloAccounts.map(a => `- ID: ${a.id} | ${a.displayName}`).join('\n')}` : '💬 Chưa có tài khoản Zalo.'}

${zaloGroups.length > 0 ? `👥 Nhóm Zalo:
${zaloGroups.map(g => `- ID: ${g.id} | ${g.groupName}`).join('\n')}` : '👥 Chưa có nhóm Zalo.'}
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

### 5. type: "ask_campaign_type"
Khi người dùng muốn tạo chiến dịch NHƯNG CHƯA chỉ rõ kênh gửi (Email / Zalo cá nhân / Zalo nhóm).
Hỏi user chọn 1 trong 3 loại:

Data structure:
{
  "campaignName": "Tên chiến dịch (đã suy luận từ prompt)",
  "description": "Mô tả ngắn",
  "mCampaignType": "mixed", // Loại mặc định
  "content": "Bạn muốn tạo chiến dịch theo kênh nào?",
  "campaignOptions": [
    { "value": "email", "label": "📧 Email", "description": "Gửi email cho khách hàng" },
    { "value": "zalo", "label": "💬 Zalo cá nhân", "description": "Gửi tin nhắn Zalo riêng từng người" },
    { "value": "zalo_group", "label": "👥 Zalo nhóm", "description": "Gửi tin nhắn vào nhóm Zalo" }
  ],
  "data": {
    "campaignName": "...",
    "description": "...",
    "mcpampaignType": "mixed"
  }
}

### 5. type: "confirm_create"
Khi người dùng đã chọn campaign type và AI đã tạo xong script.
HIỂN THỊ SUMMARY và hỏi xác nhận trước khi tạo:

Data structure:
{
  "type": "confirm_create",
  "content": "Tôi đã thiết kế chiến dịch cho bạn. Nhấn 'Tạo chiến dịch' để lưu.",
  "data": {
    "campaignName": "Tên chiến dịch",
    "description": "Mô tả chiến dịch",
    "campaignType": "email | zalo | zalo_group",
    "isAiDraft": true,
    "nodes": [...],
    "connections": [...],
    "summary": {
      "totalSteps": 5,
      "channels": ["email"],
      "duration": "7 ngày",
      "estimatedReach": "Tự động gửi cho tất cả khách hàng phù hợp",
      "steps": [
        { "step": 1, "action": "Email chào mừng", "timing": "Ngay lập tức" },
        { "step": 2, "action": "Chờ 3 ngày", "timing": "Sau bước 1" },
        { "step": 3, "action": "Email nhắc ưu đãi", "timing": "Ngày 3" }
      ]
    }
  }
}

### 7. type: "create_and_run"
Khi người dùng muốn TẠO VÀ CHẠY CHIẾN DỊCH NGAY. Đây là chế độ tự động hoàn toàn - không cần xác nhận.
**QUAN TRỌNG**: AI phải có đủ thông tin (hoặc tự suy luận hợp lý) để tạo chiến dịch hoàn chỉnh.
- Tên chiến dịch, mục tiêu, kênh gửi, đối tượng phải rõ ràng
- Tự động điền các thông số cần thiết (template, Zalo account, nội dung tin nhắn)
- KHÔNG cần hỏi lại người dùng, tự tạo và chạy

Data structure:
{
  "campaignName": "...",
  "description": "...",
  "campaignType": "mixed | email | zalo | zalo_group",
  "isAiDraft": false,
  "autoRun": true,
  "nodes": [...],
  "connections": [...],
  "landingPage": null
}

### 8. type: "landing_page"
Khi người dùng muốn TẠO LANDING PAGE và đã có ĐỦ thông tin.

Data structure:
{
  "title": "Tiêu đề trang",
  "html": "Nội dung HTML (không cần thẻ html/head/body)",
  "css": "CSS tùy chỉnh"
}

## ĐỊNH DẠNG TRẢ VỀ (BẮT BUỘC JSON):
{
  "type": "text" | "ask_more" | "template_draft" | "campaign_script" | "ask_campaign_type" | "confirm_create" | "create_and_run" | "landing_page",
  "content": "Lời nhắn cho người dùng (tiếng Việt, thân thiện)",
  "missing_fields": [] | ["tên sản phẩm", "mục tiêu email"],
  "data": null | { ... }
}

Khi type="ask_more": content là câu hỏi cụ thể, missing_fields liệt kê những gì cần.
Khi type="template_draft": content mô tả template vừa tạo, data chứa template.
Khi type="campaign_script": content mô tả chiến dịch là DRAFT, data chứa script. Nhấn mạnh user cần nhấn "Tạo chiến dịch" để khởi tạo.
Khi type="ask_campaign_type": content hỏi chọn kênh, campaignOptions chứa 3 lựa chọn, data chứa thông tin đã có.
Khi type="confirm_create": content mô tả chiến dịch, data.summary chứa thông tin chi tiết. Nhấn mạnh user nhấn "Tạo chiến dịch" để lưu.
Khi type="create_and_run": content thông báo đang tạo và chạy campaign tự động, data chứa script. KHÔNG cần xác nhận từ user.
Khi type="landing_page": content mô tả trang, data chứa html/css.

## LOGIC XỬ LÝ CHIẾN DỊCH:

### Nguyên tắc quan trọng:
- KHACH HANG: Luôn mac dinh lay tu FILE hoac GOOGLE SHEET do nguoi dung cung cap. KHONG can hoi lai ve doi tuong.
- Neu nguoi dung upload file/sheet -> do chinh la danh sach khach hang -> dung audience: "all"
- KHONG BAO GIO hoi "gui cho doi tuong nao" -> luon dung tat ca khach hang tu file/sheet

### Khi user prompt "tao chien dich [san pham]":
1. Neu CHUA chi ro kenh (email/zalo/zalo_group) -> type: "ask_campaign_type"
2. Neu DA chi ro kenh va co du thong tin -> type: "confirm_create" voi audience: "all" (khach hang tu file/sheet)
3. Neu THIEU thong tin khac (ten san pham, muc tieu...) -> type: "ask_more"

### Các từ khóa xác định kênh:
- "email" / "gửi mail" / "thư điện tử" → campaignType: "email"
- "zalo" / "zalo cá nhân" / "tin nhắn zalo" → campaignType: "zalo"
- "zalo nhóm" / "nhóm zalo" / "gửi nhóm" → campaignType: "zalo_group"
- "cả hai" / "đa kênh" / "mixed" → campaignType: "mixed"

### LUÔN luôn dùng audience: "all" vì khách hàng được lấy từ file/sheet:
- KHÔNG hỏi về đối tượng
- KHÔNG có từ khóa xác định audience
- Luôn giả định khách hàng từ file/sheet của người dùng

## HEURISTICS CHO type="create_and_run":
- Người dùng nói "tạo chiến dịch", "chạy chiến dịch", "bắt đầu chiến dịch" mà KHÔNG có từ "xem trước", "draft", "thiết kế"
- Người dùng mô tả rõ ràng mục tiêu: "quảng cáo khóa học", "gửi email chào hàng", "chiến dịch bán hàng"
- Người dùng dùng từ khóa: "ngay", "luôn", "bắt đầu ngay", "chạy ngay"
- Nếu thiếu thông tin cơ bản (tên sản phẩm, đối tượng) → vẫn tạo nhưng dùng placeholder có ý nghĩa`;

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
      const parsed = JSON.parse(jsonStr);
      // Validate: must have DATA nodes
      return this._validateWorkflowNodes(parsed);
    } catch {
      const sanitized = jsonStr.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (match, p1) => {
        return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
      });
      return this._validateWorkflowNodes(JSON.parse(sanitized));
    }
  }

  /**
   * Validate workflow has DATA nodes. If not, add warning but still return.
   */
  _validateWorkflowNodes(parsed) {
    if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
      return parsed;
    }

    const hasDataNode = parsed.nodes.some(n => n.nodeType === 'data');
    if (!hasDataNode) {
      console.warn('[AI] Warning: Workflow has no DATA nodes. Consider adding condition, filter, or tag_contact nodes.');
    } else {
      console.log(`[AI] Workflow validated: ${parsed.nodes.length} nodes with DATA nodes`);
    }

    return parsed;
  }
}

export default new AiCampaignService();
