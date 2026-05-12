import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PayOS } = require('@payos/node');

/**
 * Lazy-init PayOS client.
 *
 * Tại sao lazy:
 *   - `new PayOS(...)` throw ngay nếu thiếu env (PAYOS_CLIENT_ID/API_KEY/CHECKSUM_KEY).
 *   - Nếu khởi tạo ở top-level, mọi import (kể cả route không liên quan) sẽ crash khi
 *     env chưa load (vd: integration test, CI build, startup race).
 *   - Lazy → chỉ throw khi caller thực sự gọi `paymentRequests.create()` hoặc `webhooks.verify()`.
 *
 * Cách dùng vẫn như cũ: `payosClient.paymentRequests.create(...)`.
 */
let cachedClient = null;

function getOrCreateClient() {
  if (cachedClient) return cachedClient;
  cachedClient = new PayOS(
    process.env.PAYOS_CLIENT_ID,
    process.env.PAYOS_API_KEY,
    process.env.PAYOS_CHECKSUM_KEY
  );
  return cachedClient;
}

const payosClient = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getOrCreateClient();
      const value = client[prop];
      return typeof value === 'function' ? value.bind(client) : value;
    },
  }
);

export default payosClient;
