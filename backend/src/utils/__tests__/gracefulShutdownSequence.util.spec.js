import { describe, it, expect, jest } from '@jest/globals';
import { runGracefulShutdownSequence } from '../gracefulShutdownSequence.util.js';

// PLAN_AN_TOAN_KHI_DEPLOY_2026-09-28, PR-A, test (e) — unit gracefulShutdown: thứ tự gọi đúng
// (beginShutdown trước, pool.end cuối), waitForInFlight chờ lượt đang bay. Mọi phụ thuộc là mock —
// KHÔNG DB/BullMQ/cron thật (đó là lý do trình tự được tách khỏi index.js, xem chú thích ở file kia).

function buildDeps(callOrder) {
  return {
    gate: {
      beginShutdown: jest.fn(() => callOrder.push('beginShutdown')),
      waitForInFlight: jest.fn(async () => {
        callOrder.push('waitForInFlight');
        return { drained: true, remaining: 0 };
      }),
    },
    stopCron: jest.fn(() => callOrder.push('stopCron')),
    closeOutboundQueue: jest.fn(async () => { callOrder.push('closeOutboundQueue'); }),
    closeKbQueue: jest.fn(async () => { callOrder.push('closeKbQueue'); }),
    closeDbPool: jest.fn(async () => { callOrder.push('closeDbPool'); }),
  };
}

describe('runGracefulShutdownSequence — thứ tự gọi', () => {
  it('beginShutdown TRƯỚC TIÊN, pool.end() SAU CÙNG, đúng thứ tự đủ 6 bước', async () => {
    const callOrder = [];
    const deps = buildDeps(callOrder);

    await runGracefulShutdownSequence(deps);

    expect(callOrder).toEqual([
      'beginShutdown',
      'waitForInFlight',
      'stopCron',
      'closeOutboundQueue',
      'closeKbQueue',
      'closeDbPool',
    ]);
    expect(callOrder[0]).toBe('beginShutdown');
    expect(callOrder.at(-1)).toBe('closeDbPool');
    expect(deps.gate.beginShutdown).toHaveBeenCalledTimes(1);
    expect(deps.closeDbPool).toHaveBeenCalledTimes(1);
  });

  it('waitForInFlight(timeoutMs) nhận đúng waitForInFlightMs truyền vào', async () => {
    const callOrder = [];
    const deps = buildDeps(callOrder);

    await runGracefulShutdownSequence({ ...deps, waitForInFlightMs: 12345 });

    expect(deps.gate.waitForInFlight).toHaveBeenCalledWith(12345);
  });

  it('waitForInFlight chờ lượt đang bay (promise treo ~300ms) rồi MỚI chạy stopCron/đóng BullMQ/DB', async () => {
    const callOrder = [];
    const deps = buildDeps(callOrder);
    deps.gate.waitForInFlight = jest.fn(
      () => new Promise((resolve) => {
        setTimeout(() => {
          callOrder.push('waitForInFlight');
          resolve({ drained: true, remaining: 0 });
        }, 300);
      })
    );

    const startedAt = Date.now();
    await runGracefulShutdownSequence(deps);
    const elapsedMs = Date.now() - startedAt;

    expect(elapsedMs).toBeGreaterThanOrEqual(280);
    expect(callOrder).toEqual([
      'beginShutdown',
      'waitForInFlight',
      'stopCron',
      'closeOutboundQueue',
      'closeKbQueue',
      'closeDbPool',
    ]);
  }, 10000);

  it('stopCron ném lỗi → vẫn tiếp tục đóng BullMQ/DB (không để 1 bước lỗi chặn các bước sau)', async () => {
    const callOrder = [];
    const deps = buildDeps(callOrder);
    deps.stopCron = jest.fn(() => {
      callOrder.push('stopCron_error');
      throw new Error('cron stop failed');
    });

    await runGracefulShutdownSequence(deps);

    expect(callOrder).toEqual([
      'beginShutdown',
      'waitForInFlight',
      'stopCron_error',
      'closeOutboundQueue',
      'closeKbQueue',
      'closeDbPool',
    ]);
  });

  it('trả về đúng kết quả của waitForInFlight (drained/remaining)', async () => {
    const callOrder = [];
    const deps = buildDeps(callOrder);
    deps.gate.waitForInFlight = jest.fn().mockResolvedValue({ drained: false, remaining: 3 });

    const result = await runGracefulShutdownSequence(deps);

    expect(result).toEqual({ drained: false, remaining: 3 });
  });
});
