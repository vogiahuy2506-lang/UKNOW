/**
 * PLAN_EMAIL_SENT_AT_GIO_UTC_2026-09-27, PR-T1 — 4 ca nghiệm thu (mục 3, phần "Test"):
 * a) insertEmailMessage ghi giờ VN đúng (Việc 2).
 * b) countZaloSentTodayByAccount đếm đúng tin gửi cuối ngày VN (Việc 1, cột giờ VN sẵn có).
 * c) countEmailSentTodayWithLedger cộng đúng reservation vn_day_start = nửa đêm VN hôm nay
 *    (Việc 1, vế send_quota_reservations — cột có múi giờ, không bọc).
 * d) countEmailSentToday (A, CURRENT_DATE) và countEmailSentTodayWithLedger (B) cùng đếm một thư
 *    gửi 06:00 VN hôm nay vào cùng một ngày.
 *
 * Chạy với process.env.TZ = 'UTC' (đặt ở beforeAll, trả lại ở afterAll) để mô phỏng đúng container
 * production — nếu code lỡ dựa vào timezone tiến trình thay vì tính bằng UTC-offset tường minh
 * (kiểu nextVnMidnight/getVnDayBoundaries), test này bắt được ngay.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import emailSettingsRepository from '../../src/repositories/email/emailSettings.repository.js';
import {
  countEmailSentTodayWithLedger,
  countZaloSentTodayByAccount,
  createReservation,
} from '../../src/repositories/sendQuota.repository.js';
import { countEmailSentToday, _clearQuotaCache } from '../../src/utils/userSendLimit.util.js';
import { getVnDayBoundaries } from '../../src/services/quota/sendQuotaReservation.service.js';
import {
  computeRequestFingerprint,
  buildDirectReservationKey,
} from '../../src/services/quota/sendQuotaKey.service.js';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Chuỗi wall-clock VN 'YYYY-MM-DD HH:MI:SS' của một thời điểm tuyệt đối — dùng để chèn thẳng vào
 * cột `timestamp` (không múi giờ) sao cho giá trị lưu ĐÚNG NHƯ trạng thái sau khi backfill (PR-T2):
 * chữ số chính là giờ VN, không phải giờ UTC. KHÔNG truyền JS Date thẳng vào tham số cho cột này —
 * pg ghi Date thành chuỗi "...+00:00", Postgres bỏ offset khi ép vào timestamp không múi giờ, nên
 * chữ số lưu lại là giờ UTC, không phải VN (đúng cái lỗi plan này sửa). */
function vnWallClockText(absoluteInstant) {
  const vn = new Date(absoluteInstant.getTime() + VN_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return `${vn.getUTCFullYear()}-${pad(vn.getUTCMonth() + 1)}-${pad(vn.getUTCDate())} `
    + `${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}:${pad(vn.getUTCSeconds())}`;
}

/** 00:00 VN của "hôm nay" theo đồng hồ hệ thống, dùng cùng kỹ thuật UTC-offset như nextVnMidnight —
 * KHÔNG phụ thuộc process.env.TZ. */
function vnTodayAt(hour, minute = 0) {
  const now = new Date();
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate(), hour, minute, 0) - VN_OFFSET_MS);
}

// ĐÃ KIỂM 27/09: `process.env.TZ = 'UTC'` gán TRONG beforeAll KHÔNG có tác dụng — V8 chốt
// timezone hệ thống lúc tiến trình Node khởi động (đọc /etc/localtime một lần), gán lại biến môi
// trường SAU đó không đổi được `Date.prototype.getHours()`/`Intl` nữa (đã đo bằng PROBE trên
// chính máy này: gán trong beforeAll thì d.getHours() vẫn trả 8, Intl vẫn "Asia/Saigon"). Máy dev
// Mac chạy +07 (đúng như mục 1 của plan mô tả) nên bài test này BẮT BUỘC phải chạy với biến môi
// trường TZ=UTC đặt Ở SHELL, TRƯỚC khi node khởi động — ví dụ:
//   TZ=UTC npm run test:integration -- tests/integration/emailSentAtVnTimezone.test.js
// beforeAll dưới đây chỉ XÁC NHẬN điều đó đã được làm đúng, KHÔNG tự gán TZ (gán không tác dụng gì
// và làm người đọc tưởng nhầm là đã mô phỏng được container UTC).
beforeAll(() => {
  const isReallyUtc = new Date().getTimezoneOffset() === 0
    && Intl.DateTimeFormat().resolvedOptions().timeZone === 'UTC';
  if (!isReallyUtc) {
    throw new Error(
      'Máy chạy test này không ở múi giờ UTC (Intl.DateTimeFormat().resolvedOptions().timeZone = '
      + `${Intl.DateTimeFormat().resolvedOptions().timeZone}). process.env.TZ gán trong beforeAll `
      + 'không đổi được hành vi Date của V8 — phải chạy lại với biến môi trường TZ=UTC đặt ở SHELL: '
      + 'TZ=UTC npm run test:integration -- tests/integration/emailSentAtVnTimezone.test.js'
    );
  }
});

