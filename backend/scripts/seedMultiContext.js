/**
 * Seed kịch bản multi-context — để test 1 user có thể vừa có plan riêng,
 * vừa là employee của nhiều doanh nghiệp.
 *
 * Chạy: cd backend && node scripts/seedMultiContext.js
 * Idempotent — chạy lại nhiều lần không tạo trùng.
 *
 * Tạo 2 user test:
 *   1. alice@multi.test — có plan Basic của riêng mình,
 *      đồng thời là employee tại testuser1 (Enterprise) và testuser11 (Basic).
 *   2. bob@multi.test — KHÔNG có plan,
 *      là employee tại testuser2 (Enterprise) và testuser17 (Pro).
 *
 * Mỗi context có permissions & limits khác nhau để dễ phân biệt khi switch.
 *
 * Password chung: Test@1234
 */

import bcrypt from 'bcryptjs';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const pool = new Pool({
  host:     process.env.DB_HOST || 'localhost',
  port:     process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'uknow-campaign',
  user:     process.env.DB_USER || 'postgres',
  password: process.env.DB_WORD || process.env.DB_PASSWORD || '',
});

const TEST_PASSWORD = 'Test@1234';

const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

// 4 preset permissions để dễ nhận biết khi switch context
const PRESETS = {
  // Quản lý đầy đủ — chỉ thiếu thanh toán
  FULL_OPERATOR: {
    campaigns_view: true, campaigns_create: true, campaigns_run: true,
    landing_pages: true, leads: true, customers: true, courses: true,
    email_templates: true, email_settings: true,
    zalo_templates: true, zalo_settings: true,
  },
  // Chỉ chạy email campaigns, không động được Zalo
  EMAIL_ONLY: {
    campaigns_view: true, campaigns_create: true, campaigns_run: true,
    landing_pages: false, leads: true, customers: true, courses: false,
    email_templates: true, email_settings: false,
    zalo_templates: false, zalo_settings: false,
  },
  // Chỉ xem leads, không gửi gì
  VIEWER: {
    campaigns_view: true, campaigns_create: false, campaigns_run: false,
    landing_pages: false, leads: true, customers: true, courses: false,
    email_templates: false, email_settings: false,
    zalo_templates: false, zalo_settings: false,
  },
  // Chuyên Zalo
  ZALO_ONLY: {
    campaigns_view: true, campaigns_create: true, campaigns_run: true,
    landing_pages: false, leads: true, customers: true, courses: false,
    email_templates: false, email_settings: false,
    zalo_templates: true, zalo_settings: true,
  },
};

async function ensureUser(client, { username, email, fullName, activePlanId = null, planExpiresAt = null }) {
  const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length) {
    if (activePlanId) {
      await client.query(
        `UPDATE users SET active_plan_id = $1, subscription_expires_at = $2, updated_at = NOW() WHERE id = $3`,
        [activePlanId, planExpiresAt, existing.rows[0].id]
      );
    }
    return { id: existing.rows[0].id, created: false };
  }

  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  const ins = await client.query(
    `INSERT INTO users
       (username, email, password_hash, full_name, role, status,
        active_plan_id, subscription_expires_at, is_verified, verified_at,
        created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'user', 'active', $5, $6, true, NOW(), NOW(), NOW())
     RETURNING id`,
    [username, email, hash, fullName, activePlanId, planExpiresAt]
  );
  return { id: ins.rows[0].id, created: true };
}

async function ensureMembership(client, { ownerId, employeeId, permissions, limits = {} }) {
  await client.query(
    `INSERT INTO user_members
       (owner_id, employee_id, permissions, status,
        daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit)
     VALUES ($1, $2, $3, 'active', $4, $5, $6, $7)
     ON CONFLICT (owner_id, employee_id) DO UPDATE
       SET permissions = EXCLUDED.permissions,
           daily_email_limit = EXCLUDED.daily_email_limit,
           monthly_email_limit = EXCLUDED.monthly_email_limit,
           daily_zalo_limit = EXCLUDED.daily_zalo_limit,
           monthly_zalo_limit = EXCLUDED.monthly_zalo_limit,
           status = 'active',
           updated_at = NOW()`,
    [
      ownerId, employeeId, JSON.stringify(permissions),
      limits.dailyEmail ?? null, limits.monthlyEmail ?? null,
      limits.dailyZalo ?? null, limits.monthlyZalo ?? null,
    ]
  );
}

