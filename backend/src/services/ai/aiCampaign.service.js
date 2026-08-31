import businessProfileService from './businessProfile.service.js';
import { buildAdminContext } from './adminContext.service.js';
import landingTemplateService from '../landingTemplate/landingTemplate.service.js';
import uploadController from '../../controllers/upload.controller.js';
import { extractTextFromBuffer } from '../../utils/fileParser.util.js';
import aiUsageMeter from './aiUsageMeter.service.js';
import aiPromptResources from './aiPromptResources.service.js';
import { runChat } from './aiChatTransport.service.js';
import { parseAiJson } from '../../utils/aiJsonParse.util.js';
import { checkSheetForChannel } from './sheetRecipientCheck.service.js';
import {
  lastUserMessageContent,
  hasExplicitCustomerSource,
  looksLikeCampaignRequest,
  asksOnlyForGoogleSheet,
  isMultiDaySeriesRequest,
  looksLikeInlineSeriesDraft,
  countSuggestContentPlan,
  buildAssistantLanguageInstructions,
} from '../../utils/campaignIntent.util.js';
import {
  resolveAssistantLocaleContext,
  normalizeAssistantLocale,
  isLandingOrientedTurn,
} from '../../utils/assistantLocale.util.js';
import {
  evaluateNextGate,
  extractWizardState,
  findOriginalCampaignPrompt,
  buildCampaignPromptWithWizardState,
  buildDataSourceQuestion,
  computeWizardMeta,
  isContentPlanRevisionText,
  mergeWizardState,
  normalizeWizardState,
  parseWizardMarker,
  isPlanTemplateDraftRequest,
  isWizardMarkerMessage,
  isPlanCancelText,
  createEmptyWizardState,
  normalizeChannel,
  shouldGuardCampaignResponse,
  withDeadEndNudge,
  PLAN_APPROVE_TEXT_RE,
} from './aiCampaignWizard.service.js';
import {
  extractCampaignBriefFromHistory,
  mergeCampaignBrief,
  isCampaignBriefReady,
  resolveCampaignBrief,
  clearCampaignBriefProductFacts,
  createEmptyCampaignBrief,
  analyzeFileSuitability,
  MAX_STORED_FILE_TEXT_CHARS,
} from './campaignBrief.service.js';
import {
  isQuickSendRequest,
  inferCampaignBriefFromText,
  inferQuickSendChannel,
  isCampaignScriptShaped,
  pickChannelByExplicitSignal,
} from '../../utils/campaignQuickSend.util.js';
import { runShadowIntentExtraction } from './intentExtractor.service.js';
import { runCompilerShadowCompare } from './campaignCompilerShadow.service.js';
import campaignNodeRegistryService from '../campaign/campaignNodeRegistry.service.js';
import aiCampaignDraftService from './aiCampaignDraft.service.js';

export const USER_CONFIRMS_FILE_RE = /vẫn\s*dùng|van\s*dung|cứ\s*tiếp\s*tục|cu\s*tiep\s*tuc|dùng\s*(?:file|tệp|này|luôn|đi)|tiếp\s*tục|tiep\s*tuc|làm\s*tiếp|lam\s*tiep|cứ\s*làm|cu\s*lam|proceed|continue/i;

export function isUserConfirmingFile(text = '') {
  const trimmed = String(text || '').trim();
  return USER_CONFIRMS_FILE_RE.test(trimmed) || PLAN_APPROVE_TEXT_RE.test(trimmed);
}

class AiCampaignService {
  /**
   * Generate campaign JSON structure from prompt and files.
   */
  async generateCampaignScript({ prompt, files = [], userId = null, brief = null }) {
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
            aiPromptResources.getEmailTemplates(userId),
            aiPromptResources.getZaloAccounts(userId),
            aiPromptResources.getZaloGroups(userId),
            aiPromptResources.getZaloTemplates(userId),
            aiPromptResources.getRecommendedCampaignType(userId),
          ]);

        const connectedZaloAccount = zaloAccounts.find(
          (a) => (a.status === 'connected' || !a.status) && a.isActive !== false && a.is_active !== false
        );
        const firstZaloAccountId = connectedZaloAccount?.id ?? null;

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
  config: { "sheetUrl": "...", "headerRow": 1, "dataStartRow": 2 }

• nodeType: "data", nodeSubtype: "read_landing_leads"     ← leads từ landing page
  config: { "landingLeadsSlugs": ["slug-landing-page"] }  ← [] = lấy tất cả leads; điền slug từ danh sách Landing Pages trong TÀI NGUYÊN CÓ SẴN

• nodeType: "data", nodeSubtype: "select_zalo_account"   ← BẮT BUỘC trong MỌI chiến dịch Zalo, đặt trước node gửi
  config: { "zaloAccountId": <ID_TK_ZALO> }

• nodeType: "data", nodeSubtype: "get_all_friends"        ← lấy danh sách bạn bè Zalo
  config: { "zaloFriendAccountNodeId": "<tempId_của_select_zalo_account>" }

• nodeType: "data", nodeSubtype: "get_all_groups"         ← lấy danh sách nhóm Zalo
  config: { "zaloGroupAccountNodeId": "<tempId_của_select_zalo_account>" }

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

• nodeType: "action", nodeSubtype: "send_zalo_personal"   ← gửi Zalo theo danh sách bạn bè / UID
  (khi nguồn là zalo_contacts hoặc get_all_friends → dùng uid thay phone)
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
  4 LUỒNG CHIẾN DỊCH CHUẨN
════════════════════════════════════════

A. EMAIL:
   trigger → interested_customers → send_email(delay:0) → send_email(delay:3d) → end

B. ZALO CÁ NHÂN (từ danh sách khách hàng / dataSource="db"):
   trigger → select_zalo_account → interested_customers → send_zalo_personal(delay:0) → send_zalo_personal(delay:2d) → end

C. ZALO CÁ NHÂN (từ danh bạ bạn bè / dataSource="zalo_contacts"):
   trigger → select_zalo_account → send_zalo_personal(uid,delay:0) → end

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

