// dotenv được load ở src/index.js (production entrypoint) hoặc bởi test runner.
// Không import dotenv ở đây để app.js có thể được import độc lập trong test
// mà không nuốt nhầm config production (vd PGSSLMODE=require của Neon).
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import emailSettingsRoutes from './routes/emailSettings.routes.js';
import emailTemplateRoutes from './routes/emailTemplate.routes.js';
import campaignRoutes from './routes/campaign.routes.js';
import campaignScheduleRoutes from './routes/campaignSchedule.routes.js';
import campaignRunRoutes from './routes/campaignRun.routes.js';
import customerRoutes from './routes/customer.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import uknowRoutes from './routes/uknow.routes.js';
import googleSheetsRoutes from './routes/googleSheets.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import downloadRoutes from './routes/download.routes.js';
import trackingRoutes from './routes/tracking.routes.js';
import trackingShortLinkRoutes from './routes/trackingShortLink.routes.js';
import attachmentsRoutes from './routes/attachments.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import coursesRoutes from './routes/courses.routes.js';
import zaloSettingsRoutes from './routes/zaloSettings.routes.js';
import zaloTemplateRoutes from './routes/zaloTemplate.routes.js';
import publicRoutes from './routes/public.routes.js';
import verificationRoutes from './routes/verification.routes.js';
import leadRoutes from './routes/lead.routes.js';
import adminLandingFeaturedCourseRoutes from './routes/adminLandingFeaturedCourse.routes.js';
import adminLandingTestimonialRoutes from './routes/adminLandingTestimonial.routes.js';
import adminLandingPageRoutes from './routes/adminLandingPage.routes.js';
import adminStatsRoutes from './routes/adminStats.routes.js';
import adminPlansRoutes from './routes/adminPlans.routes.js';
import adminMembersRoutes from './routes/adminMembers.routes.js';
import adminOrdersRoutes from './routes/adminOrders.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import planRoutes from './routes/plan.routes.js';
import contactRoutes from './routes/contact.routes.js';
import employeeRoutes from './routes/employee.routes.js';
import aiRoutes from './routes/ai.routes.js';

/**
 * Khởi tạo Express app (không listen).
 * Tách hàm này để integration test có thể supertest(app) mà không phải bind port.
 *
 * @returns {import('express').Express}
 */
export function createApp() {
  const app = express();

  const defaultAllowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ];

  const envAllowedOrigins = [
    ...(process.env.FRONTEND_URLS || '').split(','),
    process.env.FRONTEND_URL || '',
  ]
    .map((origin) => origin.trim())
    .filter(Boolean);

  const allowedOrigins = new Set([...defaultAllowedOrigins, ...envAllowedOrigins]);

  // Cho phép nhúng ảnh/file từ domain khác (`<img src="https://api.../file/...">`).
  // Helmet mặc định CORP `same-origin` khiến trình duyệt chặn hiển thị ảnh cross-origin (mở URL trực tiếp vẫn được).
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow non-browser tools (Postman/curl) and same-origin requests with no Origin header.
        if (!origin) return callback(null, true);
        // iframe sandbox (srcDoc) gửi Origin: null — cần cho form/embed landing từ HTML tĩnh
        if (origin === 'null') return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    })
  );
  // Tắt morgan trong môi trường test để output Jest sạch.
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }
  // Ghi lại raw body để xác thực chữ ký HMAC-SHA256 của webhook
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/email-settings', emailSettingsRoutes);
  app.use('/api/email-templates', emailTemplateRoutes);
  app.use('/api/campaigns', campaignRoutes);
  app.use('/api/campaign-schedules', campaignScheduleRoutes);
  app.use('/api/campaign-runs', campaignRunRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/uknow', uknowRoutes);
  app.use('/api/google-sheets', googleSheetsRoutes);
  app.use('/api/uploads', uploadRoutes);
  app.use('/api/attachments', attachmentsRoutes);
  app.use('/file', downloadRoutes);
  app.use('/download', downloadRoutes);
  app.use('/track', trackingRoutes);
  app.use('/t', trackingShortLinkRoutes);
  app.use('/api/webhooks', webhookRoutes);
  app.use('/api/courses', coursesRoutes);
  app.use('/api/zalo', zaloSettingsRoutes);
  app.use('/api/zalo-templates', zaloTemplateRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/admin/landing-featured-courses', adminLandingFeaturedCourseRoutes);
  app.use('/api/admin/landing-testimonials', adminLandingTestimonialRoutes);
  app.use('/api/admin/landing-pages', adminLandingPageRoutes);
  app.use('/api/leads', leadRoutes);
  app.use('/api/verification', verificationRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/plans', planRoutes);
  app.use('/api/contact', contactRoutes);
  app.use('/api/employees', employeeRoutes);
  app.use('/api/admin/stats', adminStatsRoutes);
  app.use('/api/admin/plans', adminPlansRoutes);
  app.use('/api/admin/members', adminMembersRoutes);
  app.use('/api/admin/orders', adminOrdersRoutes);
  app.use('/api/ai', aiRoutes);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use((err, req, res, _next) => {
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
