import businessProfileService, { serializeProductList } from './businessProfile.service.js';
import productRepository from '../../repositories/products/product.repository.js';
import aiCampaignRepository from '../../repositories/ai/aiCampaign.repository.js';
import { getEnabledAdapterCampaignChannels, isChannelBlockedByPlan } from '../campaign/campaignChannelFlags.util.js';
import { canonicalLandingPageSlug } from '../../utils/landingPageSlugCanonical.util.js';

/**
 * Format user resources for AI campaign prompts.
 * SQL lives in aiCampaignRepository; this layer only shapes data for the LLM.
 * Moved out of aiCampaign.service.js (god-object split PR3).
 */
class AiPromptResourcesService {
  /**
   * P8a — tài khoản kênh adapter (Telegram/WhatsApp) của workspace, CHỈ kênh có cờ bật (cờ tắt → mảng rỗng, không
   * chạm DB/Baileys). `id` Telegram là số; `id` WhatsApp là MÃ PHIÊN chuỗi ("<idChủ>-<tên>"). `usable`: Telegram =
   * còn active; WhatsApp = phiên đang mở (status 'open').
   * @param {number} ownerId workspace owner
   * @returns {Promise<{telegram: Array, whatsapp: Array}>}
   */
  async getAdapterChannelAccounts(ownerId) {
    const result = { telegram: [], whatsapp: [] };
    if (!ownerId) return result;
    const enabled = getEnabledAdapterCampaignChannels();
    if (enabled.includes('telegram')) {
      try {
        const { default: chatbotTelegramRepository } = await import('../../repositories/chatbot/chatbotTelegram.repository.js');
        const rows = await chatbotTelegramRepository.listAccountsByUser(ownerId);
        result.telegram = rows.map((r) => ({
          id: r.id,
          name: r.username || r.first_name || r.phone || `Telegram #${r.id}`,
          usable: r.is_active !== false,
        }));
      } catch (e) {
        console.warn('[AI] Không lấy được tài khoản Telegram:', e.message);
      }
    }
    if (enabled.includes('whatsapp')) {
      try {
        const { listSessions } = await import('../chatbot/whatsappBaileys.service.js');
        const prefix = `${Number(ownerId)}-`;
        result.whatsapp = listSessions()
          .filter((session) => String(session.sessionKey || '').startsWith(prefix))
          .map((session) => ({
            id: session.sessionKey,
            name: session.userName || session.sessionKey,
            usable: session.status === 'open',
          }));
      } catch (e) {
        console.warn('[AI] Không lấy được phiên WhatsApp:', e.message);
      }
    }
    return result;
  }

  /**
   * P8a — dòng liệt kê node gửi Telegram/WhatsApp trong danh sách "NODE TYPES THỰC SỰ TỒN TẠI" của prompt chiến dịch.
   * Rỗng khi cờ tắt; khi có nội dung, bắt đầu bằng xuống dòng.
   */
  getAdapterNodeTypesPromptLines() {
    const enabled = getEnabledAdapterCampaignChannels();
    const lines = [];
    if (enabled.includes('telegram')) {
      lines.push('• action/send_telegram — gửi Telegram, MỘT tin gửi ngay (telegramAccountId, recipientSource: "telegram_conversations" = những người đã từng nhắn tới tài khoản này — LUÔN dùng giá trị này, steps: [{ message }] đúng 1 phần tử). KHÔNG cần select_zalo_account; KHÔNG có delay/nhiều bước. KHÔNG dùng recipientSource "manual" và KHÔNG chép chat id/SĐT người dùng gõ vào node (danh sách người nhận riêng do hệ thống nhận ở bước chuẩn bị gửi, không qua bạn)');
    }
    if (enabled.includes('whatsapp')) {
      lines.push('• action/send_whatsapp — gửi WhatsApp, MỘT tin gửi ngay (whatsappSessionKey, recipientSource: "whatsapp_conversations" = những người đã từng nhắn tới số này (mặc định) | "node" kèm recipientNodeId + recipientColumn khi người dùng đã chọn nguồn Sheet/landing/DB, steps: [{ message }] đúng 1 phần tử). KHÔNG cần select_zalo_account; KHÔNG có delay/nhiều bước. KHÔNG dùng recipientSource "manual" và KHÔNG chép SĐT người dùng gõ vào node (danh sách người nhận riêng do hệ thống nhận ở bước chuẩn bị gửi, không qua bạn)');
    }
    return lines.length > 0 ? `\n${lines.join('\n')}` : '';
  }

