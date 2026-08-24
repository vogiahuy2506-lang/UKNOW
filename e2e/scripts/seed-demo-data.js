/**
 * Dữ liệu mẫu cho môi trường test tại máy, phục vụ chụp ảnh minh hoạ bài hướng dẫn.
 *
 * VÌ SAO TÁCH RIÊNG VÀ BẬT BẰNG CỜ: bộ test e2e đang dựa vào trạng thái rỗng
 * (danh sách chưa có gì, "Bạn chưa có chiến dịch nào"…). Đổ dữ liệu mẫu vào seed
 * mặc định sẽ làm đỏ hàng loạt test không liên quan. Chỉ chạy khi E2E_SEED_DEMO=1
 * hoặc các cờ cụ thể được bật (E2E_SEED_ALL=1, E2E_SEED_CHANNELS=1,...).
 */
import bcrypt from 'bcryptjs';
import { DEMO_PLANS } from './demo-plans.js';

/** Gói mà tài khoản mẫu đang dùng — ở giữa bậc thang để thấy cả nâng lẫn hạ gói. */
const DEFAULT_ACTIVE_PLAN_CODE = 'basic';

const PLAN_COLUMNS = Object.keys(DEMO_PLANS[0]);

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
 */
export async function seedDemoPlans(client, { userId, activePlanCode = DEFAULT_ACTIVE_PLAN_CODE }) {
  const planIds = {};

  for (const plan of DEMO_PLANS) {
    const columns = PLAN_COLUMNS.filter((c) => plan[c] !== undefined);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const values = columns.map((c) => coercePlanValue(c, plan[c]));
    const { rows } = await client.query(
      `INSERT INTO plans (${columns.join(', ')}) VALUES (${placeholders})
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      values,
    );
    planIds[plan.code] = rows[0].id;
  }

  await client.query("UPDATE plans SET is_active = FALSE WHERE code = 'e2e_test_plan'");

  const activePlanId = planIds[activePlanCode] ?? Object.values(planIds)[0];

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
 * Dựng sẵn một lệnh hẹn hạ gói đang chờ.
 */
export async function seedPendingDowngrade(client, { userId, targetPlanId }) {
  await client.query(
    `INSERT INTO scheduled_plan_changes (user_id, plan_id, billing_period, amount_paid, status, activate_after)
     SELECT $1, $2, 'monthly', 0, 'pending', COALESCE(u.subscription_expires_at, NOW() + INTERVAL '30 days')
       FROM users u WHERE u.id = $1`,
    [userId, targetPlanId],
  );
}

const DEMO_LANDING_PAGES = [
  'Khoá học Marketing cơ bản',
  'Ưu đãi tháng 9 — giảm 30%',
  'Đăng ký tư vấn miễn phí',
  'Webinar: Tự động hoá bán hàng',
];

/**
 * Dựng trạng thái VƯỢT HẠN MỨC cho landing page.
 */
export async function seedLandingPageOverage(client, { userId, mode }) {
  const ids = [];
  for (const [index, title] of DEMO_LANDING_PAGES.entries()) {
    const { rows } = await client.query(
      `INSERT INTO landing_pages (id_user, workspace_owner_id, created_by, slug, title, status, is_published, published_at)
       VALUES ($1, $1, $1, $2, $3, 'published', TRUE, NOW() - ($4 || ' days')::INTERVAL)
       RETURNING id`,
      [userId, `demo-landing-${index + 1}`, title, String(DEMO_LANDING_PAGES.length - index)],
    );
    ids.push(rows[0].id);
  }

  await client.query('UPDATE users SET max_landing_pages = 1 WHERE id = $1', [userId]);

  if (mode === 'grace') {
    await client.query(
      `UPDATE users SET overage_grace_until = NOW() + INTERVAL '5 days' WHERE id = $1`,
      [userId],
    );
    return { ids, locked: [] };
  }

  await client.query(
    `UPDATE users SET overage_grace_until = NOW() - INTERVAL '2 days' WHERE id = $1`,
    [userId],
  );
  const locked = ids.slice(1);
  for (const resourceId of locked) {
    await client.query(
      `INSERT INTO topup_locked_resources (user_id, resource_key, resource_id)
       VALUES ($1, 'landing_pages', $2)
       ON CONFLICT (resource_key, resource_id) DO NOTHING`,
      [userId, resourceId],
    );
  }
  return { ids, locked };
}

// ─────────────────────────────────────────────────────────────────────────────
// Các module seed dữ liệu mẫu mở rộng (E2E_SEED_*)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1. E2E_SEED_CHANNELS: 1 Email cấu hình sẵn + 1 Zalo OA connected
 */
export async function seedChannels(client, { userId }) {
  await client.query(
    `INSERT INTO email_settings (
      id_user, name, email, reply_to, smtp_host, smtp_port,
      smtp_username, smtp_password, email_mode, use_tls, daily_limit,
      is_verified, status, created_at, updated_at
    ) VALUES (
      $1, 'Email CSKH UKNOW', 'cskh@uknow.vn', 'support@uknow.vn', 'smtp.gmail.com', 587,
      'cskh@uknow.vn', 'demo_smtp_password_123', 'custom_smtp', TRUE, 1000,
      TRUE, 'active', NOW() - INTERVAL '20 days', NOW()
    )`,
    [userId],
  );

  await client.query(
    `INSERT INTO zalo_settings (
      id_user, display_name, zalo_user_id, zalo_name, zalo_phone,
      login_method, cookie_text, status, is_active, is_default,
      last_connected_at, created_at, updated_at
    ) VALUES (
      $1, 'Zalo Official Account UKNOW', '2847192837482910', 'UKNOW Campaign OA', '0988123456',
      'qr', 'demo_zalo_cookie_session', 'connected', TRUE, TRUE,
      NOW() - INTERVAL '1 hour', NOW() - INTERVAL '20 days', NOW()
    )`,
    [userId],
  );

  // Tài khoản Zalo THỨ HAI, đang ở trạng thái cần kết nối lại.
  //
  // Hai ô ảnh của bài "Thêm tài khoản Zalo" cần đúng cảnh này: một tài khoản
  // mang nhãn "Cần kết nối lại" kèm nút "Kết nối lại", và nút "Đặt mặc định"
  // — nút đó chỉ hiện trên tài khoản KHÔNG phải mặc định, nên phải có ít nhất
  // hai tài khoản mới chụp được.
  //
  // `needs_reauth` là giá trị ZaloSettings.jsx đối chiếu để hiện nhãn vàng;
  // 'disconnected' ra nhãn đỏ "Mất kết nối", không khớp bài viết.
  await client.query(
    `INSERT INTO zalo_settings (
      id_user, display_name, zalo_user_id, zalo_name, zalo_phone,
      login_method, cookie_text, status, is_active, is_default,
      last_connected_at, created_at, updated_at
    ) VALUES (
      $1, 'Zalo Chăm sóc khách hàng', '2847192837482911', 'UKNOW CSKH', '0977456123',
      'qr', 'demo_zalo_cookie_expired', 'needs_reauth', TRUE, FALSE,
      NOW() - INTERVAL '6 days', NOW() - INTERVAL '18 days', NOW()
    )`,
    [userId],
  );

  await client.query(
    `INSERT INTO zalo_accounts (
      id_user, is_active, status, created_at, updated_at
    ) VALUES (
      $1, TRUE, 'connected', NOW() - INTERVAL '20 days', NOW()
    )`,
    [userId],
  );
}

/**
 * 2. E2E_SEED_TEMPLATES: 3 nhãn, 6 mẫu Email, 4 mẫu Zalo
 */
export async function seedTemplates(client, { userId }) {
  await client.query(
    `INSERT INTO template_labels (name, color, workspace_owner_id, created_by, created_at)
     VALUES
       ('Khuyến mãi', '#ef4444', $1, $1, NOW() - INTERVAL '25 days'),
       ('Chăm sóc', '#3b82f6', $1, $1, NOW() - INTERVAL '25 days'),
       ('Nhắc lịch', '#10b981', $1, $1, NOW() - INTERVAL '25 days')
     ON CONFLICT (name, workspace_owner_id) DO NOTHING`,
    [userId],
  );

  const emailTemplates = [
    {
      name: 'Chào mừng thành viên mới',
      code: 'welcome_member',
      subject: 'Chào mừng bạn gia nhập cộng đồng UKNOW Campaign!',
      category: 'Chăm sóc',
      bodyHtml: '<p>Xin chào <strong>{{customer_name}}</strong>,</p><p>Cảm ơn bạn đã đăng ký tài khoản tại <strong>UKNOW Campaign</strong>. Hãy bắt đầu tạo chiến dịch đầu tiên ngay hôm nay để bứt phá doanh số!</p>',
      bodyText: 'Xin chào {{customer_name}}, Cảm ơn bạn đã đăng ký tài khoản tại UKNOW Campaign.',
      isActive: true,
      usageCount: 145,
    },
    {
      name: 'Ưu đãi sinh nhật thành viên VIP',
      code: 'birthday_vip_30',
      subject: '🎉 Chúc mừng sinh nhật {{customer_name}} — Quà tặng giảm 30% dành riêng cho bạn',
      category: 'Khuyến mãi',
      bodyHtml: '<p>Kính gửi <strong>{{customer_name}}</strong>,</p><p>Nhân dịp sinh nhật, UKNOW trân trọng gửi tặng bạn mã giảm giá <strong>VIP30</strong> giảm 30% toàn bộ dịch vụ.</p>',
      bodyText: 'Kính gửi {{customer_name}}, Nhân dịp sinh nhật, UKNOW gửi tặng bạn mã giảm giá VIP30 giảm 30% toàn bộ dịch vụ.',
      isActive: true,
      usageCount: 82,
    },
    {
      name: 'Nhắc lịch hẹn tư vấn giải pháp',
      code: 'meeting_reminder',
      subject: 'Nhắc lịch hẹn tư vấn giải pháp tự động hoá marketing ngày mai',
      category: 'Nhắc lịch',
      bodyHtml: '<p>Chào <strong>{{customer_name}}</strong>,</p><p>UKNOW xin nhắc bạn về buổi hẹn tư vấn trực tuyến vào lúc <strong>14:00 ngày mai</strong>.</p>',
      bodyText: 'Chào {{customer_name}}, UKNOW xin nhắc bạn về buổi hẹn tư vấn trực tuyến vào lúc 14:00 ngày mai.',
      isActive: true,
      usageCount: 64,
    },
    {
      name: 'Thông báo nâng cấp hệ thống & bảo trì',
      code: 'system_upgrade',
      subject: 'Thông báo nâng cấp hệ thống định kỳ — UKNOW',
      category: 'Chăm sóc',
      bodyHtml: '<p>Kính gửi quý khách,</p><p>Hệ thống sẽ bảo trì nâng cấp hiệu năng vào lúc <strong>00:00 - 02:00 ngày 25/08</strong>.</p>',
      bodyText: 'Kính gửi quý khách, Hệ thống sẽ bảo trì nâng cấp hiệu năng vào lúc 00:00 - 02:00 ngày 25/08.',
      isActive: true,
      usageCount: 12,
    },
    {
      name: 'Khảo sát mức độ hài lòng khách hàng',
      code: 'csat_survey',
      subject: 'Ý kiến đóng góp của bạn giúp UKNOW hoàn thiện hơn',
      category: 'Chăm sóc',
      bodyHtml: '<p>Chào <strong>{{customer_name}}</strong>,</p><p>Bạn đánh giá trải nghiệm dịch vụ gần đây như thế nào? Vui lòng dành 1 phút để cho chúng tôi biết nhé.</p>',
      bodyText: 'Chào {{customer_name}}, Bạn đánh giá trải nghiệm dịch vụ gần đây như thế nào?',
      isActive: true,
      usageCount: 95,
    },
    {
      name: 'Mẫu thông báo nội bộ (Hệ thống khoá)',
      code: 'system_locked_notice',
      subject: '[HỆ THỐNG] Mẫu tin nhắn hệ thống được bảo vệ',
      category: null,
      bodyHtml: '<p>Mẫu tin nhắn hệ thống được bảo vệ và khoá chỉnh sửa trực tiếp.</p>',
      bodyText: 'Mẫu tin nhắn hệ thống được bảo vệ.',
      isActive: false,
      usageCount: 0,
    },
  ];

  for (const t of emailTemplates) {
    await client.query(
      `INSERT INTO email_templates (
        id_user, template_name, template_code, subject, body_html, body_text,
        category, is_active, usage_count, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() - INTERVAL '15 days', NOW())`,
      [userId, t.name, t.code, t.subject, t.bodyHtml, t.bodyText, t.category, t.isActive, t.usageCount],
    );
  }

  const zaloTemplates = [
    {
      name: 'Xác nhận đăng ký tư vấn qua Zalo',
      code: 'zalo_confirm_lead',
      bodyText: 'Chào {{customer_name}}, chuyên viên tư vấn của UKNOW đã nhận được yêu cầu của bạn và sẽ liên hệ trong ít phút nữa nhé!',
      category: 'Chăm sóc',
      isActive: true,
      usageCount: 210,
    },
    {
      name: 'Gửi mã voucher giảm giá 20%',
      code: 'zalo_voucher_20',
      bodyText: '🎁 Ưu đãi đặc biệt: Tặng bạn mã ZALO20 giảm 20% khi nâng cấp gói dịch vụ UKNOW trong tuần này!',
      category: 'Khuyến mãi',
      isActive: true,
      usageCount: 340,
    },
    {
      name: 'Nhắc lịch hẹn demo trực tiếp',
      code: 'zalo_demo_reminder',
      bodyText: 'UKNOW xin nhắc lịch: Bạn có buổi demo giải pháp marketing tự động vào lúc 10h00 sáng mai ạ.',
      category: 'Nhắc lịch',
      isActive: true,
      usageCount: 78,
    },
    {
      name: 'Cảm ơn quý khách đã mua hàng',
      code: 'zalo_thank_you',
      bodyText: 'Cảm ơn {{customer_name}} đã tin tưởng lựa chọn dịch vụ của UKNOW. Chúc bạn có trải nghiệm tuyệt vời!',
      category: 'Chăm sóc',
      isActive: true,
      usageCount: 156,
    },
  ];

  for (const t of zaloTemplates) {
    await client.query(
      `INSERT INTO zalo_templates (
        id_user, template_name, template_code, body_text,
        category, is_active, usage_count, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() - INTERVAL '15 days', NOW())`,
      [userId, t.name, t.code, t.bodyText, t.category, t.isActive, t.usageCount],
    );
  }
}

/**
 * 3. E2E_SEED_CUSTOMERS: 25 khách hàng thực tế + dòng thời gian sự kiện
 */
export async function seedCustomers(client, { userId }) {
  const customerData = [
    { name: 'Nguyễn Văn An', email: 'an.nguyen@gmail.com', phone: '0901234501', source: 'landing_page', purchased: true, orders: 3, spent: 4500000 },
    { name: 'Trần Thị Bích', email: 'bich.tran@yahoo.com', phone: '0901234502', source: 'zalo', purchased: true, orders: 1, spent: 899000 },
    { name: 'Lê Hoàng Cường', email: 'cuong.le@outlook.com', phone: '0901234503', source: 'facebook', purchased: false, orders: 0, spent: 0 },
    { name: 'Phạm Thu Dung', email: 'dung.pham@gmail.com', phone: '0901234504', source: 'landing_page', purchased: true, orders: 2, spent: 1798000 },
    { name: 'Hoàng Minh Đức', email: 'duc.hoang@company.vn', phone: '0901234505', source: 'manual', purchased: true, orders: 5, spent: 12500000 },
    { name: 'Vũ Hải Yến', email: 'yen.vu@gmail.com', phone: '0901234506', source: 'google', purchased: false, orders: 0, spent: 0 },
    { name: 'Đặng Quốc Huy', email: 'huy.dang@fpt.com.vn', phone: '0901234507', source: 'landing_page', purchased: true, orders: 2, spent: 2990000 },
    { name: 'Bùi Mai Linh', email: 'linh.bui@viettel.vn', phone: '0901234508', source: 'zalo', purchased: false, orders: 0, spent: 0 },
    { name: 'Ngô Quang Khải', email: 'khai.ngo@gmail.com', phone: '0901234509', source: 'facebook', purchased: true, orders: 1, spent: 299000 },
    { name: 'Dương Thảo Nhi', email: 'nhi.duong@gmail.com', phone: '0901234510', source: 'landing_page', purchased: true, orders: 4, spent: 6800000 },
    { name: 'Đỗ Thành Nam', email: 'nam.do@techcombank.vn', phone: '0901234511', source: 'manual', purchased: false, orders: 0, spent: 0 },
    { name: 'Hồ Ngọc Hà', email: 'ha.ho@vng.com.vn', phone: '0901234512', source: 'google', purchased: true, orders: 2, spent: 3400000 },
    { name: 'Phan Thanh Tùng', email: 'tung.phan@gmail.com', phone: '0901234513', source: 'facebook', purchased: false, orders: 0, spent: 0 },
    { name: 'Lý Gia Hân', email: 'han.ly@shopee.vn', phone: '0901234514', source: 'landing_page', purchased: true, orders: 1, spent: 899000 },
    { name: 'Trịnh Quốc Việt', email: 'viet.trinh@gmail.com', phone: '0901234515', source: 'zalo', purchased: false, orders: 0, spent: 0 },
    { name: 'Trương Mỹ Duyên', email: 'duyen.truong@tiki.vn', phone: '0901234516', source: 'landing_page', purchased: true, orders: 3, spent: 5100000 },
    { name: 'Lương Thế Vinh', email: 'vinh.luong@vinamilk.com.vn', phone: '0901234517', source: 'manual', purchased: true, orders: 6, spent: 18000000 },
    { name: 'Võ Hoài An', email: 'an.vo@gmail.com', phone: '0901234518', source: 'google', purchased: false, orders: 0, spent: 0 },
    { name: 'Tạ Minh Quân', email: 'quan.ta@vpbank.com.vn', phone: '0901234519', source: 'facebook', purchased: false, orders: 0, spent: 0 },
    { name: 'Đoàn Bảo Châu', email: 'chau.doan@gmail.com', phone: '0901234520', source: 'landing_page', purchased: true, orders: 1, spent: 599000 },
    { name: 'Mai Văn Phước', email: 'phuoc.mai@mbpost.vn', phone: '0901234521', source: 'zalo', purchased: false, orders: 0, spent: 0 },
    { name: 'Đinh Phương Thảo', email: 'thao.dinh@gmail.com', phone: '0901234522', source: 'google', purchased: true, orders: 2, spent: 1990000 },
    { name: 'Cao Tiến Dũng', email: 'dung.cao@hust.edu.vn', phone: '0901234523', source: 'landing_page', purchased: false, orders: 0, spent: 0 },
    { name: 'Lâm Thanh Vân', email: 'van.lam@gmail.com', phone: '0901234524', source: 'facebook', purchased: true, orders: 2, spent: 2400000 },
    { name: 'Nguyễn Trọng Hưng', email: 'hung.nguyen@vinschool.edu.vn', phone: '0901234525', source: 'manual', purchased: true, orders: 1, spent: 899000 },
  ];

  const customerIds = [];
  for (const [idx, c] of customerData.entries()) {
    const daysAgo = 28 - Math.floor((idx / customerData.length) * 25);
    const { rows } = await client.query(
      `INSERT INTO customers (
        id_user, workspace_owner_id, created_by, full_name, email, phone,
        customer_source, has_purchased, total_orders, total_spent,
        last_order_at, email_subscribed, created_at, updated_at
      ) VALUES (
        $1, $1, $1, $2, $3, $4, $5, $6, $7, $8,
        CASE WHEN $6 THEN NOW() - ($9 || ' days')::INTERVAL ELSE NULL END,
        TRUE, NOW() - ($10 || ' days')::INTERVAL, NOW()
      ) RETURNING id`,
      [userId, c.name, c.email, c.phone, c.source, c.purchased, c.orders, c.spent, Math.max(1, daysAgo - 2), daysAgo],
    );
    customerIds.push(rows[0].id);
  }

  const journeyEvents = [
    { type: 'visit_landing', channel: 'web', data: { page: '/khoa-hoc-marketing' } },
    { type: 'submit_form', channel: 'landing_page', data: { form: 'Đăng ký tư vấn khoá học' } },
    { type: 'receive_email', channel: 'email', data: { subject: 'Chào mừng bạn gia nhập cộng đồng UKNOW Campaign!' } },
    { type: 'open_email', channel: 'email', data: { opened_at: '2026-08-15 10:30' } },
    { type: 'click_email', channel: 'email', data: { link: 'https://uknow.vn/pricing' } },
    { type: 'receive_zalo', channel: 'zalo', data: { message: 'Xác nhận đăng ký tư vấn qua Zalo' } },
    { type: 'purchase', channel: 'web', data: { amount: 899000, plan: 'Gói Chuyên Nghiệp' } },
  ];

  for (let i = 0; i < Math.min(10, customerIds.length); i++) {
    const cid = customerIds[i];
    for (let j = 0; j < journeyEvents.length; j++) {
      const ev = journeyEvents[j];
      const hoursAgo = (10 - i) * 24 + (journeyEvents.length - j) * 4;
      await client.query(
        `INSERT INTO customer_journey (
          id_customer, event_type, event_channel, event_data, event_at, created_at
        ) VALUES ($1, $2, $3, $4, NOW() - ($5 || ' hours')::INTERVAL, NOW() - ($5 || ' hours')::INTERVAL)`,
        [cid, ev.type, ev.channel, JSON.stringify(ev.data), hoursAgo],
      );
    }
  }
}

/**
 * 4. E2E_SEED_CAMPAIGNS: 4 chiến dịch (draft, running Zalo, completed, failed) + runs + node steps
 */
export async function seedCampaigns(client, { userId }) {
  // Campaign 1: Draft Email
  await client.query(
    `INSERT INTO campaigns (
      id_user, workspace_owner_id, created_by, campaign_name, description,
      campaign_type, status, total_customers, created_at, updated_at
    ) VALUES (
      $1, $1, $1, 'Chiến dịch Email Chào mừng Khách hàng mới', 'Gửi chuỗi email onboarding cho khách đăng ký từ landing page',
      'email', 'draft', 0, NOW() - INTERVAL '10 days', NOW()
    )`,
    [userId],
  );

  // Campaign 2: Running Zalo
  const res2 = await client.query(
    `INSERT INTO campaigns (
      id_user, workspace_owner_id, created_by, campaign_name, description,
      campaign_type, status, total_customers, total_sent, total_delivered,
      total_opened, total_clicked, published_at, start_date, last_run_at, created_at, updated_at
    ) VALUES (
      $1, $1, $1, 'Gửi ưu đãi Zalo Khách hàng thân thiết', 'Chiến dịch gửi mã giảm giá 20% qua Zalo OA',
      'zalo', 'active', 500, 320, 310, 280, 145,
      NOW() - INTERVAL '1 hour', NOW() - INTERVAL '45 minutes', NOW() - INTERVAL '15 minutes',
      NOW() - INTERVAL '7 days', NOW()
    ) RETURNING id`,
    [userId],
  );
  const camp2Id = res2.rows[0].id;

  const run2Res = await client.query(
    `INSERT INTO campaign_runs (
      id_campaign, workspace_owner_id, run_name, run_type, status,
      started_at, total_recipients, successful_sends, failed_sends, skipped_sends, created_at
    ) VALUES (
      $1, $2, 'Đợt gửi 1 — Nhóm khách hàng VIP', 'manual', 'running',
      NOW() - INTERVAL '45 minutes', 500, 310, 10, 0, NOW() - INTERVAL '45 minutes'
    ) RETURNING id`,
    [camp2Id, userId],
  );
  const run2Id = run2Res.rows[0].id;

  const sampleSteps = [
    { phone: '0901234501', status: 'completed', error: null, step: 2 },
    { phone: '0901234502', status: 'completed', error: null, step: 2 },
    { phone: '0901234503', status: 'failed', error: 'Số điện thoại chưa đăng ký Zalo hoặc chặn nhận tin từ OA', step: 1 },
    { phone: '0901234504', status: 'completed', error: null, step: 2 },
    { phone: '0901234505', status: 'failed', error: 'Vượt hạn mức tương tác ngoài khung giờ quy định', step: 1 },
    { phone: '0901234506', status: 'completed', error: null, step: 2 },
    { phone: '0901234507', status: 'completed', error: null, step: 2 },
    { phone: '0901234508', status: 'failed', error: 'Tài khoản người nhận tạm thời bị khoá bởi Zalo', step: 1 },
  ];

  for (const [idx, s] of sampleSteps.entries()) {
    await client.query(
      `INSERT INTO campaign_run_recipient_steps (
        id_campaign_run, id_run, id_campaign, id_node, channel,
        recipient_key, last_completed_step, is_fully_completed, meta, last_sent_at, updated_at
      ) VALUES (
        $1, $1, $2, 'node_send_zalo_1', 'zalo',
        $3, $4, $5, $6, NOW() - ($7 || ' minutes')::INTERVAL, NOW()
      )`,
      [
        run2Id, camp2Id, s.phone, s.step, s.status === 'completed',
        JSON.stringify({ error: s.error, status: s.status }),
        Math.max(1, 40 - idx * 4),
      ],
    );
  }

  // Campaign 3: Completed Mixed
  const res3 = await client.query(
    `INSERT INTO campaigns (
      id_user, workspace_owner_id, created_by, campaign_name, description,
      campaign_type, status, total_customers, total_sent, total_delivered,
      total_opened, total_clicked, total_converted, total_revenue,
      published_at, start_date, end_date, last_run_at, created_at, updated_at
    ) VALUES (
      $1, $1, $1, 'Chương trình Tri ân Khách hàng VIP Quý 3', 'Kết hợp Email thông báo và Zalo gửi thiệp cảm ơn',
      'mixed', 'completed', 250, 250, 248, 195, 120, 45, 67500000,
      NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days',
      NOW() - INTERVAL '4 days', NOW() - INTERVAL '15 days', NOW()
    ) RETURNING id`,
    [userId],
  );
  const camp3Id = res3.rows[0].id;

  await client.query(
    `INSERT INTO campaign_runs (
      id_campaign, workspace_owner_id, run_name, run_type, status,
      started_at, completed_at, total_recipients, successful_sends, failed_sends, skipped_sends, created_at
    ) VALUES (
      $1, $2, 'Toàn bộ danh sách VIP 250 khách', 'scheduled', 'completed',
      NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days', 250, 248, 2, 0, NOW() - INTERVAL '5 days'
    )`,
    [camp3Id, userId],
  );

  // Campaign 4: Failed Email
  const res4 = await client.query(
    `INSERT INTO campaigns (
      id_user, workspace_owner_id, created_by, campaign_name, description,
      campaign_type, status, total_customers, total_sent, total_delivered,
      total_opened, start_date, last_run_at, created_at, updated_at
    ) VALUES (
      $1, $1, $1, 'Thông báo Khuyến mãi Đột xuất Flash Sale', 'Gửi email hàng loạt sự kiện flash sale 24h',
      'email', 'failed', 100, 15, 10, 5,
      NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', NOW() - INTERVAL '3 days', NOW()
    ) RETURNING id`,
    [userId],
  );
  const camp4Id = res4.rows[0].id;

  await client.query(
    `INSERT INTO campaign_runs (
      id_campaign, workspace_owner_id, run_name, run_type, status,
      started_at, total_recipients, successful_sends, failed_sends, skipped_sends,
      error_message, created_at
    ) VALUES (
      $1, $2, 'Đợt 1 — 100 khách hàng tiềm năng', 'manual', 'failed',
      NOW() - INTERVAL '1 day', 100, 10, 5, 0,
      'Tài khoản SMTP bị gián đoạn kết nối do vượt ngưỡng gửi hàng loạt (535 Authentication Failed)',
      NOW() - INTERVAL '1 day'
    )`,
    [camp4Id, userId],
  );
}

/**
 * Dựng một luồng hoàn chỉnh cho chiến dịch nháp: Khởi chạy → Đọc Sheet → Gửi Email.
 *
 * Vì sao cần: trình dựng chiến dịch mở ra một khung TRẮNG nếu chiến dịch chưa có
 * node nào. Bài hướng dẫn "Tạo chiến dịch" cần ảnh của khối đã nối, bảng cài đặt
 * của khối đọc dữ liệu, và thanh công cụ — không có node thì chẳng chụp được gì.
 *
 * Chọn `read_sheet` chứ không phải khối đọc dữ liệu khác: nút "Kiểm tra kết nối"
 * mà bài viết chỉ đích danh chỉ nằm trong bảng cài đặt của khối Sheet
 * (NodeConfigModalReadSheetSection). Nút hiện ra không cần Sheet thật — bấm vào
 * mới cần, mà ảnh chụp thì không bấm.
 *
 * ⚠ CHỤP ẢNH THÌ PHẢI TẮT WORKER NỀN: chạy backend với `SCHEDULER_ENABLED=false`.
 * Worker quét các chiến dịch `active`, thấy chiến dịch Zalo mẫu không có node thì
 * đánh lượt chạy của nó thành `failed` kèm dòng "Chiến dịch không có node nào".
 * Dòng đó hiện thẳng trong mục "Chiến dịch gần đây" của trang Giám sát gửi tin —
 * tức là lọt vào ảnh minh hoạ, và người đọc thấy một lỗi CHỈ TỒN TẠI Ở DỮ LIỆU
 * MẪU. Đã lọt lên production một lần theo đúng đường này.
 *
 * Cấp node cho chiến dịch Zalo đó thay vì tắt worker thì KHÔNG xong: worker chạy
 * tiếp rồi hỏng ở chỗ khác (`null value in column "execution_order"`), đổi một
 * lỗi giả lấy một lỗi giả khác.
 */
export async function seedCampaignFlow(client, { userId }) {
  const { rows: campaigns } = await client.query(
    `SELECT id FROM campaigns
     WHERE id_user = $1 AND status = 'draft'
     ORDER BY id LIMIT 1`,
    [userId],
  );
  if (!campaigns.length) return 0;
  const campaignId = campaigns[0].id;

  const { rows: templates } = await client.query(
    'SELECT id FROM email_templates WHERE id_user = $1 ORDER BY id LIMIT 1',
    [userId],
  );
  const templateId = templates[0]?.id || null;

  const nodes = [
    {
      type: 'trigger', subtype: 'manual_trigger', name: 'Khởi chạy',
      x: 120, y: 220, order: 1, config: {},
    },
    {
      type: 'data', subtype: 'read_sheet', name: 'Đọc dữ liệu Sheet',
      x: 460, y: 220, order: 2,
      config: { sheetUrl: 'https://docs.google.com/spreadsheets/d/DEMO_SHEET_ID/edit#gid=0' },
    },
    {
      type: 'action', subtype: 'send_email', name: 'Gửi email chào mừng',
      x: 800, y: 220, order: 3,
      config: templateId ? { templateId: String(templateId) } : {},
    },
  ];

  const ids = [];
  for (const node of nodes) {
    const { rows } = await client.query(
      `INSERT INTO campaign_nodes (
         id_campaign, node_type, node_subtype, node_name,
         position_x, position_y, config, execution_order, id_email_template
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        campaignId, node.type, node.subtype, node.name,
        node.x, node.y, JSON.stringify(node.config), node.order,
        node.subtype === 'send_email' ? templateId : null,
      ],
    );
    ids.push(rows[0].id);
  }

  for (let i = 0; i < ids.length - 1; i += 1) {
    await client.query(
      `INSERT INTO campaign_connections (id_campaign, source_node_id, target_node_id, connection_type)
       VALUES ($1, $2, $3, 'default')`,
      [campaignId, ids[i], ids[i + 1]],
    );
  }

  return ids.length;
}

