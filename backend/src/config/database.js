const isNeon = process.env.DB_HOST?.includes('neon.tech');

/**
 * Wrapper cho database operations với automatic retry cho Neon serverless.
 * Neon hay bị connection timeout khi connection cũ bị đóng.
 */
async function withRetry(operation, maxRetries = 2, delayMs = 500) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      // Chỉ retry nếu là connection error
      if (!isNeon || !isConnectionError(error)) {
        throw error;
      }
      console.warn(`[DB] Connection error, retry ${i + 1}/${maxRetries}:`, error.message);
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}

function isConnectionError(error) {
  const code = error?.code || error?.cause?.code;
  const msg = error?.message || '';
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    msg.includes('Connection terminated') ||
    msg.includes('connection timeout') ||
    msg.includes('Connection closed')
  );
}

export { withRetry, isConnectionError, isNeon };

import { Pool } from 'pg';

/**
 * Một process Node chỉ nên dùng một Pool (singleton) — mỗi slot trong `max` là một kết nối TCP tới Postgres.
 * Trên `pg_stat_activity` nhiều session `idle` thường là **bình thường**: pool giữ kết nối để tái sử dụng,
 * không phải lỗi nếu số lượng ≤ `DB_POOL_MAX` và không tăng vô hạn theo thời gian.
 * Nếu RAM Postgres cao: hạ `DB_POOL_MAX` cho vừa số worker HTTP + BullMQ thực tế; tránh nhiều replica backend mỗi replica một pool.
 */

const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'uknow_campaign',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  // Hiển thị trong pg_stat_activity.application_name (DBeaver/DataGrip) để phân biệt backend vs IDE.
  application_name: String(process.env.DB_APPLICATION_NAME || 'founderai-campaign-backend').trim() || 'founderai-campaign-backend',
  // Kích thước pool cấu hình qua env; mặc định 20 kết nối tối đa mỗi process.
  max: Number.parseInt(process.env.DB_POOL_MAX, 10) || (isNeon ? 3 : 20),
  // Neon serverless: giảm idle timeout để tránh connection bị server đóng
  idleTimeoutMillis: isNeon ? 10000 : 30000,
  // Tăng timeout chờ kết nối từ 2s → 10s để chịu được tải cao khi nhiều campaign chạy đồng thời.
  connectionTimeoutMillis: isNeon ? 5000 : 10000,
  // Timeout query tối đa 30s để phát hiện query bị kẹt sớm.
  // Lưu ý: transaction lưu khách hàng batch (`saveCustomersFromCampaignDirect`) tự `SET LOCAL statement_timeout`
  // theo biến `SAVE_CUSTOMERS_STATEMENT_TIMEOUT_MS` để không bị cắt bởi giới hạn 30s này.
  statement_timeout: isNeon ? 10000 : 30000,
};

// SSL configuration for Neon and other cloud providers
if (process.env.DB_SSL === 'true' || process.env.DB_SSL === true) {
  poolConfig.ssl = {
    rejectUnauthorized: false,
  };
}

const pool = new Pool(poolConfig);

let hasLoggedFirstPoolConnection = false;

pool.on('connect', async (client) => {
  try {
    await client.query("SET TIME ZONE 'Asia/Ho_Chi_Minh'");
  } catch (error) {
    console.error('Failed to set DB timezone:', error.message);
  }
  // Mỗi lần pool mở socket mới sẽ gọi handler này — không log mặc định để tránh spam log khi tải cao.
  if (process.env.DB_DEBUG_LOG_CONNECTIONS === '1') {
    console.log('[PostgreSQL] Mở kết nối mới trong pool');
  } else if (!hasLoggedFirstPoolConnection) {
    hasLoggedFirstPoolConnection = true;
    console.log(
      '[PostgreSQL] Pool đã kết nối (các session tiếp theo tái sử dụng pool; bật DB_DEBUG_LOG_CONNECTIONS=1 để log mỗi socket).'
    );
  }
});

/**
 * pg.Pool tự loại client lỗi ra khỏi pool và mở kết nối mới ở lần query kế tiếp,
 * nên KHÔNG `process.exit` ở đây — với Neon serverless, connection idle thường bị
 * server đóng đột ngột (ETIMEDOUT/ECONNRESET) và đó là chuyện bình thường,
 * không phải lý do để crash cả ứng dụng.
 */
pool.on('error', (err) => {
  console.error('[PostgreSQL] Idle client error (pool sẽ tự xử lý):', err.code || err.message);
});

export default {
  query: (text, params) => withRetry(() => pool.query(text, params)),
  getClient: () => pool.connect(),
  pool,
  withRetry,
  isConnectionError
};
