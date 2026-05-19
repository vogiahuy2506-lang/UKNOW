/**
 * Seed test data cho bob@multi.test
 * Thêm: business profile, email templates, customers
 *
 * Chạy: cd backend && node scripts/seedBobTestData.js
 * Idempotent — chạy lại nhiều lần không tạo trùng.
 */

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

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Lấy user ID của bob ─────────────────────────────────────────────
    const { rows: users } = await client.query(
      `SELECT id FROM users WHERE email = 'bob@multi.test' LIMIT 1`
    );
    if (!users.length) {
      console.error('❌ Không tìm thấy bob@multi.test. Chạy seedMultiContext.js trước.');
      process.exit(1);
    }
    const bobId = users[0].id;
    console.log(`✓ Tìm thấy bob@multi.test (id=${bobId})`);

    // ── 2. Business Profile ────────────────────────────────────────────────
    const products = JSON.stringify([
      {
        name: 'Khóa học Lập trình Python Cơ bản → Nâng cao',
        price: '2.900.000đ',
        description: 'Học online, 60 buổi video, mentor 1-1 mỗi tuần, học suốt đời',
        usp: 'Cam kết có việc trong 6 tháng hoặc hoàn tiền 100%',
      },
      {
        name: 'Khóa học Web Developer Full-stack',
        price: '5.900.000đ',
        description: 'ReactJS + Node.js + PostgreSQL, dự án thực tế, certificate sau tốt nghiệp',
        usp: 'Được kết nối với 50+ doanh nghiệp tuyển dụng đối tác',
      },
      {
        name: 'Mentorship 1-1 Định hướng nghề nghiệp IT',
        price: '1.200.000đ / tháng',
        description: '4 buổi/tháng với senior engineer, hỗ trợ CV và phỏng vấn',
        usp: 'Mentor từng làm tại Google, VNG, Tiki',
      },
    ]);

    const targetAudience = JSON.stringify([
      {
        name: 'Sinh viên IT sắp ra trường',
        description: 'Năm 3-4 đại học ngành CNTT, chưa có kinh nghiệm thực tế',
        painPoint: 'Sợ ra trường không tìm được việc, không biết học gì thêm',
      },
      {
        name: 'Người chuyển ngành sang IT',
        description: 'Đang làm ngành khác (kế toán, kinh doanh...), muốn chuyển sang lập trình',
        painPoint: 'Không biết bắt đầu từ đâu, lo lắng tuổi tác (25-35), thiếu thời gian',
      },
      {
        name: 'Lập trình viên junior muốn lên mid',
        description: '1-2 năm kinh nghiệm, muốn tăng lương và level up kỹ năng',
        painPoint: 'Code được nhưng thiếu kiến thức nền, khó pass phỏng vấn công ty lớn',
      },
    ]);

    await client.query(`
      INSERT INTO business_profiles (user_id, company_name, industry, products, target_audience, tone, brand_color, extra_context)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id) DO UPDATE SET
        company_name    = EXCLUDED.company_name,
        industry        = EXCLUDED.industry,
        products        = EXCLUDED.products,
        target_audience = EXCLUDED.target_audience,
        tone            = EXCLUDED.tone,
        brand_color     = EXCLUDED.brand_color,
        extra_context   = EXCLUDED.extra_context,
        updated_at      = NOW()
    `, [
      bobId,
      'CodePath Academy',
      'Giáo dục — Đào tạo lập trình online',
      products,
      targetAudience,
      'friendly',
      '#FF6B35',
      'Đã đào tạo hơn 8.000 học viên từ 2019. Tỉ lệ có việc làm sau khoá học: 92%. Hoàn tiền 100% trong 7 ngày nếu không hài lòng. Cộng đồng học viên Discord 10.000+ thành viên.',
    ]);
    console.log('✓ Business profile đã tạo/cập nhật');

    // ── 3. Email Templates ─────────────────────────────────────────────────
    const templates = [
      {
        name: 'Chào mừng học viên mới',
        code: 'WELCOME_STUDENT',
        subject: 'Chào mừng bạn đến với CodePath Academy 🎉',
        category: 'welcome',
        body_html: `<div style="font-family:sans-serif;max-width:600px;margin:auto">
  <h2 style="color:#FF6B35">Chào {{full_name}}! 👋</h2>
  <p>Cảm ơn bạn đã tin tưởng CodePath Academy. Chúng tôi rất vui vì bạn đã gia nhập cộng đồng 8.000+ học viên của chúng tôi!</p>
  <h3>Bước tiếp theo:</h3>
  <ul>
    <li>✅ Truy cập khoá học tại: <a href="https://codepath.vn/dashboard">codepath.vn/dashboard</a></li>
    <li>📱 Tham gia Discord: <a href="https://discord.gg/codepath">discord.gg/codepath</a></li>
    <li>📅 Đặt lịch mentor 1-1 đầu tiên (miễn phí)</li>
  </ul>
  <p>Chúc bạn học vui và sớm có việc làm mơ ước! 🚀</p>
  <p style="color:#999;font-size:12px">CodePath Academy — Học lập trình, đổi nghề thành công</p>
</div>`,
      },
      {
        name: 'Ưu đãi khoá học giảm 30%',
        code: 'PROMO_30',
        subject: '🔥 Chỉ còn 48h — Giảm 30% khoá Python cho {{full_name}}',
        category: 'promotion',
        body_html: `<div style="font-family:sans-serif;max-width:600px;margin:auto">
  <div style="background:#FF6B35;padding:20px;border-radius:8px;text-align:center">
    <h1 style="color:white;margin:0">GIẢM 30%</h1>
    <p style="color:white;margin:8px 0 0">Khoá Python Cơ bản → Nâng cao</p>
  </div>
  <p>Xin chào <strong>{{full_name}}</strong>,</p>
  <p>Chúng tôi biết bạn đang muốn bắt đầu học lập trình. Đây là cơ hội tốt nhất trong năm:</p>
  <ul>
    <li>💰 Giá gốc: <s>2.900.000đ</s> → <strong style="color:#FF6B35">chỉ 2.030.000đ</strong></li>
    <li>⏰ Ưu đãi hết hạn: 48 giờ nữa</li>
    <li>🎁 Tặng kèm: 1 buổi mentor 1-1 (trị giá 300.000đ)</li>
  </ul>
  <div style="text-align:center;margin:24px 0">
    <a href="https://codepath.vn/enroll?promo=FLASH30" style="background:#FF6B35;color:white;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold">
      Đăng ký ngay →
    </a>
  </div>
  <p style="color:#999;font-size:12px">Để huỷ nhận email, <a href="{{unsubscribe_url}}">nhấn vào đây</a></p>
</div>`,
      },
      {
        name: 'Nhắc nhở hoàn thành khoá học',
        code: 'COURSE_REMINDER',
        subject: '{{full_name}} ơi, bạn đã học đến đâu rồi? 📚',
        category: 'retention',
        body_html: `<div style="font-family:sans-serif;max-width:600px;margin:auto">
  <h2>Chào {{full_name}},</h2>
  <p>Bạn đã tham gia CodePath Academy được một thời gian. Chúng tôi muốn hỏi thăm bạn một chút!</p>
  <p>Học lập trình cần sự kiên trì — và chúng tôi ở đây để hỗ trợ bạn 💪</p>
  <div style="background:#FFF3E0;padding:16px;border-radius:8px;border-left:4px solid #FF6B35">
    <strong>Gợi ý tuần này:</strong>
    <ul style="margin:8px 0 0">
      <li>🎯 Hoàn thành 2 bài tập còn lại trong module hiện tại</li>
      <li>💬 Đặt câu hỏi trong Discord nếu bị stuck</li>
      <li>📅 Đặt lịch mentor nếu cần hỗ trợ thêm</li>
    </ul>
  </div>
  <p>Mục tiêu của bạn là gì? Reply email này, chúng tôi luôn đọc! 😊</p>
</div>`,
      },
    ];

    let templatesCreated = 0;
    for (const t of templates) {
      const exists = await client.query(
        `SELECT id FROM email_templates WHERE id_user = $1 AND template_code = $2`,
        [bobId, t.code]
      );
      if (!exists.rows.length) {
        await client.query(`
          INSERT INTO email_templates (id_user, template_name, template_code, subject, body_html, category, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, true)
        `, [bobId, t.name, t.code, t.subject, t.body_html, t.category]);
        templatesCreated++;
      }
    }
    console.log(`✓ Email templates: ${templatesCreated} tạo mới, ${templates.length - templatesCreated} đã có sẵn`);

    // ── 4. Customers ───────────────────────────────────────────────────────
    const customers = [
      { email: 'nguyen.van.an@gmail.com',  phone: '0901234561', full_name: 'Nguyễn Văn An',   source: 'landing_page' },
      { email: 'tran.thi.bich@gmail.com',  phone: '0901234562', full_name: 'Trần Thị Bích',   source: 'facebook' },
      { email: 'le.minh.cuong@gmail.com',  phone: '0901234563', full_name: 'Lê Minh Cường',   source: 'landing_page' },
      { email: 'pham.thu.dung@gmail.com',  phone: '0901234564', full_name: 'Phạm Thu Dung',   source: 'zalo' },
      { email: 'hoang.van.em@gmail.com',   phone: '0901234565', full_name: 'Hoàng Văn Em',    source: 'referral' },
      { email: 'vu.thi.phuong@gmail.com',  phone: '0901234566', full_name: 'Vũ Thị Phương',  source: 'landing_page' },
      { email: 'dang.duc.giap@gmail.com',  phone: '0901234567', full_name: 'Đặng Đức Giáp',  source: 'facebook' },
      { email: 'bui.thi.hoa@gmail.com',    phone: '0901234568', full_name: 'Bùi Thị Hoa',    source: 'zalo' },
      { email: 'do.van.inh@gmail.com',     phone: '0901234569', full_name: 'Đỗ Văn Ính',     source: 'referral' },
      { email: 'ngo.thi.khanh@gmail.com',  phone: '0901234570', full_name: 'Ngô Thị Khánh',  source: 'landing_page' },
      { email: 'dinh.van.long@gmail.com',  phone: '0901234571', full_name: 'Đinh Văn Long',   source: 'facebook' },
      { email: 'cao.thi.mai@gmail.com',    phone: '0901234572', full_name: 'Cao Thị Mai',     source: 'zalo' },
    ];

    let custCreated = 0;
    for (const c of customers) {
      const exists = await client.query(
        `SELECT id FROM customers WHERE id_user = $1 AND email = $2`,
        [bobId, c.email]
      );
      if (!exists.rows.length) {
        await client.query(`
          INSERT INTO customers (id_user, email, phone, full_name, customer_source, email_subscribed)
          VALUES ($1, $2, $3, $4, $5, true)
        `, [bobId, c.email, c.phone, c.full_name, c.source]);
        custCreated++;
      }
    }
    console.log(`✓ Customers: ${custCreated} tạo mới, ${customers.length - custCreated} đã có sẵn`);

    await client.query('COMMIT');
    console.log('\n✅ Seed hoàn tất cho bob@multi.test!');
    console.log('   → Business Profile: CodePath Academy (lập trình, 3 sản phẩm, 3 nhóm KH)');
    console.log('   → Email Templates: 3 mẫu (welcome, promo, reminder)');
    console.log(`   → Customers: ${customers.length} khách hàng test`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