async function getUserByEmail(client, email) {
  const r = await client.query('SELECT id, email, active_plan_id FROM users WHERE email = $1', [email]);
  return r.rows[0];
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('🌱 Bắt đầu seed multi-context...\n');

    // ── 1. Tìm owner sẵn có để dùng làm host doanh nghiệp ─────────────────
    const owner1 = await getUserByEmail(client, 'testuser1@uknow-test.com');  // Enterprise
    const owner2 = await getUserByEmail(client, 'testuser2@uknow-test.com');  // Enterprise
    const owner3 = await getUserByEmail(client, 'testuser11@uknow-test.com'); // Basic
    const owner4 = await getUserByEmail(client, 'testuser17@uknow-test.com'); // Pro

    const missing = [
      ['testuser1', owner1], ['testuser2', owner2],
      ['testuser11', owner3], ['testuser17', owner4],
    ].filter(([, u]) => !u);
    if (missing.length) {
      console.error('❌ Thiếu owner users. Chạy `node scripts/seed.js` trước.');
      console.error('   Thiếu:', missing.map(([n]) => n).join(', '));
      process.exit(1);
    }

    // ── 2. Alice — có plan riêng + employee 2 nơi ─────────────────────────
    const alice = await ensureUser(client, {
      username: 'alice_multi',
      email: 'alice@multi.test',
      fullName: 'Alice',
      activePlanId: 1, // Gói Basic
      planExpiresAt: daysFromNow(60),
    });
    console.log(`${alice.created ? '✓ Tạo' : '↻ Cập nhật'} alice@multi.test (id=${alice.id}) — có Gói Basic`);

    await ensureMembership(client, {
      ownerId: owner1.id, employeeId: alice.id,
      permissions: PRESETS.FULL_OPERATOR,
      limits: { dailyEmail: 200, monthlyEmail: 4000, dailyZalo: 30, monthlyZalo: 600 },
    });
    console.log('  ↳ employee tại testuser1 (Enterprise) — FULL_OPERATOR, 200/4000 email, 30/600 zalo');

    await ensureMembership(client, {
      ownerId: owner3.id, employeeId: alice.id,
      permissions: PRESETS.EMAIL_ONLY,
      limits: { dailyEmail: 50, monthlyEmail: 1000, dailyZalo: null, monthlyZalo: null },
    });
    console.log('  ↳ employee tại testuser11 (Basic) — EMAIL_ONLY, 50/1000 email, không gửi Zalo');

    // ── 3. Bob — không có plan, chỉ là employee 2 nơi ─────────────────────
    const bob = await ensureUser(client, {
      username: 'bob_multi',
      email: 'bob@multi.test',
      fullName: 'Bob',
    });
    console.log(`\n${bob.created ? '✓ Tạo' : '↻ Cập nhật'} bob@multi.test (id=${bob.id}) — không có plan`);

    await ensureMembership(client, {
      ownerId: owner2.id, employeeId: bob.id,
      permissions: PRESETS.VIEWER,
      limits: {}, // không limit (unlimited theo plan owner)
    });
    console.log('  ↳ employee tại testuser2 (Enterprise) — VIEWER, không giới hạn gửi tin');

    await ensureMembership(client, {
      ownerId: owner4.id, employeeId: bob.id,
      permissions: PRESETS.ZALO_ONLY,
      limits: { dailyEmail: 0, monthlyEmail: 0, dailyZalo: 80, monthlyZalo: 1500 },
    });
    console.log('  ↳ employee tại testuser17 (Pro) — ZALO_ONLY, 0 email, 80/1500 zalo');

    // ── 4. In tóm tắt ─────────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(70));
    console.log('🎯 HOÀN TẤT. Đăng nhập bằng các tài khoản sau (pass: Test@1234)');
    console.log('═'.repeat(70));
    console.log(`
  alice@multi.test  → Có plan Basic riêng + 2 contexts:
                       • Cá nhân (Basic):     100/2000 email, 15/300 zalo
                       • @ testuser1:         FULL_OPERATOR, 200/4000 email, 30/600 zalo
                       • @ testuser11:        EMAIL_ONLY, 50/1000 email, KHÔNG Zalo

  bob@multi.test    → Không có plan + 2 contexts:
                       • @ testuser2:         VIEWER, không giới hạn
                       • @ testuser17:        ZALO_ONLY, 80/1500 zalo, không email
`);
  } catch (e) {
    console.error('❌ Seed lỗi:', e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
