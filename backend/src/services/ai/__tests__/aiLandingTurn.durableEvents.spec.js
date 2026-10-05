import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';

/**
 * PR-10 mục 3(c) (B-8): sổ bền của LƯỢT landing — những gì tầng gọi Gemini và dòng `done` của aiLandingPage KHÔNG thấy được:
 *  - khách đóng kết nối (kể cả SAU khi AI đã chạy xong → ta trả tiền Google mà không trừ credit khách) → `client_closed` + cờ `workDone`;
 *  - bấm lại cùng requestId bám vào lượt đang chạy / đã xong → dedup (state attached / cached).
 * Lượt thành công / lỗi thường KHÔNG ghi thêm sự kiện lượt (đã có ở `done` của dịch vụ landing — ghi hai lần là đếm đôi).
 * Chạy trên máy chủ HTTP THẬT (cổng ngẫu nhiên); ranh giới giả lập: `recordAiCallEvent`.
 */
const recordAiCallEvent = jest.fn(() => Promise.resolve(true));
jest.unstable_mockModule('../aiCallEvents.service.js', () => ({
  recordAiCallEvent,
  AI_CALL_LAYER: { GEMINI: 'gemini', APP: 'app' },
  AI_CALL_OUTCOME: { OK: 'ok', CLIENT_CLOSED: 'client_closed' },
}));

const { runLandingAiTurn, attachToExistingLandingTurn, resetLandingTurnsForTest } = await import('../aiLandingTurn.service.js');
const { createClientAbortError } = await import('../../../utils/aiAbort.util.js');
const { NDJSON, until, deferred, openNdjsonClient } = await import('./helpers/ndjsonTestClient.js');

const REQUEST_ID = 'req-00000009-bbbb';

async function startServer({ pingMs = 1000 } = {}) {
  const h = { work: async () => ({ data: { html: 'ok' } }), persist: null, charge: jest.fn(async () => {}), finished: 0 };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: Number(req.headers['x-user'] || 9) }; next(); });
  app.post('/t', attachToExistingLandingTurn('edit', { pingMs }), async (req, res) => {
    await runLandingAiTurn({
      req,
      res,
      kind: 'edit',
      pingMs,
      ownerUserId: 7,
      mapError: (error) => ({ status: error.status || 500, body: { success: false, message: error.message } }),
      charge: () => h.charge(),
      work: async (ctx) => {
        const out = await h.work(ctx);
        return { ...out, ...(h.persist ? { persist: () => h.persist(out.data) } : {}) };
      },
    });
    h.finished += 1;
  });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  return { h, port: server.address().port, close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }) };
}

const openClient = (port) => openNdjsonClient(port, { body: { requestId: REQUEST_ID }, accept: NDJSON, headers: { 'x-user': '9' } });
const turnEvents = () => recordAiCallEvent.mock.calls.map(([event]) => event);

describe('aiLandingTurn — sổ bền của lượt (B-8)', () => {
  let srv;
  beforeEach(() => {
    resetLandingTurnsForTest();
    recordAiCallEvent.mockClear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(async () => {
    if (srv) await srv.close();
    srv = null;
    jest.restoreAllMocks();
  });

  it('khách đóng kết nối KHI Gemini còn chạy → client_closed, workDone=false, charged=0, mang chủ + người thao tác', async () => {
    srv = await startServer();
    let signal = null;
    srv.h.work = (ctx) => new Promise((_resolve, reject) => {
      signal = ctx.signal;
      ctx.signal.addEventListener('abort', () => reject(createClientAbortError()));
    });
    const c = openClient(srv.port);
    await until(() => c.status === 200 && signal, { label: 'luồng mở và việc nặng bắt đầu' });
    c.destroy();
    await until(() => srv.h.finished === 1, { label: 'lượt kết thúc' });

    expect(turnEvents()).toHaveLength(1);
    expect(turnEvents()[0]).toMatchObject({
      layer: 'app',
      feature: 'landing_edit_turn',
      outcome: 'client_closed',
      ownerUserId: 7,
      actorUserId: 9,
      meta: { streamed: 1, workDone: false, charged: 0 },
    });
    expect(srv.h.charge).not.toHaveBeenCalled();
  });

  it('AI đã chạy XONG rồi khách mới đi (việc nặng không hợp tác với signal) → client_closed + workDone=true: tiền Google đã tính, credit KHÔNG trừ', async () => {
    srv = await startServer();
    const gate = deferred();
    srv.h.work = async () => { await gate.promise; return { data: { html: 'x' } }; };
    const c = openClient(srv.port);
    await until(() => c.status === 200, { label: 'luồng mở' });
    c.destroy();
    await new Promise((resolve) => { setTimeout(resolve, 60); });
    gate.resolve();
    await until(() => srv.h.finished === 1, { label: 'lượt kết thúc' });

    expect(turnEvents()).toHaveLength(1);
    expect(turnEvents()[0]).toMatchObject({ outcome: 'client_closed', meta: { workDone: true, charged: 0 } });
    expect(srv.h.charge).not.toHaveBeenCalled();
  });

  it('lượt thành công và lượt lỗi thường KHÔNG ghi sự kiện lượt (đã có ở dòng done của dịch vụ landing)', async () => {
    srv = await startServer();
    const ok = openClient(srv.port);
    await ok.done;
    expect(ok.lines[ok.lines.length - 1]).toMatchObject({ type: 'result' });

    resetLandingTurnsForTest();
    srv.h.work = async () => { throw Object.assign(new Error('AI lỗi'), { status: 422 }); };
    const bad = openClient(srv.port);
    await bad.done;
    expect(bad.lines[bad.lines.length - 1]).toMatchObject({ type: 'error', status: 422 });

    expect(turnEvents()).toEqual([]);
  });

  it('bấm lại cùng requestId khi lượt đang chạy → dedup state=attached; khi lượt đã xong → dedup state=cached', async () => {
    srv = await startServer();
    const gate = deferred();
    srv.h.work = async () => { await gate.promise; return { data: { html: 'xong' } }; };
    const a = openClient(srv.port);
    await until(() => a.status === 200, { label: 'luồng A mở' });
    const b = openClient(srv.port);
    await until(() => b.status === 200, { label: 'luồng B bám vào' });
    expect(turnEvents()).toHaveLength(1);
    expect(turnEvents()[0]).toMatchObject({ feature: 'landing_edit_turn', outcome: 'ok', meta: { dedup: 1, state: 'attached', charged: 0 } });

    gate.resolve();
    await Promise.all([a.done, b.done]);
    recordAiCallEvent.mockClear();

    const c = openClient(srv.port);
    await c.done;
    expect(turnEvents()).toHaveLength(1);
    expect(turnEvents()[0]).toMatchObject({ meta: { dedup: 1, state: 'cached', charged: 0 } });
    expect(srv.h.charge).toHaveBeenCalledTimes(1); // trừ đúng MỘT lần dù ba request
  });

  it('sổ bền ném đồng bộ → lượt vẫn giao kết quả và trừ credit bình thường', async () => {
    srv = await startServer();
    recordAiCallEvent.mockImplementation(() => { throw new Error('sổ bền hỏng'); });
    const c = openClient(srv.port);
    await c.done;
    expect(c.lines[c.lines.length - 1]).toMatchObject({ type: 'result', success: true });
    expect(srv.h.charge).toHaveBeenCalledTimes(1);
    recordAiCallEvent.mockImplementation(() => Promise.resolve(true));
  });
});
