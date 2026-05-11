/**
 * Seed script — tạo dữ liệu test cho UKNOW platform.
 *
 * Chạy: node backend/scripts/seed.js
 *   hoặc: cd backend && node scripts/seed.js
 *
 * Mật khẩu mặc định tất cả test user: Test@1234
 *
 * Script dùng ON CONFLICT DO NOTHING nên có thể chạy nhiều lần an toàn.
 */

import bcrypt from 'bcryptjs';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'uknow-campaign',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_WORD     || process.env.DB_PASSWORD || '',
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Data definitions ────────────────────────────────────────────────────────

const TEST_PASSWORD = 'Test@1234';

const VIETNAMESE_NAMES = [
  'Nguyễn Minh Tuấn', 'Trần Thị Hoa', 'Lê Văn Đức', 'Phạm Thị Lan',
  'Hoàng Quốc Bảo', 'Vũ Thị Mai', 'Đặng Văn Hùng', 'Bùi Thị Thu',
  'Đỗ Minh Khoa', 'Ngô Thị Yến', 'Lý Văn Nam', 'Trịnh Thị Hằng',
  'Dương Minh Hiếu', 'Đinh Thị Ngọc', 'Phan Quang Vinh', 'Cao Thị Linh',
  'Hà Văn Thắng', 'Mai Thị Hương', 'Tăng Quốc Anh', 'Lưu Thị Phương',
];

const COMPANIES = [
  'ABC Academy', 'TechViet Solutions', 'Sunshine Spa', 'FoodChain VN',
  'EduPro Online', 'HealthFirst Clinic', 'FashionHub Vietnam', 'GreenShop VN',
  'CloudBiz Solutions', 'MediaViet Studio', 'RetailX Vietnam', 'FinSmart VN',
  'TravelPro Asia', 'AutoViet Motor', 'BeautyPlus VN', 'SportZone Vietnam',
  'HomeDecor VN', 'PetCare Vietnam', 'EcoGreen VN', 'SmartHome Solutions',
];

const CAMPAIGN_NAMES = [
  'Email chào mừng thành viên mới',
  'Chiến dịch Black Friday 2025',
  'Zalo chăm sóc khách hàng cũ',
  'Campaign giới thiệu sản phẩm mới',
  'Nhắc nhở gia hạn dịch vụ',
  'Email khuyến mãi cuối tháng',
  'Chiến dịch tái kích hoạt',
  'Zalo thông báo sự kiện',
  'Email newsletter hàng tuần',
  'Chiến dịch ra mắt khóa học',
  'Email mừng sinh nhật khách hàng',
  'Zalo flash sale 48 giờ',
];

const CAMPAIGN_TYPES = ['email', 'zalo', 'zalo_group', 'mixed'];
const CAMPAIGN_STATUSES = ['active', 'active', 'completed', 'completed', 'draft'];
const ORDER_STATUSES = ['completed', 'completed', 'completed', 'pending', 'failed'];

// ─── Main seed function ──────────────────────────────────────────────────────

