/**
 * aiUnavailableNotice.repository.js - SQL cho moc "AI khong tra loi duoc cho khach" (G3b, A P1-6).
 *
 * Bang `ai_unavailable_notices` (migration 276) giu hai loai moc, deu o DB de song qua restart:
 *   - 'owner_email'     : lan cuoi gui email bao CHU (notice_key = '').
 *   - 'visitor_apology' : lan cuoi gui cau xin loi cho MOT khach (notice_key = '<kenh>:<id hoi thoai>').
 *
 * Moi moc thoi gian nhan tu tham so (`now`), KHONG dung NOW() - de test dong bang duoc dong ho.
 */
import db from '../../config/database.js';

export const NOTICE_KIND_OWNER_EMAIL = 'owner_email';
export const NOTICE_KIND_VISITOR_APOLOGY = 'visitor_apology';

class AiUnavailableNoticeRepository {
  /**
   * "Chiem" mot moc: ghi `last_sent_at = now` NEU chua co dong hoac dong cu da nguoi (last_sent_at <= now - cooldown).
   * Mot cau lenh nguyen tu - hai tien trinh tranh nhau thi dung mot ben nhan duoc `true`.
   *
   * @param {{ idUser: number, kind: string, noticeKey?: string, now: Date, cooldownMs: number }} p
   * @returns {Promise<boolean>} true neu chiem duoc (nguoi goi PHAI gui thong bao), false neu dang trong cooldown
   */
  async claim({ idUser, kind, noticeKey = '', now, cooldownMs }) {
    const { rowCount } = await db.query(
      `INSERT INTO ai_unavailable_notices (id_user, kind, notice_key, last_sent_at, send_count)
       VALUES ($1, $2, $3, $4::timestamptz, 1)
       ON CONFLICT (id_user, kind, notice_key) DO UPDATE
         SET last_sent_at = EXCLUDED.last_sent_at,
             send_count = ai_unavailable_notices.send_count + 1
       WHERE ai_unavailable_notices.last_sent_at <= $4::timestamptz - ($5::bigint * INTERVAL '1 millisecond')`,
      [idUser, kind, String(noticeKey).slice(0, 200), now, Math.max(0, Math.trunc(cooldownMs))]
    );
    return rowCount > 0;
  }

  /**
   * Gui that bai sau khi da chiem: lui moc de lan sau thu lai SOM (sau `retryAt`), thay vi bi cooldown 24h nuot mat.
   * Chi lui dung dong ma minh vua chiem (`claimedAt`) - khong dap len moc cua tien trinh khac.
   */
  async rewind({ idUser, kind, noticeKey = '', claimedAt, retryAt }) {
    await db.query(
      `UPDATE ai_unavailable_notices
          SET last_sent_at = $5::timestamptz
        WHERE id_user = $1 AND kind = $2 AND notice_key = $3 AND last_sent_at = $4::timestamptz`,
      [idUser, kind, String(noticeKey).slice(0, 200), claimedAt, retryAt]
    );
  }

  /** Doc truc tiep mot moc (test + chan doan). */
  async find({ idUser, kind, noticeKey = '' }) {
    const { rows } = await db.query(
      `SELECT last_sent_at, send_count FROM ai_unavailable_notices
        WHERE id_user = $1 AND kind = $2 AND notice_key = $3`,
      [idUser, kind, String(noticeKey).slice(0, 200)]
    );
    return rows[0] || null;
  }

  /** Don cac cau xin loi cu cua mot chu (bang khong phinh vo han). Chay khi chiem duoc moc email chu - toi da 1 lan/chu/24h. */
  async purgeStaleVisitorApologies({ idUser, olderThan }) {
    await db.query(
      `DELETE FROM ai_unavailable_notices
        WHERE id_user = $1 AND kind = $2 AND last_sent_at < $3::timestamptz`,
      [idUser, NOTICE_KIND_VISITOR_APOLOGY, olderThan]
    );
  }

  /** Chu con hoat dong + co email (cung dieu kien channelDisconnectAlert.repository.listDisconnectedWithOwner). */
  async findOwnerContact(idUser) {
    const { rows } = await db.query(
      `SELECT email, full_name FROM users
        WHERE id = $1 AND status = 'active' AND email IS NOT NULL AND email <> ''`,
      [idUser]
    );
    return rows[0] || null;
  }
}

export default new AiUnavailableNoticeRepository();
