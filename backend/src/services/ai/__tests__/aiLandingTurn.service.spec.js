import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';

/**
 * PR-9 (B-4) — phản hồi LUỒNG NDJSON của lượt sinh / sửa landing: nhịp ping, trừ credit đúng một lần và chỉ khi giao được,
 * khoá chống trùng theo requestId, huỷ khi người dùng đóng kết nối. Chạy trên máy chủ HTTP THẬT (cổng ngẫu nhiên) vì đóng kết nối
 * và byte đến từng dòng chỉ quan sát được qua socket thật, không qua mock `res`.
 */

const { runLandingAiTurn, attachToExistingLandingTurn, resetLandingTurnsForTest, wantsNdjson, readRequestId } = await import(
  '../aiLandingTurn.service.js'
);
const { createClientAbortError } = await import('../../../utils/aiAbort.util.js');
const { NDJSON, until, deferred, openNdjsonClient } = await import('./helpers/ndjsonTestClient.js');

const REQUEST_ID = 'req-00000001-aaaa';

/** Máy chủ thử: một route chạy đúng hàm runLandingAiTurn thật; hành vi của "việc nặng" do từng test đặt qua `h`. */
async function startServer({ pingMs = 15, extraMiddleware = null } = {}) {
  const h = {
    work: async () => ({ data: { html: '<div>ok</div>' } }),
    persist: null,
    free: false,
    charge: jest.fn(async () => {}),
    mapError: (error) => ({ status: error.status || 500, body: { success: false, message: error.message } }),
    finished: 0,
    workCalls: 0,
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: Number(req.headers['x-user'] || 1) };
    next();
  });
  const route = ['/t', attachToExistingLandingTurn('generate', { pingMs })];
  if (extraMiddleware) route.push(extraMiddleware);
  route.push(async (req, res) => {
    await runLandingAiTurn({
      req,
      res,
      kind: 'generate',
      pingMs,
      mapError: h.mapError,
      charge: () => h.charge(),
      work: async (ctx) => {
        h.workCalls += 1;
        const out = await h.work(ctx);
        return { ...out, ...(h.persist ? { persist: () => h.persist(out.data) } : {}), free: h.free };
      },
    });
    h.finished += 1;
  });
  app.post(...route);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  return { h, port: server.address().port, close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }) };
}

/** Client NDJSON dùng chung (xem helpers/ndjsonTestClient.js); `user` đi qua header x-user để route thử gán req.user. */
const openClient = (port, { body = { requestId: REQUEST_ID }, accept = NDJSON, user = 1 } = {}) =>
  openNdjsonClient(port, { body, accept, headers: { 'x-user': String(user) } });