  /**
   * P12 — gói của người đang chat không có kênh Zalo: câu cấm dựng node Zalo nối vào prompt chiến dịch (prompt
   * cứng còn liệt kê node Zalo). Rỗng khi có quyền -> prompt giữ nguyên từng byte. Chặn cứng vẫn ở
   * `validateNodeConfig`/`validateCampaignScript` (400 nói đúng lý do), đây là để LLM khỏi dựng ngay từ đầu.
   * @returns {string}
   */
  getBlockedZaloPromptNotice() {
    return isChannelBlockedByPlan('zalo')
      ? '\n⛔ KÊNH ZALO KHÔNG KHẢ DỤNG: gói của người dùng chưa có Zalo. TUYỆT ĐỐI KHÔNG tạo node send_zalo_personal, send_zalo_group, send_zalo_friend_request, select_zalo_account, get_all_friends, get_all_groups; bỏ qua mọi dòng mô tả node Zalo ở trên. Nếu người dùng chỉ muốn Zalo, hãy nói gói chưa có kênh Zalo (mua thêm slot ở Nạp thêm hoặc nâng gói) và đề xuất Email.\n'
      : '';
  }

  /**
   * P8a — đoạn "tài khoản Telegram/WhatsApp" nối vào TÀI NGUYÊN CÓ SẴN của prompt chiến dịch. Rỗng khi cả hai cờ
   * tắt (prompt cũ giữ nguyên từng byte); khi có nội dung, bắt đầu bằng xuống dòng để nối thẳng vào cuối dòng trước.
   * @param {number} ownerId
   * @returns {Promise<string>}
   */
  async getAdapterAccountsPromptBlock(ownerId) {
    if (getEnabledAdapterCampaignChannels().length === 0) return '';
    const accounts = await this.getAdapterChannelAccounts(ownerId);
    const lines = [];
    if (getEnabledAdapterCampaignChannels().includes('telegram')) {
      lines.push('✈️ Tài khoản Telegram (telegramAccountId của send_telegram):');
      lines.push(accounts.telegram.length > 0
        ? accounts.telegram.map((a) => `  - ID: ${a.id} | ${a.name}${a.usable ? '' : ' (đã ngắt kết nối)'}`).join('\n')
        : '  (chưa kết nối — đặt telegramAccountId: null)');
    }
    if (getEnabledAdapterCampaignChannels().includes('whatsapp')) {
      lines.push('🟢 Tài khoản WhatsApp (whatsappSessionKey của send_whatsapp — dùng NGUYÊN mã phiên):');
      lines.push(accounts.whatsapp.length > 0
        ? accounts.whatsapp.map((a) => `  - Mã phiên: "${a.id}" | ${a.name}${a.usable ? '' : ' (chưa kết nối)'}`).join('\n')
        : '  (chưa kết nối — đặt whatsappSessionKey: null)');
    }
    lines.push('Nếu có NHIỀU tài khoản cùng kênh mà người dùng chưa nói dùng cái nào → HỎI lại, KHÔNG tự chọn.');
    return `\n${lines.join('\n')}`;
  }