/**
 * 5. E2E_SEED_CHATBOT: 2 chatbot + 3 tài liệu (ready, processing, error)
 */
export async function seedChatbot(client, { userId }) {
  const res1 = await client.query(
    `INSERT INTO custom_chatbots (
      id_user, name, description, theme_color, position, greeting_msg,
      welcome_message, is_active, ai_model, temperature, suggested_questions,
      created_at, updated_at
    ) VALUES (
      $1, 'Trợ lý CSKH & Tư vấn Bán hàng 24/7', 'Tự động trả lời thắc mắc của khách hàng về sản phẩm, dịch vụ và bảng giá',
      '#ee7518', 'bottom-right', 'Xin chào! Em là trợ lý AI UKNOW, em có thể giúp gì cho anh/chị ạ?',
      'Xin chào! Em là trợ lý AI UKNOW, em có thể giúp gì cho anh/chị ạ?', TRUE, 'gemini-2.5-flash', 0.7,
      ARRAY['Bảng giá các gói dịch vụ?', 'Cách tích hợp Zalo OA?', 'Chính sách bảo hành & hoàn tiền?'],
      NOW() - INTERVAL '15 days', NOW()
    ) RETURNING id`,
    [userId],
  );
  const bot1Id = res1.rows[0].id;

  await client.query(
    `INSERT INTO custom_chatbots (
      id_user, name, description, theme_color, position, greeting_msg,
      welcome_message, is_active, ai_model, temperature, suggested_questions,
      created_at, updated_at
    ) VALUES (
      $1, 'Chatbot Hỗ trợ Kỹ thuật & HDSD', 'Hướng dẫn sử dụng chi tiết các tính năng trên hệ thống UKNOW Campaign',
      '#2563eb', 'bottom-right', 'Chào bạn! Mình sẵn sàng giải đáp mọi thắc mắc kỹ thuật về nền tảng.',
      'Chào bạn! Mình sẵn sàng giải đáp mọi thắc mắc kỹ thuật về nền tảng.', TRUE, 'gemini-2.5-flash', 0.5,
      ARRAY['Làm sao kết nối SMTP?', 'Cách tạo kịch bản gửi tự động?'],
      NOW() - INTERVAL '10 days', NOW()
    )`,
    [userId],
  );

  const docs = [
    {
      title: 'Chính sách bán hàng & Bảng giá dịch vụ 2026.pdf',
      type: 'file',
      key: 'uploads/docs/chinh-sach-2026.pdf',
      status: 'ready',
      error: null,
      chars: 15400,
      chunks: 12,
      createdDaysAgo: 10,
    },
    {
      title: 'Tài liệu Hướng dẫn Thiết lập Chiến dịch Đa kênh.docx',
      type: 'file',
      key: 'uploads/docs/hdsd-chien-dich.docx',
      status: 'processing',
      error: null,
      chars: 0,
      chunks: 0,
      createdDaysAgo: 1,
    },
    {
      title: 'Quy định bảo mật và điều khoản thanh toán.pdf',
      type: 'file',
      key: 'uploads/docs/dieu-khoan.pdf',
      status: 'error',
      error: 'Tệp tin bị khoá mật khẩu hoặc định dạng hỏng không thể trích xuất văn bản',
      chars: 0,
      chunks: 0,
      createdDaysAgo: 3,
    },
  ];

  for (const d of docs) {
    await client.query(
      `INSERT INTO custom_chatbot_documents (
        chatbot_id, owner_user_id, source_type, source_key, title,
        status, error_message, extracted_chars, chunk_count, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        NOW() - ($10 || ' days')::INTERVAL, NOW()
      )`,
      [bot1Id, userId, d.type, d.key, d.title, d.status, d.error, d.chars, d.chunks, d.createdDaysAgo],
    );
  }
}

