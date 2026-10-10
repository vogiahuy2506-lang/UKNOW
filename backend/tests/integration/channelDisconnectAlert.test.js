/**
 * Integration — SQL thật của cron báo mất kết nối kênh (P3) + metric cảnh báo admin.
 * Mốc thời gian đặt tương đối bằng SQL/JS từ đồng hồ hiện tại (không ghi cứng ngày).
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import repo from '../../src/repositories/chatbot/channelDisconnectAlert.repository.js';
import { metricChannelDisconnected } from '../../src/repositories/admin/alert.repository.js';

const MIN = 60 * 1000;
const ago = (ms) => new Date(Date.now() - ms);

beforeEach(async () => {
  await truncateAll();
});

describe('channelDisconnectAlert.repository', () => {
  it('syncChannel ghi mốc, giữ last_alerted_at khi nối lại, dọn dòng không còn trong snapshot', async () => {
    const owner = await createUser({ role: 'user', username: 'cda_owner' });
    const now = new Date();
    await repo.syncChannel('telegram', [
      { accountRef: '111', idUser: owner.id, label: 'tg111', disconnectedSince: ago(30 * MIN) },
      { accountRef: '222', idUser: owner.id, label: 'tg222', disconnectedSince: null },
    ], now);
    await repo.markAlerted([{ channel: 'telegram', account_ref: '111' }], now);

    await repo.syncChannel('telegram', [
      { accountRef: '111', idUser: owner.id, label: 'tg111', disconnectedSince: null },
    ], now);

    const rows = await repo.listStatesByChannel('telegram');
    expect(rows.map((r) => r.account_ref)).toEqual(['111']);
    expect(rows[0].disconnected_since).toBeNull();
    expect(rows[0].last_alerted_at).not.toBeNull();
  });

  it('listDisconnectedWithOwner chỉ trả chủ active có email', async () => {
    const owner = await createUser({ role: 'user', username: 'cda_owner2' });
    const now = new Date();
    await repo.syncChannel('whatsapp', [
      { accountRef: `${owner.id}-main`, idUser: owner.id, label: 'wa', disconnectedSince: ago(20 * MIN) },
    ], now);
    let rows = await repo.listDisconnectedWithOwner();
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBeTruthy();

    await db.query(`UPDATE users SET status = 'inactive' WHERE id = $1`, [owner.id]);
    rows = await repo.listDisconnectedWithOwner();
    expect(rows).toHaveLength(0);
  });

  it('PR-6: chủ active có email RỖNG vẫn được trả (chuông không cần email; dispatcher tự bỏ phần email)', async () => {
    const owner = await createUser({ role: 'user', username: 'cda_owner3' });
    await db.query(`UPDATE users SET email = '' WHERE id = $1`, [owner.id]);
    await repo.syncChannel('telegram', [
      { accountRef: '333', idUser: owner.id, label: 'tg333', disconnectedSince: ago(20 * MIN) },
    ], new Date());

    const rows = await repo.listDisconnectedWithOwner();

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].id_user)).toBe(Number(owner.id));
  });
});

describe('metricChannelDisconnected', () => {
  it('đếm đúng kênh, đủ ngưỡng phút, và KHÔNG đếm tài khoản mất quá cận trên', async () => {
    const owner = await createUser({ role: 'user', username: 'cda_owner3' });
    const now = new Date();
    await repo.syncChannel('telegram', [
      { accountRef: 'fresh', idUser: owner.id, label: 'fresh', disconnectedSince: ago(5 * MIN) },
      { accountRef: 'due', idUser: owner.id, label: 'due', disconnectedSince: ago(45 * MIN) },
      { accountRef: 'stale', idUser: owner.id, label: 'stale', disconnectedSince: ago(8 * 24 * 60 * MIN) },
      { accountRef: 'up', idUser: owner.id, label: 'up', disconnectedSince: null },
    ], now);
    await repo.syncChannel('whatsapp', [
      { accountRef: `${owner.id}-a`, idUser: owner.id, label: 'a', disconnectedSince: ago(45 * MIN) },
    ], now);

    expect(await metricChannelDisconnected('telegram', 30, 7 * 24 * 60)).toBe(1);
    expect(await metricChannelDisconnected('whatsapp', 30, 7 * 24 * 60)).toBe(1);
  });
});

describe('snapshot queries', () => {
  it('listZaloSnapshot: down chỉ khi không connected VÀ đã có lần khôi phục lỗi/needs_reauth', async () => {
    const owner = await createUser({ role: 'user', username: 'cda_owner4' });
    const ins = (name, status, fails, active = true) =>
      db.query(
        `INSERT INTO zalo_settings (id_user, display_name, status, restore_fail_count, is_active)
         VALUES ($1, $2, $3, $4, $5)`,
        [owner.id, name, status, fails, active]
      );
    await ins('ok', 'connected', 0);
    await ins('logout', 'disconnected', 0); // người dùng tự đăng xuất — không báo
    await ins('failing', 'disconnected', 2);
    await ins('reauth', 'needs_reauth', 5);
    await ins('off', 'disconnected', 3, false); // đã tắt — không nằm trong snapshot

    const rows = await repo.listZaloSnapshot();
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.down]));
    expect(byLabel).toEqual({ ok: false, logout: false, failing: true, reauth: true });
  });
});
