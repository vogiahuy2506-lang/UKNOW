import { Queue, QueueEvents, Worker } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Job types for KB document processing queue.
 */
export const KB_QUEUE_JOB_TYPES = {
  PROCESS_DOCUMENT: 'kb.document.process',
};

const QUEUE_NAME = 'kb-document-queue';

class KBDocumentQueueService {
  constructor() {
    this.connection = null;
    this.queue = null;
    this.queueEvents = null;
    this.worker = null;
    this.workerStarted = false;
    this.processorMap = new Map();
  }

  /**
   * Build Redis connection config for BullMQ.
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
   * Build Redis client options for BullMQ.
   */
  buildRedisClientOptions() {
    const rawTimeout = String(
      process.env.BULLMQ_REDIS_CONNECT_TIMEOUT_MS
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
   * Initialize queue infrastructure if not already started.
   */
  async ensureQueueInfra() {
    if (this.queue && this.queueEvents) return;

    const redisConfig = this.buildRedisConfig();
    this.connection = new IORedis(redisConfig, this.buildRedisClientOptions());
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
    this.queueEvents = new QueueEvents(QUEUE_NAME, { connection: this.connection });
    await this.queueEvents.waitUntilReady();
  }

  /**
   * Register a processor for a job type.
   * @param {string} jobType
   * @param {Function} handler
   */
  registerProcessor(jobType, handler) {
    if (!jobType || typeof handler !== 'function') return;
    this.processorMap.set(String(jobType).trim(), handler);
  }

  /**
   * Start the BullMQ worker for KB document processing.
   * Separate worker with lower concurrency to not compete with message sending.
   */
  async startWorker() {
    if (this.workerStarted) return true;

    try {
      await this.ensureQueueInfra();

      // Lower concurrency for KB processing (embedding API is rate-limited)
      const concurrency = Number.parseInt(
        process.env.KB_QUEUE_WORKER_CONCURRENCY || '2',
        10
      );

      this.worker = new Worker(
        QUEUE_NAME,
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
          concurrency: Number.isFinite(concurrency) ? Math.max(1, concurrency) : 2,
        }
      );

      this.worker.on('failed', (job, error) => {
        console.error(
          `[KBQueue] Job failed id=${job?.id || 'unknown'} type=${job?.name || 'unknown'} error=${error?.message || error}`
        );
      });

      this.worker.on('completed', (job) => {
        console.info(`[KBQueue] Job completed id=${job?.id || 'unknown'} type=${job?.name || 'unknown'}`);
      });

      await this.worker.waitUntilReady();
      this.workerStarted = true;
      console.info('[KBQueue] Worker started successfully');
      return true;
    } catch (error) {
      console.error(`[KBQueue] Worker start failed: ${error?.message || error}`);
      await this.close();
      return false;
    }
  }

  /**
   * Enqueue a document processing job (non-blocking).
   * Returns immediately after enqueueing.
   *
   * @param {object} payload
   * @param {number} payload.docId
   * @param {number} payload.kbId
   * @param {number} payload.userId
   * @param {object} payload.options
   * @returns {Promise<{enqueued: boolean, jobId: string|null}>}
   */
  async enqueueProcessDocument(payload) {
    try {
      if (!this.workerStarted) {
        await this.startWorker();
      }

      if (!this.workerStarted) {
        // Queue not available, return false
        return { enqueued: false, jobId: null };
      }

      const job = await this.queue.add(
        KB_QUEUE_JOB_TYPES.PROCESS_DOCUMENT,
        payload,
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { count: 50, age: 3600 },
          removeOnFail: { count: 100, age: 86400 },
        }
      );

      console.info(`[KBQueue] Enqueued doc ${payload.docId} as job ${job?.id}`);
      return { enqueued: true, jobId: job?.id || null };
    } catch (error) {
      console.error(`[KBQueue] Failed to enqueue doc ${payload.docId}:`, error.message);
      return { enqueued: false, jobId: null };
    }
  }

  /**
   * Get processing status of a job.
   * @param {string|number} jobId
   * @returns {Promise<object|null>}
   */
  async getJobStatus(jobId) {
    if (!this.queue) return null;
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) return null;

      const state = await job.getState();
      return {
        id: job.id,
        status: state,
        progress: job.progress,
        result: job.returnvalue,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        finishedOn: job.finishedOn,
        processedOn: job.processedOn,
      };
    } catch (error) {
      console.warn(`[KBQueue] Failed to get job status:`, error.message);
      return null;
    }
  }

  /**
   * Get queue metrics.
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
        'failed'
      );
      return {
        waiting: Number(counts?.waiting || 0),
        active: Number(counts?.active || 0),
        delayed: Number(counts?.delayed || 0),
        completed: Number(counts?.completed || 0),
        failed: Number(counts?.failed || 0),
      };
    } catch (error) {
      console.warn(`[KBQueue] Failed to get metrics:`, error.message);
      return null;
    }
  }

  /**
   * Close queue connections.
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

export default new KBDocumentQueueService();
