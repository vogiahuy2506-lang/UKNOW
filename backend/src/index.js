import 'dotenv/config';
import db from './config/database.js';
import { formatUtcAndVietnamForLog } from './utils/vnTimeFormat.util.js';
import uploadController from './controllers/upload.controller.js';
import { createApp } from './app.js';

import { initScheduler } from './utils/scheduler.js';
import outboundMessageQueueService from './services/queue/outboundMessageQueue.service.js';
import { registerOutboundMessageProcessors } from './services/queue/outboundMessageProcessorRegistry.js';
import kbDocumentQueue from './services/queue/kbDocumentQueue.service.js';
import knowledgeBaseService from './services/chatbot/knowledgeBase.service.js';
import {
  runMigrations,
  assertMigrationsUpToDate,
  resolveStartupMigrationAction,
} from './utils/migrationRunner.util.js';
import { prepareBillingAnchorRepairPreflight } from './utils/billingAnchorRepairBackup.util.js';
import { initZaloSessionRestoration } from './utils/zaloSessionRestoration.util.js';
import zaloInboxService from './services/chatbot/zaloInbox.service.js';
import landingPageDomainService from './services/landingPage/landingPageDomain.service.js';
import { validateActivePlanKbLimits } from './services/storage/kbQuota.service.js';
import { validateStorageEnv } from './utils/storageStartupConfig.util.js';
import { validateInvoiceEnv } from './utils/invoiceStartupConfig.util.js';
import {
  markRuntimeFailed,
  markRuntimeReady,
  markRuntimeStarting,
} from './utils/runtimeReadiness.util.js';
// Import webhook controller to register debounce processors
import './controllers/chatbotChannelWebhook.controller.js';

const app = createApp();

const PORT = process.env.PORT || 5000;
let isShuttingDown = false;

// Đăng ký processor trước khi start worker để tránh job không có handler.
registerOutboundMessageProcessors();

// Register KB document processing processor
kbDocumentQueue.registerProcessor('kb.document.process', async (payload) => {
  const { docId, kbId, userId, options } = payload;
  return knowledgeBaseService.processDocument(docId, kbId, userId, options);
});

const STARTUP_DB_MAX_ATTEMPTS = Number.parseInt(process.env.STARTUP_DB_MAX_ATTEMPTS || '', 10)
  || (process.env.NODE_ENV === 'production' ? 12 : 1);
const STARTUP_DB_RETRY_MS = Number.parseInt(process.env.STARTUP_DB_RETRY_MS || '', 10) || 5000;

function isTransientDbStartupError(error) {
  const msg = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    msg.includes('recovery mode')
    || msg.includes('not yet accepting connections')
    || msg.includes('connection refused')
    || msg.includes('connection terminated')
    || msg.includes('timeout')
    || code === 'ECONNREFUSED'
    || code === '57P03'
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Test database connection (retry khi Postgres đang recovery — hay gặp lúc deploy)
const testDBConnection = async () => {
  for (let attempt = 1; attempt <= STARTUP_DB_MAX_ATTEMPTS; attempt++) {
    let client;
    try {
      client = await db.getClient();
      const result = await client.query('SELECT NOW()');
      console.log(
        `Database connected successfully — ${formatUtcAndVietnamForLog(result.rows[0].now)}`
      );
      const startupMigration = resolveStartupMigrationAction({
        nodeEnv: process.env.NODE_ENV,
        skipMigrations: process.env.SKIP_MIGRATIONS,
      });

      if (startupMigration.warning) {
        console.warn(startupMigration.warning);
      }

      if (startupMigration.action === 'check') {
        console.log('[Migration] Chế độ check-only — đang kiểm tra schema up-to-date');
        await assertMigrationsUpToDate(client);
      } else {
        console.log('[Migration] Chế độ auto-run (development) — đang chạy migrations');
        // Migration 174 is fail-closed when a local DB already has an active
        // entitlement. Prepare its local, filesystem-backed snapshot before
        // the runner acquires the migration lock; production never enters this
        // auto-run branch and keeps the VPS preflight in CI/CD.
        await prepareBillingAnchorRepairPreflight(client);
        await runMigrations(client);
      }
      return;
    } catch (error) {
      const retryable = isTransientDbStartupError(error);
      console.error(
        `[Startup] Database/migration failed (attempt ${attempt}/${STARTUP_DB_MAX_ATTEMPTS}):`,
        error.message
      );
      if (attempt < STARTUP_DB_MAX_ATTEMPTS && retryable) {
        console.warn(`[Startup] Retrying DB connection in ${STARTUP_DB_RETRY_MS}ms...`);
        await sleep(STARTUP_DB_RETRY_MS);
        continue;
      }
      throw error;
    } finally {
      if (client) client.release();
    }
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
    await kbDocumentQueue.close();
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

async function validateStartupBeforeListen() {
  try {
    validateStorageEnv();
    validateInvoiceEnv();
    await testDBConnection();
    await validateActivePlanKbLimits();
  } catch (error) {
    if (process.env.NODE_ENV === 'production') throw error;
    console.warn(`[Startup] Validation warning in development: ${error.message}`);
  }
}

// `/api/health` must stay closed from process start until workers and scheduler
// have completed their critical initialization below.
markRuntimeStarting();

await validateStartupBeforeListen().catch((error) => {
  markRuntimeFailed(error);
  console.error(`[Startup] Refusing to listen: ${error.message}`);
  process.exit(1);
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  initializePostListenRuntime().catch((error) => {
    markRuntimeFailed(error);
    console.error(`[Startup] Critical runtime initialization failed: ${error.message}`);

    // Do not leave a process that has already bound its port serving a false
    // positive health response. Closing the listener lets Docker restart policy
    // handle recovery; the readiness endpoint remains 503 until then.
    server.close(() => process.exit(1));
    const forcedExit = setTimeout(() => process.exit(1), 5000);
    forcedExit.unref();
  });
});

async function initializePostListenRuntime() {
  setupCleanupTask();
  initScheduler();
  await outboundMessageQueueService.startWorker();
  await kbDocumentQueue.startWorker();
  console.log(`Cleanup task scheduled`);

  // Auto-provision SSL for active domains on startup
  landingPageDomainService.provisionSslForAllActiveDomains().catch((err) => {
    console.error('[Startup] Failed to auto-provision SSL for active domains:', err.message);
  });

  // Restore Zalo sessions after all services are initialized
  // This ensures accounts remain connected even after server restart/update
  setTimeout(async () => {
    await initZaloSessionRestoration().catch((error) => {
      console.error('[Startup] Failed to restore Zalo sessions:', error.message);
    });
    await zaloInboxService.start().catch((error) => {
      // This restoration runs asynchronously by design and is not allowed to
      // crash a process that already completed its primary worker startup.
      console.error('[Startup] Failed to start Zalo inbox restoration:', error.message);
    });
  }, 3000);

  markRuntimeReady();
}
