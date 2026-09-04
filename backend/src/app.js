// dotenv được load ở src/index.js (production entrypoint) hoặc bởi test runner.
// Không import dotenv ở đây để app.js có thể được import độc lập trong test
// mà không nuốt nhầm config production (vd PGSSLMODE=require của Neon).
// TODO: Ensure backend routes are properly registered
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { globalLimiter, authLimiter, webhookLimiter } from './middleware/rateLimiter.middleware.js';
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
import publicPromotionRoutes from './routes/publicPromotion.routes.js';
import landingCmsPublicRoutes from './routes/landingCmsPublic.routes.js';
import leadPublicRoutes from './routes/leadPublic.routes.js';
import publicRoutes from './routes/public.routes.js';
import verificationRoutes from './routes/verification.routes.js';
import leadRoutes from './routes/lead.routes.js';
import adminLandingFeaturedCourseRoutes from './routes/adminLandingFeaturedCourse.routes.js';
import adminLandingTestimonialRoutes from './routes/adminLandingTestimonial.routes.js';
import adminLandingPageRoutes from './routes/adminLandingPage.routes.js';
import adminLandingCustomizerRoutes from './routes/adminLandingCustomizer.routes.js';
import adminLandingSectionRoutes from './routes/adminLandingSection.routes.js';
import adminStatsRoutes from './routes/adminStats.routes.js';
import adminPlansRoutes from './routes/adminPlans.routes.js';
import adminMembersRoutes from './routes/adminMembers.routes.js';
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
import heroConsultationRoutes from './routes/heroConsultation.routes.js';
import landingTemplateRoutes from './routes/landingTemplate.routes.js';
import customDomainRoutes from './routes/customDomain.routes.js';
import auditRoutes from './routes/audit.routes.js';
import mediaLibraryRoutes from './routes/mediaLibrary.routes.js';
import adminAuditLogsRoutes from './routes/adminAuditLogs.routes.js';
import diagnosticRoutes from './routes/diagnostic.routes.js';
import templateLabelRoutes from './routes/templateLabel.routes.js';
import marketplaceRoutes from './routes/marketplace.routes.js';
import marketplaceAdminRoutes from './routes/marketplaceAdmin.routes.js';
import { affiliateWithdrawalRouter, adminAffiliateWithdrawalRouter } from './routes/affiliateWithdrawal.routes.js';
import { domainResolver } from './middleware/domainResolver.js';
import { createDynamicCorsMiddleware, publicCorsMiddleware } from './middleware/dynamicCors.middleware.js';
import landingPagePublicController from './controllers/landingPagePublic.controller.js';
import chatbotRepository from './repositories/ai/chatbot.repository.js';

/**
 * Khởi tạo Express app (không listen).
 * Tách hàm này để integration test có thể supertest(app) mà không phải bind port.
 *
 * @returns {import('express').Express}
 */
export function createApp() {
  const app = express();

  // VPS/nginx gửi X-Forwarded-For — cần bật để rate-limit và req.ip đúng.
  if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

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

  // Auth rate limit (chống brute-force login)
  app.use('/api/auth', authLimiter, authRoutes);
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
  app.use('/track', trackingRoutes);
  app.use('/t', trackingShortLinkRoutes);
  app.use('/api/webhooks', webhookLimiter, webhookRoutes);
  app.use('/api/courses', coursesRoutes);
  app.use('/api/products', productsRoutes);
  app.use('/api/zalo', zaloSettingsRoutes);
  app.use('/api/zalo-templates', zaloTemplateRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/public', landingCmsPublicRoutes);
  app.use('/api/public/leads', leadPublicRoutes);
  app.use('/api/public', publicPromotionRoutes);
  app.use('/api/admin/landing-featured-courses', adminLandingFeaturedCourseRoutes);
  app.use('/api/admin/landing-testimonials', adminLandingTestimonialRoutes);
  app.use('/api/admin/landing-pages', adminLandingPageRoutes);
  app.use('/api/admin/landing-customizer', adminLandingCustomizerRoutes);
  app.use('/api/admin/landing-sections', adminLandingSectionRoutes);
  app.use('/api/leads', leadRoutes);
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
  app.use('/api/delivery-monitor', userDeliveryMonitorRoutes);
  app.use('/api/ai/chatbot', chatbotRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/chatbot-public', publicCorsMiddleware, chatbotPublicRoutes);
  app.use('/api/public/hero', heroConsultationRoutes);
  app.use('/api/landing-templates', landingTemplateRoutes);
  app.use('/api/custom-domains', customDomainRoutes);
  app.use('/api/audit-logs', auditRoutes);
  app.use('/api/media-library', mediaLibraryRoutes);
  app.use('/api/admin/audit-logs', adminAuditLogsRoutes);
  app.use('/api/admin/diagnostic', diagnosticRoutes);
  app.use('/api/template-labels', templateLabelRoutes);
  app.use('/api/marketplace', marketplaceRoutes);
  app.use('/api/admin/marketplace', marketplaceAdminRoutes);
  app.use('/api/affiliate/withdrawals', affiliateWithdrawalRouter);
  app.use('/api/admin/affiliate/withdrawals', adminAffiliateWithdrawalRouter);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

  app.use((err, req, res, _next) => {
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
    console.error(err.stack);
    res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  });

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: 'Route not found',
    });
  });

  return app;
}

export default createApp;
