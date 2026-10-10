import db from '../../config/database.js';

/**
 * Bảng `member_channel_accounts` (migration 283): nhân viên nào được dùng tài khoản kênh nào.
 * Kênh Zalo cá nhân (`account_ref` = id `zalo_settings` dạng chuỗi) + (PR-H1) Telegram, WhatsApp Baileys (xem cuối file).
 * `account_ref` là TEXT (chứa được session key WhatsApp) nên không có FK tới bảng tài khoản — code tự dọn khi xoá tài khoản.
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
export async function replaceZaloAccountAssignments({ ownerId, employeeId, accountIds, actorUserId }, externalClient = null) {
  // `externalClient`: chạy chung giao dịch của chỗ gọi (đổi nhiều kênh một lúc — `replaceChannelAssignments`), khi đó
  // KHÔNG tự BEGIN / COMMIT / release; chỗ gọi lo.
  const client = externalClient || await db.getClient();
  try {
    if (!externalClient) await client.query('BEGIN');

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
    if (!externalClient) await client.query('COMMIT');
    return { before, after: wanted };
  } catch (error) {
    if (!externalClient) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (!externalClient) client.release();
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

// ─── Telegram + WhatsApp Baileys (PLAN_GIAO_TK_TG_WA, PR-H1) ───────────────────────────────────────────────────────
// Cùng bảng, `channel` khác:
//   'telegram'          account_ref = telegram_accounts.id (chuỗi). Id SERIAL nên không bị dùng lại.
//   'whatsapp_baileys'  account_ref = session_key ĐẦY ĐỦ "<idChủ>-<khoáNgắn>". KHÔNG có bảng tài khoản (phiên sống ở
//                       whatsapp_baileys_session_creds) và khoá dùng lại được sau khi xoá → hàng giao mồ côi sẽ "sống
//                       lại" nếu không dọn: xoá phiên thì xoá hàng giao (`deleteAssignmentsByRef`), tạo khoá mới thì xoá
//                       hàng cũ cùng khoá trước khi chèn `self_login`.
export const TELEGRAM_CHANNEL = 'telegram';
export const WHATSAPP_BAILEYS_CHANNEL = 'whatsapp_baileys';
const WHATSAPP_SESSION_KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Khoá phiên WhatsApp thuộc chủ `ownerId` (tiền tố `<idChủ>-`, phần còn lại ký tự an toàn). */
export function isWhatsAppSessionKeyOfOwner(ownerId, sessionKey) {
  const owner = Number(ownerId);
  const key = String(sessionKey ?? '');
  return Number.isSafeInteger(owner) && owner > 0
    && WHATSAPP_SESSION_KEY_PATTERN.test(key)
    && key.startsWith(`${owner}-`)
    && key.length > `${owner}-`.length;
}

/**
 * Id tài khoản Telegram (chuỗi) nhân viên được giao TRONG không gian của chủ. JOIN `telegram_accounts` theo cả `id_user`.
 * KHÔNG nuốt lỗi (service quyết định "lỗi thì chặn").
 *
 * @returns {Promise<string[]>}
 */
export async function findAssignedTelegramAccountRefs(ownerId, employeeId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT ta.id
       FROM member_channel_accounts mca
       JOIN telegram_accounts ta ON ta.id::text = mca.account_ref AND ta.id_user = mca.owner_id
      WHERE mca.owner_id = $1
        AND mca.employee_id = $2
        AND mca.channel = $3
      ORDER BY ta.id`,
    [ownerId, employeeId, TELEGRAM_CHANNEL]
  );
  return rows.map((row) => String(row.id));
}

/**
 * Khoá phiên WhatsApp nhân viên được giao. Không có bảng tài khoản để JOIN nên chỉ ép tiền tố chủ
 * (`account_ref` phải bắt đầu bằng `<owner_id>-`): hàng trỏ sang khoá của chủ khác không cho thêm quyền.
 *
 * @returns {Promise<string[]>}
 */
export async function findAssignedWhatsAppSessionKeys(ownerId, employeeId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT mca.account_ref
       FROM member_channel_accounts mca
      WHERE mca.owner_id = $1
        AND mca.employee_id = $2
        AND mca.channel = $3
        AND mca.account_ref LIKE (mca.owner_id::text || '-%')
      ORDER BY mca.account_ref`,
    [ownerId, employeeId, WHATSAPP_BAILEYS_CHANNEL]
  );
  return rows.map((row) => String(row.account_ref));
}

