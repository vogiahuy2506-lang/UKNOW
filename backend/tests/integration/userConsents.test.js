/**
 * Integration test cho PR-N2: Bảng user_consents (Nghị định 330/2026/NĐ-CP).
 *
 * Kiểm tra đầy đủ các yêu cầu nghiệm thu trong plan:
 * 1. Đăng ký thường, tick đủ 3 ô → 3 dòng trong user_consents, đủ version, hash, IP, UA.
 * 2. Đăng ký thường, bỏ 1 ô → Từ chối (400), user_consents 0 dòng.
 * 3. Đăng ký bằng Google (user mới) → 3 dòng y hệt với source 'google_register'.
 * 4. Google đã tồn tại, đăng nhập lại → Không thêm dòng nào.
 * 5. Đăng nhập rồi F5 (GET /api/auth/me) → Consent vẫn đọc được (bắt lỗi resolveUserContext).
 * 6. GET /api/users/profile → Consent vẫn đọc được trong profile.
 * 7. Xoá cứng user có consent → Bị chặn bởi findPurgeBlockers và FK ON DELETE RESTRICT.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createVerificationCode, createUser } from './helpers/db.js';
import { LEGAL_DOCUMENTS } from '../../src/config/legalDocuments.config.js';
import { findPurgeBlockers } from '../../src/repositories/admin/adminMembers.repository.js';
import userConsentRepository from '../../src/repositories/user/userConsent.repository.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

describe('PR-N2: Bảng user_consents & Bốn chốt danh tính', () => {
  describe('Đăng ký thường qua POST /api/auth/register', () => {
    it('Đăng ký thường, tick đủ 3 ô → 3 dòng trong user_consents, đủ document_version, document_hash, ip_address, user_agent', async () => {
      const email = 'consent_full@test.local';
      await createVerificationCode({ email, code: '123456' });

      const res = await request(app)
        .post('/api/auth/register')
        .set('User-Agent', 'Mozilla/5.0 TestBrowser')
        .send({
          username: 'consentfull',
          email,
          password: 'Passw0rd123!',
          fullName: 'Nguyễn Văn Đầy Đủ',
          phone: '0918000001',
          emailVerificationCode: '123456',
          consents: {
            terms: true,
            privacy: true,
            dpa: true,
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const user = res.body.data.user;
      expect(user.consents).toEqual({ terms: true, privacy: true, dpa: true });
      expect(user.hasConsented).toBe(true);

      // Kiểm tra trong database
      const { rows } = await db.query(
        `SELECT id, user_id, purpose, granted, document_version, document_hash, source, ip_address, user_agent
         FROM user_consents
         WHERE user_id = $1
         ORDER BY purpose ASC`,
        [user.id]
      );

      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.purpose)).toEqual(['dpa', 'privacy', 'terms']);
      for (const row of rows) {
        expect(row.granted).toBe(true);
        expect(row.source).toBe('register');
        expect(row.document_version).toBe(LEGAL_DOCUMENTS[row.purpose].version);
        expect(row.document_hash).toBe(LEGAL_DOCUMENTS[row.purpose].hash);
        expect(row.user_agent).toBe('Mozilla/5.0 TestBrowser');
        expect(row.ip_address).toBeDefined();
      }
    });

    it('Đăng ký thường, bỏ 1 ô (privacy = false) → Từ chối 400, user_consents 0 dòng, users 0 dòng', async () => {
      const email = 'consent_miss@test.local';
      await createVerificationCode({ email, code: '123456' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'consentmiss',
          email,
          password: 'Passw0rd123!',
          fullName: 'Thiếu Consent',
          phone: '0918000002',
          emailVerificationCode: '123456',
          consents: {
            terms: true,
            privacy: false, // Bỏ tick ô này
            dpa: true,
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);

      // Không có bản ghi nào được tạo
      const consentCount = await db.query('SELECT COUNT(*)::int AS count FROM user_consents');
      expect(consentCount.rows[0].count).toBe(0);

      const userCount = await db.query('SELECT COUNT(*)::int AS count FROM users WHERE email = $1', [email]);
      expect(userCount.rows[0].count).toBe(0);
    });

    it('Đăng ký thường, thiếu hoàn toàn object consents → Từ chối 400', async () => {
      const email = 'consent_none@test.local';
      await createVerificationCode({ email, code: '123456' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'consentnone',
          email,
          password: 'Passw0rd123!',
          phone: '0918000003',
          emailVerificationCode: '123456',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);

      const consentCount = await db.query('SELECT COUNT(*)::int AS count FROM user_consents');
      expect(consentCount.rows[0].count).toBe(0);
    });
  });

  describe('Đăng ký & Đăng nhập bằng Google qua POST /api/auth/google-login', () => {
    let fetchSpy;

    afterEach(() => {
      fetchSpy?.mockRestore?.();
    });

    it('Đăng ký bằng Google (user mới) → 3 dòng y hệt trong user_consents với source google_register', async () => {
      const googleEmail = 'newgoogleuser@gmail.com';

      // Mock Google OAuth userinfo endpoint
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          email: googleEmail,
          email_verified: true,
          name: 'Google Newbie',
          picture: 'https://example.com/avatar.jpg',
        }),
      });

      const res = await request(app)
        .post('/api/auth/google-login')
        .set('User-Agent', 'Mozilla/5.0 GoogleAgent')
        .send({
          access_token: 'fake_google_access_token_123',
          consents: {
            terms: true,
            privacy: true,
            dpa: true,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const user = res.body.data.user;
      expect(user.email).toBe(googleEmail);
      expect(user.consents).toEqual({ terms: true, privacy: true, dpa: true });
      expect(user.hasConsented).toBe(true);

      // Kiểm tra 3 dòng trong user_consents
      const { rows } = await db.query(
        `SELECT id, user_id, purpose, granted, document_version, document_hash, source, user_agent
         FROM user_consents
         WHERE user_id = $1
         ORDER BY purpose ASC`,
        [user.id]
      );

      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.purpose)).toEqual(['dpa', 'privacy', 'terms']);
      for (const row of rows) {
        expect(row.granted).toBe(true);
        expect(row.source).toBe('google_register');
        expect(row.document_version).toBe(LEGAL_DOCUMENTS[row.purpose].version);
        expect(row.document_hash).toBe(LEGAL_DOCUMENTS[row.purpose].hash);
        expect(row.user_agent).toBe('Mozilla/5.0 GoogleAgent');
      }

      // Ca 4: Google đã tồn tại, đăng nhập lại → KHÔNG thêm dòng nào
      const resSecond = await request(app)
        .post('/api/auth/google-login')
        .send({
          access_token: 'fake_google_access_token_123',
        });

      expect(resSecond.status).toBe(200);
      const consentCountAfter = await db.query(
        'SELECT COUNT(*)::int AS count FROM user_consents WHERE user_id = $1',
        [user.id]
      );
      // Vẫn chính xác 3 dòng, không tăng
      expect(consentCountAfter.rows[0].count).toBe(3);
    });

    it('Google, body KHÔNG có consents → 400, 0 dòng user_consents, KHÔNG tạo user', async () => {
      const googleEmail = 'google_no_consent@test.local';
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          email: googleEmail,
          email_verified: true,
          name: 'No Consent User',
        }),
      });

      const res = await request(app)
        .post('/api/auth/google-login')
        .send({
          access_token: 'token_no_consent',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);

      const userCount = await db.query('SELECT COUNT(*)::int AS count FROM users WHERE email = $1', [googleEmail]);
      expect(userCount.rows[0].count).toBe(0);

      const consentCount = await db.query('SELECT COUNT(*)::int AS count FROM user_consents');
      expect(consentCount.rows[0].count).toBe(0);
    });

    it('Google, consents.dpa = false → 400, 0 dòng user_consents, KHÔNG tạo user', async () => {
      const googleEmail = 'google_false_dpa@test.local';
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          email: googleEmail,
          email_verified: true,
          name: 'False DPA User',
        }),
      });

      const res = await request(app)
        .post('/api/auth/google-login')
        .send({
          access_token: 'token_false_dpa',
          consents: {
            terms: true,
            privacy: true,
            dpa: false,
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);

      const userCount = await db.query('SELECT COUNT(*)::int AS count FROM users WHERE email = $1', [googleEmail]);
      expect(userCount.rows[0].count).toBe(0);

      const consentCount = await db.query('SELECT COUNT(*)::int AS count FROM user_consents');
      expect(consentCount.rows[0].count).toBe(0);
    });

    it('recordConsents ném lỗi giữa chừng → Không user nào được tạo (rollback)', async () => {
      const googleEmail = 'google_rollback@test.local';
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          email: googleEmail,
          email_verified: true,
          name: 'Rollback User',
        }),
      });

      const consentSpy = jest
        .spyOn(userConsentRepository, 'recordConsents')
        .mockRejectedValueOnce(new Error('Simulated DB error during consent logging'));

      try {
        const res = await request(app)
          .post('/api/auth/google-login')
          .send({
            access_token: 'token_rollback',
            consents: {
              terms: true,
              privacy: true,
              dpa: true,
            },
          });

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);

        // Transaction phải rollback: Không có user nào được tạo
        const userCount = await db.query('SELECT COUNT(*)::int AS count FROM users WHERE email = $1', [googleEmail]);
        expect(userCount.rows[0].count).toBe(0);

        const consentCount = await db.query('SELECT COUNT(*)::int AS count FROM user_consents');
        expect(consentCount.rows[0].count).toBe(0);
      } finally {
        consentSpy.mockRestore();
      }
    });
  });

  describe('Đọc consent qua Bốn chốt danh tính (F5 và Profile)', () => {
    it('Đăng nhập rồi F5 (GET /api/auth/me) → Consent vẫn đọc được qua resolveUserContext', async () => {
      // 1. Tạo user qua đăng ký có consent
      const email = 'f5user@test.local';
      await createVerificationCode({ email, code: '123456' });

      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'f5user',
          email,
          password: 'Passw0rd123!',
          phone: '0918000005',
          emailVerificationCode: '123456',
          consents: { terms: true, privacy: true, dpa: true },
        });

      expect(regRes.status).toBe(201);
      const token = regRes.body.data.accessToken;

      // 2. Mô phỏng F5: Client gửi request tới GET /api/auth/me
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      const meUser = meRes.body.data.user;

      expect(meUser.consents).toEqual({
        terms: true,
        privacy: true,
        dpa: true,
      });
      expect(meUser.hasConsented).toBe(true);
    });

    it('GET /api/users/profile → Consent vẫn đọc được đầy đủ', async () => {
      const email = 'profileuser@test.local';
      await createVerificationCode({ email, code: '123456' });

      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'profileuser',
          email,
          password: 'Passw0rd123!',
          phone: '0918000006',
          emailVerificationCode: '123456',
          consents: { terms: true, privacy: true, dpa: true },
        });

      const token = regRes.body.data.accessToken;

      const profileRes = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(profileRes.status).toBe(200);
      expect(profileRes.body.success).toBe(true);
      const profile = profileRes.body.data;

      expect(profile.consents).toEqual({
        terms: true,
        privacy: true,
        dpa: true,
      });
      expect(profile.hasConsented).toBe(true);
    });
  });

  describe('Chặn xoá cứng user (Purge Blockers & FK Restrict)', () => {
    it('Xoá cứng user có consent → Bị chặn bởi findPurgeBlockers và DB RESTRICT', async () => {
      const email = 'purgeuser@test.local';
      await createVerificationCode({ email, code: '123456' });

      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'purgeuser',
          email,
          password: 'Passw0rd123!',
          phone: '0918000007',
          emailVerificationCode: '123456',
          consents: { terms: true, privacy: true, dpa: true },
        });

      const userId = regRes.body.data.user.id;

      // 1. Kiểm tra qua findPurgeBlockers
      const blockers = await findPurgeBlockers(userId);
      expect(blockers).toContain('bằng chứng đồng ý điều khoản/dữ liệu cá nhân (user_consents)');

      // 2. Thử xoá trực tiếp qua câu lệnh SQL DELETE → Bị Postgres chặn bằng ON DELETE RESTRICT
      let dbError = null;
      try {
        await db.query('DELETE FROM users WHERE id = $1', [userId]);
      } catch (err) {
        dbError = err;
      }
      expect(dbError).toBeDefined();
      expect(['23001', '23503']).toContain(dbError.code);
    });
  });
});
