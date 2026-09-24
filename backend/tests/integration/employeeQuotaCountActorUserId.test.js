import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import * as dbHelpers from './helpers/db.js';
import {
  countEmployeeEmailSentToday,
  countEmployeeEmailSentThisMonth,
  countEmployeeZaloSentToday,
  countEmployeeZaloSentThisMonth,
  _clearQuotaCache,
} from '../../src/utils/userSendLimit.util.js';
import {
  countEmployeeSentTodayWithLedger,
  countEmployeeSentInCycleWithLedger,
} from '../../src/repositories/sendQuota.repository.js';

describe('Việc 4 — Bảo toàn hạn mức nhân viên khi xoá chiến dịch (actor_user_id)', () => {
  let ownerUser;
  let staffUser;
  let otherStaffUser;
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
    otherStaffUser = await dbHelpers.createUser({ username: `other_staff_${Date.now()}` });
  });

  describe('1. 4 hàm nhân viên: gửi → xoá chiến dịch → số đã dùng KHÔNG đổi (không dùng reservation)', () => {
    it('Form 1: countEmployeeEmailSentToday — xoá chiến dịch số đã dùng KHÔNG đổi', async () => {
      // 1. Tạo campaign do nhân viên tạo trong workspace của chủ
      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, status, campaign_type)
         VALUES ($1, $2, $1, 'Emp Email Today Campaign', 'active', 'email') RETURNING id`,
        [staffUser.id, ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      // 2. Gửi 3 email thành công qua campaign đó (quota_reservation_id IS NULL)
      for (let i = 1; i <= 3; i++) {
        await db.query(
          `INSERT INTO email_messages (
             id_campaign, workspace_owner_id, actor_user_id, recipient_email, sender_email, subject,
             status, is_preview, sent_at
           ) VALUES ($1, $2, $3, $4, 'sender@example.com', 'Test Subject', 'sent', false, NOW())`,
          [campaignId, ownerUser.id, staffUser.id, `recipient${i}@example.com`]
        );
      }

      _clearQuotaCache();
      const countBefore = await countEmployeeEmailSentToday(ownerUser.id, staffUser.id);
      expect(countBefore).toBe(3);

      // 3. Xoá chiến dịch -> id_campaign trên email_messages chuyển thành NULL (ON DELETE SET NULL)
      await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);

      // Xác minh id_campaign đã thực sự thành NULL trên email_messages
      const { rows: msgRows } = await db.query('SELECT id, id_campaign, actor_user_id FROM email_messages');
      expect(msgRows.length).toBe(3);
      expect(msgRows.every((r) => r.id_campaign === null)).toBe(true);
      expect(msgRows.every((r) => Number(r.actor_user_id) === Number(staffUser.id))).toBe(true);

      // 4. Số đã dùng của nhân viên KHÔNG ĐỔI
      _clearQuotaCache();
      const countAfter = await countEmployeeEmailSentToday(ownerUser.id, staffUser.id);
      expect(countAfter).toBe(3);

      // Nhân viên khác không bị đếm nhầm
      const countOther = await countEmployeeEmailSentToday(ownerUser.id, otherStaffUser.id);
      expect(countOther).toBe(0);
    });

    it('Form 2: countEmployeeEmailSentThisMonth — xoá chiến dịch số đã dùng KHÔNG đổi (cả nhánh chu kỳ & tháng)', async () => {
      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, status, campaign_type)
         VALUES ($1, $2, $1, 'Emp Email Month Campaign', 'active', 'email') RETURNING id`,
        [staffUser.id, ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      await db.query(
        `INSERT INTO email_messages (
           id_campaign, workspace_owner_id, actor_user_id, recipient_email, sender_email, subject,
           status, is_preview, sent_at
         ) VALUES ($1, $2, $3, 'cust@example.com', 'sender@example.com', 'Sub', 'delivered', false, NOW())`,
        [campaignId, ownerUser.id, staffUser.id]
      );

      _clearQuotaCache();
      const beforeCycle = await countEmployeeEmailSentThisMonth(ownerUser.id, staffUser.id, cycleStart, cycleEnd);
      expect(beforeCycle).toBe(1);

      _clearQuotaCache();
      const beforeMonth = await countEmployeeEmailSentThisMonth(ownerUser.id, staffUser.id);
      expect(beforeMonth).toBe(1);

      await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);

      _clearQuotaCache();
      const afterCycle = await countEmployeeEmailSentThisMonth(ownerUser.id, staffUser.id, cycleStart, cycleEnd);
      expect(afterCycle).toBe(1);

      _clearQuotaCache();
      const afterMonth = await countEmployeeEmailSentThisMonth(ownerUser.id, staffUser.id);
      expect(afterMonth).toBe(1);
    });

    it('Form 3: countEmployeeZaloSentToday — xoá chiến dịch số đã dùng KHÔNG đổi', async () => {
      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, status, campaign_type)
         VALUES ($1, $2, $1, 'Emp Zalo Today Campaign', 'active', 'zalo') RETURNING id`,
        [staffUser.id, ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      // Gửi 2 tin Zalo qua campaign
      for (let i = 1; i <= 2; i++) {
        await db.query(
          `INSERT INTO zalo_messages (
             id_campaign, workspace_owner_id, actor_user_id, channel, status, is_preview, sent_at,
             tracking_token, tracking_metadata
           ) VALUES ($1, $2, $3, 'zalo_personal', 'sent', false, NOW(), $4, '{"status":"sent"}'::jsonb)`,
          [campaignId, ownerUser.id, staffUser.id, `token_emp_zalo_today_${i}`]
        );
      }

      _clearQuotaCache();
      const countBefore = await countEmployeeZaloSentToday(ownerUser.id, staffUser.id);
      expect(countBefore).toBe(2);

      await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);

      // Xác minh id_campaign đã thành NULL và actor_user_id còn nguyên
      const { rows: msgRows } = await db.query('SELECT id, id_campaign, actor_user_id FROM zalo_messages');
      expect(msgRows.length).toBe(2);
      expect(msgRows.every((r) => r.id_campaign === null)).toBe(true);
      expect(msgRows.every((r) => Number(r.actor_user_id) === Number(staffUser.id))).toBe(true);

      _clearQuotaCache();
      const countAfter = await countEmployeeZaloSentToday(ownerUser.id, staffUser.id);
      expect(countAfter).toBe(2);

      const countOther = await countEmployeeZaloSentToday(ownerUser.id, otherStaffUser.id);
      expect(countOther).toBe(0);
    });

    it('Form 4: countEmployeeZaloSentThisMonth — xoá chiến dịch số đã dùng KHÔNG đổi (cả nhánh chu kỳ & tháng)', async () => {
      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, status, campaign_type)
         VALUES ($1, $2, $1, 'Emp Zalo Month Campaign', 'active', 'zalo') RETURNING id`,
        [staffUser.id, ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      await db.query(
        `INSERT INTO zalo_messages (
           id_campaign, workspace_owner_id, actor_user_id, channel, status, is_preview, sent_at,
           tracking_token, tracking_metadata
         ) VALUES ($1, $2, $3, 'zalo_personal', 'sent', false, NOW(), 'token_emp_zalo_month_1', '{"status":"sent"}'::jsonb)`,
        [campaignId, ownerUser.id, staffUser.id]
      );

      _clearQuotaCache();
      const beforeCycle = await countEmployeeZaloSentThisMonth(ownerUser.id, staffUser.id, cycleStart, cycleEnd);
      expect(beforeCycle).toBe(1);

      _clearQuotaCache();
      const beforeMonth = await countEmployeeZaloSentThisMonth(ownerUser.id, staffUser.id);
      expect(beforeMonth).toBe(1);

      await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);

      _clearQuotaCache();
      const afterCycle = await countEmployeeZaloSentThisMonth(ownerUser.id, staffUser.id, cycleStart, cycleEnd);
      expect(afterCycle).toBe(1);

      _clearQuotaCache();
      const afterMonth = await countEmployeeZaloSentThisMonth(ownerUser.id, staffUser.id);
      expect(afterMonth).toBe(1);
    });
  });

  describe('2. Các hàm withLedger trực tiếp từ message (quota_reservation_id IS NULL)', () => {
    it('countEmployeeSentTodayWithLedger (Email) — xoá campaign số đã dùng KHÔNG đổi khi không có reservation', async () => {
      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, status, campaign_type)
         VALUES ($1, $2, $1, 'Emp Email Ledger Day', 'active', 'email') RETURNING id`,
        [staffUser.id, ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      await db.query(
        `INSERT INTO email_messages (
           id_campaign, workspace_owner_id, actor_user_id, recipient_email, sender_email, subject,
           status, is_preview, sent_at, quota_reservation_id
         ) VALUES ($1, $2, $3, 'cust@example.com', 'sender@example.com', 'Sub', 'sent', false, NOW(), NULL)`,
        [campaignId, ownerUser.id, staffUser.id]
      );

      const before = await countEmployeeSentTodayWithLedger(db, ownerUser.id, staffUser.id, 'email', dayStart, dayEnd);
      expect(before).toBe(1);

      await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);

      const after = await countEmployeeSentTodayWithLedger(db, ownerUser.id, staffUser.id, 'email', dayStart, dayEnd);
      expect(after).toBe(1);
    });

    it('countEmployeeSentInCycleWithLedger (Email) — xoá campaign số đã dùng KHÔNG đổi khi không có reservation', async () => {
      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, status, campaign_type)
         VALUES ($1, $2, $1, 'Emp Email Ledger Cyc', 'active', 'email') RETURNING id`,
        [staffUser.id, ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      await db.query(
        `INSERT INTO email_messages (
           id_campaign, workspace_owner_id, actor_user_id, recipient_email, sender_email, subject,
           status, is_preview, sent_at, quota_reservation_id
         ) VALUES ($1, $2, $3, 'cust@example.com', 'sender@example.com', 'Sub', 'sent', false, NOW(), NULL)`,
        [campaignId, ownerUser.id, staffUser.id]
      );

      const before = await countEmployeeSentInCycleWithLedger(db, ownerUser.id, staffUser.id, 'email', cycleStart, cycleEnd);
      expect(before).toBe(1);

      await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);

      const after = await countEmployeeSentInCycleWithLedger(db, ownerUser.id, staffUser.id, 'email', cycleStart, cycleEnd);
      expect(after).toBe(1);
    });

    it('countEmployeeSentTodayWithLedger (Zalo) — xoá campaign số đã dùng KHÔNG đổi khi không có reservation', async () => {
      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, status, campaign_type)
         VALUES ($1, $2, $1, 'Emp Zalo Ledger Day', 'active', 'zalo') RETURNING id`,
        [staffUser.id, ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      await db.query(
        `INSERT INTO zalo_messages (
           id_campaign, workspace_owner_id, actor_user_id, channel, status, is_preview, sent_at,
           tracking_token, tracking_metadata, quota_reservation_id
         ) VALUES ($1, $2, $3, 'zalo_personal', 'sent', false, NOW(), 'token_emp_za_ldg_1', '{"status":"sent"}'::jsonb, NULL)`,
        [campaignId, ownerUser.id, staffUser.id]
      );

      const before = await countEmployeeSentTodayWithLedger(db, ownerUser.id, staffUser.id, 'zalo', dayStart, dayEnd);
      expect(before).toBe(1);

      await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);

      const after = await countEmployeeSentTodayWithLedger(db, ownerUser.id, staffUser.id, 'zalo', dayStart, dayEnd);
      expect(after).toBe(1);
    });

    it('countEmployeeSentInCycleWithLedger (Zalo) — xoá campaign số đã dùng KHÔNG đổi khi không có reservation', async () => {
      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, status, campaign_type)
         VALUES ($1, $2, $1, 'Emp Zalo Ledger Cyc', 'active', 'zalo') RETURNING id`,
        [staffUser.id, ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      await db.query(
        `INSERT INTO zalo_messages (
           id_campaign, workspace_owner_id, actor_user_id, channel, status, is_preview, sent_at,
           tracking_token, tracking_metadata, quota_reservation_id
         ) VALUES ($1, $2, $3, 'zalo_personal', 'sent', false, NOW(), 'token_emp_za_ldg_2', '{"status":"sent"}'::jsonb, NULL)`,
        [campaignId, ownerUser.id, staffUser.id]
      );

      const before = await countEmployeeSentInCycleWithLedger(db, ownerUser.id, staffUser.id, 'zalo', cycleStart, cycleEnd);
      expect(before).toBe(1);

      await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);

      const after = await countEmployeeSentInCycleWithLedger(db, ownerUser.id, staffUser.id, 'zalo', cycleStart, cycleEnd);
      expect(after).toBe(1);
    });
  });

  describe('3. Chốt đối soát & Điểm mù (Blind spot check)', () => {
    it('Chốt đối soát: Với mọi cặp (chủ, nhân viên) có campaign, đếm bằng JOIN cũ bằng đếm bằng cột mới', async () => {
      const { rows: cRows } = await db.query(
        `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, status, campaign_type)
         VALUES ($1, $2, $1, 'Parity Check Campaign', 'active', 'email') RETURNING id`,
        [staffUser.id, ownerUser.id]
      );
      const campaignId = Number(cRows[0].id);

      await db.query(
        `INSERT INTO email_messages (
           id_campaign, workspace_owner_id, actor_user_id, recipient_email, sender_email, subject,
           status, is_preview, sent_at
         ) VALUES ($1, $2, $3, 'parity@example.com', 'sender@example.com', 'Sub', 'sent', false, NOW())`,
        [campaignId, ownerUser.id, staffUser.id]
      );

      // Chạy câu đối soát FULL OUTER JOIN
      const { rows: diffRows } = await db.query(`
        WITH old_counts AS (
          SELECT
            em.workspace_owner_id,
            c.created_by AS actor_user_id,
            COUNT(*) AS cnt_old
          FROM email_messages em
          INNER JOIN campaigns c ON c.id = em.id_campaign
          WHERE em.workspace_owner_id IS NOT NULL
            AND c.created_by IS NOT NULL
          GROUP BY em.workspace_owner_id, c.created_by
        ),
        new_counts AS (
          SELECT
            em.workspace_owner_id,
            em.actor_user_id,
            COUNT(*) AS cnt_new
          FROM email_messages em
          WHERE em.workspace_owner_id IS NOT NULL
            AND em.actor_user_id IS NOT NULL
            AND em.id_campaign IS NOT NULL
          GROUP BY em.workspace_owner_id, em.actor_user_id
        )
        SELECT
          COALESCE(o.workspace_owner_id, n.workspace_owner_id) AS workspace_owner_id,
          COALESCE(o.actor_user_id, n.actor_user_id) AS actor_user_id,
          COALESCE(o.cnt_old, 0) AS cnt_old,
          COALESCE(n.cnt_new, 0) AS cnt_new,
          ABS(COALESCE(o.cnt_old, 0) - COALESCE(n.cnt_new, 0)) AS diff
        FROM old_counts o
        FULL OUTER JOIN new_counts n
          ON o.workspace_owner_id = n.workspace_owner_id
         AND o.actor_user_id = n.actor_user_id
        WHERE COALESCE(o.cnt_old, 0) <> COALESCE(n.cnt_new, 0)
      `);

      expect(diffRows.length).toBe(0);
    });

    it('Điểm mù: kiểm tra số dòng id_campaign IS NULL AND actor_user_id IS NOT NULL', async () => {
      // Dòng gửi qua campaign sau khi xoá campaign: id_campaign IS NULL và actor_user_id IS NOT NULL
      const { rows: emailBlindSpot } = await db.query(`
        SELECT COUNT(*)::int AS cnt
        FROM email_messages
        WHERE workspace_owner_id IS NOT NULL
          AND actor_user_id IS NOT NULL
          AND id_campaign IS NULL
      `);
      expect(Number(emailBlindSpot[0]?.cnt || 0)).toBe(0);
    });
  });
});
