/**
 * Bộ dọn đặt chỗ hạn mức (PLAN_SAN_SANG_BAT_ENFORCE_HAN_MUC_2026-10-19, PR-E1; thiết kế gốc
 * docs/PLAN_QUOTA_ATOMIC_WAVE2_2026-09-01.md §5.1 / §5.3 / §7).
 *
 * Ngữ nghĩa ĐÃ CHỐT — không đổi ở đây:
 *   - `reserved` hết lease (`expires_at < NOW()`)  → `released` (trả hạn mức + ví), failure_code `lease_expired`.
 *   - `sending` quá ngưỡng (SEND_QUOTA_SENDING_UNCERTAIN_SECONDS, mặc định 1800s) → `uncertain`, failure_code
 *     `sending_stale`. TUYỆT ĐỐI KHÔNG `released`: provider có thể đã gửi, release rồi retry là gửi trùng. `uncertain`
 *     VẪN tính hạn mức + giữ ví cho tới khi đối soát, hoặc tới khi luồng gửi còn sống chốt `consumeSendQuota`
 *     (`uncertain → consumed`).
 *   - `uncertain` / `consumed` không bao giờ bị xoá ở đây (xoá `released` quá 30 ngày nằm ở data_retention_cleanup).
 *
 * An toàn đồng thời: quét KHÔNG khoá (khoá dòng trước khoá workspace sẽ đảo thứ tự khoá của consume/release → deadlock),
 * rồi MỖI DÒNG một transaction lấy khoá đúng thứ tự `consumeSendQuota`: workspace → ví (nếu giữ ví) → dòng FOR UPDATE
 * kèm kiểm lại điều kiện. Dòng đã được luồng gửi đổi trạng thái giữa chừng → bỏ qua, đếm `skipped`.
 */
import db from '../../config/database.js';
import {
  acquireWorkspaceQuotaLock,
  findExpiredReservations,
  findStaleSendingReservations,
  lockReservationIfExpired,
  lockReservationIfStaleSending,
  transitionReservationState,
} from '../../repositories/sendQuota.repository.js';
import { acquireWalletLock } from '../../repositories/payment/topup.repository.js';
import { _clearQuotaCache } from '../../utils/userSendLimit.util.js';
import {
  DEFAULT_SWEEPER_SENDING_UNCERTAIN_SECONDS,
  getStaleSendingSeconds,
} from '../../config/sendQuota.config.js';

export const LEASE_EXPIRED_FAILURE_CODE = 'lease_expired';
export const SENDING_STALE_FAILURE_CODE = 'sending_stale';

const DEFAULT_BATCH_SIZE = 50;
/** Trần số lô mỗi loại mỗi lượt — lượt sau (1 phút) làm tiếp, không chiếm kết nối quá lâu. */
const DEFAULT_MAX_BATCHES = 20;

/** Lỗi do luồng gửi đổi trạng thái dòng trước khi mình khoá được → bỏ qua dòng, không hỏng cả lượt. */
const SKIPPABLE_ERROR_CODES = new Set(['INVALID_RESERVATION_TRANSITION', 'RESERVATION_NOT_FOUND']);

/**
 * Xử lý MỘT dòng trong transaction riêng.
 *
 * @param {object} candidate dòng ứng viên (đọc không khoá)
 * @param {{ lockRow: (client: any, id: any) => Promise<object|null>, to: string, from: string, failureCode: string }} step
 * @returns {Promise<'changed'|'skipped'>}
 */
