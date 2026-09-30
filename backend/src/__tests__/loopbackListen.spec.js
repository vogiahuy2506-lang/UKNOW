/**
 * Chốt cho tests/setup/loopbackListen.js (jest setupFiles của project `unit` và `integration`).
 *
 * Bệnh gốc: supertest `app.listen(0)` bind `::` nhưng kết nối `127.0.0.1:<cổng>`; trên macOS một tiến trình
 * khác (IDE, language server, dev server...) đang giữ đúng cổng đó ở 127.0.0.1 thì request tới tiến trình
 * lạ => 400/403/404/socket hang up ngẫu nhiên (employeeRoutePolicy, authLimiters, `loginAs failed: 403 {}`
 * ở integration). Xem giải thích đầy đủ trong file setup.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import http from 'node:http';
import express from 'express';
import request from 'supertest';

const opened = [];
const track = (server) => {
  opened.push(server);
  return server;
};

afterEach(async () => {
  await Promise.all(opened.splice(0).map((server) => new Promise((resolve) => {
    if (!server.listening) return resolve();
    return server.close(resolve);
  })));
});

const whenListening = (server) => new Promise((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});

describe('loopbackListen — listen() không chỉ host bind ĐỒNG BỘ vào 127.0.0.1', () => {
  it.each([
    ['listen(0)', (server) => server.listen(0)],
    ['listen(0, cb)', (server) => server.listen(0, () => {})],
    ["listen('0')", (server) => server.listen('0')],
    ['listen()', (server) => server.listen()],
    ['listen(cb)', (server) => server.listen(() => {})],
    ['listen({ port: 0 })', (server) => server.listen({ port: 0 })],
    ['listen({ port: 0 }, cb)', (server) => server.listen({ port: 0 }, () => {})],
  ])('%s → address() có NGAY sau lời gọi và là 127.0.0.1', async (_label, start) => {
    const server = track(http.createServer());
    const listening = whenListening(server);
    start(server);
    // supertest đọc `app.address().port` ngay sau `listen(0)` — phải có đồng bộ, không được đợi dns.lookup.
    const address = server.address();
    expect(address).not.toBeNull();
    expect(address).toMatchObject({ address: '127.0.0.1', family: 'IPv4' });
    expect(address.port).toBeGreaterThan(0);
    await listening;
  });

  it('cb của listen(0, cb) được gọi đúng một lần khi đã lắng nghe', async () => {
    const server = track(http.createServer());
    let calls = 0;
    await new Promise((resolve) => {
      server.listen(0, () => {
        calls += 1;
        resolve();
      });
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(calls).toBe(1);
    expect(server.listening).toBe(true);
  });

  it('host tường minh được giữ nguyên (không bị ép về 127.0.0.1)', async () => {
    const server = track(http.createServer());
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    expect(server.address()).toMatchObject({ address: '0.0.0.0', family: 'IPv4' });
  });

  it('listen lần hai trên server đang lắng nghe vẫn ném lỗi gốc của Node', async () => {
    const server = track(http.createServer());
    await new Promise((resolve) => server.listen(0, resolve));
    expect(() => server.listen(0)).toThrow(/more than once|already listen|ERR_SERVER_ALREADY_LISTEN/i);
  });

  it('supertest request(app) nói chuyện đúng với app của test', async () => {
    const app = express();
    app.get('/ping', (_req, res) => res.json({ ok: true }));
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  // Tái hiện có chủ đích mật độ listener lạ của một máy dev đông tiến trình. Không có setup này, mỗi request
  // supertest có ~300/16384 (~1,8%) khả năng nhận trả lời "FOREIGN" (bỏ setup: 500 request gần như chắc chắn
  // có lượt lệch trên macOS, xác suất qua lọt ~1e-4; đã đo: bỏ setup thì ca này đỏ 3/3). Linux (CI) từ chối
  // cấp cổng đang có listener IPv4 cho socket `::` (chưa đo trên runner) nên ca này ở CI chỉ là kiểm hồi quy
  // nhẹ — giá trị thật của nó là trên máy dev macOS, nơi lỗi xảy ra.
  it('300 listener lạ giữ cổng ở 127.0.0.1: 500 request supertest đều tới ĐÚNG app', async () => {
    // Cổng lạ phải rải NGẪU NHIÊN khắp dải cổng tạm như IDE/dev server thật: cổng kernel tự cấp cho
    // `listen(0, '127.0.0.1')` nằm sát nhau nên không trúng cổng mà `::` được cấp.
    let held = 0;
    while (held < 300) {
      const port = 49152 + Math.floor(Math.random() * (65535 - 49152 + 1));
      const server = track(http.createServer((_req, res) => {
        res.statusCode = 403;
        res.end('FOREIGN');
      }));
      // eslint-disable-next-line no-await-in-loop
      const ok = await new Promise((resolve) => {
        server.once('error', () => resolve(false));
        server.listen(port, '127.0.0.1', () => resolve(true));
      });
      if (ok) held += 1;
    }

    const app = express();
    app.get('/ping', (_req, res) => res.json({ ok: true }));

    const wrong = [];
    for (let i = 0; i < 500; i += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await request(app).get('/ping');
        if (res.status !== 200 || res.body.ok !== true) wrong.push(`${res.status} ${String(res.text).slice(0, 30)}`);
      } catch (error) {
        wrong.push(`ERR ${error.code || error.message}`);
      }
    }
    expect(wrong).toEqual([]);
  }, 30000);
});
