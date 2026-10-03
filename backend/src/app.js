// dotenv được load ở src/index.js (production entrypoint) hoặc bởi test runner.
// Không import dotenv ở đây để app.js có thể được import độc lập trong test
// mà không nuốt nhầm config production (vd PGSSLMODE=require của Neon).
// TODO: Ensure backend routes are properly registered
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { globalLimiter, webhookLimiter } from './middleware/rateLimiter.middleware.js';
import { attachUserIdForRateLimit } from './middleware/auth.middleware.js';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import emailSettingsRoutes from './routes/emailSettings.routes.js';
import emailTemplateRoutes from './routes/emailTemplate.routes.js';
import campaignRoutes from './routes/campaign.routes.js';
import campaignScheduleRoutes from './routes/campaignSchedule.routes.js';
import campaignRunRoutes from './routes/campaignRun.routes.js';
import customerRoutes from './routes/customer.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import founderaiRoutes from './routes/founderai.routes.js';
import googleSheetsRoutes from './routes/googleSheets.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import storageRoutes from './routes/storage.routes.js';
import downloadRoutes from './routes/download.routes.js';
import trackingRoutes from './routes/tracking.routes.js';
import trackingShortLinkRoutes from './routes/trackingShortLink.routes.js';
import attachmentsRoutes from './routes/attachments.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import coursesRoutes from './routes/courses.routes.js';
import productsRoutes from './routes/products.routes.js';
import zaloSettingsRoutes from './routes/zaloSettings.routes.js';
import zaloTemplateRoutes from './routes/zaloTemplate.routes.js';
import whatsappSettingsRoutes from './routes/whatsappSettings.routes.js';
import whatsappBaileysRoutes from './routes/whatsappBaileys.routes.js';
import facebookSettingsRoutes from './routes/facebookSettings.routes.js';
import publicPromotionRoutes from './routes/publicPromotion.routes.js';
import landingCmsPublicRoutes from './routes/landingCmsPublic.routes.js';
import leadPublicRoutes from './routes/leadPublic.routes.js';
import formPublicRoutes from './routes/formPublic.routes.js';
import publicRoutes from './routes/public.routes.js';
import verificationRoutes from './routes/verification.routes.js';
import leadRoutes from './routes/lead.routes.js';
import formRoutes from './routes/form.routes.js';
import adminLandingFeaturedCourseRoutes from './routes/adminLandingFeaturedCourse.routes.js';
import adminLandingTestimonialRoutes from './routes/adminLandingTestimonial.routes.js';
import adminLandingPageRoutes from './routes/adminLandingPage.routes.js';
import adminLandingCustomizerRoutes from './routes/adminLandingCustomizer.routes.js';
import adminLandingSectionRoutes from './routes/adminLandingSection.routes.js';
import adminStatsRoutes from './routes/adminStats.routes.js';
import adminPlansRoutes from './routes/adminPlans.routes.js';
import adminMembersRoutes from './routes/adminMembers.routes.js';
import adminFormsRoutes from './routes/adminForms.routes.js';
import adminOrdersRoutes from './routes/adminOrders.routes.js';
import adminEinvoiceRoutes from './routes/adminEinvoice.routes.js';
import adminVouchersRoutes from './routes/adminVouchers.routes.js';
import adminSystemRoutes from './routes/adminSystem.routes.js';
import adminDeliveryMonitorRoutes from './routes/adminDeliveryMonitor.routes.js';
import adminAlertsRoutes from './routes/adminAlerts.routes.js';
import adminFunnelRoutes from './routes/adminFunnel.routes.js';
import adminAiUsageRoutes from './routes/adminAiUsage.routes.js';
import adminAiModelsRoutes from './routes/adminAiModels.routes.js';
import adminBulkNotificationRoutes from './routes/adminBulkNotification.routes.js';
import adminNotificationRoutes from './routes/adminNotification.routes.js';
import adminMenuRoutes from './routes/adminMenu.routes.js';
import adminSystemEmailTemplateRoutes from './routes/adminSystemEmailTemplate.routes.js';
import adminSubscriptionReminderSettingsRoutes from './routes/adminSubscriptionReminderSettings.routes.js';
import userDeliveryMonitorRoutes from './routes/userDeliveryMonitor.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import planRoutes from './routes/plan.routes.js';
import topupRoutes from './routes/topup.routes.js';
import helpRoutes from './routes/help.routes.js';
import voucherRoutes from './routes/voucher.routes.js';
import contactRoutes from './routes/contact.routes.js';
import employeeRoutes from './routes/employee.routes.js';
import aiRoutes from './routes/ai.routes.js';
import chatbotRoutes from './routes/chatbot.routes.js';
import chatbotPublicRoutes from './routes/chatbotPublic.routes.js';
import internalRoutes from './routes/internal.routes.js';
import heroConsultationRoutes from './routes/heroConsultation.routes.js';
import landingTemplateRoutes from './routes/landingTemplate.routes.js';
import landingAssetRoutes from './routes/landingAsset.routes.js';
import auditRoutes from './routes/audit.routes.js';
import mediaLibraryRoutes from './routes/mediaLibrary.routes.js';
import adminAuditLogsRoutes from './routes/adminAuditLogs.routes.js';
import diagnosticRoutes from './routes/diagnostic.routes.js';
import templateLabelRoutes from './routes/templateLabel.routes.js';
import marketplaceRoutes from './routes/marketplace.routes.js';
import marketplaceAdminRoutes from './routes/marketplaceAdmin.routes.js';
import marketplaceSellerRoutes from './routes/marketplaceSeller.routes.js';
import {
  affiliateWithdrawalRouter,
  adminAffiliateWithdrawalRouter,
  affiliateRouter,
  adminAffiliateRouter,
} from './routes/affiliateWithdrawal.routes.js';
import { domainResolver } from './middleware/domainResolver.js';
import { createDynamicCorsMiddleware, publicCorsMiddleware } from './middleware/dynamicCors.middleware.js';
import landingPagePublicController from './controllers/landingPagePublic.controller.js';
import chatbotRepository from './repositories/ai/chatbot.repository.js';
import { getRuntimeReadiness } from './utils/runtimeReadiness.util.js';
import { applyTrustProxy } from './config/cloudflareIpRanges.js';

