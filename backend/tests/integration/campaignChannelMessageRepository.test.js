/**
 * PLAN_TACH_TANG_KENH_GUI_2026-09-27, PR-2 — CRUD + dedupe + FK SET NULL cho
 * campaign_channel_messages / campaignChannelMessage.repository.js.
 *
 * (a) insertQueued → markSent: status sent, sent_at khác NULL, recipient_key đã lower/trim.
 * (b) findExistingSentSameRun: đúng run/node/channel/recipient/step → thấy; khác step hoặc khác
 *     channel → null; status failed → null.
 * (c) findExistingSentCrossRun: run khác trong cửa sổ → thấy; cùng run → null; dòng created_at
 *     25h trước với windowHours=24 → null.
 * (d) xoá campaign_nodes của node → dòng còn, id_node NULL (FK SET NULL); xoá campaign →
 *     id_campaign NULL.
 * (e) CHECK status: insert status 'bogus' → lỗi.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import campaignChannelMessageRepository from '../../src/repositories/campaign/campaignChannelMessage.repository.js';

let user;

beforeEach(async () => {
  await truncateAll();
  user = await createUser({
    email: `pr2_owner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
  });
});

async function insertCampaign({ campaignType = 'email', campaignName = 'PR-2 test' } = {}) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
     VALUES ($1, $1, $2, $3, 'active') RETURNING id`,
    [user.id, campaignName, campaignType]
  );
  return rows[0].id;
}

async function insertNode({ campaignId, subtype = 'send_telegram', nodeType = 'action' } = {}) {
  const { rows } = await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, execution_order)
     VALUES ($1, $2, $3, $3, 1) RETURNING id`,
    [campaignId, nodeType, subtype]
  );
  return rows[0].id;
}

async function insertRun({ campaignId } = {}) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status)
     VALUES ($1, $2, 'manual', 'running') RETURNING id`,
    [campaignId, user.id]
  );
  return rows[0].id;
}

/** Chèn thẳng 1 dòng campaign_channel_messages, KHÔNG qua repo — dùng để dựng fixture có kiểm
 * soát chính xác created_at/status cho test (b)/(c)/(d)/(e). recipientKey chèn thẳng (đã lower/
 * trim tại chỗ gọi) để không phụ thuộc vào normalizeRecipientKey của repo khi dựng fixture. */
async function insertRawMessage({
  campaignId,
  runId,
  nodeId,
  channel = 'telegram',
  recipientKey = 'peer_1',
  stepIndex = 1,
  status = 'sent',
  createdAtSql = 'now()',
}) {
  const { rows } = await db.query(
    `INSERT INTO campaign_channel_messages
       (id_campaign, id_run, id_node, channel, recipient_key, step_index, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, ${createdAtSql}, now())
     RETURNING id`,
    [campaignId, runId, nodeId, channel, recipientKey, stepIndex, status]
  );
  return rows[0].id;
}

