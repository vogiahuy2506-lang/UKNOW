import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createFakeBullmq } from './fakeBullmq.helper.js';

const fake = createFakeBullmq();
const { control } = fake;
jest.unstable_mockModule('bullmq', () => fake.bullmqModule);
jest.unstable_mockModule('ioredis', () => fake.ioredisModule);

const {
  OutboundMessageQueueService,
  OUTBOUND_MESSAGE_JOB_TYPES: T,
  OUTBOUND_JOB_WAIT,
  OUTBOUND_QUEUE_LANES,
  computeMinimumWaitMs,
  buildJobIdFromKey,
} = await import('../outboundMessageQueue.service.js');
const { ZALO_TIMEOUT_RETRY_TOTAL_DELAY_MS, isNetworkTimeoutError } = await import('../../../utils/zaloTimeoutRetry.util.js');
const { classifyZaloSendError } = await import('../../../utils/zaloSendErrorClassifier.util.js');

const ENV_KEYS = [
  'BULLMQ_ENABLED', 'BULLMQ_REDIS_URL', 'BULLMQ_ADD_TIMEOUT_MS', 'BULLMQ_WAIT_GRACE_MS', 'BULLMQ_START_RETRY_MS',
  'BULLMQ_DRAIN_ON_START', 'BULLMQ_MAX_PAYLOAD_BYTES', 'BULLMQ_EMAIL_CONCURRENCY', 'BULLMQ_ZALO_CONCURRENCY',
  'BULLMQ_DATA_CONCURRENCY', 'BULLMQ_WORKER_CONCURRENCY', 'BULLMQ_WAIT_RESULT_TIMEOUT_MS', 'BULLMQ_HEALTH_FAIL_THRESHOLD',
  'BULLMQ_EMAIL_RATE_LIMIT_MAX', 'BULLMQ_RATE_LIMIT_MAX',
];
const savedEnv = {};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const KEY = 'campaign:366:node_1:email:abcd1234:1';

let service;

function makeService(handlers = {}) {
  const svc = new OutboundMessageQueueService();
  for (const [type, handler] of Object.entries(handlers)) svc.registerProcessor(type, handler);
  return svc;
}

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.BULLMQ_ENABLED = 'true';
  process.env.BULLMQ_REDIS_URL = 'redis://fake:6379';
  control.reset();
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  if (service) await service.close();
  service = null;
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  jest.restoreAllMocks();
});

