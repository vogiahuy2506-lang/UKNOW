import businessProfileService, { serializeProductList } from './businessProfile.service.js';
import productRepository from '../../repositories/products/product.repository.js';
import aiCampaignRepository from '../../repositories/ai/aiCampaign.repository.js';

/**
 * Format user resources for AI campaign prompts.
 * SQL lives in aiCampaignRepository; this layer only shapes data for the LLM.
 * Moved out of aiCampaign.service.js (god-object split PR3).
 */
class AiPromptResourcesService {
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
   * @param {number} userId
   * @returns {Promise<Array>}
   */
  async getZaloAccounts(userId) {
    try {
      const rows = await aiCampaignRepository.getZaloAccounts(userId);
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

  async getZaloAccountsFull(userId) {
    try {
      const rows = await aiCampaignRepository.getZaloAccountsFull(userId);
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
   * Lấy danh sách nhóm Zalo từ tài khoản đầu tiên của user.
   * @param {number} userId
   * @returns {Promise<Array>}
   */
  async getZaloGroups(userId) {
    try {
      const accountId = await aiCampaignRepository.getDefaultZaloAccountId(userId);
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
      const productRows = await productRepository.findAllByUser(userId);
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
}

export default new AiPromptResourcesService();