describe('PR-2 — campaign_channel_messages CRUD + dedupe + FK SET NULL', () => {
  it('(a) insertQueued → markSent: status sent, sent_at khác NULL, recipient_key đã lower/trim', async () => {
    const campaignId = await insertCampaign();
    const nodeId = await insertNode({ campaignId });
    const runId = await insertRun({ campaignId });

    const id = await campaignChannelMessageRepository.insertQueued({
      campaignId,
      runId,
      nodeId,
      channel: 'telegram',
      recipientKey: '  ABC@x.VN ',
      stepIndex: 1,
      workspaceOwnerId: user.id,
      actorUserId: user.id,
    });

    const { rows: queuedRows } = await db.query(
      'SELECT status, sent_at, recipient_key FROM campaign_channel_messages WHERE id = $1',
      [id]
    );
    expect(queuedRows[0].status).toBe('queued');
    expect(queuedRows[0].sent_at).toBeNull();
    expect(queuedRows[0].recipient_key).toBe('abc@x.vn');

    await campaignChannelMessageRepository.markSent(id, { providerMessageId: 'tg_msg_1' });

    const { rows } = await db.query(
      'SELECT status, sent_at, provider_message_id FROM campaign_channel_messages WHERE id = $1',
      [id]
    );
    expect(rows[0].status).toBe('sent');
    expect(rows[0].sent_at).not.toBeNull();
    expect(rows[0].provider_message_id).toBe('tg_msg_1');
  });

  it('(a2) markFailed: status failed, error_category/error_message được ghi', async () => {
    const campaignId = await insertCampaign();
    const nodeId = await insertNode({ campaignId });
    const runId = await insertRun({ campaignId });
    const id = await campaignChannelMessageRepository.insertQueued({
      campaignId,
      runId,
      nodeId,
      channel: 'telegram',
      recipientKey: 'peer_1',
    });

    await campaignChannelMessageRepository.markFailed(id, {
      errorCategory: 'RATE_LIMIT',
      errorMessage: 'FLOOD_WAIT 30',
    });

    const { rows } = await db.query(
      'SELECT status, error_category, error_message FROM campaign_channel_messages WHERE id = $1',
      [id]
    );
    expect(rows[0].status).toBe('failed');
    expect(rows[0].error_category).toBe('RATE_LIMIT');
    expect(rows[0].error_message).toBe('FLOOD_WAIT 30');
  });

  it('(b) findExistingSentSameRun: đúng khoá → thấy; khác step/channel hoặc status failed → null', async () => {
    const campaignId = await insertCampaign();
    const nodeId = await insertNode({ campaignId });
    const runId = await insertRun({ campaignId });
    const otherNodeId = await insertNode({ campaignId, subtype: 'send_telegram_other' });

    const sentId = await insertRawMessage({
      campaignId,
      runId,
      nodeId,
      channel: 'telegram',
      recipientKey: 'peer_1',
      stepIndex: 1,
      status: 'sent',
    });

    const found = await campaignChannelMessageRepository.findExistingSentSameRun({
      runId,
      nodeId,
      channel: 'telegram',
      recipientKey: 'peer_1',
      stepIndex: 1,
    });
    expect(found).not.toBeNull();
    expect(found.id).toBe(sentId);

    const differentStep = await campaignChannelMessageRepository.findExistingSentSameRun({
      runId,
      nodeId,
      channel: 'telegram',
      recipientKey: 'peer_1',
      stepIndex: 2,
    });
    expect(differentStep).toBeNull();

    const differentChannel = await campaignChannelMessageRepository.findExistingSentSameRun({
      runId,
      nodeId,
      channel: 'whatsapp',
      recipientKey: 'peer_1',
      stepIndex: 1,
    });
    expect(differentChannel).toBeNull();

    // node khác, cùng run/channel/recipient/step — phải null vì id_node luôn nằm trong khoá.
    const differentNode = await campaignChannelMessageRepository.findExistingSentSameRun({
      runId,
      nodeId: otherNodeId,
      channel: 'telegram',
      recipientKey: 'peer_1',
      stepIndex: 1,
    });
    expect(differentNode).toBeNull();

    await db.query(`UPDATE campaign_channel_messages SET status = 'failed' WHERE id = $1`, [sentId]);
    const afterFailed = await campaignChannelMessageRepository.findExistingSentSameRun({
      runId,
      nodeId,
      channel: 'telegram',
      recipientKey: 'peer_1',
      stepIndex: 1,
    });
    expect(afterFailed).toBeNull();
  });

  it('(c) findExistingSentCrossRun: run khác trong cửa sổ → thấy; cùng run → null; 25h trước với windowHours=24 → null', async () => {
    const campaignId = await insertCampaign();
    const nodeId = await insertNode({ campaignId });
    const ownRunId = await insertRun({ campaignId });
    const otherRunId = await insertRun({ campaignId });

    const crossRunSentId = await insertRawMessage({
      campaignId,
      runId: otherRunId,
      nodeId,
      channel: 'telegram',
      recipientKey: 'peer_2',
      stepIndex: 1,
      status: 'sent',
      createdAtSql: "now() - interval '1 hour'",
    });

    const found = await campaignChannelMessageRepository.findExistingSentCrossRun({
      ownRunId,
      campaignId,
      nodeId,
      channel: 'telegram',
      recipientKey: 'peer_2',
      stepIndex: 1,
      windowHours: 24,
    });
    expect(found).not.toBeNull();
    expect(found.id).toBe(crossRunSentId);
    expect(found.id_run).toBe(otherRunId);
    expect(found.sent_at_tz).not.toBeNull();

    // Cùng run (ownRunId truyền trùng id_run của dòng) — phải null (id_run <> $1 loại chính nó).
    const sameRunId = await insertRawMessage({
      campaignId,
      runId: ownRunId,
      nodeId,
      channel: 'telegram',
      recipientKey: 'peer_3',
      stepIndex: 1,
      status: 'sent',
    });
    const sameRunResult = await campaignChannelMessageRepository.findExistingSentCrossRun({
      ownRunId,
      campaignId,
      nodeId,
      channel: 'telegram',
      recipientKey: 'peer_3',
      stepIndex: 1,
      windowHours: 24,
    });
    expect(sameRunResult).toBeNull();
    void sameRunId;

    // Review 27/09: run khác gửi THẤT BẠI cùng khoá — phải null. Lọt điều kiện status='sent' thì
    // một lần hỏng ở lượt trước chặn vĩnh viễn lượt sau gửi lại (đột biến "bỏ status='sent'" từng sống sót).
    await insertRawMessage({
      campaignId,
      runId: otherRunId,
      nodeId,
      channel: 'telegram',
      recipientKey: 'peer_failed',
      stepIndex: 1,
      status: 'failed',
      createdAtSql: "now() - interval '1 hour'",
    });
    const failedCrossRun = await campaignChannelMessageRepository.findExistingSentCrossRun({
      ownRunId,
      campaignId,
      nodeId,
      channel: 'telegram',
      recipientKey: 'peer_failed',
      stepIndex: 1,
      windowHours: 24,
    });
    expect(failedCrossRun).toBeNull();

    // Dòng 25h trước, cửa sổ 24h — ngoài cửa sổ, phải null.
    await insertRawMessage({
      campaignId,
      runId: otherRunId,
      nodeId,
      channel: 'telegram',
      recipientKey: 'peer_4',
      stepIndex: 1,
      status: 'sent',
      createdAtSql: "now() - interval '25 hours'",
    });
    const outsideWindow = await campaignChannelMessageRepository.findExistingSentCrossRun({
      ownRunId,
      campaignId,
      nodeId,
      channel: 'telegram',
      recipientKey: 'peer_4',
      stepIndex: 1,
      windowHours: 24,
    });
    expect(outsideWindow).toBeNull();
  });

  it('(d) xoá campaign_nodes → id_node NULL (FK SET NULL); xoá campaign → id_campaign NULL', async () => {
    const campaignId = await insertCampaign();
    const nodeId = await insertNode({ campaignId });
    const runId = await insertRun({ campaignId });
    const id = await insertRawMessage({ campaignId, runId, nodeId, status: 'sent' });

    await db.query('DELETE FROM campaign_nodes WHERE id = $1', [nodeId]);
    const { rows: afterNodeDelete } = await db.query(
      'SELECT id_node, id_campaign, id_run FROM campaign_channel_messages WHERE id = $1',
      [id]
    );
    expect(afterNodeDelete).toHaveLength(1);
    expect(afterNodeDelete[0].id_node).toBeNull();
    expect(afterNodeDelete[0].id_campaign).toBe(campaignId);

    await db.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);
    const { rows: afterCampaignDelete } = await db.query(
      'SELECT id_node, id_campaign, id_run FROM campaign_channel_messages WHERE id = $1',
      [id]
    );
    expect(afterCampaignDelete).toHaveLength(1);
    expect(afterCampaignDelete[0].id_campaign).toBeNull();
    // campaign_runs không CASCADE theo campaigns trong bootstrap test (FK riêng) — chỉ khẳng định
    // dòng campaign_channel_messages không bị xoá theo, đúng thiết kế ON DELETE SET NULL.
    void runId;
  });

  it('(e) CHECK status: insert status "bogus" → lỗi', async () => {
    const campaignId = await insertCampaign();
    const nodeId = await insertNode({ campaignId });
    const runId = await insertRun({ campaignId });

    await expect(
      db.query(
        `INSERT INTO campaign_channel_messages (id_campaign, id_run, id_node, channel, recipient_key, status)
         VALUES ($1, $2, $3, 'telegram', 'peer_1', 'bogus')`,
        [campaignId, runId, nodeId]
      )
    ).rejects.toThrow(/violates check constraint|campaign_channel_messages_status_check/i);
  });
});
