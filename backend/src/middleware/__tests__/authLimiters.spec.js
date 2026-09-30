/**
 * PLAN_SUA_SAU_NGHIEM_THU_2026-09-29 mục 1.F — loginAccountLimiter/loginIpLimiter/
 * authCredentialLimiter. Dựng app express nhỏ, gọi factory với { skip: () => false } để bật
 * limiter thật (mặc định skipInTest sẽ bỏ qua hoàn toàn trong NODE_ENV=test), giả IP bằng
 * X-Forwarded-For + trust proxy.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import {
  createLoginAccountLimiter,
  createLoginIpLimiter,
  createAuthCredentialLimiter,
} from '../rateLimiter.middleware.js';

const NO_SKIP = { skip: () => false };

// Mỗi ca dựng MỘT server đang lắng nghe và dùng lại cho mọi request, tắt ở afterEach.
// Trước đây `request(app)` dựng + tắt một server tạm cho TỪNG request (ca (e) = 51 server). Chạy cả bộ
// unit suite này đỏ chập chờn "Exceeded timeout of 20000 ms" (29/09/2026, 2 lần) dù chạy riêng chỉ ~30 ms.
// Nhiều khả năng gốc KHÔNG phải keep-alive mà là cơ chế đã tái hiện được ở employeeRoutePolicy (30/09/2026):
// `app.listen(0)` bind `::` còn supertest nối `127.0.0.1:<cổng>`, mà macOS cho một tiến trình lạ (IDE,
// language server) giữ cùng cổng ở 127.0.0.1 — request rơi vào tiến trình lạ, trả sai hoặc không bao giờ
// trả lời (treo tới hết timeout). Đã vá ở tests/setup/loopbackListen.js (jest setupFiles). Một server mỗi
// ca + `Connection: close` vẫn giữ: rẻ và vô hại.
const openServers = [];
afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

function listenOnce(app) {
  const server = app.listen(0);
  openServers.push(server);
  return server;
}

function buildLoginApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.post(
    '/login',
    createLoginAccountLimiter(NO_SKIP),
    createLoginIpLimiter(NO_SKIP),
    (req, res) => {
      if (req.body?.password === 'right') return res.status(200).json({ success: true });
      return res.status(401).json({ success: false });
    }
  );
  return listenOnce(app);
}

const loginAs = (app, ip, username, password) => request(app)
  .post('/login')
  .set('X-Forwarded-For', ip)
  .set('Connection', 'close')
  .send({ username, password });

describe('loginAccountLimiter + loginIpLimiter (/login)', () => {
  it('(a) 15 lượt đăng nhập ĐÚNG cùng IP + user → không 429', async () => {
    const app = buildLoginApp();
    for (let i = 0; i < 15; i += 1) {
      const res = await loginAs(app, '10.0.0.1', 'admin', 'right');
      expect(res.status).toBe(200);
    }
  });

  it('(b) 10 lượt SAI cùng IP + user → lượt 11 = 429 LOGIN_RATE_LIMIT_EXCEEDED', async () => {
    const app = buildLoginApp();
    for (let i = 0; i < 10; i += 1) {
      const res = await loginAs(app, '10.0.0.2', 'bob', 'wrong');
      expect(res.status).toBe(401);
    }
    const res11 = await loginAs(app, '10.0.0.2', 'bob', 'wrong');
    expect(res11.status).toBe(429);
    expect(res11.body.code).toBe('LOGIN_RATE_LIMIT_EXCEEDED');
  });

  it('(c) sau khi khoá 1 tài khoản, cùng IP nhưng username khác → vẫn qua (không khoá cả văn phòng)', async () => {
    const app = buildLoginApp();
    for (let i = 0; i < 11; i += 1) {
      await loginAs(app, '10.0.0.3', 'carol', 'wrong');
    }
    const resDave = await loginAs(app, '10.0.0.3', 'dave', 'wrong');
    expect(resDave.status).toBe(401);
  });

  it('(d) username khác hoa/thường + khoảng trắng (" Admin " vs "admin") → chung một bộ đếm', async () => {
    const app = buildLoginApp();
    for (let i = 0; i < 5; i += 1) {
      await loginAs(app, '10.0.0.4', 'Admin', 'wrong');
    }
    for (let i = 0; i < 5; i += 1) {
      await loginAs(app, '10.0.0.4', ' admin ', 'wrong');
    }
    // 10 lượt sai đã dùng hết trần 10 — lượt thứ 11, kể cả viết hoa toàn bộ, phải bị chặn.
    const res11 = await loginAs(app, '10.0.0.4', 'ADMIN', 'wrong');
    expect(res11.status).toBe(429);
    expect(res11.body.code).toBe('LOGIN_RATE_LIMIT_EXCEEDED');
  });

  // Review PR-C — bẫy trong lệnh giao: khoá CHỈ theo username thì kẻ gian gõ sai 10 lần tên của nạn nhân là khoá được
  // nạn nhân khỏi MỌI IP. Khoá phải là IP + username: cùng tài khoản đăng nhập từ IP khác vẫn qua.
  it('(c2) sau khi 10 lượt SAI khoá "victim" ở IP A, chính "victim" đăng nhập ĐÚNG từ IP B → vẫn qua', async () => {
    const app = buildLoginApp();
    for (let i = 0; i < 10; i += 1) {
      await loginAs(app, '10.0.0.9', 'victim', 'wrong');
    }
    expect((await loginAs(app, '10.0.0.9', 'victim', 'wrong')).status).toBe(429);
    const fromOtherIp = await loginAs(app, '10.0.0.10', 'victim', 'right');
    expect(fromOtherIp.status).toBe(200);
  });

  it('(e) 50 lượt SAI cùng IP, 50 username khác nhau → lượt 51 = 429 LOGIN_IP_RATE_LIMIT_EXCEEDED', async () => {
    const app = buildLoginApp();
    for (let i = 0; i < 50; i += 1) {
      const res = await loginAs(app, '10.0.0.5', `user${i}`, 'wrong');
      expect(res.status).toBe(401);
    }
    const res51 = await loginAs(app, '10.0.0.5', 'user50', 'wrong');
    expect(res51.status).toBe(429);
    expect(res51.body.code).toBe('LOGIN_IP_RATE_LIMIT_EXCEEDED');
  }, 20000);
});

describe('authCredentialLimiter', () => {
  function buildCredentialApp() {
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.post('/register', createAuthCredentialLimiter(NO_SKIP), (req, res) => res.status(200).json({ success: true }));
    return listenOnce(app);
  }

  it('(f) 20 lượt → lượt 21 = 429 AUTH_RATE_LIMIT_EXCEEDED (đếm cả lượt thành công)', async () => {
    const app = buildCredentialApp();
    for (let i = 0; i < 20; i += 1) {
      const res = await request(app).post('/register').set('X-Forwarded-For', '10.0.0.6').set('Connection', 'close').send({});
      expect(res.status).toBe(200);
    }
    const res21 = await request(app).post('/register').set('X-Forwarded-For', '10.0.0.6').set('Connection', 'close').send({});
    expect(res21.status).toBe(429);
    expect(res21.body.code).toBe('AUTH_RATE_LIMIT_EXCEEDED');
  });
});
