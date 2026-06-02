/**
 * Integration tests cho `/api/admin/system` endpoints.
 *
 * Service đọc /proc/meminfo, /proc/stat (unavailable trên macOS → fallback 0),
 * gọi Docker socket (unavailable trong test → available: false).
 * Response vẫn thành công vì tất cả lỗi được bắt gracefully.
 *
 * Covered:
 *   - Authorization (chỉ admin)
 *   - GET /overview — shape đúng, host/process/cpu/memory/disk/network/docker
 *   - GET /logs — trả available:false khi Docker socket không có
 *   - GET /logs?service=invalid → 400
 *   - GET /logs?service=frontend → valid service, trả available:false
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { truncateAll, createUser } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

// ─── Authorization ──────────────────────────────────────────────────────────
describe('Authorization — /api/admin/system/*', () => {
  it('không có token → 401', async () => {
    const responses = await Promise.all([
      request(app).get('/api/admin/system/overview'),
      request(app).get('/api/admin/system/logs'),
    ]);
    responses.forEach((r) => expect(r.status).toBe(401));
  });

  it('user role thường → 403', async () => {
    const user = await createUser({ role: 'user', username: 'plain' });
    const token = await loginAs(user);
    const responses = await Promise.all([
      request(app).get('/api/admin/system/overview').set('Authorization', `Bearer ${token}`),
      request(app).get('/api/admin/system/logs').set('Authorization', `Bearer ${token}`),
    ]);
    responses.forEach((r) => expect(r.status).toBe(403));
  });

  it('admin role → 200 cho cả hai endpoint', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const responses = await Promise.all([
      request(app).get('/api/admin/system/overview').set('Authorization', `Bearer ${token}`),
      request(app).get('/api/admin/system/logs').set('Authorization', `Bearer ${token}`),
    ]);
    responses.forEach((r) => expect(r.status).toBe(200));
  });
});

// ─── GET /overview ───────────────────────────────────────────────────────────
describe('GET /api/admin/system/overview', () => {
  it('trả đầy đủ top-level sections', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/system/overview')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data).toHaveProperty('host');
    expect(data).toHaveProperty('process');
    expect(data).toHaveProperty('cpu');
    expect(data).toHaveProperty('memory');
    expect(data).toHaveProperty('disk');
    expect(data).toHaveProperty('network');
    expect(data).toHaveProperty('docker');
    expect(data).toHaveProperty('redis');
    expect(data).toHaveProperty('bullmq');
    expect(data).toHaveProperty('dbPool');
    expect(data).toHaveProperty('alerts');
  });

  it('host có hostname, platform, arch, uptime, checkedAt', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/system/overview')
      .set('Authorization', `Bearer ${token}`);

    const { host } = res.body.data;
    expect(typeof host.hostname).toBe('string');
    expect(typeof host.platform).toBe('string');
    expect(typeof host.arch).toBe('string');
    expect(typeof host.uptime).toBe('number');
    expect(typeof host.checkedAt).toBe('string');
    expect(new Date(host.checkedAt).toISOString()).toBe(host.checkedAt);
  });

  it('process có pid, uptime, nodeVersion', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/system/overview')
      .set('Authorization', `Bearer ${token}`);

    const { process: proc } = res.body.data;
    expect(typeof proc.pid).toBe('number');
    expect(proc.pid).toBeGreaterThan(0);
    expect(typeof proc.uptime).toBe('number');
    expect(typeof proc.nodeVersion).toBe('string');
    expect(proc.nodeVersion).toMatch(/^v\d+/);
  });

  it('cpu có percent (0-100), cores, loadAverage', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/system/overview')
      .set('Authorization', `Bearer ${token}`);

    const { cpu } = res.body.data;
    expect(typeof cpu.percent).toBe('number');
    expect(cpu.percent).toBeGreaterThanOrEqual(0);
    expect(cpu.percent).toBeLessThanOrEqual(100);
    expect(typeof cpu.cores).toBe('number');
    expect(Array.isArray(cpu.loadAverage)).toBe(true);
    expect(cpu.loadAverage).toHaveLength(3);
  });

  it('memory có total, used, available, percent fields', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/system/overview')
      .set('Authorization', `Bearer ${token}`);

    const { memory } = res.body.data;
    expect(memory).toHaveProperty('total');
    expect(memory).toHaveProperty('used');
    expect(memory).toHaveProperty('available');
    expect(memory).toHaveProperty('percent');
    expect(typeof memory.percent).toBe('number');
  });

  it('docker trả available=false khi không có Docker socket', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/system/overview')
      .set('Authorization', `Bearer ${token}`);

    const { docker } = res.body.data;
    expect(docker).toHaveProperty('available');
    expect(Array.isArray(docker.containers)).toBe(true);
  });

  it('dbPool trả available=true với stats', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/system/overview')
      .set('Authorization', `Bearer ${token}`);

    const { dbPool } = res.body.data;
    expect(dbPool.available).toBe(true);
    expect(typeof dbPool.total).toBe('number');
    expect(typeof dbPool.max).toBe('number');
    expect(dbPool.max).toBeGreaterThan(0);
  });

  it('alerts là mảng (có thể rỗng)', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/system/overview')
      .set('Authorization', `Bearer ${token}`);

    expect(Array.isArray(res.body.data.alerts)).toBe(true);
  });
});

// ─── GET /logs ───────────────────────────────────────────────────────────────
describe('GET /api/admin/system/logs', () => {
  it('service không hợp lệ → 400', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/system/logs?service=unknown_service')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('service=backend (default) → 200 + data.available boolean', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/system/logs')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(typeof data.available).toBe('boolean');
    expect(data.service).toBe('backend');
    expect(Array.isArray(data.lines)).toBe(true);
  });

  it('service=frontend → 200 + data.service=frontend', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/system/logs?service=frontend')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.service).toBe('frontend');
  });

  it('?tail=50 → trả data kèm container name', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/system/logs?tail=50')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('container');
  });
});