describe('aiLandingTurn — runLandingAiTurn / attachToExistingLandingTurn', () => {
  let srv;
  let logSpy;
  beforeEach(() => {
    resetLandingTurnsForTest();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(async () => {
    if (srv) await srv.close();
    srv = null;
    jest.restoreAllMocks();
  });

  describe('đọc yêu cầu', () => {
    it('wantsNdjson chỉ bật khi client XIN application/x-ndjson; req giả không có headers → false', () => {
      expect(wantsNdjson({ headers: { accept: 'application/x-ndjson, application/json;q=0.5' } })).toBe(true);
      expect(wantsNdjson({ headers: { accept: 'application/json' } })).toBe(false);
      expect(wantsNdjson({ headers: {} })).toBe(false);
      expect(wantsNdjson({})).toBe(false);
    });

    it('readRequestId: uuid hợp lệ; rỗng / quá ngắn / ký tự lạ → null (coi như không có)', () => {
      expect(readRequestId({ body: { requestId: '3f2b8a52-9c1d-4e0a-8f77-1b2c3d4e5f60' } })).toBe('3f2b8a52-9c1d-4e0a-8f77-1b2c3d4e5f60');
      expect(readRequestId({ body: { requestId: 'abc' } })).toBeNull();
      expect(readRequestId({ body: { requestId: 'a b c d e f g h' } })).toBeNull();
      expect(readRequestId({ body: { requestId: 123456789012 } })).toBeNull();
      expect(readRequestId({ body: {} })).toBeNull();
    });
  });

  describe('phản hồi luồng', () => {
    it('mở phản hồi NGAY với đúng header; ping khi việc nặng còn chạy; dòng cuối là result đúng hình dạng JSON cũ', async () => {
      srv = await startServer({ pingMs: 15 });
      const gate = deferred();
      srv.h.work = async () => { await gate.promise; return { data: { title: 'T', html: '<div>ok</div>' } }; };

      const c = openClient(srv.port);
      await until(() => c.status === 200, { label: 'header phản hồi (phải tới TRƯỚC khi việc nặng xong)' });
      expect(c.headers['content-type']).toContain(NDJSON);
      expect(c.headers['cache-control']).toBe('no-cache, no-transform');
      expect(c.headers['x-accel-buffering']).toBe('no');

      // Việc nặng chưa xong mà byte đã chạy đều — đây là thứ giữ Cloudflare khỏi cắt ở 100 giây.
      await until(() => c.types().filter((t) => t === 'ping').length >= 2, { label: 'hai dòng ping' });
      expect(srv.h.charge).not.toHaveBeenCalled();

      gate.resolve();
      await c.done;
      const last = c.lines[c.lines.length - 1];
      expect(last).toEqual({ type: 'result', success: true, data: { title: 'T', html: '<div>ok</div>' } });
      expect(c.lines.filter((l) => l.type === 'result')).toHaveLength(1);
      expect(srv.h.charge).toHaveBeenCalledTimes(1);
    });

    it('stage: dòng stage ngay khi việc nặng báo tiến độ', async () => {
      srv = await startServer({ pingMs: 1000 });
      const gate = deferred();
      srv.h.work = async (ctx) => {
        ctx.setStage('generating');
        await gate.promise;
        ctx.setStage('fixing');
        return { data: {} };
      };
      const c = openClient(srv.port);
      await until(() => c.lines.some((l) => l.type === 'stage' && l.stage === 'generating'), { label: 'stage generating' });
      gate.resolve();
      await c.done;
      expect(c.lines.filter((l) => l.type === 'stage').map((l) => l.stage)).toEqual(['generating', 'fixing']);
    });

    it('thứ tự: kiểm kết nối → LƯU phiên → TRỪ credit → ghi dòng result (khách nhận kết quả sau khi đã trừ)', async () => {
      srv = await startServer({ pingMs: 1000 });
      const order = [];
      srv.h.persist = async () => { order.push('persist'); };
      srv.h.charge = jest.fn(async () => { order.push('charge'); });
      const c = openClient(srv.port);
      await c.done;
      expect(order).toEqual(['persist', 'charge']);
      expect(c.types()).toContain('result');
    });

    it('lỗi của việc nặng → MỘT dòng error mang status + thân lỗi, KHÔNG trừ credit, KHÔNG lưu phiên', async () => {
      srv = await startServer({ pingMs: 1000 });
      srv.h.persist = jest.fn(async () => {});
      srv.h.work = async () => { throw Object.assign(new Error('AI bịa URL ảnh ngoài hệ thống.'), { status: 422 }); };
      const c = openClient(srv.port);
      await c.done;
      const last = c.lines[c.lines.length - 1];
      expect(last).toEqual({ type: 'error', status: 422, success: false, message: 'AI bịa URL ảnh ngoài hệ thống.' });
      expect(c.lines.filter((l) => l.type === 'result')).toHaveLength(0);
      expect(srv.h.charge).not.toHaveBeenCalled();
      expect(srv.h.persist).not.toHaveBeenCalled();
    });

    it('lượt miễn phí (free: true, tự sửa hiển thị) → vẫn giao kết quả, KHÔNG gọi charge', async () => {
      srv = await startServer({ pingMs: 1000 });
      srv.h.free = true;
      const c = openClient(srv.port);
      await c.done;
      expect(c.types()).toContain('result');
      expect(srv.h.charge).not.toHaveBeenCalled();
    });

    it('trừ credit hỏng (ném lỗi) → dòng error, không có result', async () => {
      srv = await startServer({ pingMs: 1000 });
      srv.h.charge = jest.fn(async () => { throw Object.assign(new Error('lỗi trừ'), { status: 500 }); });
      const c = openClient(srv.port);
      await c.done;
      expect(c.lines[c.lines.length - 1]).toMatchObject({ type: 'error', status: 500, message: 'lỗi trừ' });
      expect(c.types()).not.toContain('result');
    });
  });

  describe('người dùng đóng kết nối giữa chừng', () => {
    it('đóng khi việc nặng còn chạy → signal bị huỷ, KHÔNG lưu phiên, KHÔNG trừ credit', async () => {
      srv = await startServer({ pingMs: 1000 });
      let signal = null;
      srv.h.persist = jest.fn(async () => {});
      srv.h.work = (ctx) => new Promise((_resolve, reject) => {
        signal = ctx.signal;
        ctx.signal.addEventListener('abort', () => reject(createClientAbortError()));
      });
      const c = openClient(srv.port);
      await until(() => c.status === 200 && signal, { label: 'luồng mở và việc nặng bắt đầu' });
      expect(signal.aborted).toBe(false);

      c.destroy();
      await until(() => signal.aborted, { label: 'signal bị huỷ sau khi client đóng' });
      await until(() => srv.h.finished === 1, { label: 'lượt kết thúc' });

      expect(srv.h.charge).not.toHaveBeenCalled();
      expect(srv.h.persist).not.toHaveBeenCalled();
      const turnLog = logSpy.mock.calls.map((x) => x[0]).find((l) => typeof l === 'string' && l.startsWith('[LandingAI] turn'));
      expect(turnLog).toContain('clientClosed=1');
      expect(turnLog).toContain('outcome=closed');
      expect(turnLog).toContain('charged=0');
    });

    it('việc nặng KHÔNG hợp tác với signal, chạy xong sau khi client đã đi → vẫn không lưu phiên, không trừ credit', async () => {
      srv = await startServer({ pingMs: 1000 });
      const gate = deferred();
      srv.h.persist = jest.fn(async () => {});
      srv.h.work = async () => { await gate.promise; return { data: { html: 'x' } }; };
      const c = openClient(srv.port);
      await until(() => c.status === 200, { label: 'luồng mở' });
      c.destroy();
      await new Promise((resolve) => { setTimeout(resolve, 60); }); // để server nhận 'close'
      gate.resolve();
      await until(() => srv.h.finished === 1, { label: 'lượt kết thúc' });
      expect(srv.h.persist).not.toHaveBeenCalled();
      expect(srv.h.charge).not.toHaveBeenCalled();
    });

    it('client đi đúng lúc đang LƯU phiên → chốt thứ hai chặn: KHÔNG trừ credit', async () => {
      srv = await startServer({ pingMs: 1000 });
      let clientRef = null;
      srv.h.persist = jest.fn(async () => {
        clientRef.destroy();
        await new Promise((resolve) => { setTimeout(resolve, 80); }); // thời gian lưu phiên; server kịp nhận 'close'
      });
      clientRef = openClient(srv.port);
      await until(() => srv.h.finished === 1, { label: 'lượt kết thúc' });
      expect(srv.h.persist).toHaveBeenCalledTimes(1);
      expect(srv.h.charge).not.toHaveBeenCalled();
    });

    it('lượt bị huỷ KHÔNG được nhớ: bấm lại cùng requestId chạy lại từ đầu (không bám vào xác chết)', async () => {
      srv = await startServer({ pingMs: 1000 });
      let first = true;
      srv.h.work = (ctx) => (first
        ? new Promise((_r, reject) => { first = false; ctx.signal.addEventListener('abort', () => reject(createClientAbortError())); })
        : Promise.resolve({ data: { html: 'lần hai' } }));
      const c1 = openClient(srv.port);
      await until(() => c1.status === 200, { label: 'luồng 1 mở' });
      c1.destroy();
      await until(() => srv.h.finished === 1, { label: 'lượt 1 kết thúc' });

      const c2 = openClient(srv.port);
      await c2.done;
      expect(srv.h.workCalls).toBe(2);
      expect(c2.lines[c2.lines.length - 1]).toMatchObject({ type: 'result', data: { html: 'lần hai' } });
    });

    it('có THÊM một người nghe (bấm lại cùng requestId): người đầu đi, lượt VẪN chạy cho người còn lại, trừ đúng 1 lần', async () => {
      srv = await startServer({ pingMs: 1000 });
      const gate = deferred();
      let signal = null;
      srv.h.work = async (ctx) => { signal = ctx.signal; await gate.promise; return { data: { html: 'xong' } }; };
      const a = openClient(srv.port);
      await until(() => a.status === 200 && signal, { label: 'luồng A mở' });
      const b = openClient(srv.port);
      await until(() => b.status === 200, { label: 'luồng B bám vào' });
      a.destroy();
      await new Promise((resolve) => { setTimeout(resolve, 60); });
      expect(signal.aborted).toBe(false);

      gate.resolve();
      await b.done;
      expect(b.lines[b.lines.length - 1]).toMatchObject({ type: 'result', data: { html: 'xong' } });
      expect(srv.h.workCalls).toBe(1);
      expect(srv.h.charge).toHaveBeenCalledTimes(1);
    });
  });

  describe('khoá chống trùng theo requestId', () => {
    it('hai request cùng requestId đang chạy → Gemini (việc nặng) gọi 1 LẦN, cả hai nhận cùng kết quả, trừ 1 lần', async () => {
      srv = await startServer({ pingMs: 1000 });
      const gate = deferred();
      srv.h.work = async () => { await gate.promise; return { data: { html: 'một lần' } }; };
      const a = openClient(srv.port);
      await until(() => a.status === 200, { label: 'A mở' });
      const b = openClient(srv.port);
      await until(() => b.status === 200, { label: 'B bám vào' });
      gate.resolve();
      await Promise.all([a.done, b.done]);

      expect(srv.h.workCalls).toBe(1);
      expect(srv.h.charge).toHaveBeenCalledTimes(1);
      expect(a.lines[a.lines.length - 1]).toEqual({ type: 'result', success: true, data: { html: 'một lần' } });
      expect(b.lines[b.lines.length - 1]).toEqual({ type: 'result', success: true, data: { html: 'một lần' } });
      const dedupLog = logSpy.mock.calls.map((x) => x[0]).find((l) => typeof l === 'string' && l.includes('dedup=1'));
      expect(dedupLog).toContain('state=attached');
    });

    it('đã xong → bấm lại cùng requestId nhận lại ĐÚNG kết quả cũ: không gọi việc nặng, không trừ lần 2', async () => {
      srv = await startServer({ pingMs: 1000 });
      srv.h.work = async () => ({ data: { html: 'trả tiền rồi' } });
      const a = openClient(srv.port);
      await a.done;
      const b = openClient(srv.port);
      await b.done;

      expect(srv.h.workCalls).toBe(1);
      expect(srv.h.charge).toHaveBeenCalledTimes(1);
      expect(b.lines[b.lines.length - 1]).toEqual({ type: 'result', success: true, data: { html: 'trả tiền rồi' } });
      const cachedLog = logSpy.mock.calls.map((x) => x[0]).find((l) => typeof l === 'string' && l.includes('state=cached'));
      expect(cachedLog).toContain('dedup=1');
      expect(cachedLog).toContain('charged=0');
    });

    it('đã xong rồi bấm lại: nhận kết quả cũ KỂ CẢ khi bước kiểm credit phía sau sẽ từ chối (hết credit vì chính lượt này vừa trừ)', async () => {
      const noCredit = (_req, res) => res.status(402).json({ success: false, message: 'Đã hết lượt AI' });
      srv = await startServer({ pingMs: 1000, extraMiddleware: noCredit });
      // Lượt đầu cần đi qua được middleware kiểm credit: tạo kết quả bằng đường gọi trực tiếp bằng cờ bỏ qua.
      srv.h.work = async () => ({ data: { html: 'x' } });
      // Chèn lượt "đã xong" thẳng vào bộ nhớ bằng một server thứ hai không có middleware chặn (cùng module ⇒ cùng bộ nhớ lượt).
      const open = await startServer({ pingMs: 1000 });
      open.h.work = async () => ({ data: { html: 'đã trả tiền' } });
      const first = openClient(open.port);
      await first.done;
      await open.close();

      const retry = openClient(srv.port);
      await retry.done;
      expect(retry.status).toBe(200);
      expect(retry.lines[retry.lines.length - 1]).toEqual({ type: 'result', success: true, data: { html: 'đã trả tiền' } });
    });

    it('khác người dùng, cùng requestId → coi như khác: việc nặng chạy riêng, trừ riêng', async () => {
      srv = await startServer({ pingMs: 1000 });
      const a = openClient(srv.port, { user: 1 });
      await a.done;
      const b = openClient(srv.port, { user: 2 });
      await b.done;
      expect(srv.h.workCalls).toBe(2);
      expect(srv.h.charge).toHaveBeenCalledTimes(2);
    });

    it('lượt LỖI không được nhớ: bấm lại cùng requestId chạy mới (chưa trừ đồng nào)', async () => {
      srv = await startServer({ pingMs: 1000 });
      let n = 0;
      srv.h.work = async () => {
        n += 1;
        if (n === 1) throw Object.assign(new Error('Google quá tải'), { status: 503 });
        return { data: { html: 'lần hai ổn' } };
      };
      const a = openClient(srv.port);
      await a.done;
      expect(a.lines[a.lines.length - 1].type).toBe('error');
      const b = openClient(srv.port);
      await b.done;
      expect(b.lines[b.lines.length - 1]).toMatchObject({ type: 'result', data: { html: 'lần hai ổn' } });
      expect(srv.h.workCalls).toBe(2);
      expect(srv.h.charge).toHaveBeenCalledTimes(1);
    });

    it('requestId sai dạng / không có → không có khoá: hai lượt chạy riêng', async () => {
      srv = await startServer({ pingMs: 1000 });
      await openClient(srv.port, { body: { requestId: 'ngan' } }).done;
      await openClient(srv.port, { body: { requestId: 'ngan' } }).done;
      await openClient(srv.port, { body: {} }).done;
      expect(srv.h.workCalls).toBe(3);
    });
  });

  describe('đường JSON cũ (client không xin luồng)', () => {
    it('trả JSON một lần, giữ nguyên thân { success, data }, KHÔNG header ndjson; requestId bị bỏ qua', async () => {
      srv = await startServer({ pingMs: 1000 });
      srv.h.work = async () => ({ data: { html: 'json cũ' } });
      const a = openClient(srv.port, { accept: 'application/json' });
      await a.done;
      expect(a.status).toBe(200);
      expect(a.headers['content-type']).toContain('application/json');
      expect(JSON.parse(a.raw)).toEqual({ success: true, data: { html: 'json cũ' } });
      expect(srv.h.charge).toHaveBeenCalledTimes(1);

      // Không có khoá chống trùng ở đường JSON → bấm lại là chạy lại (hành vi cũ), không nhận bản nhớ.
      const b = openClient(srv.port, { accept: 'application/json' });
      await b.done;
      expect(srv.h.workCalls).toBe(2);
    });

    it('lỗi → mã HTTP thật + thân lỗi như cũ (không phải dòng NDJSON)', async () => {
      srv = await startServer({ pingMs: 1000 });
      srv.h.work = async () => { throw Object.assign(new Error('Thiếu Tailwind'), { status: 422 }); };
      const a = openClient(srv.port, { accept: null });
      await a.done;
      expect(a.status).toBe(422);
      expect(JSON.parse(a.raw)).toEqual({ success: false, message: 'Thiếu Tailwind' });
      expect(srv.h.charge).not.toHaveBeenCalled();
    });
  });
});