describe('thời gian chờ kết quả job (việc b)', () => {
  it('email: lớn hơn throttle 60 s sau markSendQuotaSending cộng I/O SMTP', () => {
    service = makeService();
    const budget = service.resolveWaitBudgetMs(T.EMAIL_SEND);
    expect(budget).toBeGreaterThan(OUTBOUND_JOB_WAIT.EMAIL_THROTTLE_MAX_MS);
    expect(budget).toBeGreaterThanOrEqual(
      OUTBOUND_JOB_WAIT.EMAIL_THROTTLE_MAX_MS + OUTBOUND_JOB_WAIT.EMAIL_PROVIDER_IO_MAX_MS
    );
  });

  it('zalo: lớn hơn tổng chờ retry 10+20+40 s', () => {
    service = makeService();
    expect(ZALO_TIMEOUT_RETRY_TOTAL_DELAY_MS).toBe(70_000);
    for (const type of [T.ZALO_PERSONAL_SEND, T.ZALO_GROUP_SEND, T.ZALO_FRIEND_REQUEST_SEND]) {
      expect(service.resolveWaitBudgetMs(type)).toBeGreaterThan(ZALO_TIMEOUT_RETRY_TOTAL_DELAY_MS);
    }
  });

  it('giá trị ghi đè chỉ được NÂNG, không hạ xuống dưới mức tối thiểu', () => {
    service = makeService();
    expect(service.resolveWaitBudgetMs(T.EMAIL_SEND, 1000)).toBe(computeMinimumWaitMs(OUTBOUND_QUEUE_LANES.EMAIL));
    process.env.BULLMQ_WAIT_RESULT_TIMEOUT_MS = '60000'; // giá trị mặc định cũ
    expect(service.resolveWaitBudgetMs(T.EMAIL_SEND)).toBe(computeMinimumWaitMs(OUTBOUND_QUEUE_LANES.EMAIL));
    expect(service.resolveWaitBudgetMs(T.GOOGLE_SHEET_FETCH, 600_000)).toBe(600_000);
  });

  it('hết giờ chờ nhưng job đã hoàn tất: trả kết quả thật, không coi là thất bại', async () => {
    control.forceWaitTimeout = true;
    process.env.BULLMQ_WAIT_GRACE_MS = '400';
    const handler = jest.fn(async () => {
      await wait(60);
      return { status: 'success', messageId: 'm-1' };
    });
    service = makeService({ [T.EMAIL_SEND]: handler });
    const result = await service.enqueueAndWait({ type: T.EMAIL_SEND, payload: { a: 1 }, jobKey: KEY });
    expect(result).toEqual({ status: 'success', messageId: 'm-1' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('hết giờ chờ, job đã lỗi (stalled): ném lỗi thật của job', async () => {
    control.forceWaitTimeout = true;
    control.holdProcessing = true;
    process.env.BULLMQ_WAIT_GRACE_MS = '400';
    service = makeService({ [T.EMAIL_SEND]: jest.fn() });
    const promise = service.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: KEY });
    await wait(30);
    const job = control.queues.get('outbound-email').jobs.values().next().value;
    job.state = 'failed';
    job.failedReason = 'job stalled more than allowable limit';
    await expect(promise).rejects.toMatchObject({ code: 'OUTBOUND_JOB_FAILED', message: 'job stalled more than allowable limit' });
  });

  it('hết giờ chờ, job vẫn đang chạy quá hạn: báo "chưa biết kết quả", không retryable và không bị coi là timeout mạng', async () => {
    control.forceWaitTimeout = true;
    process.env.BULLMQ_WAIT_GRACE_MS = '120';
    service = makeService({ [T.EMAIL_SEND]: () => new Promise(() => {}) });
    const error = await service.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: KEY }).catch((e) => e);
    expect(error.code).toBe('OUTBOUND_JOB_RESULT_UNKNOWN');
    expect(error.retryable).toBe(false);
    // executeWithTimeoutRetry ở campaignRun sẽ gửi lại nếu lỗi bị nhận nhầm là timeout mạng.
    expect(isNetworkTimeoutError(error)).toBe(false);
  });
});

describe('jobId ổn định chống gửi trùng (việc a)', () => {
  it('buildJobIdFromKey: bỏ dấu ":" (BullMQ cấm) và null khi rỗng', () => {
    expect(buildJobIdFromKey(KEY)).toBe('job_campaign_366_node_1_email_abcd1234_1');
    expect(buildJobIdFromKey(KEY)).not.toContain(':');
    expect(buildJobIdFromKey('')).toBeNull();
    expect(buildJobIdFromKey(null)).toBeNull();
  });

  it('thêm lại cùng khoá khi job còn đang chờ: chỉ một lần xử lý, hai bên nhận cùng kết quả', async () => {
    control.holdProcessing = true;
    const handler = jest.fn(async () => ({ status: 'success', n: Math.random() }));
    service = makeService({ [T.EMAIL_SEND]: handler });
    const first = service.enqueueAndWait({ type: T.EMAIL_SEND, payload: { a: 1 }, jobKey: KEY });
    await wait(30);
    const second = service.enqueueAndWait({ type: T.EMAIL_SEND, payload: { a: 1 }, jobKey: KEY });
    await wait(30);
    expect(control.queues.get('outbound-email').jobs.size).toBe(1);
    control.release();
    const [r1, r2] = await Promise.all([first, second]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(r2).toEqual(r1);
  });

  it('job cùng khoá đã KẾT THÚC thì lần gửi lại hợp lệ phải chạy thật, không nhận kết quả cũ', async () => {
    const handler = jest.fn(async () => ({ status: 'failed', errorType: 'smtp_rate_limited_retry_scheduled' }));
    service = makeService({ [T.EMAIL_SEND]: handler });
    await service.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: KEY });
    await service.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: KEY });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('job không có khoá vẫn có jobId riêng (không bao giờ tạo jobId chứa ":")', async () => {
    control.holdProcessing = true;
    service = makeService({ [T.CUSTOMER_SAVE]: jest.fn(async () => ({ saved: 1 })) });
    void service.enqueueAndWait({ type: T.CUSTOMER_SAVE, payload: { customers: [] } }).catch(() => {});
    await wait(30);
    const ids = [...control.queues.get('outbound-data').jobs.keys()];
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^job_customer\.save_/);
    expect(ids[0]).not.toContain(':');
  });
});