/**
 * 6. E2E_SEED_INBOX: Channel connection + 8 channel conversations + messages (1 ai_paused = true)
 *    và Widget + 8 webchat conversations
 */
export async function seedInbox(client, { userId }) {
  // 1. Kênh Zalo OA trong channel_connections (phục vụ /app/settings/inbox)
  const channelRes = await client.query(
    `INSERT INTO channel_connections (
      id_user, channel, display_name, is_active, webhook_token, external_channel_id,
      created_at, updated_at
    ) VALUES (
      $1, 'zalo_oa', 'Zalo Official Account UKNOW', TRUE, 'token_demo_inbox_zalo_oa', '2847192837482910',
      NOW() - INTERVAL '20 days', NOW()
    ) ON CONFLICT (id_user, channel) DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING id`,
    [userId],
  );
  const channelId = channelRes.rows[0].id;

  // 2. Web widget config
  const widgetRes = await client.query(
    `INSERT INTO web_widget_configs (
      id_user, widget_key, display_name, theme_color, is_active,
      created_at, updated_at
    ) VALUES (
      $1, 'uknow_demo_inbox_widget', 'Hộp thư Website UKNOW', '#ee7518', TRUE,
      NOW() - INTERVAL '20 days', NOW()
    ) ON CONFLICT (widget_key) DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING id`,
    [userId],
  );
  const widgetId = widgetRes.rows[0].id;

  const visitors = [
    { name: 'Nguyễn Văn An', email: 'an.nguyen@gmail.com', phone: '0901234501', aiPaused: false },
    { name: 'Trần Thị Mai', email: 'mai.tran@gmail.com', phone: '0901234502', aiPaused: true },
    { name: 'Lê Hoàng Long', email: 'long.le@gmail.com', phone: '0901234503', aiPaused: false },
    { name: 'Phạm Thu Trang', email: 'trang.pham@gmail.com', phone: '0901234504', aiPaused: false },
    { name: 'Vũ Đức Thắng', email: 'thang.vu@gmail.com', phone: '0901234505', aiPaused: false },
    { name: 'Đỗ Minh Châu', email: 'chau.do@gmail.com', phone: '0901234506', aiPaused: false },
    { name: 'Hoàng Yến Nhi', email: 'nhi.hoang@gmail.com', phone: '0901234507', aiPaused: false },
    { name: 'Bùi Quốc Hưng', email: 'hung.bui@gmail.com', phone: '0901234508', aiPaused: false },
  ];

  for (const [idx, v] of visitors.entries()) {
    const hoursAgo = 72 - idx * 8;
    // MỖI khách chỉ đi qua MỘT kênh. Tạo cả hai thì hộp thư hợp nhất gộp hai
    // nguồn lại và cùng một người hiện hai lần — ảnh minh hoạ trông như lỗi.
    // Chia đôi cũng đúng tinh thần bài viết: hộp thư gom nhiều kênh về một chỗ.
    const viaZaloOa = idx % 2 === 0;

    // Seed channel_conversations (kênh Zalo OA)
    const chConvRes = viaZaloOa ? await client.query(
      `INSERT INTO channel_conversations (
        id_user, id_channel, channel, external_id,
        visitor_name, visitor_info, started_at, last_message_at, status,
        ai_paused, ai_paused_at, created_at
      ) VALUES (
        $1, $2, 'zalo_oa', $3,
        $4, $5, NOW() - ($6 || ' hours')::INTERVAL, NOW() - ($7 || ' hours')::INTERVAL, 'active',
        $8, CASE WHEN $8 THEN NOW() - INTERVAL '1 hour' ELSE NULL END,
        NOW() - ($6 || ' hours')::INTERVAL
      ) RETURNING id`,
      [
        userId, channelId, `zalo_user_demo_${idx + 1}`,
        v.name, JSON.stringify({ email: v.email, phone: v.phone }),
        hoursAgo, Math.max(1, hoursAgo - 4), v.aiPaused,
      ],
    ) : null;
    const chConvId = chConvRes?.rows[0].id ?? null;

    // Seed webchat_conversations (widget trên website)
    const webConvRes = viaZaloOa ? null : await client.query(
      `INSERT INTO webchat_conversations (
        id_user, id_widget_config, widget_key, session_id,
        visitor_name, visitor_email, started_at, last_message_at, status,
        ai_paused, ai_paused_at, created_at
      ) VALUES (
        $1, $2, 'uknow_demo_inbox_widget', $3,
        $4, $5, NOW() - ($6 || ' hours')::INTERVAL, NOW() - ($7 || ' hours')::INTERVAL, 'active',
        $8, CASE WHEN $8 THEN NOW() - INTERVAL '1 hour' ELSE NULL END,
        NOW() - ($6 || ' hours')::INTERVAL
      ) RETURNING id`,
      [
        userId, widgetId, `session_demo_${idx + 1}`,
        v.name, v.email, hoursAgo, Math.max(1, hoursAgo - 4), v.aiPaused,
      ],
    );
    const webConvId = webConvRes?.rows[0].id ?? null;

    const messages = [
      { role: 'visitor', content: `Xin chào, mình là ${v.name}, cho mình hỏi gói Pro có những tính năng gì?` },
      { role: 'bot', content: 'Dạ chào bạn! Gói Pro bao gồm 10.000 tin nhắn Zalo, 50.000 Email, không giới hạn chiến dịch và tích hợp đầy đủ Chatbot AI ạ.' },
      { role: 'visitor', content: 'Gói này có hỗ trợ xuất hoá đơn VAT công ty không bạn?' },
      { role: 'bot', content: 'Dạ có ạ, UKNOW hỗ trợ xuất hoá đơn điện tử hợp lệ đầy đủ theo thông tin doanh nghiệp của bạn.' },
      { role: 'agent', content: 'Chào bạn, mình là tư vấn viên của UKNOW. Mình có thể hỗ trợ trực tiếp thêm thông tin gì cho bạn không ạ?' },
      { role: 'visitor', content: 'Cảm ơn bạn nhé, mình đang cân nhắc đăng ký gói năm.' },
    ];

    for (const [mIdx, m] of messages.entries()) {
      const msgHoursAgo = Math.max(1, hoursAgo - mIdx);

      // channel_messages
      if (chConvId) await client.query(
        `INSERT INTO channel_messages (
          id_conversation, id_user, id_channel, role, content, is_read, read_at, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, TRUE, NOW() - ($6 || ' hours')::INTERVAL, NOW() - ($6 || ' hours')::INTERVAL
        )`,
        [chConvId, userId, channelId, m.role, m.content, msgHoursAgo],
      );

      // webchat_messages
      if (webConvId) await client.query(
        `INSERT INTO webchat_messages (
          id_conversation, id_user, role, content, created_at
        ) VALUES (
          $1, $2, $3, $4, NOW() - ($5 || ' hours')::INTERVAL
        )`,
        [webConvId, userId, m.role, m.content, msgHoursAgo],
      );
    }
  }
}

