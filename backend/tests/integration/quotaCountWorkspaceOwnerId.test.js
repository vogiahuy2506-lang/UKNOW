import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import * as dbHelpers from './helpers/db.js';
import {
  countEmailSentToday,
  countZaloSentToday,
  countEmailSentInCycle,
  countZaloSentInCycle,
  countCombinedSentInCycle,
  _clearQuotaCache,
} from '../../src/utils/userSendLimit.util.js';
import {
  countEmailSentTodayWithLedger,
  countZaloSentTodayWithLedger,
  countEmailSentInCycleWithLedger,
  countZaloSentInCycleWithLedger,
  countEmployeeSentTodayWithLedger,
  countEmployeeSentInCycleWithLedger,
} from '../../src/repositories/sendQuota.repository.js';

describe('Việc 3 — Chuyển phép đếm hạn mức sang workspace_owner_id (Bịt lỗ xoá campaign)', () => {
  let ownerUser;
  let staffUser;
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  const cycleStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const cycleEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));

  beforeAll(async () => {
    // DB ready
  });

  afterAll(async () => {
    await db.pool.end();
  });

  beforeEach(async () => {
    await dbHelpers.truncateAll();
    _clearQuotaCache();
    ownerUser = await dbHelpers.createUser({ username: `owner_${Date.now()}` });
    staffUser = await dbHelpers.createUser({ username: `staff_${Date.now()}` });
  });

  describe('1. Hạn mức GÓI Email — Ngày & Kỳ', () => {
    it('Form 1: Gói x Email x Ngày — xoá campaign số đã dùng KHÔNG đổi', async () => {
      // 1. Tạo campaign thuộc ownerUser
      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, status, campaign_type)
         VALUES ($1, $1, 'Campaign Email Day', 'active', 'email') RETURNING id`,
        [ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      // 2. Tạo 1 email message gửi thành công
      await db.query(
        `INSERT INTO email_messages (id_campaign, workspace_owner_id, recipient_email, sender_email, subject, status, is_preview, sent_at)
         VALUES ($1, $2, 'cust@example.com', 'sender@example.com', 'Sub', 'sent', false, NOW())`,
        [campaignId, ownerUser.id]
      );

      // 3. Đọc trước khi xoá campaign
      _clearQuotaCache();
      const beforeLegacy = await countEmailSentToday(ownerUser.id);
      const beforeLedger = await countEmailSentTodayWithLedger(db, ownerUser.id, dayStart, dayEnd);
      expect(beforeLegacy).toBe(1);
      expect(beforeLedger).toBe(1);

      // 4. Xoá campaign (hard delete) -> email_messages.id_campaign thành NULL (SET NULL)
      await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);

      // 5. Đọc lại sau khi xoá campaign
      _clearQuotaCache();
      const afterLegacy = await countEmailSentToday(ownerUser.id);
      const afterLedger = await countEmailSentTodayWithLedger(db, ownerUser.id, dayStart, dayEnd);

      expect(afterLegacy).toBe(1);
      expect(afterLedger).toBe(1);
    });

    it('Form 2: Gói x Email x Kỳ — xoá campaign số đã dùng KHÔNG đổi', async () => {
      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, status, campaign_type)
         VALUES ($1, $1, 'Campaign Email Cycle', 'active', 'email') RETURNING id`,
        [ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      await db.query(
        `INSERT INTO email_messages (id_campaign, workspace_owner_id, recipient_email, sender_email, subject, status, is_preview, sent_at)
         VALUES ($1, $2, 'cust@example.com', 'sender@example.com', 'Sub', 'sent', false, NOW())`,
        [campaignId, ownerUser.id]
      );

      _clearQuotaCache();
      const beforeLegacy = await countEmailSentInCycle(ownerUser.id, cycleStart, cycleEnd);
      const beforeLedger = await countEmailSentInCycleWithLedger(db, ownerUser.id, cycleStart, cycleEnd);
      expect(beforeLegacy).toBe(1);
      expect(beforeLedger).toBe(1);

      await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);

      _clearQuotaCache();
      const afterLegacy = await countEmailSentInCycle(ownerUser.id, cycleStart, cycleEnd);
      const afterLedger = await countEmailSentInCycleWithLedger(db, ownerUser.id, cycleStart, cycleEnd);

      expect(afterLegacy).toBe(1);
      expect(afterLedger).toBe(1);
    });
  });

  describe('2. Hạn mức GÓI Zalo — Ngày & Kỳ', () => {
    it('Form 3: Gói x Zalo x Ngày — xoá campaign số đã dùng KHÔNG đổi', async () => {
      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, status, campaign_type)
         VALUES ($1, $1, 'Campaign Zalo Day', 'active', 'zalo') RETURNING id`,
        [ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      await db.query(
        `INSERT INTO zalo_messages (id_campaign, workspace_owner_id, channel, status, is_preview, sent_at, tracking_token, tracking_metadata)
         VALUES ($1, $2, 'zalo_personal', 'sent', false, NOW(), 'token_zalo_1', '{"status":"sent"}'::jsonb)`,
        [campaignId, ownerUser.id]
      );

      _clearQuotaCache();
      const beforeLegacy = await countZaloSentToday(ownerUser.id);
      const beforeLedger = await countZaloSentTodayWithLedger(db, ownerUser.id, dayStart, dayEnd);
      expect(beforeLegacy).toBe(1);
      expect(beforeLedger).toBe(1);

      await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);

      _clearQuotaCache();
      const afterLegacy = await countZaloSentToday(ownerUser.id);
      const afterLedger = await countZaloSentTodayWithLedger(db, ownerUser.id, dayStart, dayEnd);

      expect(afterLegacy).toBe(1);
      expect(afterLedger).toBe(1);
    });

    it('Form 4: Gói x Zalo x Kỳ — xoá campaign số đã dùng KHÔNG đổi', async () => {
      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, status, campaign_type)
         VALUES ($1, $1, 'Campaign Zalo Cycle', 'active', 'zalo') RETURNING id`,
        [ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      await db.query(
        `INSERT INTO zalo_messages (id_campaign, workspace_owner_id, channel, status, is_preview, sent_at, tracking_token, tracking_metadata)
         VALUES ($1, $2, 'zalo_personal', 'sent', false, NOW(), 'token_zalo_2', '{"status":"sent"}'::jsonb)`,
        [campaignId, ownerUser.id]
      );

      _clearQuotaCache();
      const beforeLegacy = await countZaloSentInCycle(ownerUser.id, cycleStart, cycleEnd);
      const beforeLedger = await countZaloSentInCycleWithLedger(db, ownerUser.id, cycleStart, cycleEnd);
      expect(beforeLegacy).toBe(1);
      expect(beforeLedger).toBe(1);

      await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);

      _clearQuotaCache();
      const afterLegacy = await countZaloSentInCycle(ownerUser.id, cycleStart, cycleEnd);
      const afterLedger = await countZaloSentInCycleWithLedger(db, ownerUser.id, cycleStart, cycleEnd);

      expect(afterLegacy).toBe(1);
      expect(afterLedger).toBe(1);
    });

    it('Gói Kết hợp Kỳ (countCombinedSentInCycle) — xoá cả 2 campaign số đã dùng KHÔNG đổi', async () => {
      const { rows: cRows1 } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, status, campaign_type)
         VALUES ($1, $1, 'Combined Email', 'active', 'email') RETURNING id`,
        [ownerUser.id]
      );
      const { rows: cRows2 } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, status, campaign_type)
         VALUES ($1, $1, 'Combined Zalo', 'active', 'zalo') RETURNING id`,
        [ownerUser.id]
      );

      await db.query(
        `INSERT INTO email_messages (id_campaign, workspace_owner_id, recipient_email, sender_email, subject, status, is_preview, sent_at)
         VALUES ($1, $2, 'cust@example.com', 'sender@example.com', 'Sub', 'sent', false, NOW())`,
        [cRows1[0].id, ownerUser.id]
      );
      await db.query(
        `INSERT INTO zalo_messages (id_campaign, workspace_owner_id, channel, status, is_preview, sent_at, tracking_token, tracking_metadata)
         VALUES ($1, $2, 'zalo_personal', 'sent', false, NOW(), 'token_zalo_comb', '{"status":"sent"}'::jsonb)`,
        [cRows2[0].id, ownerUser.id]
      );

      _clearQuotaCache();
      const beforeCombined = await countCombinedSentInCycle(ownerUser.id, cycleStart, cycleEnd);
      expect(beforeCombined).toBe(2);

      await db.query('DELETE FROM campaigns WHERE id IN ($1, $2)', [cRows1[0].id, cRows2[0].id]);

      _clearQuotaCache();
      const afterCombined = await countCombinedSentInCycle(ownerUser.id, cycleStart, cycleEnd);
      expect(afterCombined).toBe(2);
    });
  });

  describe('3. Hạn mức NHÂN VIÊN — Ngày & Kỳ', () => {
    it('Form 5: Nhân viên x Email x Ngày — bảo toàn qua reservation khi xoá campaign', async () => {
      const resKey = `res_emp_em_day_${Date.now()}`;
      const fingerprint = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      const { rows: rRows } = await db.query(
        `INSERT INTO send_quota_reservations (
           reservation_key, request_fingerprint, billing_user_id, actor_user_id, channel,
           quantity, is_metered, source_type, status, vn_day_start, vn_day_end, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'email', 1, true, 'campaign', 'consumed', $5, $6, NOW(), NOW())
         RETURNING id`,
        [resKey, fingerprint, ownerUser.id, staffUser.id, dayStart, dayEnd]
      );
      const resId = Number(rRows[0].id);

      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, status, campaign_type)
         VALUES ($1, $2, $1, 'Emp Email Day', 'active', 'email') RETURNING id`,
        [staffUser.id, ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      await db.query(
        `INSERT INTO email_messages (
           id_campaign, workspace_owner_id, recipient_email, sender_email, subject,
           status, is_preview, sent_at, quota_reservation_id
         ) VALUES ($1, $2, 'cust@example.com', 'sender@example.com', 'Sub', 'sent', false, NOW(), $3)`,
        [campaignId, ownerUser.id, resId]
      );

      const before = await countEmployeeSentTodayWithLedger(db, ownerUser.id, staffUser.id, 'email', dayStart, dayEnd);
      expect(before).toBe(1);

      await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);

      const after = await countEmployeeSentTodayWithLedger(db, ownerUser.id, staffUser.id, 'email', dayStart, dayEnd);
      expect(after).toBe(1);
    });

    it('Form 6: Nhân viên x Email x Kỳ — bảo toàn qua reservation khi xoá campaign', async () => {
      const resKey = `res_emp_em_cyc_${Date.now()}`;
      const fingerprint = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      const { rows: rRows } = await db.query(
        `INSERT INTO send_quota_reservations (
           reservation_key, request_fingerprint, billing_user_id, actor_user_id, channel,
           quantity, is_metered, source_type, status, vn_day_start, vn_day_end, cycle_start, cycle_end, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'email', 1, true, 'campaign', 'consumed', $5, $6, $7, $8, NOW(), NOW())
         RETURNING id`,
        [resKey, fingerprint, ownerUser.id, staffUser.id, dayStart, dayEnd, cycleStart, cycleEnd]
      );
      const resId = Number(rRows[0].id);

      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, status, campaign_type)
         VALUES ($1, $2, $1, 'Emp Email Cyc', 'active', 'email') RETURNING id`,
        [staffUser.id, ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      await db.query(
        `INSERT INTO email_messages (
           id_campaign, workspace_owner_id, recipient_email, sender_email, subject,
           status, is_preview, sent_at, quota_reservation_id
         ) VALUES ($1, $2, 'cust@example.com', 'sender@example.com', 'Sub', 'sent', false, NOW(), $3)`,
        [campaignId, ownerUser.id, resId]
      );

      const before = await countEmployeeSentInCycleWithLedger(db, ownerUser.id, staffUser.id, 'email', cycleStart, cycleEnd);
      expect(before).toBe(1);

      await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);

      const after = await countEmployeeSentInCycleWithLedger(db, ownerUser.id, staffUser.id, 'email', cycleStart, cycleEnd);
      expect(after).toBe(1);
    });

    it('Form 7: Nhân viên x Zalo x Ngày — bảo toàn qua reservation khi xoá campaign', async () => {
      const resKey = `res_emp_za_day_${Date.now()}`;
      const fingerprint = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      const { rows: rRows } = await db.query(
        `INSERT INTO send_quota_reservations (
           reservation_key, request_fingerprint, billing_user_id, actor_user_id, channel,
           quantity, is_metered, source_type, status, vn_day_start, vn_day_end, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'zalo', 1, true, 'campaign', 'consumed', $5, $6, NOW(), NOW())
         RETURNING id`,
        [resKey, fingerprint, ownerUser.id, staffUser.id, dayStart, dayEnd]
      );
      const resId = Number(rRows[0].id);

      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, status, campaign_type)
         VALUES ($1, $2, $1, 'Emp Zalo Day', 'active', 'zalo') RETURNING id`,
        [staffUser.id, ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      await db.query(
        `INSERT INTO zalo_messages (
           id_campaign, workspace_owner_id, channel, status, is_preview, sent_at,
           tracking_token, tracking_metadata, quota_reservation_id
         ) VALUES ($1, $2, 'zalo_personal', 'sent', false, NOW(), 'token_emp_za_1', '{"status":"sent"}'::jsonb, $3)`,
        [campaignId, ownerUser.id, resId]
      );

      const before = await countEmployeeSentTodayWithLedger(db, ownerUser.id, staffUser.id, 'zalo', dayStart, dayEnd);
      expect(before).toBe(1);

      await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);

      const after = await countEmployeeSentTodayWithLedger(db, ownerUser.id, staffUser.id, 'zalo', dayStart, dayEnd);
      expect(after).toBe(1);
    });

    it('Form 8: Nhân viên x Zalo x Kỳ — bảo toàn qua reservation khi xoá campaign', async () => {
      const resKey = `res_emp_za_cyc_${Date.now()}`;
      const fingerprint = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      const { rows: rRows } = await db.query(
        `INSERT INTO send_quota_reservations (
           reservation_key, request_fingerprint, billing_user_id, actor_user_id, channel,
           quantity, is_metered, source_type, status, vn_day_start, vn_day_end, cycle_start, cycle_end, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'zalo', 1, true, 'campaign', 'consumed', $5, $6, $7, $8, NOW(), NOW())
         RETURNING id`,
        [resKey, fingerprint, ownerUser.id, staffUser.id, dayStart, dayEnd, cycleStart, cycleEnd]
      );
      const resId = Number(rRows[0].id);

      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, status, campaign_type)
         VALUES ($1, $2, $1, 'Emp Zalo Cyc', 'active', 'zalo') RETURNING id`,
        [staffUser.id, ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      await db.query(
        `INSERT INTO zalo_messages (
           id_campaign, workspace_owner_id, channel, status, is_preview, sent_at,
           tracking_token, tracking_metadata, quota_reservation_id
         ) VALUES ($1, $2, 'zalo_personal', 'sent', false, NOW(), 'token_emp_za_2', '{"status":"sent"}'::jsonb, $3)`,
        [campaignId, ownerUser.id, resId]
      );

      const before = await countEmployeeSentInCycleWithLedger(db, ownerUser.id, staffUser.id, 'zalo', cycleStart, cycleEnd);
      expect(before).toBe(1);

      await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);

      const after = await countEmployeeSentInCycleWithLedger(db, ownerUser.id, staffUser.id, 'zalo', cycleStart, cycleEnd);
      expect(after).toBe(1);
    });
  });

  describe('4. Chống đếm đôi (Anti-double-counting)', () => {
    it('gửi lẻ email (không campaign) được đếm đúng 1 lần, không bị nhân đôi', async () => {
      // Gửi lẻ email trực tiếp lưu vào email_messages (to: direct@example.com)
      await db.query(
        `INSERT INTO email_messages (
           id_campaign, workspace_owner_id, recipient_email, sender_email, subject,
           status, is_preview, sent_at
         ) VALUES (NULL, $1, 'direct@example.com', 'sender@example.com', 'Direct send', 'sent', false, NOW())`,
        [ownerUser.id]
      );

      _clearQuotaCache();
      const dayCount = await countEmailSentToday(ownerUser.id);
      expect(dayCount).toBe(1);

      const ledgerDayCount = await countEmailSentTodayWithLedger(db, ownerUser.id, dayStart, dayEnd);
      expect(ledgerDayCount).toBe(1);
    });

    it('gửi test email qua usage_logs được đếm đúng 1 lần trong số hạng usage_logs', async () => {
      await db.query(
        `INSERT INTO usage_logs (id_user, resource_type, delta, period_start, period_end, metadata, created_at)
         VALUES ($1, 'email_direct_send', 1, NOW(), NOW() + interval '1 month', '{"source":"email_test"}'::jsonb, NOW())`,
        [ownerUser.id]
      );

      _clearQuotaCache();
      const dayCount = await countEmailSentToday(ownerUser.id);
      expect(dayCount).toBe(1);

      const ledgerDayCount = await countEmailSentTodayWithLedger(db, ownerUser.id, dayStart, dayEnd);
      expect(ledgerDayCount).toBe(1);
    });

    it('preview email và preview zalo (is_preview: true) bị loại hoàn toàn, không tính quota', async () => {
      await db.query(
        `INSERT INTO email_messages (
           id_campaign, workspace_owner_id, recipient_email, sender_email, subject,
           status, is_preview, sent_at
         ) VALUES (NULL, $1, 'prev@example.com', 'sender@example.com', 'Preview', 'sent', true, NOW())`,
        [ownerUser.id]
      );
      await db.query(
        `INSERT INTO zalo_messages (
           id_campaign, workspace_owner_id, channel, status, is_preview, sent_at,
           tracking_token, tracking_metadata
         ) VALUES (NULL, $1, 'zalo_personal', 'sent', true, NOW(), 'prev_token_1', '{"status":"sent"}'::jsonb)`,
        [ownerUser.id]
      );

      _clearQuotaCache();
      const emailCount = await countEmailSentToday(ownerUser.id);
      const zaloCount = await countZaloSentToday(ownerUser.id);

      expect(emailCount).toBe(0);
      expect(zaloCount).toBe(0);
    });
  });
});
