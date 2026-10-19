/**
 * Đối soát đặt chỗ hạn mức `uncertain` — công cụ của QUẢN TRỊ VIÊN, do NGƯỜI quyết định (R2,
 * PLAN_SUA_NOT_GIO_GUI_TIEP_VA_DOI_SOAT_UNCERTAIN_2026-10-20; ngữ nghĩa gốc docs/PLAN_QUOTA_ATOMIC_WAVE2_2026-09-01.md §5.3).
 *
 * Bộ dọn (sendQuotaReservationSweeper) đánh dấu `sending` treo quá ngưỡng là `uncertain`: VẪN tính hạn mức + giữ ví,
 * retry cùng khoá bị 409, và không có cron nào tự gỡ — vì chưa ai biết nhà cung cấp đã gửi hay chưa. Nếu không có người
 * đối soát thì khách mất hạn mức/ví vĩnh viễn. Hai kết cục duy nhất:
 *   - `sent`     (chứng minh ĐÃ gửi)  → `uncertain → consumed`; nếu giữ ví thì trừ ví đúng một lần
 *                                       (`insertTopupDebit`, cùng sourceKey `quota_reservation:<id>` với đường consume
 *                                       nên UNIQUE(item_key, source_key) chặn trừ trùng).
 *   - `not_sent` (chứng minh CHƯA gửi) → `uncertain → released`, failure_code `admin_reconciled_not_sent`; hạn mức + ví
 *                                       tự về vì `released` không còn được tính.
 *
 * KHÔNG tự động hoá: không cron, không gọi từ luồng gửi. Chỉ route quản trị gọi.
 *
 * An toàn đồng thời: một transaction, khoá ĐÚNG thứ tự của consumeSendQuota / bộ dọn —
 * 1) workspace  2) ví (nếu giữ ví)  3) dòng FOR UPDATE rồi kiểm lại `status = 'uncertain'` dưới khoá. Luồng gửi còn sống
 * đã chốt dòng này trước (consumed) hoặc người khác đã đối soát trước → 409 RESERVATION_NOT_UNCERTAIN, không đổi gì.
 */
import db from '../../config/database.js';
import {
  acquireWorkspaceQuotaLock,
  countUncertainReservations,
  findReservationById,
  listUncertainReservationsForAdmin,
  transitionReservationState,
} from '../../repositories/sendQuota.repository.js';
import { acquireWalletLock, insertTopupDebit } from '../../repositories/payment/topup.repository.js';
import { _clearQuotaCache } from '../../utils/userSendLimit.util.js';

export const RECONCILE_OUTCOMES = Object.freeze(['sent', 'not_sent']);
export const RECONCILED_NOT_SENT_FAILURE_CODE = 'admin_reconciled_not_sent';
export const MAX_RECONCILE_NOTE_LENGTH = 500;

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

function httpError(status, code, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function normalizeReservationId(value) {
  const text = String(value ?? '').trim();
  if (!/^[0-9]{1,18}$/.test(text) || Number(text) <= 0) {
    throw httpError(400, 'INVALID_RESERVATION_ID', 'Mã đặt chỗ không hợp lệ');
  }
  return text;
}

function normalizeNote(note) {
  if (note == null) return null;
  if (typeof note !== 'string') {
    throw httpError(400, 'INVALID_NOTE', 'Ghi chú phải là văn bản');
  }
  const trimmed = note.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_RECONCILE_NOTE_LENGTH) {
    throw httpError(400, 'INVALID_NOTE', `Ghi chú tối đa ${MAX_RECONCILE_NOTE_LENGTH} ký tự`);
  }
  return trimmed;
}

function holdsWallet(row) {
  return Number(row?.wallet_quantity) > 0 && Boolean(row?.wallet_item_key);
}

/**
 * Danh sách đặt chỗ `uncertain` + gợi ý bằng chứng (đọc, không khoá).
 *
 * @param {{ limit?: number|string, offset?: number|string }} [options]
 * @returns {Promise<{ items: object[], total: number, limit: number, offset: number }>}
 */
export async function listUncertainReservations({ limit, offset } = {}) {
  const safeLimit = Math.max(1, Math.min(MAX_LIST_LIMIT, Math.floor(Number(limit)) || DEFAULT_LIST_LIMIT));
  const safeOffset = Math.max(0, Math.floor(Number(offset)) || 0);

  const [rows, total] = await Promise.all([
    listUncertainReservationsForAdmin(db, { limit: safeLimit, offset: safeOffset }),
    countUncertainReservations(db),
  ]);

  const items = rows.map((row) => {
    const evidenceTables = Array.isArray(row.evidence_tables) ? row.evidence_tables : [];
    return {
      id: String(row.id),
      billingUserId: Number(row.billing_user_id),
      billingEmail: row.billing_email ?? null,
      billingName: row.billing_full_name || row.billing_username || null,
      actorUserId: row.actor_user_id == null ? null : Number(row.actor_user_id),
      actorEmail: row.actor_email ?? null,
      actorName: row.actor_full_name ?? null,
      channel: row.channel,
      sourceType: row.source_type,
      quantity: Number(row.quantity),
      walletQuantity: Number(row.wallet_quantity),
      walletItemKey: row.wallet_item_key ?? null,
      createdAt: row.created_at,
      sendingAt: row.sending_at,
      uncertainAt: row.uncertain_at,
      failureCode: row.failure_code ?? null,
      providerReference: row.provider_reference ?? null,
      hasMessageEvidence: evidenceTables.length > 0,
      evidenceTables,
    };
  });

  return { items, total, limit: safeLimit, offset: safeOffset };
}