/**
 * Nối khách hàng vào các chiến dịch đã seed.
 *
 * Thiếu bảng nối `campaign_customers` thì trang "Khách hàng từ chiến dịch" mở ra
 * chỉ có dòng "Không có khách hàng nào trong chiến dịch này", dù chiến dịch ghi
 * hàng trăm tin đã gửi — số đó nằm ở cột trên bảng campaigns, không phải quan hệ.
 *
 * Chỉ nối vào chiến dịch ĐÃ CHẠY (active/completed/failed); chiến dịch nháp thì
 * đúng ra chưa có ai tham gia.
 */
/**
 * Nối khách hàng vào các chiến dịch đã seed và tạo tin nhắn gửi mẫu (email_messages / zalo_messages).
 *
 * Thiếu bảng nối `campaign_customers` thì trang "Khách hàng từ chiến dịch" mở ra
 * chỉ có dòng "Không có khách hàng nào trong chiến dịch này", dù chiến dịch ghi
 * hàng trăm tin đã gửi — số đó nằm ở cột trên bảng campaigns, không phải quan hệ.
 *
 * Đồng thời seed `email_messages` và `customer_journey` (có `id_run` và `id_campaign`)
 * để hộp thoại "Hành trình khách hàng" (`chi-tiet-khach`) hiển thị đầy đủ dòng thời gian
 * các sự kiện đã gửi, đã mở, đã bấm link.
 */