async function sweepOneReservation(candidate, step) {
  const client = await db.getClient();
  let inTransaction = false;
  try {
    await client.query('BEGIN');
    inTransaction = true;

    // Thứ tự khoá y hệt consumeSendQuota: 1) workspace  2) ví nếu đang giữ ví  3) dòng FOR UPDATE.
    await acquireWorkspaceQuotaLock(client, candidate.billing_user_id);
    if (Number(candidate.wallet_quantity) > 0 && candidate.wallet_item_key) {
      await acquireWalletLock(client, candidate.billing_user_id, candidate.wallet_item_key);
    }

    const locked = await step.lockRow(client, candidate.id);
    if (!locked) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return 'skipped';
    }

    await transitionReservationState(client, locked.id, step.from, step.to, { failureCode: step.failureCode });
    await client.query('COMMIT');
    inTransaction = false;
    return 'changed';
  } catch (err) {
    if (inTransaction) {
      try {
        await client.query('ROLLBACK');
      } catch (_) { /* bỏ qua */ }
      inTransaction = false;
    }
    if (SKIPPABLE_ERROR_CODES.has(err?.code)) return 'skipped';
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Dọn đặt chỗ: `reserved` hết lease → `released`; `sending` treo quá ngưỡng → `uncertain`.
 *
 * Chạy ở MỌI chế độ (off / shadow / enforce): chế độ không phải enforce thì bảng không có dòng nào → hai truy vấn quét
 * rẻ rồi trả `noop`.
 *
 * @param {object} [options]
 * @param {number} [options.batchSize] số ứng viên mỗi lô (mặc định 50)
 * @param {number} [options.maxBatches] trần số lô mỗi loại mỗi lượt (mặc định 20)
 * @param {number|string} [options.staleSendingSeconds] ngưỡng `sending` → `uncertain`; mặc định env
 *   SEND_QUOTA_SENDING_UNCERTAIN_SECONDS, không có thì 1800
 * @returns {Promise<{ released: number, markedUncertain: number, skipped: number, status: 'success'|'noop' }>}
 */
export async function sweepReservations({
  batchSize = DEFAULT_BATCH_SIZE,
  maxBatches = DEFAULT_MAX_BATCHES,
  staleSendingSeconds,
} = {}) {
  const limit = Math.max(1, Math.min(500, Math.floor(Number(batchSize)) || DEFAULT_BATCH_SIZE));
  const batches = Math.max(1, Math.floor(Number(maxBatches)) || DEFAULT_MAX_BATCHES);
  const staleSeconds = getStaleSendingSeconds(staleSendingSeconds, DEFAULT_SWEEPER_SENDING_UNCERTAIN_SECONDS);

  let released = 0;
  let markedUncertain = 0;
  let skipped = 0;

  const runPhase = async ({ find, step }) => {
    let changedTotal = 0;
    for (let i = 0; i < batches; i += 1) {
      const candidates = await find();
      if (candidates.length === 0) break;
      let changedInBatch = 0;
      for (const candidate of candidates) {
        const outcome = await sweepOneReservation(candidate, step);
        if (outcome === 'changed') {
          changedInBatch += 1;
        } else {
          skipped += 1;
        }
      }
      changedTotal += changedInBatch;
      // Cả lô đều bị bỏ qua (đua với luồng gửi): dừng — quét lại sẽ gặp đúng các dòng đó.
      if (changedInBatch === 0) break;
    }
    return changedTotal;
  };

  released = await runPhase({
    find: () => findExpiredReservations(db, limit, { forUpdate: false }),
    step: {
      lockRow: lockReservationIfExpired,
      from: 'reserved',
      to: 'released',
      failureCode: LEASE_EXPIRED_FAILURE_CODE,
    },
  });

  markedUncertain = await runPhase({
    find: () => findStaleSendingReservations(db, staleSeconds, limit, { forUpdate: false }),
    step: {
      lockRow: (client, id) => lockReservationIfStaleSending(client, id, staleSeconds),
      from: 'sending',
      to: 'uncertain',
      failureCode: SENDING_STALE_FAILURE_CODE,
    },
  });

  if (released + markedUncertain > 0) _clearQuotaCache();

  return {
    released,
    markedUncertain,
    skipped,
    status: released + markedUncertain > 0 ? 'success' : 'noop',
  };
}

export default { sweepReservations };