/**
 * Đối soát MỘT đặt chỗ `uncertain`.
 *
 * @param {object} params
 * @param {number|string} params.reservationId
 * @param {'sent'|'not_sent'} params.outcome
 * @param {number|string} [params.adminUserId] người quyết định (để ghi audit ở controller)
 * @param {string|null} [params.note] ghi chú tự do của quản trị viên (<= 500 ký tự)
 * @returns {Promise<{ reservation: object, reservationId: string, outcome: string, adminUserId: any, billingUserId: number,
 *   quantity: number, walletQuantity: number, walletItemKey: string|null, walletDebited: boolean, note: string|null }>}
 */
export async function reconcileUncertainReservation({ reservationId, outcome, adminUserId = null, note = null } = {}) {
  const id = normalizeReservationId(reservationId);
  if (!RECONCILE_OUTCOMES.includes(outcome)) {
    throw httpError(400, 'INVALID_OUTCOME', "Kết quả đối soát phải là 'sent' hoặc 'not_sent'");
  }
  const cleanNote = normalizeNote(note);

  const client = await db.getClient();
  let inTransaction = false;
  try {
    await client.query('BEGIN');
    inTransaction = true;

    // Đọc KHÔNG khoá chỉ để biết workspace + ví cần khoá (cùng khuôn consumeSendQuota).
    const preCheck = await findReservationById(client, id);
    if (!preCheck) {
      throw httpError(404, 'RESERVATION_NOT_FOUND', `Reservation #${id} not found`);
    }

    // Thứ tự khoá: 1) workspace  2) ví nếu đang giữ ví  3) dòng FOR UPDATE.
    await acquireWorkspaceQuotaLock(client, preCheck.billing_user_id);
    if (holdsWallet(preCheck)) {
      await acquireWalletLock(client, preCheck.billing_user_id, preCheck.wallet_item_key);
    }

    const existing = await findReservationById(client, id, { forUpdate: true });
    if (!existing) {
      throw httpError(404, 'RESERVATION_NOT_FOUND', `Reservation #${id} not found`);
    }

    if (existing.status !== 'uncertain') {
      throw httpError(
        409,
        'RESERVATION_NOT_UNCERTAIN',
        `Đặt chỗ #${id} đang ở trạng thái '${existing.status}', chỉ đối soát được đặt chỗ 'uncertain'`,
        { currentStatus: existing.status }
      );
    }

    // Dòng đã bị đổi chủ/ví giữa lúc đọc và lúc khoá (released → reserved → … → uncertain) thì khoá đã lấy là khoá sai.
    if (
      String(existing.billing_user_id) !== String(preCheck.billing_user_id)
      || holdsWallet(existing) !== holdsWallet(preCheck)
      || (holdsWallet(existing) && existing.wallet_item_key !== preCheck.wallet_item_key)
    ) {
      throw httpError(409, 'RESERVATION_CHANGED', `Đặt chỗ #${id} vừa thay đổi, hãy tải lại danh sách`);
    }

    let updated;
    let walletDebited = false;
    if (outcome === 'sent') {
      if (holdsWallet(existing)) {
        await insertTopupDebit({
          userId: existing.billing_user_id,
          itemKey: existing.wallet_item_key,
          qty: existing.wallet_quantity,
          sourceKey: `quota_reservation:${existing.id}`,
        }, client);
        walletDebited = true;
      }
      updated = await transitionReservationState(client, id, 'uncertain', 'consumed', {});
    } else {
      updated = await transitionReservationState(client, id, 'uncertain', 'released', {
        failureCode: RECONCILED_NOT_SENT_FAILURE_CODE,
      });
    }

    await client.query('COMMIT');
    inTransaction = false;

    _clearQuotaCache();

    return {
      reservation: updated,
      reservationId: String(existing.id),
      outcome,
      adminUserId,
      billingUserId: Number(existing.billing_user_id),
      quantity: Number(existing.quantity),
      walletQuantity: Number(existing.wallet_quantity),
      walletItemKey: existing.wallet_item_key ?? null,
      walletDebited,
      note: cleanNote,
    };
  } catch (err) {
    if (inTransaction) {
      try {
        await client.query('ROLLBACK');
      } catch (_) { /* bỏ qua */ }
      inTransaction = false;
    }
    throw err;
  } finally {
    client.release();
  }
}

export default { listUncertainReservations, reconcileUncertainReservation };