export async function seedCampaignCustomers(client, { userId }) {
  const { rows: campaigns } = await client.query(
    `SELECT id, campaign_name, campaign_type FROM campaigns
      WHERE COALESCE(workspace_owner_id, id_user) = $1
        AND status IN ('active', 'completed', 'failed')
      ORDER BY id`,
    [userId],
  );
  const { rows: customers } = await client.query(
    'SELECT id, full_name, email, phone FROM customers WHERE COALESCE(workspace_owner_id, id_user) = $1 ORDER BY id',
    [userId],
  );
  if (!campaigns.length || !customers.length) return 0;

  const { rows: emailTemplates } = await client.query(
    'SELECT id, template_name, body_html, body_text FROM email_templates WHERE id_user = $1 ORDER BY id LIMIT 1',
    [userId],
  );
  const defaultTemplate = emailTemplates[0] || null;

  let linked = 0;
  for (const [index, campaign] of campaigns.entries()) {
    // Tìm đợt chạy (run) tương ứng của chiến dịch
    const { rows: runs } = await client.query(
      'SELECT id, run_name FROM campaign_runs WHERE id_campaign = $1 ORDER BY id DESC LIMIT 1',
      [campaign.id],
    );
    const runId = runs[0]?.id || null;

    // Mỗi chiến dịch lấy một lát khách khác nhau, để các trang không giống hệt nhau.
    const slice = customers.slice(index * 3, index * 3 + 12);
    for (const [position, customer] of slice.entries()) {
      const daysAgo = 3 + (position % 5);
      const isOpened = position % 2 === 0;
      const isClicked = position % 4 === 0;
      const openCount = isOpened ? (isClicked ? 3 : 1) : 0;
      const clickCount = isClicked ? 1 : 0;

      await client.query(
        `INSERT INTO campaign_customers (
           id_campaign, id_customer, has_opened, has_clicked,
           email_received_count, email_opened_count, email_clicked_count,
           first_email_sent_at, last_email_sent_at,
           first_email_opened_at, last_email_opened_at,
           first_email_clicked_at, last_email_clicked_at,
           created_at
         ) VALUES (
           $1, $2, $3, $4,
           1, $5, $6,
           NOW() - ($7 || ' days')::INTERVAL, NOW() - ($7 || ' days')::INTERVAL,
           CASE WHEN $5 > 0 THEN NOW() - ($7 || ' days')::INTERVAL + INTERVAL '1 hour' ELSE NULL END,
           CASE WHEN $5 > 0 THEN NOW() - ($7 || ' days')::INTERVAL + INTERVAL '2 hours' ELSE NULL END,
           CASE WHEN $6 > 0 THEN NOW() - ($7 || ' days')::INTERVAL + INTERVAL '3 hours' ELSE NULL END,
           CASE WHEN $6 > 0 THEN NOW() - ($7 || ' days')::INTERVAL + INTERVAL '3 hours' ELSE NULL END,
           NOW() - ($7 || ' days')::INTERVAL
         )
         ON CONFLICT DO NOTHING`,
        [
          campaign.id, customer.id,
          isOpened, isClicked,
          openCount, clickCount, daysAgo,
        ],
      );

      // Seed email_messages (tin gửi qua Email)
      if (runId) {
        const subject = `[UKNOW] Tri ân khách hàng thân thiết — Ưu đãi đặc biệt Quý 3`;
        const bodyHtml = defaultTemplate?.body_html || `<p>Xin chào <strong>${customer.full_name || 'Quý khách'}</strong>,</p><p>Cảm ơn bạn đã luôn đồng hành cùng UKNOW. Chúng tôi gửi tặng bạn mã giảm giá đặc quyền.</p><p><a href="https://uknow.vn/pricing">Xem chi tiết ưu đãi tại đây</a></p>`;
        const bodyText = defaultTemplate?.body_text || `Xin chào ${customer.full_name || 'Quý khách'}, cảm ơn bạn đã đồng hành cùng UKNOW.`;

        const emailRes = await client.query(
          `INSERT INTO email_messages (
             id_user, id_campaign, id_run, id_customer, id_email_template,
             recipient_email, recipient_name, sender_email, sender_name,
             from_address, reply_to, subject, body_html, body_text,
             status, open_count, click_count,
             first_opened_at, last_opened_at, first_clicked_at, last_clicked_at,
             sent_at, delivered_at, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, 'cskh@uknow.vn', 'CSKH UKNOW',
             'CSKH UKNOW <cskh@uknow.vn>', 'support@uknow.vn', $8, $9, $10,
             'delivered', $11, $12,
             CASE WHEN $11 > 0 THEN NOW() - ($13 || ' days')::INTERVAL + INTERVAL '1 hour' ELSE NULL END,
             CASE WHEN $11 > 0 THEN NOW() - ($13 || ' days')::INTERVAL + INTERVAL '2 hours' ELSE NULL END,
             CASE WHEN $12 > 0 THEN NOW() - ($13 || ' days')::INTERVAL + INTERVAL '3 hours' ELSE NULL END,
             CASE WHEN $12 > 0 THEN NOW() - ($13 || ' days')::INTERVAL + INTERVAL '3 hours' ELSE NULL END,
             NOW() - ($13 || ' days')::INTERVAL,
             NOW() - ($13 || ' days')::INTERVAL,
             NOW() - ($13 || ' days')::INTERVAL,
             NOW() - ($13 || ' days')::INTERVAL
           ) RETURNING id`,
          [
            userId, campaign.id, runId, customer.id, defaultTemplate?.id || null,
            customer.email, customer.full_name || 'Khách hàng',
            subject, bodyHtml, bodyText,
            openCount, clickCount, daysAgo,
          ],
        );
        const emailMsgId = emailRes.rows[0].id;

        // Hành trình dòng thời gian: email_sent
        await client.query(
          `INSERT INTO customer_journey (
             id_customer, id_campaign, id_run, id_email_message,
             event_type, event_channel, event_data, event_at, created_at
           ) VALUES
             ($1, $2, $3, $4, 'email_sent', 'email', $5, NOW() - ($6 || ' days')::INTERVAL, NOW() - ($6 || ' days')::INTERVAL)`,
          [
            customer.id, campaign.id, runId, emailMsgId,
            JSON.stringify({ subject }),
            daysAgo,
          ],
        );

        // Hành trình dòng thời gian: email_opened
        if (isOpened) {
          await client.query(
            `INSERT INTO customer_journey (
               id_customer, id_campaign, id_run, id_email_message,
               event_type, event_channel, event_data, event_at, created_at
             ) VALUES
               ($1, $2, $3, $4, 'email_opened', 'email', $5, NOW() - ($6 || ' days')::INTERVAL + INTERVAL '1 hour', NOW() - ($6 || ' days')::INTERVAL + INTERVAL '1 hour')`,
            [
              customer.id, campaign.id, runId, emailMsgId,
              JSON.stringify({ subject }),
              daysAgo,
            ],
          );
        }

        // Hành trình dòng thời gian: email_clicked
        if (isClicked) {
          await client.query(
            `INSERT INTO customer_journey (
               id_customer, id_campaign, id_run, id_email_message,
               event_type, event_channel, event_data, event_at, created_at
             ) VALUES
               ($1, $2, $3, $4, 'email_clicked', 'email', $5, NOW() - ($6 || ' days')::INTERVAL + INTERVAL '3 hours', NOW() - ($6 || ' days')::INTERVAL + INTERVAL '3 hours')`,
            [
              customer.id, campaign.id, runId, emailMsgId,
              JSON.stringify({
                subject,
                targetUrl: 'https://uknow.vn/pricing',
                label: 'Xem chi tiết ưu đãi tại đây',
              }),
              daysAgo,
            ],
          );
        }

        // Nếu là chiến dịch Zalo hoặc Mixed: thêm tin Zalo tương ứng
        if (campaign.campaign_type === 'zalo' || campaign.campaign_type === 'mixed') {
          const zaloMsgContent = `Chào ${customer.full_name || 'bạn'}, UKNOW gửi tặng bạn mã giảm giá 20% khi gia hạn dịch vụ trong tháng này!`;
          const zaloRes = await client.query(
            `INSERT INTO zalo_messages (
               id_user, id_campaign, id_run, id_customer,
               recipient_phone, recipient_name, channel,
               message_content, status, click_count,
               sent_at, created_at, updated_at
             ) VALUES (
               $1, $2, $3, $4,
               $5, $6, 'zalo_oa',
               $7, 'delivered', $8,
               NOW() - ($9 || ' days')::INTERVAL,
               NOW() - ($9 || ' days')::INTERVAL,
               NOW() - ($9 || ' days')::INTERVAL
             ) RETURNING id`,
            [
              userId, campaign.id, runId, customer.id,
              customer.phone || '0901234501', customer.full_name || 'Khách hàng',
              zaloMsgContent, clickCount, daysAgo,
            ],
          );
          const zaloMsgId = zaloRes.rows[0].id;

          await client.query(
            `INSERT INTO customer_journey (
               id_customer, id_campaign, id_run, id_zalo_message,
               event_type, event_channel, event_data, event_at, created_at
             ) VALUES
               ($1, $2, $3, $4, 'zalo_sent', 'zalo', $5, NOW() - ($6 || ' days')::INTERVAL, NOW() - ($6 || ' days')::INTERVAL)`,
            [
              customer.id, campaign.id, runId, zaloMsgId,
              JSON.stringify({ message: zaloMsgContent }),
              daysAgo,
            ],
          );
        }
      }

      linked += 1;
    }
  }
  return linked;
}

