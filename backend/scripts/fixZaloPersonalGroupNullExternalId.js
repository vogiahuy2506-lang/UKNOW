/**
 * One-time cleanup (phần 2): sửa external_id của các conversation Zalo cá nhân
 * còn sót lại dạng "group_null_<senderId>" sau khi đã chạy
 * fixZaloPersonalGroupNullNames.js.
 *
 * Bối cảnh: trước fix (commit f450fd6), externalId được build bằng
 * `group_${groupId}_${senderId}` với groupId = null, tạo ra external_id dạng
 * literal "group_null_<senderId>". Code mới tính externalId cho các tin nhắn
 * cá nhân là String(senderId) (không prefix). Nếu external_id cũ không được
 * sửa, tin nhắn mới từ cùng người sẽ không khớp conversation cũ
 * (uq_zalo_personal_external_id) và tạo ra một conversation MỚI, trùng lặp
 * với lịch sử cũ.
 *
 * Script này, với mỗi conversation có external_id = "group_null_<senderId>":
 *  - Nếu chưa có conversation nào khác với external_id = "<senderId>"
 *    (cùng id_zalo_setting) -> đổi external_id sang "<senderId>".
 *  - Nếu đã có -> gộp: chuyển toàn bộ zalo_personal_messages sang conversation
 *    đó, cập nhật last_message_at, rồi xóa conversation "group_null_" cũ.
 *
 * Chạy (dry-run, chỉ in ra các bản ghi sẽ sửa):
 *   cd backend && node scripts/fixZaloPersonalGroupNullExternalId.js
 *
 * Chạy thật (áp dụng thay đổi):
 *   cd backend && node scripts/fixZaloPersonalGroupNullExternalId.js --apply
 */
import 'dotenv/config';
import db from '../src/config/database.js';

const APPLY = process.argv.includes('--apply');

const { rows: candidates } = await db.query(`
  SELECT id, id_zalo_setting, external_id, visitor_name, visitor_info, last_message_at
    FROM zalo_personal_conversations
   WHERE external_id LIKE 'group\\_null\\_%'
`);

if (candidates.length === 0) {
  console.log('✔ Không tìm thấy conversation nào có external_id dạng "group_null_<id>". Không cần sửa.');
  process.exit(0);
}

console.log(`Tìm thấy ${candidates.length} conversation cần sửa external_id${APPLY ? '' : ' (dry-run, chưa áp dụng)'}:\n`);

for (const conv of candidates) {
  const senderId = conv.external_id.replace(/^group_null_/, '');
  const visitorInfo = typeof conv.visitor_info === 'string'
    ? JSON.parse(conv.visitor_info || '{}')
    : (conv.visitor_info || {});

  if (visitorInfo.is_group === true) {
    console.log(`#${conv.id} (${conv.visitor_name}) -> bỏ qua: visitor_info.is_group vẫn là true (chưa chạy fixZaloPersonalGroupNullNames.js?)\n`);
    continue;
  }

  const { rows: dupRows } = await db.query(
    `SELECT id, last_message_at FROM zalo_personal_conversations WHERE id_zalo_setting = $1 AND external_id = $2`,
    [conv.id_zalo_setting, senderId]
  );
  const dup = dupRows[0] || null;

  console.log(`#${conv.id} (${conv.visitor_name}) external_id: "${conv.external_id}" -> "${senderId}"`);

  if (dup) {
    console.log(`  -> Đã tồn tại conversation #${dup.id} với external_id="${senderId}". Sẽ gộp tin nhắn từ #${conv.id} vào #${dup.id} rồi xóa #${conv.id}.`);

    if (APPLY) {
      await db.query(
        `UPDATE zalo_personal_messages SET id_conversation = $1 WHERE id_conversation = $2`,
        [dup.id, conv.id]
      );
      const newerAt = new Date(conv.last_message_at) > new Date(dup.last_message_at) ? conv.last_message_at : dup.last_message_at;
      await db.query(
        `UPDATE zalo_personal_conversations SET last_message_at = $1 WHERE id = $2`,
        [newerAt, dup.id]
      );
      await db.query(`DELETE FROM zalo_personal_conversations WHERE id = $1`, [conv.id]);
    }
  } else {
    console.log(`  -> Không trùng, đổi external_id trực tiếp.`);

    if (APPLY) {
      await db.query(
        `UPDATE zalo_personal_conversations SET external_id = $1 WHERE id = $2`,
        [senderId, conv.id]
      );
    }
  }
  console.log('');
}

if (!APPLY) {
  console.log('Chạy lại với --apply để áp dụng các thay đổi trên.');
}

process.exit(0);
