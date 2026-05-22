import { generateGeminiContent } from '../../utils/geminiClient.util.js';
import businessProfileService from './businessProfile.service.js';
import { buildAdminContext } from './adminContext.service.js';
import landingTemplateService from '../landingTemplate/landingTemplate.service.js';
import uploadController from '../../controllers/upload.controller.js';
import axios from 'axios';
import db from '../../config/database.js';
import { extractTextFromBuffer } from '../../utils/fileParser.util.js';

class AiCampaignService {
  /**
   * Lấy danh sách email templates của user để AI điền sẵn config.
   * @param {number} userId
   * @returns {Promise<Array>}
   */
  async getCourses(userId) {
    try {
      const result = await db.query(
        `SELECT id, course_name AS name, course_code AS code, status
         FROM courses WHERE id_user = $1
         ORDER BY created_at DESC LIMIT 50`,
        [userId]
      );
      return result.rows;
    } catch (e) {
      console.warn('[AI] Không lấy được danh sách khóa học:', e.message);
      return [];
    }
  }

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
   * Lấy danh sách Zalo message templates của user.
   * @param {number} userId
   * @returns {Promise<Array>}
   */
  async getZaloTemplates(userId) {
    try {
      const result = await db.query(
        `SELECT id, template_name, template_code, body_text, category
         FROM zalo_templates
         WHERE id_user = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [userId]
      );
      return result.rows.map(r => ({
        id: r.id,
        name: r.template_name,
        code: r.template_code,
        bodyText: r.body_text ? String(r.body_text).slice(0, 200) : '',
        category: r.category,
      }));
    } catch (e) {
      console.warn('[AI] Không lấy được Zalo templates:', e.message);
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
        const [emailTemplates, zaloAccounts, zaloGroups, zaloTemplates, recommendedType] =
          await Promise.all([
            this.getEmailTemplates(userId),
            this.getZaloAccounts(userId),
            this.getZaloGroups(userId),
            this.getZaloTemplates(userId),
            this.getRecommendedCampaignType(userId),
          ]);

        const firstZaloAccountId = zaloAccounts[0]?.id ?? null;

        existingResources = `
=== TÀI NGUYÊN CÓ SẴN (dùng để điền thẳng vào config node) ===

Khuyến nghị kênh: ${recommendedType === 'email' ? 'Email (B2B)' : recommendedType === 'zalo' ? 'Zalo (B2C)' : 'Đa kênh Email + Zalo'}
Tài khoản Zalo mặc định (zaloAccountId): ${firstZaloAccountId ?? 'null — chưa kết nối'}

${emailTemplates.length > 0 ? `📧 Email Templates (emailTemplateId):
${emailTemplates.map(t => `  - ID: ${t.id} | "${t.name}" | Subject: ${t.subject}`).join('\n')}` : '📧 Email templates: chưa có — dùng emailTemplateId: null và tự soạn emailSubject + emailBody.'}

${zaloTemplates.length > 0 ? `💬 Zalo Message Templates (templateId trong zaloPersonalTemplateSteps):
${zaloTemplates.map(t => `  - ID: ${t.id} | "${t.name}" | Preview: ${t.bodyText.slice(0, 80)}...`).join('\n')}` : '💬 Zalo templates: chưa có — dùng message inline trực tiếp trong config.'}

${zaloAccounts.length > 0 ? `🔑 Tài khoản Zalo đã kết nối:
${zaloAccounts.map(a => `  - ID: ${a.id} | ${a.displayName}`).join('\n')}` : '🔑 Zalo accounts: chưa kết nối — đặt zaloAccountId: null.'}

${zaloGroups.length > 0 ? `👥 Nhóm Zalo (trong DB — dùng làm tham chiếu):
${zaloGroups.map(g => `  - groupId: "${g.groupId}" | "${g.groupName}"`).join('\n')}` : ''}
`;
      } catch (e) {
        console.warn('[AI] Không lấy được existing resources:', e.message);
      }
    }

    parts.push({
      text: `Bạn là chuyên gia Marketing Automation. Nhiệm vụ: đọc yêu cầu và tài liệu đính kèm rồi trả về JSON chiến dịch hoàn chỉnh.

${ragContext ? ragContext + '\n\n' : ''}${existingResources ? existingResources + '\n\n' : ''}Yêu cầu: "${prompt}"

════════════════════════════════════════
  DANH SÁCH NODE TYPES THỰC SỰ TỒN TẠI
════════════════════════════════════════

CHỈ được dùng các node sau. Ngoài danh sách này đều KHÔNG hợp lệ.

── TRIGGER ──
• nodeType: "trigger", nodeSubtype: "manual"
  config: {}

── DATA NODES (lấy dữ liệu) ──
• nodeType: "data", nodeSubtype: "interested_customers"   ← nguồn khách hàng từ DB
  config: { "interestedCustomerType": "both", "interestedLimit": 1000 }

• nodeType: "data", nodeSubtype: "read_sheet"             ← Google Sheet
  config: { "sheetUrl": "...", "sheetName": "Sheet1", "headerRow": 1, "dataStartRow": 2 }

• nodeType: "data", nodeSubtype: "read_landing_leads"     ← leads từ landing page
  config: {}

• nodeType: "data", nodeSubtype: "select_zalo_account"   ← BẮT BUỘC trước get_all_friends/get_all_groups
  config: { "zaloAccountId": <ID_TK_ZALO> }

• nodeType: "data", nodeSubtype: "get_all_friends"        ← lấy danh sách bạn bè Zalo
  config: { "zaloAccountNodeId": "<tempId_của_select_zalo_account>" }

• nodeType: "data", nodeSubtype: "get_all_groups"         ← lấy danh sách nhóm Zalo
  config: { "zaloAccountNodeId": "<tempId_của_select_zalo_account>" }

• nodeType: "data", nodeSubtype: "save_customer"          ← lưu khách hàng vào DB
  config: { "saveCustomerNodeId": "<tempId_node_nguồn>", "saveCustomerFieldMap": { "email": {"mode":"node","field":"email","nodeId":"<tempId>"}, "phone": {"mode":"node","field":"phone","nodeId":"<tempId>"} } }

── ACTION NODES (gửi tin) ──
• nodeType: "action", nodeSubtype: "send_email"
  config bắt buộc:
    "recipientSource": "node",
    "recipientNodeId": "<tempId_node_interested_customers>",
    "recipientField": "email",
    "emailTemplateId": <ID hoặc null>,   ← null = dùng inline
    "emailSubject": "...",               ← bỏ trống nếu dùng template
    "emailBody": "<html>...</html>",     ← bỏ trống nếu dùng template
    "templateMappings": [],
    "enableLinkTracking": true,
    "saveMessageLog": true,
    "delayValue": 0,                     ← 0 = gửi ngay; >0 = chờ sau node trước
    "delayUnit": "days"                  ← "minutes"|"hours"|"days"

• nodeType: "action", nodeSubtype: "send_zalo_personal"   ← gửi Zalo cá nhân theo SĐT
  config bắt buộc:
    "zaloAccountId": <ID_TK_ZALO>,
    "zaloRecipientSource": "node",
    "zaloRecipientNodeId": "<tempId_node_nguồn>",
    "zaloRecipientField": "phone",       ← "phone" khi nguồn là interested_customers
    "zaloRecipientType": "phone",
    "message": "Nội dung tin nhắn...",   ← bỏ trống nếu dùng template
    "zaloPersonalTemplateSteps": [],     ← [] = dùng message inline; [{templateId: X}] = dùng template
    "saveMessageLog": true,
    "delayValue": 0,
    "delayUnit": "days"

• nodeType: "action", nodeSubtype: "send_zalo_personal"   ← gửi Zalo theo danh sách bạn bè
  (khi nguồn là get_all_friends → dùng uid thay phone)
    "zaloRecipientField": "uid",
    "zaloRecipientType": "uid"

• nodeType: "action", nodeSubtype: "send_zalo_group"
  config bắt buộc:
    "zaloAccountId": <ID_TK_ZALO>,
    "zaloGroupSource": "node",
    "zaloGroupNodeId": "<tempId_node_get_all_groups>",
    "zaloGroupField": "groupId",
    "zaloGroupMessage": "Nội dung tin nhắn nhóm...",
    "zaloGroupTemplateSteps": [],
    "saveMessageLog": true,
    "delayValue": 0,
    "delayUnit": "days"

• nodeType: "action", nodeSubtype: "send_zalo_friend_request"
  config bắt buộc:
    "zaloAccountId": <ID_TK_ZALO>,
    "zaloRecipientSource": "node",
    "zaloRecipientNodeId": "<tempId_node_nguồn>",
    "zaloRecipientField": "phone",
    "message": "Lời mời kết bạn...",
    "saveMessageLog": true

── END ──
• nodeType: "end", nodeSubtype: "end"
  config: {}

════════════════════════════════════════
  LUẬT VỀ DELAY (QUAN TRỌNG)
════════════════════════════════════════

❌ KHÔNG tạo node "wait", "wait_time", "delay" riêng — node đó KHÔNG TỒN TẠI trong hệ thống.
✅ Delay được đặt TRỰC TIẾP trong config của action node (send_email, send_zalo_personal, send_zalo_group):
   • Node gửi ngay: "delayValue": 0, "delayUnit": "days"
   • Node gửi sau 3 ngày: "delayValue": 3, "delayUnit": "days"
   • Node gửi sau 2 giờ: "delayValue": 2, "delayUnit": "hours"

════════════════════════════════════════
  3 LUỒNG CHIẾN DỊCH CHUẨN
════════════════════════════════════════

A. EMAIL:
   trigger → interested_customers → send_email(delay:0) → send_email(delay:3d) → end

B. ZALO CÁ NHÂN (từ danh sách khách hàng):
   trigger → interested_customers → send_zalo_personal(delay:0) → send_zalo_personal(delay:2d) → end

C. ZALO CÁ NHÂN (từ danh sách bạn bè):
   trigger → select_zalo_account → get_all_friends → send_zalo_personal(uid,delay:0) → end

D. ZALO NHÓM:
   trigger → select_zalo_account → get_all_groups → send_zalo_group(delay:0) → send_zalo_group(delay:1d) → end

════════════════════════════════════════
  VÍ DỤ JSON TỪNG LOẠI
════════════════════════════════════════

=== EMAIL (2 lần gửi, dùng template có sẵn nếu emailTemplateId != null) ===
{
  "campaignName": "...", "description": "...", "campaignType": "email", "isAiDraft": true,
  "nodes": [
    { "tempId": "n1", "nodeType": "trigger", "nodeSubtype": "manual", "nodeName": "Bắt đầu", "nodeDescription": "", "positionX": 100, "positionY": 200, "config": {} },
    { "tempId": "n2", "nodeType": "data", "nodeSubtype": "interested_customers", "nodeName": "Danh sách khách", "nodeDescription": "Khách hàng từ database", "positionX": 350, "positionY": 200, "config": { "interestedCustomerType": "both", "interestedLimit": 1000 } },
    { "tempId": "n3", "nodeType": "action", "nodeSubtype": "send_email", "nodeName": "Email giới thiệu", "nodeDescription": "Gửi ngay", "positionX": 600, "positionY": 200, "config": { "recipientSource": "node", "recipientNodeId": "n2", "recipientField": "email", "emailTemplateId": null, "emailSubject": "Chào bạn! Ưu đãi dành riêng hôm nay", "emailBody": "<div style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff\"><div style=\"background:#FF6B00;padding:32px 24px;text-align:center\"><h1 style=\"color:#ffffff;margin:0;font-size:24px\">Tên Công Ty</h1></div><div style=\"padding:32px 24px\"><p style=\"font-size:16px;color:#333;margin:0 0 16px\">Xin chào <strong>{{full_name}}</strong>,</p><p style=\"font-size:15px;color:#555;line-height:1.6;margin:0 0 24px\">Chúng tôi có ưu đãi đặc biệt dành riêng cho bạn...</p><div style=\"text-align:center;margin:32px 0\"><a href=\"#\" style=\"background:#FF6B00;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block\">Xem ưu đãi ngay</a></div></div><div style=\"background:#f5f5f5;padding:16px 24px;text-align:center\"><p style=\"font-size:12px;color:#999;margin:0\">Bạn nhận email này vì đã đăng ký nhận thông tin từ chúng tôi.</p></div></div>", "templateMappings": [], "enableLinkTracking": true, "saveMessageLog": true, "delayValue": 0, "delayUnit": "days" } },
    { "tempId": "n4", "nodeType": "action", "nodeSubtype": "send_email", "nodeName": "Email nhắc nhở", "nodeDescription": "Gửi sau 3 ngày", "positionX": 850, "positionY": 200, "config": { "recipientSource": "node", "recipientNodeId": "n2", "recipientField": "email", "emailTemplateId": null, "emailSubject": "Đừng bỏ lỡ — ưu đãi sắp hết hạn!", "emailBody": "<div style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff\"><div style=\"background:#FF6B00;padding:32px 24px;text-align:center\"><h1 style=\"color:#ffffff;margin:0;font-size:24px\">Tên Công Ty</h1></div><div style=\"padding:32px 24px\"><p style=\"font-size:16px;color:#333;margin:0 0 16px\">Xin chào <strong>{{full_name}}</strong>,</p><p style=\"font-size:15px;color:#555;line-height:1.6;margin:0 0 24px\">Ưu đãi của bạn sắp hết hạn. Đừng bỏ lỡ cơ hội này!</p><div style=\"background:#fff8f0;border-left:4px solid #FF6B00;padding:16px;margin:0 0 24px\"><p style=\"margin:0;font-size:15px;color:#333\">⏰ Ưu đãi kết thúc sớm — hành động ngay hôm nay!</p></div><div style=\"text-align:center;margin:32px 0\"><a href=\"#\" style=\"background:#FF6B00;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block\">Đăng ký ngay</a></div></div><div style=\"background:#f5f5f5;padding:16px 24px;text-align:center\"><p style=\"font-size:12px;color:#999;margin:0\">Bạn nhận email này vì đã đăng ký nhận thông tin từ chúng tôi.</p></div></div>", "templateMappings": [], "enableLinkTracking": true, "saveMessageLog": true, "delayValue": 3, "delayUnit": "days" } },
    { "tempId": "n5", "nodeType": "end", "nodeSubtype": "end", "nodeName": "Kết thúc", "nodeDescription": "", "positionX": 1100, "positionY": 200, "config": {} }
  ],
  "connections": [
    { "sourceNodeId": "n1", "targetNodeId": "n2" },
    { "sourceNodeId": "n2", "targetNodeId": "n3" },
    { "sourceNodeId": "n3", "targetNodeId": "n4" },
    { "sourceNodeId": "n4", "targetNodeId": "n5" }
  ]
}

=== ZALO CÁ NHÂN (từ danh sách khách hàng, 2 tin) ===
{
  "campaignName": "...", "description": "...", "campaignType": "zalo", "isAiDraft": true,
  "nodes": [
    { "tempId": "n1", "nodeType": "trigger", "nodeSubtype": "manual", "nodeName": "Bắt đầu", "nodeDescription": "", "positionX": 100, "positionY": 200, "config": {} },
    { "tempId": "n2", "nodeType": "data", "nodeSubtype": "interested_customers", "nodeName": "Danh sách khách", "nodeDescription": "Khách hàng từ database", "positionX": 350, "positionY": 200, "config": { "interestedCustomerType": "both", "interestedLimit": 1000 } },
    { "tempId": "n3", "nodeType": "action", "nodeSubtype": "send_zalo_personal", "nodeName": "Zalo tin 1", "nodeDescription": "Gửi ngay", "positionX": 600, "positionY": 200, "config": { "zaloAccountId": null, "zaloRecipientSource": "node", "zaloRecipientNodeId": "n2", "zaloRecipientField": "phone", "zaloRecipientType": "phone", "message": "Xin chào! Chúng tôi có thông tin quan trọng muốn chia sẻ với bạn...", "zaloPersonalTemplateSteps": [], "saveMessageLog": true, "delayValue": 0, "delayUnit": "days" } },
    { "tempId": "n4", "nodeType": "action", "nodeSubtype": "send_zalo_personal", "nodeName": "Zalo tin 2", "nodeDescription": "Gửi sau 2 ngày", "positionX": 850, "positionY": 200, "config": { "zaloAccountId": null, "zaloRecipientSource": "node", "zaloRecipientNodeId": "n2", "zaloRecipientField": "phone", "zaloRecipientType": "phone", "message": "Nhắc nhở: ưu đãi dành cho bạn sắp hết hạn. Liên hệ ngay để được tư vấn!", "zaloPersonalTemplateSteps": [], "saveMessageLog": true, "delayValue": 2, "delayUnit": "days" } },
    { "tempId": "n5", "nodeType": "end", "nodeSubtype": "end", "nodeName": "Kết thúc", "nodeDescription": "", "positionX": 1100, "positionY": 200, "config": {} }
  ],
  "connections": [
    { "sourceNodeId": "n1", "targetNodeId": "n2" },
    { "sourceNodeId": "n2", "targetNodeId": "n3" },
    { "sourceNodeId": "n3", "targetNodeId": "n4" },
    { "sourceNodeId": "n4", "targetNodeId": "n5" }
  ]
}

=== ZALO NHÓM (lấy nhóm từ tài khoản, 2 tin) ===
{
  "campaignName": "...", "description": "...", "campaignType": "zalo_group", "isAiDraft": true,
  "nodes": [
    { "tempId": "n1", "nodeType": "trigger", "nodeSubtype": "manual", "nodeName": "Bắt đầu", "nodeDescription": "", "positionX": 100, "positionY": 200, "config": {} },
    { "tempId": "n2", "nodeType": "data", "nodeSubtype": "select_zalo_account", "nodeName": "Chọn tài khoản Zalo", "nodeDescription": "Tài khoản gửi tin nhóm", "positionX": 350, "positionY": 200, "config": { "zaloAccountId": null } },
    { "tempId": "n3", "nodeType": "data", "nodeSubtype": "get_all_groups", "nodeName": "Lấy danh sách nhóm", "nodeDescription": "Lấy tất cả nhóm từ tài khoản", "positionX": 600, "positionY": 200, "config": { "zaloAccountNodeId": "n2" } },
    { "tempId": "n4", "nodeType": "action", "nodeSubtype": "send_zalo_group", "nodeName": "Gửi nhóm tin 1", "nodeDescription": "Gửi ngay đến tất cả nhóm", "positionX": 850, "positionY": 200, "config": { "zaloAccountId": null, "zaloGroupSource": "node", "zaloGroupNodeId": "n3", "zaloGroupField": "groupId", "zaloGroupMessage": "📢 Thông báo quan trọng từ chúng tôi...", "zaloGroupTemplateSteps": [], "saveMessageLog": true, "delayValue": 0, "delayUnit": "days" } },
    { "tempId": "n5", "nodeType": "action", "nodeSubtype": "send_zalo_group", "nodeName": "Gửi nhóm tin 2", "nodeDescription": "Gửi sau 1 ngày", "positionX": 1100, "positionY": 200, "config": { "zaloAccountId": null, "zaloGroupSource": "node", "zaloGroupNodeId": "n3", "zaloGroupField": "groupId", "zaloGroupMessage": "🎉 Cập nhật mới nhất và ưu đãi dành cho nhóm...", "zaloGroupTemplateSteps": [], "saveMessageLog": true, "delayValue": 1, "delayUnit": "days" } },
    { "tempId": "n6", "nodeType": "end", "nodeSubtype": "end", "nodeName": "Kết thúc", "nodeDescription": "", "positionX": 1350, "positionY": 200, "config": {} }
  ],
  "connections": [
    { "sourceNodeId": "n1", "targetNodeId": "n2" },
    { "sourceNodeId": "n2", "targetNodeId": "n3" },
    { "sourceNodeId": "n3", "targetNodeId": "n4" },
    { "sourceNodeId": "n4", "targetNodeId": "n5" },
    { "sourceNodeId": "n5", "targetNodeId": "n6" }
  ]
}

════════════════════════════════════════
  QUY TẮC TẠO NỘI DUNG TIN NHẮN
════════════════════════════════════════

1. Nếu có email/Zalo template phù hợp trong danh sách tài nguyên → đặt ID vào emailTemplateId / zaloPersonalTemplateSteps[0].templateId.
2. Nếu KHÔNG có template phù hợp → tự soạn nội dung THỰC sự dựa trên thông tin doanh nghiệp/sản phẩm từ tài liệu đính kèm và RAG context. KHÔNG dùng placeholder như "[TÊN_SẢN_PHẨM]".
3. Điền zaloAccountId bằng ID tài khoản Zalo từ danh sách tài nguyên. Nếu chưa có → null.
4. Mỗi action node PHẢI có nội dung tin nhắn thực (emailSubject+emailBody hoặc message), không để trống.
5. Chỉ trả về JSON, không giải thích gì bên ngoài.
6. QUY TẮC VIẾT emailBody — BẮT BUỘC dùng HTML email chuẩn với inline CSS:
   - Wrapper: <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff">
   - Header có màu brand_color, padding 32px, text-align:center
   - Body section: padding:32px 24px, font-size 15-16px, color:#333, line-height:1.6
   - CTA button: background brand_color, color:#fff, padding:14px 32px, border-radius:6px, display:inline-block
   - Footer: background:#f5f5f5, padding:16px, text-align:center, font-size:12px, color:#999
   - KHÔNG dùng <style> block hay class CSS — CHỈ inline style
   - Nội dung phải thực sự liên quan đến sản phẩm/khóa học được đề cập
7. QUY TẮC LOGO TRONG EMAIL HTML:
   - Nếu hồ sơ có "Logo URL: https://..." → dùng <img src="{logo_url}" alt="{company_name}" style="max-width:150px;height:auto;">
   - Nếu hồ sơ có "Logo URL: (chưa có...)" → KHÔNG dùng thẻ <img> cho logo. Thay bằng text header:
     <div style="text-align:center;padding:20px 0"><span style="font-size:22px;font-weight:bold;color:{brand_color}">{company_name}</span></div>`
    });

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

      const adminSystemPrompt = `Bạn là Founder AI AI - Trợ lý thông minh cho System Admin của nền tảng Founder AI, và chuyên phân tích tài liệu/dữ liệu doanh nghiệp.
Nhiệm vụ của bạn là phân tích số liệu, tư vấn chiến lược, trả lời câu hỏi về tình trạng hoạt động của nền tảng, và giải đáp/tổng hợp bất kỳ tài liệu nào được gửi kèm.

${contextBlock}

QUY TẮC:
- Luôn dựa trên dữ liệu thực được cung cấp ở trên, không được bịa số liệu.
- Bạn hoàn toàn CÓ KHẢ NĂNG đọc, hiểu, phân tích, và tổng hợp thông tin từ bất kỳ tệp đính kèm nào (Word, Excel, PDF, CSV, hình ảnh, văn bản) mà người dùng gửi lên. Khi người dùng đính kèm tệp, nội dung của tệp đó đã được hệ thống trích xuất tự động và gắn kèm dưới dạng văn bản trực tiếp trong phần tin nhắn. Bạn hãy trả lời, phân tích, hoặc tổng hợp nội dung tệp theo đúng yêu cầu của người dùng.
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
        const [emailTemplates, zaloAccounts, zaloGroups, zaloTemplates, recommendedType, customerStats, courses] =
          await Promise.all([
            this.getEmailTemplates(userId),
            this.getZaloAccounts(userId),
            this.getZaloGroups(userId),
            this.getZaloTemplates(userId),
            this.getRecommendedCampaignType(userId),
            this.getCustomerStats(userId),
            this.getCourses(userId),
          ]);

        const firstZaloAccountId = zaloAccounts[0]?.id ?? null;

        existingResources = `
=== TÀI NGUYÊN CÓ SẴN ===
Kênh phù hợp: ${recommendedType === 'email' ? 'Email (B2B)' : recommendedType === 'zalo' ? 'Zalo (B2C)' : 'Đa kênh'}

📊 KHÁCH HÀNG TRONG DB:
- Tổng: ${customerStats.total} | Có email: ${customerStats.hasEmail} | Có Zalo/phone: ${customerStats.hasZalo}

📚 Khóa học / Sản phẩm (dùng id trong interestedCourseIds / notPurchasedCourseIds):
${courses.length > 0 ? courses.map(c => `  - ID: ${c.id} | "${c.name}"`).join('\n') : '  (chưa có khóa học trong hệ thống)'}

📧 Email Templates (emailTemplateId):
${emailTemplates.length > 0 ? emailTemplates.map(t => `  - ID: ${t.id} | "${t.name}" | Subject: ${t.subject}`).join('\n') : '  (chưa có — tự soạn nội dung inline)'}

💬 Zalo Message Templates (templateId trong zaloPersonalTemplateSteps):
${zaloTemplates.length > 0 ? zaloTemplates.map(t => `  - ID: ${t.id} | "${t.name}" | Preview: ${t.bodyText.slice(0, 80)}...`).join('\n') : '  (chưa có — dùng message inline)'}

🔑 Zalo Accounts (zaloAccountId):
${zaloAccounts.length > 0 ? zaloAccounts.map(a => `  - ID: ${a.id} | ${a.displayName}`).join('\n') : '  (chưa kết nối — đặt null)'}
Tài khoản Zalo mặc định: ${firstZaloAccountId ?? 'null'}

${zaloGroups.length > 0 ? `👥 Nhóm Zalo:\n${zaloGroups.map(g => `  - "${g.groupName}"`).join('\n')}` : ''}

NODE TYPES THỰC SỰ TỒN TẠI trong hệ thống (chỉ dùng các loại này):
• trigger/manual — điểm khởi đầu
• data/interested_customers — lấy khách từ DB (config: interestedCustomerType, interestedLimit, interestedCourseIds, notPurchasedCourseIds)
  - interestedCustomerType: "interested"=chưa mua | "purchased"=đã mua | "both"=tất cả
  - interestedCourseIds: [id1, id2] → chỉ lấy khách liên quan đến khóa học này
  - notPurchasedCourseIds: [id1, id2] → loại trừ khách ĐÃ mua các khóa này
• data/read_sheet — đọc Google Sheet
• data/select_zalo_account — chọn TK Zalo (BẮT BUỘC trước get_all_friends/get_all_groups)
• data/get_all_friends — lấy danh sách bạn bè
• data/get_all_groups — lấy danh sách nhóm
• data/save_customer — lưu khách hàng
• action/send_email — gửi email (recipientSource, recipientNodeId, recipientField: "email", delayValue, delayUnit)
• action/send_zalo_personal — gửi Zalo cá nhân (zaloAccountId, zaloRecipientSource, zaloRecipientNodeId, zaloRecipientField: "phone"|"uid", delayValue, delayUnit)
• action/send_zalo_group — gửi Zalo nhóm (zaloAccountId, zaloGroupSource: "node", zaloGroupNodeId, zaloGroupField: "groupId", zaloGroupMessage, delayValue, delayUnit)
• action/send_zalo_friend_request — gửi lời mời kết bạn
• end/end — kết thúc

DELAY: KHÔNG tạo node wait/delay riêng. Delay đặt trong delayValue+delayUnit của action node tiếp theo.
DELAY ĐƠN VỊ (bắt buộc chuyển đúng):
- User nói "X phút" → delayValue: X, delayUnit: "minutes"
- User nói "X giờ" → delayValue: X, delayUnit: "hours"
- User nói "X ngày" → delayValue: X, delayUnit: "days"
- KHÔNG làm tròn "3 giờ" thành "1 ngày" hay "0 ngày"

ZALO NHÓM — LỌC THEO TÊN NHÓM:
- Hệ thống KHÔNG thể lọc nhóm theo tên trong node config
- Khi user đề cập tên nhóm cụ thể (vd: "nhóm Học viên K2023") → tạo chiến dịch bình thường với get_all_groups, thêm vào description: "⚠️ Vào Campaign Builder → node get_all_groups → chọn đúng nhóm '[tên nhóm]' trước khi chạy"
- zaloSelectedGroupIds: [] (để trống, user tự chọn trong UI)

Luồng Zalo nhóm ĐÚNG: trigger→select_zalo_account→get_all_groups→send_zalo_group (KHÔNG dùng interested_customers cho nhóm)
`;
      } catch (e) {
        console.warn('[AI] Không lấy được existing resources:', e.message);
      }
    }

    // RAG context từ hồ sơ doanh nghiệp (với fallback về full profile nếu vector search không khả dụng)
    if (userId && history.length > 0) {
      const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        try {
          contextBlock = await businessProfileService.getContextForPrompt(userId, lastUserMsg.content);
        } catch (e) {
          console.warn('[AI] Không lấy được RAG context:', e.message);
        }
        // Fallback: nếu RAG trả rỗng (pgvector chưa cài, chunks chưa embed), dùng full profile
        if (!contextBlock) {
          try {
            const profile = await businessProfileService.getProfile(userId);
            contextBlock = businessProfileService.formatProfileForPrompt(profile);
          } catch (e) {
            console.warn('[AI] Không lấy được business profile:', e.message);
          }
        }
      }
    }