/**
 * HTML mẫu cho trang landing đã xuất bản.
 *
 * Phải có nội dung THẬT chứ không để rỗng: trình sửa ẩn tab "Sửa trang hiện tại"
 * trong cửa sổ AI khi `html_content` rỗng (xem LandingPageFullEditor.jsx —
 * điều kiện `Boolean(String(form.htmlContent).trim())`), nên trang rỗng thì cửa
 * sổ AI chỉ hiện 2 tab thay vì 3.
 *
 * `<!-- UKNOW_LP_FORM -->` là mốc đánh dấu chỗ hệ thống nhét iframe form đăng ký
 * vào; xoá mốc này là trang mất chỗ thu thông tin khách.
 */
const DEMO_LANDING_HTML = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Khoá học Marketing Tự Động Hoá Thực Chiến</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white text-slate-800">
  <section class="bg-gradient-to-b from-orange-50 to-white py-20 px-4 text-center">
    <h1 class="text-4xl font-bold text-slate-900">Marketing Tự Động Hoá Thực Chiến</h1>
    <p class="mt-4 max-w-2xl mx-auto text-lg text-slate-600">
      8 buổi học kèm bộ mẫu chiến dịch dùng được ngay. Học xong là chạy được chiến dịch đầu tiên.
    </p>
    <a href="#dang-ky" class="mt-8 inline-block rounded-xl bg-orange-500 px-8 py-4 font-semibold text-white">Đăng ký ngay</a>
  </section>

  <section class="py-16 px-4 max-w-5xl mx-auto grid gap-8 md:grid-cols-3">
    <div><h3 class="font-semibold text-lg">Học theo dự án thật</h3><p class="mt-2 text-slate-600">Mỗi buổi dựng một phần của chiến dịch thật, không học chay.</p></div>
    <div><h3 class="font-semibold text-lg">Bộ mẫu có sẵn</h3><p class="mt-2 text-slate-600">Nhận trọn bộ mẫu email và Zalo đã kiểm chứng.</p></div>
    <div><h3 class="font-semibold text-lg">Hỗ trợ 3 tháng</h3><p class="mt-2 text-slate-600">Hỏi đáp trong nhóm riêng suốt 3 tháng sau khoá.</p></div>
  </section>

  <section id="dang-ky" class="py-16 px-4 bg-slate-50">
    <h2 class="text-2xl font-bold text-center text-slate-900">Để lại thông tin để nhận tư vấn</h2>
    <!-- UKNOW_LP_FORM -->
  </section>

  <footer class="py-10 text-center text-sm text-slate-500">© 2026 Founder AI</footer>
