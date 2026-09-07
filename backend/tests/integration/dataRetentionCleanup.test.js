/**
 * Integration tests cho PR-N4: Dọn dẹp dữ liệu cũ theo thời hạn lưu trữ & bảo vệ chứng từ kế toán.
 *
 * Kiểm tra các yêu cầu nghiêm ngặt:
 * 1. BẢO VỆ TUYỆT ĐỐI CHỨNG TỪ KẾ TOÁN (10 năm):
 *    - affiliate_ledger, affiliate_periods, affiliate_revenue_events, affiliate_withdrawals,
 *      orders, einvoices, campaign_run_recipient_steps_backup_182:
 *      Dù dữ liệu cũ 5 năm, dọn dẹp KHÔNG BAO GIỜ được xoá các bảng này.
 * 2. KHÁCH HÀNG (customers):
 *    - Khách của user đang hoạt động (active, deleted_at NULL): KHÔNG xoá dù đã 3 năm.
 *    - Khách của user đã xoá nhưng deleted_at NULL (tài khoản xoá trước migration 189): KHÔNG xoá.
 *    - Khách của user xoá gần đây (< 90 ngày): KHÔNG xoá.
 *    - Khách của user đã xoá > 90 ngày: BỊ XOÁ.
 * 3. TIỀM NĂNG (leads):
 *    - Lead cũ > 24 tháng: BỊ XOÁ.
 *    - Lead cũ < 24 tháng của user active: KHÔNG xoá.
 *    - Lead cũ < 24 tháng nhưng workspace owner đã xoá > 90 ngày: BỊ XOÁ.
 *    - Lead của user đã xoá nhưng deleted_at NULL: KHÔNG xoá.
 * 4. LƯỢT CHẠY CHIẾN DỊCH (campaign_runs):
 *    - Run > 24 tháng: BỊ XOÁ (và CASCADE xoá campaign_executions).
 *    - Run < 24 tháng: KHÔNG xoá.
 * 5. SỰ KIỆN LANDING PAGE (landing_page_events):
 *    - Event > 12 tháng: BỊ XOÁ.
 *    - Event < 12 tháng: KHÔNG xoá.
 * 6. FORM LIÊN HỆ (contact_submissions):
 *    - Submission > 24 tháng: BỊ XOÁ.
 *    - Submission < 24 tháng: KHÔNG xoá.
 * 7. FEATURE FLAG:
 *    - DATA_RETENTION_ENABLED=false: không xoá gì, trả kết quả noop.
 * 8. DRY-RUN COUNT & IDEMPOTENCY:
 *    - countRetentionEligibleRows đếm chính xác.
 *    - Lần chạy thứ hai xoá 0 bản ghi, không lỗi.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan } from './helpers/db.js';
import {
  runDataRetentionCleanup,
  countRetentionEligibleRows,
  EXCLUDED_ACCOUNTING_TABLES,
} from '../../src/services/admin/dataRetentionCleanup.service.js';

beforeEach(async () => {
  await truncateAll();
});

describe('PR-N4 — Dọn dẹp dữ liệu lưu trữ & bảo vệ chứng từ kế toán', () => {
  it('1. BẢO VỆ TUYỆT ĐỐI CHỨNG TỪ KẾ TOÁN 5 NĂM TUỔI: orders, einvoices, affiliate_*, backup_182', async () => {
    // Tạo 2 user để tham chiếu
    const referrer = await createUser({ email: 'referrer_acc@test.com', username: 'ref_acc' });
    const buyer = await createUser({ email: 'buyer_acc@test.com', username: 'buyer_acc' });
    const plan = await createPlan({ name: 'Plan Accounting', price: 100000 });

    // Dựng 1 order 5 năm trước
    const orderCode = 9988776655;
    const { rows: orderRows } = await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, payment_method, created_at, updated_at)
       VALUES ($1, $2, 100000, $3, $4, 'success', 'payos', NOW() - INTERVAL '5 years', NOW() - INTERVAL '5 years')
       RETURNING id`,
      [orderCode, plan.id, buyer.email, buyer.id]
    );
    const orderId = orderRows[0].id;

    // Dựng 1 einvoice 5 năm trước
    const { rows: einvoiceRows } = await db.query(
      `INSERT INTO einvoices (order_id, ma_tra_cuu, mtchieu, status, issued_at, created_at)
       VALUES ($1, 'TC_5YR', 'MC_5YR', 'issued', NOW() - INTERVAL '5 years', NOW() - INTERVAL '5 years')
       RETURNING id`,
      [orderId]
    );
    const einvoiceId = einvoiceRows[0].id;

    // Dựng 1 affiliate_revenue_event 5 năm trước
    const { rows: revEventRows } = await db.query(
      `INSERT INTO affiliate_revenue_events (referrer_user_id, buyer_user_id, order_id, amount, month_key, created_at)
       VALUES ($1, $2, $3, 100000, '2021-09', NOW() - INTERVAL '5 years')
       RETURNING id`,
      [referrer.id, buyer.id, orderId]
    );
    const revEventId = revEventRows[0].id;

    // Dựng 1 affiliate_period 5 năm trước
    const { rows: periodRows } = await db.query(
      `INSERT INTO affiliate_periods (referrer_user_id, month_key, gross_revenue, tier_level, rate_percent, commission_amount, closed_at)
       VALUES ($1, '2021-09', 1000000, 1, 10, 100000, NOW() - INTERVAL '5 years')
       RETURNING id`,
      [referrer.id]
    );
    const periodId = periodRows[0].id;

    // Dựng 1 affiliate_ledger 5 năm trước
    const { rows: ledgerRows } = await db.query(
      `INSERT INTO affiliate_ledger (user_id, entry_type, amount, ref_type, ref_id, note, created_at)
       VALUES ($1, 'commission', 100000, 'period', $2, 'Hoa hồng 5 năm trước', NOW() - INTERVAL '5 years')
       RETURNING id`,
      [referrer.id, periodId]
    );
    const ledgerId = ledgerRows[0].id;

    // Dựng 1 affiliate_withdrawal 5 năm trước
    const { rows: withdrawalRows } = await db.query(
      `INSERT INTO affiliate_withdrawals (user_id, partner_type, amount_gross, tax_amount, amount_net, full_name, bank_name, bank_account_number, bank_account_name, requested_at)
       VALUES ($1, 'personal', 100000, 0, 100000, 'Test Ref', 'Vietcombank', '1234567890', 'TEST REF', NOW() - INTERVAL '5 years')
       RETURNING id`,
      [referrer.id]
    );
    const withdrawalId = withdrawalRows[0].id;

    // Dựng 1 dòng sao lưu campaign_run_recipient_steps_backup_182 5 năm trước
    const { rows: backupRows } = await db.query(
      `INSERT INTO campaign_run_recipient_steps_backup_182 (migration_batch_id, source_id, source_row, backed_up_at)
       VALUES (gen_random_uuid(), 9999, '{"test": true}'::jsonb, NOW() - INTERVAL '5 years')
       RETURNING id`
    );
    const backupId = backupRows[0].id;

    // Chạy job dọn dẹp với force: true
    const cleanupResult = await runDataRetentionCleanup({ force: true, batchSize: 50 });
    expect(cleanupResult.enabled).toBe(true);

    // Khẳng định 100% các dòng chứng từ kế toán 5 năm tuổi VẪN CÒN NGUYÊN
    const orderCheck = await db.query('SELECT id FROM orders WHERE id = $1', [orderId]);
    expect(orderCheck.rowCount).toBe(1);

    const einvoiceCheck = await db.query('SELECT id FROM einvoices WHERE id = $1', [einvoiceId]);
    expect(einvoiceCheck.rowCount).toBe(1);

    const revCheck = await db.query('SELECT id FROM affiliate_revenue_events WHERE id = $1', [revEventId]);
    expect(revCheck.rowCount).toBe(1);

    const periodCheck = await db.query('SELECT id FROM affiliate_periods WHERE id = $1', [periodId]);
    expect(periodCheck.rowCount).toBe(1);

    const ledgerCheck = await db.query('SELECT id FROM affiliate_ledger WHERE id = $1', [ledgerId]);
    expect(ledgerCheck.rowCount).toBe(1);

    const withdrawalCheck = await db.query('SELECT id FROM affiliate_withdrawals WHERE id = $1', [withdrawalId]);
    expect(withdrawalCheck.rowCount).toBe(1);

    const backupCheck = await db.query('SELECT id FROM campaign_run_recipient_steps_backup_182 WHERE id = $1', [backupId]);
    expect(backupCheck.rowCount).toBe(1);

    // Kiểm tra danh sách bảng loại trừ trong hằng số
    expect(EXCLUDED_ACCOUNTING_TABLES).toContain('orders');
    expect(EXCLUDED_ACCOUNTING_TABLES).toContain('einvoices');
    expect(EXCLUDED_ACCOUNTING_TABLES).toContain('affiliate_ledger');
    expect(EXCLUDED_ACCOUNTING_TABLES).toContain('affiliate_periods');
    expect(EXCLUDED_ACCOUNTING_TABLES).toContain('affiliate_revenue_events');
    expect(EXCLUDED_ACCOUNTING_TABLES).toContain('affiliate_withdrawals');
    expect(EXCLUDED_ACCOUNTING_TABLES).toContain('campaign_run_recipient_steps_backup_182');
  });

  it('2. KHÁCH HÀNG (customers): chỉ xoá khi chủ tài khoản đã xoá > 90 ngày', async () => {
    // Case A: User active bình thường, khách tạo 3 năm trước -> KHÔNG XOÁ
    const activeUser = await createUser({ email: 'active_cust@test.com', username: 'active_cust' });
    const { rows: custActive } = await db.query(
      `INSERT INTO customers (id_user, email, full_name, created_at, updated_at)
       VALUES ($1, 'cust_active@test.com', 'Khách User Đang Hoạt Động', NOW() - INTERVAL '3 years', NOW() - INTERVAL '3 years')
       RETURNING id`,
      [activeUser.id]
    );

    // Case B: User đã xoá trước migration 189 (deleted_at IS NULL, status = 'deleted') -> KHÔNG XOÁ
    const legacyDeletedUser = await createUser({ email: 'legacy_del@test.com', username: 'legacy_del' });
    await db.query(`UPDATE users SET status = 'deleted', deleted_at = NULL WHERE id = $1`, [legacyDeletedUser.id]);
    const { rows: custLegacy } = await db.query(
      `INSERT INTO customers (id_user, email, full_name, created_at, updated_at)
       VALUES ($1, 'cust_legacy@test.com', 'Khách User Xoá Cũ', NOW() - INTERVAL '2 years', NOW() - INTERVAL '2 years')
       RETURNING id`,
      [legacyDeletedUser.id]
    );

    // Case C: User đã xoá gần đây (30 ngày trước < 90 ngày) -> KHÔNG XOÁ
    const recentDeletedUser = await createUser({ email: 'recent_del@test.com', username: 'recent_del' });
    await db.query(
      `UPDATE users SET status = 'deleted', deleted_at = NOW() - INTERVAL '30 days' WHERE id = $1`,
      [recentDeletedUser.id]
    );
    const { rows: custRecent } = await db.query(
      `INSERT INTO customers (id_user, email, full_name, created_at, updated_at)
       VALUES ($1, 'cust_recent@test.com', 'Khách User Mới Xoá', NOW() - INTERVAL '1 year', NOW() - INTERVAL '1 year')
       RETURNING id`,
      [recentDeletedUser.id]
    );

    // Case D: User đã xoá quá hạn (100 ngày trước > 90 ngày) -> PHẢI XOÁ
    const expiredDeletedUser = await createUser({ email: 'expired_del@test.com', username: 'expired_del' });
    await db.query(
      `UPDATE users SET status = 'deleted', deleted_at = NOW() - INTERVAL '100 days' WHERE id = $1`,
      [expiredDeletedUser.id]
    );
    const { rows: custExpired } = await db.query(
      `INSERT INTO customers (id_user, email, full_name, created_at, updated_at)
       VALUES ($1, 'cust_expired@test.com', 'Khách User Quá Hạn', NOW() - INTERVAL '1 year', NOW() - INTERVAL '1 year')
       RETURNING id`,
      [expiredDeletedUser.id]
    );

    // Chạy dọn dẹp
    const result = await runDataRetentionCleanup({ force: true });
    expect(result.customersDeleted).toBe(1);

    // Verify
    const checkActive = await db.query('SELECT id FROM customers WHERE id = $1', [custActive[0].id]);
    expect(checkActive.rowCount).toBe(1);

    const checkLegacy = await db.query('SELECT id FROM customers WHERE id = $1', [custLegacy[0].id]);
    expect(checkLegacy.rowCount).toBe(1);

    const checkRecent = await db.query('SELECT id FROM customers WHERE id = $1', [custRecent[0].id]);
    expect(checkRecent.rowCount).toBe(1);

    const checkExpired = await db.query('SELECT id FROM customers WHERE id = $1', [custExpired[0].id]);
    expect(checkExpired.rowCount).toBe(0);
  });

  it('3. TIỀM NĂNG (leads): xoá khi > 24 tháng HOẶC owner xoá > 90 ngày', async () => {
    const activeOwner = await createUser({ email: 'lead_owner_act@test.com', username: 'lead_owner_act' });
    const expiredOwner = await createUser({ email: 'lead_owner_exp@test.com', username: 'lead_owner_exp' });
    await db.query(
      `UPDATE users SET status = 'deleted', deleted_at = NOW() - INTERVAL '95 days' WHERE id = $1`,
      [expiredOwner.id]
    );
    const legacyOwner = await createUser({ email: 'lead_owner_leg@test.com', username: 'lead_owner_leg' });
    await db.query(`UPDATE users SET status = 'deleted', deleted_at = NULL WHERE id = $1`, [legacyOwner.id]);

    // Lead 1: > 24 tháng (25 tháng) của active user -> BỊ XOÁ
    const { rows: lead1 } = await db.query(
      `INSERT INTO leads (workspace_owner_id, email, first_name, created_at)
       VALUES ($1, 'lead1@test.com', 'Old Lead', NOW() - INTERVAL '25 months')
       RETURNING id`,
      [activeOwner.id]
    );

    // Lead 2: < 24 tháng (6 tháng) của active user -> KHÔNG XOÁ
    const { rows: lead2 } = await db.query(
      `INSERT INTO leads (workspace_owner_id, email, first_name, created_at)
       VALUES ($1, 'lead2@test.com', 'Fresh Lead Active Owner', NOW() - INTERVAL '6 months')
       RETURNING id`,
      [activeOwner.id]
    );

    // Lead 3: < 24 tháng (6 tháng) của expired owner (> 90 days) -> BỊ XOÁ
    const { rows: lead3 } = await db.query(
      `INSERT INTO leads (workspace_owner_id, email, first_name, created_at)
       VALUES ($1, 'lead3@test.com', 'Fresh Lead Expired Owner', NOW() - INTERVAL '6 months')
       RETURNING id`,
      [expiredOwner.id]
    );

    // Lead 4: < 24 tháng (6 tháng) của legacy deleted owner (deleted_at NULL) -> KHÔNG XOÁ
    const { rows: lead4 } = await db.query(
      `INSERT INTO leads (workspace_owner_id, email, first_name, created_at)
       VALUES ($1, 'lead4@test.com', 'Fresh Lead Legacy Owner', NOW() - INTERVAL '6 months')
       RETURNING id`,
      [legacyOwner.id]
    );

    // Lead 5: public lead không gắn user, > 24 tháng -> BỊ XOÁ
    const { rows: lead5 } = await db.query(
      `INSERT INTO leads (workspace_owner_id, email, first_name, created_at)
       VALUES (NULL, 'lead5_public@test.com', 'Public Old Lead', NOW() - INTERVAL '26 months')
       RETURNING id`
    );

    // Lead 6: public lead không gắn user, < 24 tháng -> KHÔNG XOÁ
    const { rows: lead6 } = await db.query(
      `INSERT INTO leads (workspace_owner_id, email, first_name, created_at)
       VALUES (NULL, 'lead6_public@test.com', 'Public Fresh Lead', NOW() - INTERVAL '12 months')
       RETURNING id`
    );

    const result = await runDataRetentionCleanup({ force: true });
    expect(result.leadsDeleted).toBe(3); // lead1, lead3, lead5

    const check1 = await db.query('SELECT id FROM leads WHERE id = $1', [lead1[0].id]);
    expect(check1.rowCount).toBe(0);

    const check2 = await db.query('SELECT id FROM leads WHERE id = $1', [lead2[0].id]);
    expect(check2.rowCount).toBe(1);

    const check3 = await db.query('SELECT id FROM leads WHERE id = $1', [lead3[0].id]);
    expect(check3.rowCount).toBe(0);

    const check4 = await db.query('SELECT id FROM leads WHERE id = $1', [lead4[0].id]);
    expect(check4.rowCount).toBe(1);

    const check5 = await db.query('SELECT id FROM leads WHERE id = $1', [lead5[0].id]);
    expect(check5.rowCount).toBe(0);

    const check6 = await db.query('SELECT id FROM leads WHERE id = $1', [lead6[0].id]);
    expect(check6.rowCount).toBe(1);
  });

  it('4. CAMPAIGN RUNS & CASCADE: xoá run > 24 tháng và cascade executions, giữ run < 24 tháng', async () => {
    const user = await createUser({ email: 'camp_owner@test.com', username: 'camp_owner' });
    const { rows: camp } = await db.query(
      `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, 'Test Camp', 'active') RETURNING id`,
      [user.id]
    );
    const campaignId = camp[0].id;

    // Run cũ > 24 tháng kèm execution con
    const { rows: oldRun } = await db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, status, created_at, started_at)
       VALUES ($1, $2, 'completed', NOW() - INTERVAL '25 months', NOW() - INTERVAL '25 months')
       RETURNING id`,
      [campaignId, user.id]
    );
    const oldRunId = oldRun[0].id;

    const { rows: execOld } = await db.query(
      `INSERT INTO campaign_executions (id_campaign, id_run, status, action_type, execution_data)
       VALUES ($1, $2, 'success', 'send_email', '{"recipient": "a@test.com"}'::jsonb)
       RETURNING id`,
      [campaignId, oldRunId]
    );
    const execOldId = execOld[0].id;

    // Run mới < 24 tháng
    const { rows: freshRun } = await db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, status, created_at, started_at)
       VALUES ($1, $2, 'completed', NOW() - INTERVAL '6 months', NOW() - INTERVAL '6 months')
       RETURNING id`,
      [campaignId, user.id]
    );
    const freshRunId = freshRun[0].id;

    const result = await runDataRetentionCleanup({ force: true });
    expect(result.campaignRunsDeleted).toBe(1);

    const checkOldRun = await db.query('SELECT id FROM campaign_runs WHERE id = $1', [oldRunId]);
    expect(checkOldRun.rowCount).toBe(0);

    const checkExecOld = await db.query('SELECT id FROM campaign_executions WHERE id = $1', [execOldId]);
    expect(checkExecOld.rowCount).toBe(0); // Bị cascade xoá cùng run

    const checkFreshRun = await db.query('SELECT id FROM campaign_runs WHERE id = $1', [freshRunId]);
    expect(checkFreshRun.rowCount).toBe(1);
  });

  it('5. LANDING PAGE EVENTS & CONTACT SUBMISSIONS: đúng thời hạn 12m và 24m', async () => {
    // Event 1: > 12 tháng (13 tháng) -> XOÁ
    const { rows: evOld } = await db.query(
      `INSERT INTO landing_page_events (event_type, landing_page_slug, created_at)
       VALUES ('view', 'slug-test', NOW() - INTERVAL '13 months')
       RETURNING id`
    );
    // Event 2: < 12 tháng (5 tháng) -> GIỮ
    const { rows: evFresh } = await db.query(
      `INSERT INTO landing_page_events (event_type, landing_page_slug, created_at)
       VALUES ('click', 'slug-test', NOW() - INTERVAL '5 months')
       RETURNING id`
    );

    // Contact 1: > 24 tháng (25 tháng) -> XOÁ
    const { rows: contactOld } = await db.query(
      `INSERT INTO contact_submissions (name, email, created_at, updated_at)
       VALUES ('Old Contact', 'old_contact@test.com', NOW() - INTERVAL '25 months', NOW() - INTERVAL '25 months')
       RETURNING id`
    );
    // Contact 2: < 24 tháng (10 tháng) -> GIỮ
    const { rows: contactFresh } = await db.query(
      `INSERT INTO contact_submissions (name, email, created_at, updated_at)
       VALUES ('Fresh Contact', 'fresh_contact@test.com', NOW() - INTERVAL '10 months', NOW() - INTERVAL '10 months')
       RETURNING id`
    );

    const result = await runDataRetentionCleanup({ force: true });
    expect(result.landingPageEventsDeleted).toBe(1);
    expect(result.contactSubmissionsDeleted).toBe(1);

    const checkEvOld = await db.query('SELECT id FROM landing_page_events WHERE id = $1', [evOld[0].id]);
    expect(checkEvOld.rowCount).toBe(0);
    const checkEvFresh = await db.query('SELECT id FROM landing_page_events WHERE id = $1', [evFresh[0].id]);
    expect(checkEvFresh.rowCount).toBe(1);

    const checkContactOld = await db.query('SELECT id FROM contact_submissions WHERE id = $1', [contactOld[0].id]);
    expect(checkContactOld.rowCount).toBe(0);
    const checkContactFresh = await db.query('SELECT id FROM contact_submissions WHERE id = $1', [contactFresh[0].id]);
    expect(checkContactFresh.rowCount).toBe(1);
  });

  it('6. FEATURE FLAG: DATA_RETENTION_ENABLED=false bỏ qua dọn dẹp', async () => {
    const oldEnv = process.env.DATA_RETENTION_ENABLED;
    process.env.DATA_RETENTION_ENABLED = 'false';

    try {
      // Dựng 1 dòng liên hệ cũ
      const { rows } = await db.query(
        `INSERT INTO contact_submissions (name, email, created_at, updated_at)
         VALUES ('Flag Test', 'flag@test.com', NOW() - INTERVAL '30 months', NOW() - INTERVAL '30 months')
         RETURNING id`
      );
      const contactId = rows[0].id;

      const result = await runDataRetentionCleanup({ force: false });
      expect(result.enabled).toBe(false);
      expect(result.message).toContain('DATA_RETENTION_ENABLED is false');

      const check = await db.query('SELECT id FROM contact_submissions WHERE id = $1', [contactId]);
      expect(check.rowCount).toBe(1); // Không bị xoá
    } finally {
      process.env.DATA_RETENTION_ENABLED = oldEnv;
    }
  });

  it('7. DRY-RUN COUNT & IDEMPOTENCY: đếm chính xác và lần 2 xoá 0 bản ghi', async () => {
    // Dựng 2 event cũ và 1 contact cũ
    await db.query(
      `INSERT INTO landing_page_events (event_type, landing_page_slug, created_at)
       VALUES ('view', 'slug-1', NOW() - INTERVAL '14 months'),
              ('view', 'slug-2', NOW() - INTERVAL '15 months')`
    );
    await db.query(
      `INSERT INTO contact_submissions (name, email, created_at, updated_at)
       VALUES ('Dry Run Test', 'dry@test.com', NOW() - INTERVAL '25 months', NOW() - INTERVAL '25 months')`
    );

    // Kiểm đếm dry-run
    const counts = await countRetentionEligibleRows();
    expect(counts.landingPageEventsEligible).toBe(2);
    expect(counts.contactSubmissionsEligible).toBe(1);
    expect(counts.totalEligible).toBe(3);

    // Chạy dọn dẹp lần 1
    const run1 = await runDataRetentionCleanup({ force: true });
    expect(run1.landingPageEventsDeleted).toBe(2);
    expect(run1.contactSubmissionsDeleted).toBe(1);
    expect(run1.totalDeleted).toBe(3);

    // Chạy dọn dẹp lần 2 (idempotent)
    const run2 = await runDataRetentionCleanup({ force: true });
    expect(run2.totalDeleted).toBe(0);
    expect(run2.customersDeleted).toBe(0);
    expect(run2.leadsDeleted).toBe(0);
    expect(run2.campaignRunsDeleted).toBe(0);
    expect(run2.landingPageEventsDeleted).toBe(0);
    expect(run2.contactSubmissionsDeleted).toBe(0);
  });

  it('8. MIGRATION 190 BACKFILL: user status="deleted" có deleted_at = NULL được cập nhật thành NOW(), và khách hàng được bảo lưu trọn 90 ngày', async () => {
    const user = await createUser({ email: 'backfill_u@test.com', username: 'backfill_u' });
    await db.query(`UPDATE users SET status = 'deleted', deleted_at = NULL WHERE id = $1`, [user.id]);

    const { rows: cust } = await db.query(
      `INSERT INTO customers (id_user, email, full_name, created_at, updated_at)
       VALUES ($1, 'backfill_cust@test.com', 'Khách User Backfill', NOW() - INTERVAL '1 year', NOW() - INTERVAL '1 year')
       RETURNING id`,
      [user.id]
    );

    // Chạy logic backfill của migration 190
    await db.query(`
      UPDATE users
         SET deleted_at = NOW()
       WHERE status = 'deleted' AND deleted_at IS NULL;
    `);

    // Verify deleted_at đã được gán
    const { rows: userAfter } = await db.query('SELECT deleted_at FROM users WHERE id = $1', [user.id]);
    expect(userAfter[0].deleted_at).not.toBeNull();

    // Chạy cleanup: vì mới backfill (NOW() < 90 days), khách hàng KHÔNG bị xoá
    const result = await runDataRetentionCleanup({ force: true });
    expect(result.customersDeleted).toBe(0);

    const checkCust = await db.query('SELECT id FROM customers WHERE id = $1', [cust[0].id]);
    expect(checkCust.rowCount).toBe(1);
  });
});

