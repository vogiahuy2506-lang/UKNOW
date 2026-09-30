/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-1 — hạn mức email đếm ĐỦ thư đã gửi.
 *
 * Sự cố: thư đã được khách mở / nhấp / huỷ đăng ký đổi `email_messages.status` sang opened / clicked /
 * unsubscribed, rơi khỏi mọi phép đếm lọc `status IN ('sent', 'delivered', 'bounced')` → hạn mức ngày /
 * kỳ / tài khoản đếm thiếu ~22% (đo production T9/2026), khách gửi được nhiều hơn hạn mức đã mua.
 *
 * Test này chạy CẢ 11 chỗ đếm email trên DB thật, với MỘT thư cho từng trạng thái trong 10 nhãn của enum
 * production `message_status` (pending, queued, sent, delivered, opened, clicked, bounced, failed, spam,
 * unsubscribed). Bảng chân lý dưới đây viết TAY, không import từ hằng EMAIL_SENT_STATUSES: hằng bị bỏ một
 * giá trị, hay một chỗ bị trả về bộ 3 cũ, đều làm đỏ đúng ca của trạng thái đó ở đúng hàm đó.
 *
 * Lưu ý: bootstrap.sql khai `status` VARCHAR(30) (lệch enum production) nên DB test không tự bắt nhãn sai
 * chính tả — 10 nhãn dưới đây chép từ enum production.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import db from '../../src/config/database.js';
import * as dbHelpers from './helpers/db.js';
import {
  countEmailSentToday,
  countEmailSentInCycle,
  countEmailSentInCycleUncached,
  countCombinedSentInCycle,
  countEmployeeEmailSentToday,
  countEmployeeEmailSentThisMonth,
  _clearQuotaCache,
} from '../../src/utils/userSendLimit.util.js';
import {
  countEmailSentTodayWithLedger,
  countEmailSentInCycleWithLedger,
  countEmailSentTodayByAccount,
  countEmployeeSentTodayWithLedger,
  countEmployeeSentInCycleWithLedger,
} from '../../src/repositories/sendQuota.repository.js';

// true = thư máy chủ SMTP đã nhận → PHẢI được đếm vào hạn mức. false = chưa gửi / gửi lỗi (`sent_at` đã
// được ghi lúc thử gửi, nên bộ lọc status là thứ duy nhất loại chúng khỏi hạn mức).
const TRANG_THAI_CO_DUOC_DEM = {
  pending: false,
  queued: false,
  sent: true,
  delivered: true,
  opened: true,
  clicked: true,
  bounced: true,
  failed: false,
  spam: true,
  unsubscribed: true,
};
const CAC_TRANG_THAI = Object.keys(TRANG_THAI_CO_DUOC_DEM);
const SO_TRANG_THAI_DUOC_DEM = CAC_TRANG_THAI.filter((s) => TRANG_THAI_CO_DUOC_DEM[s]).length;

const now = new Date();
const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
const cycleStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
const cycleEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));

// Mỗi hàm nhận { ownerId, settingId }; nhân viên chính là chủ (workspace_owner_id = actor_user_id).
const CAC_HAM_DEM = [
  ['userSendLimit.countEmailSentToday', ({ ownerId }) => countEmailSentToday(ownerId)],
  ['userSendLimit.countEmailSentInCycle', ({ ownerId }) => countEmailSentInCycle(ownerId, cycleStart, cycleEnd)],
  ['userSendLimit.countEmailSentInCycleUncached', ({ ownerId }) => countEmailSentInCycleUncached(ownerId, cycleStart, cycleEnd)],
  ['userSendLimit.countCombinedSentInCycle', ({ ownerId }) => countCombinedSentInCycle(ownerId, cycleStart, cycleEnd)],
  ['userSendLimit.countEmployeeEmailSentToday', ({ ownerId }) => countEmployeeEmailSentToday(ownerId, ownerId)],
  ['userSendLimit.countEmployeeEmailSentThisMonth — nhánh kỳ', ({ ownerId }) => countEmployeeEmailSentThisMonth(ownerId, ownerId, cycleStart, cycleEnd)],
  ['userSendLimit.countEmployeeEmailSentThisMonth — nhánh tháng dương lịch', ({ ownerId }) => countEmployeeEmailSentThisMonth(ownerId, ownerId)],
  ['sendQuota.countEmailSentTodayWithLedger', ({ ownerId }) => countEmailSentTodayWithLedger(db, ownerId, dayStart, dayEnd)],
  ['sendQuota.countEmailSentInCycleWithLedger', ({ ownerId }) => countEmailSentInCycleWithLedger(db, ownerId, cycleStart, cycleEnd)],
  ['sendQuota.countEmailSentTodayByAccount', ({ settingId }) => countEmailSentTodayByAccount(db, settingId, dayStart, dayEnd)],
  ['sendQuota.countEmployeeSentTodayWithLedger (email)', ({ ownerId }) => countEmployeeSentTodayWithLedger(db, ownerId, ownerId, 'email', dayStart, dayEnd)],
  ['sendQuota.countEmployeeSentInCycleWithLedger (email)', ({ ownerId }) => countEmployeeSentInCycleWithLedger(db, ownerId, ownerId, 'email', cycleStart, cycleEnd)],
];