beforeEach(async () => {
  await truncateAll();
  _clearQuotaCache();
});

describe('PR-T1 — giờ VN vào SQL đúng luật (a-d)', () => {
  it('a) insertEmailMessage: sentAt = 2026-09-27T01:00:00Z (01:00 UTC = 08:00 VN) → sent_at::text = 2026-09-27 08:00:00', async () => {
    const user = await createUser({ withPlan: false });
    const emailId = await emailSettingsRepository.insertEmailMessage(db, {
      recipientEmail: 'khach@example.com',
      senderEmail: 'gui@example.com',
      subject: 'Test PR-T1',
      status: 'sent',
      sentAt: new Date('2026-09-27T01:00:00Z'),
      workspaceOwnerId: user.id,
    });
    expect(emailId).toBeTruthy();

    const { rows } = await db.query('SELECT sent_at::text AS sent_at_text FROM email_messages WHERE id = $1', [emailId]);
    expect(rows[0].sent_at_text).toBe('2026-09-27 08:00:00');
  });

  it('b) countZaloSentTodayByAccount: tin gửi 18:00 VN hôm nay → được đếm vào hôm nay', async () => {
    const accountId = 90001 + Math.floor(Math.random() * 1000);
    const sentAtVnText = vnWallClockText(vnTodayAt(18, 0));

    await db.query(
      `INSERT INTO zalo_messages (account_id, tracking_metadata, is_preview, sent_at, tracking_token)
       VALUES ($1, $2::jsonb, false, $3::timestamp, $4)`,
      [accountId, JSON.stringify({ status: 'sent' }), sentAtVnText, `tok_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`]
    );

    const now = new Date();
    const { vnDayStart, vnDayEnd } = getVnDayBoundaries(now);
    const count = await countZaloSentTodayByAccount(db, accountId, vnDayStart, vnDayEnd);
    expect(count).toBe(1);
  });

  it('c) countEmailSentTodayWithLedger: reservation vn_day_start = nửa đêm VN hôm nay → được cộng', async () => {
    const user = await createUser({ withPlan: false });
    const now = new Date();
    const { vnDayStart, vnDayEnd } = getVnDayBoundaries(now);

    const payload = { channel: 'email', recipient: 'reserve@example.com', quantity: 3, sourceType: 'direct' };
    const fingerprint = computeRequestFingerprint(payload);
    const reservationKey = buildDirectReservationKey({
      channel: 'email',
      billingUserId: user.id,
      clientKey: `t1c_${Date.now()}`,
      recipient: payload.recipient,
    });
    await createReservation(db, {
      reservationKey,
      requestFingerprint: fingerprint,
      billingUserId: user.id,
      channel: 'email',
      quantity: 3,
      sourceType: 'direct',
      vnDayStart,
      vnDayEnd,
    });

    const count = await countEmailSentTodayWithLedger(db, user.id, vnDayStart, vnDayEnd);
    expect(count).toBe(3);
  });

  it('d) thư gửi 06:00 VN hôm nay → countEmailSentToday (A, CURRENT_DATE) và countEmailSentTodayWithLedger (B) cùng đếm vào hôm nay', async () => {
    const user = await createUser({ withPlan: false });
    const sentAt = vnTodayAt(6, 0);

    await emailSettingsRepository.insertEmailMessage(db, {
      recipientEmail: 'khach06h@example.com',
      senderEmail: 'gui@example.com',
      subject: 'Test PR-T1 06h VN',
      status: 'sent',
      sentAt,
      workspaceOwnerId: user.id,
    });

    const countA = await countEmailSentToday(user.id);
    expect(countA).toBe(1);

    const { vnDayStart, vnDayEnd } = getVnDayBoundaries(new Date());
    const countB = await countEmailSentTodayWithLedger(db, user.id, vnDayStart, vnDayEnd);
    expect(countB).toBe(1);
  });
});
