/**
 * Integration tests cho Affiliate PR-A5: Giao diện + API Overview + Admin Ledger Adjustment.
 *
 * Yêu cầu nghiệm thu bắt buộc (3d):
 * - Admin ghi adjustment ÂM → SUM(ledger) giảm đúng từng đồng, có dòng note
 * - Adjustment làm số dư âm → BỊ CHẶN 400, SUM(ledger) KHÔNG đổi
 * - note rỗng → 400
 * - user thường gọi endpoint đó → 403
 * Mọi ca có tiền phải khẳng định SUM(amount) TỪNG ĐỒNG, không chỉ khẳng định status.
 *
 * Kiểm tra thêm:
 * - GET /api/affiliate/overview: trả về referralCode, currentBalance, resolveTier,
 *   mục "ĐANG CHỜ ĐỦ ĐIỀU KIỆN" (buyer chưa có phone)
 * - GET /api/admin/affiliate/periods: lọc theo monthKey
 * - adminListWithdrawals: giải mã CCCD gốc qua decryptAffiliatePii
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import { resolveCurrentMonthKey } from '../../src/services/affiliate/affiliateWithdrawal.service.js';

let app;
const originalPiiKey = process.env.AFFILIATE_PII_SECRET_KEY;
const TEST_PII_KEY = 'test-affiliate-pii-secret-key-32-bytes-ok!';

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await db.query(`
    TRUNCATE TABLE
      affiliate_withdrawals,
      affiliate_ledger,
      affiliate_periods,
      affiliate_revenue_events
    CASCADE;
  `);
  await truncateAll();
  process.env.AFFILIATE_PII_SECRET_KEY = TEST_PII_KEY;
});

afterAll(() => {
  if (originalPiiKey !== undefined) {
    process.env.AFFILIATE_PII_SECRET_KEY = originalPiiKey;
  } else {
    delete process.env.AFFILIATE_PII_SECRET_KEY;
  }
});

function createAuthToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role || 'user' },
    process.env.JWT_SECRET || 'test-jwt-secret'
  );
}

async function insertLedger(userId, amount, entryType = 'commission', note = 'Hoa hồng') {
  const { rows } = await db.query(
    `INSERT INTO affiliate_ledger (user_id, entry_type, amount, ref_type, ref_id, note)
     VALUES ($1, $2, $3, 'test', 1, $4)
     RETURNING *`,
    [userId, entryType, amount, note]
  );
  return rows[0];
}

async function getLedgerSum(userId) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM affiliate_ledger WHERE user_id = $1`,
    [userId]
  );
  return Number(rows[0]?.total || 0);
}

describe('Affiliate PR-A5 — Admin Ledger Adjustment & Overview APIs', () => {
  describe('POST /api/admin/affiliate/ledger-adjustment (Yêu cầu bắt buộc)', () => {
    it('Admin ghi adjustment ÂM → SUM(ledger) giảm đúng từng đồng, có dòng note', async () => {
      const admin = await createUser({ email: 'admin_a@test.com', username: 'admin_a', role: 'admin' });
      const partner = await createUser({ email: 'partner_a@test.com', username: 'partner_a', role: 'user' });

      // Ban đầu nạp 2.000.000đ vào ví
      await insertLedger(partner.id, 2000000, 'commission', 'Hoa hồng tháng 08');
      expect(await getLedgerSum(partner.id)).toBe(2000000);

      // Admin ghi adjustment -750.000đ (thu hồi gian lận)
      const adminToken = createAuthToken(admin);
      const res = await request(app)
        .post('/api/admin/affiliate/ledger-adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: partner.id,
          amount: -750000,
          note: 'Thu hồi hoa hồng do tự mua gian lận đơn #999',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.balanceBefore).toBe(2000000);
      expect(res.body.data.balanceAfter).toBe(1250000);

      // Khẳng định SUM(ledger) giảm đúng từng đồng: 2.000.000 - 750.000 = 1.250.000
      const sumAfter = await getLedgerSum(partner.id);
      expect(sumAfter).toBe(1250000);

      // Kiểm tra dòng trong affiliate_ledger
      const { rows: ledgerRows } = await db.query(
        `SELECT * FROM affiliate_ledger WHERE user_id = $1 AND entry_type = 'adjustment' ORDER BY id DESC LIMIT 1`,
        [partner.id]
      );
      expect(ledgerRows.length).toBe(1);
      expect(Number(ledgerRows[0].amount)).toBe(-750000);
      expect(ledgerRows[0].ref_type).toBe('admin');
      expect(String(ledgerRows[0].ref_id)).toBe(String(admin.id));
      expect(ledgerRows[0].note).toBe('Thu hồi hoa hồng do tự mua gian lận đơn #999');
    });

    it('Admin ghi adjustment DƯƠNG → SUM(ledger) tăng đúng từng đồng', async () => {
      const admin = await createUser({ email: 'admin_b@test.com', username: 'admin_b', role: 'admin' });
      const partner = await createUser({ email: 'partner_b@test.com', username: 'partner_b', role: 'user' });

      await insertLedger(partner.id, 1000000, 'commission', 'Hoa hồng cũ');
      expect(await getLedgerSum(partner.id)).toBe(1000000);

      const adminToken = createAuthToken(admin);
      const res = await request(app)
        .post('/api/admin/affiliate/ledger-adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: partner.id,
          amount: 500000,
          note: 'Bù hoa hồng phát sinh đối soát',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.balanceBefore).toBe(1000000);
      expect(res.body.data.balanceAfter).toBe(1500000);
      expect(await getLedgerSum(partner.id)).toBe(1500000);
    });

    it('Adjustment làm số dư âm → BỊ CHẶN 400, SUM(ledger) KHÔNG đổi', async () => {
      const admin = await createUser({ email: 'admin_c@test.com', username: 'admin_c', role: 'admin' });
      const partner = await createUser({ email: 'partner_c@test.com', username: 'partner_c', role: 'user' });

      // Số dư 500.000đ
      await insertLedger(partner.id, 500000, 'commission', 'Hoa hồng');
      expect(await getLedgerSum(partner.id)).toBe(500000);

      // Admin cố trừ 600.000đ (làm số dư thành -100.000đ)
      const adminToken = createAuthToken(admin);
      const res = await request(app)
        .post('/api/admin/affiliate/ledger-adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: partner.id,
          amount: -600000,
          note: 'Trừ quá tay',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INSUFFICIENT_AFFILIATE_BALANCE');
      expect(res.body.currentBalance).toBe(500000);

      // Khẳng định SUM(ledger) giữ nguyên từng đồng: đúng 500.000đ
      expect(await getLedgerSum(partner.id)).toBe(500000);
    });

    it('note rỗng hoặc chỉ khoảng trắng → BỊ CHẶN 400, SUM(ledger) KHÔNG đổi', async () => {
      const admin = await createUser({ email: 'admin_d@test.com', username: 'admin_d', role: 'admin' });
      const partner = await createUser({ email: 'partner_d@test.com', username: 'partner_d', role: 'user' });

      await insertLedger(partner.id, 1000000, 'commission', 'Gốc');
      const adminToken = createAuthToken(admin);

      // Test note rỗng
      const res1 = await request(app)
        .post('/api/admin/affiliate/ledger-adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: partner.id,
          amount: -100000,
          note: '',
        });

      expect(res1.status).toBe(400);
      expect(res1.body.message).toContain('lý do');
      expect(await getLedgerSum(partner.id)).toBe(1000000);

      // Test note chỉ có khoảng trắng
      const res2 = await request(app)
        .post('/api/admin/affiliate/ledger-adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: partner.id,
          amount: -100000,
          note: '    ',
        });

      expect(res2.status).toBe(400);
      expect(await getLedgerSum(partner.id)).toBe(1000000);
    });

    it('user thường gọi endpoint đó → BỊ CHẶN 403', async () => {
      const regularUser = await createUser({ email: 'regular_user@test.com', username: 'reg_user', role: 'user' });
      const partner = await createUser({ email: 'partner_reg@test.com', username: 'partner_reg', role: 'user' });

      const userToken = createAuthToken(regularUser);
      const res = await request(app)
        .post('/api/admin/affiliate/ledger-adjustment')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          userId: partner.id,
          amount: 100000,
          note: 'Hack ví',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/affiliate/overview (Trang đối tác)', () => {
    it('Trả về đủ thông tin: referralCode, link, currentBalance, resolveTier, và MỤC ĐANG CHỜ ĐỦ ĐIỀU KIỆN', async () => {
      const partner = await createUser({
        email: 'seller_ov@test.com',
        username: 'seller_ov',
        role: 'user',
        full_name: 'Đại Lý VIP',
        phone: '0901234567',
      });

      // Tạo referral_code cho partner
      await db.query(`UPDATE users SET referral_code = 'VIP888' WHERE id = $1`, [partner.id]);

      // Nạp số dư ví
      await insertLedger(partner.id, 2500000, 'commission', 'Hoa hồng tháng trước');

      // Tạo buyer ĐÃ CÓ SĐT và event tháng này
      const buyerWithPhone = await createUser({
        email: 'buyer1_ov@test.com',
        username: 'buyer1_ov',
        role: 'user',
        phone: '0988776655',
      });
      const currentMonthKey = resolveCurrentMonthKey();

      // Giả lập order và event qualified
      const { rows: order1 } = await db.query(
        `INSERT INTO orders (order_code, user_id, amount, status, created_at)
         VALUES (1700000001, $1, 15000000, 'success', NOW()) RETURNING id`,
        [buyerWithPhone.id]
      );
      await db.query(
        `INSERT INTO affiliate_revenue_events (referrer_user_id, buyer_user_id, order_id, amount, month_key)
         VALUES ($1, $2, $3, 15000000, $4)`,
        [partner.id, buyerWithPhone.id, order1[0].id, currentMonthKey]
      );

      // Tạo buyer CHƯA CÓ SĐT (phone NULL) và event tháng này -> ĐANG CHỜ ĐỦ ĐIỀU KIỆN
      const buyerNoPhone = await createUser({
        email: 'buyer2_ov@test.com',
        username: 'buyer2_ov',
        role: 'user',
        phone: null,
      });
      const { rows: order2 } = await db.query(
        `INSERT INTO orders (order_code, user_id, amount, status, created_at)
         VALUES (1700000002, $1, 3000000, 'success', NOW()) RETURNING id`,
        [buyerNoPhone.id]
      );
      await db.query(
        `INSERT INTO affiliate_revenue_events (referrer_user_id, buyer_user_id, order_id, amount, month_key)
         VALUES ($1, $2, $3, 3000000, $4)`,
        [partner.id, buyerNoPhone.id, order2[0].id, currentMonthKey]
      );

      // Gọi endpoint overview
      const partnerToken = createAuthToken(partner);
      const res = await request(app)
        .get('/api/affiliate/overview')
        .set('Authorization', `Bearer ${partnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.referralCode).toBe('VIP888');
      expect(data.referralLink).toBe('https://founderai.biz/register?ref=VIP888');
      expect(data.currentBalance).toBe(2500000);

      // Doanh thu tháng hiện tại chỉ tính buyer có phone: 15.000.000đ
      expect(data.currentMonthGross).toBe(15000000);
      expect(data.currentTier.level).toBe(2); // 10tr - 20tr là bậc 2 (15%)
      expect(data.currentTier.ratePercent).toBe(15);
      expect(data.nextTier.level).toBe(3);
      expect(data.amountToNextTier).toBe(5000000); // 20tr - 15tr = 5tr

      // 🔴 BẮT BUỘC: Mục "ĐANG CHỜ ĐỦ ĐIỀU KIỆN"
      expect(data.pendingApproval.pendingBuyersCount).toBe(1);
      expect(data.pendingApproval.pendingRevenue).toBe(3000000);
      expect(data.pendingApproval.events.length).toBe(1);
      expect(data.pendingApproval.events[0].buyerEmail).toBe('buyer2_ov@test.com');
      expect(data.pendingApproval.events[0].amount).toBe(3000000);
    });
  });

  describe('GET /api/admin/affiliate/periods & available-months', () => {
    it('Admin lấy được danh sách theo monthKey và danh sách tháng có sẵn', async () => {
      const admin = await createUser({ email: 'admin_periods@test.com', username: 'admin_periods', role: 'admin' });
      const partner = await createUser({ email: 'partner_p@test.com', username: 'partner_p', role: 'user' });

      await db.query(
        `INSERT INTO affiliate_periods (referrer_user_id, month_key, gross_revenue, tier_level, rate_percent, commission_amount)
         VALUES ($1, '2026-08', 25000000, 3, 20, 5000000)`,
        [partner.id]
      );

      const adminToken = createAuthToken(admin);

      // Available months
      const monthsRes = await request(app)
        .get('/api/admin/affiliate/available-months')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(monthsRes.status).toBe(200);
      expect(monthsRes.body.data).toContain('2026-08');

      // Periods filter by monthKey
      const periodsRes = await request(app)
        .get('/api/admin/affiliate/periods?monthKey=2026-08')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(periodsRes.status).toBe(200);
      expect(periodsRes.body.data.length).toBe(1);
      expect(periodsRes.body.data[0].monthKey).toBe('2026-08');
      expect(periodsRes.body.data[0].commissionAmount).toBe(5000000);
      expect(periodsRes.body.data[0].userEmail).toBe('partner_p@test.com');
    });
  });

  describe('Admin List Withdrawals giải mã CCCD', () => {
    it('Admin thấy số CCCD thật được giải mã từ id_card_number_enc', async () => {
      const admin = await createUser({ email: 'admin_kyc@test.com', username: 'admin_kyc', role: 'admin' });
      const partner = await createUser({ email: 'partner_kyc@test.com', username: 'partner_kyc', role: 'user' });

      await insertLedger(partner.id, 5000000, 'commission');

      // Tạo withdrawal request qua API A4
      const partnerToken = createAuthToken(partner);
      const reqRes = await request(app)
        .post('/api/affiliate/withdrawals')
        .set('Authorization', `Bearer ${partnerToken}`)
        .send({
          partner_type: 'personal',
          amount: 2000000,
          full_name: 'Trần Văn KYC',
          id_card_number: '079199001234',
          id_card_issued_date: '2022-01-10',
          id_card_issued_place: 'Cục CS QLHC về TTXH',
          bank_name: 'Techcombank',
          bank_account_number: '987654321',
          bank_account_name: 'TRAN VAN KYC',
        });
      expect(reqRes.status).toBe(201);

      // Admin xem danh sách rút
      const adminToken = createAuthToken(admin);
      const listRes = await request(app)
        .get('/api/admin/affiliate/withdrawals')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

      const item = listRes.body.data.find((w) => w.full_name === 'Trần Văn KYC');
      expect(item).toBeDefined();
      // CCCD giải mã hiển thị cho admin
      expect(item.id_card_number).toBe('079199001234');
      // id_card_number_enc vẫn là chuỗi mã hóa
      expect(item.id_card_number_enc).toContain('enc:v1:');
    });
  });
});
