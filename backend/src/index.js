import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import db from './config/database.js';
import { formatUtcAndVietnamForLog } from './utils/vnTimeFormat.util.js';
import uploadController from './controllers/upload.controller.js';


// Import routes
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

// Import scheduler
import { initScheduler } from './utils/scheduler.js';
import outboundMessageQueueService from './services/queue/outboundMessageQueue.service.js';
import { registerOutboundMessageProcessors } from './services/queue/outboundMessageProcessorRegistry.js';
import { runMigrations } from './utils/migrationRunner.util.js';

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

// Middleware
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
app.use(morgan('dev'));
// Ghi lại raw body để xác thực chữ ký HMAC-SHA256 của webhook
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes
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
app.use('/api/attachments', attachmentsRoutes);    // presigned download for admin
app.use('/file', downloadRoutes);// trang xem file: GET /file/:token, GET /file/:token/download
app.use('/download', downloadRoutes);   // backward compat: cũ dùng /download/:token
app.use('/track', trackingRoutes);      // attachment tracking: GET /track/attachment/:token
app.use('/t', trackingShortLinkRoutes); // short tracking redirect: GET /t/:code
app.use('/api/webhooks', webhookRoutes); // webhook WooCommerce: POST /api/webhooks/woocommerce/order
app.use('/api/courses', coursesRoutes); // quản lý khóa học
app.use('/api/zalo', zaloSettingsRoutes); // quản lý nhiều tài khoản Zalo
app.use('/api/zalo-templates', zaloTemplateRoutes); // quản lý template Zalo
app.use('/api/public', publicRoutes); // landing lead, landing-featured-courses, landing-testimonials
app.use('/api/admin/landing-featured-courses', adminLandingFeaturedCourseRoutes);
app.use('/api/admin/landing-testimonials', adminLandingTestimonialRoutes);
app.use('/api/admin/landing-pages', adminLandingPageRoutes);
app.use('/api/leads', leadRoutes); // GET /api/leads (auth), GET /api/leads/preview (auth)
app.use('/api/verification', verificationRoutes); // Gửi và xác minh mã email
app.use('/api/payments', paymentRoutes);  // POST /api/payments/create-payment, POST /api/payments/webhook
app.use('/api/plans', planRoutes); // GET /api/plans/ - lấy danh sách gói thanh toán
app.use('/api/contact', contactRoutes); // POST /api/contact - form liên hệ public
app.use('/api/employees', employeeRoutes); // CRUD nhân viên, phân quyền employee
app.use('/api/admin/stats', adminStatsRoutes);   // Dashboard stats cho super_admin
app.use('/api/admin/plans', adminPlansRoutes);    // CRUD gói dịch vụ + assign cho user
app.use('/api/admin/members', adminMembersRoutes); // Danh sách thành viên, khóa, nâng super_admin
app.use('/api/admin/orders', adminOrdersRoutes);   // Danh sách đơn hàng PayOS
app.use('/api/ai', aiRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 5000;
let isShuttingDown = false;

// Đăng ký processor trước khi start worker để tránh job không có handler.
registerOutboundMessageProcessors();

// Test database connection
const testDBConnection = async () => {
  let client;
  try {
    client = await db.getClient();
    const result = await client.query('SELECT NOW()');
    console.log(
      `Database connected successfully — ${formatUtcAndVietnamForLog(result.rows[0].now)}`
    );
    await runMigrations(client);
  } catch (error) {
    console.error('Database connection failed:', error.message);
  } finally {
    if (client) client.release();
  }
};
// Setup cleanup task để dọn dẹp temp files
const setupCleanupTask = () => {
  // Dọn dẹp temp files mỗi 6 giờ
  setInterval(() => {
    uploadController.cleanupTempFiles();
  }, 6 * 60 * 60 * 1000);

  // Dọn dẹp ngay khi khởi động
  setTimeout(() => {
    uploadController.cleanupTempFiles();
  }, 10000);
};

/**
 * Đóng tài nguyên theo thứ tự an toàn khi process nhận tín hiệu dừng.
 * Giúp worker BullMQ thoát sạch và tránh job bị treo.
 *
 * @param {string} signal
 */
const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.info(`[Server] Nhận tín hiệu ${signal}, đang shutdown...`);
  try {
    await outboundMessageQueueService.close();
  } catch (error) {
    console.error(`[Server] Lỗi khi đóng BullMQ: ${error?.message || error}`);
  }
  try {
    await db.pool.end();
    console.info('[Server] Đã đóng pool PostgreSQL.');
  } catch (error) {
    console.error(`[Server] Lỗi khi đóng pool PostgreSQL: ${error?.message || error}`);
  }
  process.exit(0);
};

process.on('SIGINT', () => {
  gracefulShutdown('SIGINT');
});

process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM');
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  await testDBConnection();
  setupCleanupTask();
  initScheduler();
  await outboundMessageQueueService.startWorker();
  console.log(`Cleanup task scheduled`);
});
