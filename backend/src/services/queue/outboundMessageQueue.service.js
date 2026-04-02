import { Queue, QueueEvents, Worker } from 'bullmq';
import IORedis from 'ioredis';

export const OUTBOUND_MESSAGE_JOB_TYPES = {
  EMAIL_SEND: 'email.send',
  ZALO_PERSONAL_SEND: 'zalo.personal.send',
  ZALO_GROUP_SEND: 'zalo.group.send',
  ZALO_FRIEND_REQUEST_SEND: 'zalo.friend_request.send',
  CUSTOMER_SAVE: 'customer.save',
  /** Tải + parse Google Sheet (public link) trên worker để tách tải và scale concurrency */
  GOOGLE_SHEET_FETCH: 'sheet.google.fetch',
};

class OutboundMessageQueueService {
  constructor() {
    this.queueName = 'outbound-message-queue';
    this.processorMap = new Map();
    this.connection = null;
    this.queue = null;
    this.queueEvents = null;
    this.worker = null;
    this.workerStarted = false;
    this.startedAtLeastOnce = false;
    this.runtimeDisabled = false;
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
   * Khởi tạo kết nối Redis/Queue/QueueEvents nếu chưa có.
   *
   * @returns {Promise<void>}
   */
  async ensureQueueInfra() {
    if (!this.isQueueFeatureEnabled() || this.runtimeDisabled) return;
    if (this.queue && this.queueEvents) return;

    const redisConfig = this.buildRedisConfig();
    this.connection = new IORedis(redisConfig, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    this.queue = new Queue(this.queueName, { connection: this.connection });
    this.queueEvents = new QueueEvents(this.queueName, { connection: this.connection });
    await this.queueEvents.waitUntilReady();
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
   * Lấy thống kê hàng đợi hiện tại để theo dõi tải gửi API trong terminal.
   *
   * Luồng hoạt động:
   * 1. Đọc job counts trực tiếp từ BullMQ queue.
   * 2. Chuẩn hóa về object số để log ổn định.
   * 3. Trả về null nếu queue chưa sẵn sàng hoặc đọc lỗi.
   *
   * @returns {Promise<object|null>}
   */
  async getQueueMetrics() {
    if (!this.queue) return null;
    try {
      const counts = await this.queue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'completed',
        'failed',
        'paused'
      );
      return {
        waiting: Number(counts?.waiting || 0),
        active: Number(counts?.active || 0),
        delayed: Number(counts?.delayed || 0),
        completed: Number(counts?.completed || 0),
        failed: Number(counts?.failed || 0),
        paused: Number(counts?.paused || 0),
      };
    } catch (error) {
      console.warn(`[BullMQ][Metrics] Không thể đọc queue metrics: ${error?.message || error}`);
      return null;
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
   * Khởi động worker BullMQ.
   * Worker xử lý các job gửi tin để tách khỏi request loop và có retry/backoff chuẩn.
   *
   * @returns {Promise<boolean>}
   */
  async startWorker() {
    if (!this.isQueueFeatureEnabled() || this.runtimeDisabled) {
      console.warn('[BullMQ] Tính năng queue đang tắt, hệ thống dùng xử lý trực tiếp');
      return false;
    }
    if (this.workerStarted) return true;

    try {
      await this.ensureQueueInfra();
      const concurrency = Number.parseInt(process.env.BULLMQ_WORKER_CONCURRENCY || '8', 10);
      const maxPerDuration = Number.parseInt(process.env.BULLMQ_RATE_LIMIT_MAX || '20', 10);
      const durationMs = Number.parseInt(process.env.BULLMQ_RATE_LIMIT_DURATION_MS || '1000', 10);
      this.worker = new Worker(
        this.queueName,
        async (job) => {
          const jobType = String(job?.name || '').trim();
          const handler = this.processorMap.get(jobType);
          if (!handler) {
            throw new Error(`Không tìm thấy processor cho job type: ${jobType}`);
          }
          return handler(job.data, job);
        },
        {
          connection: this.connection,
          concurrency: Number.isFinite(concurrency) ? Math.max(1, concurrency) : 8,
          limiter: {
            max: Number.isFinite(maxPerDuration) ? Math.max(1, maxPerDuration) : 20,
            duration: Number.isFinite(durationMs) ? Math.max(100, durationMs) : 1000,
          },
        }
      );
      this.worker.on('failed', (job, error) => {
        console.error(
          `[BullMQ] Job failed id=${job?.id || 'unknown'} type=${job?.name || 'unknown'} error=${error?.message || error}`
        );
        void this.logQueueMetrics('worker_failed', job?.name, job?.id);
      });
      this.worker.on('completed', (job) => {
        console.info(`[BullMQ] Job completed id=${job?.id || 'unknown'} type=${job?.name || 'unknown'}`);
        void this.logQueueMetrics('worker_completed', job?.name, job?.id);
      });
      await this.worker.waitUntilReady();
      this.workerStarted = true;
      this.startedAtLeastOnce = true;
      console.info('[BullMQ] Worker đã khởi động thành công');
      return true;
    } catch (error) {
      console.error(`[BullMQ] Không thể khởi động worker, fallback inline: ${error?.message || error}`);
      this.runtimeDisabled = true;
      await this.close();
      return false;
    }
  }

  /**
   * Đẩy job vào hàng đợi và chờ kết quả cuối cùng.
   * Nếu BullMQ không sẵn sàng thì fallback về xử lý inline để không gián đoạn nghiệp vụ.
   *
   * @param {object} input
   * @param {string} input.type loại job
   * @param {any} input.payload dữ liệu job
   * @param {object} [input.jobOptions] tùy chọn thêm cho job
   * @param {number} [input.waitTimeoutMs] ghi đè thời gian chờ kết quả job (mặc định BULLMQ_WAIT_RESULT_TIMEOUT_MS)
   * @returns {Promise<any>}
   */
  async enqueueAndWait({ type, payload, jobOptions = {}, waitTimeoutMs }) {
    const normalizedType = String(type || '').trim();
    if (!normalizedType) {
      throw new Error('Thiếu loại job khi enqueue BullMQ');
    }

    if (!this.isQueueFeatureEnabled() || this.runtimeDisabled) {
      return this.executeInline(normalizedType, payload);
    }

    if (!this.workerStarted) {
      await this.startWorker();
    }
    if (!this.workerStarted) {
      return this.executeInline(normalizedType, payload);
    }

    try {
      const attempts = Number.parseInt(process.env.BULLMQ_JOB_ATTEMPTS || '4', 10);
      const defaultWaitMs = Number.parseInt(process.env.BULLMQ_WAIT_RESULT_TIMEOUT_MS || '60000', 10);
      const effectiveWaitMs = Number.isFinite(Number(waitTimeoutMs))
        ? Number(waitTimeoutMs)
        : defaultWaitMs;
      const job = await this.queue.add(normalizedType, payload, {
        attempts: Number.isFinite(attempts) ? Math.max(1, attempts) : 4,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 3000,
        removeOnFail: 3000,
        ...jobOptions,
      });
      await this.logQueueMetrics('enqueue', normalizedType, job?.id);
      return job.waitUntilFinished(
        this.queueEvents,
        Number.isFinite(effectiveWaitMs) ? Math.max(1000, effectiveWaitMs) : 60000
      );
    } catch (error) {
      await this.logQueueMetrics('enqueue_error', normalizedType);
      // Chỉ fallback inline nếu chưa từng start worker thành công.
      // Nếu worker đã chạy rồi mà job fail thì phải throw để tránh gửi trùng.
      if (!this.startedAtLeastOnce) {
        console.warn(`[BullMQ] Enqueue lỗi trước khi worker sẵn sàng, fallback inline: ${error?.message || error}`);
        return this.executeInline(normalizedType, payload);
      }
      throw error;
    }
  }

  /**
   * Đẩy job vào queue nhưng không chờ kết quả hoàn tất.
   * Dùng cho các trường hợp cần trì hoãn (delay) để retry sau.
   *
   * Luồng hoạt động:
   * 1. Nếu queue tắt/chưa sẵn sàng thì chạy inline ngay để không mất job.
   * 2. Nếu queue sẵn sàng thì add job với `jobOptions` (ví dụ delay 3 giờ).
   * 3. Trả về thông tin job đã enqueue để caller ghi log theo dõi.
   *
   * @param {object} input
   * @param {string} input.type loại job
   * @param {any} input.payload dữ liệu job
   * @param {object} [input.jobOptions] tùy chọn add job
   * @returns {Promise<{enqueued: boolean, jobId: string|number|null}>}
   */
  async enqueue({ type, payload, jobOptions = {} }) {
    const normalizedType = String(type || '').trim();
    const hasDelay = Number.parseInt(jobOptions?.delay, 10) > 0;
    if (!normalizedType) {
      throw new Error('Thiếu loại job khi enqueue BullMQ');
    }

    if (!this.isQueueFeatureEnabled() || this.runtimeDisabled) {
      if (hasDelay) {
        throw new Error('Queue đang tắt nên không thể lên lịch retry delay');
      }
      await this.executeInline(normalizedType, payload);
      return { enqueued: false, jobId: null };
    }

    if (!this.workerStarted) {
      await this.startWorker();
    }
    if (!this.workerStarted) {
      if (hasDelay) {
        throw new Error('Queue chưa sẵn sàng nên không thể lên lịch retry delay');
      }
      await this.executeInline(normalizedType, payload);
      return { enqueued: false, jobId: null };
    }

    const attempts = Number.parseInt(process.env.BULLMQ_JOB_ATTEMPTS || '4', 10);
    const job = await this.queue.add(normalizedType, payload, {
      attempts: Number.isFinite(attempts) ? Math.max(1, attempts) : 4,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 3000,
      removeOnFail: 3000,
      ...jobOptions,
    });
    await this.logQueueMetrics('enqueue_no_wait', normalizedType, job?.id);
    return { enqueued: true, jobId: job?.id || null };
  }

  /**
   * Đóng tài nguyên BullMQ để shutdown sạch.
   *
   * @returns {Promise<void>}
   */
  async close() {
    if (this.worker) {
      try { await this.worker.close(); } catch { /* noop */ }
      this.worker = null;
    }
    if (this.queueEvents) {
      try { await this.queueEvents.close(); } catch { /* noop */ }
      this.queueEvents = null;
    }
    if (this.queue) {
      try { await this.queue.close(); } catch { /* noop */ }
      this.queue = null;
    }
    if (this.connection) {
      try { await this.connection.quit(); } catch { /* noop */ }
      this.connection = null;
    }
    this.workerStarted = false;
  }
}

export default new OutboundMessageQueueService();