describe('add timeout + chạy thẳng khi Redis hỏng (việc c)', () => {
  it('queue.add treo: hết 5 s (ở đây 50 ms) thì chạy thẳng đúng một lần, job ma xuất hiện muộn bị worker bỏ qua', async () => {
    process.env.BULLMQ_ADD_TIMEOUT_MS = '50';
    control.beforeAdd = () => wait(200);
    const handler = jest.fn(async () => ({ status: 'success' }));
    service = makeService({ [T.EMAIL_SEND]: handler });
    const result = await service.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: KEY });
    expect(result).toEqual({ status: 'success' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(service.degraded).toBe(true);
    await wait(350); // add muộn hoàn tất, worker nhận job ma
    expect(handler).toHaveBeenCalledTimes(1);
    const ghost = control.queues.get('outbound-email').jobs.values().next().value;
    expect(ghost.state).toBe('completed');
    expect(ghost.returnvalue.code).toBe('JOB_ABANDONED');
  });

  it('queue.add lỗi thẳng (Redis từ chối): chạy thẳng, không ném lỗi hạ tầng ra caller', async () => {
    control.beforeAdd = async () => { throw new Error('OOM command not allowed when used memory > maxmemory'); };
    const handler = jest.fn(async () => ({ status: 'success' }));
    service = makeService({ [T.EMAIL_SEND]: handler });
    await expect(service.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: KEY })).resolves.toEqual({ status: 'success' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('health check lỗi 2 lần liên tiếp → chạy thẳng; Redis sống lại → tự quay về hàng đợi', async () => {
    const handler = jest.fn(async () => ({ status: 'success' }));
    service = makeService({ [T.EMAIL_SEND]: handler });
    await service.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: KEY });
    expect(control.queues.get('outbound-email').jobs.size).toBe(1);

    control.pingBehavior = 'fail';
    await service.runHealthCheck();
    expect(service.degraded).toBe(false); // mới lỗi một lần
    await service.runHealthCheck();
    expect(service.degraded).toBe(true);

    await service.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: 'campaign:366:node_1:email:other:1' });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(control.queues.get('outbound-email').jobs.size).toBe(1); // lượt này KHÔNG đi qua Redis

    control.pingBehavior = 'ok';
    await service.runHealthCheck();
    expect(service.degraded).toBe(false);
    await service.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: 'campaign:366:node_1:email:third:1' });
    expect(control.queues.get('outbound-email').jobs.size).toBe(2);
  });

  it('PING treo cũng tính là lỗi (không đợi mãi)', async () => {
    process.env.BULLMQ_HEALTH_FAIL_THRESHOLD = '1';
    service = makeService({ [T.EMAIL_SEND]: jest.fn(async () => ({})) });
    await service.startWorker();
    control.pingBehavior = 'hang';
    process.env.BULLMQ_HEALTH_CHECK_TIMEOUT_MS = '40';
    await service.runHealthCheck();
    expect(service.degraded).toBe(true);
    delete process.env.BULLMQ_HEALTH_CHECK_TIMEOUT_MS;
  });

  it('Redis chết khi đang chờ kết quả: caller được báo ngay, không treo tới hết thời gian chờ', async () => {
    control.holdProcessing = true;
    service = makeService({ [T.EMAIL_SEND]: jest.fn(async () => ({})) });
    const promise = service.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: KEY });
    await wait(30);
    service.markDegraded('test');
    await expect(promise).rejects.toMatchObject({ code: 'OUTBOUND_JOB_RESULT_UNKNOWN', retryable: false });
  });

  it('khởi động thất bại: chạy thẳng và thử lại sau khoảng chờ (không tắt hàng đợi vĩnh viễn)', async () => {
    process.env.BULLMQ_START_RETRY_MS = '40';
    control.readyFailures = 1;
    const handler = jest.fn(async () => ({ ok: true }));
    service = makeService({ [T.EMAIL_SEND]: handler });
    await service.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: KEY });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(service.workerStarted).toBe(false);
    const queuesAfterFailure = control.queueCtorArgs.length;

    await service.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: 'campaign:366:node_1:email:b:1' });
    expect(control.queueCtorArgs.length).toBe(queuesAfterFailure); // còn trong khoảng chờ: không dựng lại hạ tầng

    await wait(60);
    await service.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: 'campaign:366:node_1:email:c:1' });
    expect(service.workerStarted).toBe(true);
    expect(control.queues.get('outbound-email').jobs.size).toBe(1);
  });

  it('payload dữ liệu quá lớn chạy thẳng thay vì nhét vào Redis', async () => {
    process.env.BULLMQ_MAX_PAYLOAD_BYTES = '100';
    const handler = jest.fn(async () => ({ saved: 3 }));
    service = makeService({ [T.CUSTOMER_SAVE]: handler });
    await service.enqueueAndWait({ type: T.CUSTOMER_SAVE, payload: { customers: ['x'.repeat(500)] } });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(control.queues.get('outbound-data').jobs.size).toBe(0);
  });

  it('BULLMQ_ENABLED=false: chạy thẳng, không dựng kết nối Redis', async () => {
    process.env.BULLMQ_ENABLED = 'false';
    const handler = jest.fn(async () => ({ status: 'success' }));
    service = makeService({ [T.EMAIL_SEND]: handler });
    await service.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: KEY });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(control.redisInstances).toHaveLength(0);
  });
});

