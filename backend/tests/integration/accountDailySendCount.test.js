/**
 * PLAN_GIOI_HAN_GUI_THEO_NGAY_2026-09-22, Việc 1/2 — hai hàm đếm theo TÀI KHOẢN GỬI
 * (countEmailSentTodayByAccount / countZaloSentTodayByAccount). Đo trên DB thật để chứng minh:
 *   - đếm đúng theo id_email_setting / account_id (không lẫn tài khoản khác);
 *   - `is_preview = true` (chạy thử trong trình dựng) KHÔNG được đếm — bẫy 3 của plan;
 *   - trạng thái không phải "đã gửi" (email 'failed', zalo tracking_metadata.status khác 'sent')
 *     KHÔNG được đếm, dù `sent_at` đã có giá trị (ghi ngay lúc gửi thử/xếp hàng, trước khi biết
 *     kết quả — xem chú thích trong sendQuota.repository.js);
 *   - ngoài khung giờ VN trong ngày thì không đếm.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import { truncateAll } from './helpers/db.js';
import {
  countEmailSentTodayByAccount,
  countZaloSentTodayByAccount,
} from '../../src/repositories/sendQuota.repository.js';

beforeEach(async () => {
  await truncateAll();
});

const DAY_START = new Date('2026-09-22T00:00:00+07:00');
const DAY_END = new Date('2026-09-23T00:00:00+07:00');
const IN_DAY = new Date('2026-09-22T10:00:00+07:00');
const BEFORE_DAY = new Date('2026-09-21T23:59:59+07:00');
const AFTER_DAY = new Date('2026-09-23T00:00:01+07:00');

async function insertEmailMessage({ settingId, status = 'sent', isPreview = false, sentAt = IN_DAY }) {
  const { rows } = await db.query(
    `INSERT INTO email_messages (id_email_setting, status, is_preview, sent_at)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [settingId, status, isPreview, sentAt]
  );
  return rows[0].id;
}

async function insertZaloMessage({ accountId, trackingStatus = 'sent', isPreview = false, sentAt = IN_DAY }) {
  const { rows } = await db.query(
    `INSERT INTO zalo_messages (account_id, tracking_metadata, is_preview, sent_at)
     VALUES ($1, $2::jsonb, $3, $4) RETURNING id`,
    [accountId, JSON.stringify({ status: trackingStatus }), isPreview, sentAt]
  );
  return rows[0].id;
}

describe('countEmailSentTodayByAccount', () => {
  it('đếm đúng số tin đã gửi trong ngày cho ĐÚNG tài khoản', async () => {
    const settingId = 501;
    await insertEmailMessage({ settingId });
    await insertEmailMessage({ settingId });
    await insertEmailMessage({ settingId, status: 'delivered' });
    await insertEmailMessage({ settingId, status: 'bounced' }); // vẫn tính — đã tốn một lượt gửi SMTP

    const count = await countEmailSentTodayByAccount(db, settingId, DAY_START, DAY_END);
    expect(count).toBe(4);
  });

  it('is_preview = true (chạy thử trong trình dựng) KHÔNG được đếm', async () => {
    const settingId = 502;
    await insertEmailMessage({ settingId });
    await insertEmailMessage({ settingId, isPreview: true });
    await insertEmailMessage({ settingId, isPreview: true });

    const count = await countEmailSentTodayByAccount(db, settingId, DAY_START, DAY_END);
    expect(count).toBe(1);
  });

  it("status='failed' KHÔNG được đếm dù sent_at đã có giá trị (ghi lúc thử gửi, trước khi biết kết quả)", async () => {
    const settingId = 503;
    await insertEmailMessage({ settingId, status: 'sent' });
    await insertEmailMessage({ settingId, status: 'failed' });
    await insertEmailMessage({ settingId, status: 'pending' });

    const count = await countEmailSentTodayByAccount(db, settingId, DAY_START, DAY_END);
    expect(count).toBe(1);
  });

  it('tài khoản khác không bị lẫn vào', async () => {
    await insertEmailMessage({ settingId: 504 });
    await insertEmailMessage({ settingId: 505 });
    await insertEmailMessage({ settingId: 505 });

    expect(await countEmailSentTodayByAccount(db, 504, DAY_START, DAY_END)).toBe(1);
    expect(await countEmailSentTodayByAccount(db, 505, DAY_START, DAY_END)).toBe(2);
  });

  it('ngoài khung ngày VN (trước 00:00 hoặc từ 00:00 hôm sau) không được đếm', async () => {
    const settingId = 506;
    await insertEmailMessage({ settingId, sentAt: BEFORE_DAY });
    await insertEmailMessage({ settingId, sentAt: IN_DAY });
    await insertEmailMessage({ settingId, sentAt: AFTER_DAY });

    const count = await countEmailSentTodayByAccount(db, settingId, DAY_START, DAY_END);
    expect(count).toBe(1);
  });

  it('tài khoản chưa gửi tin nào → 0, không lỗi', async () => {
    const count = await countEmailSentTodayByAccount(db, 999999, DAY_START, DAY_END);
    expect(count).toBe(0);
  });
});

describe('countZaloSentTodayByAccount', () => {
  it('đếm đúng số tin đã gửi trong ngày cho ĐÚNG tài khoản (account_id)', async () => {
    const accountId = 601;
    await insertZaloMessage({ accountId });
    await insertZaloMessage({ accountId });
    await insertZaloMessage({ accountId });

    const count = await countZaloSentTodayByAccount(db, accountId, DAY_START, DAY_END);
    expect(count).toBe(3);
  });

  it('is_preview = true KHÔNG được đếm', async () => {
    const accountId = 602;
    await insertZaloMessage({ accountId });
    await insertZaloMessage({ accountId, isPreview: true });

    const count = await countZaloSentTodayByAccount(db, accountId, DAY_START, DAY_END);
    expect(count).toBe(1);
  });

  it("tracking_metadata.status khác 'sent' (queued/failed) KHÔNG được đếm dù sent_at đã có giá trị", async () => {
    const accountId = 603;
    await insertZaloMessage({ accountId, trackingStatus: 'sent' });
    await insertZaloMessage({ accountId, trackingStatus: 'queued' });
    await insertZaloMessage({ accountId, trackingStatus: 'failed' });

    const count = await countZaloSentTodayByAccount(db, accountId, DAY_START, DAY_END);
    expect(count).toBe(1);
  });

  it('tài khoản khác không bị lẫn vào', async () => {
    await insertZaloMessage({ accountId: 604 });
    await insertZaloMessage({ accountId: 605 });
    await insertZaloMessage({ accountId: 605 });

    expect(await countZaloSentTodayByAccount(db, 604, DAY_START, DAY_END)).toBe(1);
    expect(await countZaloSentTodayByAccount(db, 605, DAY_START, DAY_END)).toBe(2);
  });

  it('ngoài khung ngày VN không được đếm', async () => {
    const accountId = 606;
    await insertZaloMessage({ accountId, sentAt: BEFORE_DAY });
    await insertZaloMessage({ accountId, sentAt: IN_DAY });
    await insertZaloMessage({ accountId, sentAt: AFTER_DAY });

    const count = await countZaloSentTodayByAccount(db, accountId, DAY_START, DAY_END);
    expect(count).toBe(1);
  });

  it('tài khoản chưa gửi tin nào → 0, không lỗi', async () => {
    const count = await countZaloSentTodayByAccount(db, 999998, DAY_START, DAY_END);
    expect(count).toBe(0);
  });
});

/**
 * KHÔNG assert Postgres chọn index nào ở đây — đã thử hai lần và sai cả hai.
 *
 * Lần 1: chèn đúng một dòng rồi đòi kế hoạch nhắc tên index mới. Bảng gần rỗng, chưa ANALYZE, mọi
 * index cost ~8.17 nên planner chọn tuỳ ý: máy tôi ra index mới, CI ra `idx_zalo_messages_account_created`.
 * Lần 2: nạp 8.400 dòng + ANALYZE cho "chắc ăn". CI vẫn đỏ, và lần này chọn **Seq Scan**
 * (`cost=0.00..319.00 rows=12`) — vì 8.400 dòng vẫn là bảng bé, quét tuần tự rẻ hơn đi index.
 *
 * Bài học: lựa chọn của planner phụ thuộc kích thước bảng, thống kê, phiên bản Postgres và tham số
 * chi phí của từng máy. DB test dựng lại từ số không mỗi lượt nên không bao giờ giống production —
 * mọi phép kiểm kiểu này chỉ đọc được một lựa chọn may rủi, và "xanh" của nó không có nghĩa gì.
 *
 * Phép kiểm index đúng chỗ là **trên production**, nơi bảng có ~290.000 dòng email và ~65.000 dòng
 * Zalo thật. Xem mục nghiệm thu của lệnh giao: chạy EXPLAIN một truy vấn đếm sau khi deploy, phải
 * thấy `idx_email_messages_setting_sent` / `idx_zalo_messages_account_sent`.
 *
 * Còn lại ở đây là thứ DB test khẳng định được chắc chắn: hai hàm đếm ra đúng số trên khối dữ liệu
 * lớn có lẫn preview và lẫn ngày khác.
 */
