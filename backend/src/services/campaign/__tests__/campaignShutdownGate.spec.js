import { afterEach, describe, expect, it, jest } from '@jest/globals';
import campaignShutdownGate, {
  beginShutdown,
  isShuttingDown,
  trackInFlight,
  waitForInFlight,
  __resetForTest,
} from '../campaignShutdownGate.js';

// PLAN_AN_TOAN_KHI_DEPLOY_2026-09-28, PR-A — unit thuần cho module gate (không DB/BullMQ).

afterEach(() => {
  __resetForTest();
});

describe('campaignShutdownGate — beginShutdown/isShuttingDown', () => {
  it('mặc định isShuttingDown() = false', () => {
    expect(isShuttingDown()).toBe(false);
  });

  it('beginShutdown() đặt cờ true, idempotent (gọi nhiều lần vẫn true, không lỗi)', () => {
    beginShutdown();
    expect(isShuttingDown()).toBe(true);
    beginShutdown();
    expect(isShuttingDown()).toBe(true);
  });
});

describe('campaignShutdownGate — trackInFlight (đếm lượt gọi nhà cung cấp đang bay)', () => {
  it('tăng đếm trước khi gọi asyncFn, giảm trong finally khi asyncFn thành công', async () => {
    let observedDuringCall = null;
    const asyncFn = jest.fn(async () => {
      observedDuringCall = (await waitForInFlight(0)).remaining;
      return 'ok';
    });
    const result = await trackInFlight(asyncFn);
    expect(result).toBe('ok');
    expect(observedDuringCall).toBe(1);
    expect((await waitForInFlight(0)).remaining).toBe(0);
  });

  it('giảm đếm trong finally NGAY CẢ KHI asyncFn ném lỗi — không rò rỉ đếm', async () => {
    const asyncFn = jest.fn(async () => {
      throw new Error('boom');
    });
    await expect(trackInFlight(asyncFn)).rejects.toThrow('boom');
    expect((await waitForInFlight(0)).remaining).toBe(0);
  });

  it('nhiều lượt song song — đếm cộng dồn đúng, giảm đúng khi từng lượt xong', async () => {
    let resolveFirst;
    const first = trackInFlight(() => new Promise((resolve) => { resolveFirst = resolve; }));
    const second = trackInFlight(() => Promise.resolve('second'));
    await second;
    // second đã xong (giảm đếm), first vẫn đang bay.
    expect((await waitForInFlight(0)).remaining).toBe(1);
    resolveFirst('first');
    await first;
    expect((await waitForInFlight(0)).remaining).toBe(0);
  });
});

describe('campaignShutdownGate — waitForInFlight(timeoutMs)', () => {
  it('không có lượt nào đang bay → drained=true ngay lập tức', async () => {
    const result = await waitForInFlight(1000);
    expect(result).toEqual({ drained: true, remaining: 0 });
  });

  it('có lượt đang bay, xong TRƯỚC timeout → chờ tới khi xong rồi drained=true', async () => {
    const inFlightPromise = trackInFlight(
      () => new Promise((resolve) => setTimeout(() => resolve('done'), 150))
    );
    const result = await waitForInFlight(5000);
    expect(result).toEqual({ drained: true, remaining: 0 });
    await inFlightPromise;
  });

  it('lượt đang bay TREO LÂU HƠN timeout → hết giờ, drained=false, remaining>0', async () => {
    let releaseHang;
    const hangingPromise = trackInFlight(() => new Promise((resolve) => { releaseHang = resolve; }));
    const result = await waitForInFlight(200);
    expect(result.drained).toBe(false);
    expect(result.remaining).toBe(1);
    releaseHang('released');
    await hangingPromise;
  });
});

describe('campaignShutdownGate — __resetForTest', () => {
  it('throw nếu NODE_ENV khác test', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => __resetForTest()).toThrow();
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('reset cả cờ shuttingDown lẫn bộ đếm inFlight', async () => {
    beginShutdown();
    const hangingPromise = trackInFlight(() => new Promise(() => {})).catch(() => {});
    expect(isShuttingDown()).toBe(true);
    __resetForTest();
    expect(isShuttingDown()).toBe(false);
    expect((await waitForInFlight(0)).remaining).toBe(0);
    void hangingPromise;
  });
});

describe('campaignShutdownGate — default export mirrors named exports', () => {
  it('default export có đủ 5 hàm', () => {
    expect(typeof campaignShutdownGate.beginShutdown).toBe('function');
    expect(typeof campaignShutdownGate.isShuttingDown).toBe('function');
    expect(typeof campaignShutdownGate.trackInFlight).toBe('function');
    expect(typeof campaignShutdownGate.waitForInFlight).toBe('function');
    expect(typeof campaignShutdownGate.__resetForTest).toBe('function');
  });
});
