/**
 * Dữ liệu mẫu cho môi trường test tại máy, phục vụ chụp ảnh minh hoạ bài hướng dẫn.
 *
 * VÌ SAO TÁCH RIÊNG VÀ BẬT BẰNG CỜ: bộ test e2e đang dựa vào trạng thái rỗng
 * (danh sách chưa có gì, "Bạn chưa có chiến dịch nào"…). Đổ dữ liệu mẫu vào seed
 * mặc định sẽ làm đỏ hàng loạt test không liên quan. Chỉ chạy khi E2E_SEED_DEMO=1.
 *
 * Điểm mấu chốt của môi trường này: ở đây BẤM GÌ CŨNG ĐƯỢC. Tạo đơn, xác nhận
 * nâng gói, hẹn hạ gói, để vượt hạn mức — những thứ trên production tuyệt đối
 * không đụng vào. Nhờ vậy chụp được đúng các màn hình mà bài hướng dẫn cần mà
 * chạy trên tài khoản thật thì không dựng nổi.
 */
import { DEMO_PLANS } from './demo-plans.js';

/** Gói mà tài khoản mẫu đang dùng — ở giữa bậc thang để thấy cả nâng lẫn hạ gói. */
const DEFAULT_ACTIVE_PLAN_CODE = 'basic';

const PLAN_COLUMNS = Object.keys(DEMO_PLANS[0]);

/**
 * Các cột số nguyên trong bảng `plans`.
 *
 * API trả tiền về dạng chuỗi thập phân ("299000.00") vì driver Postgres giữ
 * nguyên kiểu NUMERIC, trong khi cột là BIGINT/INTEGER — nhét thẳng vào là lỗi
 * `invalid input syntax for type bigint`.
 */
const NUMERIC_PLAN_COLUMNS = new Set(PLAN_COLUMNS.filter((column) => (
  !['code', 'name', 'description', 'features', 'ai_model', 'is_active', 'is_fup_enabled', 'is_custom'].includes(column)
)));

function coercePlanValue(column, value) {
  if (column === 'features') return JSON.stringify(value ?? []);
  if (value === null || value === undefined) return null;
  if (NUMERIC_PLAN_COLUMNS.has(column)) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : null;
  }
  return value;
}

/**
 * Nạp bộ gói giống production và gán một gói cho tài khoản mẫu.
 *
 * @param {import('pg').Client} client
 * @param {{ userId: number|string, activePlanCode?: string }} options
 * @returns {Promise<{planIds: Record<string, number>, activePlanId: number}>}
 */
export async function seedDemoPlans(client, { userId, activePlanCode = DEFAULT_ACTIVE_PLAN_CODE }) {
  const planIds = {};

  for (const plan of DEMO_PLANS) {
    const columns = PLAN_COLUMNS.filter((c) => plan[c] !== undefined);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    // features là JSONB — pg gửi mảng JS thành mảng Postgres nếu không tự chuỗi hoá.
    const values = columns.map((c) => coercePlanValue(c, plan[c]));
    const { rows } = await client.query(
      `INSERT INTO plans (${columns.join(', ')}) VALUES (${placeholders})
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      values,
    );
    planIds[plan.code] = rows[0].id;
  }

  // Gói giữ chỗ của bộ e2e cũng đang is_active nên sẽ hiện thành một thẻ giá 0đ
  // lạc lõng trên bảng giá. Tắt đi cho ảnh chụp sạch; bộ test e2e không đụng tới
  // bảng giá nên không ảnh hưởng.
  await client.query("UPDATE plans SET is_active = FALSE WHERE code = 'e2e_test_plan'");

  const activePlanId = planIds[activePlanCode] ?? Object.values(planIds)[0];

  // Chép hạn mức của gói sang tài khoản, đúng như assignPlanToUser() làm — không
  // chép thì trang Tổng quan gói hiện hạn mức rỗng và ảnh chụp ra vô nghĩa.
  await client.query(
    `UPDATE users u
        SET active_plan_id           = p.id,
            plan_activated_at        = NOW(),
            subscription_expires_at  = NOW() + (COALESCE(p.duration_days, 30) || ' days')::INTERVAL,
            max_landing_pages        = p.max_landing_pages,
            max_campaigns            = p.max_campaigns,
            max_zalo_campaigns       = p.max_zalo_campaigns,
            max_zalo_group_campaigns = p.max_zalo_group_campaigns,
            max_email_campaigns      = p.max_email_campaigns,
            max_zalo_accounts        = p.max_zalo_accounts,
            max_email_accounts       = p.max_email_accounts,
            max_email_templates      = p.max_email_templates,
            max_zalo_templates       = p.max_zalo_templates,
            messages_per_period      = p.messages_per_period,
            is_fup_enabled           = p.is_fup_enabled,
            updated_at               = NOW()
       FROM plans p
      WHERE p.id = $1 AND u.id = $2`,
    [activePlanId, userId],
  );

  return { planIds, activePlanId };
}

/**
 * Đổ toàn bộ dữ liệu mẫu.
 *
 * @param {import('pg').Client} client
 * @param {{ userId: number|string }} options
 */
export async function seedDemoData(client, { userId }) {
  const { planIds, activePlanId } = await seedDemoPlans(client, { userId });
  const activeName = Object.entries(planIds).find(([, id]) => id === activePlanId)?.[0];
  console.log(`[e2e-seed] Dữ liệu mẫu: ${Object.keys(planIds).length} gói, tài khoản đang dùng "${activeName}"`);
  return { planIds, activePlanId };
}
