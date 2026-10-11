import { randomUUID } from 'node:crypto';
import { Queue, QueueEvents, Worker } from 'bullmq';
import IORedis from 'ioredis';
import {
  isSerializedJobError,
  reviveJobError,
  serializeJobError,
} from '../../utils/queueJobError.util.js';
import { ZALO_TIMEOUT_RETRY_TOTAL_DELAY_MS } from '../../utils/zaloTimeoutRetry.util.js';

export const OUTBOUND_MESSAGE_JOB_TYPES = {
  EMAIL_SEND: 'email.send',
  ZALO_PERSONAL_SEND: 'zalo.personal.send',
  ZALO_GROUP_SEND: 'zalo.group.send',
  ZALO_FRIEND_REQUEST_SEND: 'zalo.friend_request.send',
  CUSTOMER_SAVE: 'customer.save',
  /** Tải + parse Google Sheet (public link) trên worker để tách tải và scale concurrency */
  GOOGLE_SHEET_FETCH: 'sheet.google.fetch',
};

/**
 * Hàng đợi tách theo loại job (PLAN_RA_SOAT_DOT3 PR-Q2 việc e): email, Zalo và "data" (đọc Sheet / lưu khách)
 * có concurrency + limiter riêng — một lượt đọc Sheet nặng hay một tài khoản Zalo chậm không còn chặn email.
 */
export const OUTBOUND_QUEUE_LANES = Object.freeze({
  EMAIL: 'email',
  ZALO: 'zalo',
  DATA: 'data',
});

const LANE_CONFIG = {
  [OUTBOUND_QUEUE_LANES.EMAIL]: {
    queueName: 'outbound-email',
    envKey: 'EMAIL',
    defaultConcurrency: 8,
    // Giữ nguyên mặc định cũ (20 job / giây) nhưng tính riêng cho từng hàng đợi.
    defaultLimiter: { max: 20, duration: 1000 },
    legacyEnv: true,
    lockDurationMs: 60_000,
  },
  [OUTBOUND_QUEUE_LANES.ZALO]: {
    queueName: 'outbound-zalo',
    envKey: 'ZALO',
    defaultConcurrency: 8,
    defaultLimiter: { max: 20, duration: 1000 },
    legacyEnv: true,
    lockDurationMs: 60_000,
  },
  [OUTBOUND_QUEUE_LANES.DATA]: {
    queueName: 'outbound-data',
    envKey: 'DATA',
    defaultConcurrency: 2,
    defaultLimiter: null,
    legacyEnv: false,
    lockDurationMs: 120_000,
  },
};

const JOB_TYPE_TO_LANE = {
  [OUTBOUND_MESSAGE_JOB_TYPES.EMAIL_SEND]: OUTBOUND_QUEUE_LANES.EMAIL,
  [OUTBOUND_MESSAGE_JOB_TYPES.ZALO_PERSONAL_SEND]: OUTBOUND_QUEUE_LANES.ZALO,
  [OUTBOUND_MESSAGE_JOB_TYPES.ZALO_GROUP_SEND]: OUTBOUND_QUEUE_LANES.ZALO,
  [OUTBOUND_MESSAGE_JOB_TYPES.ZALO_FRIEND_REQUEST_SEND]: OUTBOUND_QUEUE_LANES.ZALO,
  [OUTBOUND_MESSAGE_JOB_TYPES.CUSTOMER_SAVE]: OUTBOUND_QUEUE_LANES.DATA,
  [OUTBOUND_MESSAGE_JOB_TYPES.GOOGLE_SHEET_FETCH]: OUTBOUND_QUEUE_LANES.DATA,
};

/**
 * Các mốc thời gian dùng để tính thời gian chờ kết quả job (việc b). Mọi con số lấy từ thời gian TỐI ĐA
 * mà một job có thể tự chờ bên trong:
 * - Email: `throttleByRateLimit` (campaignEmailSender) có thể ngủ tới 60 s SAU `markSendQuotaSending`,
 *   cộng bắt tay/gửi SMTP (nodemailer connectionTimeout mặc định 120 s) .
 * - Zalo: `executeWithZaloTimeoutRetry` ngủ 10 + 20 + 40 = 70 s giữa 4 lần thử; một job cá nhân/nhóm có thể
 *   chạy hai vòng (tra số rồi gửi) nên tính hai lần; cộng I/O API.
 * - Dữ liệu: lưu hàng nghìn khách / đọc Sheet có thể lâu — sàn 5 phút (đọc Sheet còn được caller nâng lên).
 */
export const OUTBOUND_JOB_WAIT = Object.freeze({
  EMAIL_THROTTLE_MAX_MS: 60_000,
  EMAIL_PROVIDER_IO_MAX_MS: 120_000,
  ZALO_RETRY_ROUNDS: 2,
  ZALO_API_IO_MAX_MS: 60_000,
  /** Đệm cho thời gian job xếp hàng trước khi worker nhận (concurrency + limiter). */
  QUEUE_BACKLOG_MARGIN_MS: 60_000,
  DATA_MIN_MS: 300_000,
  /** Sau khi hết giờ chờ mà job vẫn đang chạy: hỏi trạng thái thêm tối đa chừng này rồi mới bỏ cuộc. */
  STATE_POLL_GRACE_MS: 120_000,
  STATE_POLL_INTERVAL_MS: 2_000,
});

/**
 * Thời gian chờ kết quả TỐI THIỂU cho từng hàng đợi — luôn lớn hơn tổng thời gian job có thể tự chờ.
 * Mọi giá trị ghi đè (tham số `waitTimeoutMs`, env `BULLMQ_WAIT_RESULT_TIMEOUT_MS`) chỉ được NÂNG, không hạ
 * xuống dưới mức này: hạ xuống thì caller sẽ coi job đang gửi dở là thất bại rồi gửi lại.
 *
 * @param {string} laneName
 * @returns {number}
 */