/**
 * Khởi tạo Express app (không listen).
 * Tách hàm này để integration test có thể supertest(app) mà không phải bind port.
 *
 * @returns {import('express').Express}
 */
export function createApp() {
  const app = express();

  // VPS/nginx + Cloudflare gửi X-Forwarded-For nhiều chặng. Chỉ tin các chặng nội bộ và dải IP
  // Cloudflare; `1` sẽ làm req.ip = IP máy Cloudflare, `true` cho kẻ gọi thẳng :5001 giả IP.
  applyTrustProxy(app);

  // Dynamic CORS - allows verified domains and known subdomains
  const dynamicCors = createDynamicCorsMiddleware();
  app.use(dynamicCors);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // CSP tắt hoàn toàn: landing pages là HTML user-generated, paste từ AI/web builder
      // thường chứa CDN (tailwind, font-awesome, zingmp3 iframe, cloudflare beacon, tracking
      // pixels...) mà không thể liệt kê trước. Set `false` để helmet KHÔNG gắn header
      // Content-Security-Policy lên bất kỳ response nào (SPA, /api/*, landing đều tự do).
      contentSecurityPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    })
  );
  // CORS handled by dynamicCors middleware above
  // Tắt morgan trong môi trường test để output Jest sạch.
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }
  // Chat CÔNG KHAI (widget, trang chatbot công khai, tư vấn trang chủ): không đăng nhập, ai cũng gọi được →
  // body tối đa 64kb. Parser này PHẢI đứng TRƯỚC parser 5mb bên dưới: body-parser đánh dấu `req._body` khi đã
  // đọc xong nên parser toàn cục bỏ qua; đứng sau thì 5mb đã bị nuốt rồi (A P0-4/D-01: body 5 MB = ~1,3 USD/lượt Gemini).
  // Tin tối đa 2.000 ký tự + 10 tin lịch sử × 1.000 ký tự + vài đính kèm ≈ chục KB nên 64kb dư. Không phải webhook,
  // không cần rawBody. Body vượt trần → 413 (xử lý ở error handler bên dưới).
  app.use(['/api/chatbot-public', '/api/public/hero'], express.json({ limit: '64kb' }));
  // Ghi lại raw body để xác thực chữ ký HMAC-SHA256 của webhook
  app.use(
    express.json({
      limit: '5mb',
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use(cookieParser());

  // Resolve custom hostname (*.founderai.biz) → landing page slug
  app.use(domainResolver);

  // Soft-resolve user id for rate-limit keys (never 401) then global limit
  app.use('/api', attachUserIdForRateLimit, globalLimiter);

  // PLAN_SUA_SAU_NGHIEM_THU_2026-09-29 mục 1.F — limiter chống brute-force login giờ gắn theo
  // từng route trong auth.routes.js (loginAccountLimiter/loginIpLimiter/authCredentialLimiter),
  // không còn áp cho cả router (trước đây đếm nhầm cả /me, /refresh-token, /features).
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/email-settings', emailSettingsRoutes);
  app.use('/api/email-templates', emailTemplateRoutes);
  app.use('/api/campaigns', campaignRoutes);
  app.use('/api/campaign-schedules', campaignScheduleRoutes);
  app.use('/api/campaign-runs', campaignRunRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/founderai', founderaiRoutes);
  app.use('/api/google-sheets', googleSheetsRoutes);
  app.use('/api/uploads', uploadRoutes);
  app.use('/api/storage', storageRoutes);
  app.use('/api/attachments', attachmentsRoutes);
  app.use('/file', downloadRoutes);
  app.use('/download', downloadRoutes);
  app.use('/lp-assets', landingAssetRoutes);
  app.use('/track', trackingRoutes);
  app.use('/t', trackingShortLinkRoutes);
  app.use('/api/webhooks', webhookLimiter, webhookRoutes);
  app.use('/api/courses', coursesRoutes);
  app.use('/api/products', productsRoutes);
  app.use('/api/zalo', zaloSettingsRoutes);
  app.use('/api/zalo-templates', zaloTemplateRoutes);
  app.use('/api/settings', facebookSettingsRoutes);
  app.use('/api/whatsapp', whatsappSettingsRoutes);
  app.use('/api/whatsapp-qr', whatsappBaileysRoutes); // Baileys QR flow — separate prefix to avoid collision with /api/whatsapp/* routes above
  app.use('/api/public', publicRoutes);
  app.use('/api/public', landingCmsPublicRoutes);
  app.use('/api/public/leads', leadPublicRoutes);
  app.use('/api/public/forms', formPublicRoutes);
  app.use('/api/public', publicPromotionRoutes);
  app.use('/api/admin/landing-featured-courses', adminLandingFeaturedCourseRoutes);
  app.use('/api/admin/landing-testimonials', adminLandingTestimonialRoutes);
  app.use('/api/admin/landing-pages', adminLandingPageRoutes);
  app.use('/api/admin/landing-customizer', adminLandingCustomizerRoutes);
  app.use('/api/admin/landing-sections', adminLandingSectionRoutes);
  app.use('/api/leads', leadRoutes);
  app.use('/api/forms', formRoutes);
  app.use('/api/verification', verificationRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/plans', planRoutes);
  app.use('/api/topup', topupRoutes);
  app.use('/api/help', helpRoutes);
  app.use('/api/vouchers', voucherRoutes);
  app.use('/api/contact', contactRoutes);
  app.use('/api/employees', employeeRoutes);
  app.use('/api/admin/stats', adminStatsRoutes);
  app.use('/api/admin/plans', adminPlansRoutes);
  app.use('/api/admin/members', adminMembersRoutes);
  app.use('/api/admin/forms', adminFormsRoutes);
  app.use('/api/admin/orders', adminOrdersRoutes);
  app.use('/api/admin/einvoices', adminEinvoiceRoutes);
  app.use('/api/admin/vouchers', adminVouchersRoutes);
  app.use('/api/admin/system', adminSystemRoutes);
  app.use('/api/admin/delivery-monitor', adminDeliveryMonitorRoutes);
  app.use('/api/admin/alerts', adminAlertsRoutes);
  app.use('/api/admin/funnel', adminFunnelRoutes);
  app.use('/api/admin/ai-usage', adminAiUsageRoutes);
  app.use('/api/admin/ai-models', adminAiModelsRoutes);
  app.use('/api/admin/bulk-notification', adminBulkNotificationRoutes);
  app.use('/api/admin/notifications', adminNotificationRoutes);
  app.use('/api/admin/menu-layout', adminMenuRoutes);
  app.use('/api/admin/system-email-templates', adminSystemEmailTemplateRoutes);
  app.use('/api/admin/subscription-reminder-settings', adminSubscriptionReminderSettingsRoutes);
  app.use('/api/delivery-monitor', userDeliveryMonitorRoutes);
  app.use('/api/ai/chatbot', chatbotRoutes);
  // /api/internal/* - inter-service endpoints (Telegram gateway, etc.)
  // Mapped BEFORE the global /api limiter so they can keep their own rules.
  app.use('/api/internal', internalRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/chatbot-public', publicCorsMiddleware, chatbotPublicRoutes);
  app.use('/api/public/hero', heroConsultationRoutes);
  app.use('/api/landing-templates', landingTemplateRoutes);
  app.use('/api/audit-logs', auditRoutes);
  app.use('/api/media-library', mediaLibraryRoutes);
  app.use('/api/admin/audit-logs', adminAuditLogsRoutes);
  app.use('/api/admin/diagnostic', diagnosticRoutes);
  app.use('/api/template-labels', templateLabelRoutes);
  app.use('/api/marketplace', marketplaceRoutes);
  app.use('/api/marketplace/seller', marketplaceSellerRoutes);
  app.use('/api/admin/marketplace', marketplaceAdminRoutes);
  app.use('/api/affiliate', affiliateRouter);
  app.use('/api/admin/affiliate', adminAffiliateRouter);
  app.use('/api/affiliate/withdrawals', affiliateWithdrawalRouter);
  app.use('/api/admin/affiliate/withdrawals', adminAffiliateWithdrawalRouter);

  app.get('/api/health', (req, res) => {
    const readiness = getRuntimeReadiness();
    if (!readiness.ready) {
      return res.status(503).json({
        status: readiness.phase === 'failed' ? 'unavailable' : 'starting',
        timestamp: new Date().toISOString(),
      });
    }
    return res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Zalo domain verification meta tag (skip khi request từ subdomain landing)
  app.get('/', (req, res, next) => {
    if (req.isCustomDomain && req.landingPage) {
      return landingPagePublicController.getByDomain(req, res);
    }
    return res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="zalo-platform-site-verification" content="KlgV4OVxHJrppf8XXBaeArFAIJI_I6XjCJWu" />
    <title>FounderAI API</title>
</head>
<body>
    <h1>FounderAI API Server</h1>
    <p>API is running...</p>
</body>
</html>`);
  });

  // Zalo domain verification - serve HTML file at root
  app.get('/KlgV4OVxHJrppf8XXBaeArFAIJI_I6XjCJWu.html', (req, res) => {
    res.set('Content-Type', 'text/html');
    return res.send(`<!DOCTYPE html>
<html>
<head>
    <meta name="zalo-verification" content="KlgV4OVxHJrppf8XXBaeArFAIJI_I6XjCJWu" />
</head>
<body></body>
</html>`);
  });

  // Catch-all: serve landing page HTML khi request đến từ custom domain (*.founderai.biz)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    if (req.isCustomDomain && req.landingPage) {
      return landingPagePublicController.getByDomain(req, res);
    }
    next();
  });

  // Short link redirect: founderai.biz/{widgetKey} → frontend /chat/{chatbotId}
  app.get('/:widgetKey', async (req, res, next) => {
    try {
      const { widgetKey } = req.params;
      if (!widgetKey || widgetKey.includes('.')) return next();
      const chatbot = await chatbotRepository.findChatbotByWidgetKey(widgetKey);
      if (chatbot) {
        const frontendUrl = process.env.FRONTEND_URL || 'https://app.uknow.vn';
        return res.redirect(302, `${frontendUrl}/chat/${chatbot.id}`);
      }
    } catch (_err) {
      // non-critical, fall through to 404
    }
    next();
  });

  app.use(globalErrorHandler);

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: 'Route not found',
    });
  });

  return app;
}

/** Thông báo chung cho lỗi 5xx ở production — chi tiết chỉ ghi log phía server. */
export const GENERIC_SERVER_ERROR_MESSAGE = 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.';

/**
 * Mã lỗi nghiệp vụ (vd `RESOURCE_LOCKED`) được giữ lại trong phản hồi 5xx; mã hệ thống của Node
 * (ECONNREFUSED...) hay SQLSTATE của Postgres (23505...) thì không — chúng lộ chi tiết hạ tầng.
 *
 * @param {any} err
 * @returns {string|null}
 */
function publicErrorCode(err) {
  const code = err?.code;
  if (typeof code !== 'string' || !/^[A-Z][A-Z0-9_]{2,63}$/.test(code)) return null;
  if (err.syscall || err.errno !== undefined || err.severity || err.routine) return null;
  return code;
}

/**
 * Bộ xử lý lỗi cuối cùng của app.
 *   - Lỗi multer → 413/400 có thông báo (lỗi phía client).
 *   - 4xx: giữ nguyên thông báo của lỗi.
 *   - 5xx ở production: thông báo chung tiếng Việt (giữ `code` nghiệp vụ và `requestId` nếu có),
 *     chi tiết + stack chỉ ghi log server. Môi trường khác giữ thông báo gốc để dễ gỡ lỗi.
 */
export function globalErrorHandler(err, req, res, next) {
  // Lỗi multer (tệp quá lớn / quá nhiều) là lỗi phía client → 4xx có thông báo,
  // không phải 500 trơ trụi. multer đặt err.name = 'MulterError'.
  if (err && err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: 'Tệp vượt dung lượng tối đa cho phép',
        code: 'FILE_TOO_LARGE',
      });
    }
    return res.status(400).json({
      success: false,
      message: 'Tải tệp lên không hợp lệ',
      code: err.code || 'UPLOAD_ERROR',
    });
  }
  // Body vượt trần của body-parser (vd chat công khai 64kb): 413 có câu tiếng Việt thay vì câu tiếng Anh của thư viện.
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Nội dung gửi lên quá lớn. Bạn vui lòng rút gọn rồi gửi lại nhé.',
      code: 'PAYLOAD_TOO_LARGE',
    });
  }

  const rawStatus = Number(err?.status ?? err?.statusCode);
  const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;
  if (status >= 500) {
    console.error(`[ErrorHandler] ${req?.method} ${req?.originalUrl || req?.url} → ${status}:`, err?.stack || err);
  } else {
    console.error(err?.stack || err);
  }

  // Đã gửi một phần phản hồi thì để Express tự đóng kết nối.
  if (res.headersSent) return next(err);

  const hideDetails = status >= 500 && process.env.NODE_ENV === 'production';
  const body = {
    success: false,
    message: hideDetails ? GENERIC_SERVER_ERROR_MESSAGE : (err?.message || 'Internal Server Error'),
  };
  if (hideDetails) {
    const code = publicErrorCode(err);
    if (code) body.code = code;
    const requestId = req?.id ?? err?.requestId;
    if (requestId) body.requestId = requestId;
  }
  if (process.env.NODE_ENV === 'development' && err?.stack) body.stack = err.stack;
  return res.status(status).json(body);
}

export default createApp;
