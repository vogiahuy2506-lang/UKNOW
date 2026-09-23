import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import * as dbHelpers from './helpers/db.js';
import campaignCrudService from '../../src/services/campaign/campaignCrud.service.js';

describe('Việc 1 — zalo_messages FK ON DELETE SET NULL khi xoá chiến dịch', () => {
  let user;

  beforeAll(async () => {
    // DB connection is ready
  });

  afterAll(async () => {
    await db.pool.end();
  });

  beforeEach(async () => {
    await dbHelpers.truncateAll();
    user = await dbHelpers.createUser();
  });

  it('xác nhận ràng buộc FK trong PostgreSQL là SET NULL (confdeltype = n)', async () => {
    const { rows } = await db.query(`
      SELECT conname, confdeltype
      FROM pg_constraint
      WHERE conname = 'zalo_messages_campaign_fkey'
    `);
    expect(rows.length).toBe(1);
    expect(rows[0].conname).toBe('zalo_messages_campaign_fkey');
    // 'n' = SET NULL, 'c' = CASCADE, 'a' = NO ACTION, 'r' = RESTRICT
    expect(rows[0].confdeltype).toBe('n');
  });

  it('xoá campaign bằng DELETE SQL: zalo_messages vẫn còn và id_campaign thành NULL', async () => {
    // 1. Tạo campaign
    const campaignRes = await db.query(
      `INSERT INTO campaigns (id_user, campaign_name, status, campaign_type)
       VALUES ($1, 'Test Zalo Campaign', 'draft', 'zalo')
       RETURNING id`,
      [user.id]
    );
    const campaignId = Number(campaignRes.rows[0].id);

    // 2. Chèn 1 dòng zalo_messages gắn với id_campaign
    const msgRes = await db.query(
      `INSERT INTO zalo_messages (id_campaign, channel, status, recipient_type, recipient_value, sent_at, created_at, updated_at)
       VALUES ($1, 'zalo_personal', 'sent', 'phone', '0912345678', NOW(), NOW(), NOW())
       RETURNING id, id_campaign`,
      [campaignId]
    );
    const zaloMsgId = Number(msgRes.rows[0].id);
    expect(Number(msgRes.rows[0].id_campaign)).toBe(campaignId);

    // 3. Xoá campaign
    await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);

    // 4. Khẳng định dòng tin nhắn vẫn tồn tại và id_campaign đã chuyển thành NULL
    const checkRes = await db.query('SELECT id, id_campaign, status FROM zalo_messages WHERE id = $1', [zaloMsgId]);
    expect(checkRes.rows.length).toBe(1);
    expect(checkRes.rows[0].id_campaign).toBeNull();
    expect(checkRes.rows[0].status).toBe('sent');
  });

  it('xoá campaign qua campaignCrudService.deleteCampaign: zalo_messages không bị mất', async () => {
    // 1. Tạo campaign
    const campaignRes = await db.query(
      `INSERT INTO campaigns (id_user, campaign_name, status, campaign_type)
       VALUES ($1, 'Service Delete Test', 'draft', 'zalo')
       RETURNING id`,
      [user.id]
    );
    const campaignId = Number(campaignRes.rows[0].id);

    // 2. Chèn 1 dòng zalo_messages
    const msgRes = await db.query(
      `INSERT INTO zalo_messages (id_campaign, channel, status, recipient_type, recipient_value, sent_at, created_at, updated_at)
       VALUES ($1, 'zalo_personal', 'sent', 'phone', '0987654321', NOW(), NOW(), NOW())
       RETURNING id`,
      [campaignId]
    );
    const zaloMsgId = Number(msgRes.rows[0].id);

    // 3. Gọi service deleteCampaign
    await campaignCrudService.deleteCampaign({
      campaignId,
      authUser: user,
      userId: user.id,
      roleCode: 'user',
      workspaceOwnerId: user.id,
    });

    // 4. Khẳng định dòng tin nhắn vẫn còn và id_campaign IS NULL
    const checkRes = await db.query('SELECT id, id_campaign FROM zalo_messages WHERE id = $1', [zaloMsgId]);
    expect(checkRes.rows.length).toBe(1);
    expect(checkRes.rows[0].id_campaign).toBeNull();
  });
});
