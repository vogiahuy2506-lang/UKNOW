/**
 * Integration: inbox SSE stream auth + plan gate.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import jwt from 'jsonwebtoken';
import http from 'http';

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
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 500);
      req.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
      req.destroy();
    });
    sseService._resetForTests();
  });

  it('invalid token → 401', async () => {
    const { req, res } = await httpGet('/api/ai/chatbot/inbox/stream?token=bad.token.here');
    const body = await new Promise((resolve) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    expect(res.statusCode).toBe(401);
    expect(body).toMatch(/Invalid token|Unauthorized/i);
    req.destroy();
  });

  it('missing token → 401', async () => {
    const { req, res } = await httpGet('/api/ai/chatbot/inbox/stream');
    const body = await new Promise((resolve) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
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
    const body = await new Promise((resolve) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(body).code).toBe('NO_ACTIVE_PLAN');
    req.destroy();
  });
});
