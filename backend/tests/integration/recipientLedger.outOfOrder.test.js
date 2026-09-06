import { beforeEach, describe, expect, it } from '@jest/globals';
import db from '../../src/config/database.js';
import recipientLedgerRepository from '../../src/repositories/campaign/recipientLedger.repository.js';
import { createUser, truncateAll } from './helpers/db.js';

describe('RecipientLedgerRepository — Out-of-Order Runtime Upsert Hardening', () => {
  let user;
  let campaignId;
  let runId;

  beforeEach(async () => {
    await truncateAll();
    user = await createUser();
    const { rows: cRows } = await db.query(
      `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status)
       VALUES ($1, 'Test Camp', 'email', 'active') RETURNING id`,
      [user.id]
    );
    campaignId = cRows[0].id;

    const { rows: rRows } = await db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, status)
       VALUES ($1, $2, 'running') RETURNING id`,
      [campaignId, user.id]
    );
    runId = rRows[0].id;
  });

  it('preserves forward progression when writes arrive in chronological order', async () => {
    const nodeId = 'node_seq';
    const channel = 'email';
    const recipientKey = 'forward@example.com';

    // Step 1: Initial write
    await recipientLedgerRepository.upsertRecipientProgress({
      runId,
      campaignId,
      nodeId,
      channel,
      recipientKey,
      completedStep: 1,
      isFullyCompleted: false,
      metaPayload: { step1: 'ok', retryCount: 1, nextDueAt: '2026-09-05T00:00:00Z' },
    });

    // Step 2: Forward write completing step 2
    await recipientLedgerRepository.upsertRecipientProgress({
      runId,
      campaignId,
      nodeId,
      channel,
      recipientKey,
      completedStep: 2,
      isFullyCompleted: true,
      metaPayload: { step2: 'ok', nextDueAt: null },
      removeRetryCountFromMeta: true,
    });

    const { rows } = await db.query(
      `SELECT last_completed_step, is_fully_completed, meta
       FROM campaign_run_recipient_steps
       WHERE id_run = $1 AND id_node = $2 AND recipient_key = $3`,
      [runId, nodeId, recipientKey]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].last_completed_step).toBe(2);
    expect(rows[0].is_fully_completed).toBe(true);
    expect(rows[0].meta.step1).toBe('ok');
    expect(rows[0].meta.step2).toBe('ok');
    expect(rows[0].meta.nextDueAt).toBeNull();
    expect(rows[0].meta.retryCount).toBeUndefined();
  });

  it('rejects stale out-of-order write from overwriting metadata and progress of a completed row', async () => {
    const nodeId = 'node_seq';
    const channel = 'email';
    const recipientKey = 'completed_race@example.com';

    // 1. Recipient has already completed Step 2
    await recipientLedgerRepository.upsertRecipientProgress({
      runId,
      campaignId,
      nodeId,
      channel,
      recipientKey,
      completedStep: 2,
      isFullyCompleted: true,
      metaPayload: { step1: 'ok', step2: 'ok', retryCount: 0, nextDueAt: null },
      removeRetryCountFromMeta: true,
    });

    const { rows: before } = await db.query(
      `SELECT last_completed_step, is_fully_completed, meta, last_sent_at, updated_at
       FROM campaign_run_recipient_steps
       WHERE id_run = $1 AND id_node = $2 AND recipient_key = $3`,
      [runId, nodeId, recipientKey]
    );
    const sentAtBefore = before[0].last_sent_at;
    const updatedAtBefore = before[0].updated_at;

    await new Promise((resolve) => setTimeout(resolve, 50));

    // 2. Delayed out-of-order write from Step 1 arrives later (e.g. slow worker retry)
    const authoritativeResult = await recipientLedgerRepository.upsertRecipientProgress({
      runId,
      campaignId,
      nodeId,
      channel,
      recipientKey,
      completedStep: 1,
      isFullyCompleted: false,
      metaPayload: {
        step1: 'delayed_retry_override_attempt',
        retryCount: 3,
        nextDueAt: '2026-09-10T12:00:00Z',
        zaloSendFailureCount: 2,
        staleExtraKey: 'leak_attempt',
      },
    });

    // 3. Khẳng định: DB bảo toàn tuyệt đối trạng thái authoritative của Step 2 đã hoàn tất
    const { rows: after } = await db.query(
      `SELECT last_completed_step, is_fully_completed, meta, last_sent_at, updated_at
       FROM campaign_run_recipient_steps
       WHERE id_run = $1 AND id_node = $2 AND recipient_key = $3`,
      [runId, nodeId, recipientKey]
    );

    expect(after).toHaveLength(1);
    expect(after[0].last_completed_step).toBe(2);
    expect(after[0].is_fully_completed).toBe(true);
    // Key của row authoritative (step 2 completed) phải được bảo toàn 100% (zero hybrid state):
    expect(after[0].meta.step1).toBe('ok'); // Không bị delayed_retry_override_attempt ghi đè
    expect(after[0].meta.step2).toBe('ok');
    expect(after[0].meta.nextDueAt).toBeNull(); // Không bị dời lịch lùi vào tương lai
    expect(after[0].meta.retryCount).toBeUndefined(); // Không bị ghi lại retryCount=3
    expect(after[0].meta.zaloSendFailureCount).toBeUndefined(); // Không bị lọt key từ stale write
    expect(after[0].meta.staleExtraKey).toBeUndefined(); // Không bị hybrid state
    expect(after[0].last_sent_at).toEqual(sentAtBefore); // Không bị gián đoạn last_sent_at bởi write cũ
    expect(after[0].updated_at).toEqual(updatedAtBefore); // Không bump updated_at
    // Service layer dùng row này để đồng bộ memory map sau DB arbitration.
    expect(authoritativeResult.last_completed_step).toBe(2);
    expect(authoritativeResult.is_fully_completed).toBe(true);
    expect(authoritativeResult.meta).toEqual(after[0].meta);
  });

  it('rejects stale out-of-order write when row is in progress with higher step, preventing hybrid state and updated_at bump', async () => {
    const nodeId = 'node_seq';
    const channel = 'zalo';
    const recipientKey = '0988776655';

    // 1. Write Step 3 in-progress without nextDueAt
    await recipientLedgerRepository.upsertRecipientProgress({
      runId,
      campaignId,
      nodeId,
      channel,
      recipientKey,
      completedStep: 3,
      isFullyCompleted: false,
      metaPayload: { step3: 'sent', retryCount: 0 },
    });

    const { rows: before } = await db.query(
      `SELECT last_completed_step, is_fully_completed, meta, updated_at, last_sent_at
       FROM campaign_run_recipient_steps
       WHERE id_run = $1 AND id_node = $2 AND recipient_key = $3`,
      [runId, nodeId, recipientKey]
    );
    const updatedAtBefore = before[0].updated_at;
    const sentAtBefore = before[0].last_sent_at;

    await new Promise((resolve) => setTimeout(resolve, 50));

    // 2. Delayed write from Step 1 arrives with future nextDueAt
    await recipientLedgerRepository.upsertRecipientProgress({
      runId,
      campaignId,
      nodeId,
      channel,
      recipientKey,
      completedStep: 1,
      isFullyCompleted: false,
      metaPayload: {
        step1: 'stale_write',
        nextDueAt: '2026-09-15T00:00:00Z',
        retryCount: 2,
        staleOnlyField: 'should_not_exist',
      },
    });

    const { rows: after } = await db.query(
      `SELECT last_completed_step, is_fully_completed, meta, updated_at, last_sent_at
       FROM campaign_run_recipient_steps
       WHERE id_run = $1 AND id_node = $2 AND recipient_key = $3`,
      [runId, nodeId, recipientKey]
    );

    expect(after).toHaveLength(1);
    expect(after[0].last_completed_step).toBe(3);
    // nextDueAt không tồn tại trên row step 3, KHÔNG được phép bị stale row step 1 inject vào!
    expect(after[0].meta.nextDueAt).toBeUndefined();
    expect(after[0].meta.staleOnlyField).toBeUndefined();
    expect(after[0].meta.step1).toBeUndefined();
    expect(after[0].meta.retryCount).toBe(0);
    expect(after[0].updated_at).toEqual(updatedAtBefore);
    expect(after[0].last_sent_at).toEqual(sentAtBefore);
  });

  it('treats completed row as strictly terminal: rejects same-step completed write from updating metadata, last_sent_at, or updated_at', async () => {
    const nodeId = 'node_seq';
    const channel = 'email';
    const recipientKey = 'terminal_same_step@example.com';

    // 1. Initial write: Step 2 completed
    await recipientLedgerRepository.upsertRecipientProgress({
      runId,
      campaignId,
      nodeId,
      channel,
      recipientKey,
      completedStep: 2,
      isFullyCompleted: true,
      metaPayload: { step1: 'ok', step2: 'ok', terminalStatus: 'success' },
    });

    const { rows: before } = await db.query(
      `SELECT last_completed_step, is_fully_completed, meta, updated_at, last_sent_at
       FROM campaign_run_recipient_steps
       WHERE id_run = $1 AND id_node = $2 AND recipient_key = $3`,
      [runId, nodeId, recipientKey]
    );
    const updatedAtBefore = before[0].updated_at;
    const sentAtBefore = before[0].last_sent_at;

    await new Promise((resolve) => setTimeout(resolve, 50));

    // 2. Incoming duplicate write: also step 2 and completed, but with different payload
    await recipientLedgerRepository.upsertRecipientProgress({
      runId,
      campaignId,
      nodeId,
      channel,
      recipientKey,
      completedStep: 2,
      isFullyCompleted: true,
      metaPayload: {
        step2: 'duplicate_overwrite_attempt',
        terminalStatus: 'corrupted',
        leakKey: 'should_not_exist',
      },
    });

    const { rows: after } = await db.query(
      `SELECT last_completed_step, is_fully_completed, meta, updated_at, last_sent_at
       FROM campaign_run_recipient_steps
       WHERE id_run = $1 AND id_node = $2 AND recipient_key = $3`,
      [runId, nodeId, recipientKey]
    );

    expect(after).toHaveLength(1);
    expect(after[0].last_completed_step).toBe(2);
    expect(after[0].is_fully_completed).toBe(true);
    expect(after[0].meta.step2).toBe('ok');
    expect(after[0].meta.terminalStatus).toBe('success');
    expect(after[0].meta.leakKey).toBeUndefined();
    expect(after[0].last_sent_at).toEqual(sentAtBefore);
    expect(after[0].updated_at).toEqual(updatedAtBefore);
  });

  it('prevents stale lower-step completed write from flipping is_fully_completed on higher-step incomplete row', async () => {
    const nodeId = 'node_seq';
    const channel = 'zalo';
    const recipientKey = '0911223344';

    // 1. Initial write: Step 3 in progress (incomplete)
    await recipientLedgerRepository.upsertRecipientProgress({
      runId,
      campaignId,
      nodeId,
      channel,
      recipientKey,
      completedStep: 3,
      isFullyCompleted: false,
      metaPayload: { step3: 'in_progress', retryCount: 0 },
    });

    const { rows: before } = await db.query(
      `SELECT last_completed_step, is_fully_completed, meta, updated_at, last_sent_at
       FROM campaign_run_recipient_steps
       WHERE id_run = $1 AND id_node = $2 AND recipient_key = $3`,
      [runId, nodeId, recipientKey]
    );
    const updatedAtBefore = before[0].updated_at;
    const sentAtBefore = before[0].last_sent_at;

    await new Promise((resolve) => setTimeout(resolve, 50));

    // 2. Stale write: Step 1 reports completed=true (e.g. from an early branch or delayed worker)
    await recipientLedgerRepository.upsertRecipientProgress({
      runId,
      campaignId,
      nodeId,
      channel,
      recipientKey,
      completedStep: 1,
      isFullyCompleted: true,
      metaPayload: { step1: 'done_early_branch', leakKey: 'stale_completed' },
    });

    const { rows: after } = await db.query(
      `SELECT last_completed_step, is_fully_completed, meta, updated_at, last_sent_at
       FROM campaign_run_recipient_steps
       WHERE id_run = $1 AND id_node = $2 AND recipient_key = $3`,
      [runId, nodeId, recipientKey]
    );

    expect(after).toHaveLength(1);
    expect(after[0].last_completed_step).toBe(3);
    // CRITICAL P1 GUARD: is_fully_completed must REMAIN false!
    expect(after[0].is_fully_completed).toBe(false);
    expect(after[0].meta.step3).toBe('in_progress');
    expect(after[0].meta.step1).toBeUndefined();
    expect(after[0].meta.leakKey).toBeUndefined();
    expect(after[0].last_sent_at).toEqual(sentAtBefore);
    expect(after[0].updated_at).toEqual(updatedAtBefore);
  });
});
