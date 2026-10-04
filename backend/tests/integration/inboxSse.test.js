/**
 * Integration: inbox SSE stream auth + plan gate.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import jwt from 'jsonwebtoken';
import http from 'http';
import db from '../../src/config/database.js';

const { createApp } = await import('../../src/app.js');
const {
  truncateAll,
  createUser,
} = await import('./helpers/db.js');
const sseService = (await import('../../src/services/sse.service.js')).default;

let app;
let server;
let baseUrl;

function signAccessToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}${path}`, (res) => {
      resolve({ req, res });
    });
    req.on('error', reject);
  });
}

async function addMembership(ownerId, employeeId, permissions, status = 'active') {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, NOW(), NOW())`,
    [ownerId, employeeId, JSON.stringify(permissions), status]
  );
}

async function readResponseBody(res) {
  return new Promise((resolve) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

async function closeSse(req) {
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 500);
    req.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
    req.destroy();
  });
  sseService._resetForTests();
}

describe('Inbox SSE stream', () => {
  beforeAll(async () => {
    app = createApp();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    sseService._resetForTests();
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(async () => {
    await truncateAll();
    sseService._resetForTests();
  });

  it('GET /api/ai/chatbot/inbox/stream?token=<valid> → 200 text/event-stream', async () => {
    const user = await createUser({ username: 'sse_ok' });
    const token = signAccessToken(user);

    const { req, res } = await httpGet(
      `/api/ai/chatbot/inbox/stream?token=${encodeURIComponent(token)}`
    );

    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'] || '')).toMatch(/text\/event-stream/);

    const firstChunk = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no SSE data')), 3000);
      res.once('data', (buf) => {
        clearTimeout(timer);
        resolve(buf.toString('utf8'));
      });
      res.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    expect(firstChunk).toMatch(/event:\s*connected/);

    // Wait for server-side close so the 30s heartbeat interval is cleared
    await closeSse(req);
  });

  it('employee có inbox_view kết nối stream trong workspace owner', async () => {
    const owner = await createUser({ username: 'sse_owner' });
    const employee = await createUser({ username: 'sse_employee' });
    await addMembership(owner.id, employee.id, { inbox_view: true });
    const token = signAccessToken(employee);

    const { req, res } = await httpGet(
      `/api/ai/chatbot/inbox/stream?token=${encodeURIComponent(token)}&ownerContext=${owner.id}`
    );

    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'] || '')).toMatch(/text\/event-stream/);
    await closeSse(req);
  });

  it('employee thiếu inbox_view bị từ chối ngay trên stream', async () => {
    const owner = await createUser({ username: 'sse_owner_denied' });
    const employee = await createUser({ username: 'sse_employee_denied' });
    await addMembership(owner.id, employee.id, { inbox_view: false });
    const token = signAccessToken(employee);

    const { req, res } = await httpGet(
      `/api/ai/chatbot/inbox/stream?token=${encodeURIComponent(token)}&ownerContext=${owner.id}`
    );
    const body = await readResponseBody(res);

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(body).code).toBe('PERMISSION_DENIED');
    req.destroy();
  });

  it('ownerContext giả hoặc membership không active bị INVALID_CONTEXT', async () => {
    const owner = await createUser({ username: 'sse_owner_invalid' });
    const employee = await createUser({ username: 'sse_employee_invalid' });
    await addMembership(owner.id, employee.id, { inbox_view: true }, 'inactive');
    const token = signAccessToken(employee);

    const { req, res } = await httpGet(
      `/api/ai/chatbot/inbox/stream?token=${encodeURIComponent(token)}&ownerContext=${owner.id}`
    );
    const body = await readResponseBody(res);

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(body).code).toBe('INVALID_CONTEXT');
    req.destroy();
  });

  it('invalid token → 401', async () => {
    const { req, res } = await httpGet('/api/ai/chatbot/inbox/stream?token=bad.token.here');
    const body = await readResponseBody(res);
    expect(res.statusCode).toBe(401);
    expect(body).toMatch(/Invalid token|Unauthorized/i);
    req.destroy();
  });

  it('missing token → 401', async () => {
    const { req, res } = await httpGet('/api/ai/chatbot/inbox/stream');
    const body = await readResponseBody(res);
    expect(res.statusCode).toBe(401);
    req.destroy();
    void body;
  });

  it('user without plan → 403 NO_ACTIVE_PLAN', async () => {
    const user = await createUser({ username: 'sse_noplan', withPlan: false });
    const token = signAccessToken(user);
    const { req, res } = await httpGet(
      `/api/ai/chatbot/inbox/stream?token=${encodeURIComponent(token)}`
    );
    const body = await readResponseBody(res);
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(body).code).toBe('NO_ACTIVE_PLAN');
    req.destroy();
  });
});

function mintTicket(token, ownerContext = null) {
  return new Promise((resolve, reject) => {
    const headers = { Authorization: `Bearer ${token}` };
    if (ownerContext) headers['X-Owner-Context'] = String(ownerContext);
    const req = http.request(
      `${baseUrl}/api/ai/chatbot/inbox/stream-ticket`,
      { method: 'POST', headers },
      (res) => {
        readResponseBody(res).then((body) => {
          resolve({ status: res.statusCode, cacheControl: res.headers['cache-control'], body: JSON.parse(body) });
        }, reject);
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('Inbox SSE stream — vé ngắn hạn (H-04)', () => {
  beforeAll(async () => {
    app = createApp();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    sseService._resetForTests();
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(async () => {
    await truncateAll();
    sseService._resetForTests();
  });

  it('xin vé bằng Bearer rồi nối ?ticket= → 200 text/event-stream; vé dùng lần hai → 401', async () => {
    const user = await createUser({ username: 'sse_ticket_ok' });
    const token = signAccessToken(user);

    const minted = await mintTicket(token);
    expect(minted.status).toBe(200);
    expect(String(minted.cacheControl)).toMatch(/no-store/);
    const { ticket } = minted.body.data;

    const first = await httpGet(`/api/ai/chatbot/inbox/stream?ticket=${encodeURIComponent(ticket)}`);
    expect(first.res.statusCode).toBe(200);
    expect(String(first.res.headers['content-type'] || '')).toMatch(/text\/event-stream/);
    const firstChunk = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no SSE data')), 3000);
      first.res.once('data', (buf) => { clearTimeout(timer); resolve(buf.toString('utf8')); });
    });
    expect(firstChunk).toMatch(/event:\s*connected/);
    await closeSse(first.req);

    const second = await httpGet(`/api/ai/chatbot/inbox/stream?ticket=${encodeURIComponent(ticket)}`);
    const body = await readResponseBody(second.res);
    expect(second.res.statusCode).toBe(401);
    expect(JSON.parse(body).code).toBe('SSE_TICKET_INVALID');
    second.req.destroy();
  });

  it('không có Bearer thì không xin được vé (401)', async () => {
    const res = await new Promise((resolve, reject) => {
      const req = http.request(`${baseUrl}/api/ai/chatbot/inbox/stream-ticket`, { method: 'POST' }, resolve);
      req.on('error', reject);
      req.end();
    });
    await readResponseBody(res);
    expect(res.statusCode).toBe(401);
  });

  it('nhân viên có inbox_view: vé ghi chủ không gian làm việc ở server — URL KHÔNG cần ownerContext, luồng gắn vào chủ', async () => {
    const owner = await createUser({ username: 'sse_ticket_owner' });
    const employee = await createUser({ username: 'sse_ticket_employee' });
    await addMembership(owner.id, employee.id, { inbox_view: true });
    const token = signAccessToken(employee);

    const minted = await mintTicket(token, owner.id);
    expect(minted.status).toBe(200);

    const { req, res } = await httpGet(`/api/ai/chatbot/inbox/stream?ticket=${encodeURIComponent(minted.body.data.ticket)}`);
    expect(res.statusCode).toBe(200);
    await new Promise((resolve) => res.once('data', resolve));
    expect(sseService.getClientCountForUser(owner.id)).toBe(1);
    expect(sseService.getClientCountForUser(employee.id)).toBe(0);
    await closeSse(req);
  });

  it('nhân viên thiếu inbox_view không xin được vé (403 PERMISSION_DENIED)', async () => {
    const owner = await createUser({ username: 'sse_ticket_owner_denied' });
    const employee = await createUser({ username: 'sse_ticket_employee_denied' });
    await addMembership(owner.id, employee.id, { inbox_view: false });

    const minted = await mintTicket(signAccessToken(employee), owner.id);

    expect(minted.status).toBe(403);
    expect(minted.body.code).toBe('PERMISSION_DENIED');
  });

  it('thu hồi quyền SAU khi xin vé: lúc nối vẫn kiểm lại thành viên → 403 INVALID_CONTEXT', async () => {
    const owner = await createUser({ username: 'sse_ticket_owner_revoked' });
    const employee = await createUser({ username: 'sse_ticket_employee_revoked' });
    await addMembership(owner.id, employee.id, { inbox_view: true });
    const minted = await mintTicket(signAccessToken(employee), owner.id);
    expect(minted.status).toBe(200);
    await db.query(`UPDATE user_members SET status = 'inactive' WHERE owner_id = $1 AND employee_id = $2`, [owner.id, employee.id]);

    const { req, res } = await httpGet(`/api/ai/chatbot/inbox/stream?ticket=${encodeURIComponent(minted.body.data.ticket)}`);
    const body = await readResponseBody(res);

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(body).code).toBe('INVALID_CONTEXT');
    req.destroy();
  });

  it('user không có gói không xin được vé (403 NO_ACTIVE_PLAN)', async () => {
    const user = await createUser({ username: 'sse_ticket_noplan', withPlan: false });

    const minted = await mintTicket(signAccessToken(user));

    expect(minted.status).toBe(403);
    expect(minted.body.code).toBe('NO_ACTIVE_PLAN');
  });

  it('vé bịa → 401 SSE_TICKET_INVALID', async () => {
    const { req, res } = await httpGet('/api/ai/chatbot/inbox/stream?ticket=khong-ton-tai');
    const body = await readResponseBody(res);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(body).code).toBe('SSE_TICKET_INVALID');
    req.destroy();
  });
});
