/**
 * Integration test cho PR-2 (đồng bộ Google Sheet) — PLAN_SDT_BAT_BUOC_SYNC_SHEET_2026-09-02.md
 * mục 3. Dựng một HTTP server cục bộ đóng vai Apps Script Web App thật, đăng ký/PUT
 * SĐT qua app thật, xác nhận server giả nhận đúng dữ liệu — không mock
 * `memberSheetSync.util.js`, để bắt được cả lỗi nối dây ở call site lẫn lỗi trong
 * chính util (đúng bài học rút ra từ PR-1: "test xanh" không có nghĩa là chạy đúng
 * nếu không ai từng gọi thật đường mã đó).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import http from 'http';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { truncateAll, createUser, createVerificationCode } from './helpers/db.js';
import db from '../../src/config/database.js';

let app;
let fakeSheetServer;
let fakeSheetPort;
let receivedPosts;

async function waitForPost(timeoutMs = 2000) {
  const start = Date.now();
  while (receivedPosts.length === 0 && Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 20));
  }
  return receivedPosts[0] || null;
}

async function assertNoPostArrives(waitMs = 300) {
  await new Promise((r) => setTimeout(r, waitMs));
  return receivedPosts.length === 0;
}

beforeAll(async () => {
  receivedPosts = [];
  fakeSheetServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      receivedPosts.push(Object.fromEntries(new URLSearchParams(body)));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
  });
  await new Promise((resolve) => fakeSheetServer.listen(0, '127.0.0.1', resolve));
  fakeSheetPort = fakeSheetServer.address().port;
  process.env.MEMBER_SHEET_WEBHOOK_URL = `http://127.0.0.1:${fakeSheetPort}/exec`;
  process.env.MEMBER_SHEET_WEBHOOK_SECRET = 'test-secret';

  app = createApp();
});

afterAll(async () => {
  delete process.env.MEMBER_SHEET_WEBHOOK_URL;
  delete process.env.MEMBER_SHEET_WEBHOOK_SECRET;
  await new Promise((resolve) => fakeSheetServer.close(resolve));
});

beforeEach(async () => {
  await truncateAll();
  receivedPosts = [];
});

async function loginToken(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  expect(res.status).toBe(200);
  return res.body.data.accessToken;
}

describe('Đăng ký → đẩy sang Google Sheet', () => {
  it('đăng ký thành công → server giả nhận đúng email + SĐT trong 2s', async () => {
    const email = 'sheetuser@test.local';
    await createVerificationCode({ email, code: '123456' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'sheetuser01',
        email,
        password: 'Passw0rd!',
        fullName: 'Sheet User',
        phone: '0915000001',
        emailVerificationCode: '123456',
      });
    expect(res.status).toBe(201);

    const posted = await waitForPost();
    expect(posted).not.toBeNull();
    expect(posted.secret).toBe('test-secret');
    expect(posted.email).toBe(email);
    expect(posted.phone).toBe('0915000001');
    expect(posted.fullName).toBe('Sheet User');
  });

  it('response đăng ký trả về ngay — KHÔNG đợi đẩy Sheet xong (fire-and-forget)', async () => {
    // Đây là phép thử trực tiếp cho Bẫy #5 của plan: dựng thẳng call site thật với
    // server giả CHẬM, đo thời gian response thật thay vì tin vào code trông "có vẻ" đúng.
    const slowServer = http.createServer((req, res) => {
      setTimeout(() => {
        req.resume();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      }, 3000);
    });
    await new Promise((resolve) => slowServer.listen(0, '127.0.0.1', resolve));
    const slowPort = slowServer.address().port;
    const savedUrl = process.env.MEMBER_SHEET_WEBHOOK_URL;
    process.env.MEMBER_SHEET_WEBHOOK_URL = `http://127.0.0.1:${slowPort}/exec`;

    try {
      const email = 'slowsheet@test.local';
      await createVerificationCode({ email, code: '123456' });

      const start = Date.now();
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'slowsheet01',
          email,
          password: 'Passw0rd!',
          phone: '0915000002',
          emailVerificationCode: '123456',
        });
      const elapsedMs = Date.now() - start;

      expect(res.status).toBe(201);
      // Server giả cố tình chậm 3000ms — nếu code lỡ await, response cũng mất >=3000ms.
      expect(elapsedMs).toBeLessThan(1500);
    } finally {
      process.env.MEMBER_SHEET_WEBHOOK_URL = savedUrl;
      await new Promise((resolve) => slowServer.close(resolve));
    }
  });

  it('MEMBER_SHEET_WEBHOOK_URL rỗng → đăng ký vẫn thành công, không gọi server giả', async () => {
    const savedUrl = process.env.MEMBER_SHEET_WEBHOOK_URL;
    delete process.env.MEMBER_SHEET_WEBHOOK_URL;

    try {
      const email = 'nourl@test.local';
      await createVerificationCode({ email, code: '123456' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'nourl01',
          email,
          password: 'Passw0rd!',
          phone: '0915000003',
          emailVerificationCode: '123456',
        });

      expect(res.status).toBe(201);
      expect(await assertNoPostArrives()).toBe(true);
    } finally {
      process.env.MEMBER_SHEET_WEBHOOK_URL = savedUrl;
    }
  });
});

describe('PUT /api/users/me/phone → đẩy sang Google Sheet, có lọc nhân viên', () => {
  it('user thường bổ sung SĐT → được đẩy sang Sheet', async () => {
    const user = await createUser({ username: 'normaluser', phone: null });
    const token = await loginToken(user);

    const res = await request(app)
      .put('/api/users/me/phone')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0915000004' });
    expect(res.status).toBe(200);

    const posted = await waitForPost();
    expect(posted).not.toBeNull();
    expect(posted.email).toBe(user.email);
    expect(posted.phone).toBe('0915000004');
  });

  it('nhân viên (user_members active) bổ sung SĐT → KHÔNG được đẩy sang Sheet', async () => {
    // Dựng đúng bảng user_members thay vì cố tạo role='employee' — giá trị đó không
    // tồn tại trong sản phẩm (Bẫy #5b). Đây chính là ca test xanh giả nếu làm sai.
    const owner = await createUser({ username: 'owner1' });
    const employee = await createUser({ username: 'employee1', phone: null });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, status) VALUES ($1, $2, 'active')`,
      [owner.id, employee.id]
    );

    const token = await loginToken(employee);
    const res = await request(app)
      .put('/api/users/me/phone')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0915000005' });
    expect(res.status).toBe(200);

    expect(await assertNoPostArrives()).toBe(true);
  });

  it('user_members status=inactive (đã gỡ khỏi workspace) → VẪN được đẩy sang Sheet', async () => {
    const owner = await createUser({ username: 'owner2' });
    const exEmployee = await createUser({ username: 'exemployee1', phone: null });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, status) VALUES ($1, $2, 'inactive')`,
      [owner.id, exEmployee.id]
    );

    const token = await loginToken(exEmployee);
    const res = await request(app)
      .put('/api/users/me/phone')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0915000006' });
    expect(res.status).toBe(200);

    const posted = await waitForPost();
    expect(posted).not.toBeNull();
    expect(posted.email).toBe(exEmployee.email);
  });
});