async function insertEmail({ ownerId, settingId, status, isPreview = false, daysAgo = 0 }) {
  await db.query(
    `INSERT INTO email_messages (
       workspace_owner_id, actor_user_id, id_email_setting, recipient_email, sender_email, subject,
       status, is_preview, sent_at
     ) VALUES ($1, $1, $2, 'cust@example.com', 'sender@example.com', 'Sub', $3, $4,
               NOW() - ($5::int * INTERVAL '1 day'))`,
    [ownerId, settingId, status, isPreview, daysAgo]
  );
}

describe('PR-1 — 11 chỗ đếm email đã gửi phải đếm đủ thư đã mở / nhấp / huỷ đăng ký', () => {
  /** @type {Record<string, { ownerId: number, settingId: number }>} */
  const theoTrangThai = {};
  let control;

  beforeAll(async () => {
    await dbHelpers.truncateAll();

    // Mỗi trạng thái một chủ tài khoản riêng, đúng MỘT thư trong khung ngày/kỳ hiện tại.
    for (const [index, status] of CAC_TRANG_THAI.entries()) {
      const user = await dbHelpers.createUser({ username: `qs_${status}` });
      theoTrangThai[status] = { ownerId: Number(user.id), settingId: 9000 + index };
      await insertEmail({ ...theoTrangThai[status], status });
    }

    // Chủ "đối chứng": đủ 10 trạng thái trong khung + 10 thư preview + 10 thư 90 ngày trước.
    // Preview và thư ngoài khung PHẢI vẫn bị loại (mở rộng danh sách trạng thái không được làm hở hai điều kiện này).
    const controlUser = await dbHelpers.createUser({ username: 'qs_control' });
    control = { ownerId: Number(controlUser.id), settingId: 9900 };
    for (const status of CAC_TRANG_THAI) {
      await insertEmail({ ...control, status });
      await insertEmail({ ...control, status, isPreview: true });
      await insertEmail({ ...control, status, daysAgo: 90 });
    }
  });

  afterAll(async () => {
    await db.pool.end();
  });

  it('bảng chân lý: đúng 7 trong 10 nhãn enum được đếm', () => {
    expect(CAC_TRANG_THAI).toHaveLength(10);
    expect(SO_TRANG_THAI_DUOC_DEM).toBe(7);
  });

  describe.each(CAC_HAM_DEM)('%s', (_ten, dem) => {
    it.each(CAC_TRANG_THAI)('một thư status=%s', async (status) => {
      _clearQuotaCache();
      const soThuDuocDem = await dem(theoTrangThai[status]);
      expect(soThuDuocDem).toBe(TRANG_THAI_CO_DUOC_DEM[status] ? 1 : 0);
    });

    it('đủ 10 trạng thái + preview + thư 90 ngày trước → chỉ đếm 7 thư trong khung, không preview', async () => {
      _clearQuotaCache();
      expect(await dem(control)).toBe(SO_TRANG_THAI_DUOC_DEM);
    });
  });
});
