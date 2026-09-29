/**
 * PLAN_TG_WA_DAY_DU_2026-09-29, P4 — SQL thật: (1) bộ đếm tin kênh adapter theo tài khoản/ngày VN
 * (`countChannelSentTodayByAccount` trên campaign_channel_messages), (2) cấu hình gửi theo tài khoản
 * (telegram_accounts.* + whatsapp_account_settings) qua repository.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import { countChannelSentTodayByAccount } from '../../src/repositories/sendQuota.repository.js';
import { checkAccountDailyLimit } from '../../src/services/quota/accountDailyLimit.service.js';
import channelAccountSettingsRepository from '../../src/repositories/campaign/channelAccountSettings.repository.js';

beforeEach(async () => {
  await truncateAll();
});

const DAY_START = new Date('2026-09-22T00:00:00+07:00');
const DAY_END = new Date('2026-09-23T00:00:00+07:00');
const IN_DAY = new Date('2026-09-22T10:00:00+07:00');
const BEFORE_DAY = new Date('2026-09-21T23:59:59+07:00');
const AFTER_DAY = new Date('2026-09-23T00:00:01+07:00');

async function insertCcm({ channel = 'telegram', accountKey, status = 'sent', isPreview = false, sentAt = IN_DAY }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_channel_messages (channel, account_key, recipient_key, status, is_preview, sent_at)
     VALUES ($1, $2, 'r-' || gen_random_uuid(), $3, $4, $5::timestamptz) RETURNING id`,
    [channel, accountKey, status, isPreview, sentAt]
  );
  return rows[0].id;
}

describe('countChannelSentTodayByAccount', () => {
  it('đếm đúng tin đã gửi trong ngày cho ĐÚNG tài khoản', async () => {
    await insertCcm({ accountKey: '11' });
    await insertCcm({ accountKey: '11' });
    await insertCcm({ accountKey: '11' });
    expect(await countChannelSentTodayByAccount(db, 'telegram', '11', DAY_START, DAY_END)).toBe(3);
  });

  it('is_preview = true (gửi nhanh) KHÔNG được đếm', async () => {
    await insertCcm({ accountKey: '12' });
    await insertCcm({ accountKey: '12', isPreview: true });
    await insertCcm({ accountKey: '12', isPreview: true });
    expect(await countChannelSentTodayByAccount(db, 'telegram', '12', DAY_START, DAY_END)).toBe(1);
  });

  it("status khác 'sent' (queued/failed) KHÔNG được đếm", async () => {
    await insertCcm({ accountKey: '13' });
    await insertCcm({ accountKey: '13', status: 'queued' });
    await insertCcm({ accountKey: '13', status: 'failed' });
    expect(await countChannelSentTodayByAccount(db, 'telegram', '13', DAY_START, DAY_END)).toBe(1);
  });

  it('tài khoản khác và kênh khác không bị lẫn vào (cùng account_key khác kênh)', async () => {
    await insertCcm({ accountKey: '14' });
    await insertCcm({ accountKey: '15' });
    await insertCcm({ accountKey: '15' });
    await insertCcm({ channel: 'whatsapp', accountKey: '15' });
    expect(await countChannelSentTodayByAccount(db, 'telegram', '14', DAY_START, DAY_END)).toBe(1);
    expect(await countChannelSentTodayByAccount(db, 'telegram', '15', DAY_START, DAY_END)).toBe(2);
    expect(await countChannelSentTodayByAccount(db, 'whatsapp', '15', DAY_START, DAY_END)).toBe(1);
  });

  it('WhatsApp đếm theo sessionKey (chuỗi)', async () => {
    await insertCcm({ channel: 'whatsapp', accountKey: '7-main' });
    await insertCcm({ channel: 'whatsapp', accountKey: '7-main' });
    await insertCcm({ channel: 'whatsapp', accountKey: '7-other' });
    expect(await countChannelSentTodayByAccount(db, 'whatsapp', '7-main', DAY_START, DAY_END)).toBe(2);
  });

  it('ngoài khung ngày VN (trước 00:00 hoặc từ 00:00 hôm sau) không được đếm', async () => {
    await insertCcm({ accountKey: '16', sentAt: BEFORE_DAY });
    await insertCcm({ accountKey: '16', sentAt: IN_DAY });
    await insertCcm({ accountKey: '16', sentAt: AFTER_DAY });
    expect(await countChannelSentTodayByAccount(db, 'telegram', '16', DAY_START, DAY_END)).toBe(1);
  });

  it('checkAccountDailyLimit đầu-cuối: chạm trần chặn kèm resetAt = 00:00 VN hôm sau', async () => {
    await insertCcm({ accountKey: '17' });
    await insertCcm({ accountKey: '17' });
    const now = new Date('2026-09-22T09:00:00+07:00');
    // Đếm theo "hôm nay" tính từ `now`: chèn lại mốc IN_DAY -> nằm trong ngày 22/09 VN.
    const blocked = await checkAccountDailyLimit({ channel: 'telegram', accountId: '17', limit: 2, now });
    expect(blocked.allowed).toBe(false);
    expect(blocked.currentCount).toBe(2);
    expect(blocked.resetAt.toISOString()).toBe(DAY_END.toISOString());
    const allowed = await checkAccountDailyLimit({ channel: 'telegram', accountId: '17', limit: 3, now });
    expect(allowed).toEqual({ allowed: true });
  });
});

describe('channelAccountSettings.repository', () => {
  async function createTelegramAccount(userId, telegramUserId) {
    const { rows } = await db.query(
      `INSERT INTO telegram_accounts (id_user, telegram_user_id) VALUES ($1, $2) RETURNING id`,
      [userId, telegramUserId]
    );
    return rows[0].id;
  }

  it('Telegram: mặc định NULL; cập nhật từng phần (vắng = giữ nguyên, null = xoá); chủ khác không sửa được', async () => {
    const owner = await createUser({ role: 'user', username: 'cas_owner' });
    const other = await createUser({ role: 'user', username: 'cas_other' });
    const id = await createTelegramAccount(owner.id, 9001);

    expect(await channelAccountSettingsRepository.getSendSettings('telegram', id, owner.id))
      .toEqual({ userDailySendLimit: null, delayMinMs: null, delayMaxMs: null });

    await channelAccountSettingsRepository.updateSendSettings('telegram', id, owner.id, { userDailySendLimit: 120 });
    await channelAccountSettingsRepository.updateSendSettings('telegram', id, owner.id, { delayMinMs: 3000, delayMaxMs: 6000 });
    expect(await channelAccountSettingsRepository.getSendSettings('telegram', id, owner.id))
      .toEqual({ userDailySendLimit: 120, delayMinMs: 3000, delayMaxMs: 6000 });

    await channelAccountSettingsRepository.updateSendSettings('telegram', id, owner.id, { userDailySendLimit: null });
    expect(await channelAccountSettingsRepository.getSendSettings('telegram', id, owner.id))
      .toEqual({ userDailySendLimit: null, delayMinMs: 3000, delayMaxMs: 6000 });

    // Chủ khác: không thấy, không sửa.
    expect(await channelAccountSettingsRepository.getSendSettings('telegram', id, other.id)).toBeNull();
    expect(await channelAccountSettingsRepository.updateSendSettings('telegram', id, other.id, { userDailySendLimit: 1 })).toBeNull();
    expect((await channelAccountSettingsRepository.getSendSettings('telegram', id, owner.id)).userDailySendLimit).toBeNull();
  });

  it('WhatsApp: chưa có dòng = mặc định; upsert; cập nhật từng phần; chủ khác không đè được dòng của người khác', async () => {
    const owner = await createUser({ role: 'user', username: 'was_owner' });
    const other = await createUser({ role: 'user', username: 'was_other' });
    const key = `${owner.id}-main`;

    expect(await channelAccountSettingsRepository.getSendSettings('whatsapp', key, owner.id))
      .toEqual({ userDailySendLimit: null, delayMinMs: null, delayMaxMs: null });

    await channelAccountSettingsRepository.updateSendSettings('whatsapp', key, owner.id, { userDailySendLimit: 80 });
    await channelAccountSettingsRepository.updateSendSettings('whatsapp', key, owner.id, { delayMinMs: 5000, delayMaxMs: 10000 });
    expect(await channelAccountSettingsRepository.getSendSettings('whatsapp', key, owner.id))
      .toEqual({ userDailySendLimit: 80, delayMinMs: 5000, delayMaxMs: 10000 });

    // Người khác cố ghi cùng session_key: WHERE id_user = EXCLUDED.id_user chặn -> không đổi, trả null.
    const hijack = await channelAccountSettingsRepository.updateSendSettings('whatsapp', key, other.id, { userDailySendLimit: 1 });
    expect(hijack).toBeNull();
    expect((await channelAccountSettingsRepository.getSendSettings('whatsapp', key, owner.id)).userDailySendLimit).toBe(80);
  });
});
