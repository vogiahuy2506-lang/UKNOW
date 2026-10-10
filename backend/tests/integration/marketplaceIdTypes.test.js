/**
 * M3-3 (đợt 2) — Marketplace so id lệch kiểu: pg trả BIGINT là chuỗi, id nhân viên (activeContext.ownerId) là Number.
 * Mọi chỗ so `===` / `!==` thẳng giữa hai bên đều sai theo kiểu nhớ.
 */
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';
import marketplaceSellerService from '../../src/services/marketplace/marketplaceSeller.service.js';
import marketplacePurchaseService from '../../src/services/marketplace/marketplacePurchase.service.js';

let app;
beforeAll(() => {
  app = createApp();
});
beforeEach(async () => {
  await truncateAll();
});

const rnd = () => `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

async function loginAs(user) {
  const login = await request(app).post('/api/auth/login').send({ username: user.username, password: user.plainPassword });
  return login.body.data.accessToken;
}

describe('Marketplace — so id đúng kiểu', () => {
  it('chủ đăng landing page của chính mình lên Marketplace -> không bị 403', async () => {
    const owner = await createUser({ username: `mk_owner_${rnd()}` });
    const token = await loginAs(owner);
    const { rows } = await db.query(
      `INSERT INTO landing_pages (id_user, title, slug, html_content) VALUES ($1, 'LP', $2, '<p>hi</p>') RETURNING id`,
      [owner.id, `lp-${rnd()}`]
    );
    const res = await request(app)
      .post('/api/marketplace/landing-pages')
      .set('Authorization', `Bearer ${token}`)
      .send({ landingPageId: rows[0].id, visibility: 'public' });
    expect(res.status).toBe(201);
  });

  it('thống kê listing của chính chủ -> có dữ liệu (không null)', async () => {
    const owner = await createUser({ username: `mk_stat_${rnd()}` });
    const token = await loginAs(owner);
    const { rows } = await db.query(
      `INSERT INTO marketplace_listings (id_user, resource_type, resource_id, title, category, snapshot_data, status, visibility)
       VALUES ($1, 'landing_page', 1, 'L', 'landing_page', '{}'::jsonb, 'published', 'public') RETURNING id`,
      [owner.id]
    ).catch((e) => ({ rows: [], err: e }));
    expect(rows[0]).toBeTruthy();
    const res = await request(app)
      .get(`/api/marketplace/seller/listings/${rows[0].id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('nhân viên (ownerId là Number): xem thống kê listing của công ty -> có dữ liệu; mua listing của chính công ty -> 400', async () => {
    const owner = await createUser({ username: `mk_emp_${rnd()}` });
    const { rows } = await db.query(
      `INSERT INTO marketplace_listings (id_user, resource_type, resource_id, title, category, snapshot_data, status, visibility)
       VALUES ($1, 'landing_page', 1, 'L', 'landing_page', '{}'::jsonb, 'published', 'public') RETURNING id`,
      [owner.id]
    );
    const listingId = Number(rows[0].id);
    const employeeOwnerId = Number(owner.id);
    expect(await marketplaceSellerService.getListingStats(listingId, employeeOwnerId)).not.toBeNull();
    await expect(marketplacePurchaseService.purchase(listingId, employeeOwnerId, {})).rejects.toMatchObject({ status: 400 });
  });
});