  /**
   * Lấy danh sách email templates của user để AI điền sẵn config.
   * @param {number} userId
   * @returns {Promise<Array>}
   */
  async getCourses(userId) {
    try {
      const rows = await aiCampaignRepository.getCourses(userId);
      return rows.map((r) => {
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
      return rows.map((r) => ({
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
   * @param {number} userId chủ không gian
   * @param {number[]|null} [accessibleIds] PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3: null = chủ (không lọc); mảng = chỉ các
   *   tài khoản nhân viên ĐƯỢC GIAO (`resolveActorZaloAccessibleIds`). Lỗi tra → [] nên không bao giờ lộ nhầm.
   * @returns {Promise<Array>}
   */
  async getZaloAccounts(userId, accessibleIds = null) {
    try {
      const rows = await aiCampaignRepository.getZaloAccounts(userId, accessibleIds);
      return rows.map((r) => ({
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

  async getZaloAccountsFull(userId, accessibleIds = null) {
    try {
      const rows = await aiCampaignRepository.getZaloAccountsFull(userId, accessibleIds);
      return rows.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        zaloName: r.zalo_name,
        status: r.status,
        isActive: r.is_active,
        isDefault: r.is_default,
      }));
    } catch (e) {
      console.warn('[AI] Không lấy được full Zalo accounts:', e.message);
      return [];
    }
  }

  async getActiveEmailSenders(userId) {
    try {
      const rows = await aiCampaignRepository.getActiveEmailSenders(userId);
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        replyTo: r.reply_to,
        status: r.status,
      }));
    } catch (e) {
      console.warn('[AI] Không lấy được email senders:', e.message);
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
      return rows.map((r) => ({
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
   * Lấy danh sách nhóm Zalo từ tài khoản đầu tiên của user (nhân viên: tài khoản đầu tiên TRONG danh sách được giao).
   * @param {number} userId
   * @param {number[]|null} [accessibleIds] xem getZaloAccounts
   * @returns {Promise<Array>}
   */
  async getZaloGroups(userId, accessibleIds = null) {
    try {
      const accountId = await aiCampaignRepository.getDefaultZaloAccountId(userId, accessibleIds);
      if (!accountId) return [];

      const rows = await aiCampaignRepository.getZaloGroupsByAccountId(accountId);
      return rows.map((r) => ({
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
      return rows.map((r) => ({
        slug: r.slug,
        title: r.title,
        isPublished: r.is_published,
        // PR-5b-2b — Biểu mẫu đã gắn landing này (PR-5b-2a forms.landing_page_id), null nếu chưa
        // gắn/đã bị super admin tắt. Prompt dùng field này để chọn read_form_submissions thay vì
        // read_landing_leads.
        formId: r.form_id != null ? Number(r.form_id) : null,
      }));
    } catch (e) {
      console.warn('[AI] Không lấy được landing pages:', e.message);
      return [];
    }
  }

  /**
   * Rà soát C P2-7 — dữ liệu cho THẺ CHỌN LANDING của wizard (nguồn người nhận "Đăng ký từ Landing Page") và cho dòng "landing nào + bao
   * nhiêu lead" trên thẻ xác nhận. Trả `{ landings, totalLeads }`, hoặc `null` khi tra DB lỗi — nơi gọi PHẢI coi `null` là "chưa biết"
   * (không được suy ra "không có landing nào").
   *
   *  - `leadCount`: số lead (bảng `leads`, `marketing_consent IS NOT FALSE`) gắn landing đó — đúng điều kiện node `read_landing_leads`.
   *  - `formConsentedCount`: landing thu người đăng ký bằng Biểu mẫu thì người nhận là bài nộp đã đồng ý của form (PR-5b-2).
   *  - `totalLeads`: mọi lead của workspace (kể cả lead không gắn landing) — chính là số người node đọc khi KHÔNG lọc slug.
   *
   * @param {number} ownerId workspace owner id
   * @returns {Promise<{ landings: Array<{ slug: string, title: string, isPublished: boolean, formId: number|null, leadCount: number, formConsentedCount: number }>, totalLeads: number }|null>}
   */
  async getLandingPickerOptions(ownerId) {
    if (!ownerId) return { landings: [], totalLeads: 0 };
    try {
      const [pages, leadRows] = await Promise.all([
        aiCampaignRepository.getLandingPickerPages(ownerId),
        aiCampaignRepository.getLeadCountsBySlug(ownerId),
      ]);
      // Slug lead lưu thô (dữ liệu cũ có `/l`, `/`) — gộp về slug chuẩn như bộ lọc `expandLandingSlugsForSqlFilter` đang khớp.
      const countBySlug = new Map();
      let totalLeads = 0;
      for (const row of leadRows || []) {
        const n = Number(row.lead_count) || 0;
        totalLeads += n;
        const raw = row.slug == null ? '' : String(row.slug).trim().toLowerCase();
        if (!raw) continue;
        const key = canonicalLandingPageSlug(raw) ?? (/^\/+$/.test(raw) ? 'l' : null);
        if (key) countBySlug.set(key, (countBySlug.get(key) || 0) + n);
      }
      const seen = new Set();
      const landings = [];
      for (const row of pages || []) {
        const slug = canonicalLandingPageSlug(row.slug);
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        landings.push({
          slug,
          title: String(row.title || slug),
          isPublished: Boolean(row.is_published),
          formId: row.form_id != null ? Number(row.form_id) : null,
          leadCount: countBySlug.get(slug) || 0,
          formConsentedCount: Number(row.form_consented_count) || 0,
        });
      }
      return { landings, totalLeads };
    } catch (e) {
      console.warn('[AI] Không lấy được danh sách landing cho thẻ chọn nguồn:', e.message);
      return null;
    }
  }

  /**
   * Dữ liệu cho thẻ CHỌN BIỂU MẫU của wizard (nguồn "Người điền Biểu mẫu"): cùng danh sách `getForms` (đã xuất bản, chưa bị tắt, tối đa 20)
   * nhưng LỖI tra cứu trả `null` ("chưa biết", cổng chặn và nhắn thử lại) thay vì `[]` ("workspace chưa có biểu mẫu nào").
   * @param {number} ownerId workspace owner id
   * @returns {Promise<{ forms: Array<{ id: number, title: string, consentEnabled: boolean, consentedCount: number }> }|null>}
   */
  async getFormPickerOptions(ownerId) {
    if (!ownerId) return { forms: [] };
    try {
      const rows = await aiCampaignRepository.getForms(ownerId);
      return {
        forms: (Array.isArray(rows) ? rows : []).map((r) => ({
          id: Number(r.id),
          title: String(r.title || `#${r.id}`),
          consentEnabled: Boolean(r.consent_enabled),
          consentedCount: Number(r.consented_count) || 0,
        })),
      };
    } catch (e) {
      console.warn('[AI] Không lấy được danh sách biểu mẫu cho thẻ chọn nguồn:', e.message);
      return null;
    }
  }

  /**
   * PR-6c — danh sách Biểu mẫu (đã xuất bản, chưa bị tắt) để trợ lý AI gợi ý `formId` cho node
   * `read_form_submissions` trong prompt đường tự do.
   * @param {number} userId
   * @returns {Promise<Array<{ id: number, title: string, isPublished: boolean, consentEnabled: boolean, consentedCount: number }>>}
   */
  async getForms(userId) {
    try {
      const rows = await aiCampaignRepository.getForms(userId);
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        isPublished: r.is_published,
        consentEnabled: r.consent_enabled,
        consentedCount: r.consented_count,
      }));
    } catch (e) {
      console.warn('[AI] Không lấy được danh sách biểu mẫu:', e.message);
      return [];
    }
  }

  /**
   * Lấy thông tin khuyến nghị campaign type dựa trên profile doanh nghiệp.
   * @param {number} userId
   * @param {number[]|null} [accessibleIds] xem getZaloAccounts — nhân viên chưa được giao tài khoản nào thì không được gợi ý Zalo
   * @returns {Promise<string>}
   */
  async getRecommendedCampaignType(userId, accessibleIds = null) {
    try {
      const profile = await businessProfileService.getProfile(userId);
      if (!profile) return 'mixed';

      const industry = String(profile.industry || '').toLowerCase();
      const productRows = await productRepository.findAllByUser(userId, { activeOnly: true });
      const products = serializeProductList(productRows).toLowerCase();
      const targetAudience = String(profile.target_audience || '').toLowerCase();

      // Heuristics để gợi ý campaign type phù hợp
      // B2B: Nên dùng email nhiều hơn
      if (industry.includes('b2b') || industry.includes('doanh nghiệp')
          || industry.includes('công nghệ') || industry.includes('phần mềm')) {
        return 'email';
      }

      // B2C / Consumer: Zalo hiệu quả hơn
      if (industry.includes('b2c') || industry.includes('retail')
          || industry.includes('fmcg') || industry.includes('thực phẩm')
          || industry.includes('giáo dục') || industry.includes('sức khỏe')) {
        // Check nếu có Zalo accounts thì gợi Zalo
        const zaloAccounts = await this.getZaloAccounts(userId, accessibleIds);
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
}

export default new AiPromptResourcesService();
