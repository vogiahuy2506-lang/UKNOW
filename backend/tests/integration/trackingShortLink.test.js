/**
 * Integration tests cho `/t/:code` — endpoint redirect public,
 * resolve mã ngắn Base62 sang `destination_url`.
 *
 * Phạm vi:
 *   - Code rỗng / chỉ ký tự không hợp lệ → 404.
 *   - Code không tồn tại → 404.
 *   - Code hợp lệ → 302 redirect đến destination_url.
 *   - Case-insensitive fallback (ORDER BY exact match trước).
 *   - Khi có cả exact và lowercase, ưu tiên exact match.
 *   - Strip ký tự đặc biệt (`AbC%def^123` → match `AbCdef123`).
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function insertShortLink({ code, destinationUrl, channel = null }) {
  const { rows } = await db.query(
    `INSERT INTO tracking_short_links (short_code, destination_url, channel) VALUES ($1, $2, $3) RETURNING *`,
    [code, destinationUrl, channel]
  );
  return rows[0];
}

describe('GET /t/:code', () => {
  it('code không tồn tại → 404', async () => {
    const res = await request(app).get('/t/nonexistent123');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false });
  });

  it('code chỉ chứa ký tự đặc biệt (rỗng sau strip) → 404', async () => {
    const res = await request(app).get('/t/%21%40%23');
    expect(res.status).toBe(404);
  });

  it('code hợp lệ → 302 redirect tới destination_url', async () => {
    await insertShortLink({
      code: 'abc123XYZ',
      destinationUrl: 'https://uknow.vn/track/click/token-xyz',
    });

    const res = await request(app).get('/t/abc123XYZ').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://uknow.vn/track/click/token-xyz');
  });

  it('case-insensitive fallback — code lưu lowercase, request UPPERCASE', async () => {
    await insertShortLink({
      code: 'lower42',
      destinationUrl: 'https://uknow.vn/lower',
    });

    const res = await request(app).get('/t/LOWER42').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://uknow.vn/lower');
  });

  it('exact match được ưu tiên hơn lowercase match', async () => {
    await insertShortLink({ code: 'AbCdEf', destinationUrl: 'https://exact.example' });
    await insertShortLink({ code: 'abcdef', destinationUrl: 'https://lowercase.example' });

    const res = await request(app).get('/t/AbCdEf').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://exact.example');
  });

  it('strip ký tự đặc biệt trong code', async () => {
    await insertShortLink({
      code: 'pure123abc',
      destinationUrl: 'https://uknow.vn/pure',
    });

    // Service strip mọi ký tự không phải [0-9a-zA-Z] trước khi query.
    // Express URL-decode `%2B` → `+`, sẽ bị strip → còn `pure123abc`.
    const res = await request(app).get('/t/pure%2B123abc').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://uknow.vn/pure');
  });
});
