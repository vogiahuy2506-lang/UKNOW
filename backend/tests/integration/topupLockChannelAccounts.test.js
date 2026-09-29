/**
 * P6 (PLAN_TG_WA_DAY_DU) — khoá tài khoản Telegram/WhatsApp sau hạ gói / slot mua thêm hết hạn.
 * CSDL thật: reconcile khoá đúng cái THÊM SAU CÙNG, cổng tra khoá đúng, mở khoá khi mua slot, WhatsApp khoá qua
 * whatsapp_account_settings.id (migration 268) và không đếm phiên đã xoá.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const { reconcileResourceLocks, getLockOverview, LOCKABLE_RESOURCE_KEYS } =
  await import('../../src/services/payment/topupLock.service.js');
const { resourceIsLocked, whatsappSessionIsLocked } = await import('../../src/utils/topupLockGate.util.js');

async function makeOwner(username, { maxTelegram = null, maxWhatsapp = null } = {}) {
  const owner = await createUser({ username });
  await db.query(
    `UPDATE users SET max_telegram_accounts = $1, max_whatsapp_accounts = $2 WHERE id = $3`,
    [maxTelegram, maxWhatsapp, owner.id]
  );
  return owner;
}

async function addTelegramAccounts(ownerId, n) {
  const ids = [];
  for (let i = 0; i < n; i += 1) {
    const { rows } = await db.query(
      `INSERT INTO telegram_accounts (id_user, telegram_user_id, username, is_active)
       VALUES ($1, $2, $3, TRUE) RETURNING id`,
      [ownerId, Date.now() * 10 + i + Math.floor(Math.random() * 1000000), `tg_${i}`]
    );
    ids.push(Number(rows[0].id));
  }
  return ids;
}

async function addWhatsappSession(sessionKey, minutesAgo) {
  await db.query(
    `INSERT INTO whatsapp_baileys_session_creds (session_key, creds, updated_at)
     VALUES ($1, '{}'::jsonb, NOW() - ($2::text || ' minutes')::interval)`,
    [sessionKey, String(minutesAgo)]
  );
}

async function grantSlot(userId, itemKey, qty) {
  const { rows } = await db.query(
    `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, payment_method, note, topup_config)
     VALUES ($1, NULL, 50000, $2, $3, 'success', 'payos', 'topup', '{}'::jsonb) RETURNING id`,
    [Date.now() * 100 + Math.floor(Math.random() * 99), `grant-${userId}@test.local`, userId]
  );
  await db.query(
    `INSERT INTO topup_grants (user_id, item_key, qty, order_id, cycle_end)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '20 days')`,
    [userId, itemKey, qty, rows[0].id]
  );
}

describe('P6 — khoá tài khoản Telegram/WhatsApp', () => {
  beforeAll(() => {});
  beforeEach(async () => {
    await truncateAll();
    // truncateAll không dọn bảng phiên WhatsApp (khoá session_key chứa id user, id user lặp lại giữa các ca).
    await db.query('DELETE FROM whatsapp_account_settings');
    await db.query('DELETE FROM whatsapp_baileys_session_creds');
  });

  it('LOCKABLE_RESOURCE_KEYS có telegram_accounts + whatsapp_accounts', () => {
    expect(LOCKABLE_RESOURCE_KEYS).toEqual(expect.arrayContaining(['telegram_accounts', 'whatsapp_accounts']));
  });

  it('Telegram: 3 tài khoản, trần 1 → reconcile khoá 2 tài khoản THÊM SAU CÙNG; cổng resourceIsLocked khớp', async () => {
    const owner = await makeOwner('p6-tg-owner', { maxTelegram: 1 });
    const [a, b, c] = await addTelegramAccounts(owner.id, 3);

    const result = await reconcileResourceLocks(owner.id, db);
    const locked = result.locked.filter((l) => l.resourceKey === 'telegram_accounts').map((l) => l.resourceId);
    expect(locked.sort((x, y) => x - y)).toEqual([b, c]);

    expect(await resourceIsLocked('telegram_accounts', a)).toBe(false);
    expect(await resourceIsLocked('telegram_accounts', b)).toBe(true);
    expect(await resourceIsLocked('telegram_accounts', c)).toBe(true);

    // Chạy lần 2: không khoá thêm, không mở nhầm.
    const again = await reconcileResourceLocks(owner.id, db);
    expect(again.locked).toEqual([]);
    expect(again.unlocked).toEqual([]);
  });

  it('Telegram: trần NULL (không giới hạn) → không khoá gì', async () => {
    const owner = await makeOwner('p6-tg-unlimited', { maxTelegram: null });
    await addTelegramAccounts(owner.id, 3);
    const result = await reconcileResourceLocks(owner.id, db);
    expect(result.locked.filter((l) => l.resourceKey === 'telegram_accounts')).toEqual([]);
  });

  it('Telegram: mua thêm 1 slot (grant còn hạn) → MỞ khoá đúng 1 tài khoản (khoá gần nhất trước)', async () => {
    const owner = await makeOwner('p6-tg-grant', { maxTelegram: 1 });
    const [a, b, c] = await addTelegramAccounts(owner.id, 3);
    await reconcileResourceLocks(owner.id, db);
    await grantSlot(owner.id, 'telegram_accounts', 1);

    const result = await reconcileResourceLocks(owner.id, db);
    const unlocked = result.unlocked.filter((l) => l.resourceKey === 'telegram_accounts');
    expect(unlocked).toHaveLength(1);
    expect(await resourceIsLocked('telegram_accounts', a)).toBe(false);
    const stillLocked = [await resourceIsLocked('telegram_accounts', b), await resourceIsLocked('telegram_accounts', c)];
    expect(stillLocked.filter(Boolean)).toHaveLength(1);
  });

  it('WhatsApp: 3 phiên, trần 1 → dòng settings được tạo, khoá 2 phiên THÊM SAU CÙNG; whatsappSessionIsLocked khớp', async () => {
    const owner = await makeOwner('p6-wa-owner', { maxWhatsapp: 1 });
    const other = await makeOwner('p6-wa-other', { maxWhatsapp: 1 });
    const keyA = `${owner.id}-a`;
    const keyB = `${owner.id}-b`;
    const keyC = `${owner.id}-c`;
    await addWhatsappSession(keyA, 30); // cũ nhất
    await addWhatsappSession(keyB, 20);
    await addWhatsappSession(keyC, 10); // mới nhất
    await addWhatsappSession(`${other.id}-x`, 5); // phiên của chủ khác — không được đếm/khoá lẫn

    const result = await reconcileResourceLocks(owner.id, db);
    expect(result.locked.filter((l) => l.resourceKey === 'whatsapp_accounts')).toHaveLength(2);

    expect(await whatsappSessionIsLocked(keyA)).toBe(false);
    expect(await whatsappSessionIsLocked(keyB)).toBe(true);
    expect(await whatsappSessionIsLocked(keyC)).toBe(true);
    expect(await whatsappSessionIsLocked(`${other.id}-x`)).toBe(false);
    expect(await whatsappSessionIsLocked('khong-co-phien-nay')).toBe(false);

    // topup_locked_resources dùng id số của whatsapp_account_settings
    const { rows } = await db.query(
      `SELECT s.session_key
       FROM topup_locked_resources t JOIN whatsapp_account_settings s ON s.id = t.resource_id
       WHERE t.user_id = $1 AND t.resource_key = 'whatsapp_accounts' ORDER BY s.session_key`,
      [owner.id]
    );
    expect(rows.map((r) => r.session_key)).toEqual([keyB, keyC]);
  });

  it('WhatsApp: phiên đã xoá (creds mất, dòng settings còn sót) KHÔNG được đếm và khoá của nó được dọn', async () => {
    const owner = await makeOwner('p6-wa-deleted', { maxWhatsapp: 1 });
    const keyA = `${owner.id}-a`;
    const keyB = `${owner.id}-b`;
    await addWhatsappSession(keyA, 20);
    await addWhatsappSession(keyB, 10);
    await reconcileResourceLocks(owner.id, db);
    expect(await whatsappSessionIsLocked(keyB)).toBe(true);

    // Người dùng xoá phiên B: creds mất, settings sót lại.
    await db.query(`DELETE FROM whatsapp_baileys_session_creds WHERE session_key = $1`, [keyB]);
    const result = await reconcileResourceLocks(owner.id, db);
    expect(result.locked).toEqual([]);
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM topup_locked_resources WHERE user_id = $1 AND resource_key = 'whatsapp_accounts'`,
      [owner.id]
    );
    expect(rows[0].n).toBe(0);
  });

  it('getLockOverview trả đủ 2 khoá mới với nhãn + trần', async () => {
    const owner = await makeOwner('p6-overview', { maxTelegram: 1, maxWhatsapp: 1 });
    await addTelegramAccounts(owner.id, 2);
    await addWhatsappSession(`${owner.id}-a`, 20);
    await addWhatsappSession(`${owner.id}-b`, 10);
    await reconcileResourceLocks(owner.id, db);

    const overview = await getLockOverview(owner.id, db);
    expect(overview.telegram_accounts.items).toHaveLength(2);
    expect(overview.telegram_accounts.items.filter((i) => i.isLocked)).toHaveLength(1);
    expect(overview.telegram_accounts.effectiveCeiling).toBe(1);
    expect(overview.whatsapp_accounts.items).toHaveLength(2);
    expect(overview.whatsapp_accounts.items.filter((i) => i.isLocked)).toHaveLength(1);
    expect(overview.whatsapp_accounts.items[0].label).toMatch(/WhatsApp/);
  });
});