describe('lỗi chuẩn hoá qua hàng đợi (việc d)', () => {
  it('bên gọi nhận Error giữ nguyên code / zaloRetry / stage / responseCode / resetAt như đường chạy thẳng', async () => {
    const resetAt = new Date('2026-10-11T17:00:00.000Z');
    const handler = jest.fn(async () => {
      const error = new Error('Connect Timeout Error');
      error.code = 'UND_ERR_CONNECT_TIMEOUT';
      error.zaloRetry = { operationName: 'send_message', attempt: 4, maxAttempts: 4, baseDelayMs: 10000 };
      error.stage = 'send';
      error.responseCode = 450;
      error.resetAt = resetAt;
      throw error;
    });
    service = makeService({ [T.ZALO_PERSONAL_SEND]: handler });
    const error = await service.enqueueAndWait({
      type: T.ZALO_PERSONAL_SEND,
      payload: {},
      jobOptions: { attempts: 1 },
      jobKey: 'campaign:1:n:zalo:abc:1',
    }).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Connect Timeout Error');
    expect(error.code).toBe('UND_ERR_CONNECT_TIMEOUT');
    expect(error.zaloRetry).toMatchObject({ attempt: 4, maxAttempts: 4 });
    expect(error.stage).toBe('send');
    expect(error.responseCode).toBe(450);
    expect(error.resetAt).toBeInstanceOf(Date);
    expect(error.resetAt.toISOString()).toBe(resetAt.toISOString());
    // Bộ phân loại lỗi đọc đúng số lần thử lại (trước đây mất vì failedReason chỉ còn message).
    expect(classifyZaloSendError(error).label).toContain('4 lần');
  });

  it('lỗi chưa phải lần thử cuối vẫn ném để BullMQ retry (job dữ liệu)', async () => {
    let calls = 0;
    const handler = jest.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error('db tạm thời lỗi');
      return { saved: 7 };
    });
    service = makeService({ [T.CUSTOMER_SAVE]: handler });
    await expect(service.enqueueAndWait({ type: T.CUSTOMER_SAVE, payload: { customers: [] } })).resolves.toEqual({ saved: 7 });
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('lỗi ở lần thử cuối của job dữ liệu cũng được chuẩn hoá và ném lại', async () => {
    const handler = jest.fn(async () => {
      const error = new Error('hết kiên nhẫn');
      error.code = 'EDATA';
      throw error;
    });
    service = makeService({ [T.CUSTOMER_SAVE]: handler });
    await expect(service.enqueueAndWait({ type: T.CUSTOMER_SAVE, payload: { customers: [] } }))
      .rejects.toMatchObject({ code: 'EDATA', message: 'hết kiên nhẫn' });
    expect(handler).toHaveBeenCalledTimes(4);
  });
});

