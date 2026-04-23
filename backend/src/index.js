import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
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

// Import scheduler
import { initScheduler } from './utils/scheduler.js';
import outboundMessageQueueService from './services/queue/outboundMessageQueue.service.js';
import { registerOutboundMessageProcessors } from './services/queue/outboundMessageProcessorRegistry.js';

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
app.use('/api/uknow', uknowRoutes);
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
    // Lazy migration: đảm bảo cột uknow_status tồn tại
    await client.query(
      `ALTER TABLE campaign_customers ADD COLUMN IF NOT EXISTS uknow_status VARCHAR(20) DEFAULT NULL`
    );
    // Lazy migration: tạo bảng verification_codes nếu chưa có (không có foreign key để tránh lỗi)
    await client.query(`
      CREATE TABLE IF NOT EXISTS verification_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        code VARCHAR(6) NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'email_verification',
        expires_at TIMESTAMP NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_id UUID
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at)`);
    // Lazy migration: thêm cột is_verified cho users
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP`);
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
