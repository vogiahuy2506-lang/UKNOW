/**
 * Integration tests cho lastFailureReason/lastFailureAt trong recipientLedgerRepository.
 *
 * PR-3 của plan giám sát Zalo mù (_internal/PLAN_GIAM_SAT_ZALO_MU_2026-09-10.md):
 * 20.800 lần gửi hỏng để lại 0 dòng có lý do — meta ledger chỉ có
 * {"zaloSendFailureCount": 4}, không nói vì sao. Ghi lastFailureReason (mã ngắn, đã
 * chuẩn hoá — cùng bộ mã với zalo_unreachable_phones.reason) + lastFailureAt mỗi lần
 * hỏng, GHI ĐÈ tại chỗ trên cùng 1 dòng — campaign_run_recipient_steps là bảng cập
 * nhật tại chỗ, KHÔNG được đổi thành chỉ-thêm (sẽ phình theo số lần thử).
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import db from '../../src/config/database.js';
import recipientLedgerRepository from '../../src/repositories/campaign/recipientLedger.repository.js';
import { createUser, truncateAll } from './helpers/db.js';
import { mapZaloErrorCategoryToLedgerReason } from '../../src/utils/zaloSendErrorClassifier.util.js';

describe('RecipientLedgerRepository — lastFailureReason/lastFailureAt (PR-3)', () => {
  let user;
  let campaignId;
  let runId;

  beforeEach(async () => {
    await truncateAll();
    user = await createUser();
    const { rows: cRows } = await db.query(
      `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status)
       VALUES ($1, 'Test Camp Zalo', 'zalo', 'active') RETURNING id`,
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

  async function readMeta(nodeId, recipientKey) {
    const { rows } = await db.query(
      `SELECT meta FROM campaign_run_recipient_steps
       WHERE id_run = $1 AND id_node = $2 AND channel = 'zalo_personal' AND recipient_key = $3`,
      [runId, nodeId, recipientKey]
    );
    return rows;
  }

  it('gửi hỏng vì số sai định dạng → meta có lastFailureReason invalid_format', async () => {
    await recipientLedgerRepository.upsertRecipientProgress({
      runId, campaignId, nodeId: 'n1', channel: 'zalo_personal', recipientKey: '0900000001',
      completedStep: 0, isFullyCompleted: false,
      metaPayload: { zaloSendFailureCount: 1, lastFailureReason: 'invalid_format', lastFailureAt: '2026-09-10T01:00:00Z' },
    });

    const rows = await readMeta('n1', '0900000001');
    expect(rows).toHaveLength(1);
    expect(rows[0].meta.lastFailureReason).toBe('invalid_format');
    expect(rows[0].meta.lastFailureAt).toBe('2026-09-10T01:00:00Z');
    expect(rows[0].meta.zaloSendFailureCount).toBe(1);
  });

  it('hỏng lần 2 vì lý do khác → lastFailureReason cập nhật, zaloSendFailureCount tăng, KHÔNG thêm dòng mới', async () => {
    await recipientLedgerRepository.upsertRecipientProgress({
      runId, campaignId, nodeId: 'n2', channel: 'zalo_personal', recipientKey: '0900000002',
      completedStep: 0, isFullyCompleted: false,
      metaPayload: { zaloSendFailureCount: 1, lastFailureReason: 'not_found', lastFailureAt: '2026-09-10T01:00:00Z' },
    });
    await recipientLedgerRepository.upsertRecipientProgress({
      runId, campaignId, nodeId: 'n2', channel: 'zalo_personal', recipientKey: '0900000002',
      completedStep: 0, isFullyCompleted: false,
      metaPayload: { zaloSendFailureCount: 2, lastFailureReason: 'rate_limited', lastFailureAt: '2026-09-10T02:00:00Z' },
    });

    const rows = await readMeta('n2', '0900000002');
    expect(rows).toHaveLength(1); // ghi đè tại chỗ, không phình thành nhiều dòng
    expect(rows[0].meta.lastFailureReason).toBe('rate_limited');
    expect(rows[0].meta.lastFailureAt).toBe('2026-09-10T02:00:00Z');
    expect(rows[0].meta.zaloSendFailureCount).toBe(2);

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM campaign_run_recipient_steps WHERE id_run = $1 AND id_node = 'n2'`,
      [runId]
    );
    expect(countRows[0].n).toBe(1);
  });

  it('gửi thành công sau khi từng hỏng → lastFailureReason bị gỡ cùng zaloSendFailureCount/zaloAbandonReason', async () => {
    await recipientLedgerRepository.upsertRecipientProgress({
      runId, campaignId, nodeId: 'n3', channel: 'zalo_personal', recipientKey: '0900000003',
      completedStep: 0, isFullyCompleted: false,
      metaPayload: {
        zaloSendFailureCount: 3,
        zaloAbandonReason: 'max_send_failures',
        lastFailureReason: 'stranger_blocked',
        lastFailureAt: '2026-09-10T01:00:00Z',
      },
    });
    await recipientLedgerRepository.upsertRecipientProgress({
      runId, campaignId, nodeId: 'n3', channel: 'zalo_personal', recipientKey: '0900000003',
      completedStep: 1, isFullyCompleted: true,
      metaPayload: { lastCompletedAt: '2026-09-10T03:00:00Z' },
      removeZaloFailureFromMeta: true,
    });

    const rows = await readMeta('n3', '0900000003');
    expect(rows[0].meta.lastFailureReason).toBeUndefined();
    expect(rows[0].meta.lastFailureAt).toBeUndefined();
    expect(rows[0].meta.zaloSendFailureCount).toBeUndefined();
    expect(rows[0].meta.zaloAbandonReason).toBeUndefined();
    expect(rows[0].meta.lastCompletedAt).toBe('2026-09-10T03:00:00Z');
  });

  it('truy vấn thống kê lý do trên ledger → ra được bảng phân bố như zalo_unreachable_phones', async () => {
    const reasons = ['invalid_format', 'invalid_format', 'stranger_blocked', 'not_found'];
    for (let i = 0; i < reasons.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await recipientLedgerRepository.upsertRecipientProgress({
        runId, campaignId, nodeId: 'n4', channel: 'zalo_personal', recipientKey: `090000010${i}`,
        completedStep: 0, isFullyCompleted: false,
        metaPayload: { zaloSendFailureCount: 1, lastFailureReason: reasons[i], lastFailureAt: '2026-09-10T01:00:00Z' },
      });
    }

    const { rows } = await db.query(
      `SELECT meta->>'lastFailureReason' AS reason, COUNT(*)::int AS count
       FROM campaign_run_recipient_steps
       WHERE id_run = $1 AND meta ? 'lastFailureReason'
       GROUP BY meta->>'lastFailureReason'
       ORDER BY count DESC`,
      [runId]
    );
    const map = Object.fromEntries(rows.map((r) => [r.reason, r.count]));
    expect(map.invalid_format).toBe(2);
    expect(map.stranger_blocked).toBe(1);
    expect(map.not_found).toBe(1);
  });
});

describe('mapZaloErrorCategoryToLedgerReason — chuẩn hoá về cùng bộ mã với zalo_unreachable_phones.reason', () => {
  it('map đúng 4 category chính vào 4 mã tương ứng', () => {
    expect(mapZaloErrorCategoryToLedgerReason('PHONE_LOOKUP_RATE_LIMIT')).toBe('rate_limited');
    expect(mapZaloErrorCategoryToLedgerReason('NOT_FRIEND_OR_BLOCKED')).toBe('stranger_blocked');
    expect(mapZaloErrorCategoryToLedgerReason('RECIPIENT_NOT_FOUND')).toBe('not_found');
    expect(mapZaloErrorCategoryToLedgerReason('INVALID_PARAMETER')).toBe('invalid_format');
  });

  it('category không nằm trong 4 mã trên (TIMEOUT, ACCOUNT_DISCONNECTED, ZALO_GROUP_UNREACHABLE, UNKNOWN...) → unknown', () => {
    expect(mapZaloErrorCategoryToLedgerReason('TIMEOUT')).toBe('unknown');
    expect(mapZaloErrorCategoryToLedgerReason('ACCOUNT_DISCONNECTED')).toBe('unknown');
    expect(mapZaloErrorCategoryToLedgerReason('ZALO_GROUP_UNREACHABLE')).toBe('unknown');
    expect(mapZaloErrorCategoryToLedgerReason('ZALO_SILENT_DROP')).toBe('unknown');
    expect(mapZaloErrorCategoryToLedgerReason('UNKNOWN')).toBe('unknown');
  });

  it('lý do lạ/không xác định (kể cả rỗng/null) → unknown, không phải message thô', () => {
    expect(mapZaloErrorCategoryToLedgerReason('SOME_NEW_CATEGORY_CHUA_TUNG_THAY')).toBe('unknown');
    expect(mapZaloErrorCategoryToLedgerReason(undefined)).toBe('unknown');
    expect(mapZaloErrorCategoryToLedgerReason(null)).toBe('unknown');
    expect(mapZaloErrorCategoryToLedgerReason('')).toBe('unknown');
  });
});
