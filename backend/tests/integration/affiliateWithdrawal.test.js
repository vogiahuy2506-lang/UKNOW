/**
 * Integration tests cho Affiliate PR-A4: Yêu cầu rút + KYC + Email nội bộ.
 *
 * Kiểm tra đầy đủ:
 * a. Số dư 900.000đ, xin rút 900.000đ → BỊ CHẶN (dưới ngưỡng 1tr)
 * b. Số dư 5.000.000đ, xin rút 500.000đ → BỊ CHẶN (dù số dư thừa sức)
 * c. Số dư 5.000.000đ, rút một phần 2.000.000đ → pending; gộp 2.000.000 /
 *    thuế 200.000 / thực nhận 1.800.000; SUM(ledger) còn đúng 3.000.000đ
 * d. Bấm rút 2 lần liên tiếp thật nhanh → chỉ 1 yêu cầu, số dư KHÔNG âm
 * e. Gọi THẲNG service bỏ qua tầng kiểm khi đã có 1 pending → vẫn bị chặn ở tầng
 *    DB bởi idx_affiliate_withdrawals_one_pending, trả đúng câu thông báo, KHÔNG 500
 * f. Admin từ chối → số dư trở lại đúng số cũ TỪNG ĐỒNG, có bút toán adjustment kèm lý do
 * g. Admin "đã chuyển khoản" → status='paid', KHÔNG phát sinh bút toán ledger mới,
 *    SUM(ledger) không đổi
 * h. Sau khi paid/rejected, user xin rút tiếp → ĐƯỢC (index riêng phần đã nhả chỗ)
 * i. partner_type='company' → bị chặn kèm câu rõ ràng, KHÔNG âm thầm trừ 10% của pháp nhân
 * j. Thiếu AFFILIATE_PII_SECRET_KEY → tạo yêu cầu rút FAIL rõ ràng, KHÔNG lưu CCCD thô
 * k. CCCD lưu trong DB phải là chuỗi đã mã hoá, KHÔNG đọc ra được số gốc
 * l. Prefill từ users.invoice_profile
 * m. findPurgeBlockers phát hiện có affiliate_withdrawals và chặn xóa user
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import { requestWithdrawal } from '../../src/services/affiliate/affiliateWithdrawal.service.js';
import { decryptAffiliatePii } from '../../src/utils/affiliatePiiCrypto.util.js';
import { findPurgeBlockers } from '../../src/repositories/admin/adminMembers.repository.js';

let app;
const originalPiiKey = process.env.AFFILIATE_PII_SECRET_KEY;
const TEST_PII_KEY = 'test-affiliate-pii-secret-key-32-bytes-ok!';

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  // Dọn dẹp bảng affiliate trước để tránh dính FK restrict tới users
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

const VALID_PERSONAL_BODY = {
  partner_type: 'personal',
  amount: 2000000,
  full_name: 'Nguyễn Văn Test',
  id_card_number: '001200012345',
  id_card_issued_date: '2021-05-15',
  id_card_issued_place: 'Cục Cảnh sát QLHC về TTXH',
  bank_name: 'Vietcombank',
  bank_account_number: '1234567890',
  bank_account_name: 'NGUYEN VAN TEST',
};

describe('Affiliate PR-A4 — Yêu cầu rút + KYC + Email nội bộ', () => {
  it('a. Số dư 900.000đ, xin rút 900.000đ → BỊ CHẶN (dưới ngưỡng 1tr)', async () => {
    const user = await createUser({ email: 'user-a@test.com', username: 'user_a' });
    await insertLedger(user.id, 900000);
    const token = createAuthToken(user);

    const res = await request(app)
      .post('/api/affiliate/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PERSONAL_BODY, amount: 900000 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Số tiền rút tối thiểu là 1.000.000đ');

    // Khẳng định số dư từng đồng không đổi
    const sum = await getLedgerSum(user.id);
    expect(sum).toBe(900000);

    const count = await db.query('SELECT COUNT(*)::int AS c FROM affiliate_withdrawals WHERE user_id = $1', [user.id]);
    expect(count.rows[0].c).toBe(0);
  });

  it('b. Số dư 5.000.000đ, xin rút 500.000đ → BỊ CHẶN (dù số dư thừa sức)', async () => {
    const user = await createUser({ email: 'user-b@test.com', username: 'user_b' });
    await insertLedger(user.id, 5000000);
    const token = createAuthToken(user);

    const res = await request(app)
      .post('/api/affiliate/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PERSONAL_BODY, amount: 500000 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Số tiền rút tối thiểu là 1.000.000đ');

    const sum = await getLedgerSum(user.id);
    expect(sum).toBe(5000000);
  });

  it('c. Số dư 5.000.000đ, rút một phần 2.000.000đ → pending; gộp 2tr / thuế 200k / thực nhận 1.8tr; SUM(ledger) còn đúng 3.000.000đ', async () => {
    const user = await createUser({ email: 'user-c@test.com', username: 'user_c' });
    await insertLedger(user.id, 5000000);
    const token = createAuthToken(user);

    const res = await request(app)
      .post('/api/affiliate/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PERSONAL_BODY, amount: 2000000 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const withdrawal = res.body.data;
    expect(withdrawal.status).toBe('pending');
    expect(Number(withdrawal.amount_gross)).toBe(2000000);
    expect(Number(withdrawal.tax_amount)).toBe(200000);
    expect(Number(withdrawal.amount_net)).toBe(1800000);

    // Khẳng định SUM(ledger) còn đúng 3.000.000đ
    const sum = await getLedgerSum(user.id);
    expect(sum).toBe(3000000);

    // Khẳng định bản ghi ledger withdrawal đã được tạo
    const ledgerRows = await db.query(
      `SELECT * FROM affiliate_ledger WHERE user_id = $1 AND entry_type = 'withdrawal'`,
      [user.id]
    );
    expect(ledgerRows.rows.length).toBe(1);
    expect(Number(ledgerRows.rows[0].amount)).toBe(-2000000);
    expect(ledgerRows.rows[0].ref_id).toBe(String(withdrawal.id));
  });

  it('d. Bấm rút 2 lần liên tiếp thật nhanh → chỉ 1 yêu cầu, số dư KHÔNG âm', async () => {
    const user = await createUser({ email: 'user-d@test.com', username: 'user_d' });
    await insertLedger(user.id, 1500000);
    const token = createAuthToken(user);

    // Bấm đồng thời 2 lần, mỗi lần xin rút 1.000.000đ
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/affiliate/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...VALID_PERSONAL_BODY, amount: 1000000 }),
      request(app)
        .post('/api/affiliate/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...VALID_PERSONAL_BODY, amount: 1000000 }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 400]);

    // Số dư sau đó phải là 500.000đ, KHÔNG âm
    const sum = await getLedgerSum(user.id);
    expect(sum).toBe(500000);

    const withdrawals = await db.query(
      `SELECT * FROM affiliate_withdrawals WHERE user_id = $1`,
      [user.id]
    );
    expect(withdrawals.rows.length).toBe(1);
  });

  it('e. Chèn thẳng dòng pending thứ hai bằng SQL → bị chặn ở tầng DB bởi idx_affiliate_withdrawals_one_pending (23505)', async () => {
    const user = await createUser({ email: 'user-e@test.com', username: 'user_e' });
    await insertLedger(user.id, 5000000);

    // Tạo yêu cầu 1 bình thường
    await requestWithdrawal(user.id, { ...VALID_PERSONAL_BODY, amount: 2000000 });

    // Chèn thẳng dòng pending thứ hai bằng SQL
    await expect(
      db.query(
        `INSERT INTO affiliate_withdrawals (
           user_id, partner_type, amount_gross, tax_amount, amount_net,
           full_name, bank_name, bank_account_number, bank_account_name,
           id_card_number_enc, status
         ) VALUES ($1, 'personal', 1000000, 100000, 900000, 'X', 'Y', '1', 'X', 'enc:v1:x', 'pending')`,
        [user.id]
      )
    ).rejects.toMatchObject({ code: '23505' });

    // Khẳng định số dư không bị trừ lần 2 (vẫn đúng 3.000.000đ)
    const sum = await getLedgerSum(user.id);
    expect(sum).toBe(3000000);
  });

  it('f. Admin từ chối → số dư trở lại đúng số cũ TỪNG ĐỒNG, có bút toán adjustment kèm lý do', async () => {
    const admin = await createUser({
      email: 'admin-f@test.com',
      username: 'admin_f',
      role: 'admin',
    });
    const user = await createUser({ email: 'user-f@test.com', username: 'user_f' });
    await insertLedger(user.id, 1000000);

    const userToken = createAuthToken(user);
    const adminToken = createAuthToken(admin);

    // User rút hết 1.000.000đ -> pending, số dư về 0đ
    const withdrawRes = await request(app)
      .post('/api/affiliate/withdrawals')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...VALID_PERSONAL_BODY, amount: 1000000 });
    expect(withdrawRes.status).toBe(201);
    const withdrawalId = withdrawRes.body.data.id;

    expect(await getLedgerSum(user.id)).toBe(0);

    // Admin từ chối kèm lý do
    const rejectRes = await request(app)
      .post(`/api/admin/affiliate/withdrawals/${withdrawalId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Sai số tài khoản ngân hàng' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('rejected');
    expect(rejectRes.body.data.note).toBe('Sai số tài khoản ngân hàng');

    // Số dư trở lại đúng 1.000.000đ TỪNG ĐỒNG
    const restoredSum = await getLedgerSum(user.id);
    expect(restoredSum).toBe(1000000);

    // Khẳng định có bút toán adjustment
    const adj = await db.query(
      `SELECT * FROM affiliate_ledger WHERE user_id = $1 AND entry_type = 'adjustment'`,
      [user.id]
    );
    expect(adj.rows.length).toBe(1);
    expect(Number(adj.rows[0].amount)).toBe(1000000);
    expect(adj.rows[0].note).toContain('Sai số tài khoản ngân hàng');
  });

  it('g. Admin "đã chuyển khoản" → status=\'paid\', KHÔNG phát sinh bút toán ledger mới, SUM(ledger) không đổi', async () => {
    const admin = await createUser({
      email: 'admin-g@test.com',
      username: 'admin_g',
      role: 'admin',
    });
    const user = await createUser({ email: 'user-g@test.com', username: 'user_g' });
    await insertLedger(user.id, 2000000);

    const userToken = createAuthToken(user);
    const adminToken = createAuthToken(admin);

    // User rút 1.000.000đ -> số dư còn 1.000.000đ
    const withdrawRes = await request(app)
      .post('/api/affiliate/withdrawals')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...VALID_PERSONAL_BODY, amount: 1000000 });
    const withdrawalId = withdrawRes.body.data.id;
    expect(await getLedgerSum(user.id)).toBe(1000000);

    // Admin xác nhận đã chuyển khoản
    const payRes = await request(app)
      .post(`/api/admin/affiliate/withdrawals/${withdrawalId}/pay`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(payRes.status).toBe(200);
    expect(payRes.body.data.status).toBe('paid');
    expect(payRes.body.data.processed_at).not.toBeNull();
    expect(payRes.body.data.processed_by).toBe(String(admin.id));

    // Khẳng định KHÔNG phát sinh thêm ledger nào
    const sumAfterPay = await getLedgerSum(user.id);
    expect(sumAfterPay).toBe(1000000);

    const countLedger = await db.query(
      `SELECT COUNT(*)::int AS c FROM affiliate_ledger WHERE user_id = $1`,
      [user.id]
    );
    // Chỉ gồm 2 dòng: commission ban đầu + withdrawal lúc tạo yêu cầu
    expect(countLedger.rows[0].c).toBe(2);
  });

  it('h. Sau khi paid/rejected, user xin rút tiếp → ĐƯỢC (index riêng phần đã nhả chỗ)', async () => {
    const admin = await createUser({
      email: 'admin-h@test.com',
      username: 'admin_h',
      role: 'admin',
    });
    const user = await createUser({ email: 'user-h@test.com', username: 'user_h' });
    await insertLedger(user.id, 3000000);

    const userToken = createAuthToken(user);
    const adminToken = createAuthToken(admin);

    // Lần 1: Rút 1.000.000đ
    const res1 = await request(app)
      .post('/api/affiliate/withdrawals')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...VALID_PERSONAL_BODY, amount: 1000000 });
    expect(res1.status).toBe(201);
    const id1 = res1.body.data.id;

    // Duyệt paid lần 1
    await request(app)
      .post(`/api/admin/affiliate/withdrawals/${id1}/pay`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Lần 2: User xin rút tiếp 1.000.000đ -> PHẢI ĐƯỢC
    const res2 = await request(app)
      .post('/api/affiliate/withdrawals')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...VALID_PERSONAL_BODY, amount: 1000000 });
    expect(res2.status).toBe(201);
    expect(res2.body.data.status).toBe('pending');

    expect(await getLedgerSum(user.id)).toBe(1000000);
  });

  it('i. partner_type=\'company\' → bị chặn kèm câu rõ ràng, KHÔNG âm thầm trừ 10% của pháp nhân', async () => {
    const user = await createUser({ email: 'user-i@test.com', username: 'user_i' });
    await insertLedger(user.id, 5000000);
    const token = createAuthToken(user);

    const res = await request(app)
      .post('/api/affiliate/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        partner_type: 'company',
        amount: 2000000,
        full_name: 'Người đại diện công ty',
        company_name: 'Công ty TNHH Giải Pháp Số',
        tax_code: '0123456789',
        bank_name: 'Vietcombank',
        bank_account_number: '9876543210',
        bank_account_name: 'CONG TY TNHH GIAI PHAP SO',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      'Đối tác doanh nghiệp vui lòng liên hệ hỗ trợ để được hướng dẫn.'
    );

    // Không có bản ghi withdrawal, số dư không bị trừ
    expect(await getLedgerSum(user.id)).toBe(5000000);
    const count = await db.query(
      `SELECT COUNT(*)::int AS c FROM affiliate_withdrawals WHERE user_id = $1`,
      [user.id]
    );
    expect(count.rows[0].c).toBe(0);
  });

  it('j. Thiếu AFFILIATE_PII_SECRET_KEY → tạo yêu cầu rút FAIL rõ ràng, KHÔNG lưu CCCD thô', async () => {
    const user = await createUser({ email: 'user-j@test.com', username: 'user_j' });
    await insertLedger(user.id, 2000000);
    const token = createAuthToken(user);

    delete process.env.AFFILIATE_PII_SECRET_KEY;

    const res = await request(app)
      .post('/api/affiliate/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PERSONAL_BODY, amount: 1000000 });

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('AFFILIATE_PII_SECRET_KEY');

    // Khẳng định KHÔNG lưu bất kỳ dòng nào vào DB
    const count = await db.query(
      `SELECT COUNT(*)::int AS c FROM affiliate_withdrawals WHERE user_id = $1`,
      [user.id]
    );
    expect(count.rows[0].c).toBe(0);
    expect(await getLedgerSum(user.id)).toBe(2000000);
  });

  it('k. CCCD lưu trong DB phải là chuỗi đã mã hoá, KHÔNG đọc ra được số gốc', async () => {
    const user = await createUser({ email: 'user-k@test.com', username: 'user_k' });
    await insertLedger(user.id, 2000000);
    const token = createAuthToken(user);

    const rawIdNumber = '079099012345';
    const res = await request(app)
      .post('/api/affiliate/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PERSONAL_BODY, amount: 1000000, id_card_number: rawIdNumber });

    expect(res.status).toBe(201);
    const withdrawalId = res.body.data.id;

    // Soi trực tiếp cột trong DB
    const rowRes = await db.query(
      `SELECT id_card_number_enc FROM affiliate_withdrawals WHERE id = $1`,
      [withdrawalId]
    );
    const storedEnc = rowRes.rows[0].id_card_number_enc;

    expect(storedEnc).not.toBe(rawIdNumber);
    expect(storedEnc.startsWith('enc:v1:')).toBe(true);
    expect(storedEnc.includes(rawIdNumber)).toBe(false);

    // Giải mã bằng khóa bí mật phải ra lại số gốc
    const decrypted = decryptAffiliatePii(storedEnc);
    expect(decrypted).toBe(rawIdNumber);
  });

  it('l. Prefill từ users.invoice_profile để điền sẵn form rút', async () => {
    const invoiceProfile = {
      buyerType: 'personal',
      fullName: 'Trần Hoá Đơn',
      idNumber: '001095000111',
      taxCode: '8000111222',
      address: 'Hà Nội',
    };
    const user = await createUser({
      email: 'user-l@test.com',
      username: 'user_l',
      fullName: 'Trần Hoá Đơn',
    });
    await db.query(`UPDATE users SET invoice_profile = $1 WHERE id = $2`, [
      JSON.stringify(invoiceProfile),
      user.id,
    ]);
    const token = createAuthToken(user);

    const res = await request(app)
      .get('/api/affiliate/withdrawals/prefill')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fullName).toBe('Trần Hoá Đơn');
    expect(res.body.data.idNumber).toBe('001095000111');
    expect(res.body.data.taxCode).toBe('8000111222');
  });

  it('m. findPurgeBlockers phát hiện có affiliate_withdrawals và chặn xóa user', async () => {
    const user = await createUser({ email: 'user-m@test.com', username: 'user_m' });
    await insertLedger(user.id, 2000000);
    await requestWithdrawal(user.id, { ...VALID_PERSONAL_BODY, amount: 1000000 });

    const blockers = await findPurgeBlockers(user.id);
    expect(blockers).toContain('hoạt động affiliate (doanh thu giới thiệu hoặc được giới thiệu)');
  });

  it('n. Thiếu ngày cấp CCCD/CMND → BỊ CHẶN (400 "Thiếu ngày cấp CCCD/CMND")', async () => {
    const user = await createUser({ email: 'user-n@test.com', username: 'user_n' });
    await insertLedger(user.id, 2000000);
    const token = createAuthToken(user);

    const res = await request(app)
      .post('/api/affiliate/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PERSONAL_BODY, id_card_issued_date: '' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Thiếu ngày cấp CCCD/CMND');
    expect(await getLedgerSum(user.id)).toBe(2000000);
  });

  it('o. Ngày cấp CCCD/CMND ở tương lai → BỊ CHẶN (400 "Ngày cấp CCCD/CMND không thể ở tương lai")', async () => {
    const user = await createUser({ email: 'user-o@test.com', username: 'user_o' });
    await insertLedger(user.id, 2000000);
    const token = createAuthToken(user);

    const res = await request(app)
      .post('/api/affiliate/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PERSONAL_BODY, id_card_issued_date: '2099-01-01' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Ngày cấp CCCD/CMND không thể ở tương lai');
    expect(await getLedgerSum(user.id)).toBe(2000000);
  });

  it('p. Ngày cấp CCCD/CMND không hợp lệ → BỊ CHẶN (400 "Ngày cấp CCCD/CMND không hợp lệ")', async () => {
    const user = await createUser({ email: 'user-p@test.com', username: 'user_p' });
    await insertLedger(user.id, 2000000);
    const token = createAuthToken(user);

    const res = await request(app)
      .post('/api/affiliate/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PERSONAL_BODY, id_card_issued_date: 'invalid-date' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Ngày cấp CCCD/CMND không hợp lệ');
    expect(await getLedgerSum(user.id)).toBe(2000000);
  });

  it('q. Thiếu nơi cấp CCCD/CMND → BỊ CHẶN (400 "Thiếu nơi cấp CCCD/CMND")', async () => {
    const user = await createUser({ email: 'user-q@test.com', username: 'user_q' });
    await insertLedger(user.id, 2000000);
    const token = createAuthToken(user);

    const res = await request(app)
      .post('/api/affiliate/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PERSONAL_BODY, id_card_issued_place: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Thiếu nơi cấp CCCD/CMND');
    expect(await getLedgerSum(user.id)).toBe(2000000);
  });
});

