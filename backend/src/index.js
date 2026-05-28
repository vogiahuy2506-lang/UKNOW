import 'dotenv/config';
import db from './config/database.js';
import { formatUtcAndVietnamForLog } from './utils/vnTimeFormat.util.js';
import uploadController from './controllers/upload.controller.js';
import { createApp } from './app.js';

import { initScheduler } from './utils/scheduler.js';
import outboundMessageQueueService from './services/queue/outboundMessageQueue.service.js';
import { registerOutboundMessageProcessors } from './services/queue/outboundMessageProcessorRegistry.js';
import { runMigrations } from './utils/migrationRunner.util.js';

const app = createApp();

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
    if (process.env.SKIP_MIGRATIONS === 'true') {
      console.log('[Migration] Skipped (SKIP_MIGRATIONS=true)');
    } else {
      await runMigrations(client);
    }
  } catch (error) {
    console.error('[Startup] Database/migration failed:', error.message);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
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