/**
 * Mọi tài khoản Telegram của chủ + việc giao cho nhân viên này (màn Quản lý nhân viên).
 *
 * @returns {Promise<Array<object>>}
 */
export async function listOwnerTelegramAccountsWithAssignment(ownerId, employeeId) {
  const { rows } = await db.query(
    `SELECT ta.id, ta.first_name, ta.last_name, ta.username, ta.phone, ta.is_active,
            mca.source AS assignment_source
       FROM telegram_accounts ta
       LEFT JOIN member_channel_accounts mca
              ON mca.account_ref = ta.id::text
             AND mca.owner_id = ta.id_user
             AND mca.employee_id = $2
             AND mca.channel = $3
      WHERE ta.id_user = $1
      ORDER BY ta.created_at DESC, ta.id DESC`,
    [ownerId, employeeId, TELEGRAM_CHANNEL]
  );
  return rows;
}

/**
 * Khoá phiên WhatsApp (đã lưu creds) của chủ + nguồn giao cho nhân viên này (null nếu chưa giao).
 *
 * @returns {Promise<Array<{ session_key: string, assignment_source: string|null }>>}
 */
export async function listOwnerWhatsAppSessionsWithAssignment(ownerId, employeeId) {
  const { rows } = await db.query(
    `SELECT c.session_key, mca.source AS assignment_source
       FROM whatsapp_baileys_session_creds c
       LEFT JOIN member_channel_accounts mca
              ON mca.account_ref = c.session_key
             AND mca.owner_id = $1
             AND mca.employee_id = $2
             AND mca.channel = $3
      WHERE c.session_key LIKE ($1::text || '-%')
      ORDER BY c.session_key`,
    [ownerId, employeeId, WHATSAPP_BAILEYS_CHANNEL]
  );
  return rows;
}

/**
 * Thay TOÀN BỘ việc giao một kênh (Telegram / WhatsApp Baileys) của một nhân viên — trong giao dịch của `client`.
 * Ref không thuộc chủ bị loại im lặng. Hàng đang có và còn trong danh sách mới được GIỮ NGUYÊN (giữ `source`).
 */
async function replaceExtraChannelInTx(client, { ownerId, employeeId, channel, refs, actorUserId }) {
  const requested = Array.from(new Set((refs || []).map((ref) => String(ref).trim()).filter(Boolean)));
  let wanted;
  let before;
  if (channel === TELEGRAM_CHANNEL) {
    const numeric = requested.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0);
    const owned = numeric.length
      ? await client.query(`SELECT id FROM telegram_accounts WHERE id_user = $1 AND id = ANY($2::bigint[])`, [ownerId, numeric])
      : { rows: [] };
    wanted = owned.rows.map((row) => String(row.id)).sort((a, b) => Number(a) - Number(b));
    before = await findAssignedTelegramAccountRefs(ownerId, employeeId, client);
  } else {
    const validKeys = requested.filter((key) => isWhatsAppSessionKeyOfOwner(ownerId, key));
    const owned = validKeys.length
      ? await client.query(`SELECT session_key FROM whatsapp_baileys_session_creds WHERE session_key = ANY($1::text[])`, [validKeys])
      : { rows: [] };
    wanted = owned.rows.map((row) => String(row.session_key)).sort();
    before = await findAssignedWhatsAppSessionKeys(ownerId, employeeId, client);
  }

  await client.query(
    `DELETE FROM member_channel_accounts
      WHERE owner_id = $1 AND employee_id = $2 AND channel = $3
        AND account_ref <> ALL($4::text[])`,
    [ownerId, employeeId, channel, wanted]
  );
  if (wanted.length) {
    await client.query(
      `INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source, created_by)
       SELECT $1, $2, $3, ref, 'assigned', $5
         FROM unnest($4::text[]) AS ref
       ON CONFLICT (owner_id, employee_id, channel, account_ref) DO NOTHING`,
      [ownerId, employeeId, channel, wanted, actorUserId]
    );
  }
  return { before, after: wanted };
}

