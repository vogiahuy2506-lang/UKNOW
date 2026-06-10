/**
 * One-time cleanup: sửa các conversation Zalo cá nhân bị đặt tên sai dạng
 * "Tên người gửi (Nhóm null)".
 *
 * Bối cảnh: trước khi `zaloInbox.service.js` và `zaloPersonal.adapter.js` yêu cầu
 * phải có `groupId` cụ thể mới coi là tin nhắn nhóm, một số tin nhắn cá nhân có cờ
 * isGroup/threadType=1 nhưng không kèm groupId đã bị lưu thành conversation với
 * visitor_name = "<Tên> (Nhóm null)" và visitor_info.is_group = true, group_id = null.
 * Script này tìm và sửa lại các conversation đó về đúng dạng cá nhân.
 *
 * Chạy (dry-run, chỉ in ra các bản ghi sẽ sửa):
 *   cd backend && node scripts/fixZaloPersonalGroupNullNames.js
 *
 * Chạy thật (áp dụng thay đổi):
 *   cd backend && node scripts/fixZaloPersonalGroupNullNames.js --apply
 */
import 'dotenv/config';
import db from '../src/config/database.js';

const APPLY = process.argv.includes('--apply');

const SUFFIX_RE = /\s*\(Nhóm\s+(null|undefined)\)\s*$/i;

const { rows: candidates } = await db.query(`
  SELECT id, id_user, id_zalo_setting, external_id, visitor_name, visitor_info
    FROM zalo_personal_conversations
   WHERE visitor_name ~* '\\(Nhóm\\s+(null|undefined)\\)\\s*$'
      OR visitor_info->>'group_name' IN ('null', 'undefined')
      OR (
           visitor_info->>'is_group' = 'true'
           AND (visitor_info->>'group_id' IS NULL OR visitor_info->>'group_id' IN ('null', 'undefined'))
           AND external_id NOT LIKE 'group\\_%'
         )
`);

if (candidates.length === 0) {
  console.log('✔ Không tìm thấy conversation nào bị lỗi "(Nhóm null)". Không cần sửa.');
  process.exit(0);
}

console.log(`Tìm thấy ${candidates.length} conversation cần sửa${APPLY ? '' : ' (dry-run, chưa áp dụng)'}:\n`);

for (const conv of candidates) {
  const visitorInfo = typeof conv.visitor_info === 'string'
    ? JSON.parse(conv.visitor_info || '{}')
    : (conv.visitor_info || {});

  const fallbackName = visitorInfo.sender_name || `User ${conv.external_id}`;
  const newName = (conv.visitor_name || '').replace(SUFFIX_RE, '').trim() || fallbackName;

  const newVisitorInfo = {
    ...visitorInfo,
    is_group: false,
    source: 'zalo_personal',
    group_id: null,
    group_name: null,
  };

  console.log(`#${conv.id} (external_id=${conv.external_id})`);
  console.log(`  visitor_name: "${conv.visitor_name}" -> "${newName}"`);
  console.log(`  visitor_info.is_group: ${visitorInfo.is_group} -> false`);
  console.log(`  visitor_info.group_id: ${JSON.stringify(visitorInfo.group_id)} -> null`);
  console.log(`  visitor_info.group_name: ${JSON.stringify(visitorInfo.group_name)} -> null`);

  if (APPLY) {
    await db.query(
      `UPDATE zalo_personal_conversations SET visitor_name = $1, visitor_info = $2 WHERE id = $3`,
      [newName, JSON.stringify(newVisitorInfo), conv.id]
    );

    // Also clean up message-level metadata for this conversation
    await db.query(
      `UPDATE zalo_personal_messages
          SET metadata = jsonb_set(jsonb_set(jsonb_set(metadata, '{is_group}', 'false'), '{group_id}', 'null'), '{group_name}', 'null')
        WHERE id_conversation = $1
          AND metadata->>'is_group' = 'true'
          AND (metadata->>'group_id' IS NULL OR metadata->>'group_id' IN ('null', 'undefined'))`,
      [conv.id]
    );
  }
  console.log('');
}

if (!APPLY) {
  console.log('Chạy lại với --apply để áp dụng các thay đổi trên.');
}

process.exit(0);