describe('tách hàng đợi theo loại job (việc e)', () => {
  it('email / zalo / data đi vào ba hàng đợi riêng', async () => {
    const ok = async () => ({ ok: 1 });
    service = makeService({
      [T.EMAIL_SEND]: ok, [T.ZALO_PERSONAL_SEND]: ok, [T.ZALO_GROUP_SEND]: ok,
      [T.ZALO_FRIEND_REQUEST_SEND]: ok, [T.CUSTOMER_SAVE]: ok, [T.GOOGLE_SHEET_FETCH]: ok,
    });
    for (const type of Object.values(T)) {
      await service.enqueueAndWait({ type, payload: {}, jobKey: `campaign:1:n:${type.replace(/\./g, '_')}:r:1` });
    }
    const namesOf = (queue) => [...control.queues.get(queue).jobs.values()].map((job) => job.name).sort();
    expect(namesOf('outbound-email')).toEqual([T.EMAIL_SEND]);
    expect(namesOf('outbound-zalo')).toEqual([T.ZALO_FRIEND_REQUEST_SEND, T.ZALO_GROUP_SEND, T.ZALO_PERSONAL_SEND].sort());
    expect(namesOf('outbound-data')).toEqual([T.CUSTOMER_SAVE, T.GOOGLE_SHEET_FETCH].sort());
  });

  it('mỗi worker có concurrency + limiter riêng, maxStalledCount=0', async () => {
    process.env.BULLMQ_EMAIL_CONCURRENCY = '3';
    process.env.BULLMQ_ZALO_CONCURRENCY = '5';
    process.env.BULLMQ_DATA_CONCURRENCY = '1';
    process.env.BULLMQ_EMAIL_RATE_LIMIT_MAX = '9';
    service = makeService();
    await service.startWorker();
    const opts = Object.fromEntries(control.workers.map((w) => [w.name, w.opts]));
    expect(opts['outbound-email']).toMatchObject({ concurrency: 3, limiter: { max: 9, duration: 1000 }, maxStalledCount: 0 });
    expect(opts['outbound-zalo']).toMatchObject({ concurrency: 5, limiter: { max: 20, duration: 1000 }, maxStalledCount: 0 });
    expect(opts['outbound-data'].concurrency).toBe(1);
    expect(opts['outbound-data'].limiter).toBeUndefined();
  });

  it('biến cũ BULLMQ_WORKER_CONCURRENCY làm mặc định cho email/zalo, không áp cho data', async () => {
    process.env.BULLMQ_WORKER_CONCURRENCY = '6';
    service = makeService();
    await service.startWorker();
    const opts = Object.fromEntries(control.workers.map((w) => [w.name, w.opts]));
    expect(opts['outbound-email'].concurrency).toBe(6);
    expect(opts['outbound-zalo'].concurrency).toBe(6);
    expect(opts['outbound-data'].concurrency).toBe(2);
  });

  it('gọi startWorker đồng thời chỉ dựng ba worker (không nhân đôi)', async () => {
    service = makeService();
    const results = await Promise.all([service.startWorker(), service.startWorker(), service.startWorker()]);
    expect(results).toEqual([true, true, true]);
    expect(control.workers).toHaveLength(3);
  });

  it('khởi động dọn job tồn của tiến trình trước (không ai đợi, chạy lại là gửi trùng)', async () => {
    service = makeService();
    await service.startWorker();
    expect(control.drainCalls.map((c) => c.name).sort()).toEqual(['outbound-data', 'outbound-email', 'outbound-zalo']);
    expect(control.drainCalls.every((c) => c.delayed === true)).toBe(true);
  });

  it('BULLMQ_DRAIN_ON_START=false thì không dọn', async () => {
    process.env.BULLMQ_DRAIN_ON_START = 'false';
    service = makeService();
    await service.startWorker();
    expect(control.drainCalls).toHaveLength(0);
  });

  it('getQueueMetrics cộng dồn và có chi tiết từng hàng đợi', async () => {
    control.holdProcessing = true;
    service = makeService({ [T.EMAIL_SEND]: jest.fn(), [T.CUSTOMER_SAVE]: jest.fn() });
    void service.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: KEY }).catch(() => {});
    void service.enqueueAndWait({ type: T.CUSTOMER_SAVE, payload: {} }).catch(() => {});
    await wait(40);
    const metrics = await service.getQueueMetrics();
    expect(metrics.waiting).toBe(2);
    expect(metrics.byQueue.email.waiting).toBe(1);
    expect(metrics.byQueue.data.waiting).toBe(1);
    expect(metrics.byQueue.zalo.waiting).toBe(0);
  });

  it('đã xoá enqueue() không ai gọi (việc f)', () => {
    service = makeService();
    expect(service.enqueue).toBeUndefined();
  });
});