/**
 * Đổi việc giao của NHIỀU kênh trong MỘT giao dịch (một lần bump `user_members.updated_at`). Khoá vắng mặt (`undefined`)
 * = GIỮ NGUYÊN kênh đó, không đụng một hàng nào — để bản FE cũ chỉ gửi Zalo không làm mất việc giao Telegram / WhatsApp.
 *
 * @param {{ ownerId: number, employeeId: number, actorUserId: number,
 *           zaloAccountIds?: Array<number|string>, telegramAccountIds?: Array<number|string>, whatsappSessionKeys?: string[] }} input
 * @returns {Promise<{ zalo: ({before:number[],after:number[]}|null), telegram: ({before:string[],after:string[]}|null), whatsapp: ({before:string[],after:string[]}|null) }>}
 */
export async function replaceChannelAssignments({ ownerId, employeeId, actorUserId, zaloAccountIds, telegramAccountIds, whatsappSessionKeys }) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const result = { zalo: null, telegram: null, whatsapp: null };
    if (zaloAccountIds !== undefined) {
      result.zalo = await replaceZaloAccountAssignments({ ownerId, employeeId, accountIds: zaloAccountIds, actorUserId }, client);
    }
    if (telegramAccountIds !== undefined) {
      result.telegram = await replaceExtraChannelInTx(client, {
        ownerId, employeeId, channel: TELEGRAM_CHANNEL, refs: telegramAccountIds, actorUserId,
      });
    }
    if (whatsappSessionKeys !== undefined) {
      result.whatsapp = await replaceExtraChannelInTx(client, {
        ownerId, employeeId, channel: WHATSAPP_BAILEYS_CHANNEL, refs: whatsappSessionKeys, actorUserId,
      });
    }
    await touchMembership(ownerId, employeeId, client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Nhân viên tự đăng nhập tạo tài khoản Telegram / WhatsApp MỚI → tự được giao (`source = 'self_login'`). Truyền `client`
 * để chạy chung giao dịch với việc tạo tài khoản. Với WhatsApp: xoá hàng cũ cùng khoá của MỌI nhân viên trước (khoá dùng lại).
 *
 * @param {{ ownerId: number, employeeId: number, channel: 'telegram'|'whatsapp_baileys', ref: string|number }} input
 */
export async function insertSelfLoginChannelAssignment({ ownerId, employeeId, channel, ref }, queryable = db) {
  if (channel === WHATSAPP_BAILEYS_CHANNEL) {
    await queryable.query(
      `DELETE FROM member_channel_accounts WHERE channel = $1 AND account_ref = $2`,
      [WHATSAPP_BAILEYS_CHANNEL, String(ref)]
    );
  }
  await queryable.query(
    `INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source, created_by)
     VALUES ($1, $2, $3, $4, 'self_login', $2)
     ON CONFLICT (owner_id, employee_id, channel, account_ref) DO NOTHING`,
    [ownerId, employeeId, channel, String(ref)]
  );
  await touchMembership(ownerId, employeeId, queryable);
}

/**
 * Xoá mọi hàng giao của MỘT tài khoản (mọi nhân viên) — gọi khi xoá tài khoản / phiên. Bảo vệ khỏi khoá WhatsApp dùng lại.
 *
 * @param {'telegram'|'whatsapp_baileys'} channel
 * @param {string|number} ref
 */
export async function deleteAssignmentsByRef(channel, ref, queryable = db) {
  await queryable.query(
    `DELETE FROM member_channel_accounts WHERE channel = $1 AND account_ref = $2`,
    [channel, String(ref)]
  );
}