export function computeMinimumWaitMs(laneName) {
  const w = OUTBOUND_JOB_WAIT;
  if (laneName === OUTBOUND_QUEUE_LANES.EMAIL) {
    return w.EMAIL_THROTTLE_MAX_MS + w.EMAIL_PROVIDER_IO_MAX_MS + w.QUEUE_BACKLOG_MARGIN_MS;
  }
  if (laneName === OUTBOUND_QUEUE_LANES.ZALO) {
    return (ZALO_TIMEOUT_RETRY_TOTAL_DELAY_MS * w.ZALO_RETRY_ROUNDS) + w.ZALO_API_IO_MAX_MS + w.QUEUE_BACKLOG_MARGIN_MS;
  }
  return w.DATA_MIN_MS;
}

/**
 * jobId BullMQ không được chứa dấu `:` (khoá giữ chỗ quota có 5 dấu `:`) và không được là số nguyên.
 *
 * @param {string} key khoá logic (thường là reservationKey)
 * @returns {string|null}
 */
export function buildJobIdFromKey(key) {
  const normalized = String(key ?? '').trim().replace(/:/g, '_');
  return normalized ? `job_${normalized}` : null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readPositiveIntEnv(name, defaultValue) {
  const parsed = Number.parseInt(String(process.env[name] ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function makeCodedError(message, code, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

/**
 * Bọc một promise bằng timeout cứng. Promise gốc KHÔNG bị huỷ (BullMQ/ioredis không hỗ trợ) nên
 * kết quả muộn của nó bị nuốt để khỏi gây unhandled rejection.
 *
 * @template T
 * @param {Promise<T>|(() => Promise<T>)} work
 * @param {number} ms
 * @param {string} code
 * @param {string} message
 * @returns {Promise<T>}
 */
function withTimeout(work, ms, code, message) {
  let timer;
  const promise = typeof work === 'function' ? work() : work;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(makeCodedError(message, code)), ms);
  });
  promise.catch(() => {});
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

class OutboundMessageQueueService {
  constructor() {
    this.processorMap = new Map();
    this.connection = null;
    /** @type {Map<string, {name: string, queueName: string, queue: any, queueEvents: any, worker: any}>} */
    this.lanes = new Map();
    this.workerStarted = false;
    this.startedAtLeastOnce = false;
    this.startPromise = null;
    this.nextStartRetryAt = 0;
    this.drainedOnStart = false;

    // Sức khoẻ Redis (việc c).
    this.degraded = false;
    this.consecutiveHealthFailures = 0;
    this.healthTimer = null;
    this.healthCheckInFlight = false;
    this.lastHealthOkAt = null;
    this.lastDegradedAt = null;
    this.degradedWaiters = new Set();
    this.lastInlineFallbackLogAt = 0;
    this.lastMetricsLogAt = 0;

    // Job đã bị bỏ để chạy thẳng (add timeout nhưng job có thể xuất hiện muộn): worker phải bỏ qua.
    this.abandonedJobs = new Map();
  }

  /**
   * Chuẩn hóa chuỗi boolean từ biến môi trường.
   *
   * @param {string|undefined|null} value giá trị biến môi trường
   * @param {boolean} defaultValue giá trị mặc định nếu biến môi trường rỗng
   * @returns {boolean}
   */
  parseEnvBoolean(value, defaultValue) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) return defaultValue;
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return defaultValue;
  }

  /**
   * Kiểm tra trạng thái bật BullMQ theo biến môi trường.
   * Có thể tắt khẩn cấp qua `BULLMQ_ENABLED=false`.
   *
   * @returns {boolean}
   */
  isQueueFeatureEnabled() {
    return this.parseEnvBoolean(process.env.BULLMQ_ENABLED, true);
  }

  /**
   * Tạo cấu hình kết nối Redis cho BullMQ.
   * Hỗ trợ cả URL đầy đủ hoặc từng biến host/port/password/db.
   *
   * @returns {string|object}
   */
  buildRedisConfig() {
    const redisUrl = String(
      process.env.BULLMQ_REDIS_URL
      || process.env.REDIS_URL
      || ''
    ).trim();
    if (redisUrl) return redisUrl;

    const host = String(process.env.REDIS_HOST || '127.0.0.1').trim();
    const port = Number.parseInt(process.env.REDIS_PORT || '6379', 10);
    const db = Number.parseInt(process.env.REDIS_DB || '0', 10);
    const password = String(process.env.REDIS_PASSWORD || '').trim();
    return {
      host,
      port: Number.isFinite(port) ? port : 6379,
      db: Number.isFinite(db) ? db : 0,
      ...(password ? { password } : {}),
    };
  }

  /**
   * Tùy chọn client ioredis dùng chung cho BullMQ (queue / events / worker).
   *
   * Luồng hoạt động:
   * 1. Đọc `BULLMQ_REDIS_CONNECT_TIMEOUT_MS` (fallback `REDIS_CONNECT_TIMEOUT_MS`), mặc định 60s.
   * 2. Gắn `connectTimeout` để tránh `ETIMEDOUT` sớm khi Redis xa hoặc mạng chậm (mặc định ioredis ~10s).
   * 3. Giữ `maxRetriesPerRequest: null` theo yêu cầu BullMQ.
   *
   * @returns {import('ioredis').RedisOptions}
   */
  buildRedisClientOptions() {
    const rawTimeout = String(
      process.env.BULLMQ_REDIS_CONNECT_TIMEOUT_MS
      || process.env.REDIS_CONNECT_TIMEOUT_MS
      || '60000'
    ).trim();
    const parsed = Number.parseInt(rawTimeout, 10);
    const connectTimeout = Number.isFinite(parsed) && parsed > 0 ? parsed : 60000;
    return {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      connectTimeout,
    };
  }

  /**
   * Cấu hình worker của một hàng đợi: concurrency + limiter riêng, đọc từ env
   * `BULLMQ_{EMAIL|ZALO|DATA}_CONCURRENCY`, `BULLMQ_{...}_RATE_LIMIT_MAX`, `BULLMQ_{...}_RATE_LIMIT_DURATION_MS`.
   * Email/Zalo còn đọc được biến chung cũ `BULLMQ_WORKER_CONCURRENCY` / `BULLMQ_RATE_LIMIT_*` làm mặc định.
   *
   * @param {string} laneName
   * @returns {{concurrency: number, limiter: {max: number, duration: number}|null, lockDuration: number}}
   */
  resolveLaneWorkerConfig(laneName) {
    const config = LANE_CONFIG[laneName];
    const key = config.envKey;
    const legacyConcurrency = config.legacyEnv
      ? readPositiveIntEnv('BULLMQ_WORKER_CONCURRENCY', config.defaultConcurrency)
      : config.defaultConcurrency;
    const concurrency = readPositiveIntEnv(`BULLMQ_${key}_CONCURRENCY`, legacyConcurrency);

    let limiter = null;
    const legacyMax = config.legacyEnv
      ? readPositiveIntEnv('BULLMQ_RATE_LIMIT_MAX', config.defaultLimiter?.max ?? 0)
      : (config.defaultLimiter?.max ?? 0);
    const legacyDuration = config.legacyEnv
      ? readPositiveIntEnv('BULLMQ_RATE_LIMIT_DURATION_MS', config.defaultLimiter?.duration ?? 1000)
      : (config.defaultLimiter?.duration ?? 1000);
    const max = readPositiveIntEnv(`BULLMQ_${key}_RATE_LIMIT_MAX`, legacyMax);
    if (max > 0) {
      limiter = {
        max,
        duration: Math.max(100, readPositiveIntEnv(`BULLMQ_${key}_RATE_LIMIT_DURATION_MS`, legacyDuration)),
      };
    }
    return { concurrency: Math.max(1, concurrency), limiter, lockDuration: config.lockDurationMs };
  }

  /**
   * Hàng đợi (lane) xử lý một loại job.
   *
   * @param {string} jobType
   * @returns {string|null}
   */
  resolveLaneName(jobType) {
    return JOB_TYPE_TO_LANE[String(jobType || '').trim()] || null;
  }

  /**
   * Thời gian chờ kết quả job (ms), luôn >= `computeMinimumWaitMs` của hàng đợi tương ứng.
   * Thứ tự ưu tiên giá trị yêu cầu: tham số `waitTimeoutMs` > env `BULLMQ_WAIT_RESULT_TIMEOUT_MS` > mức tối thiểu.
   *
   * @param {string} jobType
   * @param {number} [explicitWaitMs]
   * @returns {number}
   */
  resolveWaitBudgetMs(jobType, explicitWaitMs) {
    const laneName = this.resolveLaneName(jobType) || OUTBOUND_QUEUE_LANES.DATA;
    const minimum = computeMinimumWaitMs(laneName);
    const explicit = Number(explicitWaitMs);
    const fromEnv = readPositiveIntEnv('BULLMQ_WAIT_RESULT_TIMEOUT_MS', 0);
    const requested = Number.isFinite(explicit) && explicit > 0 ? explicit : fromEnv;
    return Math.max(minimum, requested || 0);
  }

  /**
   * Khởi tạo kết nối Redis + các Queue/QueueEvents nếu chưa có. Có timeout cứng để Redis chết lúc khởi động
   * không treo cả tiến trình (mặc định 15 s, env `BULLMQ_START_TIMEOUT_MS`).
   *
   * @returns {Promise<void>}
   */
  async ensureQueueInfra() {
    if (!this.isQueueFeatureEnabled()) return;
    if (this.connection && this.lanes.size === Object.keys(LANE_CONFIG).length) return;

    const prefix = String(process.env.BULLMQ_QUEUE_PREFIX || '').trim();
    const redisConfig = this.buildRedisConfig();
    this.connection = new IORedis(redisConfig, this.buildRedisClientOptions());
    this.connection.on('error', (error) => {
      // ioredis tự nối lại; chỉ log gọn để khỏi tràn terminal khi Redis chập chờn.
      const now = Date.now();
      if (now - (this.lastRedisErrorLogAt || 0) < 10_000) return;
      this.lastRedisErrorLogAt = now;
      console.warn(`[BullMQ] Redis connection error: ${error?.message || error}`);
    });

    const startTimeoutMs = readPositiveIntEnv('BULLMQ_START_TIMEOUT_MS', 15_000);
    const ready = [];
    for (const [laneName, config] of Object.entries(LANE_CONFIG)) {
      const queueOptions = { connection: this.connection, ...(prefix ? { prefix } : {}) };
      const queue = new Queue(config.queueName, queueOptions);
      const queueEvents = new QueueEvents(config.queueName, queueOptions);
      this.lanes.set(laneName, {
        name: laneName, queueName: config.queueName, queue, queueEvents, worker: null,
      });
      ready.push(queue.waitUntilReady(), queueEvents.waitUntilReady());
    }
    await withTimeout(
      Promise.all(ready),
      startTimeoutMs,
      'BULLMQ_START_TIMEOUT',
      `Redis không sẵn sàng sau ${startTimeoutMs}ms`
    );
  }

  /**
   * Đăng ký handler cho từng loại job.
   *
   * @param {string} jobType tên loại job
   * @param {(payload: any, job: any) => Promise<any>} handler hàm xử lý
   */
  registerProcessor(jobType, handler) {
    if (!jobType || typeof handler !== 'function') return;
    this.processorMap.set(String(jobType).trim(), handler);
  }

  /**
   * Lấy thống kê hàng đợi hiện tại (cộng dồn mọi hàng đợi + chi tiết từng hàng đợi trong `byQueue`)
   * để theo dõi tải gửi API. Có timeout để trang quản trị không treo khi Redis chết.
   *
   * @returns {Promise<object|null>}
   */
  async getQueueMetrics() {
    if (this.lanes.size === 0) return null;
    try {
      const names = ['waiting', 'active', 'delayed', 'completed', 'failed', 'paused'];
      const entries = await Promise.all([...this.lanes.values()].map(async (lane) => {
        const counts = await withTimeout(
          lane.queue.getJobCounts(...names),
          5_000,
          'BULLMQ_METRICS_TIMEOUT',
          'Đọc job counts quá lâu'
        );
        const normalized = {};
        for (const name of names) normalized[name] = Number(counts?.[name] || 0);
        return [lane.name, normalized];
      }));
      const total = Object.fromEntries(names.map((name) => [name, 0]));
      const byQueue = {};
      for (const [laneName, normalized] of entries) {
        byQueue[laneName] = normalized;
        for (const name of names) total[name] += normalized[name];
      }
      return { ...total, byQueue };
    } catch (error) {
      console.warn(`[BullMQ][Metrics] Không thể đọc queue metrics: ${error?.message || error}`);
      return null;
    }
  }

  /**
   * Trạng thái sức khoẻ để chẩn đoán (không gọi Redis).
   *
   * @returns {object}
   */
  getHealthSnapshot() {
    return {
      enabled: this.isQueueFeatureEnabled(),
      workerStarted: this.workerStarted,
      degraded: this.degraded,
      consecutiveHealthFailures: this.consecutiveHealthFailures,
      lastHealthOkAt: this.lastHealthOkAt,
      lastDegradedAt: this.lastDegradedAt,
      queues: [...this.lanes.values()].map((lane) => lane.queueName),
    };
  }

  /**
   * In số lượng job queue ra terminal để biết còn bao nhiêu API cần gửi.
   *
   * @returns {Promise<{available: boolean}>}
   */
  async getRedisStats() {
    if (!this.connection) return { available: false };
    try {
      const [memInfo, configResult] = await withTimeout(
        Promise.all([
          this.connection.info('memory'),
          this.connection.config('GET', 'maxmemory-policy'),
        ]),
        5_000,
        'BULLMQ_REDIS_STATS_TIMEOUT',
        'Đọc thống kê Redis quá lâu'
      );

      const parsed = {};
      memInfo.split('\r\n').forEach((line) => {
        const [k, v] = line.split(':');
        if (k && v !== undefined) parsed[k.trim()] = v.trim();
      });

      let evictionPolicy = 'unknown';
      if (Array.isArray(configResult) && configResult.length >= 2) {
        evictionPolicy = configResult[1];
      } else if (configResult && typeof configResult === 'object') {
        evictionPolicy = configResult['maxmemory-policy'] ?? 'unknown';
      }

      return {
        available: true,
        usedMemory: Number(parsed.used_memory || 0),
        maxMemory: Number(parsed.maxmemory || 0),
        evictionPolicy,
        evictionPolicyOk: evictionPolicy === 'noeviction',
      };
    } catch (err) {
      return { available: false, error: err.message };
    }
  }

  /**
   * In số lượng job queue ra terminal để biết còn bao nhiêu API cần gửi.
   *
   * @param {string} phase nhãn ngữ cảnh thời điểm log (enqueue/completed/failed)
   * @param {string} [jobType=''] loại job liên quan
   * @param {string|number} [jobId=''] id job liên quan
   * @returns {Promise<void>}
   */
  async logQueueMetrics(phase, jobType = '', jobId = '') {
    const metrics = await this.getQueueMetrics();
    if (!metrics) return;
    const pending = metrics.waiting + metrics.active + metrics.delayed;
    const details = [
      `phase=${String(phase || 'unknown')}`,
      jobType ? `type=${String(jobType)}` : null,
      jobId ? `jobId=${String(jobId)}` : null,
      `pending=${pending}`,
      `waiting=${metrics.waiting}`,
      `active=${metrics.active}`,
      `delayed=${metrics.delayed}`,
      `failed=${metrics.failed}`,
      `completed=${metrics.completed}`,
    ].filter(Boolean).join(' ');
    console.info(`[BullMQ][Metrics] ${details}`);
  }

  /**
   * Ghi log metrics không chặn luồng gửi và không quá 1 lần / 5 s (mỗi job một vòng Redis là thừa).
   */
  logQueueMetricsThrottled(phase, jobType = '', jobId = '') {
    const now = Date.now();
    if (now - this.lastMetricsLogAt < 5_000) return;
    this.lastMetricsLogAt = now;
    void this.logQueueMetrics(phase, jobType, jobId).catch(() => {});
  }

  /**
   * Chạy xử lý trực tiếp trong process hiện tại.
   * Dùng khi BullMQ tắt hoặc Redis chưa sẵn sàng.
   *
   * @param {string} jobType tên loại job
   * @param {any} payload dữ liệu job
   * @returns {Promise<any>}
   */
  async executeInline(jobType, payload) {
    const normalizedType = String(jobType || '').trim();
    const handler = this.processorMap.get(normalizedType);
    if (!handler) {
      throw new Error(`Chưa đăng ký processor cho job type: ${normalizedType}`);
    }
    return handler(payload, null);
  }

  /**
   * Chạy thẳng vì Redis đang hỏng/chưa sẵn sàng, ghi log (tối đa 1 lần / 30 s để khỏi tràn log).
   */
  executeInlineWithNotice(jobType, payload, reason) {
    const now = Date.now();
    if (now - this.lastInlineFallbackLogAt > 30_000) {
      this.lastInlineFallbackLogAt = now;
      console.warn(`[BullMQ] Chạy trong tiến trình (không qua hàng đợi) type=${jobType} lý do=${reason}`);
    }
    return this.executeInline(jobType, payload);
  }

  /**
   * Bọc handler để worker trả kết quả: lỗi ở lần chạy CUỐI được chuẩn hoá thành object (việc d) để bên gọi
   * dựng lại Error đủ thuộc tính; lỗi ở lần chưa cuối vẫn ném để BullMQ retry/backoff (job dữ liệu).
   *
   * @param {string} laneName
   * @returns {(job: any) => Promise<any>}
   */
  buildLaneProcessor(laneName) {
    return async (job) => {
      const jobType = String(job?.name || '').trim();

      if (this.isJobAbandoned(laneName, job)) {
        console.warn(`[BullMQ] Bỏ qua job đã chạy thẳng id=${job?.id} type=${jobType}`);
        return serializeJobError(
          makeCodedError('Job đã được chạy thẳng trong tiến trình, bỏ qua bản trong hàng đợi', 'JOB_ABANDONED'),
          { jobType }
        );
      }

      const handler = this.processorMap.get(jobType);
      if (!handler) {
        throw new Error(`Không tìm thấy processor cho job type: ${jobType}`);
      }
      try {
        return await handler(job.data, job);
      } catch (error) {
        const maxAttempts = Number.parseInt(job?.opts?.attempts, 10) || 1;
        const attemptsMade = Number.parseInt(job?.attemptsMade, 10) || 0;
        if (attemptsMade + 1 < maxAttempts) throw error;
        console.error(
          `[BullMQ] Job error id=${job?.id || 'unknown'} type=${jobType} code=${error?.code || ''} message=${error?.message || error}`
        );
        return serializeJobError(error, { jobType });
      }
    };
  }

  /**
   * Khởi động worker BullMQ cho cả ba hàng đợi.
   * Worker xử lý các job gửi tin để tách khỏi request loop và có retry/backoff chuẩn.
   * Gọi đồng thời nhiều lần chỉ khởi động một lần; thất bại thì thử lại sau `BULLMQ_START_RETRY_MS` (30 s)
   * thay vì tắt hàng đợi vĩnh viễn như bản cũ.
   *
   * @returns {Promise<boolean>}
   */
  async startWorker() {
    if (!this.isQueueFeatureEnabled()) {
      console.warn('[BullMQ] Tính năng queue đang tắt, hệ thống dùng xử lý trực tiếp');
      return false;
    }
    if (this.workerStarted) return true;
    if (this.startPromise) return this.startPromise;
    if (Date.now() < this.nextStartRetryAt) return false;

    this.startPromise = this.startWorkerOnce().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async startWorkerOnce() {
    try {
      await this.ensureQueueInfra();

      // Tiến trình duy nhất (xem CLAUDE.md "Campaign runtime — single process only"): job còn chờ trong Redis từ
      // tiến trình trước không còn ai đợi kết quả, chạy lại chúng sẽ gửi trùng với lượt resume của chiến dịch.
      if (!this.drainedOnStart && this.parseEnvBoolean(process.env.BULLMQ_DRAIN_ON_START, true)) {
        for (const lane of this.lanes.values()) {
          const drained = await withTimeout(
            lane.queue.drain(true),
            10_000,
            'BULLMQ_DRAIN_TIMEOUT',
            'Dọn hàng đợi lúc khởi động quá lâu'
          ).then(() => true, (error) => {
            console.warn(`[BullMQ] Không dọn được hàng đợi ${lane.queueName}: ${error?.message || error}`);
            return false;
          });
          if (drained) console.info(`[BullMQ] Đã dọn job tồn của hàng đợi ${lane.queueName} lúc khởi động`);
        }
        this.drainedOnStart = true;
      }

      const prefix = String(process.env.BULLMQ_QUEUE_PREFIX || '').trim();
      for (const [laneName, lane] of this.lanes.entries()) {
        const workerConfig = this.resolveLaneWorkerConfig(laneName);
        lane.worker = new Worker(
          lane.queueName,
          this.buildLaneProcessor(laneName),
          {
            connection: this.connection,
            ...(prefix ? { prefix } : {}),
            concurrency: workerConfig.concurrency,
            ...(workerConfig.limiter ? { limiter: workerConfig.limiter } : {}),
            lockDuration: workerConfig.lockDuration,
            // Job "stalled" (tiến trình chết/đơ giữa chừng) KHÔNG được chạy lại: handler đã có thể gửi rồi,
            // chạy lại là gửi trùng. Để nó thất bại; chiến dịch resume sẽ tự xử lý người nhận đó qua ledger.
            maxStalledCount: 0,
          }
        );
        lane.worker.on('error', (error) => {
          console.error(`[BullMQ] Worker ${lane.queueName} error: ${error?.message || error}`);
        });
        lane.worker.on('failed', (job, error) => {
          console.error(
            `[BullMQ] Job failed id=${job?.id || 'unknown'} queue=${lane.queueName} type=${job?.name || 'unknown'} error=${error?.message || error}`
          );
          this.logQueueMetricsThrottled('worker_failed', job?.name, job?.id);
        });
        lane.worker.on('completed', (job) => {
          console.info(`[BullMQ] Job completed id=${job?.id || 'unknown'} queue=${lane.queueName} type=${job?.name || 'unknown'}`);
          this.logQueueMetricsThrottled('worker_completed', job?.name, job?.id);
        });
      }
      await withTimeout(
        Promise.all([...this.lanes.values()].map((lane) => lane.worker.waitUntilReady())),
        readPositiveIntEnv('BULLMQ_START_TIMEOUT_MS', 15_000),
        'BULLMQ_START_TIMEOUT',
        'Worker BullMQ không sẵn sàng kịp'
      );

      this.workerStarted = true;
      this.startedAtLeastOnce = true;
      this.degraded = false;
      this.consecutiveHealthFailures = 0;
      this.startHealthCheck();
      console.info(`[BullMQ] Worker đã khởi động thành công (${[...this.lanes.values()].map((l) => l.queueName).join(', ')})`);
      return true;
    } catch (error) {
      // ETIMEDOUT ở đây là timeout TCP tới Redis (ioredis), không phải API Zalo — job qua queue sẽ chạy thẳng.
      const redisTimeoutHint = String(error?.code || '').toUpperCase() === 'ETIMEDOUT'
        ? ' Gợi ý: kiểm tra BULLMQ_REDIS_URL/REDIS_URL, firewall/VPC; có thể tăng BULLMQ_REDIS_CONNECT_TIMEOUT_MS.'
        : '';
      const retryMs = readPositiveIntEnv('BULLMQ_START_RETRY_MS', 30_000);
      this.nextStartRetryAt = Date.now() + retryMs;
      console.error(
        `[BullMQ] Không thể khởi động worker, chạy thẳng trong tiến trình và thử lại sau ${Math.round(retryMs / 1000)}s: ${error?.message || error}.${redisTimeoutHint}`
      );
      await this.close();
      return false;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Sức khoẻ Redis (việc c)
  // ---------------------------------------------------------------------------------------------

  /**
   * Bật kiểm tra sức khoẻ định kỳ (PING). Env: `BULLMQ_HEALTH_CHECK_INTERVAL_MS` (mặc định 10 s),
   * `BULLMQ_HEALTH_CHECK_TIMEOUT_MS` (3 s), `BULLMQ_HEALTH_FAIL_THRESHOLD` (2 lần liên tiếp).
   */
  startHealthCheck() {
    this.stopHealthCheck();
    const intervalMs = readPositiveIntEnv('BULLMQ_HEALTH_CHECK_INTERVAL_MS', 10_000);
    this.healthTimer = setInterval(() => {
      void this.runHealthCheck();
    }, intervalMs);
    if (typeof this.healthTimer.unref === 'function') this.healthTimer.unref();
  }

  stopHealthCheck() {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = null;
  }

  /**
   * Một lần PING Redis; cập nhật cờ `degraded` (tự hồi phục khi PING lại thành công).
   *
   * @returns {Promise<boolean>} true nếu Redis phản hồi
   */
  async runHealthCheck() {
    if (!this.connection || this.healthCheckInFlight) return !this.degraded;
    this.healthCheckInFlight = true;
    try {
      await withTimeout(
        this.connection.ping(),
        readPositiveIntEnv('BULLMQ_HEALTH_CHECK_TIMEOUT_MS', 3_000),
        'BULLMQ_HEALTH_TIMEOUT',
        'Redis PING quá lâu'
      );
      this.consecutiveHealthFailures = 0;
      this.lastHealthOkAt = Date.now();
      if (this.degraded) {
        this.degraded = false;
        console.info('[BullMQ] Redis đã hồi phục, quay lại gửi qua hàng đợi');
      }
      return true;
    } catch (error) {
      this.consecutiveHealthFailures += 1;
      const threshold = readPositiveIntEnv('BULLMQ_HEALTH_FAIL_THRESHOLD', 2);
      if (this.consecutiveHealthFailures >= threshold) {
        this.markDegraded('health_check_failed', error);
      }
      return false;
    } finally {
      this.healthCheckInFlight = false;
    }
  }

  /**
   * Đánh dấu Redis hỏng: từ giờ job mới chạy thẳng trong tiến trình; các caller đang chờ kết quả được
   * báo ngay (không đợi hết thời gian chờ dài).
   *
   * @param {string} reason
   * @param {any} [error]
   */
  markDegraded(reason, error) {
    if (this.degraded) return;
    this.degraded = true;
    this.lastDegradedAt = Date.now();
    console.error(`[BullMQ] Redis không ổn định (${reason}): ${error?.message || error || ''} — chuyển sang chạy thẳng trong tiến trình, tự quay lại khi Redis sống`);
    for (const reject of [...this.degradedWaiters]) {
      reject(makeCodedError('Redis ngừng phản hồi khi đang chờ kết quả job', 'OUTBOUND_QUEUE_DEGRADED'));
    }
    this.degradedWaiters.clear();
  }

  /**
   * Promise bị từ chối khi Redis chuyển sang `degraded`; `dispose()` để gỡ khi xong.
   */
  createDegradedWatcher() {
    let rejecter;
    const promise = new Promise((_, reject) => {
      rejecter = reject;
    });
    promise.catch(() => {});
    this.degradedWaiters.add(rejecter);
    return { promise, dispose: () => this.degradedWaiters.delete(rejecter) };
  }

  // ---------------------------------------------------------------------------------------------
  // Job bị bỏ (đã chạy thẳng)
  // ---------------------------------------------------------------------------------------------

  abandonJob(laneName, jobId) {
    const now = Date.now();
    for (const [key, at] of this.abandonedJobs.entries()) {
      if (now - at > 15 * 60_000) this.abandonedJobs.delete(key);
    }
    this.abandonedJobs.set(`${laneName}:${jobId}`, now);
  }

  isJobAbandoned(laneName, job) {
    const abandonedAt = this.abandonedJobs.get(`${laneName}:${job?.id}`);
    if (!abandonedAt) return false;
    // Chỉ bỏ job được TẠO TRƯỚC thời điểm bỏ (job ma xuất hiện muộn); lần add hợp lệ sau đó vẫn chạy.
    const createdAt = Number(job?.timestamp);
    return !Number.isFinite(createdAt) || createdAt <= abandonedAt;
  }

  // ---------------------------------------------------------------------------------------------
  // Đẩy job + chờ kết quả
  // ---------------------------------------------------------------------------------------------

  /**
   * Thêm job vào hàng đợi với timeout cứng (việc c) và jobId ổn định (việc a).
   *
   * - jobId ổn định (khoá giữ chỗ quota của lần gửi logic): add lại cùng khoá khi job còn đang chờ/chạy sẽ
   *   dùng lại đúng job đó thay vì tạo bản thứ hai (không gửi trùng).
   * - Job đã KẾT THÚC (completed/failed) cùng id bị xoá trước khi add: lần gửi lại hợp lệ (retry theo lịch có
   *   cùng khoá) phải chạy thật, không được nhận lại kết quả cũ.
   *
   * @returns {Promise<any>} job BullMQ
   */
  async addJob({ lane, type, payload, jobId, jobOptions }) {
    const attempts = readPositiveIntEnv('BULLMQ_JOB_ATTEMPTS', 4);
    const addTimeoutMs = readPositiveIntEnv('BULLMQ_ADD_TIMEOUT_MS', 5_000);
    return withTimeout(async () => {
      const existing = await lane.queue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === 'completed' || state === 'failed') {
          await existing.remove();
        } else {
          console.info(`[BullMQ] Dùng lại job đang xử lý id=${jobId} state=${state}`);
          return existing;
        }
      }
      return lane.queue.add(type, payload, {
        attempts: Math.max(1, attempts),
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 100, age: 86400 },
        removeOnFail: { count: 200, age: 7 * 86400 },
        ...jobOptions,
        jobId,
      });
    }, addTimeoutMs, 'BULLMQ_ADD_TIMEOUT', `Thêm job vào Redis quá ${addTimeoutMs}ms`);
  }

  /**
   * Đẩy job vào hàng đợi và chờ kết quả cuối cùng.
   * Redis hỏng / chưa sẵn sàng thì chạy thẳng trong tiến trình để không gián đoạn nghiệp vụ.
   *
   * @param {object} input
   * @param {string} input.type loại job
   * @param {any} input.payload dữ liệu job
   * @param {object} [input.jobOptions] tùy chọn thêm cho job
   * @param {number} [input.waitTimeoutMs] thời gian chờ kết quả mong muốn; luôn được nâng lên >= mức tối thiểu của hàng đợi
   * @param {string} [input.jobKey] khoá logic của lần gửi (reservationKey) → jobId ổn định chống gửi trùng
   * @returns {Promise<any>}
   */
  async enqueueAndWait({ type, payload, jobOptions = {}, waitTimeoutMs, jobKey }) {
    const normalizedType = String(type || '').trim();
    if (!normalizedType) {
      throw new Error('Thiếu loại job khi enqueue BullMQ');
    }

    if (!this.isQueueFeatureEnabled()) {
      return this.executeInline(normalizedType, payload);
    }

    const laneName = this.resolveLaneName(normalizedType);
    if (!laneName) {
      throw new Error(`Loại job chưa được gán hàng đợi: ${normalizedType}`);
    }

    if (this.degraded) {
      return this.executeInlineWithNotice(normalizedType, payload, 'redis_degraded');
    }
    if (!this.workerStarted) {
      await this.startWorker();
    }
    if (!this.workerStarted || this.degraded) {
      return this.executeInlineWithNotice(normalizedType, payload, this.degraded ? 'redis_degraded' : 'worker_not_started');
    }

    // Payload dữ liệu (lưu khách từ Sheet…) có thể rất lớn; Redis chạy noeviction nên đầy bộ nhớ là hỏng cả
    // hàng đợi KB. Quá trần thì chạy thẳng thay vì nhét vào Redis.
    if (laneName === OUTBOUND_QUEUE_LANES.DATA) {
      const maxBytes = readPositiveIntEnv('BULLMQ_MAX_PAYLOAD_BYTES', 2 * 1024 * 1024);
      const approxBytes = Buffer.byteLength(JSON.stringify(payload ?? null));
      if (approxBytes > maxBytes) {
        return this.executeInlineWithNotice(normalizedType, payload, `payload_${approxBytes}B_vuot_tran`);
      }
    }

    const lane = this.lanes.get(laneName);
    const jobId = buildJobIdFromKey(jobKey) || `job_${normalizedType}_${randomUUID()}`;

    let job;
    try {
      job = await this.addJob({ lane, type: normalizedType, payload, jobId, jobOptions });
    } catch (addError) {
      // Job CHƯA chắc chắn nằm trong hàng đợi (Redis chậm/chết). Chạy thẳng là an toàn nếu bản trong hàng đợi,
      // nếu xuất hiện muộn, bị worker bỏ qua (`abandonJob`).
      console.error(`[BullMQ] Thêm job lỗi type=${normalizedType} jobId=${jobId}: ${addError?.message || addError}`);
      this.abandonJob(laneName, jobId);
      this.markDegraded('add_failed', addError);
      return this.executeInline(normalizedType, payload);
    }

    this.logQueueMetricsThrottled('enqueue', normalizedType, job?.id);
    return this.waitForJobResult({
      lane,
      job,
      jobId,
      budgetMs: this.resolveWaitBudgetMs(normalizedType, waitTimeoutMs),
    });
  }

  /**
   * Nhả kết quả job: object lỗi chuẩn hoá được dựng lại thành Error (đủ thuộc tính) rồi ném.
   */
  unwrapJobResult(value) {
    if (isSerializedJobError(value)) throw reviveJobError(value);
    return value;
  }

  /**
   * Chờ kết quả job. Hết giờ chờ KHÔNG đồng nghĩa với thất bại (việc b): hỏi lại trạng thái job — đã xong thì
   * trả kết quả thật, đã lỗi thì ném lỗi thật, còn đang chạy thì chờ thêm `STATE_POLL_GRACE_MS` rồi mới báo
   * "chưa biết kết quả". Lỗi "chưa biết" cố ý KHÔNG chứa chữ timeout để `executeWithTimeoutRetry` ở caller
   * không tự gửi lại một job có thể đã gửi.
   *
   * @returns {Promise<any>}
   */
  async waitForJobResult({ lane, job, jobId, budgetMs }) {
    const watcher = this.createDegradedWatcher();
    try {
      let outcome;
      try {
        outcome = { value: await Promise.race([job.waitUntilFinished(lane.queueEvents, budgetMs), watcher.promise]) };
      } catch (waitError) {
        outcome = { error: waitError };
      }
      if ('value' in outcome) return this.unwrapJobResult(outcome.value);

      const waitError = outcome.error;
      if (waitError?.code === 'OUTBOUND_QUEUE_DEGRADED') {
        throw this.buildUnknownResultError(job, jobId, 'Redis ngừng phản hồi', waitError);
      }
      return await this.resolveAfterWaitFailure({ lane, job, jobId, waitError, watcher });
    } finally {
      watcher.dispose();
    }
  }

  buildUnknownResultError(job, jobId, why, cause) {
    return makeCodedError(
      `Chưa biết kết quả job ${job?.name || ''} (${why}). Job có thể đã chạy xong; không tự gửi lại.`,
      'OUTBOUND_JOB_RESULT_UNKNOWN',
      { jobId, retryable: false, ...(cause ? { cause } : {}) }
    );
  }

  async resolveAfterWaitFailure({ lane, job, jobId, waitError, watcher }) {
    const graceMs = readPositiveIntEnv('BULLMQ_WAIT_GRACE_MS', OUTBOUND_JOB_WAIT.STATE_POLL_GRACE_MS);
    const pollMs = Math.min(OUTBOUND_JOB_WAIT.STATE_POLL_INTERVAL_MS, Math.max(10, Math.floor(graceMs / 4)));
    const deadline = Date.now() + graceMs;
    for (;;) {
      let state;
      try {
        state = await withTimeout(job.getState(), 5_000, 'BULLMQ_STATE_TIMEOUT', 'Tra trạng thái job quá lâu');
      } catch (stateError) {
        throw this.buildUnknownResultError(job, jobId, 'không tra được trạng thái', stateError);
      }

      if (state === 'completed') {
        const fresh = await withTimeout(lane.queue.getJob(jobId), 5_000, 'BULLMQ_STATE_TIMEOUT', 'Đọc kết quả job quá lâu')
          .catch(() => null);
        if (!fresh) throw this.buildUnknownResultError(job, jobId, 'job đã xong nhưng không đọc được kết quả', waitError);
        return this.unwrapJobResult(fresh.returnvalue);
      }
      if (state === 'failed') {
        const fresh = await withTimeout(lane.queue.getJob(jobId), 5_000, 'BULLMQ_STATE_TIMEOUT', 'Đọc kết quả job quá lâu')
          .catch(() => null);
        throw makeCodedError(
          String(fresh?.failedReason || waitError?.message || 'Job thất bại'),
          'OUTBOUND_JOB_FAILED',
          { jobId }
        );
      }
      if (state === 'unknown') {
        throw this.buildUnknownResultError(job, jobId, 'job không còn trong hàng đợi', waitError);
      }

      // waiting / active / delayed / prioritized / waiting-children: vẫn đang xử lý.
      if (Date.now() >= deadline) {
        throw this.buildUnknownResultError(job, jobId, `vẫn ở trạng thái ${state} sau thời gian chờ`, waitError);
      }
      try {
        await Promise.race([sleep(pollMs), watcher.promise]);
      } catch (degradedError) {
        throw this.buildUnknownResultError(job, jobId, 'Redis ngừng phản hồi', degradedError);
      }
    }
  }

  /**
   * Đóng tài nguyên BullMQ để shutdown sạch. Mọi bước có timeout (Redis chết không được chặn shutdown).
   *
   * @returns {Promise<void>}
   */
  async close() {
    this.stopHealthCheck();
    for (const reject of [...this.degradedWaiters]) {
      reject(makeCodedError('Hàng đợi đang đóng', 'OUTBOUND_QUEUE_DEGRADED'));
    }
    this.degradedWaiters.clear();

    const safeClose = (fn) => withTimeout(Promise.resolve().then(fn), 3_000, 'BULLMQ_CLOSE_TIMEOUT', 'Đóng quá lâu')
      .catch(() => { /* noop */ });

    const lanes = [...this.lanes.values()];
    this.lanes = new Map();
    this.workerStarted = false;
    // Song song + timeout ngắn: Redis chết thì từng close() treo tới hết timeout, tuần tự sẽ chặn shutdown cả chục giây.
    await Promise.all(lanes.flatMap((lane) => [
      lane.worker ? safeClose(() => lane.worker.close()) : null,
      lane.queueEvents ? safeClose(() => lane.queueEvents.close()) : null,
      lane.queue ? safeClose(() => lane.queue.close()) : null,
    ].filter(Boolean)));
    if (this.connection) {
      const connection = this.connection;
      this.connection = null;
      await safeClose(() => connection.quit());
      try { connection.disconnect(); } catch { /* noop */ }
    }
  }
}

export default new OutboundMessageQueueService();
export { OutboundMessageQueueService };
