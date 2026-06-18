import { extractGeminiUsage } from '../../utils/geminiClient.util.js';
import businessProfileService from './businessProfile.service.js';
import { buildAdminContext } from './adminContext.service.js';
import landingTemplateService from '../landingTemplate/landingTemplate.service.js';
import uploadController from '../../controllers/upload.controller.js';
import axios from 'axios';
import { extractTextFromBuffer } from '../../utils/fileParser.util.js';
import { attachGoogleUrlParts } from '../../utils/googleUrlFetch.util.js';
import aiCampaignRepository from '../../repositories/ai/aiCampaign.repository.js';
import aiUsageMeter from './aiUsageMeter.service.js';

class AiCampaignService {
  /**
   * Lấy danh sách email templates của user để AI điền sẵn config.
   * @param {number} userId
   * @returns {Promise<Array>}
   */
  async getCourses(userId) {
    try {
      const rows = await aiCampaignRepository.getCourses(userId);
      return rows.map(r => {
        let name = String(r.name || '');
        // Decode numeric entities first
        name = name.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
        // Decode named entities
        name = name
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
          .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&lsquo;/g, '‘')
          .replace(/&rsquo;/g, '’').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”');
        // Strip HTML tags
        name = name.replace(/<[^>]+>/g, '').trim();
        return { ...r, name };
      });
    } catch (e) {
      console.warn('[AI] Không lấy được danh sách khóa học:', e.message);
      return [];
    }
  }

  async getEmailTemplates(userId) {
    try {
      const rows = await aiCampaignRepository.getEmailTemplates(userId);
      return rows.map(r => ({
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
      const rows = await aiCampaignRepository.getZaloAccounts(userId);
      return rows.map(r => ({
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
      const rows = await aiCampaignRepository.getZaloTemplates(userId);
      return rows.map(r => ({
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
      const accountId = await aiCampaignRepository.getDefaultZaloAccountId(userId);
      if (!accountId) return [];

      const rows = await aiCampaignRepository.getZaloGroupsByAccountId(accountId);
      return rows.map(r => ({
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
   * Lấy danh sách landing pages của user (slug + title) để AI gợi ý filter leads.
   * @param {number} userId
   * @returns {Promise<Array>}
   */
  async getLandingPages(userId) {
    try {
      const rows = await aiCampaignRepository.getLandingPages(userId);
      return rows.map(r => ({
        slug: r.slug,
        title: r.title,
        isPublished: r.is_published,
      }));
    } catch (e) {
      console.warn('[AI] Không lấy được landing pages:', e.message);
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
      const [totalRow, emailRow, zaloRow, phoneRow] = await Promise.all([
        aiCampaignRepository.getCustomerStatTotal(userId),
        aiCampaignRepository.getCustomerStatEmail(userId),
        aiCampaignRepository.getCustomerStatZalo(userId),
        aiCampaignRepository.getCustomerStatPhone(userId),
      ]);

      return {
        total: parseInt(totalRow?.total || 0, 10),
        hasEmail: parseInt(emailRow?.count || 0, 10),
        hasZalo: parseInt(zaloRow?.count || 0, 10),
        hasPhone: parseInt(phoneRow?.count || 0, 10),
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
  config: { "landingLeadsSlugs": ["slug-landing-page"] }  ← [] = lấy tất cả leads; điền slug từ danh sách Landing Pages trong TÀI NGUYÊN CÓ SẴN

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
    const { text } = await aiUsageMeter.generateWithBudget(userId, {
      parts,
      jsonMode: true,
      temperature: 0.8,
      maxOutputTokens: 16384,
      feature: 'campaign_script',
    });
    console.log(`[AI] Gemini response received (${text?.length || 0} chars)`);

    return this._parseJson(text);
  }

  /**
   * Process interactive smart chat with intent detection.
   * Returns: { type, content, data, missing_fields }
   */
  _langInstruction(locale) {
    return locale === 'en'
      ? 'Always respond in English. All "content" fields in JSON must be written in English.'
      : 'Luôn trả lời bằng tiếng Việt. Tất cả trường "content" trong JSON phải viết bằng tiếng Việt.';
  }

  _lastUserMessageContent(history = []) {
    const lastUserMessage = [...history].reverse().find((message) => message?.role === 'user');
    return String(lastUserMessage?.content || '');
  }

  _hasExplicitCustomerSource(text = '') {
    const normalized = String(text || '').toLowerCase();
    return /google\s*sheet|spreadsheet|docs\.google\.com\/spreadsheets|excel|xlsx|xls|csv|file|t[eệ]p|tập tin|landing page|khách hàng trong hệ thống|database|db|crm/.test(normalized);
  }

  _looksLikeCampaignRequest(text = '') {
    const normalized = String(text || '').toLowerCase();
    return /chiến dịch|chien dich|campaign|email|zalo|khách|khach|customer|tour|chuyến đi|chuyen di|du lịch|du lich/.test(normalized);
  }

  _asksOnlyForGoogleSheet(response) {
    const text = [
      response?.content,
      ...(Array.isArray(response?.missing_fields) ? response.missing_fields : []),
    ].join(' ').toLowerCase();

    return response?.type === 'ask_more'
      && /google\s*sheet|spreadsheet|sheet\s*url|đường dẫn google sheet|docs\.google\.com\/spreadsheets/.test(text);
  }

  _buildCampaignDataSourceQuestion(locale = 'vi') {
    const isEnglish = locale === 'en';
    return {
      type: 'ask_campaign_details',
      content: isEnglish
        ? 'I can create this customer care campaign. Before setting it up, please choose where the customer list should come from.'
        : 'Tôi có thể tạo chiến dịch chăm sóc khách hàng này. Trước khi thiết lập, bạn chọn giúp tôi nguồn danh sách khách hàng nhé.',
      missing_fields: [],
      data: {
        campaignName: isEnglish ? 'Travel customer care campaign' : 'Chiến dịch chăm sóc khách du lịch',
        description: isEnglish
          ? 'Send thank-you messages after a trip and a follow-up promotion later.'
          : 'Gửi lời cảm ơn sau chuyến đi và gửi ưu đãi tour mới sau một khoảng thời gian.',
        questions: [
          {
            id: 'dataSource',
            label: isEnglish ? 'Where should the customer list come from?' : 'Lấy danh sách khách từ đâu?',
            options: [
              { value: 'db', label: isEnglish ? 'Customers already in the system' : 'Khách hàng có sẵn trong hệ thống' },
              { value: 'sheet', label: isEnglish ? 'Excel / Google Sheet' : 'File Excel / Google Sheet' },
              { value: 'landing', label: isEnglish ? 'Landing page leads' : 'Danh sách đăng ký từ Landing Page' },
            ],
          },
        ],
      },
    };
  }

  _guardCampaignDataSourceResponse(response, history = [], locale = 'vi') {
    const lastUserText = this._lastUserMessageContent(history);
    if (
      this._looksLikeCampaignRequest(lastUserText)
      && this._asksOnlyForGoogleSheet(response)
      && !this._hasExplicitCustomerSource(lastUserText)
    ) {
      return this._buildCampaignDataSourceQuestion(locale);
    }
    return response;
  }

  async processSmartChat({ history = [], files = [], userId = null, userRole = 'user', locale = 'vi' }) {
    let contextBlock = '';

    if (userRole === 'admin') {
      // Super admin: inject số liệu nền tảng real-time
      try {
        contextBlock = await buildAdminContext();
      } catch (e) {
        console.warn('[AI] Không lấy được admin context:', e.message);
      }

      const langInstr = this._langInstruction(locale);
      const adminSystemPrompt = `Bạn là Founder AI AI - Trợ lý thông minh cho System Admin của nền tảng Founder AI, và chuyên phân tích tài liệu/dữ liệu doanh nghiệp.
Nhiệm vụ của bạn là phân tích số liệu, tư vấn chiến lược, trả lời câu hỏi về tình trạng hoạt động của nền tảng, và giải đáp/tổng hợp bất kỳ tài liệu nào được gửi kèm.

${contextBlock}

QUY TẮC:
- ${langInstr}
- Luôn dựa trên dữ liệu thực được cung cấp ở trên, không được bịa số liệu.
- Bạn hoàn toàn CÓ KHẢ NĂNG đọc, hiểu, phân tích, và tổng hợp thông tin từ bất kỳ tệp đính kèm nào (Word, Excel, PDF, CSV, hình ảnh, văn bản) mà người dùng gửi lên. Khi người dùng đính kèm tệp, nội dung của tệp đó đã được hệ thống trích xuất tự động và gắn kèm dưới dạng văn bản trực tiếp trong phần tin nhắn. Bạn hãy trả lời, phân tích, hoặc tổng hợp nội dung tệp theo đúng yêu cầu của người dùng.
- Trả lời súc tích, rõ ràng. Dùng bullet points khi liệt kê.
- Nếu người dùng hỏi về dữ liệu không có trong context (ví dụ: chi tiết từng user cụ thể), hãy nói rõ rằng bạn chỉ có số liệu tổng quan.
- Có thể đưa ra nhận xét, phân tích xu hướng, và gợi ý hành động dựa trên số liệu.

ĐỊNH DẠNG TRẢ VỀ (BẮT BUỘC JSON):
{
  "type": "text",
  "content": "Your answer here",
  "missing_fields": [],
  "data": null
}`;

      return this._runChat(adminSystemPrompt, history, files, userId);
    }

    // Thu thập existing resources cho non-admin users
    let existingResources = '';
    let landingPages = [];
    if (userId) {
      try {
        const [emailTemplates, zaloAccounts, zaloGroups, zaloTemplates, recommendedType, customerStats, courses, _landingPages] =
          await Promise.all([
            this.getEmailTemplates(userId),
            this.getZaloAccounts(userId),
            this.getZaloGroups(userId),
            this.getZaloTemplates(userId),
            this.getRecommendedCampaignType(userId),
            this.getCustomerStats(userId),
            this.getCourses(userId),
            this.getLandingPages(userId),
          ]);

        landingPages = _landingPages;
        const firstZaloAccountId = zaloAccounts[0]?.id ?? null;

        existingResources = `
=== TÀI NGUYÊN CÓ SẴN (được tải mới từ hệ thống tại thời điểm tin nhắn này — luôn phản ánh trạng thái hiện tại) ===
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

🌐 Landing Pages (landingLeadsSlugs — dùng để lọc leads trong read_landing_leads):
${landingPages.length > 0 ? landingPages.map(lp => `  - slug: "${lp.slug}" | "${lp.title}"${lp.isPublished ? '' : ' (chưa publish)'}`).join('\n') : '  (chưa có landing page nào)'}

NODE TYPES THỰC SỰ TỒN TẠI trong hệ thống (chỉ dùng các loại này):
• trigger/manual — điểm khởi đầu
• data/interested_customers — lấy khách từ DB (config: interestedCustomerType, interestedLimit, interestedCourseIds, notPurchasedCourseIds)
  - interestedCustomerType: "interested"=chưa mua | "purchased"=đã mua | "both"=tất cả
  - interestedCourseIds: [id1, id2] → chỉ lấy khách liên quan đến khóa học này
  - notPurchasedCourseIds: [id1, id2] → loại trừ khách ĐÃ mua các khóa này
• data/read_sheet — đọc Google Sheet (config: sheetUrl BẮT BUỘC)
• data/read_landing_leads — lấy leads từ landing page (config: landingLeadsSlugs: ["slug"] — lấy từ danh sách Landing Pages trong TÀI NGUYÊN)
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

    // Luôn dùng full profile để AI thấy tất cả sản phẩm/thông tin mới nhất
    if (userId) {
      try {
        const profile = await businessProfileService.getProfile(userId);
        contextBlock = businessProfileService.formatProfileForPrompt(profile);
      } catch (e) {
        console.warn('[AI] Không lấy được business profile:', e.message);
      }
    }

    const langInstr = this._langInstruction(locale);
    const systemPrompt = `Bạn là Founder AI Coworker - Trợ lý Marketing thông minh, chuyên hỗ trợ tạo template tin nhắn, chiến dịch marketing, landing page, và phân tích tài liệu/dữ liệu doanh nghiệp.

## NGÔN NGỮ:
- ${langInstr}

## NGUYÊN TẮC QUAN TRỌNG NHẤT:
- HỒ SƠ DOANH NGHIỆP VÀ TÀI NGUYÊN bên dưới được hệ thống TẢI TRỰC TIẾP TỪ DATABASE ngay trước mỗi tin nhắn — luôn phản ánh trạng thái MỚI NHẤT. Khi user nói "tôi vừa thêm sản phẩm", "tôi vừa cập nhật hồ sơ", v.v., hãy XÁC NHẬN bạn thấy thông tin đó trong phần hồ sơ bên dưới. KHÔNG BAO GIỜ nói "tôi không thể đọc thay đổi mới" hoặc "hồ sơ của tôi là thông tin cũ".
- KHÔNG BAO GIỜ tự bịa thông tin về sản phẩm, doanh nghiệp, tên công ty, giá cả, khuyến mãi.
- Bạn hoàn toàn CÓ KHẢ NĂNG đọc, hiểu, phân tích, và tổng hợp thông tin từ bất kỳ tệp đính kèm nào (Word, Excel, PDF, CSV, hình ảnh, văn bản) mà người dùng gửi lên. Khi người dùng đính kèm tệp, nội dung của tệp đó đã được hệ thống trích xuất tự động và gắn kèm dưới dạng văn bản trực tiếp trong phần tin nhắn. Bạn hãy trả lời, phân tích, hoặc tổng hợp nội dung tệp theo đúng yêu cầu của người dùng.
- Nếu người dùng yêu cầu phân tích/tổng hợp thông tin chung hoặc thảo luận không liên quan trực tiếp đến việc tạo chiến dịch/template, hãy trả lời với type: "text" và đưa ra nội dung phân tích/tổng hợp đầy đủ, chi tiết và chuyên nghiệp trong trường "content".
- Nếu thiếu thông tin cần thiết để tạo template/chiến dịch/landing page → type: "ask_more", hỏi cụ thể những gì còn thiếu.
- Chỉ tạo nội dung template/chiến dịch/landing page khi đã có đủ thông tin từ người dùng.
- Với yêu cầu tạo chiến dịch, KHÔNG tự suy đoán nguồn khách hàng là Google Sheet chỉ vì user nhắc các cột như full_name, email, phone, tour_name, end_date. Nếu user chưa nói rõ "Google Sheet", "Excel", "file", "landing page", "khách hàng trong hệ thống/database" hoặc chưa chọn dataSource trong câu trả lời trước, BẮT BUỘC dùng type="ask_campaign_details" và hỏi câu "dataSource".

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
- KHÔNG dùng ask_more cho landing page — dùng ask_landing_details thay thế để hỏi gộp 1 lần

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

QUY TẮC TẠO TEMPLATE TỪ KẾ HOẠCH NỘI DUNG:
- Nếu user yêu cầu 1 template đơn lẻ, trả type="template_draft" trực tiếp như schema trên.
- Nếu lịch sử hội thoại đã có type="content_plan" và tin nhắn hiện tại yêu cầu "Tạo chi tiết template cho ngày X, slot Y (...)" thì trả type="template_draft" cho ĐÚNG slot đó.
- KHÔNG tự chuyển sang ngày khác, KHÔNG tạo nhiều template trong một lần trả lời.
- content của template_draft phải tóm tắt nội dung chính thật của template vừa tạo để user hiểu nhanh. Nội dung đầy đủ vẫn nằm trong data.bodyText hoặc data.bodyHtml.

### 3b. type: "content_plan"
Khi user yêu cầu tạo nhiều tin nhắn/template cho chiến dịch nhiều ngày (ví dụ: "tạo 5 tin nhắn Zalo cho 5 ngày chăm sóc khách hàng mới", "lên 7 email trong 7 ngày") và CHƯA có content_plan nào trong lịch sử cho yêu cầu này:
- Trả type="content_plan" để đưa tổng quan trước, KHÔNG sinh bodyHtml/bodyText đầy đủ.
- Wizard v1 chỉ hỗ trợ 1 kênh duy nhất cho toàn bộ plan: "email" hoặc "zalo" (zalo cá nhân). Nếu user yêu cầu mixed channel hoặc zalo_group thì KHÔNG trả content_plan, hãy chuyển về ask_campaign_details/flow campaign thường.
- Data.days phải có đủ N ngày user yêu cầu và dùng cấu trúc days[].slots[].
- Mỗi day và mỗi slot cần summary đủ cụ thể: chủ đề, thông điệp chính, ưu đãi/CTA nếu có, và ngữ cảnh đủ để viết template chi tiết sau.
- content chỉ là câu dẫn ngắn, không nhắc lại toàn bộ từng ngày vì frontend sẽ hiển thị bằng card.

Data structure:
{
  "totalDays": 5,
  "days": [
    {
      "day": 1,
      "channel": "email" | "zalo",
      "goal": "Chào mừng & xây dựng niềm tin",
      "summary": "Tóm tắt nội dung chính ngày 1 trong 1-2 câu, đủ chi tiết để viết template sau.",
      "slots": [
        {
          "slotId": "d1s1",
          "slotIndex": 1,
          "channel": "email" | "zalo",
          "sendTime": "08:00",
          "goal": "Mục tiêu cụ thể của slot",
          "summary": "Tóm tắt nội dung cụ thể của slot để tạo template chi tiết.",
          "delayValue": 0,
          "delayUnit": "hours"
        },
        {
          "slotId": "d1s2",
          "slotIndex": 2,
          "channel": "email" | "zalo",
          "sendTime": "19:00",
          "goal": "Mục tiêu cụ thể của slot 2",
          "summary": "Nội dung slot 2",
          "delayValue": 11,
          "delayUnit": "hours"
        }
      ]
    }
  ]
}

### 4. type: "confirm_create"
Khi người dùng muốn TẠO CHIẾN DỊCH và đã có ĐỦ thông tin.
**QUAN TRỌNG**: Hiển thị summary để user xem và xác nhận. Sau đó user nhấn "Tạo chiến dịch" để khởi tạo. KHÔNG tự động chạy.

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

Mixed campaign (Email + Zalo cùng lúc — 2 nhánh song song từ 1 data node):
{ "campaignName": "...", "description": "...", "campaignType": "mixed", "isAiDraft": true,
  "nodes": [
    { "tempId": "n1", "nodeType": "trigger",  "nodeSubtype": "manual",               "nodeName": "Bắt đầu",         "nodeDescription": "", "positionX": 100, "positionY": 200, "config": {} },
    { "tempId": "n2", "nodeType": "data",     "nodeSubtype": "interested_customers", "nodeName": "Danh sách khách", "nodeDescription": "Khách từ database", "positionX": 350, "positionY": 200, "config": { "interestedCustomerType": "both", "interestedLimit": 1000 } },
    { "tempId": "n3", "nodeType": "action",   "nodeSubtype": "send_email",           "nodeName": "Email giới thiệu","nodeDescription": "Gửi ngay", "positionX": 600, "positionY": 100, "config": { "recipientSource": "node", "recipientNodeId": "n2", "recipientField": "email", "emailTemplateId": null, "emailSubject": "Tiêu đề email", "emailBody": "<div style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto\">...</div>", "templateMappings": [], "enableLinkTracking": true, "saveMessageLog": true, "delayValue": 0, "delayUnit": "days" } },
    { "tempId": "n4", "nodeType": "action",   "nodeSubtype": "send_zalo_personal",   "nodeName": "Zalo giới thiệu","nodeDescription": "Gửi ngay", "positionX": 600, "positionY": 300, "config": { "zaloAccountId": null, "zaloRecipientSource": "node", "zaloRecipientNodeId": "n2", "zaloRecipientField": "phone", "zaloRecipientType": "phone", "message": "Nội dung Zalo...", "zaloPersonalTemplateSteps": [], "saveMessageLog": true, "delayValue": 0, "delayUnit": "days" } },
    { "tempId": "n5", "nodeType": "end",      "nodeSubtype": "end",                  "nodeName": "Kết thúc",        "nodeDescription": "", "positionX": 900, "positionY": 200, "config": {} }
  ],
  "connections": [{"sourceNodeId":"n1","targetNodeId":"n2"},{"sourceNodeId":"n2","targetNodeId":"n3"},{"sourceNodeId":"n2","targetNodeId":"n4"},{"sourceNodeId":"n3","targetNodeId":"n5"},{"sourceNodeId":"n4","targetNodeId":"n5"}]
}

LUẬT QUAN TRỌNG: Mỗi node PHẢI có đúng cặp nodeType + nodeSubtype như mẫu trên. KHÔNG được dùng nodeSubtype: "manual" cho tất cả node.

Thêm field "summary" vào data: "summary": { "totalSteps": <số node>, "duration": "<X ngày | Ngay lập tức>", "steps": [{ "step": 1, "action": "<tên bước>", "timing": "Ngay lập tức | Sau X ngày" }, ...] }

### 5. type: "ask_campaign_details"
Khi người dùng muốn tạo chiến dịch nhưng CHƯA có đủ thông tin để tạo ngay.
Hỏi gộp TẤT CẢ câu hỏi cần thiết trong 1 lần. Dùng ngôn ngữ đơn giản, KHÔNG dùng từ chuyên môn.

QUAN TRỌNG: Chỉ bỏ câu hỏi khi user đã nói RÕ RÀNG và CHẮC CHẮN:
- Đã nói rõ kênh (email/zalo/nhóm) → bỏ câu hỏi "channel"
- Đã đề cập "landing page", "đăng ký", "form" → bỏ "dataSource", tự chọn landing
- Đã đề cập "sheet", "excel", "file" VÀ đã có URL Google Sheet hợp lệ (bắt đầu bằng https://docs.google.com/spreadsheets/...) → bỏ "dataSource", bỏ luôn bước hỏi URL, dùng URL đó trực tiếp cho read_sheet
- Đã đề cập "sheet", "excel", "file" NHƯNG chưa có URL → bỏ "dataSource", tự chọn sheet — SAU ĐÓ hỏi URL qua ask_more
- User upload file CSV/Excel (nội dung file được trích xuất thành text trong message) → bỏ "dataSource", xem đây là dataSource="sheet_uploaded" — xử lý theo hướng dẫn UPLOADED FILE bên dưới
- Đã đề cập "khách hàng", "database", "hệ thống" → bỏ "dataSource", tự chọn db
- User cung cấp email/SĐT cụ thể (vd: "gửi cho abc@gmail.com") → bỏ "dataSource", dùng db với filter email đó; nếu người đó chưa có trong DB thì trả lời bằng type "text" hướng dẫn thêm vào Danh sách khách trước
- KHÔNG bỏ "productCount" hay "sendingStyle" trừ khi user nói thật sự rõ. Nếu không chắc → vẫn hỏi
- KHÔNG được coi việc user liệt kê tên cột dữ liệu (full_name/email/phone/tour_name/end_date) là đã chọn Google Sheet. Đây chỉ là cấu trúc dữ liệu mong muốn; vẫn phải hỏi "dataSource" nếu nguồn chưa rõ.
- KHÔNG hỏi "Đường dẫn Google Sheet" nếu user chưa nói rõ muốn dùng Google Sheet/Excel/file hoặc chưa chọn dataSource="sheet".

CÂU HỎI ĐỘNG — thêm vào questions khi cần:
- Nếu channel=zalo hoặc channel=zalo_group VÀ có nhiều tài khoản Zalo (>1 trong TÀI NGUYÊN) → thêm câu hỏi "zaloAccount":
  { "id": "zaloAccount", "label": "Dùng tài khoản Zalo nào?", "options": [{ "value": "<id>", "label": "<displayName>" }, ...] }
- Nếu dataSource=landing VÀ có nhiều landing pages (>1 trong TÀI NGUYÊN) → thêm câu hỏi "landingPage":
  { "id": "landingPage", "label": "Lấy leads từ trang nào?", "options": [{ "value": "<slug>", "label": "<title>" }, ...] }

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

### 6. type: "ask_landing_details"
Khi người dùng muốn TẠO LANDING PAGE nhưng CHƯA cung cấp đủ thông tin.
Hỏi gộp TẤT CẢ câu hỏi cần thiết trong 1 lần. Dùng ngôn ngữ đơn giản.

QUAN TRỌNG: Bỏ câu hỏi khi user đã nói rõ:
- Đã đề cập tên sản phẩm/khóa học cụ thể → bỏ câu hỏi "product"
- Đã nói rõ mục tiêu (thu lead / giới thiệu / sự kiện / dùng thử...) → bỏ "pageGoal"
- Đã nói rõ đối tượng (học viên / doanh nghiệp / phụ huynh...) → bỏ "targetAudience"
- Chỉ có 1 sản phẩm duy nhất trong TÀI NGUYÊN → bỏ "product", tự dùng sản phẩm đó

CÂU HỎI ĐỘNG:
- Nếu có nhiều khóa học/sản phẩm (>1) trong TÀI NGUYÊN VÀ user chưa nói rõ sản phẩm → thêm câu hỏi "product":
  { "id": "product", "label": "Sản phẩm / khóa học muốn quảng bá:", "options": [{ "value": "<id>", "label": "<tên SP>" }, ...tối đa 4 SP đầu..., { "value": "other", "label": "🔧 Sản phẩm khác" }] }

Data structure:
{
  "pageTitle": "Gợi ý tiêu đề trang (ví dụ: Đăng ký khóa Tiếng Anh cho trẻ em)",
  "questions": [
    {
      "id": "product",
      "label": "Sản phẩm / khóa học muốn quảng bá:",
      "options": [{ "value": "<id>", "label": "<tên SP>" }, ...]
    },
    {
      "id": "pageGoal",
      "label": "Mục tiêu của trang là gì?",
      "options": [
        { "value": "lead",    "label": "📋 Thu thập thông tin đăng ký" },
        { "value": "product", "label": "🎯 Giới thiệu sản phẩm / dịch vụ" },
        { "value": "event",   "label": "📅 Đăng ký sự kiện / hội thảo" },
        { "value": "trial",   "label": "🎁 Dùng thử miễn phí / nhận ưu đãi" }
      ]
    },
    {
      "id": "targetAudience",
      "label": "Khách hàng mục tiêu là ai?",
      "options": [
        { "value": "student",      "label": "🎓 Học viên / người muốn học" },
        { "value": "business",     "label": "🏢 Doanh nghiệp / B2B" },
        { "value": "consumer",     "label": "👤 Cá nhân phổ thông" },
        { "value": "parent_child", "label": "👨‍👩‍👧 Phụ huynh & trẻ em" }
      ]
    }
  ]
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
  "type": "text" | "ask_more" | "template_draft" | "content_plan" | "ask_campaign_details" | "confirm_create" | "create_and_run" | "ask_landing_details" | "landing_page",
  "content": "Message to user (${langInstr} — friendly, NO jargon, NO markdown **bold** or *italic*, plain text, use - for bullet points)",
  "missing_fields": [] | ["tên sản phẩm", "mục tiêu email"],
  "data": null | { ... }
}

Khi type="ask_more": content là câu hỏi cụ thể, missing_fields liệt kê những gì cần.
Khi type="template_draft": content mô tả template vừa tạo, data chứa đúng 1 template. Với yêu cầu tạo chi tiết theo content_plan, chỉ tạo đúng slot (ngày + slotIndex) được yêu cầu.
Khi type="content_plan": content là câu dẫn ngắn, data.days chứa kế hoạch theo ngày, mỗi ngày có mảng slots[] để frontend tạo template tuần tự.
Khi type="ask_campaign_details": content là câu dẫn ngắn, data chứa questions để hỏi user.
Khi type="confirm_create": content mô tả chiến dịch bằng ngôn ngữ đơn giản, data.summary chứa thông tin chi tiết.
Khi type="create_and_run": content thông báo đang tạo và chạy campaign tự động, data chứa script.
Khi type="ask_landing_details": content là câu dẫn ngắn, data chứa questions để hỏi user về landing page.
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
- Hẹn giờ / lên lịch chạy chiến dịch (vd: "gửi vào 8h sáng mai", "chạy mỗi tuần") → type: "text", nội dung:
  "Tôi có thể tạo chiến dịch cho bạn ngay. Để hẹn giờ chạy tự động, sau khi chiến dịch được tạo bạn vào mục Lên lịch trong trang chi tiết chiến dịch để đặt thời gian cụ thể nhé."

YÊU CẦU NGOÀI PHẠM VI HOÀN TOÀN:
- Xóa/sửa/dừng chiến dịch cũ, quản lý tài khoản, thanh toán → type: "text", hướng dẫn user vào đúng mục trong menu
- Câu hỏi không liên quan đến marketing/chiến dịch → type: "text", trả lời ngắn gọn và gợi ý những việc AI có thể giúp

### Khi user prompt "tao chien dich [san pham]":
1. Nếu CHƯA có đủ thông tin (kênh, cách gửi...) → type: "ask_campaign_details"
2. Nếu ĐÃ có đủ thông tin (user trả lời xong ask_campaign_details) → type: "confirm_create"
3. Nếu THIẾU thông tin khác (tên sản phẩm, mục tiêu...) → type: "ask_more"

### Khi user prompt "tạo landing page [...]":
1. Nếu CHƯA có đủ thông tin (mục tiêu trang, đối tượng...) → type: "ask_landing_details"
2. Nếu ĐÃ có đủ thông tin (user trả lời xong ask_landing_details hoặc tự cung cấp đủ) → type: "landing_page"
3. KHÔNG dùng ask_more cho landing page

### Sau khi user trả lời ask_landing_details, mô tả nội dung landing page theo:
- product="<id>": dùng tên sản phẩm từ TÀI NGUYÊN để cá nhân hóa nội dung. product="other": dùng tên SP user đề cập
- pageGoal="lead": trang có form đăng ký nổi bật, CTA "Đăng ký ngay / Nhận tư vấn miễn phí"
- pageGoal="product": tập trung tính năng, lợi ích, giá + CTA "Tìm hiểu thêm / Mua ngay"
- pageGoal="event": thông tin sự kiện (ngày, giờ, địa điểm placeholder) + form đăng ký tham gia
- pageGoal="trial": nhấn mạnh miễn phí/ưu đãi + form nhận tài liệu hoặc tư vấn
- targetAudience="student": ngôn ngữ gần gũi, nhấn mạnh lộ trình học, kết quả đầu ra
- targetAudience="business": chuyên nghiệp, số liệu ROI, case study, tiết kiệm chi phí
- targetAudience="consumer": đơn giản, lợi ích thực tế, giá cả rõ ràng, dễ hiểu
- targetAudience="parent_child": ấm áp, an toàn, phát triển toàn diện cho trẻ

### Xử lý các trường hợp đặc biệt:

TẠO CẢ TEMPLATE LẪN CHIẾN DỊCH TRONG 1 YÊU CẦU:
- Khi user muốn vừa tạo template vừa tạo chiến dịch → chỉ tạo confirm_create với emailBody inline đầy đủ
- Hệ thống sẽ tự động lưu email content thành template khi campaign được tạo
- Không cần tạo template_draft riêng trước

EMAIL CÓ GIF / ẢNH ĐỘNG:
- Khi user yêu cầu GIF → chèn thẻ <img> với URL placeholder: https://via.placeholder.com/600x200/FF6B35/FFFFFF?text=GIF+Preview
- Thêm comment HTML: <!-- Thay URL này bằng link GIF thực của bạn -->
- Đề cập trong content: "Bạn cần thay URL ảnh placeholder bằng link GIF thực"

GOOGLE SHEET — URL đã có sẵn:
- Nếu message của user chứa URL https://docs.google.com/spreadsheets/... → KHÔNG hỏi lại, dùng luôn URL đó cho read_sheet
- Format mặc định: sheetName="Sheet1", headerRow=1, dataStartRow=2. Thêm vào nodeDescription: "(Nếu sheet của bạn có tab hoặc cấu trúc khác, hãy chỉnh trong Campaign Builder sau khi tạo)"

GOOGLE SHEET — CHƯA có URL:
- Chỉ áp dụng khi user đã nói rõ "Google Sheet" / "Excel" / "file" / "file sheet" hoặc đã chọn dataSource="sheet". Nếu chưa chọn nguồn dữ liệu, KHÔNG hỏi URL; hãy type="ask_campaign_details" và hỏi dataSource.
- Khi user đã chọn hoặc nói rõ Google Sheet/Excel/file NHƯNG không có URL trong message → BẮT BUỘC type: "ask_more", missing_fields: ["Đường dẫn Google Sheet (URL)"], content: "Bạn vui lòng chia sẻ đường dẫn Google Sheet nhé? URL có dạng: https://docs.google.com/spreadsheets/d/..."
- Chỉ tạo node read_sheet khi đã có URL hợp lệ (bắt đầu bằng https://docs.google.com/spreadsheets/)

UPLOADED FILE (CSV / Excel) — user tải file lên chat:
- Nội dung file đã được trích xuất thành text và gắn trong message → AI CÓ THỂ đọc được các cột và dữ liệu
- Kiểm tra xem file có cột email hoặc phone/sdt không:
  • Nếu CÓ đủ → tạo read_sheet node với sheetUrl="" (placeholder), ghi rõ trong nodeDescription: "(Danh sách lấy từ file tải lên — bạn cần upload file này lên Google Sheet rồi dán URL vào Campaign Builder)" và mention điều này trong content trả về
  • Nếu THIẾU cột quan trọng (không có email/phone) → type: "ask_more", content: "File của bạn không có cột email hoặc số điện thoại. Hệ thống cần ít nhất 1 trong 2 trường này để gửi tin nhắn. Bạn có thể chia sẻ file có đủ thông tin không?"
- KHÔNG dùng dữ liệu trong file trực tiếp như danh sách liên hệ trong campaign (campaign cần URL Google Sheet để fetch khi chạy)

### Sau khi user trả lời ask_campaign_details, build campaign dựa vào:
- channel: email/zalo/zalo_group → chọn đúng action node
- zaloAccount="<id>" → dùng ID đó làm zaloAccountId trong tất cả action/data node Zalo; nếu không có câu hỏi này → dùng tài khoản mặc định (firstZaloAccountId)
- landingPage="<slug>" → dùng slug đó trong landingLeadsSlugs của read_landing_leads
- productCount="nhieu" → nhiều action node, mỗi node 1 sản phẩm khác nhau
- sendingStyle="nhieu_dot" → các action node có delayValue > 0 (3-7 ngày)
- dataSource="db"      → nodeSubtype: "interested_customers", config: { interestedCustomerType: "both", interestedLimit: 1000 }
- dataSource="db" với email cụ thể → nodeSubtype: "interested_customers", config: { interestedCustomerType: "both", interestedLimit: 1000 } — ghi email cụ thể vào description để user tự lọc trong Campaign Builder (interestedCustomerType chỉ nhận "both"|"interested"|"purchased")
- "đã mua [khóa X]" → interestedCustomerType: "purchased", interestedCourseIds: [id_khoaX]
- "chưa mua [khóa X]" → interestedCustomerType: "interested", interestedCourseIds: [id_khoaX]
- "đã mua [khóa X] nhưng chưa mua [khóa Y]" → interestedCustomerType: "purchased", interestedCourseIds: [id_khoaX], notPurchasedCourseIds: [id_khoaY]
- productCount="nhieu" + user đề cập chủ đề/loại sản phẩm (vd: "khóa học AI", "tất cả khóa học") → tìm tất cả ID khóa phù hợp trong danh sách TÀI NGUYÊN và đặt vào interestedCourseIds. Nếu không match khóa nào → để interestedCourseIds: [] (lấy tất cả)
- productCount="1" nhưng user CHƯA nói rõ tên sản phẩm/khóa học → type: "ask_more", missing_fields: ["Tên sản phẩm hoặc khóa học muốn giới thiệu"], message: "Bạn muốn giới thiệu sản phẩm hoặc khóa học nào? Vui lòng cho tôi biết tên nhé!"
- productCount="1" + user đã nói tên sản phẩm/khóa → tìm ID khớp trong TÀI NGUYÊN:
  • Nếu khớp → đặt interestedCourseIds: [id], dùng tên thật từ TÀI NGUYÊN để viết nội dung
  • Nếu KHÔNG khớp (sản phẩm chưa có trong hệ thống):
    - Nếu user CHƯA cung cấp mô tả/thông tin gì về sản phẩm đó → type: "ask_more", missing_fields: ["Thông tin sản phẩm"], message: "Sản phẩm '[tên]' chưa có trong hệ thống. Bạn có thể mô tả ngắn về sản phẩm này không? (ví dụ: mô tả, giá, điểm nổi bật) để tôi viết nội dung phù hợp hơn."
    - Nếu user ĐÃ mô tả sản phẩm → dùng thông tin đó để viết nội dung, interestedCourseIds: [], KHÔNG tạo sản phẩm mới. Ghi chú trong description: "(Sản phẩm chưa có trong hệ thống — gửi đến toàn bộ khách hàng)"
- Dùng ID khóa học từ danh sách "Khóa học / Sản phẩm" ở phần TÀI NGUYÊN CÓ SẴN
- dataSource="sheet" + URL ĐÃ có trong message (https://docs.google.com/spreadsheets/...) → nodeSubtype: "read_sheet", config: { sheetUrl: "<url>", sheetName: "Sheet1", headerRow: 1, dataStartRow: 2 }, thêm ghi chú format trong nodeDescription
- dataSource="sheet" + CHƯA có URL → type: "ask_more", missing_fields: ["Đường dẫn Google Sheet (URL)"], content: "Bạn vui lòng chia sẻ đường dẫn Google Sheet nhé? (URL bắt đầu bằng https://docs.google.com/...)"
- dataSource="landing" + user CHƯA chọn landing page cụ thể + có nhiều landing page trong TÀI NGUYÊN → type: "ask_more", missing_fields: ["Landing page cần lấy leads"], content: "Bạn muốn lấy leads từ landing page nào? (liệt kê tên trang)\n${landingPages.map(lp => `- ${lp.title} (${lp.slug})`).join('\n')}"
- dataSource="landing" + user đã chọn hoặc chỉ có 1 landing page → nodeSubtype: "read_landing_leads", config: { landingLeadsSlugs: ["<slug>"] }
- dataSource="landing" + không có landing page nào → type: "text", content: "Tài khoản chưa có landing page nào. Bạn cần tạo landing page trước để thu thập leads."

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

### Audience và nguồn khách:
- KHÔNG có field audience trong ask_campaign_details; nguồn khách được chọn bằng dataSource.
- KHÔNG bao giờ giả định khách hàng lấy từ file/sheet khi user chưa nói rõ.
- Nếu user chưa nói rõ nguồn khách, hãy hỏi "Lấy danh sách khách từ đâu?" với các lựa chọn db/sheet/landing.

## HEURISTICS CHO type="create_and_run":
- Người dùng nói "tạo chiến dịch", "chạy chiến dịch", "bắt đầu chiến dịch" mà KHÔNG có từ "xem trước", "draft", "thiết kế"
- Người dùng mô tả rõ ràng mục tiêu: "quảng cáo khóa học", "gửi email chào hàng", "chiến dịch bán hàng"
- Người dùng dùng từ khóa: "ngay", "luôn", "bắt đầu ngay", "chạy ngay"
- Nếu thiếu thông tin cơ bản (tên sản phẩm, đối tượng) → vẫn tạo nhưng dùng placeholder có ý nghĩa`;

    const response = await this._runChat(systemPrompt, history, files, userId);
    return this._guardCampaignDataSourceResponse(response, history, locale);
  }

  /**
   * Shared Gemini chat runner — builds history, attaches files, calls API.
   * @param {string} systemPrompt
   * @param {Array}  history  — [{role, content}]
   * @param {Array}  files    — [{tempId, originalName, contentType}]
   */
  async _runChat(systemPrompt, history, files, userId = null) {
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
      const { maxOutputTokens } = await aiUsageMeter.reserve(userId, {
        contents: geminiHistory,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        model: modelName,
        requestedMaxOutputTokens: 8192,
      });

      const { data: result } = await axios.post(url, {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: geminiHistory,
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens },
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 120000 });

      if (!result.candidates || result.candidates.length === 0) {
        if (result.promptFeedback?.blockReason) {
          throw new Error(`Yêu cầu bị chặn: ${result.promptFeedback.blockReason}`);
        }
        throw new Error('AI không phản hồi, vui lòng thử lại.');
      }

      // Filter thought parts (Gemini 2.5 Flash thinking mode) — chỉ lấy output thực sự
      const text = (result.candidates[0].content?.parts || [])
        .filter(p => p.text && !p.thought)
        .map(p => p.text)
        .join('');
      if (!text) throw new Error('AI trả về kết quả rỗng.');

      await aiUsageMeter.record(userId, extractGeminiUsage(result), {
        feature: 'smart_chat',
        model: modelName,
      });
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
      return this._validateWorkflowNodes(this._normalizeParsed(parsed));
    } catch {
      try {
        const sanitized = jsonStr.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (_match, p1) => {
          return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
        });
        return this._validateWorkflowNodes(this._normalizeParsed(JSON.parse(sanitized)));
      } catch {
        // JSON hoàn toàn không parse được → trả về text thay vì crash
        console.warn('[AI] JSON parse failed, falling back to text response');
        return { type: 'text', content: text, data: null, missing_fields: [] };
      }
    }
  }

  _normalizeParsed(parsed) {
    if (parsed.type === 'campaign_script' && parsed.data) {
      parsed.type = 'confirm_create';
      if (!parsed.data.summary) {
        const nodes = parsed.data.nodes || [];
        const visibleNodes = nodes.filter(n => n.nodeType === 'action' || n.nodeType === 'data');
        parsed.data.summary = {
          totalSteps: nodes.length,
          duration: 'N/A',
          steps: visibleNodes.map((n, i) => ({
            step: i + 1,
            action: n.nodeName || n.nodeSubtype,
            timing: n.config?.delayValue
              ? `Sau ${n.config.delayValue} ${n.config.delayUnit || 'ngày'}`
              : 'Ngay lập tức',
          })),
        };
      }
    }
    return parsed;
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

  async processSmartChatV2({ history = [], files = [], userId = null, userRole = 'user', locale = 'vi' }) {
    let contextBlock = '';

    // Lấy existing resources
    let existingResources = '';
    let nodeContext = '';
    let multiStepExample = '';
    let templateSelectionPrompt = '';

    if (userId) {
      try {
        const [emailTemplates, zaloAccounts, zaloGroups, zaloTemplates, recommendedType, customerStats] =
          await Promise.all([
            this.getEmailTemplates(userId),
            this.getZaloAccounts(userId),
            this.getZaloGroups(userId),
            this.getZaloTemplates(userId),
            this.getRecommendedCampaignType(userId),
            this.getCustomerStats(userId),
          ]);

        // Get node context từ registry
        nodeContext = campaignNodeRegistryService.buildNodeContextForAI();
        multiStepExample = campaignNodeRegistryService.buildMultiStepExample();
        templateSelectionPrompt = campaignNodeRegistryService.buildTemplateSelectionPrompt({
          emailTemplates,
          zaloTemplates,
        });

        const firstZaloAccountId = zaloAccounts[0]?.id ?? null;

        // Format Zalo accounts list
        let zaloAccountsList = '  (chưa kết nối)';
        if (zaloAccounts.length > 0) {
          zaloAccountsList = zaloAccounts.map(a => `  - ID: ${a.id} | ${a.displayName}`).join('\n');
        }

        // Format Zalo groups list
        let zaloGroupsList = '';
        if (zaloGroups.length > 0) {
          zaloGroupsList = `👥 Nhóm Zalo:\n${zaloGroups.map(g => `  - "${g.groupName}"`).join('\n')}`;
        }

        existingResources = `
=== TÀI NGUYÊN CÓ SẴN ===
📊 Khách hàng: ${customerStats.total} tổng | ${customerStats.hasEmail} có email | ${customerStats.hasZalo} có Zalo

🔑 Zalo accounts:
${zaloAccountsList}
Tài khoản mặc định: ${firstZaloAccountId ?? 'null'}

${zaloGroupsList}

${templateSelectionPrompt}
`;
      } catch (e) {
        console.warn('[AI V2] Không lấy được resources:', e.message);
      }
    }

    // RAG context
    if (userId && history.length > 0) {
      const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        try {
          contextBlock = await businessProfileService.getContextForPrompt(userId, lastUserMsg.content);
        } catch (e) {
          console.warn('[AI V2] Không lấy được RAG context:', e.message);
        }
        if (!contextBlock) {
          try {
            const profile = await businessProfileService.getProfile(userId);
            contextBlock = businessProfileService.formatProfileForPrompt(profile);
          } catch (e) {
            console.warn('[AI V2] Không lấy được business profile:', e.message);
          }
        }
      }
    }

    const langInstrV2 = this._langInstruction(locale);
    const systemPrompt = `Bạn là Founder AI Coworker - Trợ lý Marketing thông minh, chuyên hỗ trợ tạo chiến dịch marketing với multi-step support.

## NGÔN NGỮ:
- ${langInstrV2}

## NGUYÊN TẮC QUAN TRỌNG NHẤT:
- KHÔNG BAO GIỜ tự bịa thông tin về sản phẩm, doanh nghiệp, tên công ty, giá cả, khuyến mãi.
- Luôn ưu tiên dùng template có sẵn nếu phù hợp.
- Nếu KHÔNG có template phù hợp → tự soạn nội dung inline.
- MỘT NODE CÓ THỂ GỬI NHIỀU EMAIL/ZALO cách nhau thời gian (multi-step trong 1 node).

${contextBlock ? contextBlock + '\n\n' : ''}${existingResources ? existingResources + '\n\n' : ''}${nodeContext}

${multiStepExample}

## LUẬT CHỌN/GỬI TEMPLATE:
1. Ưu tiên template có sẵn nếu phù hợp với mục tiêu chiến dịch
2. Nếu KHÔNG có template phù hợp → tự soạn nội dung inline
3. Nội dung inline PHẢI có:
   - Email: emailSubject + emailBody (HTML đẹp, có CTA)
   - Zalo: message (dưới 4000 ký tự, có biến {{variable}})
4. Luôn thêm templateMappings cho các biến động như {{full_name}}, {{product_name}}
5. KHÔNG dùng placeholder như "[TÊN_SẢN_PHẨM]" - phải điền thực

## LUẬT PHÂN LOẠI Ý ĐỊNH (intent):

### 1. type: "text"
Khi người dùng: chào hỏi, hỏi thông tin chung, thảo luận.

### 2. type: "ask_more"
Khi thiếu thông tin cần thiết để tạo chiến dịch. Hỏi cụ thể những gì còn thiếu.

### 3. type: "confirm_create"
Khi đã có đủ thông tin và tạo xong script. Hiển thị summary và hỏi xác nhận.

### 4. type: "campaign_script"
Khi tạo xong script và muốn user xem trước.

### 5. type: "create_and_run"
Khi muốn TẠO VÀ CHẠY NGAY - không cần xác nhận.

### 6. type: "landing_page"
Khi muốn tạo Landing Page.

## 3 CHIẾN DỊCH TÁCH BIỆT (KHÔNG BAO GIỜ GỘP):
1. Gmail (Email) - dùng action/send_email với emailSteps[]
2. Zalo cá nhân - dùng action/send_zalo_personal với zaloPersonalTemplateSteps[]
3. Zalo nhóm - dùng action/send_zalo_group với zaloGroupTemplateSteps[]

## HEURISTICS CHO create_and_run:
- Người dùng nói "tạo và chạy", "bắt đầu ngay", "chạy ngay"
- Người dùng mô tả rõ ràng mục tiêu
- Nếu thiếu thông tin cơ bản → vẫn tạo nhưng dùng placeholder có ý nghĩa
`;

    return this._runChat(systemPrompt, history, files, userId);
  }

  /**
   * Shared Gemini chat runner — builds history, attaches files, calls API.
   * @param {string} systemPrompt
   * @param {Array}  history  — [{role, content}]
   * @param {Array}  files    — [{tempId, originalName, contentType}]
   */
  async _runChat(systemPrompt, history, files, userId = null) {
    const googleUrlCache = new Map();

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

    // Build Gemini history — re-attach files + Google URLs từ TẤT CẢ tin nhắn trong lịch sử
    const geminiHistory = await Promise.all(history.map(async (msg) => {
      const parts = [{ text: msg.content || '(no text)' }];
      if (msg.role === 'user') {
        if (Array.isArray(msg.files) && msg.files.length > 0) {
          for (const file of msg.files) {
            await attachFileToParts(parts, file);
          }
        }
        await attachGoogleUrlParts(parts, msg.content, googleUrlCache);
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
      const { maxOutputTokens } = await aiUsageMeter.reserve(userId, {
        contents: geminiHistory,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        model: modelName,
        requestedMaxOutputTokens: 8192,
      });

      const { data: result } = await axios.post(url, {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: geminiHistory,
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens },
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 120000 });

      if (!result.candidates || result.candidates.length === 0) {
        if (result.promptFeedback?.blockReason) {
          throw new Error(`Yêu cầu bị chặn: ${result.promptFeedback.blockReason}`);
        }
        throw new Error('AI không phản hồi, vui lòng thử lại.');
      }

      const text = result.candidates[0].content?.parts?.[0]?.text;
      if (!text) throw new Error('AI trả về kết quả rỗng.');

      console.log('[AI Chat] Gemini response (first 500 chars):', text.substring(0, 500));
      await aiUsageMeter.record(userId, extractGeminiUsage(result), {
        feature: 'smart_chat',
        model: modelName,
      });
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
   * Generate campaign using Node Registry for multi-step support.
   * Sử dụng campaignNodeRegistryService để AI hiểu rõ về các node types và multi-step.
   */
  async generateCampaignWithRegistry({ prompt, files = [], userId = null }) {
    const parts = [];

    // Get business context
    let ragContext = '';
    if (userId) {
      try {
        ragContext = await businessProfileService.getContextForPrompt(userId, prompt);
      } catch (e) {
        console.warn('[AI Registry] Không lấy được RAG context:', e.message);
      }
    }

    // Get existing resources
    let existingResources = '';
    if (userId) {
      try {
        const [emailTemplates, zaloAccounts, zaloTemplates, recommendedType, customerStats] =
          await Promise.all([
            this.getEmailTemplates(userId),
            this.getZaloAccounts(userId),
            this.getZaloTemplates(userId),
            this.getRecommendedCampaignType(userId),
            this.getCustomerStats(userId),
          ]);

        // Build template selection prompt
        const templateSelectionPrompt = campaignNodeRegistryService.buildTemplateSelectionPrompt({
          emailTemplates,
          zaloTemplates,
        });

        existingResources = `
=== TÀI NGUYÊN CÓ SẴN ===
📊 Khách hàng: ${customerStats.total} tổng | ${customerStats.hasEmail} có email | ${customerStats.hasZalo} có Zalo
🔑 Zalo accounts: ${zaloAccounts.length > 0 ? zaloAccounts.map(a => `${a.id}: ${a.displayName}`).join(', ') : 'chưa kết nối'}
Kênh khuyến nghị: ${recommendedType}

${templateSelectionPrompt}
`;
      } catch (e) {
        console.warn('[AI Registry] Không lấy được resources:', e.message);
      }
    }

    // Get node context from registry
    const nodeContext = campaignNodeRegistryService.buildNodeContextForAI();
    const multiStepExample = campaignNodeRegistryService.buildMultiStepExample();

    // Build system prompt
    const systemPrompt = `Bạn là chuyên gia Marketing Automation. Nhiệm vụ: tạo JSONchiến dịch hoàn chỉnh từ yêu cầu.

${ragContext ? ragContext + '\n\n' : ''}${existingResources ? existingResources + '\n\n' : ''}${nodeContext}

${multiStepExample}

QUY TẮC QUAN TRỌNG:
1. MỘT NODE CÓ THỂ GỬI NHIỀU EMAIL/ZALO - dùng emailSteps[] hoặc zaloPersonalTemplateSteps[]
2. KHÔNG tạo nhiều node send_email/send_zalo riêng cho mỗi tin
3. Delay đặt trong delayValue + delayUnit CỦA MỖI STEP trong array
4. Nếu thiếu thông tin cần thiết → hỏi user trước khi tạo
5. Luôn điền đầy đủ config, không để null cho các trường bắt buộc

Yêu cầu từ user: "${prompt}"

Trả về JSON hoàn chỉnh theo cấu trúc campaign.`;

    parts.push({ text: systemPrompt });

    // Attach files
    for (const file of files) {
      try {
        const buffer = await uploadController.readTempFileBuffer(file.tempId, file.originalName);
        const mimeType = String(file.contentType || '').toLowerCase();
        if (mimeType.startsWith('image/')) {
          parts.push({ inlineData: { mimeType: file.contentType, data: buffer.toString('base64') } });
        } else {
          const extractedText = await extractTextFromBuffer(buffer, file.originalName, file.contentType);
          if (extractedText.trim()) {
            parts.push({ text: `[File: ${file.originalName}]:\n${extractedText}` });
          }
        }
      } catch (err) {
        console.warn(`[AI Registry] Could not read file:`, err.message);
      }
    }

    console.log(`[AI Registry] Sending prompt to Gemini...`);
    const { text } = await aiUsageMeter.generateWithBudget(userId, {
      parts,
      jsonMode: true,
      temperature: 0.8,
      maxOutputTokens: 16384,
      feature: 'campaign_registry',
    });
    console.log(`[AI Registry] Response received (${text?.length || 0} chars)`);

    return this._parseJson(text);
  }

  /**
   * Validate campaign script before saving
   */
  validateCampaignScript(script) {
    const errors = [];
    const warnings = [];

    if (!script.nodes || !Array.isArray(script.nodes)) {
      errors.push('Thiếu danh sách nodes');
      return { valid: false, errors, warnings };
    }

    if (!script.connections || !Array.isArray(script.connections)) {
      errors.push('Thiếu danh sách connections');
    }

    // Check each node
    for (const node of script.nodes) {
      const validation = campaignNodeRegistryService.validateNodeConfig(node.nodeSubtype, node.config || {});
      if (!validation.valid) {
        warnings.push(`Node "${node.nodeName}": ${validation.errors.join(', ')}`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
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
      // Normalize: đổi "text" hoặc "response" thành "content" để frontend đọc được
      if (parsed.text && !parsed.content) {
        parsed.content = parsed.text;
        delete parsed.text;
      }
      if (parsed.response && !parsed.content) {
        parsed.content = parsed.response;
        delete parsed.response;
      }
      // Handle {"intent":{"type":"..."}, ...} format - extract type from intent
      if (parsed.intent?.type && !parsed.type) {
        parsed.type = parsed.intent.type;
        delete parsed.intent;
      }
      
      // Nếu AI trả về campaign script trực tiếp (không có type), wrap lại đúng format
      const hasCampaignScript = parsed.nodes && parsed.connections && parsed.campaignName;
      const hasOnlyScriptData = !parsed.type && (parsed.campaignName || parsed.nodes);
      
      if (hasOnlyScriptData) {
        // AI trả về campaign script trực tiếp - wrap lại
        return {
          type: parsed.type || 'campaign_script',
          content: parsed.content || `Chiến dịch "${parsed.campaignName}" đã được tạo.`,
          data: parsed,
        };
      }
      
      // Validate: nếu không có type, mặc định là "text" cho text content
      if (!parsed.type) {
        parsed.type = 'text';
      }
      // Validate: must have DATA nodes
      return this._validateWorkflowNodes(parsed);
    } catch {
      const sanitized = jsonStr.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (match, p1) => {
        return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
      });
      const parsed = JSON.parse(sanitized);
      if (parsed.text && !parsed.content) {
        parsed.content = parsed.text;
        delete parsed.text;
      }
      if (parsed.response && !parsed.content) {
        parsed.content = parsed.response;
        delete parsed.response;
      }
      // Handle {"intent":{"type":"..."}, ...} format
      if (parsed.intent?.type && !parsed.type) {
        parsed.type = parsed.intent.type;
        delete parsed.intent;
      }
      
      // Nếu AI trả về campaign script trực tiếp, wrap lại
      const hasCampaignScript = parsed.nodes && parsed.connections && parsed.campaignName;
      const hasOnlyScriptData = !parsed.type && (parsed.campaignName || parsed.nodes);
      
      if (hasOnlyScriptData) {
        return {
          type: parsed.type || 'campaign_script',
          content: parsed.content || `Chiến dịch "${parsed.campaignName}" đã được tạo.`,
          data: parsed,
        };
      }
      
      if (!parsed.type) {
        parsed.type = 'text';
      }
      return this._validateWorkflowNodes(parsed);
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
