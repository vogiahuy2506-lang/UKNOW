/**
 * BullMQ + ioredis giả CÓ ĐÚNG HÌNH DẠNG THẬT (đã đối chiếu với bullmq 5.x trong node_modules):
 * - `queue.add(name, data, opts)` trả Job; cùng `jobId` đã tồn tại thì trả lại job cũ (không tạo bản thứ hai);
 * - `jobId` chứa `:` bị từ chối giống `Job.validateOptions` thật;
 * - dữ liệu + kết quả đi qua JSON như khi qua Redis;
 * - `job.waitUntilFinished(queueEvents, ttl)` kiểm tra job đã kết thúc ngay lập tức, hết giờ thì reject
 *   `Error('Job wait ... timed out before finishing ...')`, job lỗi thì reject `new Error(failedReason)`
 *   (MẤT thuộc tính lỗi gốc — chính là hành vi cần kiểm);
 * - worker retry theo `opts.attempts` dựa trên `job.attemptsMade` (số lần đã THẤT BẠI).
 */
import { EventEmitter } from 'node:events';

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

export function createFakeBullmq() {
  let autoId = 0;
  const control = {
    queues: new Map(),
    events: new Map(),
    workers: [],
    queueCtorArgs: [],
    drainCalls: [],
    redisInstances: [],
    /** async (name, data, opts) => void — chèn độ trễ / treo trước khi `add` hoàn tất */
    beforeAdd: null,
    /** true: waitUntilFinished luôn reject kiểu hết giờ (mô phỏng mất thông báo) khi job chưa kết thúc */
    forceWaitTimeout: false,
    /** true: job được nhận nhưng worker KHÔNG xử lý (mô phỏng job treo ở trạng thái waiting/active) */
    holdProcessing: false,
    readyFailures: 0,
    pingBehavior: 'ok', // 'ok' | 'fail' | 'hang'
  };

  class FakeJob {
    constructor(queue, name, data, opts) {
      this.queue = queue;
      this.id = opts?.jobId ? String(opts.jobId) : String((autoId += 1));
      this.name = name;
      this.data = clone(data);
      this.opts = { ...opts };
      this.timestamp = Date.now();
      this.attemptsMade = 0;
      this.state = 'waiting';
      this.returnvalue = undefined;
      this.failedReason = undefined;
    }

    async getState() {
      return this.state;
    }

    async remove() {
      this.queue.jobs.delete(this.id);
    }

    waitUntilFinished(queueEvents, ttl) {
      return new Promise((resolve, reject) => {
        let timer;
        const completedEvent = `completed:${this.id}`;
        const failedEvent = `failed:${this.id}`;
        const cleanup = () => {
          clearTimeout(timer);
          queueEvents.removeListener(completedEvent, onCompleted);
          queueEvents.removeListener(failedEvent, onFailed);
        };
        const onCompleted = (args) => { cleanup(); resolve(args.returnvalue); };
        const onFailed = (args) => { cleanup(); reject(new Error(args.failedReason || args)); };
        const timeoutMessage = `Job wait ${this.name} timed out before finishing, no finish notification arrived after ${ttl}ms (id=${this.id})`;
        if (this.state === 'completed') return resolve(this.returnvalue);
        if (this.state === 'failed') return reject(new Error(this.failedReason));
        queueEvents.on(completedEvent, onCompleted);
        queueEvents.on(failedEvent, onFailed);
        if (control.forceWaitTimeout) {
          timer = setTimeout(() => onFailed(timeoutMessage), 5);
        } else if (ttl) {
          timer = setTimeout(() => onFailed(timeoutMessage), ttl);
        }
        return undefined;
      });
    }
  }

  class FakeQueue {
    constructor(name, opts) {
      this.name = name;
      this.opts = opts;
      this.jobs = new Map();
      this.closed = false;
      control.queues.set(name, this);
      control.queueCtorArgs.push({ name, opts });
    }

    async waitUntilReady() {
      if (control.readyFailures > 0) {
        control.readyFailures -= 1;
        throw new Error('connect ECONNREFUSED 127.0.0.1:6379');
      }
    }

    async add(name, data, opts = {}) {
      // Job thật được dựng (timestamp = lúc gọi add) TRƯỚC khi lệnh đi qua mạng tới Redis.
      const createdAt = Date.now();
      if (control.beforeAdd) await control.beforeAdd(name, data, opts);
      if (opts.jobId) {
        const id = String(opts.jobId);
        if (`${parseInt(id, 10)}` === id) throw new Error('Custom Id cannot be integers');
        if (id.includes(':') && id.split(':').length !== 3) throw new Error('Custom Id cannot contain :');
        if (this.jobs.has(id)) return this.jobs.get(id);
      }
      const job = new FakeJob(this, name, data, opts);
      job.timestamp = createdAt;
      this.jobs.set(job.id, job);
      control.kick(this.name, job);
      return job;
    }

    async getJob(id) {
      return this.jobs.get(String(id));
    }

    async getJobCounts(...names) {
      const counts = Object.fromEntries(names.map((n) => [n, 0]));
      for (const job of this.jobs.values()) {
        if (job.state in counts) counts[job.state] += 1;
      }
      return counts;
    }

    async drain(delayed) {
      control.drainCalls.push({ name: this.name, delayed });
      for (const [id, job] of this.jobs.entries()) {
        if (job.state === 'waiting') this.jobs.delete(id);
      }
    }

    async close() { this.closed = true; }
  }

  class FakeQueueEvents extends EventEmitter {
    constructor(name) {
      super();
      this.setMaxListeners(0);
      this.name = name;
      control.events.set(name, this);
    }

    async waitUntilReady() {}

    async close() {}
  }

  class FakeWorker extends EventEmitter {
    constructor(name, processor, opts) {
      super();
      this.name = name;
      this.processor = processor;
      this.opts = opts;
      control.workers.push(this);
      // Nhận các job đã nằm sẵn trong hàng đợi (giống worker thật khởi động sau).
      const queue = control.queues.get(name);
      if (queue) for (const job of queue.jobs.values()) control.kick(name, job);
    }

    async waitUntilReady() {}

    async close() {}
  }

  control.kick = (queueName, job) => {
    if (control.holdProcessing) return;
    const worker = control.workers.find((w) => w.name === queueName);
    if (!worker || job.state !== 'waiting' || job.processing) return;
    job.processing = true;
    setImmediate(() => control.processJob(worker, job));
  };

  control.processJob = async (worker, job) => {
    job.state = 'active';
    const events = control.events.get(worker.name);
    try {
      const result = await worker.processor(job);
      job.returnvalue = clone(result);
      job.state = 'completed';
      worker.emit('completed', job);
      events?.emit(`completed:${job.id}`, { returnvalue: job.returnvalue });
    } catch (error) {
      job.attemptsMade += 1;
      if (job.attemptsMade < (job.opts.attempts || 1)) {
        job.state = 'waiting';
        job.processing = false;
        control.kick(worker.name, job);
        return;
      }
      job.state = 'failed';
      job.failedReason = error?.message || String(error);
      worker.emit('failed', job, error);
      events?.emit(`failed:${job.id}`, { failedReason: job.failedReason });
    }
  };

  /** Phát hành job đang bị giữ (`holdProcessing`) cho worker xử lý. */
  control.release = () => {
    control.holdProcessing = false;
    for (const queue of control.queues.values()) {
      for (const job of queue.jobs.values()) control.kick(queue.name, job);
    }
  };

  class FakeIORedis extends EventEmitter {
    constructor(config, options) {
      super();
      this.connectionConfig = config;
      this.options = options;
      control.redisInstances.push(this);
    }

    async ping() {
      if (control.pingBehavior === 'fail') throw new Error('Connection is closed.');
      if (control.pingBehavior === 'hang') return new Promise(() => {});
      return 'PONG';
    }

    async info() { return 'used_memory:1\r\nmaxmemory:0\r\n'; }

    async quit() {}

    disconnect() {}
  }
  FakeIORedis.prototype.config = async function config() { return ['maxmemory-policy', 'noeviction']; };

  control.reset = () => {
    control.queues.clear();
    control.events.clear();
    control.workers.length = 0;
    control.queueCtorArgs.length = 0;
    control.drainCalls.length = 0;
    control.redisInstances.length = 0;
    control.beforeAdd = null;
    control.forceWaitTimeout = false;
    control.holdProcessing = false;
    control.readyFailures = 0;
    control.pingBehavior = 'ok';
  };

  return {
    control,
    bullmqModule: { Queue: FakeQueue, QueueEvents: FakeQueueEvents, Worker: FakeWorker },
    ioredisModule: { default: FakeIORedis },
  };
}