describe('hai hàm đếm trên khối dữ liệu lớn (lẫn preview, lẫn ngày khác)', () => {
  const HOT_EMAIL_SETTING = 701;
  const HOT_ZALO_ACCOUNT = 702;

  beforeEach(async () => {
    // 400 dòng "đếm được" trong ngày, 4.000 preview và 4.000 dòng ngày khác cho CÙNG tài khoản:
    // index bán phần chỉ chứa 400+4.000 dòng không-preview, index cũ chứa cả 8.400.
    await db.query(
      `INSERT INTO email_messages (id_email_setting, status, is_preview, sent_at)
       SELECT $1::bigint, 'sent', false, $2::timestamptz FROM generate_series(1, 400)
       UNION ALL
       SELECT $1::bigint, 'sent', true, $2::timestamptz FROM generate_series(1, 4000)
       UNION ALL
       SELECT $1::bigint, 'sent', false, $3::timestamptz FROM generate_series(1, 4000)`,
      [HOT_EMAIL_SETTING, IN_DAY, BEFORE_DAY]
    );
    await db.query(
      `INSERT INTO zalo_messages (account_id, tracking_metadata, is_preview, sent_at)
       SELECT $1::bigint, '{"status":"sent"}'::jsonb, false, $2::timestamptz FROM generate_series(1, 400)
       UNION ALL
       SELECT $1::bigint, '{"status":"sent"}'::jsonb, true, $2::timestamptz FROM generate_series(1, 4000)
       UNION ALL
       SELECT $1::bigint, '{"status":"sent"}'::jsonb, false, $3::timestamptz FROM generate_series(1, 4000)`,
      [HOT_ZALO_ACCOUNT, IN_DAY, BEFORE_DAY]
    );
    await db.query('ANALYZE email_messages');
    await db.query('ANALYZE zalo_messages');
  });

  it('đếm đúng 400 giữa 8.400 dòng — không lẫn 4.000 preview, không lẫn 4.000 dòng ngày khác', async () => {
    await expect(countEmailSentTodayByAccount(db, HOT_EMAIL_SETTING, DAY_START, DAY_END)).resolves.toBe(400);
    await expect(countZaloSentTodayByAccount(db, HOT_ZALO_ACCOUNT, DAY_START, DAY_END)).resolves.toBe(400);
  });

  it('index mới TỒN TẠI và đúng định nghĩa (điều kiện lọc + cột khoá) — không phụ thuộc planner', async () => {
    const { rows } = await db.query(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE indexname IN ('idx_email_messages_setting_sent', 'idx_zalo_messages_account_sent')
       ORDER BY indexname`
    );
    expect(rows.map((r) => r.indexname)).toEqual([
      'idx_email_messages_setting_sent',
      'idx_zalo_messages_account_sent',
    ]);
    const [email, zalo] = rows;
    expect(email.indexdef).toContain('(id_email_setting, sent_at)');
    expect(email.indexdef).toContain('NOT is_preview');
    expect(zalo.indexdef).toContain('(account_id, sent_at)');
    expect(zalo.indexdef).toContain('NOT is_preview');
  });
});
