import db from '../../config/database.js';

/**
 * Bảng `member_channel_accounts` (migration 283): nhân viên nào được dùng tài khoản kênh nào.
 * Hiện chỉ có kênh Zalo cá nhân; `account_ref` là id `zalo_settings` dạng chuỗi (TEXT để sau này chứa được
 * session key WhatsApp), nên không có FK tới `zalo_settings` — code tự dọn khi xoá tài khoản.
 */
export const ZALO_PERSONAL_CHANNEL = 'zalo_personal';

/**
 * Id tài khoản Zalo mà nhân viên được giao TRONG không gian của `ownerId`.
 * JOIN `zalo_settings` theo cả `id_user = owner_id`: hàng giao trỏ tới tài khoản đã xoá hoặc của chủ khác
 * (dữ liệu lệch) không bao giờ cho thêm quyền.
 *
 * KHÔNG nuốt lỗi ở đây — chỗ gọi (service) quyết định "lỗi thì chặn".
 *
 * @param {number} ownerId
 * @param {number} employeeId
 * @param {{ query: Function }} [queryable]
 * @returns {Promise<number[]>}
 */
export async function findAssignedZaloAccountIds(ownerId, employeeId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT zs.id
       FROM member_channel_accounts mca
       JOIN zalo_settings zs ON zs.id::text = mca.account_ref AND zs.id_user = mca.owner_id
      WHERE mca.owner_id = $1
        AND mca.employee_id = $2
        AND mca.channel = $3
      ORDER BY zs.id`,
    [ownerId, employeeId, ZALO_PERSONAL_CHANNEL]
  );
  return rows.map((row) => Number(row.id));
}

/**
 * Mọi tài khoản Zalo của chủ, kèm việc nhân viên này đã được giao chưa (và nguồn giao).
 *
 * @param {number} ownerId
 * @param {number} employeeId
 * @returns {Promise<Array<object>>}
 */
export async function listOwnerZaloAccountsWithAssignment(ownerId, employeeId) {
  const { rows } = await db.query(
    `SELECT zs.id, zs.display_name, zs.zalo_name, zs.zalo_phone, zs.status, zs.is_active, zs.is_default,
            mca.source AS assignment_source
       FROM zalo_settings zs
       LEFT JOIN member_channel_accounts mca
              ON mca.account_ref = zs.id::text
             AND mca.owner_id = zs.id_user
             AND mca.employee_id = $2
             AND mca.channel = $3
      WHERE zs.id_user = $1
      ORDER BY zs.is_default DESC, zs.created_at DESC, zs.id DESC`,
    [ownerId, employeeId, ZALO_PERSONAL_CHANNEL]
  );
  return rows;
}

/**
 * Số nhân viên được giao từng tài khoản Zalo (hiện ở trang Zalo của chủ). Tách khỏi truy vấn danh sách để bảng giao
 * trục trặc không làm hỏng danh sách tài khoản của chủ.
 *
 * @param {number[]} accountIds
 * @returns {Promise<Map<number, number>>} id tài khoản → số nhân viên
 */
export async function countAssignedEmployeesByZaloAccount(accountIds) {
  const refs = (accountIds || []).map((id) => String(Number(id))).filter((ref) => /^\d+$/.test(ref));
  if (!refs.length) return new Map();
  const { rows } = await db.query(
    `SELECT mca.account_ref, COUNT(*)::int AS total
       FROM member_channel_accounts mca
       JOIN zalo_settings zs ON zs.id::text = mca.account_ref AND zs.id_user = mca.owner_id
      WHERE mca.channel = $1 AND mca.account_ref = ANY($2::text[])
      GROUP BY mca.account_ref`,
    [ZALO_PERSONAL_CHANNEL, refs]
  );
  return new Map(rows.map((row) => [Number(row.account_ref), Number(row.total)]));
}

/**
 * Thay TOÀN BỘ việc giao Zalo cá nhân của một nhân viên. Id không thuộc chủ bị loại (không báo lỗi).
 * Hàng đang có và vẫn nằm trong danh sách mới được GIỮ NGUYÊN (giữ `source`, `created_by`, `created_at`).
 * Cùng giao dịch bump `user_members.updated_at` (= `permissionRevision` trong activeContext).
 *
 * @param {{ ownerId: number, employeeId: number, accountIds: number[], actorUserId: number }} input
 * @returns {Promise<{ before: number[], after: number[] }>}
 */
export async function replaceZaloAccountAssignments({ ownerId, employeeId, accountIds, actorUserId }) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const requested = Array.from(new Set((accountIds || []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0)));
    const ownedRes = requested.length
      ? await client.query(
        `SELECT id FROM zalo_settings WHERE id_user = $1 AND id = ANY($2::bigint[])`,
        [ownerId, requested]
      )
      : { rows: [] };
    const wanted = ownedRes.rows.map((row) => Number(row.id)).sort((a, b) => a - b);
    const wantedRefs = wanted.map(String);

    const before = await findAssignedZaloAccountIds(ownerId, employeeId, client);

    await client.query(
      `DELETE FROM member_channel_accounts
        WHERE owner_id = $1 AND employee_id = $2 AND channel = $3
          AND account_ref <> ALL($4::text[])`,
      [ownerId, employeeId, ZALO_PERSONAL_CHANNEL, wantedRefs]
    );

    if (wantedRefs.length) {
      await client.query(
        `INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source, created_by)
         SELECT $1, $2, $3, ref, 'assigned', $5
           FROM unnest($4::text[]) AS ref
         ON CONFLICT (owner_id, employee_id, channel, account_ref) DO NOTHING`,
        [ownerId, employeeId, ZALO_PERSONAL_CHANNEL, wantedRefs, actorUserId]
      );
    }

    await touchMembership(ownerId, employeeId, client);
    await client.query('COMMIT');
    return { before, after: wanted };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Nhân viên tự quét QR và tạo hàng `zalo_settings` MỚI → tự được giao (`source = 'self_login'`).
 * Truyền `client` để chạy chung giao dịch với việc chèn hàng tài khoản (cả hai cùng thành công hoặc cùng huỷ).
 *
 * @param {{ ownerId: number, employeeId: number, accountId: number }} input
 * @param {{ query: Function }} [queryable]
 */
export async function insertSelfLoginZaloAssignment({ ownerId, employeeId, accountId }, queryable = db) {
  await queryable.query(
    `INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source, created_by)
     VALUES ($1, $2, $3, $4, 'self_login', $2)
     ON CONFLICT (owner_id, employee_id, channel, account_ref) DO NOTHING`,
    [ownerId, employeeId, ZALO_PERSONAL_CHANNEL, String(accountId)]
  );
  await touchMembership(ownerId, employeeId, queryable);
}

/**
 * Bump `user_members.updated_at` — mốc `permissionRevision` mà auth.middleware đưa vào activeContext.
 *
 * @param {number} ownerId
 * @param {number} employeeId
 * @param {{ query: Function }} [queryable]
 */
export async function touchMembership(ownerId, employeeId, queryable = db) {
  await queryable.query(
    `UPDATE user_members SET updated_at = CURRENT_TIMESTAMP WHERE owner_id = $1 AND employee_id = $2`,
    [ownerId, employeeId]
  );
}

/**
 * Xoá mọi việc giao của một nhân viên trong không gian của chủ (gỡ khỏi nhóm / từ chối lời mời).
 *
 * @param {number} ownerId
 * @param {number} employeeId
 * @param {{ query: Function }} [queryable]
 */
export async function deleteAssignmentsForEmployee(ownerId, employeeId, queryable = db) {
  await queryable.query(
    `DELETE FROM member_channel_accounts WHERE owner_id = $1 AND employee_id = $2`,
    [ownerId, employeeId]
  );
}