</body>
</html>`;

/**
 * 7. E2E_SEED_LANDING: Bổ sung 1 trang published có form + 1 trang có custom domain
 */
export async function seedLandingPages(client, { userId }) {
  await client.query(
    `INSERT INTO landing_pages (
      id_user, workspace_owner_id, created_by, slug, title, html_content,
      status, is_published, published_at, created_at, updated_at
    ) VALUES (
      $1, $1, $1, 'khoa-hoc-marketing-tu-dong-hoa', 'Khoá học Marketing Tự Động Hoá Thực Chiến', $2,
      'published', TRUE, NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days', NOW()
    )`,
    [userId, DEMO_LANDING_HTML],
  );

  const res2 = await client.query(
    `INSERT INTO landing_pages (
      id_user, workspace_owner_id, created_by, slug, title,
      status, is_published, published_at, created_at, updated_at
    ) VALUES (
      $1, $1, $1, 'dich-vu-doanh-nghiep-vip', 'Trang Giới Thiệu Dịch Vụ Doanh Nghiệp VIP',
      'published', TRUE, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NOW()
    ) RETURNING id`,
    [userId],
  );
  const landing2Id = res2.rows[0].id;

  // cf_managed = FALSE + status pending_verification: chỉ ở trạng thái này trình
  // sửa mới in ra bảng bản ghi DNS cần thêm. Để Cloudflare tự quản (cf_managed)
  // thì màn hình chỉ báo "đang chờ hệ thống cấp DNS", không có hướng dẫn nào.
  await client.query(
    `INSERT INTO landing_page_domains (
      landing_page_id, hostname, domain_type, is_apex_domain,
      verification_token, status, cf_managed, verified_at, created_at, updated_at
    ) VALUES (
      $1, 'dangky.doanhnghiep.vn', 'subdomain', FALSE,
      'token_demo_verify_domain', 'pending_verification', FALSE, NULL, NOW() - INTERVAL '5 days', NOW()
    )`,
    [landing2Id],
  );

  // Thư viện mẫu công khai. Không có mẫu nào thì nút "Template" mở ra một
  // gallery rỗng, và nút "Hoàn tác" trên thanh công cụ không bao giờ xuất hiện —
  // nó chỉ hiện sau khi mẫu hoặc AI ghi đè giao diện (`htmlBeforeOverwrite`).
  const templates = [
    ['Trang bán khoá học', 'course', 'Bố cục hero + lợi ích + form đăng ký, hợp cho khoá học online.'],
    ['Giới thiệu dịch vụ', 'service', 'Trang một cột giới thiệu dịch vụ kèm bảng giá và form liên hệ.'],
    ['Đăng ký sự kiện', 'event', 'Trang đăng ký hội thảo: thời gian, diễn giả, form ghi danh.'],
  ];
  for (const [name, category, description] of templates) {
    await client.query(
      `INSERT INTO landing_page_templates (
        name, category, description, html_structure, is_active, is_public, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, TRUE, TRUE, NOW(), NOW())`,
      [name, category, description, DEMO_LANDING_HTML],
    );
  }
}

/**
 * 8. E2E_SEED_ORDERS: 5 đơn hàng các trạng thái, có order_code, invoice_info
 */
export async function seedOrders(client, { userId, planIds }) {
  // Mã gói phải khớp demo-plans.js: trial | custom | starter | basic |
  // professional | enterprise. Gọi nhầm `planIds.pro` thì rơi vào số dự phòng
  // và đơn 899.000đ hiện tên "Dùng thử" — ảnh chụp ra là sai giá.
  const basicId = planIds?.basic || 1;
  const proId = planIds?.professional || 2;
  const starterId = planIds?.starter || 3;
  const enterpriseId = planIds?.enterprise || 4;

  const orders = [
    {
      code: 26082301,
      planId: basicId,
      amount: 299000,
      status: 'success',
      period: 'monthly',
      daysAgo: 20,
      paid: true,
      invoice: null,
    },
    {
      code: 26082302,
      planId: proId,
      amount: 899000,
      status: 'success',
      period: 'monthly',
      daysAgo: 5,
      paid: true,
      invoice: {
        company_name: 'Công ty TNHH Giải Pháp Công Nghệ Á Châu',
        tax_code: '0312345678',
        company_address: '123 Nguyễn Thị Minh Khai, Quận 1, TP.HCM',
        recipient_email: 'ke-toan@achau-tech.com',
      },
      einvoice: { status: 'cqt_ok', soHdon: '00000128' },
    },
    {
      code: 26082303,
      planId: enterpriseId,
      amount: 2490000,
      status: 'pending',
      period: 'monthly',
      daysAgo: 2,
      paid: false,
      invoice: null,
    },
    {
      code: 26082304,
      planId: starterId,
      amount: 99000,
      status: 'cancelled',
      period: 'monthly',
      daysAgo: 12,
      paid: false,
      invoice: null,
    },
    {
      code: 26082305,
      planId: proId,
      amount: 8990000,
      status: 'success',
      period: 'yearly',
      daysAgo: 60,
      paid: true,
      invoice: {
        company_name: 'Công ty Cổ Phần Thương Mại Dịch Vụ Sao Mai',
        tax_code: '0109876543',
        company_address: '456 Lê Duẩn, Quận Hoàn Kiếm, Hà Nội',
        recipient_email: 'finance@saomai.vn',
      },
      einvoice: { status: 'issued', soHdon: '00000097' },
    },
  ];

  for (const o of orders) {
    const inserted = await client.query(
      `INSERT INTO orders (
        order_code, plan_id, amount, user_id, status, payment_method,
        billing_period, invoice_info, paid_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, 'payos',
        $6, $7, CASE WHEN $8 THEN NOW() - ($9 || ' days')::INTERVAL ELSE NULL END,
        NOW() - ($9 || ' days')::INTERVAL, NOW()
      ) ON CONFLICT (order_code) DO NOTHING
      RETURNING id`,
      [
        o.code, o.planId, o.amount, userId, o.status,
        o.period, o.invoice ? JSON.stringify(o.invoice) : null, o.paid, o.daysAgo,
      ],
    );

    // Cột `invoice_info` chỉ là thông tin khách khai. Trạng thái hoá đơn mà mục
    // "Lịch sử đơn" hiển thị (và link "Xem hoá đơn") đọc từ bảng `einvoices` —
    // thiếu bảng này thì mọi đơn đều hiện "Không xuất hoá đơn".
    if (o.einvoice && inserted.rows[0]?.id) {
      await client.query(
        `INSERT INTO einvoices (
          order_id, ma_tra_cuu, mtchieu, khmshdon, khhdon, so_hdon,
          status, cqt_code, issued_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, '1', 'C26TAA', $4,
          $5, $6, NOW() - ($7 || ' days')::INTERVAL, NOW() - ($7 || ' days')::INTERVAL, NOW()
        )`,
        [
          inserted.rows[0].id,
          `TRACUU${o.code}`,
          `MT${o.code}`,
          o.einvoice.soHdon,
          o.einvoice.status,
          o.einvoice.status === 'cqt_ok' ? `M1-26-C26TAA-${o.code}` : null,
          o.daysAgo,
        ],
      );
    }
  }
}

/**
 * 9. E2E_SEED_VOUCHERS: một mã nhập tay còn hạn, dùng cho ảnh bài "Voucher".
 *
 * Vì sao phải seed dù migration 036 đã có sẵn hai mã: migration bị baseline (chỉ
 * đánh dấu đã chạy, không thực thi) khi dựng DB test từ bootstrap.sql, nên các
 * dòng INSERT trong đó không tồn tại. Mà kể cả có chạy thì `ends_at` cũng tính
 * từ lúc migrate — DB dựng lâu rồi là mã hết hạn, ảnh chụp ra lỗi.
 *
 * Tắt luôn mã tự động: để cả hai thì màn thanh toán đã có sẵn một dòng giảm giá
 * trước khi người dùng gõ gì, rồi mã tay (50.000đ) lại ĐÈ mất ưu đãi tự động
 * (10% của 1.299.000đ = 129.900đ) — ảnh "sau khi áp mã" hoá ra giảm ÍT hơn ảnh
 * "trước khi áp mã". Đúng về mặt cơ chế nhưng nhìn như bug.
 */
export async function seedVouchers(client) {
  await client.query(
    "UPDATE vouchers SET is_active = FALSE, updated_at = NOW() WHERE auto_apply = TRUE",
  );

  await client.query(
    `INSERT INTO vouchers (
       code, name, description, discount_type, discount_value,
       min_order_amount, applies_to_billing_periods,
       starts_at, ends_at, usage_limit, usage_limit_per_user, used_count,
       auto_apply, stackable, is_active, offer_mode
     ) VALUES (
       'WELCOME50K', 'Welcome 50K', 'Nhập mã để giảm 50.000đ cho đơn từ 500.000đ.',
       'fixed_amount', 50000,
       500000, ARRAY['monthly', 'yearly'],
       NOW() - INTERVAL '1 day', NOW() + INTERVAL '365 days', 1000, NULL, 0,
       FALSE, FALSE, TRUE, 'public_code'
     )
     -- Chỉ số duy nhất trên bảng này là CÓ ĐIỀU KIỆN:
     --   CREATE UNIQUE INDEX vouchers_code_active_uniq ON vouchers (code) WHERE is_active = TRUE
     -- Migration 091 bỏ UNIQUE toàn cục để mã đã tắt còn dùng lại được. Viết
     -- ON CONFLICT (code) trơn thì Postgres báo "no unique or exclusion
     -- constraint matching" — phải lặp lại đúng điều kiện của chỉ số.
     ON CONFLICT (code) WHERE is_active = TRUE DO UPDATE SET
       discount_type = EXCLUDED.discount_type,
       discount_value = EXCLUDED.discount_value,
       min_order_amount = EXCLUDED.min_order_amount,
       applies_to_plan_codes = NULL,
       applies_to_billing_periods = EXCLUDED.applies_to_billing_periods,
       starts_at = EXCLUDED.starts_at,
       ends_at = EXCLUDED.ends_at,
       usage_limit = EXCLUDED.usage_limit,
       -- NULL chứ không phải 1: chụp lại nhiều lượt trên cùng một DB thì giới hạn
       -- mỗi khách 1 lần sẽ làm lượt thứ hai báo "Voucher không hợp lệ".
       usage_limit_per_user = NULL,
       used_count = 0,
       auto_apply = FALSE,
       is_active = TRUE,
       offer_mode = 'public_code',
       updated_at = NOW()`,
  );
}

/**
 * 10. E2E_SEED_EMPLOYEES: 3 nhân viên với bộ quyền khác nhau
 */
export async function seedEmployees(client, { userId }) {
  const defaultPasswordHash = await bcrypt.hash('Test@1234', 10);

  const staff = [
    {
      username: 'nv_marketing',
      email: 'marketing@uknow.test',
      fullName: 'Nguyễn Thu Hà (Marketing Lead)',
      permissions: {
        campaigns_view: true,
        campaigns_create: true,
        campaigns_run: true,
        landing_pages: true,
        email_templates: true,
        zalo_templates: true,
      },
      dailyEmail: 1000,
      monthlyEmail: 20000,
      dailyZalo: 500,
      monthlyZalo: 10000,
    },
    {
      username: 'nv_cskh',
      email: 'cskh@uknow.test',
      fullName: 'Trần Quốc Bảo (CSKH & Chăm sóc)',
      permissions: {
        customers: true,
        leads: true,
        email_settings: true,
        zalo_settings: true,
        email_templates: true,
        zalo_templates: true,
      },
      dailyEmail: 500,
      monthlyEmail: 10000,
      dailyZalo: 200,
      monthlyZalo: 5000,
    },
    {
      username: 'nv_intern',
      email: 'intern@uknow.test',
      fullName: 'Lê Thảo My (Thực tập sinh)',
      permissions: {
        campaigns_view: true,
        customers: true,
        leads: true,
      },
      dailyEmail: 100,
      monthlyEmail: 1000,
      dailyZalo: 50,
      monthlyZalo: 500,
    },
  ];

  for (const s of staff) {
    const userRes = await client.query(
      `INSERT INTO users (
        username, email, password_hash, full_name, status, role, is_verified, verified_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, 'active', 'user', TRUE, NOW(), NOW() - INTERVAL '15 days', NOW()
      ) ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
      RETURNING id`,
      [s.username, s.email, defaultPasswordHash, s.fullName],
    );
    const empId = userRes.rows[0].id;

    await client.query(
      `INSERT INTO user_members (
        owner_id, employee_id, permissions, status,
        daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'active',
        $4, $5, $6, $7,
        NOW() - INTERVAL '15 days', NOW()
      ) ON CONFLICT (owner_id, employee_id) DO UPDATE SET
        permissions = EXCLUDED.permissions,
        daily_email_limit = EXCLUDED.daily_email_limit,
        monthly_email_limit = EXCLUDED.monthly_email_limit,
        daily_zalo_limit = EXCLUDED.daily_zalo_limit,
        monthly_zalo_limit = EXCLUDED.monthly_zalo_limit`,
      [
        userId, empId, JSON.stringify(s.permissions),
        s.dailyEmail, s.monthlyEmail, s.dailyZalo, s.monthlyZalo,
      ],
    );
  }
}

/**
 * Nối một mẫu email vào chiến dịch ĐANG CHẠY, để mẫu đó bị khoá không cho sửa.
 *
 * Đặt tên mẫu là "(Hệ thống khoá)" KHÔNG làm nó bị khoá — cơ chế thật nằm ở
 * findActiveCampaignUsages(): mẫu bị khoá khi có chiến dịch `status='active'`
 * với node `send_email` trỏ tới nó. Bài hướng dẫn cũng mô tả đúng như vậy
 * ("đang được dùng bởi chiến dịch đã kích hoạt"), nên phải dựng đúng trạng thái
 * đó thay vì giả bằng cách đặt tên.
 */
export async function seedLockedTemplateUsage(client, { userId }) {
  const { rows: templates } = await client.query(
    'SELECT id FROM email_templates WHERE id_user = $1 ORDER BY id LIMIT 1',
    [userId],
  );
  if (!templates.length) return null;

  // Cần một chiến dịch EMAIL đang chạy; bộ seed chỉ có chiến dịch Zalo ở trạng
  // thái active, nên tạo thêm một cái.
  const { rows: campaigns } = await client.query(
    `INSERT INTO campaigns (
       id_user, workspace_owner_id, created_by, campaign_name, description,
       campaign_type, status, total_customers, published_at, created_at, updated_at
     ) VALUES (
       $1, $1, $1, 'Chuỗi email chăm sóc khách mới (đang chạy)',
       'Chiến dịch đang kích hoạt — mẫu email nó dùng sẽ bị khoá không cho sửa',
       'email', 'active', 40, NOW() - INTERVAL '2 days',
       NOW() - INTERVAL '3 days', NOW()
     ) RETURNING id`,
    [userId],
  );

  await client.query(
    `INSERT INTO campaign_nodes (
       id_campaign, node_type, node_subtype, node_name, id_email_template,
       config, execution_order
     ) VALUES ($1, 'action', 'send_email', 'Gửi email chăm sóc', $2, $3, 1)`,
    [campaigns[0].id, templates[0].id, JSON.stringify({ templateId: String(templates[0].id) })],
  );

  return { campaignId: campaigns[0].id, templateId: templates[0].id };
}

/**
 * Đổ toàn bộ dữ liệu mẫu theo cờ môi trường.
 *
 * @param {import('pg').Client} client
 * @param {{ userId: number|string }} options
 */
export async function seedDemoData(client, { userId }) {
  // `E2E_SEED_PLAN=trial` để chụp các ảnh của bài "Gói dùng thử" — trang Tổng
  // quan gói phải hiện đúng gói dùng thử, chứ hiện gói trả phí thì ảnh nói một
  // đằng bài viết nói một nẻo. Mặc định vẫn là `basic`.
  const { planIds, activePlanId } = await seedDemoPlans(client, {
    userId,
    ...(process.env.E2E_SEED_PLAN ? { activePlanCode: String(process.env.E2E_SEED_PLAN).trim() } : {}),
  });
  const activeName = Object.entries(planIds).find(([, id]) => id === activePlanId)?.[0];

  const seedAll = ['1', 'true', 'yes'].includes(String(process.env.E2E_SEED_ALL || '').toLowerCase());
  const isFlagOn = (name) => seedAll || ['1', 'true', 'yes'].includes(String(process.env[name] || '').toLowerCase());

  // 1. Kênh gửi
  if (isFlagOn('E2E_SEED_CHANNELS')) {
    await seedChannels(client, { userId });
  }

  // 2. Mẫu tin nhắn & nhãn
  if (isFlagOn('E2E_SEED_TEMPLATES')) {
    await seedTemplates(client, { userId });
  }

  // 3. Khách hàng
  if (isFlagOn('E2E_SEED_CUSTOMERS')) {
    await seedCustomers(client, { userId });
  }

  // 4. Chiến dịch
  if (isFlagOn('E2E_SEED_CAMPAIGNS')) {
    await seedCampaigns(client, { userId });
    await seedCampaignFlow(client, { userId });
    // Mẫu bị khoá cần CẢ mẫu lẫn chiến dịch đang chạy — chỉ nối khi có đủ hai bên.
    if (isFlagOn('E2E_SEED_TEMPLATES')) await seedLockedTemplateUsage(client, { userId });
    // Nối khách vào chiến dịch — cần cả hai bên đã có.
    if (isFlagOn('E2E_SEED_CUSTOMERS')) await seedCampaignCustomers(client, { userId });
  }

  // 5. Chatbot
  if (isFlagOn('E2E_SEED_CHATBOT')) {
    await seedChatbot(client, { userId });
  }

  // 6. Inbox & Web widget
  if (isFlagOn('E2E_SEED_INBOX')) {
    await seedInbox(client, { userId });
  }

  // 7. Landing pages
  if (isFlagOn('E2E_SEED_LANDING')) {
    await seedLandingPages(client, { userId });
  }

  // 8. Đơn hàng
  if (isFlagOn('E2E_SEED_ORDERS')) {
    await seedOrders(client, { userId, planIds });
  }

  // 9. Voucher
  if (isFlagOn('E2E_SEED_VOUCHERS')) {
    await seedVouchers(client);
  }

  // 10. Nhân viên
  if (isFlagOn('E2E_SEED_EMPLOYEES')) {
    await seedEmployees(client, { userId });
  }

  // Lệnh hẹn hạ gói (bật riêng vì nó khoá luồng nâng gói)
  const withPending = ['1', 'true', 'yes'].includes(
    String(process.env.E2E_SEED_PENDING_CHANGE || '').toLowerCase(),
  );
  if (withPending) {
    await seedPendingDowngrade(client, { userId, targetPlanId: planIds.starter });
  }

  // Vượt hạn mức landing page (grace | locked)
  const overageMode = String(process.env.E2E_SEED_OVERAGE || '').toLowerCase();
  let overage = null;
  if (overageMode === 'grace' || overageMode === 'locked') {
    overage = await seedLandingPageOverage(client, { userId, mode: overageMode });
  }

  console.log(
    `[e2e-seed] Dữ liệu mẫu: ${Object.keys(planIds).length} gói, tài khoản đang dùng "${activeName}"`
    + (isFlagOn('E2E_SEED_CHANNELS') ? ' | Channels: ON' : '')
    + (isFlagOn('E2E_SEED_TEMPLATES') ? ' | Templates: ON' : '')
    + (isFlagOn('E2E_SEED_CUSTOMERS') ? ' | Customers: ON' : '')
    + (isFlagOn('E2E_SEED_CAMPAIGNS') ? ' | Campaigns: ON' : '')
    + (isFlagOn('E2E_SEED_CHATBOT') ? ' | Chatbot: ON' : '')
    + (isFlagOn('E2E_SEED_INBOX') ? ' | Inbox: ON' : '')
    + (isFlagOn('E2E_SEED_LANDING') ? ' | Landing: ON' : '')
    + (isFlagOn('E2E_SEED_ORDERS') ? ' | Orders: ON' : '')
    + (isFlagOn('E2E_SEED_VOUCHERS') ? ' | Vouchers: ON' : '')
    + (isFlagOn('E2E_SEED_EMPLOYEES') ? ' | Employees: ON' : '')
    + (withPending ? ' | Pending Downgrade: ON' : '')
    + (overage ? ` | Overage: ${overageMode}` : ''),
  );

  return { planIds, activePlanId };
}
