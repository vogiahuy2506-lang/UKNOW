/**
 * lp-track.js gửi click bằng navigator.sendBeacon với body form-urlencoded (Content-Type được CORS
 * cho phép sẵn → không preflight, không cần CORS kèm credentials từ origin landing). Endpoint phải đọc
 * được body đó (express.urlencoded ở app.js) như body JSON cũ.
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

describe('POST /api/public/landing-analytics/click — body beacon của lp-track.js', () => {
  it('form-urlencoded từ origin landing → 201, ghi event click đúng target_url', async () => {
    const target = 'https://example.com/khoa-hoc?utm_source=lp&x=1';
    const res = await request(app)
      .post('/api/public/landing-analytics/click')
      .set('Origin', 'https://some-landing.founderai.biz')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(`slug=l&targetUrl=${encodeURIComponent(target)}`);

    expect(res.status).toBe(201);
    const { rows } = await db.query(
      `SELECT event_type, target_url FROM landing_page_events WHERE landing_page_slug = 'l'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_type: 'click', target_url: target });
  });

  it('JSON (nhánh fetch dự phòng) vẫn nhận như cũ', async () => {
    const res = await request(app)
      .post('/api/public/landing-analytics/click')
      .send({ slug: 'l', targetUrl: 'https://example.com/b' });

    expect(res.status).toBe(201);
  });
});
