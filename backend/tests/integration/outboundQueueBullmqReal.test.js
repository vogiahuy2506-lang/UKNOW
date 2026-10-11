/**
 * PLAN_RA_SOAT_DOT3 PR-Q2 — hàng đợi gửi chạy BullMQ + Redis THẬT (không mock bullmq/ioredis).
 *
 * Khác các test integration còn lại (ép BULLMQ_ENABLED=false), file này bật BullMQ để kiểm những điều mô phỏng
 * không chứng minh được: jobId ổn định chống trùng trên Redis thật, lỗi giữ thuộc tính qua JSON/Redis,
 * ba hàng đợi tách riêng, Redis chết lúc khởi động thì chạy thẳng.
 *
 * Cần Redis ở `BULLMQ_TEST_REDIS_URL` (mặc định redis://127.0.0.1:6379). KHÔNG có Redis → cả file bị bỏ qua
 * (CI không dựng Redis cho nhóm integration). Dùng prefix riêng nên không đụng khoá BullMQ khác trong cùng Redis.
 */
import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';

const REDIS_URL = process.env.BULLMQ_TEST_REDIS_URL || 'redis://127.0.0.1:6379';
const PREFIX = `test-q2-${randomUUID().slice(0, 8)}`;

async function redisReachable() {
  const probe = new IORedis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null, connectTimeout: 1500 });
  probe.on('error', () => {});
  try {
    await probe.connect();
    return (await probe.ping()) === 'PONG';
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

const hasRedis = await redisReachable();
const maybeDescribe = hasRedis ? describe : describe.skip;
if (!hasRedis) {
  // eslint-disable-next-line no-console
  console.warn(`[outboundQueueBullmqReal] Không có Redis ở ${REDIS_URL} — bỏ qua`);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

maybeDescribe('outbound queue — BullMQ thật', () => {
  let OutboundMessageQueueService;
  let T;
  let service;
  const envBackup = {};

  beforeAll(async () => {
    for (const key of ['BULLMQ_ENABLED', 'BULLMQ_REDIS_URL', 'BULLMQ_QUEUE_PREFIX', 'BULLMQ_START_TIMEOUT_MS']) envBackup[key] = process.env[key];
    process.env.BULLMQ_ENABLED = 'true';
    process.env.BULLMQ_REDIS_URL = REDIS_URL;
    process.env.BULLMQ_QUEUE_PREFIX = PREFIX;
    ({ OutboundMessageQueueService, OUTBOUND_MESSAGE_JOB_TYPES: T } = await import('../../src/services/queue/outboundMessageQueue.service.js'));
    service = new OutboundMessageQueueService();
  });

  afterAll(async () => {
    if (service) await service.close();
    // Dọn mọi khoá của prefix thử nghiệm.
    const cleaner = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    try {
      for (const name of ['outbound-email', 'outbound-zalo', 'outbound-data']) {
        const q = new Queue(name, { connection: cleaner, prefix: PREFIX });
        await q.obliterate({ force: true }).catch(() => {});
        await q.close();
      }
    } finally {
      cleaner.disconnect();
    }
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('gửi email qua Redis thật: kết quả về đúng, job nằm ở hàng đợi outbound-email', async () => {
    const calls = [];
    service.registerProcessor(T.EMAIL_SEND, async (payload) => {
      calls.push(payload);
      return { status: 'success', to: payload.customer.email };
    });

    const result = await service.enqueueAndWait({
      type: T.EMAIL_SEND,
      payload: { customer: { email: 'a@example.com' }, campaign: { id: 1 } },
      jobKey: `campaign:${Date.now()}:node_a:email:hash1:1`,
      jobOptions: { attempts: 1 },
    });

    expect(result).toEqual({ status: 'success', to: 'a@example.com' });
    expect(service.workerStarted).toBe(true);
    expect(calls).toHaveLength(1);
    const email = new Queue('outbound-email', { connection: service.connection, prefix: PREFIX });
    const zalo = new Queue('outbound-zalo', { connection: service.connection, prefix: PREFIX });
    expect((await email.getJobCounts('completed')).completed).toBeGreaterThanOrEqual(1);
    expect((await zalo.getJobCounts('completed')).completed).toBe(0);
    await email.close();
    await zalo.close();
  });

  it('cùng khoá gọi đồng thời hai lần: handler chỉ chạy một lần, hai bên nhận cùng kết quả', async () => {
    let runs = 0;
    service.registerProcessor(T.EMAIL_SEND, async () => {
      runs += 1;
      await wait(300);
      return { status: 'success', runs };
    });
    const key = `campaign:${Date.now()}:node_dup:email:hashdup:1`;
    const [r1, r2] = await Promise.all([
      service.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: key, jobOptions: { attempts: 1 } }),
      wait(100).then(() => service.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: key, jobOptions: { attempts: 1 } })),
    ]);
    expect(runs).toBe(1);
    expect(r2).toEqual(r1);
  });

  it('lỗi Zalo qua Redis thật giữ nguyên code / zaloRetry / stage / resetAt', async () => {
    service.registerProcessor(T.ZALO_PERSONAL_SEND, async () => {
      const error = new Error('Connect Timeout Error');
      error.code = 'UND_ERR_CONNECT_TIMEOUT';
      error.zaloRetry = { operationName: 'send_message', attempt: 4, maxAttempts: 4 };
      error.stage = 'send';
      error.resetAt = new Date('2026-10-12T17:00:00.000Z');
      throw error;
    });
    const error = await service.enqueueAndWait({
      type: T.ZALO_PERSONAL_SEND,
      payload: {},
      jobKey: `campaign:${Date.now()}:node_z:zalo:hashz:1`,
      jobOptions: { attempts: 1 },
    }).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('UND_ERR_CONNECT_TIMEOUT');
    expect(error.zaloRetry).toMatchObject({ attempt: 4, maxAttempts: 4 });
    expect(error.stage).toBe('send');
    expect(error.resetAt).toBeInstanceOf(Date);
  });

  it('job dữ liệu lỗi thoáng qua được BullMQ retry thật (backoff) rồi thành công', async () => {
    let calls = 0;
    service.registerProcessor(T.CUSTOMER_SAVE, async () => {
      calls += 1;
      if (calls < 2) throw new Error('db tạm lỗi');
      return { saved: 2 };
    });
    const result = await service.enqueueAndWait({
      type: T.CUSTOMER_SAVE,
      payload: { customers: [] },
      jobOptions: { attempts: 3, backoff: { type: 'fixed', delay: 100 } },
    });
    expect(result).toEqual({ saved: 2 });
    expect(calls).toBe(2);
  });

  it('thống kê hàng đợi đọc được từ Redis thật, có chi tiết ba hàng đợi', async () => {
    const metrics = await service.getQueueMetrics();
    expect(Object.keys(metrics.byQueue).sort()).toEqual(['data', 'email', 'zalo']);
    expect(metrics.completed).toBeGreaterThanOrEqual(3);
  });

  it('Redis không với tới lúc khởi động: chạy thẳng trong tiến trình, không treo', async () => {
    const savedUrl = process.env.BULLMQ_REDIS_URL;
    process.env.BULLMQ_REDIS_URL = 'redis://127.0.0.1:1';
    process.env.BULLMQ_START_TIMEOUT_MS = '1500';
    const dead = new OutboundMessageQueueService();
    dead.registerProcessor(T.EMAIL_SEND, async () => ({ status: 'success', inline: true }));
    const startedAt = Date.now();
    try {
      const result = await dead.enqueueAndWait({ type: T.EMAIL_SEND, payload: {}, jobKey: 'campaign:1:n:email:h:1' });
      expect(result).toEqual({ status: 'success', inline: true });
      expect(Date.now() - startedAt).toBeLessThan(8000);
      expect(dead.workerStarted).toBe(false);
    } finally {
      await dead.close();
      process.env.BULLMQ_REDIS_URL = savedUrl;
      delete process.env.BULLMQ_START_TIMEOUT_MS;
    }
  }, 15_000);
});

// jest được import để cùng khuôn với các test integration khác (jest-timeout.js đặt timeout 20s).
void jest;
