import bcrypt from 'bcryptjs';
import db from '../config/database.js';
import { normalizeReferralCode } from '../utils/affiliateReferral.util.js';
import {
  findPasswordHashByUserId,
  findProfileBase,
  findProfileBaseFallback,
  findProfilePlan,
  findProfilePlanFallback,
  findActiveBillingPeriod,
  findRoleAndLimits,
  findRoleAndLimitsFallback,
  findSuccessfulOrdersForUser,
  findInvoiceProfileByUserId,
  saveInvoiceProfile,
  clearInvoiceProfile,
  findUserByEmailExceptId,
  findUserByPhoneExceptId,
  isCurrentlyAnyonesEmployee,
  revokeAllRefreshTokensForUser,
  updatePasswordHash,
  updateProfile as updateProfileInDb,
  updatePhoneAndResetVerification,
  updateBotDailyReplyCap,
  updateAiHandoffAutoResumeMinutes,
} from '../repositories/user/user.repository.js';
import { isPhoneOtpEnabled } from '../services/sms/otpProvider.service.js';
import usageTrackingService from '../services/payment/usageTracking.service.js';
import { getProfileSendUsage, getProfileResourceUsage } from '../services/user/profileUsage.service.js';
import { resolveBillingUserId } from '../utils/billingCycle.util.js';
import { sumActiveTopupGrants, getWalletBalance } from '../repositories/payment/topup.repository.js';
import {
  buildAddonsPayload,
  isTopupOrderRow,
  mapTopupItemsFromConfig,
} from '../utils/topupDisplay.util.js';
import chatbotRateLimitService from '../services/chatbot/chatbotRateLimit.service.js';
import { invalidateAiHandoffAutoResumeCache } from '../utils/aiHandoffResume.util.js';
import { normalizeBuyerInvoiceProfile } from '../utils/invoiceVat.util.js';
import { normalizeAccountPhone, isValidAccountPhone, INVALID_ACCOUNT_PHONE_MESSAGE } from '../utils/accountPhone.util.js';
import { pushMemberToSheet } from '../utils/memberSheetSync.util.js';
import { validateRegistrationConsents, LEGAL_DOCUMENTS } from '../config/legalDocuments.config.js';
import { recordConsents, getUserConsentHistory, getUserLatestConsents, hasConsentedCurrent, isConsentVersionOutdated } from '../repositories/user/userConsent.repository.js';
import { getAppMenuLayout } from '../services/admin/adminMenu.service.js';
import { acceptMembershipInvite, declineMembershipInvite } from '../services/user/employee.service.js';
import { logWorkspace, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../services/audit.service.js';
import { getRequestAuditContext } from '../utils/auditContext.util.js';
import { getChannelEntitlements } from '../services/campaign/channelEntitlement.service.js';

const AI_HANDOFF_AUTO_RESUME_ALLOWED = new Set([5, 15, 30, 60]);

/** Date | chuỗi ngày → ISO 8601; rỗng hoặc không hợp lệ → null (gói chưa kích hoạt không có kỳ). */
const toIsoOrNull = (value) => {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * Phần mua thêm còn hiệu lực theo chu kỳ billing (không cộng vào hạn mức gói).
 * @param {number|string} billingUserId
 * @param {Date|string|null|undefined} expiresAt
 */
/**
 * Load addons for profile: consumable = wallet {granted,used,remaining}; structural = cycle grants.
 */
async function loadProfileAddons(billingUserId) {
  const [
    zaloWallet,
    emailWallet,
    aiWallet,
    zaloAccounts,
    telegramAccounts,
    whatsappAccounts,
    emailAccounts,
    landingPages,
    chatbots,
    employees,
  ] = await Promise.all([
    getWalletBalance(billingUserId, 'zalo_messages'),
    getWalletBalance(billingUserId, 'emails'),
    getWalletBalance(billingUserId, 'ai_credits'),
    sumActiveTopupGrants(billingUserId, 'zalo_accounts'),
    sumActiveTopupGrants(billingUserId, 'telegram_accounts'),
    sumActiveTopupGrants(billingUserId, 'whatsapp_accounts'),
    sumActiveTopupGrants(billingUserId, 'email_accounts'),
    sumActiveTopupGrants(billingUserId, 'landing_pages'),
    sumActiveTopupGrants(billingUserId, 'chatbots'),
    sumActiveTopupGrants(billingUserId, 'employees'),
  ]);
  return buildAddonsPayload({
    zaloMessages: zaloWallet,
    emails: emailWallet,
    aiCredits: aiWallet,
    zaloAccounts,
    telegramAccounts,
    whatsappAccounts,
    emailAccounts,
    landingPages,
    chatbots,
    employees,
  });
}

/**
 * Chuẩn hóa dữ liệu profile trả về cho frontend.
 *
 * Luồng hoạt động:
 * 1. Map toàn bộ cột snake_case từ DB sang camelCase.
 * 2. Bổ sung fallback role mặc định để tương thích ngược.
 * 3. Luôn trả đủ 5 trường giới hạn để frontend render ổn định.
 *
 * @param {Record<string, any>} userRow dòng dữ liệu user từ DB
 * @returns {Record<string, any>} profile đã chuẩn hóa
 */
const mapProfileResponse = (userRow) => ({
  id: userRow.id,
  username: userRow.username,
  email: userRow.email,
  fullName: userRow.full_name,
  avatarUrl: userRow.avatar_url,
  phone: userRow.phone,
  referralCode: userRow.referral_code ?? null,
  referredByUserId: userRow.referred_by_user_id ?? null,
  referredAt: userRow.referred_at ?? null,
  referralPromptDismissedAt: userRow.referral_prompt_dismissed_at ?? null,
  referrerCode: userRow.referrer_code ?? null,
  referrerName: userRow.referrer_name ?? null,
  consents: userRow.consents || null,
  hasConsented: hasConsentedCurrent(userRow.consents),
  consentVersionOutdated: isConsentVersionOutdated(userRow.consents),
  status: userRow.status,
  role: userRow.role || userRow.role_code || 'user',
  roleCode: userRow.role || userRow.role_code || 'user',
  roleName: userRow.role_name || 'Người dùng',
  maxCampaigns: userRow.max_campaigns ?? null,
  maxZaloAccounts: userRow.max_zalo_accounts ?? null,
  maxWhatsappAccounts: userRow.max_whatsapp_accounts ?? null,
  maxTelegramAccounts: userRow.max_telegram_accounts ?? null,
  maxEmailAccounts: userRow.max_email_accounts ?? null,
  maxEmailTemplates: userRow.max_email_templates ?? null,
  maxZaloTemplates: userRow.max_zalo_templates ?? null,
  maxLandingPages: userRow.max_landing_pages ?? null,
  maxChatbots: userRow.max_chatbots ?? null,
  createdAt: userRow.created_at,
  lastLoginAt: userRow.last_login_at,
  subscriptionExpiresAt: userRow.subscription_expires_at ?? null,
  // Plan info (user_admin only)
  activePlanId: userRow.plan_id ?? userRow.active_plan_id ?? null,
  activePlanName: userRow.plan_name ?? null,
  activePlanCode: userRow.plan_code ?? null,
  activePlanPrice: userRow.plan_price ?? null,
  activePlanPriceYearly: userRow.plan_price_yearly ?? null,
  activeBillingPeriod: userRow.active_billing_period ?? userRow.billing_period ?? 'monthly',
  activePlanIsCustom: Boolean(userRow.plan_is_custom ?? false),
  activePlanFeatures: userRow.plan_features ?? null,
  planMaxEmployees: userRow.plan_max_employees ?? null,
  dailyEmailLimit: userRow.daily_email_limit ?? null,
  monthlyEmailLimit: userRow.monthly_email_limit ?? null,
  dailyZaloLimit: userRow.daily_zalo_limit ?? null,
  monthlyZaloLimit: userRow.monthly_zalo_limit ?? null,
  // Trần TỔNG tin nhắn trong kỳ (Email + Zalo + Telegram + WhatsApp gộp) — cổng gửi tin chặn theo cột này
  // (userSendLimit.util.js). null = gói không đặt. Gói dùng thử: 100 và các trần theo kênh để NULL.
  messagesPerPeriod: userRow.messages_per_period ?? null,
  aiTokensPerPeriod: userRow.ai_tokens_per_period ?? null,
  aiCreditsPerPeriod: userRow.ai_credits_per_period ?? null,
  botDailyReplyCap: userRow.bot_daily_reply_cap ?? null,
  aiHandoffAutoResumeMinutes: userRow.ai_handoff_auto_resume_minutes ?? null,
  planGracePeriodDays: userRow.grace_period_days ?? 0,
});

/**
 * Các số "đã dùng" — CHỈ GET /users/profile mới có (PUT /users/profile dùng mapProfileResponse ở trên, không kèm
 * các trường này): response của PUT chỉ có dòng users vừa lưu nên mọi số đã dùng sẽ là 0/null, mà
 * AccountProfileModal từng gộp thẳng response đó vào hồ sơ đang hiển thị → ghi đè số thật bằng số giả.
 *
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-3 — mọi con số lấy từ ĐÚNG hàm của cổng chặn (xem
 * services/user/profileUsage.service.js). Đồng hồ nào lỗi là null (FE hiện "—"), không phải 0.
 *
 * @param {{
 *   aiTokensUsed?: number|null, aiCreditsUsed?: number|null,
 *   aiCreditCycle?: {cycleStart?: Date|null, cycleEnd?: Date|null}|null,
 *   send: Awaited<ReturnType<typeof getProfileSendUsage>>,
 *   resources: Awaited<ReturnType<typeof getProfileResourceUsage>>,
 * }} input
 */
const mapProfileUsage = ({ aiTokensUsed, aiCreditsUsed, aiCreditCycle, send, resources }) => ({
  aiTokensUsed: Number(aiTokensUsed ?? 0),
  // null khi không đọc được (getCreditUsageForCycle lỗi) — KHÔNG đổi thành 0 giả.
  aiCreditsUsed: aiCreditsUsed == null ? null : Number(aiCreditsUsed),
  // Kỳ hạn mức AI hiện tại (30 ngày từ ngày kích hoạt gói) mà `aiCreditsUsed` được tính trong đó — để trang khách ghi
  // "làm mới ngày …". null khi chưa có gói/không dựng được kỳ.
  aiCreditCycleStart: toIsoOrNull(aiCreditCycle?.cycleStart),
  aiCreditCycleEnd: toIsoOrNull(aiCreditCycle?.cycleEnd),
  // Tin đã gửi trong KỲ của gói (cùng kỳ, cùng hàm đếm với cổng gửi tin). `messaging` = Zalo + Telegram + WhatsApp
  // (cùng hạn mức monthlyZaloLimit), đã gồm tin gửi nhanh.
  sendCycleStart: toIsoOrNull(send.cycleStart),
  sendCycleEnd: toIsoOrNull(send.cycleEnd),
  emailSentCycle: send.emailSentCycle,
  messagingSentCycle: send.messagingSentCycle,
  // Chỉ có số khi gói đặt trần tổng (messagesPerPeriod); nếu không là null.
  combinedSentCycle: send.combinedSentCycle,
  // Chỉ có số khi gói có trần ngày tương ứng (dailyEmailLimit / dailyZaloLimit); nếu không là null.
  emailSentToday: send.emailSentToday,
  messagingSentToday: send.messagingSentToday,
  // Tài nguyên cấu trúc: { used, limit } (limit null = không giới hạn) hoặc null khi đồng hồ đó lỗi.
  resourceUsage: resources,

  // ── TƯƠNG THÍCH NGƯỢC — tên cũ mà bản FE chưa nạp lại còn đọc: PlanSection cũ truyền thẳng
  // `data.emailSentMonth`/`zaloSentMonth` vào UsageBar (thiếu là TypeError trắng trang với gói có trần). Giá trị = số
  // mới ở trên. FE mới không đọc tên nào dưới đây → XOÁ khối này khi FE mới đã lên production ≥ 1 ngày.
  emailSentMonth: send.emailSentCycle,
  zaloSentToday: send.messagingSentToday,
  zaloSentMonth: send.messagingSentCycle,
  chatbotsUsed: resources.chatbots?.used ?? 0,
  landingPagesUsed: resources.landingPages?.used ?? 0,
  zaloAccountsUsed: resources.zaloAccounts?.used ?? 0,
  whatsappAccountsUsed: resources.whatsappAccounts?.used ?? 0,
  telegramAccountsUsed: resources.telegramAccounts?.used ?? 0,
  emailAccountsUsed: resources.emailAccounts?.used ?? 0,
  employeesUsed: resources.employees?.used ?? 0,
});

class UserController {
  /**
   * GET /api/users/channel-entitlements
   * P9 — quyền dùng kênh Telegram/WhatsApp theo gói của CHỦ workspace: { telegram, whatsapp, limits }.
   * `true` = trần null (không giới hạn) hoặc > 0; `limits` là trần thật (null = không giới hạn) để FE hiện thông báo.
   */
  async getChannelEntitlements(req, res) {
    try {
      const data = await getChannelEntitlements(req.user);
      return res.json({ success: true, data });
    } catch (error) {
      const status = error?.statusCode || error?.status;
      if (status && status < 500) {
        return res.status(status).json({ success: false, message: error.message, code: error.code });
      }
      console.error('getChannelEntitlements error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi lấy quyền kênh' });
    }
  }

  /**
   * Lấy thông tin profile của user đang đăng nhập.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getProfile(req, res) {
    try {
      const userId = req.user.id;

      // 1. User base info — separate try/catch only for missing limit columns
      let userRow;
      try {
        userRow = await findProfileBase(userId);
      } catch {
        // Fallback khi migration chưa chạy đủ (thiếu cột limit hoặc subscription_expires_at)
        userRow = await findProfileBaseFallback(userId);
      }

      if (!userRow) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
      }

      const employeeCtx = req.user?.activeContext?.type === 'employee'
        ? req.user.activeContext
        : null;
      const billingOptions = employeeCtx?.ownerId != null
        ? { ownerContextId: employeeCtx.ownerId }
        : {};
      const billingUserId = await resolveBillingUserId(userId, billingOptions);

      let billingRow = userRow;
      if (String(billingUserId) !== String(userId)) {
        try {
          billingRow = await findProfileBase(billingUserId) || userRow;
        } catch {
          try {
            billingRow = await findProfileBaseFallback(billingUserId) || userRow;
          } catch {
            billingRow = userRow;
          }
        }
      }

      // 2. Resolve plan — billing account (owner khi employee context, hoặc self)
      let planRow = null;
      try {
        planRow = await findProfilePlan({
          activePlanId: billingRow.active_plan_id,
          userId: billingUserId,
          email: billingRow.email,
        });
      } catch (err) {
        console.error('[Profile] findProfilePlan failed', { userId, billingUserId, message: err.message });
        try {
          planRow = await findProfilePlanFallback({
            activePlanId: billingRow.active_plan_id,
            userId: billingUserId,
            email: billingRow.email,
          });
        } catch (fallbackErr) {
          console.error('[Profile] findProfilePlanFallback failed', { userId, billingUserId, message: fallbackErr.message });
        }
      }

      // 3. "Đã dùng" — PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-3: mọi đồng hồ (tin gửi theo KỲ, tài nguyên) gọi
      // ĐÚNG hàm của cổng chặn, cùng kỳ (services/user/profileUsage.service.js). Hai hàm này không bao giờ ném lỗi:
      // đồng hồ hỏng → null + console.error kèm tên, đồng hồ khác vẫn có số. Chạy song song với phần AI bên dưới.
      const sendUsagePromise = getProfileSendUsage(billingUserId, planRow);
      const resourceUsagePromise = getProfileResourceUsage(billingUserId);

      // used: null khi đọc lỗi (không đổi thành 0 giả — trang hiện "—").
      let aiCreditUsage = { used: null };
      try {
        aiCreditUsage = await usageTrackingService.getCreditUsageForCycle(userId, null, billingOptions);
      } catch (err) {
        console.error('[Profile] getCreditUsageForCycle failed', { userId, message: err.message });
      }

      let aiTokenUsage = { used: 0 };
      try {
        aiTokenUsage = await usageTrackingService.getResourceUsage(userId, 'ai_token', { cycle: aiCreditUsage?.cycle });
      } catch (err) {
        console.error('[Profile] getResourceUsage(ai_token) failed', { userId, message: err.message });
      }

      const activeBillingPeriod = await findActiveBillingPeriod(billingUserId, billingRow.email);

      const profileRow = {
        ...userRow,
        ...(employeeCtx ? { subscription_expires_at: billingRow.subscription_expires_at } : {}),
        bot_daily_reply_cap: billingRow.bot_daily_reply_cap ?? userRow.bot_daily_reply_cap ?? null,
        ai_handoff_auto_resume_minutes:
          billingRow.ai_handoff_auto_resume_minutes
          ?? userRow.ai_handoff_auto_resume_minutes
          ?? null,
        ...(planRow || {}),
        active_billing_period: activeBillingPeriod,
      };

      const [sendUsage, resourceUsage] = await Promise.all([sendUsagePromise, resourceUsagePromise]);
      const usageFields = mapProfileUsage({
        aiTokensUsed: aiTokenUsage.used,
        aiCreditsUsed: aiCreditUsage.used,
        // Cùng `cycle` mà getCreditUsageForCycle đã dùng để tính aiCreditsUsed (không dựng kỳ lần hai → không lệch).
        aiCreditCycle: aiCreditUsage.cycle,
        send: sendUsage,
        resources: resourceUsage,
      });

      let addons = null;
      try {
        // Grant neo theo subscription_expires_at của billing user — luôn lấy từ
        // billingRow (kể cả khi employee tự resolve owner qua user_members, không có X-Owner-Context).
        addons = await loadProfileAddons(billingUserId);
      } catch (err) {
        console.error('[Profile] loadProfileAddons failed', { userId, billingUserId, message: err.message });
      }

      const data = { ...mapProfileResponse(profileRow), ...usageFields, addons };
      data.chatbotRateLimits = chatbotRateLimitService.systemLimits;
      try {
        // billingUserId — bộ đếm Redis khoá theo chủ workspace, không phải employee
        data.botRepliesUsedToday =
          await chatbotRateLimitService.getOwnerUsedToday(billingUserId);
      } catch (err) {
        console.warn('[Profile] getOwnerUsedToday failed', {
          billingUserId,
          message: err.message,
        });
        data.botRepliesUsedToday = 0;
      }

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * Cập nhật thông tin profile (họ tên, email, số điện thoại, avatar).
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const { fullName, email, phone, avatarUrl } = req.body;

      if (email !== undefined) {
        const existingEmail = await findUserByEmailExceptId(email, userId);
        if (existingEmail) {
          return res.status(400).json({
            success: false,
            message: 'Email đã được sử dụng',
          });
        }
      }

      // Route đa năng này ghi thẳng `phone` từ trước khi có idx_users_phone_unique
      // (migration 179) — không chuẩn hoá, không kiểm trùng. Từ khi có ràng buộc UNIQUE,
      // để nguyên sẽ vỡ 500 thô khi trùng, hoặc lưu giá trị lệch với
      // normalizeAccountPhone mà PUT /users/me/phone dùng. Vá tại đây thay vì
      // chỉ vá đường mới, để chỉ có một chỗ ghi `phone` không qua chuẩn hoá.
      let normalizedPhone = phone;
      if (phone !== undefined && phone !== null) {
        normalizedPhone = normalizeAccountPhone(phone);
        if (!isValidAccountPhone(normalizedPhone)) {
          return res.status(400).json({ success: false, message: INVALID_ACCOUNT_PHONE_MESSAGE });
        }
        const existingPhone = await findUserByPhoneExceptId(normalizedPhone, userId);
        if (existingPhone) {
          return res.status(409).json({
            success: false,
            code: 'PHONE_TAKEN',
            message: 'Số điện thoại này đã được dùng cho một tài khoản khác. Vui lòng dùng số khác.',
          });
        }
      }

      const user = await updateProfileInDb(userId, { fullName, email, phone: normalizedPhone, avatarUrl });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy người dùng',
        });
      }

      let roleAndLimits = null;
      try {
        roleAndLimits = await findRoleAndLimits(userId);
      } catch {
        // Fallback không dùng JOIN để tránh lỗi khi id_role hoặc các cột limit chưa tồn tại
        try {
          roleAndLimits = await findRoleAndLimitsFallback(userId);
        } catch {
          roleAndLimits = null;
        }
      }

      // Review PR-N3b (12/09/2026): dòng RETURNING của updateProfileInDb KHÔNG có `consents`, mà
      // mapProfileResponse tính hasConsented từ đúng trường đó → response luôn hasConsented:false.
      // AccountProfileModal gộp response vào user trong store, và modal đồng ý giờ BẮT BUỘC
      // (không đóng được) → lưu hồ sơ xong là bị hỏi đồng ý lại, E2E profile.spec đỏ vì overlay.
      // Nạp trạng thái đồng ý thật trước khi map — cùng nguồn với /auth/me.
      let latestConsents = null;
      try {
        latestConsents = await getUserLatestConsents(userId);
      } catch (consentErr) {
        console.warn('[updateProfile] Không đọc được user_consents:', consentErr.message);
      }
      const userProfileRow = {
        ...user,
        ...(roleAndLimits || {}),
        consents: latestConsents,
      };

      let addons = null;
      try {
        const employeeCtx = req.user?.activeContext?.type === 'employee'
          ? req.user.activeContext
          : null;
        const billingOptions = employeeCtx?.ownerId != null
          ? { ownerContextId: employeeCtx.ownerId }
          : {};
        const billingUserId = await resolveBillingUserId(userId, billingOptions);
        let expiresAt = userProfileRow.subscription_expires_at ?? null;
        if (String(billingUserId) !== String(userId)) {
          try {
            const billingBase = await findProfileBase(billingUserId);
            expiresAt = billingBase?.subscription_expires_at ?? expiresAt;
          } catch {
            // keep expiresAt from self
          }
        }
        addons = await loadProfileAddons(billingUserId);
      } catch (err) {
        console.error('[Profile] loadProfileAddons on update failed', { userId, message: err.message });
      }

      res.json({
        success: true,
        message: 'Cập nhật thông tin thành công',
        data: { ...mapProfileResponse(userProfileRow), addons },
      });
    } catch (error) {
      if (error.code === '23505' && String(error.detail || '').includes('phone')) {
        return res.status(409).json({
          success: false,
          code: 'PHONE_TAKEN',
          message: 'Số điện thoại này đã được dùng cho một tài khoản khác. Vui lòng dùng số khác.',
        });
      }
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }

  /**
   * PUT /api/users/me/phone
   * Bổ sung/đổi SĐT — dùng cho modal bắt buộc sau requirePhone (authorization.middleware.js).
   * KHÔNG đi qua requirePhone (route này chính là lối thoát của cổng đó — xem
   * user.routes.js). Kiểm trùng loại trừ chính mình: gửi lại đúng số đang có là no-op 200.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async updatePhone(req, res) {
    try {
      const userId = req.user.id;
      const normalizedPhone = normalizeAccountPhone(req.body?.phone);
      if (!isValidAccountPhone(normalizedPhone)) {
        return res.status(400).json({ success: false, message: INVALID_ACCOUNT_PHONE_MESSAGE });
      }

      const existingPhone = await findUserByPhoneExceptId(normalizedPhone, userId);
      if (existingPhone) {
        return res.status(409).json({
          success: false,
          code: 'PHONE_TAKEN',
          message: 'Số điện thoại này đã được dùng cho một tài khoản khác. Vui lòng dùng số khác.',
        });
      }

      // PR-1 xác thực SĐT (2026-09-11): khi tính năng bật, đổi số LUÔN reset
      // phone_verified_at về NULL — số mới chưa từng được xác thực bằng OTP, kể cả khi
      // trùng với số đã xác thực TRƯỚC ĐÓ của chính user này (không có "nhớ lại" trạng thái
      // xác thực cũ). Khi tắt, giữ nguyên updateProfileInDb như hôm nay — Bẫy #6.
      const otpEnabled = isPhoneOtpEnabled();
      const user = otpEnabled
        ? await updatePhoneAndResetVerification(userId, normalizedPhone)
        : await updateProfileInDb(userId, { phone: normalizedPhone });
      if (!user) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
      }

      // Đẩy sang Google Sheet thành viên — CHỈ khi không phải nhân viên của ai
      // (role='employee' không tồn tại trong sản phẩm, tư cách nằm ở bảng user_members;
      // xem PLAN_SDT_BAT_BUOC_SYNC_SHEET_2026-09-02.md mục 2.3, Bẫy #5b). Đây là chỗ
      // DUY NHẤT thực sự cần kiểm — user hoàn thành modal SĐT ở đây có thể là nhân viên
      // cũ chưa từng có SĐT, khác với register() luôn tạo user hoàn toàn mới.
      if (req.user.role === 'user') {
        isCurrentlyAnyonesEmployee(userId)
          .then((isEmployee) => {
            if (isEmployee) return;
            return pushMemberToSheet({
              email: req.user.email,
              phone: user.phone,
              fullName: req.user.full_name,
              createdAt: new Date(),
              // Số vừa đổi ở đây chưa bao giờ xác thực — đúng khi otpEnabled=false cũng vậy
              // (mặc định phoneVerified=false của pushMemberToSheet), viết rõ ra cho khỏi ngầm định.
              phoneVerified: false,
            });
          })
          .catch((err) => console.warn('[MemberSheet] Failed to push:', err.message));
      }

      return res.json({
        success: true,
        message: 'Đã cập nhật số điện thoại',
        data: { phone: user.phone },
      });
    } catch (error) {
      if (error.code === '23505' && String(error.detail || '').includes('phone')) {
        return res.status(409).json({
          success: false,
          code: 'PHONE_TAKEN',
          message: 'Số điện thoại này đã được dùng cho một tài khoản khác. Vui lòng dùng số khác.',
        });
      }
      console.error('Update phone error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * POST /api/users/me/referral-prompt/dismiss
   * Ghi nhận người dùng bấm "Bỏ qua" ở bảng nhập mã giới thiệu (luật sếp 19/09/2026: bỏ qua
   * thì thôi, không cho nhập bổ sung). Idempotent: đã ghi rồi thì giữ mốc cũ. Tài khoản đã có
   * người giới thiệu thì không có gì để bỏ qua → trả null, không lỗi.
   */
  async dismissReferralPrompt(req, res) {
    try {
      const userId = req.user.id;
      const { rows } = await db.query(
        `UPDATE users
         SET referral_prompt_dismissed_at = COALESCE(referral_prompt_dismissed_at, CURRENT_TIMESTAMP)
         WHERE id = $1 AND referred_by_user_id IS NULL
         RETURNING referral_prompt_dismissed_at`,
        [userId]
      );
      return res.json({
        success: true,
        data: {
          referralPromptDismissedAt: rows[0]?.referral_prompt_dismissed_at ?? null,
        },
      });
    } catch (error) {
      console.error('Lỗi ghi nhận bỏ qua mã giới thiệu:', error);
      return res.status(500).json({ success: false, message: 'Không ghi nhận được thao tác bỏ qua' });
    }
  }

  /**
   * POST /api/users/me/memberships/:ownerId/accept
   * Người bị chủ nhóm khác liên kết (origin='linked') tự chấp nhận lời mời. Self context bắt
   * buộc (route gắn requireSelfContext) — không chấp nhận hộ trong khi đang đứng ở không gian
   * của một chủ khác.
   */
  async acceptMembership(req, res) {
    try {
      const employeeId = req.user.id;
      const ownerId = Number(req.params.ownerId);
      if (!Number.isFinite(ownerId) || ownerId <= 0) {
        return res.status(400).json({ success: false, message: 'ownerId không hợp lệ' });
      }
      const result = await acceptMembershipInvite(employeeId, ownerId);
      await logWorkspace(
        { userId: employeeId, ownerId, ...getRequestAuditContext(req) },
        AUDIT_ACTIONS.EMPLOYEE_INVITE_ACCEPTED,
        AUDIT_ENTITY_TYPES.EMPLOYEE,
        ownerId,
        {}
      );
      return res.json({ success: true, message: 'Đã chấp nhận lời mời', data: result });
    } catch (error) {
      if (error?.status) {
        return res.status(error.status).json({ success: false, message: error.message });
      }
      console.error('acceptMembership error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * POST /api/users/me/memberships/:ownerId/decline
   * Từ chối lời mời — xoá hẳn dòng user_members đang chờ.
   */
  async declineMembership(req, res) {
    try {
      const employeeId = req.user.id;
      const ownerId = Number(req.params.ownerId);
      if (!Number.isFinite(ownerId) || ownerId <= 0) {
        return res.status(400).json({ success: false, message: 'ownerId không hợp lệ' });
      }
      const result = await declineMembershipInvite(employeeId, ownerId);
      await logWorkspace(
        { userId: employeeId, ownerId, ...getRequestAuditContext(req) },
        AUDIT_ACTIONS.EMPLOYEE_INVITE_DECLINED,
        AUDIT_ENTITY_TYPES.EMPLOYEE,
        ownerId,
        {}
      );
      return res.json({ success: true, message: 'Đã từ chối lời mời', data: result });
    } catch (error) {
      if (error?.status) {
        return res.status(error.status).json({ success: false, message: error.message });
      }
      console.error('declineMembership error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * POST /api/users/me/referrer
   * Liên kết người giới thiệu khi vừa đăng ký tài khoản mới.
   */
  async bindReferrer(req, res) {
    try {
      const userId = req.user.id;
      const rawCode = req.body?.referralCode;
      const cleanRefCode = normalizeReferralCode(rawCode);

      if (!cleanRefCode) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập mã giới thiệu',
        });
      }

      const { rows: userRows } = await db.query(
        'SELECT id, email, phone, referred_by_user_id, referral_prompt_dismissed_at, created_at FROM users WHERE id = $1',
        [userId]
      );
      if (userRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
      }

      const currentUser = userRows[0];

      if (currentUser.referred_by_user_id) {
        return res.status(400).json({
          success: false,
          message: 'Tài khoản của bạn đã được liên kết người giới thiệu trước đó',
        });
      }

      // Luật sếp 19/09/2026: đã bấm "Bỏ qua" ở bảng nhập mã thì không cho nhập bổ sung,
      // kể cả còn trong 24h đầu hay đổi sang máy/trình duyệt khác.
      if (currentUser.referral_prompt_dismissed_at) {
        return res.status(400).json({
          success: false,
          code: 'REFERRAL_PROMPT_DISMISSED',
          message: 'Bạn đã bỏ qua bước nhập mã giới thiệu khi đăng ký nên không thể bổ sung sau',
        });
      }

      const createdAtMs = new Date(currentUser.created_at).getTime();
      const nowMs = Date.now();
      const hoursSinceCreation = (nowMs - createdAtMs) / (1000 * 60 * 60);
      if (hoursSinceCreation > 24) {
        return res.status(400).json({
          success: false,
          message: 'Đã quá thời hạn liên kết mã giới thiệu (chỉ áp dụng khi mới đăng ký tài khoản)',
        });
      }

      const { rows: referrerRows } = await db.query(
        'SELECT id, email, phone, referral_code, full_name, username FROM users WHERE referral_code = $1',
        [cleanRefCode]
      );
      if (referrerRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Mã giới thiệu không tồn tại hoặc không hợp lệ',
        });
      }

      const referrer = referrerRows[0];

      const isSelf = String(referrer.id) === String(currentUser.id)
        || (referrer.email && currentUser.email && referrer.email.toLowerCase() === currentUser.email.toLowerCase())
        || (referrer.phone && currentUser.phone && referrer.phone === currentUser.phone);

      if (isSelf) {
        return res.status(400).json({
          success: false,
          message: 'Bạn không thể tự nhập mã giới thiệu của chính mình',
        });
      }

      const { rows: updatedRows } = await db.query(
        `UPDATE users
         SET referred_by_user_id = $1, referred_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND referred_by_user_id IS NULL
         RETURNING id, referred_by_user_id, referred_at`,
        [referrer.id, userId]
      );

      if (updatedRows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Tài khoản đã có người giới thiệu',
        });
      }

      return res.json({
        success: true,
        message: 'Liên kết người giới thiệu thành công',
        data: {
          referredByUserId: referrer.id,
          referrerCode: referrer.referral_code,
          referrerName: referrer.full_name || referrer.username,
        },
      });
    } catch (error) {
      console.error('bindReferrer error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi liên kết mã giới thiệu' });
    }
  }

  /**
   * PATCH /api/users/bot-daily-reply-cap
   * Chủ tài khoản đặt trần lượt bot trả lời mỗi ngày (null = không giới hạn thêm).
   * Guard requireSelfContext trên route.
   */
  async updateBotDailyReplyCap(req, res) {
    try {
      const userId = req.user.id;
      const raw = req.body?.botDailyReplyCap;

      let cap = null;
      if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
        const n = Number.parseInt(String(raw), 10);
        if (!Number.isFinite(n) || n <= 0) {
          return res.status(400).json({
            success: false,
            message: 'Giới hạn phải là số nguyên dương, hoặc để trống để bỏ giới hạn',
          });
        }
        cap = n;
      }

      const row = await updateBotDailyReplyCap(userId, cap);
      if (!row) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
      }

      chatbotRateLimitService.invalidateOwnerCapCache(userId);

      return res.json({
        success: true,
        data: { botDailyReplyCap: row.bot_daily_reply_cap ?? null },
      });
    } catch (error) {
      console.error('Update bot daily reply cap error:', error);
      if (error?.code === '23514') {
        return res.status(400).json({
          success: false,
          message: 'Giới hạn phải là số nguyên dương, hoặc để trống để bỏ giới hạn',
        });
      }
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * PATCH /api/users/ai-handoff-auto-resume
   * Chủ tài khoản đặt phút tự bật lại AI sau handoff (null = tắt).
   * Guard requireSelfContext trên route.
   */
  async updateAiHandoffAutoResume(req, res) {
    try {
      const userId = req.user.id;
      const raw = req.body?.aiHandoffAutoResumeMinutes;

      let minutes = null;
      if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
        const n = Number.parseInt(String(raw), 10);
        if (!AI_HANDOFF_AUTO_RESUME_ALLOWED.has(n)) {
          return res.status(400).json({
            success: false,
            message: 'Giá trị phải là 5, 15, 30, 60 phút, hoặc để trống để tắt',
          });
        }
        minutes = n;
      }

      const row = await updateAiHandoffAutoResumeMinutes(userId, minutes);
      if (!row) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
      }

      invalidateAiHandoffAutoResumeCache(userId);

      return res.json({
        success: true,
        data: {
          aiHandoffAutoResumeMinutes: row.ai_handoff_auto_resume_minutes ?? null,
        },
      });
    } catch (error) {
      console.error('Update AI handoff auto-resume error:', error);
      if (error?.code === '23514') {
        return res.status(400).json({
          success: false,
          message: 'Giá trị phải là 5, 15, 30, 60 phút, hoặc để trống để tắt',
        });
      }
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * Đổi mật khẩu: xác thực mật khẩu hiện tại trước khi cập nhật.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async changePassword(req, res) {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;

      // Lấy mật khẩu hiện tại
      const user = await findPasswordHashByUserId(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy người dùng'
        });
      }

      // Kiểm tra mật khẩu hiện tại
      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      
      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: 'Mật khẩu hiện tại không đúng'
        });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Cập nhật mật khẩu
      await updatePasswordHash(userId, newPasswordHash);
      await revokeAllRefreshTokensForUser(userId, 'password_changed');

      res.json({
        success: true,
        message: 'Đổi mật khẩu thành công'
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }

  /**
   * Lấy lịch sử mua gói dịch vụ của user đang đăng nhập.
   * Tìm theo user_id hoặc user_email để bắt cả đơn cũ tạo trước khi có cột user_id.
   */
  async getMyOrders(req, res) {
    try {
      const userId = req.user.id;
      const userEmail = req.user.email;

      const orders = await findSuccessfulOrdersForUser({ userId, userEmail });

      res.json({
        success: true,
        data: orders.map((row) => {
          const kind = isTopupOrderRow(row) ? 'topup' : 'plan';
          return {
            id: row.id,
            orderCode: String(row.order_code),
            amount: Number(row.amount),
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            kind,
            topup: kind === 'topup'
              ? { items: mapTopupItemsFromConfig(row.topup_config) }
              : null,
            plan: row.plan_id ? {
              id: row.plan_id,
              name: row.plan_name,
              code: row.plan_code,
              dailyEmailLimit: row.daily_email_limit,
              monthlyEmailLimit: row.monthly_email_limit,
              dailyZaloLimit: row.daily_zalo_limit,
              monthlyZaloLimit: row.monthly_zalo_limit,
            } : null,
            invoice: row.einvoice_status ? {
              status: row.einvoice_status,
              soHdon: row.so_hdon,
              khhdon: row.khhdon,
              emailStatus: row.einvoice_email_status,
              issuedAt: row.einvoice_issued_at,
            } : null,
          };
        }),
      });
    } catch (error) {
      console.error('Get my orders error:', error);
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * GET /api/users/invoice-profile
   * Trả hồ sơ xuất hoá đơn đã lưu của user (hoặc null).
   */
  async getInvoiceProfile(req, res) {
    try {
      const userId = req.user.id;
      const profile = await findInvoiceProfileByUserId(userId);
      res.json({ success: true, data: profile });
    } catch (error) {
      console.error('Get invoice profile error:', error.message);
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * PUT /api/users/invoice-profile
   * Lưu hoặc cập nhật hồ sơ xuất hoá đơn của user.
   */
  async updateInvoiceProfile(req, res) {
    try {
      const userId = req.user.id;
      const normalized = normalizeBuyerInvoiceProfile(req.body);
      const saved = await saveInvoiceProfile(userId, normalized);
      res.json({ success: true, data: saved });
    } catch (error) {
      if (error?.status) {
        return res.status(error.status).json({ success: false, message: error.message });
      }
      console.error('Update invoice profile error:', error.message);
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * DELETE /api/users/invoice-profile
   * Xoá hồ sơ xuất hoá đơn đã lưu của user.
   */
  async deleteInvoiceProfile(req, res) {
    try {
      const userId = req.user.id;
      await clearInvoiceProfile(userId);
      res.json({ success: true, message: 'Đã xoá thông tin xuất hoá đơn đã lưu' });
    } catch (error) {
      console.error('Delete invoice profile error:', error.message);
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * POST /api/users/consents
   * Ghi nhận đồng ý bổ sung điều khoản cho người dùng cũ (PR-N3a).
   */
  async recordReconsent(req, res) {
    try {
      const consents = req.body?.consents && typeof req.body.consents === 'object' ? req.body.consents : req.body;
      validateRegistrationConsents(consents);

      const ipAddress = req.ip || req.socket?.remoteAddress || null;
      const userAgent = req.headers['user-agent'] || null;

      const recorded = await recordConsents({
        userId: req.user.id,
        consents: {
          terms: Boolean(consents.terms),
          privacy: Boolean(consents.privacy),
          dpa: Boolean(consents.dpa),
        },
        source: 'reconsent',
        ipAddress,
        userAgent,
      });

      const recordedConsents = {
        terms: { granted: true, document_version: LEGAL_DOCUMENTS.terms.version },
        privacy: { granted: true, document_version: LEGAL_DOCUMENTS.privacy.version },
        dpa: { granted: true, document_version: LEGAL_DOCUMENTS.dpa.version },
      };

      return res.status(200).json({
        success: true,
        message: 'Đã ghi nhận đồng ý điều khoản',
        data: {
          consents: recordedConsents,
          hasConsented: hasConsentedCurrent(recordedConsents),
          consentVersionOutdated: false,
          recorded,
        },
      });
    } catch (error) {
      if (error?.status) {
        return res.status(error.status).json({
          success: false,
          error: error.message,
          message: error.message,
          code: error.code,
        });
      }
      console.error('recordReconsent error:', error);
      return res.status(500).json({
        success: false,
        error: 'Không thể ghi nhận đồng ý',
        message: 'Không thể ghi nhận đồng ý',
      });
    }
  }

  /**
   * GET /api/users/consents
   * Lấy lịch sử đồng ý của người dùng (PR-N3a).
   */
  async getConsents(req, res) {
    try {
      const history = await getUserConsentHistory(req.user.id);
      return res.json({
        success: true,
        data: history.map((row) => ({
          id: row.id,
          userId: row.user_id,
          purpose: row.purpose,
          granted: row.granted,
          documentVersion: row.document_version,
          document_version: row.document_version,
          documentHash: row.document_hash,
          source: row.source,
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
          createdAt: row.created_at,
          created_at: row.created_at,
        })),
      });
    } catch (error) {
      console.error('getConsents error:', error);
      return res.status(500).json({
        success: false,
        error: 'Không thể lấy lịch sử đồng ý',
        message: 'Không thể lấy lịch sử đồng ý',
      });
    }
  }

  /**
   * GET /api/users/app-menu-layout
   * Lấy cấu hình chuyên mục menu ứng dụng cho khách (/app).
   * Chỉ authMiddleware, trả riêng categories (KHÔNG nhét vào /auth/me).
   */
  async getAppMenuLayout(_req, res) {
    try {
      const data = await getAppMenuLayout();
      return res.json({
        success: true,
        data: {
          categories: data.categories || [],
          links: data.links || [],
        },
      });
    } catch (error) {
      console.error('[userController.getAppMenuLayout] request failed:', error);
      // Bảng admin_menu_layouts đã có từ migration 201, nhánh 42P01 chỉ phòng môi trường test/dev lạ.
      // Lỗi thật khi chưa chạy migration 205 là 23514 (check_violation) lúc PUT scope app_user,
      // để nguyên 500 vì quy trình deploy luôn chạy migration trước khi khởi động backend.
      if (error?.code === '42P01') {
        return res.json({
          success: true,
          data: { categories: [], links: [] },
        });
      }
      return res.status(500).json({
        success: false,
        message: 'Không thể tải cấu hình menu',
      });
    }
  }
}

export default new UserController();