    const systemPrompt = `Bạn là Founder AI Coworker - Trợ lý Marketing thông minh, chuyên hỗ trợ tạo template tin nhắn, chiến dịch marketing, landing page, và phân tích tài liệu/dữ liệu doanh nghiệp.

## NGUYÊN TẮC QUAN TRỌNG NHẤT:
- KHÔNG BAO GIỜ tự bịa thông tin về sản phẩm, doanh nghiệp, tên công ty, giá cả, khuyến mãi.
- Bạn hoàn toàn CÓ KHẢ NĂNG đọc, hiểu, phân tích, và tổng hợp thông tin từ bất kỳ tệp đính kèm nào (Word, Excel, PDF, CSV, hình ảnh, văn bản) mà người dùng gửi lên. Khi người dùng đính kèm tệp, nội dung của tệp đó đã được hệ thống trích xuất tự động và gắn kèm dưới dạng văn bản trực tiếp trong phần tin nhắn. Bạn hãy trả lời, phân tích, hoặc tổng hợp nội dung tệp theo đúng yêu cầu của người dùng.
- Nếu người dùng yêu cầu phân tích/tổng hợp thông tin chung hoặc thảo luận không liên quan trực tiếp đến việc tạo chiến dịch/template, hãy trả lời với type: "text" và đưa ra nội dung phân tích/tổng hợp đầy đủ, chi tiết và chuyên nghiệp trong trường "content".
- Nếu thiếu thông tin cần thiết để tạo template/chiến dịch/landing page → type: "ask_more", hỏi cụ thể những gì còn thiếu.
- Chỉ tạo nội dung template/chiến dịch/landing page khi đã có đủ thông tin từ người dùng.

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
QUY TẮC LOGO:
- Nếu hồ sơ doanh nghiệp có "Logo URL: https://..." → dùng <img src="{logo_url}" alt="{company_name}" style="max-width:150px;height:auto;display:block;margin:0 auto">
- Nếu "Logo URL: (chưa có...)" hoặc không có → KHÔNG dùng <img> cho logo. Thay bằng: <div style="text-align:center;padding:20px 0"><span style="font-size:22px;font-weight:bold;color:{brand_color}">{company_name}</span></div>

### 4. type: "campaign_script"
Khi người dùng muốn TẠO CHIẾN DỊCH và đã có ĐỦ thông tin.
**QUAN TRỌNG**: Đây là DRAFT - user sẽ xem và nhấn "Tạo chiến dịch" để khởi tạo thật sự. KHÔNG tự động chạy.

QUY TẮC BẮT BUỘC VỀ NODES (chỉ dùng các node sau — không dùng wait/delay/condition/tag_contact riêng):

LUỒNG EMAIL:
  trigger → interested_customers → send_email(delay:0) → send_email(delay:Nd) → end
  send_email config: { recipientSource:"node", recipientNodeId:"<tempId>", recipientField:"email", emailTemplateId:<ID|null>, emailSubject:"...", emailBody:"<html>", delayValue:0, delayUnit:"days", enableLinkTracking:true, saveMessageLog:true }

LUỒNG ZALO CÁ NHÂN (từ DB):
  trigger → interested_customers → send_zalo_personal(delay:0) → send_zalo_personal(delay:Nd) → end
  send_zalo_personal config: { zaloAccountId:<ID|null>, zaloRecipientSource:"node", zaloRecipientNodeId:"<tempId>", zaloRecipientField:"phone", zaloRecipientType:"phone", message:"...", zaloPersonalTemplateSteps:[], delayValue:0, delayUnit:"days", saveMessageLog:true }

LUỒNG ZALO NHÓM:
  trigger → select_zalo_account → get_all_groups → send_zalo_group(delay:0) → send_zalo_group(delay:Nd) → end
  select_zalo_account config: { zaloAccountId:<ID|null> }
  get_all_groups config: { zaloAccountNodeId:"<tempId_select_zalo_account>" }
  send_zalo_group config: { zaloAccountId:<ID|null>, zaloGroupSource:"node", zaloGroupNodeId:"<tempId_get_all_groups>", zaloGroupField:"groupId", zaloGroupMessage:"...", zaloGroupTemplateSteps:[], delayValue:0, delayUnit:"days", saveMessageLog:true }

LUẬT DELAY: KHÔNG tạo node wait/delay riêng. Delay đặt trong delayValue+delayUnit của action node.
Điền zaloAccountId từ danh sách tài nguyên. Tự soạn nội dung tin nhắn thực tế nếu không có template.

Data structure — nodes PHẢI có đúng nodeType + nodeSubtype như ví dụ sau:

Email campaign (2 lần gửi):
{ "campaignName": "...", "description": "...", "campaignType": "email", "isAiDraft": true,
  "nodes": [
    { "tempId": "n1", "nodeType": "trigger",  "nodeSubtype": "manual",                  "nodeName": "Bắt đầu",          "nodeDescription": "", "positionX": 100, "positionY": 200, "config": {} },
    { "tempId": "n2", "nodeType": "data",     "nodeSubtype": "interested_customers",    "nodeName": "Danh sách khách",  "nodeDescription": "Khách từ database", "positionX": 350, "positionY": 200, "config": { "interestedCustomerType": "both", "interestedLimit": 1000 } },
    { "tempId": "n3", "nodeType": "action",   "nodeSubtype": "send_email",              "nodeName": "Email 1",          "nodeDescription": "Gửi ngay", "positionX": 600, "positionY": 200, "config": { "recipientSource": "node", "recipientNodeId": "n2", "recipientField": "email", "emailTemplateId": null, "emailSubject": "Tiêu đề email 1", "emailBody": "<div style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff\"><div style=\"background:#FF6B00;padding:32px 24px;text-align:center\"><h1 style=\"color:#ffffff;margin:0;font-size:24px\">Tên Công Ty</h1></div><div style=\"padding:32px 24px\"><p style=\"font-size:16px;color:#333;margin:0 0 16px\">Xin chào <strong>{{full_name}}</strong>,</p><p style=\"font-size:15px;color:#555;line-height:1.6;margin:0 0 24px\">Nội dung email 1 thực sự, chuyên nghiệp, có giá trị cho người nhận.</p><div style=\"text-align:center;margin:32px 0\"><a href=\"#\" style=\"background:#FF6B00;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block\">Hành động ngay</a></div></div><div style=\"background:#f5f5f5;padding:16px 24px;text-align:center\"><p style=\"font-size:12px;color:#999;margin:0\">Bạn nhận email này vì đã đăng ký nhận thông tin.</p></div></div>", "templateMappings": [], "enableLinkTracking": true, "saveMessageLog": true, "delayValue": 0, "delayUnit": "days" } },
    { "tempId": "n4", "nodeType": "action",   "nodeSubtype": "send_email",              "nodeName": "Email 2",          "nodeDescription": "Gửi sau 3 ngày", "positionX": 850, "positionY": 200, "config": { "recipientSource": "node", "recipientNodeId": "n2", "recipientField": "email", "emailTemplateId": null, "emailSubject": "Tiêu đề email 2", "emailBody": "<div style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff\"><div style=\"background:#FF6B00;padding:32px 24px;text-align:center\"><h1 style=\"color:#ffffff;margin:0;font-size:24px\">Tên Công Ty</h1></div><div style=\"padding:32px 24px\"><p style=\"font-size:16px;color:#333;margin:0 0 16px\">Xin chào <strong>{{full_name}}</strong>,</p><p style=\"font-size:15px;color:#555;line-height:1.6;margin:0 0 24px\">Nội dung email 2 nhắc nhở, tạo urgency, thúc đẩy hành động.</p><div style=\"background:#fff8f0;border-left:4px solid #FF6B00;padding:16px;margin:0 0 24px\"><p style=\"margin:0;font-size:15px;color:#333\">⏰ Cơ hội sắp kết thúc!</p></div><div style=\"text-align:center;margin:32px 0\"><a href=\"#\" style=\"background:#FF6B00;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block\">Đăng ký ngay</a></div></div><div style=\"background:#f5f5f5;padding:16px 24px;text-align:center\"><p style=\"font-size:12px;color:#999;margin:0\">Bạn nhận email này vì đã đăng ký nhận thông tin.</p></div></div>", "templateMappings": [], "enableLinkTracking": true, "saveMessageLog": true, "delayValue": 3, "delayUnit": "days" } },
    { "tempId": "n5", "nodeType": "end",      "nodeSubtype": "end",                     "nodeName": "Kết thúc",         "nodeDescription": "", "positionX": 1100, "positionY": 200, "config": {} }
  ],
  "connections": [{"sourceNodeId":"n1","targetNodeId":"n2"},{"sourceNodeId":"n2","targetNodeId":"n3"},{"sourceNodeId":"n3","targetNodeId":"n4"},{"sourceNodeId":"n4","targetNodeId":"n5"}]
}

Zalo cá nhân campaign:
{ "campaignName": "...", "description": "...", "campaignType": "zalo", "isAiDraft": true,
  "nodes": [
    { "tempId": "n1", "nodeType": "trigger",  "nodeSubtype": "manual",                  "nodeName": "Bắt đầu",          "nodeDescription": "", "positionX": 100, "positionY": 200, "config": {} },
    { "tempId": "n2", "nodeType": "data",     "nodeSubtype": "interested_customers",    "nodeName": "Danh sách khách",  "nodeDescription": "Khách từ database", "positionX": 350, "positionY": 200, "config": { "interestedCustomerType": "both", "interestedLimit": 1000 } },
    { "tempId": "n3", "nodeType": "action",   "nodeSubtype": "send_zalo_personal",      "nodeName": "Zalo tin 1",       "nodeDescription": "Gửi ngay", "positionX": 600, "positionY": 200, "config": { "zaloAccountId": null, "zaloRecipientSource": "node", "zaloRecipientNodeId": "n2", "zaloRecipientField": "phone", "zaloRecipientType": "phone", "message": "Nội dung tin nhắn 1...", "zaloPersonalTemplateSteps": [], "saveMessageLog": true, "delayValue": 0, "delayUnit": "days" } },
    { "tempId": "n4", "nodeType": "action",   "nodeSubtype": "send_zalo_personal",      "nodeName": "Zalo tin 2",       "nodeDescription": "Gửi sau 2 ngày", "positionX": 850, "positionY": 200, "config": { "zaloAccountId": null, "zaloRecipientSource": "node", "zaloRecipientNodeId": "n2", "zaloRecipientField": "phone", "zaloRecipientType": "phone", "message": "Nội dung tin nhắn 2...", "zaloPersonalTemplateSteps": [], "saveMessageLog": true, "delayValue": 2, "delayUnit": "days" } },
    { "tempId": "n5", "nodeType": "end",      "nodeSubtype": "end",                     "nodeName": "Kết thúc",         "nodeDescription": "", "positionX": 1100, "positionY": 200, "config": {} }
  ],
  "connections": [{"sourceNodeId":"n1","targetNodeId":"n2"},{"sourceNodeId":"n2","targetNodeId":"n3"},{"sourceNodeId":"n3","targetNodeId":"n4"},{"sourceNodeId":"n4","targetNodeId":"n5"}]
}

Zalo nhóm campaign:
{ "campaignName": "...", "description": "...", "campaignType": "zalo_group", "isAiDraft": true,
  "nodes": [
    { "tempId": "n1", "nodeType": "trigger",  "nodeSubtype": "manual",                  "nodeName": "Bắt đầu",          "nodeDescription": "", "positionX": 100, "positionY": 200, "config": {} },
    { "tempId": "n2", "nodeType": "data",     "nodeSubtype": "select_zalo_account",     "nodeName": "Chọn tài khoản Zalo", "nodeDescription": "", "positionX": 350, "positionY": 200, "config": { "zaloAccountId": null } },
    { "tempId": "n3", "nodeType": "data",     "nodeSubtype": "get_all_groups",          "nodeName": "Lấy danh sách nhóm", "nodeDescription": "", "positionX": 600, "positionY": 200, "config": { "zaloAccountNodeId": "n2" } },
    { "tempId": "n4", "nodeType": "action",   "nodeSubtype": "send_zalo_group",         "nodeName": "Gửi nhóm tin 1",   "nodeDescription": "Gửi ngay", "positionX": 850, "positionY": 200, "config": { "zaloAccountId": null, "zaloGroupSource": "node", "zaloGroupNodeId": "n3", "zaloGroupField": "groupId", "zaloGroupMessage": "Nội dung tin nhắn nhóm 1...", "zaloGroupTemplateSteps": [], "saveMessageLog": true, "delayValue": 0, "delayUnit": "days" } },
    { "tempId": "n5", "nodeType": "action",   "nodeSubtype": "send_zalo_group",         "nodeName": "Gửi nhóm tin 2",   "nodeDescription": "Gửi sau 1 ngày", "positionX": 1100, "positionY": 200, "config": { "zaloAccountId": null, "zaloGroupSource": "node", "zaloGroupNodeId": "n3", "zaloGroupField": "groupId", "zaloGroupMessage": "Nội dung tin nhắn nhóm 2...", "zaloGroupTemplateSteps": [], "saveMessageLog": true, "delayValue": 1, "delayUnit": "days" } },
    { "tempId": "n6", "nodeType": "end",      "nodeSubtype": "end",                     "nodeName": "Kết thúc",         "nodeDescription": "", "positionX": 1350, "positionY": 200, "config": {} }
  ],
  "connections": [{"sourceNodeId":"n1","targetNodeId":"n2"},{"sourceNodeId":"n2","targetNodeId":"n3"},{"sourceNodeId":"n3","targetNodeId":"n4"},{"sourceNodeId":"n4","targetNodeId":"n5"},{"sourceNodeId":"n5","targetNodeId":"n6"}]
}

LUẬT QUAN TRỌNG: Mỗi node PHẢI có đúng cặp nodeType + nodeSubtype như mẫu trên. KHÔNG được dùng nodeSubtype: "manual" cho tất cả node.

### 5. type: "ask_campaign_details"
Khi người dùng muốn tạo chiến dịch nhưng CHƯA có đủ thông tin để tạo ngay.
Hỏi gộp TẤT CẢ câu hỏi cần thiết trong 1 lần. Dùng ngôn ngữ đơn giản, KHÔNG dùng từ chuyên môn.

QUAN TRỌNG: Chỉ bỏ câu hỏi khi user đã nói RÕ RÀNG và CHẮC CHẮN:
- Đã nói rõ kênh (email/zalo/nhóm) → bỏ câu hỏi "channel"
- Đã đề cập "landing page", "đăng ký", "form" → bỏ "dataSource", tự chọn landing
- Đã đề cập "sheet", "excel", "file" → bỏ "dataSource", tự chọn sheet
- Đã đề cập "khách hàng", "database", "hệ thống" → bỏ "dataSource", tự chọn db
- User cung cấp email/SĐT cụ thể (vd: "gửi cho abc@gmail.com") → bỏ "dataSource", dùng db với filter email đó; nếu người đó chưa có trong DB thì trả lời bằng type "text" hướng dẫn thêm vào Danh sách khách trước
- KHÔNG bỏ "productCount" hay "sendingStyle" trừ khi user nói thật sự rõ. Nếu không chắc → vẫn hỏi

Data structure:
{
  "campaignName": "Tên chiến dịch đã suy luận",
  "description": "Mô tả ngắn",
  "questions": [
    {
      "id": "channel",
      "label": "Gửi qua đâu?",
      "options": [
        { "value": "email", "label": "📧 Email" },
        { "value": "zalo", "label": "💬 Tin nhắn Zalo" },
        { "value": "zalo_group", "label": "👥 Nhóm Zalo" }
      ]
    },
    {
      "id": "productCount",
      "label": "Lần này muốn giới thiệu:",
      "options": [
        { "value": "1", "label": "1 sản phẩm / dịch vụ" },
        { "value": "nhieu", "label": "Nhiều sản phẩm cùng lúc" }
      ]
    },
    {
      "id": "sendingStyle",
      "label": "Cách gửi:",
      "options": [
        { "value": "1_lan", "label": "Gửi 1 lần là xong" },
        { "value": "nhieu_dot", "label": "Gửi nhiều lần, cách nhau vài ngày" }
      ]
    },
    {
      "id": "dataSource",
      "label": "Lấy danh sách khách từ đâu?",
      "options": [
        { "value": "db", "label": "👥 Khách hàng có sẵn trong hệ thống" },
        { "value": "sheet", "label": "📊 File Excel / Google Sheet" },
        { "value": "landing", "label": "📋 Danh sách đăng ký từ Landing Page" }
      ]
    }
  ]
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
  "type": "text" | "ask_more" | "template_draft" | "campaign_script" | "ask_campaign_details" | "confirm_create" | "create_and_run" | "landing_page",
  "content": "Lời nhắn cho người dùng (tiếng Việt, thân thiện, KHÔNG dùng từ chuyên môn, KHÔNG dùng markdown **bold** hay *italic*, dùng text thuần, gạch đầu dòng bằng dấu -)",
  "missing_fields": [] | ["tên sản phẩm", "mục tiêu email"],
  "data": null | { ... }
}

Khi type="ask_more": content là câu hỏi cụ thể, missing_fields liệt kê những gì cần.
Khi type="template_draft": content mô tả template vừa tạo, data chứa template.
Khi type="campaign_script": content mô tả chiến dịch là DRAFT, data chứa script.
Khi type="ask_campaign_details": content là câu dẫn ngắn, data chứa questions để hỏi user.
Khi type="confirm_create": content mô tả chiến dịch bằng ngôn ngữ đơn giản, data.summary chứa thông tin chi tiết.
Khi type="create_and_run": content thông báo đang tạo và chạy campaign tự động, data chứa script.
Khi type="landing_page": content mô tả trang, data chứa html/css.

## LOGIC XỬ LÝ CHIẾN DỊCH:

### Nguyên tắc ngôn ngữ:
- KHÔNG dùng: "campaign", "node", "trigger", "workflow", "drip", "sequence"
- DÙNG thay thế: "chiến dịch", "bước", "khởi động", "quy trình", "gửi nhiều lần", "chuỗi tin nhắn"

### Xử lý yêu cầu ngoài phạm vi hệ thống (type: "text", giải thích thân thiện):

TUYỆT ĐỐI KHÔNG từ chối tạo chiến dịch vì lý do ngành nghề hay lĩnh vực:
- Hồ sơ doanh nghiệp chỉ dùng để cá nhân hóa NỘI DUNG (tên công ty, màu sắc, logo), KHÔNG dùng để lọc/từ chối yêu cầu
- User có thể tạo chiến dịch cho BẤT KỲ sản phẩm/dịch vụ nào: tiếng Anh, ẩm thực, thể thao, tài chính, v.v.
- Nếu sản phẩm không có trong danh sách hệ thống → vẫn tạo campaign bình thường, dùng tên sản phẩm user cung cấp

KÊNH KHÔNG ĐƯỢC HỖ TRỢ:
- SMS, WhatsApp, Telegram, Facebook Messenger, Push Notification → type: "text", giải thích: "Hệ thống hiện hỗ trợ 3 kênh: Email, Zalo cá nhân, Zalo nhóm. [Kênh user yêu cầu] chưa được hỗ trợ. Bạn muốn tạo chiến dịch qua một trong 3 kênh trên không?"

TÍNH NĂNG CHƯA CÓ:
- Logic điều kiện if/else (vd: "nếu mở email thì...") → type: "text", giải thích rằng hệ thống hiện chỉ hỗ trợ gửi tuyến tính, gợi ý chiến dịch drip thay thế
- A/B testing, personalization theo hành vi → type: "text", giải thích giới hạn, gợi ý cách thực hiện đơn giản hơn
- Lọc khách theo lịch sử mua hàng phức tạp → type: "text", giải thích chỉ lọc được theo: có email, có Zalo/phone, hoặc tất cả

YÊU CẦU NGOÀI PHẠM VI HOÀN TOÀN:
- Xóa/sửa/dừng chiến dịch cũ, quản lý tài khoản, thanh toán → type: "text", hướng dẫn user vào đúng mục trong menu
- Câu hỏi không liên quan đến marketing/chiến dịch → type: "text", trả lời ngắn gọn và gợi ý những việc AI có thể giúp

### Khi user prompt "tao chien dich [san pham]":
1. Nếu CHƯA có đủ thông tin (kênh, cách gửi...) → type: "ask_campaign_details"
2. Nếu ĐÃ có đủ thông tin (user trả lời xong ask_campaign_details) → type: "confirm_create"
3. Nếu THIẾU thông tin khác (tên sản phẩm, mục tiêu...) → type: "ask_more"

### Xử lý các trường hợp đặc biệt:

TẠO CẢ TEMPLATE LẪN CHIẾN DỊCH TRONG 1 YÊU CẦU:
- Khi user muốn vừa tạo template vừa tạo chiến dịch → chỉ tạo campaign_script với emailBody inline đầy đủ
- Hệ thống sẽ tự động lưu email content thành template khi campaign được tạo
- Không cần tạo template_draft riêng trước

EMAIL CÓ GIF / ẢNH ĐỘNG:
- Khi user yêu cầu GIF → chèn thẻ <img> với URL placeholder: https://via.placeholder.com/600x200/FF6B35/FFFFFF?text=GIF+Preview
- Thêm comment HTML: <!-- Thay URL này bằng link GIF thực của bạn -->
- Đề cập trong content: "Bạn cần thay URL ảnh placeholder bằng link GIF thực"

GOOGLE SHEET KHÔNG CÓ URL:
- Khi user đề cập "Google Sheet" / "file sheet" nhưng KHÔNG cung cấp URL → type: "ask_more", missing_fields: ["Đường dẫn Google Sheet (URL)"], hỏi: "Bạn vui lòng chia sẻ đường dẫn Google Sheet để tôi cấu hình đúng?"
- Chỉ dùng dataSource="sheet" khi user đã cung cấp URL hoặc chọn từ form

### Sau khi user trả lời ask_campaign_details, build campaign dựa vào:
- channel: email/zalo/zalo_group → chọn đúng action node
- productCount="nhieu" → nhiều action node, mỗi node 1 sản phẩm khác nhau
- sendingStyle="nhieu_dot" → các action node có delayValue > 0 (3-7 ngày)
- dataSource="db"      → nodeSubtype: "interested_customers", config: { interestedCustomerType: "both", interestedLimit: 1000 }
- dataSource="db" với email cụ thể → nodeSubtype: "interested_customers", config: { interestedCustomerType: "has_email", interestedLimit: 1 } (AI ghi chú email trong campaignName/description)
- "đã mua [khóa X]" → interestedCustomerType: "purchased", interestedCourseIds: [id_khoaX]
- "chưa mua [khóa X]" → interestedCustomerType: "interested", interestedCourseIds: [id_khoaX]
- "đã mua [khóa X] nhưng chưa mua [khóa Y]" → interestedCustomerType: "purchased", interestedCourseIds: [id_khoaX], notPurchasedCourseIds: [id_khoaY]
- Dùng ID khóa học từ danh sách "Khóa học / Sản phẩm" ở phần TÀI NGUYÊN CÓ SẴN
- dataSource="sheet"   → nodeSubtype: "read_sheet", config: { sheetUrl: "", sheetName: "Sheet1", headerRow: 1, dataStartRow: 2 }
  ⚠ Nếu user chọn sheet: thêm vào content câu nhắc "Bạn cần điền đường dẫn Google Sheet vào cấu hình sau khi tạo chiến dịch."
- dataSource="landing" → nodeSubtype: "read_landing_leads", config: {}

Ví dụ campaign drip 2 đợt (sendingStyle=nhieu_dot, dataSource=db):
nodes: trigger → interested_customers → action_wave1(delay=0) → action_wave2(delay=3 days) → end

Ví dụ lấy từ sheet (dataSource=sheet):
nodes: trigger → read_sheet(sheetUrl="") → action_wave1(delay=0) → end

Ví dụ lấy từ landing page (dataSource=landing):
nodes: trigger → read_landing_leads → action_wave1(delay=0) → end

Ví dụ 2 sản phẩm gửi 1 lần (productCount=nhieu, sendingStyle=1_lan):
nodes: trigger → data_node → action_sp1(delay=0) → action_sp2(delay=2 days) → end

### Các từ khóa xác định kênh:
- "email" / "gửi mail" / "thư điện tử" → campaignType: "email"
- "zalo" / "tin nhắn zalo" → campaignType: "zalo"
- "zalo nhóm" / "nhóm zalo" / "gửi nhóm" → campaignType: "zalo_group"

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
    // Hàm đọc và đính kèm một file vào parts array
    const attachFileToParts = async (parts, file) => {
      try {
        const buffer = await uploadController.readTempFileBuffer(file.tempId, file.originalName);
        const mimeType = String(file.contentType || '').toLowerCase();
        if (mimeType.startsWith('image/')) {
          parts.push({ inlineData: { mimeType: file.contentType, data: buffer.toString('base64') } });
        } else {
          const extractedText = await extractTextFromBuffer(buffer, file.originalName, file.contentType);
          if (extractedText.trim()) {
            parts.push({
              text: `[Nội dung tệp đính kèm: "${file.originalName}"]:\n${extractedText}\n[Hết nội dung tệp: "${file.originalName}"]`
            });
          }
        }
      } catch (err) {
        console.warn(`Could not read file ${file.tempId} for AI:`, err.message);
      }
    };

    // Build Gemini history — re-attach files từ TẤT CẢ tin nhắn trong lịch sử
    const geminiHistory = await Promise.all(history.map(async (msg) => {
      const parts = [{ text: msg.content || '(no text)' }];
      if (msg.role === 'user' && Array.isArray(msg.files) && msg.files.length > 0) {
        for (const file of msg.files) {
          await attachFileToParts(parts, file);
        }
      }
      return { role: msg.role === 'assistant' ? 'model' : 'user', parts };
    }));

    // Đính kèm thêm files của tin nhắn hiện tại (nếu có, không trùng với history)
    if (files.length > 0) {
      const lastMessage = geminiHistory[geminiHistory.length - 1];
      const historyFileIds = new Set(
        (history[history.length - 1]?.files || []).map(f => f.tempId)
      );
      for (const file of files) {
        if (!historyFileIds.has(file.tempId)) {
          await attachFileToParts(lastMessage.parts, file);
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
      return this._validateWorkflowNodes(parsed);
    } catch {
      try {
        const sanitized = jsonStr.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (_match, p1) => {
          return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
        });
        return this._validateWorkflowNodes(JSON.parse(sanitized));
      } catch {
        // JSON hoàn toàn không parse được → trả về text thay vì crash
        console.warn('[AI] JSON parse failed, falling back to text response');
        return { type: 'text', content: text, data: null, missing_fields: [] };
      }
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
