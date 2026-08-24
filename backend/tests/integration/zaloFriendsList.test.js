/**
 * Vì sao có file này:
 *
 * Ngày 24/08/2026 người dùng bấm "Danh bạ Zalo" trong wizard chiến dịch và nhận
 * `column "name" does not exist`. Câu SQL đầu tiên của `listFriends` hỏi
 * `zalo_settings.name` và `zalo_settings.phone_number` — hai cột KHÔNG tồn tại (thật ra
 * là `display_name` và `zalo_phone`). Nó ném lỗi trước cả khi chạm bảng `zalo_friends`,
 * nên tính năng chưa từng chạy kể từ commit tạo ra nó (13240a2d, 17/08).
 *
 * Đã có unit test cho `listFriends` (`zaloPersonalFriends.spec.js`) và nó vẫn xanh suốt
 * một tuần — vì nó `jest.spyOn(db, 'query')`, tức chuỗi SQL không bao giờ chạy trên
 * schema thật. Tên cột sai là loại lỗi mà DB giả mù hoàn toàn.
 *
 * File này chạy truy vấn thật trên bootstrap.sql. Giữ nó ở tầng integration — chuyển
 * xuống unit với db mock là mất sạch giá trị.
 */
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';

let app;
let user;
let token;
let accountId;

async function loginAs(targetUser) {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: targetUser.username, password: targetUser.plainPassword });
  return login.body.data.accessToken;
}

async function createZaloAccount(ownerId) {
  const { rows } = await db.query(
    `INSERT INTO zalo_settings (id_user, display_name, zalo_name, zalo_phone, status, is_active, created_at, updated_at)
     VALUES ($1, 'Tài khoản test', 'Nhật Minh', '0388180855', 'connected', TRUE, NOW(), NOW())
     RETURNING id`,
    [ownerId]
  );
  return rows[0].id;
}

async function addFriends(settingId, friends) {
  for (const f of friends) {
    // eslint-disable-next-line no-await-in-loop
    await db.query(
      `INSERT INTO zalo_friends (id_zalo_setting, friend_id, display_name, phone, synced_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())`,
      [settingId, f.friendId, f.displayName, f.phone || null]
    );
  }
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  user = await createUser({ role: 'user' });
  user.plainPassword = 'Passw0rd!';
  token = await loginAs(user);
  accountId = await createZaloAccount(user.id);
});

describe('GET /api/ai/chatbot/zalo-personal/friends — chạy SQL thật', () => {
  it('trả về danh bạ, KHÔNG vỡ vì tên cột sai', async () => {
    await addFriends(accountId, [
      { friendId: 'uid-1', displayName: 'An Nguyễn', phone: '0900000001' },
      { friendId: 'uid-2', displayName: 'Bình Trần', phone: '0900000002' },
    ]);

    const res = await request(app)
      .get('/api/ai/chatbot/zalo-personal/friends')
      .set('Authorization', `Bearer ${token}`)
      .query({ accountId, page: 1, limit: 100 });

    // Trước khi sửa, đây là 500 kèm `column "name" does not exist`.
    expect(res.status).toBe(200);
    const payload = res.body.data || res.body;
    expect(payload.total).toBe(2);
    expect(payload.items.map((i) => i.display_name)).toEqual(['An Nguyễn', 'Bình Trần']);
  });

  it('danh bạ rỗng vẫn trả 200, không phải lỗi', async () => {
    const res = await request(app)
      .get('/api/ai/chatbot/zalo-personal/friends')
      .set('Authorization', `Bearer ${token}`)
      .query({ accountId });

    expect(res.status).toBe(200);
    const payload = res.body.data || res.body;
    expect(payload.total).toBe(0);
    expect(payload.items).toEqual([]);
  });

  it('tìm kiếm theo tên chạy đúng trên SQL thật', async () => {
    await addFriends(accountId, [
      { friendId: 'uid-1', displayName: 'An Nguyễn', phone: '0900000001' },
      { friendId: 'uid-2', displayName: 'Bình Trần', phone: '0900000002' },
    ]);

    const res = await request(app)
      .get('/api/ai/chatbot/zalo-personal/friends')
      .set('Authorization', `Bearer ${token}`)
      .query({ accountId, search: 'Bình' });

    expect(res.status).toBe(200);
    const payload = res.body.data || res.body;
    expect(payload.total).toBe(1);
    expect(payload.items[0].friend_id).toBe('uid-2');
  });

  it('tài khoản Zalo của người khác → 404, không rò danh bạ', async () => {
    const other = await createUser({ role: 'user' });
    const otherAccountId = await createZaloAccount(other.id);
    await addFriends(otherAccountId, [{ friendId: 'uid-x', displayName: 'Không được thấy' }]);

    const res = await request(app)
      .get('/api/ai/chatbot/zalo-personal/friends')
      .set('Authorization', `Bearer ${token}`)
      .query({ accountId: otherAccountId });

    expect(res.status).toBe(404);
  });
});
