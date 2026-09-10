import { describe, it, expect, beforeEach } from '@jest/globals';

/**
 * Tái hiện lượt lệch shadow đo được trên production ngày 10/09/2026.
 *
 * Kịch bản thật: user có gói `daily_email_limit = 1`, hôm đó đã gửi 2 email (ghi ở
 * `usage_logs.resource_type='email_direct_send'`), rồi gửi thêm 1 thư qua Gửi nhanh.
 *
 *   luật cũ (checkSendQuota)                → TỪ CHỐI "Đã đạt giới hạn gửi email trong ngày (2/1)"
 *   luật mới (evaluateReservationQuotaPolicy) → CHO PHÉP
 *   → legacy_deny_atomic_allow = 1, both_denied = 0
 *
 * Nếu `enforce` đang bật, thư đó đã được gửi dù vượt hạn mức ngày.
 *
 * Hai giả thuyết đã bị dữ liệu production loại bỏ trước khi viết bài này:
 *   - "hai luật đếm khác nhau": chạy cả hai câu đếm trên DB thật, đều ra 2;
 *     bộ lọc `quota_reservation_id IS NULL` không loại dòng nào.
 *   - "cửa sổ ngày VN của luật mới sai": getVnDayBoundaries tại 19:52+07 cho
 *     10/09 00:00 → 11/09 00:00 (+07), hai dòng usage_logs nằm trong.
 *
 * Bài này để trả lời: lệch đó có tái hiện được ngoài production không. Nếu CÓ, ta có chỗ sửa
 * cụ thể. Nếu KHÔNG, nguyên nhân phụ thuộc môi trường và phải đọc dòng log chẩn đoán mới
 * (df355ca6) từ một lần tái hiện trên production.
 */

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser, createPlan, assignPlanToUser } = await import('./helpers/db.js');
const {
  reserveSendQuota,
  getShadowMismatchMetrics,
  resetShadowMismatchMetrics,
} = await import('../../src/services/quota/sendQuotaReservation.service.js');
const { checkSendQuota, _clearQuotaCache } = await import('../../src/utils/userSendLimit.util.js');

// Chế độ shadow được bật bằng `modeOverride` cho từng lời gọi, KHÔNG sửa
// `process.env.SEND_QUOTA_RESERVATION_MODE`. Bản đầu của bài này sửa env trong `beforeEach` rồi
// khôi phục ở `afterAll`, và làm 20 ca của synchronousSendQuota.test.js đỏ khi hai file chạy
// chung — `process.env` là trạng thái toàn tiến trình, không được cô lập giữa các file test.
// `modeOverride` chỉ có hiệu lực khi NODE_ENV === 'test' (assertReservationOperationMode) và là
// cách các bài quota khác đã dùng, ví dụ sendQuotaConcurrency.test.js.

/** Ghi N lượt gửi trực tiếp trong hôm nay, đúng dạng Gửi nhanh sinh ra. */
async function seedDirectSendsToday(userId, count) {
  for (let i = 0; i < count; i += 1) {
    await db.query(
      `INSERT INTO usage_logs (id_user, resource_type, delta, period_start, period_end, created_at)
       VALUES ($1, 'email_direct_send', 1, NOW() - INTERVAL '1 day', NOW() + INTERVAL '29 days', NOW())`,
      [userId]
    );
  }
}

describe('Shadow parity — luật cũ và luật mới phải cùng kết luận ở ranh giới hạn mức ngày', () => {
  let user;

  beforeEach(async () => {
    await truncateAll();
    resetShadowMismatchMetrics();
    _clearQuotaCache();

    user = await createUser({ role: 'user', username: 'quota_boundary' });
    const plan = await createPlan({ dailyEmailLimit: 1, monthlyEmailLimit: 1000 });
    await assignPlanToUser(user.id, plan.id);
  });

  it('ĐỐI CHỨNG DƯƠNG: chưa gửi gì thì luật cũ cho phép — nếu ca này hỏng thì ca dưới vô nghĩa', async () => {
    const legacy = await checkSendQuota({
      userId: user.id, roleCode: 'user', ownerContextId: user.id, channel: 'email', requiredCount: 1,
    });
    expect(legacy.allowed).toBe(true);
  });

  it('luật cũ từ chối đúng khi đã gửi 2 thư mà hạn mức là 1', async () => {
    await seedDirectSendsToday(user.id, 2);
    _clearQuotaCache();

    const legacy = await checkSendQuota({
      userId: user.id, roleCode: 'user', ownerContextId: user.id, channel: 'email', requiredCount: 1,
    });

    expect(legacy.allowed).toBe(false);
    expect(legacy.limitType).toBe('daily');
    expect(legacy.limit).toBe(1);
    expect(legacy.currentCount).toBe(2);
  });

  it('HAI LUẬT PHẢI CÙNG TỪ CHỐI — đây là ca tái hiện lượt lệch production 10/09', async () => {
    await seedDirectSendsToday(user.id, 2);
    _clearQuotaCache();

    // Ở chế độ shadow, luật cũ vẫn là luật gác cổng nên lời gọi này ném lỗi 403.
    // Điều cần kiểm nằm ở BỘ ĐẾM: luật mới đã kết luận gì trên cùng dữ liệu.
    await expect(
      reserveSendQuota(
        {
          userId: user.id,
          roleCode: 'user',
          ownerContextId: user.id,
          channel: 'email',
          quantity: 1,
          sourceType: 'quick_send',
        },
        { modeOverride: 'shadow' }
      )
    ).rejects.toMatchObject({ status: 403 });

    const m = getShadowMismatchMetrics();
    expect(m.total).toBe(1);

    // Vế quyết định. Lệch theo hướng này nghĩa là luật mới NỚI HƠN luật cũ: bật `enforce`
    // sẽ cho gửi vượt hạn mức ngày.
    expect(m.legacy_deny_atomic_allow).toBe(0);
    expect(m.mismatches).toBe(0);
    expect(m.both_denied).toBe(1);
  });

  /**
   * Đo trên production 10/09: user gặp lượt lệch có `subscription_expires_at` = 08/09 21:05,
   * `grace_period_days` = 0 — tức gói ĐÃ HẾT HẠN hai ngày. Bài trên không chạm nhánh này vì
   * `assignPlanToUser` để `subscription_expires_at` là NULL.
   *
   * Cả hai luật dùng CÙNG một công thức hết hạn (`now > expiresAt + graceDays`):
   * getSubscriptionStatus (cũ) và getWorkspacePlanLimits (mới). Nên chúng phải cùng kết luận.
   */
  it('gói HẾT HẠN: hai luật vẫn phải cùng từ chối', async () => {
    await db.query(
      `UPDATE users SET subscription_expires_at = NOW() - INTERVAL '2 days' WHERE id = $1`,
      [user.id]
    );
    _clearQuotaCache();

    const legacy = await checkSendQuota({
      userId: user.id, roleCode: 'user', ownerContextId: user.id, channel: 'email', requiredCount: 1,
    });
    expect(legacy.allowed).toBe(false);
    expect(legacy.limitType).toBe('expired');

    await expect(
      reserveSendQuota(
        {
          userId: user.id,
          roleCode: 'user',
          ownerContextId: user.id,
          channel: 'email',
          quantity: 1,
          sourceType: 'quick_send',
        },
        { modeOverride: 'shadow' }
      )
    ).rejects.toMatchObject({ status: 403 });

    const m = getShadowMismatchMetrics();
    expect(m.total).toBe(1);
    expect(m.legacy_deny_atomic_allow).toBe(0);
    expect(m.both_denied).toBe(1);
  });
});