async function seed() {
  const client = await pool.connect();
  console.log('✅ Đã kết nối DB\n');

  try {
    await client.query('BEGIN');

    // 1. Lấy danh sách plans
    const { rows: plans } = await client.query(
      `SELECT id, name, code, price FROM plans WHERE is_active = true ORDER BY price ASC`
    );
    if (plans.length === 0) {
      console.error('❌ Không tìm thấy plans nào. Hãy tạo plans trước.');
      process.exit(1);
    }
    console.log(`📦 Plans hiện có: ${plans.map(p => p.name).join(', ')}`);

    // 2. Hash password một lần
    console.log('\n🔐 Đang hash password...');
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

    // 3. Tạo 20 user_admin
    console.log('👥 Tạo 20 user_admin...');
    const createdUsers = [];

    for (let i = 0; i < 20; i++) {
      const name = VIETNAMESE_NAMES[i];
      const company = COMPANIES[i];
      const username = `testuser${i + 1}`;
      const email = `testuser${i + 1}@uknow-test.com`;

      // Phân bổ gói: 50% Starter, 30% Pro, 20% Enterprise
      let plan;
      if (i < 10) plan = plans[0];
      else if (i < 16) plan = plans[1] || plans[0];
      else plan = plans[2] || plans[1] || plans[0];

      // Ngày tạo: rải đều 6 tháng gần nhất
      const createdDaysAgo = randomInt(i * 9, i * 9 + 30);
      const createdAt = daysAgo(createdDaysAgo);

      // Ngày hết hạn: đa dạng — một số sắp hết hạn
      let expiresAt;
      if (i < 3) {
        // 3 user sắp hết hạn trong 7 ngày
        expiresAt = daysFromNow(randomInt(1, 6));
      } else if (i < 6) {
        // 3 user hết hạn trong 8-30 ngày
        expiresAt = daysFromNow(randomInt(8, 30));
      } else {
        // Còn lại có hạn dài 1-6 tháng
        expiresAt = daysFromNow(randomInt(30, 180));
      }

      const { rows } = await client.query(
        `INSERT INTO users
           (username, email, password_hash, full_name, role, status,
            active_plan_id, subscription_expires_at, is_verified, verified_at,
            created_at, updated_at)
         VALUES ($1,$2,$3,$4,'user_admin','active',$5,$6,true,NOW(),$7,$7)
         ON CONFLICT (email) DO UPDATE SET
           active_plan_id = EXCLUDED.active_plan_id,
           subscription_expires_at = EXCLUDED.subscription_expires_at,
           updated_at = NOW()
         RETURNING id, email, full_name`,
        [username, email, passwordHash, name, plan.id, expiresAt, createdAt]
      );
      createdUsers.push({ ...rows[0], plan, company, createdAt });
      process.stdout.write('.');
    }
    console.log(`\n✅ Đã tạo/cập nhật ${createdUsers.length} user_admin`);

    // 4. Tạo đơn hàng (1-3 đơn / user, rải qua 6 tháng)
    console.log('\n💳 Tạo đơn hàng...');
    let orderCount = 0;

    for (const user of createdUsers) {
      const numOrders = randomInt(1, 3);
      for (let o = 0; o < numOrders; o++) {
        const orderCode = Date.now() + Math.floor(Math.random() * 1000000);
        const status = randomItem(ORDER_STATUSES);
        const orderDaysAgo = randomInt(0, 180);
        const orderDate = daysAgo(orderDaysAgo);

        await client.query(
          `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT DO NOTHING`,
          [orderCode, user.plan.id, user.plan.price, user.email, user.id, status, orderDate]
        );
        orderCount++;

        // Nhỏ delay tránh orderCode trùng
        await new Promise(r => setTimeout(r, 1));
      }
      process.stdout.write('.');
    }
    console.log(`\n✅ Đã tạo ${orderCount} đơn hàng`);

    // 5. Tạo campaigns (2-5 chiến dịch / user)
    console.log('\n📢 Tạo chiến dịch...');
    let campaignCount = 0;

    for (const user of createdUsers) {
      const numCampaigns = randomInt(2, 5);
      for (let c = 0; c < numCampaigns; c++) {
        const name = randomItem(CAMPAIGN_NAMES);
        const type = randomItem(CAMPAIGN_TYPES);
        const status = randomItem(CAMPAIGN_STATUSES);
        const createdDaysAgo = randomInt(0, 150);
        const createdAt = daysAgo(createdDaysAgo);

        await client.query(
          `INSERT INTO campaigns
             (id_user, campaign_name, description, campaign_type, status,
              timezone, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,'Asia/Ho_Chi_Minh',$6,$6)`,
          [
            user.id,
            `${name} — ${user.company}`,
            `Chiến dịch ${type} cho ${user.company}`,
            type,
            status,
            createdAt,
          ]
        );
        campaignCount++;
      }
      process.stdout.write('.');
    }
    console.log(`\n✅ Đã tạo ${campaignCount} chiến dịch`);

    // 6. Tạo employee cho 5 user đầu tiên (2 employee mỗi owner)
    console.log('\n👔 Tạo nhân viên (employee)...');
    let empCount = 0;

    for (let i = 0; i < 5; i++) {
      const owner = createdUsers[i];
      for (let e = 0; e < 2; e++) {
        const empIndex = i * 2 + e;
        const empEmail = `employee${empIndex + 1}@uknow-test.com`;
        const empUsername = `employee${empIndex + 1}`;
        const empName = `Nhân viên ${empIndex + 1}`;

        const { rows: empRows } = await client.query(
          `INSERT INTO users
             (username, email, password_hash, full_name, role, status,
              is_verified, verified_at, created_at, updated_at)
           VALUES ($1,$2,$3,$4,'employee','active',true,NOW(),NOW(),NOW())
           ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
           RETURNING id`,
          [empUsername, empEmail, passwordHash, empName]
        );
        const empId = empRows[0].id;

        await client.query(
          `INSERT INTO user_members (employee_id, owner_id)
           VALUES ($1,$2)
           ON CONFLICT DO NOTHING`,
          [empId, owner.id]
        );
        empCount++;
        process.stdout.write('.');
      }
    }
    console.log(`\n✅ Đã tạo ${empCount} nhân viên`);

    await client.query('COMMIT');

    // 7. Tóm tắt
    console.log('\n' + '═'.repeat(50));
    console.log('🎉 SEED HOÀN TẤT!');
    console.log('═'.repeat(50));
    console.log(`📧 Mật khẩu tất cả test accounts: ${TEST_PASSWORD}`);
    console.log('\n📋 Tài khoản test (user_admin):');
    createdUsers.slice(0, 5).forEach(u => {
      console.log(`  • ${u.email}  (${u.plan.name})`);
    });
    console.log('  ... (xem thêm: testuser6@uknow-test.com → testuser20@uknow-test.com)');
    console.log('\n📋 Tài khoản test (employee):');
    console.log('  • employee1@uknow-test.com → employee10@uknow-test.com');
    console.log('\n⚠️  Lưu ý: Đây là dữ liệu test, xóa trước khi deploy production!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Lỗi:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