=== ZALO NHÓM (lấy nhóm từ tài khoản, 2 tin trong 1 node) ===
{
  "campaignName": "...", "description": "...", "campaignType": "zalo_group", "isAiDraft": true,
  "nodes": [
    { "tempId": "n1", "nodeType": "trigger", "nodeSubtype": "manual", "nodeName": "Bắt đầu", "nodeDescription": "", "positionX": 100, "positionY": 200, "config": {} },
    { "tempId": "n2", "nodeType": "data", "nodeSubtype": "select_zalo_account", "nodeName": "Chọn tài khoản Zalo", "nodeDescription": "Tài khoản gửi tin nhóm", "positionX": 350, "positionY": 200, "config": { "zaloAccountId": null } },
    { "tempId": "n3", "nodeType": "data", "nodeSubtype": "get_all_groups", "nodeName": "Lấy danh sách nhóm", "nodeDescription": "Lấy tất cả nhóm từ tài khoản", "positionX": 600, "positionY": 200, "config": { "zaloGroupAccountNodeId": "n2" } },
    { "tempId": "n4", "nodeType": "action", "nodeSubtype": "send_zalo_group", "nodeName": "Gửi nhóm tin Zalo", "nodeDescription": "Gửi chuỗi 2 tin nhắn", "positionX": 850, "positionY": 200, "config": { "zaloAccountId": null, "zaloGroupSource": "node", "zaloGroupNodeId": "n3", "zaloGroupField": "groupId", "saveMessageLog": true, "zaloGroupTemplateSteps": [ { "message": "📢 Thông báo quan trọng từ chúng tôi...", "delayValue": 0, "delayUnit": "days", "templateMappings": [] }, { "message": "🎉 Cập nhật mới nhất và ưu đãi dành cho nhóm...", "delayValue": 1, "delayUnit": "days", "templateMappings": [] } ] } },
    { "tempId": "n5", "nodeType": "end", "nodeSubtype": "end", "nodeName": "Kết thúc", "nodeDescription": "", "positionX": 1100, "positionY": 200, "config": {} }
  ],
  "connections": [
    { "sourceNodeId": "n1", "targetNodeId": "n2" },
    { "sourceNodeId": "n2", "targetNodeId": "n3" },
    { "sourceNodeId": "n3", "targetNodeId": "n4" },
    { "sourceNodeId": "n4", "targetNodeId": "n5" }
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

    if ((!files || files.length === 0) && brief?.attachedFile?.text) {
      parts.push({
        text: `[Nội dung tệp đính kèm: "${brief.attachedFile.originalName || 'Tài liệu'}"]:\n${brief.attachedFile.text}\n${brief.attachedFile.truncated ? '[Lưu ý: Tệp đính kèm dài đã được rút gọn để xử lý nhanh hơn]\n' : ''}[Hết nội dung tệp: "${brief.attachedFile.originalName || 'Tài liệu'}"]`,
      });
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

    return parseAiJson(text);
  }

  _guardCampaignDataSourceResponse(response, history = [], locale = 'vi', gateState = null) {
    const lastUserText = lastUserMessageContent(history);
    if (
      looksLikeCampaignRequest(lastUserText)
      && asksOnlyForGoogleSheet(response)
      && !hasExplicitCustomerSource(lastUserText)
    ) {
      return buildDataSourceQuestion(locale, gateState);
    }
    return response;
  }

  _guardContentPlanResponse(response, history = [], brief = null, intent = null) {
    if (response?.type === 'content_plan') return response;
    if (intent === 'content_plan_request') return response;

    // Hard brake (phanh cứng chống lặp): từ 1 lần suggest_content_plan trở lên trong history thì không bọc lại
    if (countSuggestContentPlan(history) >= 1) return response;

    const lastUserText = lastUserMessageContent(history);
    const sourcePrompt = findOriginalCampaignPrompt(history);
    const quickSend = brief?.flowMode === 'quick_send'
      || isQuickSendRequest(sourcePrompt)
      || isQuickSendRequest(lastUserText);
    if (quickSend) return response;

    if (!isMultiDaySeriesRequest(lastUserText)) return response;

    if (response?.type === 'text' && looksLikeInlineSeriesDraft(response.content)) {
      return {
        type: 'suggest_content_plan',
        content: response.content,
        data: { userPrompt: lastUserText },
        missing_fields: [],
      };
    }
    return response;
  }

  /**
   * Quick-send must confirm before run. "gửi nhanh" alone is not create_and_run.
   * Never escalate quick-send into a content_plan series unless payload is script-shaped.
   */
  _guardQuickSendResponse(response, history = [], brief = null) {
    const lastUserText = lastUserMessageContent(history);
    const sourcePrompt = findOriginalCampaignPrompt(history);
    const quickSend = brief?.flowMode === 'quick_send'
      || isQuickSendRequest(sourcePrompt)
      || isQuickSendRequest(lastUserText);
    if (!quickSend || !response) return response;

    if (response.type === 'content_plan' || response.type === 'suggest_content_plan') {
      // Only retype when FE can actually prepare/create — never fake confirm from {days,...}.
      if (isCampaignScriptShaped(response.data)) {
        return {
          ...response,
          type: 'confirm_create',
          data: { ...response.data, autoRun: false },
        };
      }
      return {
        type: 'text',
        content: response.content
          || 'Mình sẽ soạn một email gửi một lần. Bạn cho thêm nguồn khách (hoặc xác nhận các bước còn thiếu) nhé.',
        missing_fields: [],
        data: null,
      };
    }

    if (response.type === 'create_and_run') {
      const EXPLICIT_CREATE_AND_RUN = /tạo\s*và\s*chạy|tao\s*va\s*chay|create\s*and\s*run|auto\s*-?\s*run|chạy\s*ngay\s*(?:chiến\s*dịch|chien\s*dich|campaign)|chay\s*ngay\s*(?:chien\s*dich|campaign)/i;
      if (EXPLICIT_CREATE_AND_RUN.test(lastUserText) || EXPLICIT_CREATE_AND_RUN.test(sourcePrompt)) {
        return response;
      }
      return {
        ...response,
        type: 'confirm_create',
        data: response.data && typeof response.data === 'object'
          ? { ...response.data, autoRun: false }
          : response.data,
      };
    }

    return response;
  }

  /**
   * M2: manual recipient source must never auto-run without private directRecipients overlay.
   * Always downgrade to confirm_create so FE opens prepare + recipient overlay.
   */
  _guardManualRecipientsNoAutoRun(response, gates = null) {
    if (response?.type !== 'create_and_run') return response;
    const data = response.data && typeof response.data === 'object' ? response.data : null;
    const manualFromGate = gates?.dataSource === 'manual';
    const manualFromScript = data?.wizardDataSource === 'manual'
      || (Array.isArray(data?.nodes) && data.nodes.some((node) => {
        const config = node?.config || {};
        return config.recipientSource === 'manual' || config.zaloRecipientSource === 'manual';
      }));
    if (!manualFromGate && !manualFromScript) return response;
    return {
      ...response,
      type: 'confirm_create',
      data: data
        ? { ...data, autoRun: false, wizardDataSource: data.wizardDataSource || 'manual' }
        : { autoRun: false, wizardDataSource: 'manual' },
    };
  }

  async _getWizardResources(userId) {
    if (!userId) return { zaloAccounts: [], emailSenders: [], courses: [] };
    const [zaloAccounts, emailSenders, courses] = await Promise.all([
      aiPromptResources.getZaloAccountsFull(userId),
      aiPromptResources.getActiveEmailSenders(userId),
      aiPromptResources.getCourses(userId),
    ]);
    return { zaloAccounts, emailSenders, courses };
  }

  // mergedGates: state đã merge persisted + derived (bước wizard-state DB); nếu không
  // truyền thì tự derive từ history — tương đương behavior cũ.
  // Return { response, gateAsked } để caller persist meta dead-end.
  _guardWizardGates(response, history = [], resources = {}, locale = 'vi', mergedGates = null) {
    const lastUserText = lastUserMessageContent(history);
    if (isPlanTemplateDraftRequest(lastUserText)) return { response, gateAsked: null };
    if (!shouldGuardCampaignResponse(response)) return { response, gateAsked: null };

    const state = { ...(mergedGates || extractWizardState(history)) };
    state.isCampaignFlow = true;
    state.channel ||= normalizeChannel(
      response?.data?.campaignType
      || response?.data?.channel
      || response?.data?.days?.[0]?.channel
      || response?.data?.days?.[0]?.slots?.[0]?.channel
    );

    const nextGate = evaluateNextGate(state, resources, locale);
    if (!nextGate && response?.type === 'content_plan') {
      return {
        response: {
          ...response,
          data: {
            ...(response.data || {}),
            requiresApproval: true,
          },
        },
        gateAsked: null,
      };
    }
    if (response?.type === 'content_plan' && nextGate?.gate === 'planApproved') {
      return {
        response: {
          ...response,
          data: {
            ...(response.data || {}),
            requiresApproval: true,
          },
        },
        gateAsked: 'planApproved',
      };
    }
    if (nextGate?.response) {
      return { response: nextGate.response, gateAsked: nextGate.gate || null };
    }
    return { response, gateAsked: null };
  }

  async processSmartChat({
    history = [],
    files = [],
    userId = null,
    resourceOwnerUserId = null,
    userRole = 'user',
    locale = 'vi',
    localeContext = null,
    model = null,
    persistedWizardState = null,
    intent = null,
    planSlotKey = null,
    helpRoute = null,
    routeSaysActionRequest = false,
  }) {
    let contextBlock = '';
    // Tenant resources (courses, templates, profile) belong to workspace owner;
    // chat metering/session stay on actor userId.
    const ownerId = resourceOwnerUserId || userId;
    const uiLocale = normalizeAssistantLocale(localeContext?.uiLocale || locale, 'vi');

    if (userRole === 'admin') {
      // Super admin: inject số liệu nền tảng real-time
      try {
        contextBlock = await buildAdminContext();
      } catch (e) {
        console.warn('[AI] Không lấy được admin context:', e.message);
      }

      const adminLocaleContext = localeContext || resolveAssistantLocaleContext({
        history,
        uiLocale,
        persistedConversationLocale: null,
        briefContentLocale: null,
      });
      const langInstr = buildAssistantLanguageInstructions(adminLocaleContext);
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

      return runChat({ systemPrompt: adminSystemPrompt, history, files, userId, requestedModel: model });
    }

    const wizardResources = await this._getWizardResources(ownerId);
    const lastUserText = lastUserMessageContent(history);

    // Wizard state: merge bản persist trong DB (sống sót qua reload) với bản derive
    // từ history của request này (marker tường minh luôn thắng).
    const persistedState = normalizeWizardState(persistedWizardState);
    const derivedState = extractWizardState(history, {
      routeSaysActionRequest,
      intent,
      abandonedAtMessageCount: persistedState.gates?.abandonedAtMessageCount,
      files,
    });
    const mergedGates = mergeWizardState(persistedState.gates, derivedState, { lastUserText });

    // PR-3: Shadow Intent Extraction (GĐ 1: chỉ chạy song song và ghi log, không can thiệp luồng)
    if (process.env.INTENT_SHADOW_ENABLED === 'true' && lastUserText) {
      runShadowIntentExtraction({
        text: lastUserText,
        locale: uiLocale,
        model,
        regexState: derivedState,
        turn: Array.isArray(history) ? history.length : 0,
      }).catch((err) => {
        console.warn('[IntentShadow] Background shadow extraction error:', err?.message || err);
      });
    }

    const isRevision = isContentPlanRevisionText(lastUserText);

    const hasAnyAttachedFile = Boolean(derivedState.hasAttachedFile);
    const hasAnyAttachedSpreadsheet = Boolean(derivedState.hasAttachedSpreadsheet);

    const campaignBriefContentLocale = isLandingOrientedTurn(history)
      ? null
      : (persistedState.brief?.contentLocale || null);
    let resolvedLocaleContext;
    if (localeContext) {
      resolvedLocaleContext = { ...localeContext };
      if (
        resolvedLocaleContext.contentLocaleSource !== 'explicit'
        && (campaignBriefContentLocale === 'vi' || campaignBriefContentLocale === 'en')
      ) {
        resolvedLocaleContext = {
          ...resolvedLocaleContext,
          contentLocale: campaignBriefContentLocale,
          contentLocaleSource: 'brief',
        };
      }
    } else {
      resolvedLocaleContext = resolveAssistantLocaleContext({
        history,
        uiLocale,
        persistedConversationLocale: persistedState.meta?.conversationLocale || null,
        briefContentLocale: campaignBriefContentLocale,
      });
    }
    // Cards / deterministic copy follow UI (locale arg); prose+artifact follow resolved context.
    const defaultContentLocale = resolvedLocaleContext.contentLocale;
    const conversationLocale = resolvedLocaleContext.conversationLocale;

    const sourcePrompt = findOriginalCampaignPrompt(history);
    const extracted = extractCampaignBriefFromHistory(history);
    let resolvedBriefContext = '';
    let briefStale = false;
    let briefForState;
    let contentLocaleNeedsPlanReset = false;

    let extractedAttachedFile = null;
    if (Array.isArray(files) && files.length > 0) {
      for (const file of files) {
        if (!file?.tempId) continue;
        const mimeType = String(file.contentType || '').toLowerCase();
        if (mimeType.startsWith('image/')) {
          extractedAttachedFile = {
            originalName: file.originalName,
            contentType: file.contentType,
            text: '',
            isImage: true,
            hasProductData: null,
            summary: 'Ảnh — nội dung do AI đọc trực tiếp',
            userConfirmed: false,
            extractedAt: new Date().toISOString(),
          };
          break;
        }
        try {
          // eslint-disable-next-line no-await-in-loop
          const buffer = await uploadController.readTempFileBuffer(file.tempId, file.originalName);
          if (buffer) {
            // eslint-disable-next-line no-await-in-loop
            const fullText = await extractTextFromBuffer(buffer, file.originalName, file.contentType);
            if (fullText && fullText.trim()) {
              const isTruncated = fullText.length > MAX_STORED_FILE_TEXT_CHARS;
              const truncatedText = isTruncated ? fullText.slice(0, MAX_STORED_FILE_TEXT_CHARS) : fullText;
              const suitability = analyzeFileSuitability(truncatedText, file.originalName);
              extractedAttachedFile = {
                originalName: file.originalName,
                contentType: file.contentType,
                text: truncatedText,
                truncated: isTruncated,
                totalCharCount: fullText.length,
                extractedAt: new Date().toISOString(),
                hasProductData: suitability.hasProductData,
                summary: suitability.summary,
                userConfirmed: false,
              };
              break;
            }
          }
        } catch (err) {
          console.warn(`[AI] Could not extract text from file ${file.tempId}:`, err.message);
        }
      }
    }

    if (extracted.invalid) {
      // Latest marker authoritative — never fall back to older/persisted brief facts.
      briefForState = clearCampaignBriefProductFacts({
        contentMode: extracted.preferredContentMode,
        contentLocale: defaultContentLocale,
      });
    } else {
      const mergedBrief = mergeCampaignBrief(persistedState.brief, extracted.brief, {
        defaultContentLocale,
      });
      if (!mergedBrief.contentLocale) {
        mergedBrief.contentLocale = defaultContentLocale;
      }
      briefForState = mergedBrief;
    }

    if (extractedAttachedFile) {
      briefForState = {
        ...briefForState,
        attachedFile: extractedAttachedFile,
        hasAttachedFile: true,
      };
    } else if (persistedState.brief?.attachedFile) {
      const existing = persistedState.brief.attachedFile;
      const userConfirms = isUserConfirmingFile(lastUserText);
      briefForState = {
        ...briefForState,
        attachedFile: {
          ...existing,
          userConfirmed: existing.userConfirmed || userConfirms,
        },
        hasAttachedFile: true,
      };
    } else if (hasAnyAttachedFile && briefForState) {
      briefForState = { ...briefForState, hasAttachedFile: true };
    }

    // Explicit artifact-language directive updates brief content locale before resolve/gates.
    if (resolvedLocaleContext.contentLocaleSource === 'explicit' && briefForState) {
      const beforeLocale = briefForState.contentLocale || persistedState.brief?.contentLocale || null;
      const nextLocale = resolvedLocaleContext.contentLocale;
      if (beforeLocale !== nextLocale) {
        contentLocaleNeedsPlanReset = Boolean(
          persistedState.plan?.snapshot || mergedGates.hasContentPlan
        );
      }
      briefForState = { ...briefForState, contentLocale: nextLocale };
    }

    // PR-B quick-send: once schedule + optional inferred brief; multi-day already excluded.
    // Latest free-text campaign intent from extractWizardState wins over older quick-send.
    const quickSendActive = derivedState.latestIntentIsQuickSend === true;
    const intentPrompt = sourcePrompt || lastUserText;

    if (quickSendActive) {
      const scheduleFromMarker = Array.isArray(derivedState.markerGates)
        && derivedState.markerGates.includes('schedule');
      if (!scheduleFromMarker) {
        mergedGates.schedule = { mode: 'once' };
      }
      if (!mergedGates.channel) {
        mergedGates.channel = inferQuickSendChannel(intentPrompt);
      }
      briefForState = {
        ...(briefForState || createEmptyCampaignBrief(defaultContentLocale)),
        flowMode: 'quick_send',
      };
      if (!extracted.invalid && !isCampaignBriefReady(briefForState)) {
        const inferred = inferCampaignBriefFromText(intentPrompt, wizardResources.courses);
        if (inferred) {
          briefForState = mergeCampaignBrief(
            briefForState,
            { ...inferred, flowMode: 'quick_send', contentLocale: defaultContentLocale },
            { defaultContentLocale }
          );
          if (!briefForState.contentLocale) {
            briefForState.contentLocale = defaultContentLocale;
          }
        }
      }
      if (!briefForState.contentLocale) {
        briefForState.contentLocale = defaultContentLocale;
      }
    } else if (derivedState.latestIntentIsQuickSend === false && briefForState?.flowMode === 'quick_send') {
      // Explicit non-quick latest intent (e.g. switched to drip) — reset sticky flowMode.
      // latestIntentIsQuickSend === null (marker-only / truncated history) must keep persisted quick_send.
      briefForState = { ...briefForState, flowMode: 'standard' };
      if (!derivedState.markerGates?.includes('schedule')) {
        mergedGates.schedule = derivedState.schedule ?? mergedGates.schedule;
      }
    }

    if (!extracted.invalid && isCampaignBriefReady(briefForState)) {
      try {
        const resolved = await resolveCampaignBrief({
          brief: briefForState,
          ownerUserId: ownerId,
          sourcePrompt,
          catalogCourses: wizardResources.courses,
        });
        briefForState = resolved.brief;
        if (quickSendActive) briefForState.flowMode = 'quick_send';
        resolvedBriefContext = resolved.briefContext;
      } catch (e) {
        if (
          e.code === 'CAMPAIGN_PRODUCT_NOT_FOUND'
          || e.code === 'CAMPAIGN_BRIEF_INVALID'
          || e.code === 'CAMPAIGN_PRODUCT_NAME_REQUIRED'
          || e.code === 'CAMPAIGN_TOPIC_REQUIRED'
        ) {
          briefStale = e.code === 'CAMPAIGN_PRODUCT_NOT_FOUND';
          briefForState = clearCampaignBriefProductFacts(briefForState);
          if (quickSendActive) briefForState.flowMode = 'quick_send';
        } else {
          throw e;
        }
      }
    }

    // Keep brief off gates (top-level _wizard.brief only); pass a copy into evaluator.
    const gatesForPersist = { ...mergedGates };
    delete gatesForPersist.brief;

    if (
      gatesForPersist.dataSource === 'sheet' &&
      gatesForPersist.sheetUrl &&
      gatesForPersist.sheetCheck?.url !== gatesForPersist.sheetUrl
    ) {
      const channel = normalizeChannel(gatesForPersist.channel);
      const check = await checkSheetForChannel(gatesForPersist.sheetUrl, channel);
      if (check?.status && check.status !== 'unknown') {
        gatesForPersist.sheetCheck = check;
      }
    }

    const marker = isWizardMarkerMessage(lastUserText) ? parseWizardMarker(lastUserText) : null;
    const briefMarkerJustSet = marker?.gate === 'campaignBrief';
    const hadPlanBeforeBriefMarker = Boolean(
      gatesForPersist.hasContentPlan || persistedState.plan?.snapshot
    );
    const semanticBriefNeedsPlanReset = Boolean(
      contentLocaleNeedsPlanReset || (briefMarkerJustSet && hadPlanBeforeBriefMarker)
    );
    if (semanticBriefNeedsPlanReset) {
      gatesForPersist.hasContentPlan = false;
      gatesForPersist.planApproved = false;
    }

    const hasEffectiveAttachedFile = Boolean(hasAnyAttachedFile || briefForState?.attachedFile?.text);
    const gateState = {
      ...gatesForPersist,
      brief: briefForState,
      hasAttachedFile: hasEffectiveAttachedFile,
      hasAttachedSpreadsheet: hasAnyAttachedSpreadsheet,
    };

    // Đóng gói state cho controller persist (field nội bộ, bị strip trước khi trả client)
    const buildWizard = (gateAsked, planChange = null) => ({
      gates: gatesForPersist,
      brief: briefForState,
      gateAsked,
      meta: computeWizardMeta(persistedState.meta, gateAsked),
      ...(planChange
        || (isRevision || semanticBriefNeedsPlanReset
          ? { planChanged: true, planReset: true }
          : { planChanged: false })),
    });

    const gateResources = {
      ...wizardResources,
      briefStale,
      briefPreferredContentMode: briefForState?.contentMode || null,
      hasAttachedFile: hasEffectiveAttachedFile,
      hasAttachedSpreadsheet: hasAnyAttachedSpreadsheet,
    };

    // Free-text cancel must beat deterministic re-ask (dead-end nudge says "gõ huỷ").
    if (
      gatesForPersist.isCampaignFlow
      && isPlanCancelText(lastUserText)
      && !isWizardMarkerMessage(lastUserText)
      && !isPlanTemplateDraftRequest(lastUserText)
    ) {
      const empty = createEmptyWizardState();
      briefForState = createEmptyCampaignBrief(defaultContentLocale);
      return {
        type: 'text',
        content: conversationLocale === 'en'
          ? 'Stopped. The campaign wizard was cleared. Tell me if you want to start a new campaign.'
          : 'Đã dừng. Wizard chiến dịch đã được xoá. Bạn muốn bắt đầu chiến dịch mới thì cứ nói nhé.',
        missing_fields: [],
        data: null,
        wizardShortCircuit: true,
        _wizard: {
          gates: empty.gates,
          brief: briefForState,
          gateAsked: null,
          meta: computeWizardMeta(persistedState.meta, null),
          planChanged: true,
          planReset: true,
        },
      };
    }

    // Deterministic gates before Gemini for any campaign-flow turn (marker or free-text).
    // Guard: if this turn is landing-page-oriented, skip the campaign wizard gate entirely.
    // The AI will produce ask_landing_details or landing_page instead.
    if (gatesForPersist.isCampaignFlow
      && !isPlanTemplateDraftRequest(lastUserText)
      && !isLandingOrientedTurn(history)) {
      const nextGate = evaluateNextGate(gateState, gateResources, locale);
      if (nextGate?.response) {
        const _wizard = buildWizard(nextGate.gate || null);
        return {
          ...withDeadEndNudge(nextGate.response, _wizard.meta, nextGate.gate || null, locale),
          wizardShortCircuit: true,
          _wizard,
        };
      }

      if (marker?.gate === 'schedule' && gatesForPersist.schedule?.mode === 'drip') {
        const basePrompt = findOriginalCampaignPrompt(history);
        return {
          type: 'suggest_content_plan',
          content: locale === 'en'
            ? 'Next I will draft a day-by-day sending plan for you.'
            : 'Tiếp theo mình sẽ lên kế hoạch gửi theo từng ngày cho bạn.',
          data: {
            userPrompt: buildCampaignPromptWithWizardState(
              gatesForPersist,
              basePrompt,
              locale,
              resolvedBriefContext
            ),
          },
          missing_fields: [],
          wizardShortCircuit: true,
          _wizard: buildWizard(null),
        };
      }
    }

    // Thu thập existing resources cho non-admin users (theo workspace owner)
    let existingResources = '';
    let landingPages = [];
    let firstZaloAccountId = null;
    if (ownerId) {
      try {
        const [emailTemplates, zaloAccounts, zaloGroups, zaloTemplates, recommendedType, customerStats, courses, _landingPages] =
          await Promise.all([
            aiPromptResources.getEmailTemplates(ownerId),
            aiPromptResources.getZaloAccounts(ownerId),
            aiPromptResources.getZaloGroups(ownerId),
            aiPromptResources.getZaloTemplates(ownerId),
            aiPromptResources.getRecommendedCampaignType(ownerId),
            aiPromptResources.getCustomerStats(ownerId),
            aiPromptResources.getCourses(ownerId),
            aiPromptResources.getLandingPages(ownerId),
          ]);

        landingPages = _landingPages;
        const connectedZaloAccount = zaloAccounts.find(
          (a) => (a.status === 'connected' || !a.status) && a.isActive !== false && a.is_active !== false
        );
        firstZaloAccountId = connectedZaloAccount?.id ?? null;

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
• data/select_zalo_account — chọn TK Zalo (BẮT BUỘC trong MỌI chiến dịch Zalo, đặt trước node gửi)
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

Luồng Zalo cá nhân ĐÚNG: trigger→select_zalo_account→interested_customers→send_zalo_personal (hoặc trigger→select_zalo_account→send_zalo_personal khi dataSource="zalo_contacts"). Luồng Zalo nhóm ĐÚNG: trigger→select_zalo_account→get_all_groups→send_zalo_group (KHÔNG dùng interested_customers cho nhóm hay cho danh bạ Zalo cá nhân).
`;
      } catch (e) {
        console.warn('[AI] Không lấy được existing resources:', e.message);
      }
    }

    // Luôn dùng full profile để AI thấy tất cả sản phẩm/thông tin mới nhất (workspace owner)
    if (ownerId) {
      try {
        contextBlock = await businessProfileService.getFormattedProfileForPrompt(ownerId);
      } catch (e) {
        console.warn('[AI] Không lấy được business profile:', e.message);
      }
    }

    let wizardContext = '';
    if (mergedGates && (mergedGates.channel || mergedGates.senderAccountId || mergedGates.dataSource || mergedGates.schedule)) {
      const lines = ['=== WIZARD ĐÃ CHỐT (BẮT BUỘC TUÂN THỦ) ==='];
      if (mergedGates.channel) {
        lines.push(`- channel: "${mergedGates.channel}"`);
      }
      if (mergedGates.senderAccountId) {
        if (mergedGates.channel === 'zalo' || mergedGates.channel === 'zalo_group') {
          lines.push(`- zaloSenderAccountId: ${mergedGates.senderAccountId} (BẮT BUỘC dùng ID này cho select_zalo_account.zaloAccountId và mọi node Zalo; KHÔNG dùng firstZaloAccountId khi có giá trị này)`);
        } else if (mergedGates.channel === 'email') {
          lines.push(`- emailSenderId: ${mergedGates.senderAccountId} (dùng ID này cho fromEmailId)`);
        }
      }
      if (mergedGates.dataSource) {
        lines.push(`- dataSource: "${mergedGates.dataSource}"`);
        if (mergedGates.dataSource === 'zalo_contacts') {
          const friendCount = Array.isArray(mergedGates.zaloFriendIds) ? mergedGates.zaloFriendIds.length : 0;
          lines.push(`- zaloFriendCount: ${friendCount}`);
        }
      }
      if (mergedGates.schedule) {
        if (mergedGates.schedule.mode === 'drip') {
          lines.push(`- schedule: drip (${mergedGates.schedule.days || 3} ngày, ${mergedGates.schedule.slotsPerDay || 1} tin/ngày)`);
        } else if (mergedGates.schedule.mode === 'once') {
          lines.push('- schedule: once (gửi 1 lần)');
        }
      }
      wizardContext = lines.join('\n') + '\n\n';
    }

    const langInstr = buildAssistantLanguageInstructions(resolvedLocaleContext);
    const systemPrompt = `Bạn là Founder AI Coworker - Trợ lý Marketing thông minh, chuyên hỗ trợ tạo template tin nhắn, chiến dịch marketing, landing page, và phân tích tài liệu/dữ liệu doanh nghiệp.

## NGÔN NGỮ:
- ${langInstr}
- Field inventory: ASSISTANT PROSE = top-level response "content", free-form ask_more questions, help-style explanations. CUSTOMER ARTIFACTS = email subject/bodyHtml/bodyText, Zalo message text, landing HTML/copy, content_plan day/slot summaries and template bodies, campaign script message bodies. Do NOT treat every JSON key named "content" as customer artifact — top-level response content is assistant prose.

## NGUYÊN TẮC QUAN TRỌNG NHẤT:
- HỒ SƠ DOANH NGHIỆP VÀ TÀI NGUYÊN bên dưới được hệ thống TẢI TRỰC TIẾP TỪ DATABASE ngay trước mỗi tin nhắn — luôn phản ánh trạng thái MỚI NHẤT. Khi user nói "tôi vừa thêm sản phẩm", "tôi vừa cập nhật hồ sơ", v.v., hãy XÁC NHẬN bạn thấy thông tin đó trong phần hồ sơ bên dưới. KHÔNG BAO GIỜ nói "tôi không thể đọc thay đổi mới" hoặc "hồ sơ của tôi là thông tin cũ".
- KHÔNG BAO GIỜ tự bịa thông tin về sản phẩm, doanh nghiệp, tên công ty, giá cả, khuyến mãi.
- KHÔNG ĐƯỢC khẳng định đã chọn tài khoản gửi, đã tạo, hay đã gửi bất cứ thứ gì trong tin nhắn văn xuôi (type: "text"). Bạn không có công cụ gửi tin trực tiếp từ câu trả lời tự do.
- Gặp ý định gửi tin/tạo chiến dịch khi chưa qua wizard, hãy mời người dùng vào luồng hoặc hướng dẫn chọn kênh/tạo chiến dịch bằng câu ngắn, KHÔNG tự dựng quy trình bằng văn xuôi hay bịa tên tài khoản cụ thể (ví dụ: "thông qua tài khoản X có sẵn").
- Nếu có khối CAMPAIGN_BRIEF DATA: đó là nguồn sự thật về sản phẩm/chủ đề đã chọn. Ưu tiên (1) CAMPAIGN_BRIEF DATA → (2) prompt nguyên bản + file đính kèm → (3) hồ sơ doanh nghiệp chỉ cho brand/tone/context, KHÔNG thay selected product/topic.
- QUAN TRỌNG: LUÔN ƯU TIÊN lấy thông tin từ tệp đính kèm (như file danh sách sản phẩm, báo giá...) hoặc nội dung tin nhắn do người dùng gửi. Hồ sơ doanh nghiệp chỉ dùng để tham khảo thêm, tuyệt đối KHÔNG ĐƯỢC lấy sản phẩm từ hồ sơ doanh nghiệp đè lên hoặc thay thế thông tin sản phẩm người dùng vừa cung cấp.
- Bạn hoàn toàn CÓ KHẢ NĂNG đọc, hiểu, phân tích, và tổng hợp thông tin từ bất kỳ tệp đính kèm nào (Word, Excel, PDF, CSV, hình ảnh, văn bản) mà người dùng gửi lên. Khi người dùng đính kèm tệp, nội dung của tệp đó đã được hệ thống trích xuất tự động và gắn kèm dưới dạng văn bản trực tiếp trong phần tin nhắn. Bạn hãy trả lời, phân tích, hoặc tổng hợp nội dung tệp theo đúng yêu cầu của người dùng. Nếu tệp đính kèm có thông tin không rõ ràng, thiếu thông tin quan trọng, hoặc bạn không đọc được nội dung (do lỗi font, sai định dạng...), BẠN BẮT BUỘC PHẢI nói rõ lỗi nằm ở đâu và hướng dẫn người dùng cách chỉnh sửa lại file cho đúng chuẩn.
- Nếu người dùng yêu cầu phân tích/tổng hợp thông tin chung hoặc thảo luận không liên quan trực tiếp đến việc tạo chiến dịch/template, hãy trả lời với type: "text" và đưa ra nội dung phân tích/tổng hợp đầy đủ, chi tiết và chuyên nghiệp trong trường "content".
- Nếu thiếu thông tin cần thiết để tạo template/chiến dịch/landing page → type: "ask_more", hỏi cụ thể những gì còn thiếu.
- Chỉ tạo nội dung template/chiến dịch/landing page khi đã có đủ thông tin từ người dùng.
- Với yêu cầu tạo chiến dịch, KHÔNG tự suy đoán nguồn khách hàng là Google Sheet chỉ vì user nhắc các cột như full_name, email, phone, tour_name, end_date. Nếu user chưa nói rõ "Google Sheet", "Excel", "file", "landing page", "khách hàng trong hệ thống/database" hoặc chưa chọn dataSource trong câu trả lời trước, BẮT BUỘC dùng type="ask_campaign_details" và hỏi câu "dataSource".

${wizardContext}${resolvedBriefContext ? resolvedBriefContext + '\n\n' : ''}${contextBlock ? contextBlock + '\n\n' : ''}${existingResources ? existingResources + '\n\n' : ''}## PHÂN LOẠI Ý ĐỊNH (intent):

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
- Nếu yêu cầu gốc là CHUỖI nhiều email/tin nhắn (ví dụ "5 email trong 5 ngày") mà KHÔNG đi qua content_plan (không có "Tạo chi tiết template cho ngày X, slot Y" trong tin nhắn hiện tại), sau khi tạo xong 1 template hãy kết thúc content bằng câu gợi ý tiếp tục với số thứ tự kế tiếp, ví dụ: "Bạn muốn tôi soạn tiếp Email 2 không? Trả lời «tiếp» là mình làm ngay." Khi user trả lời "có"/"tiếp"/"ok" thì tạo template kế tiếp trong chuỗi.

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
  trigger → select_zalo_account → get_all_groups → send_zalo_group(chuỗi nhiều tin trong 1 node) → end
  select_zalo_account config: { zaloAccountId:<ID|null> }
  get_all_groups config: { zaloGroupAccountNodeId:"<tempId_select_zalo_account>" }
  send_zalo_group config: { zaloAccountId:<ID|null>, zaloGroupSource:"node", zaloGroupNodeId:"<tempId_get_all_groups>", zaloGroupField:"groupId", zaloGroupTemplateSteps:[{ message:"...", delayValue:0, delayUnit:"days" }], saveMessageLog:true }

LUẬT DELAY: KHÔNG tạo node wait/delay riêng. Delay đặt trong delayValue+delayUnit của action node.
Điền zaloAccountId từ danh sách tài nguyên. Tự soạn nội dung tin nhắn thực tế nếu không có template.

Data structure — nodes PHẢI có đúng nodeType + nodeSubtype như ví dụ sau:

Email campaign (2 lần gửi):
{ "campaignName": "...", "description": "...", "campaignType": "email", "isAiDraft": true,
  "nodes": [
    { "tempId": "n1", "nodeType": "trigger",  "nodeSubtype": "manual",                  "nodeName": "Bắt đầu",          "nodeDescription": "", "positionX": 100, "positionY": 200, "config": {} },
    { "tempId": "n2", "nodeType": "data",     "nodeSubtype": "interested_customers",    "nodeName": "Danh sách khách",  "nodeDescription": "Khách từ database", "positionX": 350, "positionY": 200, "config": { "interestedCustomerType": "both", "interestedLimit": 1000 } },
    { "tempId": "n3", "nodeType": "action",   "nodeSubtype": "send_email",              "nodeName": "Email 1",          "nodeDescription": "Gửi ngay", "positionX": 600, "positionY": 200, "config": { "recipientSource": "node", "recipientNodeId": "n2", "recipientField": "email", "sendMode": "schedule", "emailTemplateId": null, "emailSubject": "Tiêu đề email 1", "emailBody": "<div style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff\"><div style=\"background:#FF6B00;padding:32px 24px;text-align:center\"><h1 style=\"color:#ffffff;margin:0;font-size:24px\">Tên Công Ty</h1></div><div style=\"padding:32px 24px\"><p style=\"font-size:16px;color:#333;margin:0 0 16px\">Xin chào <strong>{{full_name}}</strong>,</p><p style=\"font-size:15px;color:#555;line-height:1.6;margin:0 0 24px\">Nội dung email 1 thực sự, chuyên nghiệp, có giá trị cho người nhận.</p><div style=\"text-align:center;margin:32px 0\"><a href=\"#\" style=\"background:#FF6B00;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block\">Hành động ngay</a></div></div><div style=\"background:#f5f5f5;padding:16px 24px;text-align:center\"><p style=\"font-size:12px;color:#999;margin:0\">Bạn nhận email này vì đã đăng ký nhận thông tin.</p></div></div>", "templateMappings": [], "enableLinkTracking": true, "saveMessageLog": true, "delayValue": 0, "delayUnit": "days" } },
    { "tempId": "n4", "nodeType": "action",   "nodeSubtype": "send_email",              "nodeName": "Email 2",          "nodeDescription": "Gửi sau 3 ngày", "positionX": 850, "positionY": 200, "config": { "recipientSource": "node", "recipientNodeId": "n2", "recipientField": "email", "sendMode": "schedule", "emailTemplateId": null, "emailSubject": "Tiêu đề email 2", "emailBody": "<div style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff\"><div style=\"background:#FF6B00;padding:32px 24px;text-align:center\"><h1 style=\"color:#ffffff;margin:0;font-size:24px\">Tên Công Ty</h1></div><div style=\"padding:32px 24px\"><p style=\"font-size:16px;color:#333;margin:0 0 16px\">Xin chào <strong>{{full_name}}</strong>,</p><p style=\"font-size:15px;color:#555;line-height:1.6;margin:0 0 24px\">Nội dung email 2 nhắc nhở, tạo urgency, thúc đẩy hành động.</p><div style=\"background:#fff8f0;border-left:4px solid #FF6B00;padding:16px;margin:0 0 24px\"><p style=\"margin:0;font-size:15px;color:#333\">⏰ Cơ hội sắp kết thúc!</p></div><div style=\"text-align:center;margin:32px 0\"><a href=\"#\" style=\"background:#FF6B00;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block\">Đăng ký ngay</a></div></div><div style=\"background:#f5f5f5;padding:16px 24px;text-align:center\"><p style=\"font-size:12px;color:#999;margin:0\">Bạn nhận email này vì đã đăng ký nhận thông tin.</p></div></div>", "templateMappings": [], "enableLinkTracking": true, "saveMessageLog": true, "delayValue": 3, "delayUnit": "days" } },
    { "tempId": "n5", "nodeType": "end",      "nodeSubtype": "end",                     "nodeName": "Kết thúc",         "nodeDescription": "", "positionX": 1100, "positionY": 200, "config": {} }
  ],
  "connections": [{"sourceNodeId":"n1","targetNodeId":"n2"},{"sourceNodeId":"n2","targetNodeId":"n3"},{"sourceNodeId":"n3","targetNodeId":"n4"},{"sourceNodeId":"n4","targetNodeId":"n5"}]
}

Zalo cá nhân campaign:
{ "campaignName": "...", "description": "...", "campaignType": "zalo", "isAiDraft": true,
  "nodes": [
    { "tempId": "n1", "nodeType": "trigger",  "nodeSubtype": "manual",                  "nodeName": "Bắt đầu",          "nodeDescription": "", "positionX": 100, "positionY": 200, "config": {} },
    { "tempId": "n2", "nodeType": "data",     "nodeSubtype": "interested_customers",    "nodeName": "Danh sách khách",  "nodeDescription": "Khách từ database", "positionX": 350, "positionY": 200, "config": { "interestedCustomerType": "both", "interestedLimit": 1000 } },
    { "tempId": "n3", "nodeType": "action",   "nodeSubtype": "send_zalo_personal",      "nodeName": "Gửi Zalo cá nhân", "nodeDescription": "Gửi chuỗi 2 tin",  "positionX": 600, "positionY": 200, "config": { "zaloAccountId": null, "zaloRecipientSource": "node", "zaloRecipientNodeId": "n2", "zaloRecipientField": "phone", "zaloRecipientType": "phone", "zaloPersonalSendMode": "schedule", "saveMessageLog": true, "zaloPersonalTemplateSteps": [ { "message": "Xin chào {{full_name}}! Nội dung tin 1...", "delayValue": 0, "delayUnit": "days", "enableLinkTracking": true, "templateMappings": [] }, { "message": "Nội dung tin 2 sau 2 ngày...", "delayValue": 2, "delayUnit": "days", "enableLinkTracking": true, "templateMappings": [] } ] } },
    { "tempId": "n4", "nodeType": "end",      "nodeSubtype": "end",                     "nodeName": "Kết thúc",         "nodeDescription": "", "positionX": 900, "positionY": 200, "config": {} }
  ],
  "connections": [{"sourceNodeId":"n1","targetNodeId":"n2"},{"sourceNodeId":"n2","targetNodeId":"n3"},{"sourceNodeId":"n3","targetNodeId":"n4"}]
}

Zalo nhóm campaign:
{ "campaignName": "...", "description": "...", "campaignType": "zalo_group", "isAiDraft": true,
  "nodes": [
    { "tempId": "n1", "nodeType": "trigger",  "nodeSubtype": "manual",                  "nodeName": "Bắt đầu",          "nodeDescription": "", "positionX": 100, "positionY": 200, "config": {} },
    { "tempId": "n2", "nodeType": "data",     "nodeSubtype": "select_zalo_account",     "nodeName": "Chọn tài khoản Zalo", "nodeDescription": "", "positionX": 350, "positionY": 200, "config": { "zaloAccountId": null } },
    { "tempId": "n3", "nodeType": "data",     "nodeSubtype": "get_all_groups",          "nodeName": "Lấy danh sách nhóm", "nodeDescription": "", "positionX": 600, "positionY": 200, "config": { "zaloGroupAccountNodeId": "n2" } },
    { "tempId": "n4", "nodeType": "action",   "nodeSubtype": "send_zalo_group",         "nodeName": "Gửi nhóm tin Zalo","nodeDescription": "Gửi chuỗi 2 tin",  "positionX": 850, "positionY": 200, "config": { "zaloAccountId": null, "zaloGroupSource": "node", "zaloGroupNodeId": "n3", "zaloGroupField": "groupId", "zaloGroupSendMode": "schedule", "saveMessageLog": true, "zaloGroupTemplateSteps": [ { "message": "Nội dung tin nhắn nhóm 1...", "delayValue": 0, "delayUnit": "days", "templateMappings": [] }, { "message": "Nội dung tin nhắn nhóm 2...", "delayValue": 1, "delayUnit": "days", "templateMappings": [] } ] } },
    { "tempId": "n5", "nodeType": "end",      "nodeSubtype": "end",                     "nodeName": "Kết thúc",         "nodeDescription": "", "positionX": 1100, "positionY": 200, "config": {} }
  ],
  "connections": [{"sourceNodeId":"n1","targetNodeId":"n2"},{"sourceNodeId":"n2","targetNodeId":"n3"},{"sourceNodeId":"n3","targetNodeId":"n4"},{"sourceNodeId":"n4","targetNodeId":"n5"}]
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
- Đã đề cập "nhập trực tiếp", "manual", "dán email", "dán SĐT" → bỏ "dataSource", tự chọn manual
- KHÔNG hỏi productCount / sendingStyle / campaignBrief / schedule — các cổng này do wizard deterministic xử lý. Nếu thiếu sản phẩm/chủ đề hoặc lịch gửi, đừng tự hỏi lại các field đó trong ask_campaign_details.
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
      "id": "dataSource",
      "label": "Lấy danh sách khách từ đâu?",
      "options": [
        { "value": "db", "label": "👥 Khách hàng có sẵn trong hệ thống" },
        { "value": "sheet", "label": "📊 File Excel / Google Sheet" },
        { "value": "landing", "label": "📋 Danh sách đăng ký từ Landing Page" },
        { "value": "manual", "label": "✏️ Nhập người nhận trực tiếp" }
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
  "content": "Message to user (assistant prose language per ASSISTANT_REPLY_LANGUAGE — friendly, NO jargon, NO markdown **bold** or *italic*, plain text, use - for bullet points)",
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

## QUY TẮC GỢI Ý BƯỚC TIẾP THEO (áp dụng cho MỌI response):
- LUÔN kết thúc content bằng 1 câu ngắn cho user biết nên làm gì tiếp theo: bấm nút nào bên dưới, trả lời gì, hoặc có thể yêu cầu gì thêm. Ví dụ: "Bạn bấm Lưu vào thư viện để lưu template này nhé.", "Bạn xem kế hoạch rồi bấm Đồng ý bên dưới để tôi soạn nội dung.", "Bạn có thể bấm 'Sửa trang này với AI' để yêu cầu đổi màu/nội dung, hoặc bấm 'Mở trình soạn thảo' nhé."
- Nếu content đã kết thúc bằng câu hỏi rõ ràng cho user thì không cần thêm.
- Câu gợi ý phải khớp với nút/card mà frontend hiển thị cho type đó (template_draft có nút "Lưu vào thư viện" và "Chỉnh sửa"; content_plan có nút "Đồng ý"/"Chỉnh lại kế hoạch"; landing_page có nút "Sửa trang này với AI", "Mở trình soạn thảo" và "Tạo trang mới"; confirm_create có nút tạo chiến dịch...), KHÔNG bịa ra nút không tồn tại.
- Khi tạo landing page (type: "landing_page"): Tuyệt đối KHÔNG tự tuyên bố là đã giữ nguyên hay kế thừa thiết kế/số liệu từ bản trước nếu bạn đang tạo mới từ đầu.

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
- Format mặc định: headerRow=1, dataStartRow=2 (sheetName để trống = tab đầu tiên). Thêm vào nodeDescription: "(Nếu sheet của bạn có tab hoặc cấu trúc khác, hãy chỉnh trong Campaign Builder sau khi tạo)"

GOOGLE SHEET / FILE EXCEL — CHƯA có URL và CHƯA có File:
- Chỉ áp dụng khi user đã chọn dataSource="sheet" nhưng CHƯA dán link Google Sheet và CHƯA tải file lên:
  Nhắc người dùng đính kèm file Excel/CSV hoặc dán link Google Sheet (URL https://docs.google.com/spreadsheets/...) để tiếp tục.

UPLOADED FILE (CSV / Excel) CHO DANH SÁCH NGƯỜI NHẬN (dataSource = sheet):
- Nội dung file đã được trích xuất thành text và gắn trong message → AI CÓ THỂ đọc được các cột và dữ liệu
- Phân tích các cột trong file:
  • Xác định cột email (hoặc số điện thoại cho Zalo).
  • Báo rõ cho người dùng: cột nào được chọn làm người nhận và số lượng người nhận hợp lệ.
  • Nếu file có nhiều cột, thông báo cột đang dùng để người dùng có thể đổi nếu muốn.
  • Kiểm tra số lượng: tối đa 1000 người nhận. Nếu file > 1000 dòng, thông báo vượt hạn mức (không tự ý cắt bớt).
  • Nếu có dòng không hợp lệ, chỉ rõ dòng lỗi cho người dùng.
  • Khi đã có dữ liệu file hợp lệ, KHÔNG đòi link Google Sheet nữa, tiếp tục hoàn thiện chiến dịch.

UPLOADED FILE CHO NỘI DUNG (contentMode = attached_file):
- Khi user chọn "Dùng dữ liệu từ file đính kèm" (contentMode="attached_file"):
  • Trích xuất thông tin sản phẩm/dịch vụ/nội dung quảng bá từ nội dung file đính kèm và yêu cầu của người dùng.
  • CẢNH BÁO KHI FILE KHÔNG PHẢI TÀI LIỆU CHÀO BÁN / SẢN PHẨM THƯƠNG MẠI (chỉ cảnh báo 1 lần, không chặn cứng):
    Phân biệt rõ ràng theo ngữ nghĩa:
    - Tài liệu chào bán hợp lệ: Có thông tin về sản phẩm/dịch vụ/khoá học kèm bảng giá, học phí, chiết khấu, khuyến mãi, tính năng thương mại, combo, ưu đãi dành cho khách hàng...
    - Tài liệu KHÔNG PHẢI chào bán: Báo cáo công việc (ví dụ: Báo cáo Task, Báo cáo tiến độ dự án), biên bản họp, tài liệu kỹ thuật, đồ án, bài tập, văn bản nội bộ... (dù trong file có thể nhắc đến từ 'sản phẩm', 'tính năng', 'đăng ký' nhưng mục đích file là báo cáo công việc/học tập, KHÔNG phải tài liệu thương mại chào bán cho khách).
    Khi gặp file không phải tài liệu chào bán và attachedFile.userConfirmed chưa bằng true:
    1. Tóm tắt 1 câu nội dung file nói về điều gì (dựa trên nội dung thật đã trích).
    2. Nói rõ là file là tài liệu báo cáo/nội bộ, không tìm thấy thông tin sản phẩm/dịch vụ/ưu đãi thương mại để soạn chiến dịch marketing.
    3. Hỏi người dùng muốn tải file khác hay vẫn dùng thông tin trong file này để tạo nội dung chiến dịch.
  • NẾU NGƯỜI DÙNG ĐÃ XÁC NHẬN "vẫn dùng file này" / "cứ tiếp tục" (hoặc trong lịch sử đã có cảnh báo này rồi, hoặc attachedFile.userConfirmed = true):
    Tiếp tục soạn chiến dịch bình thường theo nội dung file và yêu cầu của người dùng, TUYỆT ĐỐI KHÔNG lặp lại cảnh báo.

### Sau khi user trả lời ask_campaign_details, build campaign dựa vào:
- channel: email/zalo/zalo_group → chọn đúng action node
- zaloSenderAccountId có giá trị → dùng ĐÚNG ID đó làm zaloAccountId trong select_zalo_account và tất cả action node Zalo. Chỉ dùng firstZaloAccountId khi zaloSenderAccountId rỗng.
- emailSenderId có giá trị → dùng ĐÚNG ID đó làm fromEmailId và emailSenderId trong tất cả node send_email.
- sheetUrl có giá trị → dùng ĐÚNG URL đó làm config.sheetUrl cho node read_sheet (KHÔNG để trống).
- zaloGroupIds có giá trị → dùng ĐÚNG danh sách này cho config.zaloGroupIds và config.zaloSelectedGroupIds trong send_zalo_group và get_all_groups.
- landingLeadsSlugs có giá trị → dùng ĐÚNG mảng slug này cho config.landingLeadsSlugs trong read_landing_leads.
- sendMode / zaloPersonalSendMode / zaloGroupSendMode:
  • Khi lịch gửi là chuỗi nhiều ngày (schedule.mode === 'drip' hoặc có delayValue > 0 giữa các tin/bước): BẮT BUỘC đặt config.sendMode = "schedule" (cho send_email), config.zaloPersonalSendMode = "schedule" (cho send_zalo_personal), config.zaloGroupSendMode = "schedule" (cho send_zalo_group).
  • Khi gửi một lần (schedule.mode === 'once' và không có delay): đặt "all".
- zaloAccount="<id>" → dùng ID đó làm zaloAccountId trong tất cả action/data node Zalo; nếu không có câu hỏi này → dùng tài khoản mặc định (firstZaloAccountId)
- landingPage="<slug>" → dùng slug đó trong landingLeadsSlugs của read_landing_leads
- Dùng CAMPAIGN_BRIEF DATA (nếu có) để viết nội dung: không bịa sản phẩm ngoài brief; không tự map productIds sang interestedCourseIds / notPurchasedCourseIds trừ khi user NÓI RÕ muốn lọc audience theo đã mua/chưa mua/quan tâm khóa đó
- dataSource="zalo_contacts" → xử lý GIỐNG "manual": KHÔNG tạo interested_customers/read_sheet/get_all_friends. Người nhận là các UID người dùng đã chọn, hệ thống truyền riêng ở bước chuẩn bị gửi. Vẫn PHẢI có select_zalo_account.
- dataSource="sheet"          → nodeSubtype: "read_sheet", config: { sheetUrl: "<url>", headerRow: 1, dataStartRow: 2 }
- dataSource="db"             → nodeSubtype: "interested_customers", config: { interestedCustomerType: "both", interestedLimit: 1000 }
- dataSource="manual"         → không tạo interested_customers/read_sheet; để trống danh sách — hệ thống sẽ dùng người nhận nhập trực tiếp ở bước chuẩn bị gửi
- "đã mua [khóa X]" → interestedCustomerType: "purchased", interestedCourseIds: [id_khoaX]
- "chưa mua [khóa X]" → interestedCustomerType: "interested", interestedCourseIds: [id_khoaX]
- "đã mua [khóa X] nhưng chưa mua [khóa Y]" → interestedCustomerType: "purchased", interestedCourseIds: [id_khoaX], notPurchasedCourseIds: [id_khoaY]
- "quan tâm [khóa X]" / "interested [khóa X]" → interestedCourseIds: [id_khoaX] chỉ khi user yêu cầu lọc audience rõ ràng
- Dùng ID khóa học từ danh sách "Khóa học / Sản phẩm" ở phần TÀI NGUYÊN CÓ SẴN chỉ cho audience filter khi user yêu cầu lọc; nội dung quảng bá lấy từ CAMPAIGN_BRIEF DATA
- dataSource="sheet" + URL ĐÃ có trong message (https://docs.google.com/spreadsheets/...) → nodeSubtype: "read_sheet", config: { sheetUrl: "<url>", headerRow: 1, dataStartRow: 2 }, thêm ghi chú format trong nodeDescription
- dataSource="sheet" + CHƯA có URL → type: "ask_more", missing_fields: ["Đường dẫn Google Sheet (URL)"], content: "Bạn vui lòng chia sẻ đường dẫn Google Sheet nhé? (URL bắt đầu bằng https://docs.google.com/...)"
- dataSource="landing" + user CHƯA chọn landing page cụ thể + có nhiều landing page trong TÀI NGUYÊN → type: "ask_more", missing_fields: ["Landing page cần lấy leads"], content: "Bạn muốn lấy leads từ landing page nào? (liệt kê tên trang)\n${landingPages.map(lp => `- ${lp.title} (${lp.slug})`).join('\n')}"
- dataSource="landing" + user đã chọn hoặc chỉ có 1 landing page → nodeSubtype: "read_landing_leads", config: { landingLeadsSlugs: ["<slug>"] }
- dataSource="landing" + không có landing page nào → type: "text", content: "Tài khoản chưa có landing page nào. Bạn cần tạo landing page trước để thu thập leads."

Ví dụ campaign drip 2 đợt (dataSource=db):
nodes: trigger → select_zalo_account (nếu là Zalo) → interested_customers → action_wave1(delay=0) → action_wave2(delay=3 days) → end

Ví dụ gửi bạn bè Zalo (dataSource=zalo_contacts):
nodes: trigger → select_zalo_account → action_wave1(delay=0) → end

Ví dụ lấy từ sheet (dataSource=sheet):
nodes: trigger → read_sheet(sheetUrl="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit") → action_wave1(delay=0) → end

Ví dụ lấy từ landing page (dataSource=landing):
nodes: trigger → read_landing_leads → action_wave1(delay=0) → end

Ví dụ nhiều sản phẩm gửi 1 lần (CAMPAIGN_BRIEF multiple_products):
nodes: trigger → data_node → action_sp1(delay=0) → action_sp2(delay=2 days) → end

### Các từ khóa xác định kênh:
- "email" / "gửi mail" / "thư điện tử" → campaignType: "email"
- "zalo" / "tin nhắn zalo" → campaignType: "zalo"
- "zalo nhóm" / "nhóm zalo" / "gửi nhóm" → campaignType: "zalo_group"

### Audience và nguồn khách:
- KHÔNG có field audience trong ask_campaign_details; nguồn khách được chọn bằng dataSource.
- KHÔNG bao giờ giả định khách hàng lấy từ file/sheet khi user chưa nói rõ.
- Nếu user chưa nói rõ nguồn khách, hãy hỏi "Lấy danh sách khách từ đâu?" với các lựa chọn db/sheet/landing/manual/zalo_contacts.

## HEURISTICS CHO type="create_and_run":
- CHỈ khi người dùng nói RÕ ràng muốn bỏ xác nhận: "tạo và chạy", "create and run", "chạy ngay chiến dịch"
- "gửi nhanh" / "gui nhanh" / "quick send" / "send one email" / "gửi 1 lần" / "gửi một lần" KHÔNG đủ → dùng type="confirm_create" (vẫn cần user bấm xác nhận)
- Người dùng mô tả rõ ràng mục tiêu nhưng không nói chạy ngay → confirm_create, không create_and_run
- Nếu thiếu thông tin cơ bản (tên sản phẩm, đối tượng) mà wizard chưa có CAMPAIGN_BRIEF → hỏi qua wizard/gates, không bịa

## QUICK-SEND (gửi nhanh / one-shot):
- Marker: "gửi nhanh", "gửi 1 email", "gửi 1 lần", "gửi một lần", "gửi một mình", "quick send", "send one email", "send a single message", "send once"
- Đây là gửi MỘT lần (schedule once). KHÔNG trả content_plan / suggest_content_plan. KHÔNG tự nâng thành chuỗi nhiều ngày.
- Nếu CAMPAIGN_BRIEF DATA đã có (kể cả contentMode=context cảm ơn/thông báo) → đừng hỏi lại sản phẩm/chủ đề.
- dataSource="manual" hoặc "zalo_contacts": KHÔNG chép email/SĐT/UID cụ thể vào nodes; FE nhập người nhận riêng (overlay). Giữ recipientSource/zaloRecipientSource = "manual" với list rỗng.
- Multi-day ("5 email trong 5 ngày") KHÔNG phải quick-send — dùng drip + content_plan như bình thường.
- Khi ra confirm_create cho yêu cầu gửi 1 lần, câu phản hồi giải thích rõ: Bấm "Tạo chiến dịch" nếu muốn lưu lại để theo dõi sau, hoặc "Gửi nhanh" nếu chỉ cần gửi một lần (Gửi nhanh không chiếm suất chiến dịch trong gói).`;

    const response = await runChat({ systemPrompt, history, files, userId, requestedModel: model });
    const guarded = this._guardWizardGates(
      this._guardManualRecipientsNoAutoRun(
        this._guardQuickSendResponse(
          this._guardContentPlanResponse(
            this._guardCampaignDataSourceResponse(response, history, locale, gateState),
            history,
            briefForState,
            intent
          ),
          history,
          briefForState
        ),
        gateState
      ),
      history,
      gateResources,
      locale,
      gateState
    );
    let finalResponse = guarded.response;

    // Trust boundary: server owns ask_landing_details.data.contentLocale (never trust model).
    if (finalResponse?.type === 'ask_landing_details') {
      finalResponse = {
        ...finalResponse,
        data: {
          ...(finalResponse.data && typeof finalResponse.data === 'object' ? finalResponse.data : {}),
          contentLocale: resolvedLocaleContext.contentLocale,
        },
      };
    }

    /**
     * Gắn planSlotKey cho template_draft của một slot trong kế hoạch nội dung.
     * Giá trị này được lưu xuống `ai_chat_messages.data` và là DANH TÍNH duy nhất để
     * dựng lại luồng soạn sau khi người dùng tải lại trang.
     */
    if (finalResponse?.type === 'template_draft' && finalResponse.data) {
      if (!finalResponse.data.planSlotKey) {
        if (planSlotKey) {
          finalResponse.data.planSlotKey = planSlotKey;
        } else {
          const slotMatch = String(lastUserText).match(/ngày\s*(\d+)[,\s]+slot\s*(\d+)/i);
          if (slotMatch) {
            finalResponse.data.planSlotKey = `d${slotMatch[1]}-s${slotMatch[2]}`;
          }
        }
      }
    }

    // PR-B: Enforce user's selected schedule on content_plan and confirm_create
    let planChange = null;
    if (finalResponse?.type === 'content_plan' && finalResponse.data) {
      const schedule = gateState?.schedule;
      if (schedule?.mode === 'drip' && schedule?.days) {
        const expectedDays = Number(schedule.days);
        if (Number.isFinite(expectedDays) && expectedDays > 0 && Array.isArray(finalResponse.data.days)) {
          if (finalResponse.data.days.length > expectedDays) {
            finalResponse.data.days = finalResponse.data.days.slice(0, expectedDays);
            finalResponse.data.totalDays = expectedDays;
            if (typeof finalResponse.content === 'string') {
              const notice = locale === 'en'
                ? ` (Plan automatically adjusted to ${expectedDays} day(s) according to your schedule preference.)`
                : ` (Kế hoạch đã được tự động điều chỉnh còn đúng ${expectedDays} ngày theo lựa chọn của bạn.)`;
              if (!finalResponse.content.includes('tự động điều chỉnh') && !finalResponse.content.includes('automatically adjusted')) {
                finalResponse.content = finalResponse.content.trim() + notice;
              }
            }
          }
        }
      }
      gatesForPersist.hasContentPlan = true;
      gatesForPersist.planApproved = false;
      planChange = {
        planChanged: true,
        planSnapshot: finalResponse.data,
        planSourcePrompt: findOriginalCampaignPrompt(history),
        planRequiresApproval: finalResponse.data?.requiresApproval !== false,
      };
    }

    if ((finalResponse?.type === 'confirm_create' || finalResponse?.type === 'create_and_run') && finalResponse.data) {
      const targetScript = finalResponse.data.script || finalResponse.data;
      if (targetScript && Array.isArray(targetScript.nodes) && Array.isArray(targetScript.connections)) {
        console.log(
          '[AI Patch][gate] senderAccountId=',
          gateState?.senderAccountId,
          'channel=',
          gateState?.channel,
          'gateKeys=',
          Object.keys(gateState || {})
        );
        aiCampaignDraftService.patchDeterministicCampaignScript(targetScript, {
          senderAccountId: gateState?.senderAccountId,
          dataSource: gateState?.dataSource,
          sheetUrl: gateState?.sheetUrl,
          zaloGroupIds: gateState?.zaloGroupIds,
          zaloFriendIds: gateState?.zaloFriendIds,
          landingPageSlug: gateState?.landingPageSlug || gateState?.landingLeadsSlugs,
          defaultZaloAccountId: firstZaloAccountId,
          channel: gateState?.channel,
          schedule: gateState?.schedule,
        });

        // Giai đoạn 2 - Việc 2.3: Shadow compare graph của compiler với script cũ
        runCompilerShadowCompare({
          legacyScript: targetScript,
          gateState,
          brief: briefForState || null,
        });
      }

      const schedule = gateState?.schedule;
      let maxSteps = null;
      if (schedule?.mode === 'drip' && schedule?.days) {
        const days = Number(schedule.days);
        const slotsPerDay = Number(schedule.slotsPerDay) || 1;
        if (Number.isFinite(days) && days > 0) {
          maxSteps = days * slotsPerDay;
        }
      } else if (schedule?.mode === 'once') {
        maxSteps = 1;
      }

      if (maxSteps) {
        const nodes = Array.isArray(finalResponse.data?.nodes)
          ? finalResponse.data.nodes
          : (Array.isArray(finalResponse.data?.script?.nodes) ? finalResponse.data.script.nodes : null);

        if (Array.isArray(nodes)) {
          for (const node of nodes) {
            const cfg = node.config || node.nodeConfig || {};
            if (Array.isArray(cfg.emailSteps) && cfg.emailSteps.length > maxSteps) {
              cfg.emailSteps = cfg.emailSteps.slice(0, maxSteps);
            }
            if (Array.isArray(cfg.zaloPersonalTemplateSteps) && cfg.zaloPersonalTemplateSteps.length > maxSteps) {
              cfg.zaloPersonalTemplateSteps = cfg.zaloPersonalTemplateSteps.slice(0, maxSteps);
            }
            if (Array.isArray(cfg.zaloGroupTemplateSteps) && cfg.zaloGroupTemplateSteps.length > maxSteps) {
              cfg.zaloGroupTemplateSteps = cfg.zaloGroupTemplateSteps.slice(0, maxSteps);
            }
            node.config = cfg;
          }
        }
      }
    }

    const _wizard = buildWizard(guarded.gateAsked, planChange);
    return {
      ...withDeadEndNudge(finalResponse, _wizard.meta, guarded.gateAsked, locale),
      _wizard,
    };
  }

  async processSmartChatV2({
    history = [],
    files = [],
    userId = null,
    resourceOwnerUserId = null,
    userRole = 'user',
    locale = 'vi',
    localeContext = null,
    model = null,
  }) {
    let contextBlock = '';
    const ownerId = resourceOwnerUserId || userId;
    const uiLocale = normalizeAssistantLocale(localeContext?.uiLocale || locale, 'vi');
    const resolvedLocaleContext = localeContext || resolveAssistantLocaleContext({
      history,
      uiLocale,
      persistedConversationLocale: null,
      briefContentLocale: null,
    });

    // Lấy existing resources
    let existingResources = '';
    let nodeContext = '';
    let multiStepExample = '';
    let templateSelectionPrompt = '';

    if (ownerId) {
      try {
        const [emailTemplates, zaloAccounts, zaloGroups, zaloTemplates, recommendedType, customerStats, landingPages] =
          await Promise.all([
            aiPromptResources.getEmailTemplates(ownerId),
            aiPromptResources.getZaloAccounts(ownerId),
            aiPromptResources.getZaloGroups(ownerId),
            aiPromptResources.getZaloTemplates(ownerId),
            aiPromptResources.getRecommendedCampaignType(ownerId),
            aiPromptResources.getCustomerStats(ownerId),
            aiPromptResources.getLandingPages(ownerId),
          ]);

        // Get node context từ registry
        nodeContext = campaignNodeRegistryService.buildNodeContextForAI();
        multiStepExample = campaignNodeRegistryService.buildMultiStepExample();
        templateSelectionPrompt = campaignNodeRegistryService.buildTemplateSelectionPrompt({
          emailTemplates,
          zaloTemplates,
        });

        const connectedZaloAccount = zaloAccounts.find(
          (a) => (a.status === 'connected' || !a.status) && a.isActive !== false && a.is_active !== false
        );
        const firstZaloAccountId = connectedZaloAccount?.id ?? null;

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

📄 Landing Pages:
${landingPages.length > 0 ? landingPages.map(lp => `  - slug: "${lp.slug}" | "${lp.title}"${lp.isPublished ? '' : ' (chưa publish)'}`).join('\n') : '  (chưa có landing page nào)'}
`;
      } catch (e) {
        console.warn('[AI V2] Không lấy được resources:', e.message);
      }
    }

    // RAG context (workspace owner profile; metering stays on actor userId)
    if (ownerId && history.length > 0) {
      const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        try {
          contextBlock = await businessProfileService.getContextForPrompt(ownerId, lastUserMsg.content);
        } catch (e) {
          console.warn('[AI V2] Không lấy được RAG context:', e.message);
        }
        if (!contextBlock) {
          try {
            contextBlock = await businessProfileService.getFormattedProfileForPrompt(ownerId);
          } catch (e) {
            console.warn('[AI V2] Không lấy được business profile:', e.message);
          }
        }
      }
    }

    const langInstrV2 = buildAssistantLanguageInstructions(resolvedLocaleContext);
    const systemPrompt = `Bạn là Founder AI Coworker - Trợ lý Marketing thông minh, chuyên hỗ trợ tạo chiến dịch marketing với multi-step support.

## NGÔN NGỮ:
- ${langInstrV2}
- Field inventory: ASSISTANT PROSE = top-level "content". CUSTOMER ARTIFACTS = email subject/body, Zalo message, landing copy, multi-step campaign node message bodies. Top-level response content is assistant prose, not customer artifact.

## NGUYÊN TẮC QUAN TRỌNG NHẤT:
- KHÔNG BAO GIỜ tự bịa thông tin về sản phẩm, doanh nghiệp, tên công ty, giá cả, khuyến mãi.
- QUAN TRỌNG: LUÔN ƯU TIÊN lấy thông tin từ tệp đính kèm (như file danh sách sản phẩm, báo giá...) hoặc nội dung tin nhắn do người dùng gửi. Hồ sơ doanh nghiệp chỉ dùng để tham khảo thêm, tuyệt đối KHÔNG ĐƯỢC lấy sản phẩm từ hồ sơ doanh nghiệp đè lên hoặc thay thế thông tin sản phẩm người dùng vừa cung cấp.
- Nếu tệp đính kèm có thông tin không rõ ràng, thiếu thông tin quan trọng, hoặc bạn không đọc được nội dung (do lỗi font, sai định dạng...), BẠN BẮT BUỘC PHẢI nói rõ lỗi nằm ở đâu và hướng dẫn người dùng cách chỉnh sửa lại file cho đúng chuẩn.
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

    return runChat({ systemPrompt, history, files, userId, requestedModel: model });
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
   * Generate campaign using Node Registry for multi-step support.
   * Sử dụng campaignNodeRegistryService để AI hiểu rõ về các node types và multi-step.
   */
  async generateCampaignWithRegistry({ prompt, files = [], userId = null, brief = null }) {
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
            aiPromptResources.getEmailTemplates(userId),
            aiPromptResources.getZaloAccounts(userId),
            aiPromptResources.getZaloTemplates(userId),
            aiPromptResources.getRecommendedCampaignType(userId),
            aiPromptResources.getCustomerStats(userId),
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
6. KHÔNG khẳng định đã gửi tin thật hay đã chọn tài khoản ngoài các node config được tạo

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

    if ((!files || files.length === 0) && brief?.attachedFile?.text) {
      parts.push({ text: `[File: ${brief.attachedFile.originalName || 'Tài liệu'}]:\n${brief.attachedFile.text}` });
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

    return parseAiJson(text);
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

}

export default new AiCampaignService();
