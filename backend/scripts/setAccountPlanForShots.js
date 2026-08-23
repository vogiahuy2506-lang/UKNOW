#!/usr/bin/env node
/**
 * Đổi gói của một tài khoản, CÓ ĐƯỜNG LÙI.
 *
 * Sinh ra để chụp ảnh minh hoạ bài hướng dẫn: tài khoản quản trị đang ở gói
 * "Custom admin" nên bảng giá hiện một trạng thái khách hàng không bao giờ gặp.
 * Gán tạm sang gói thường để chụp, chụp xong lùi lại.
 *
 * VÌ SAO KHÔNG DÙNG assignPlan() CỦA ADMIN: hàm đó còn tạo một bản ghi đơn hàng,
 * làm bẩn báo cáo doanh thu bằng một đơn không có thật. Ở đây chỉ đụng đúng các
 * cột trên bảng users mà assignPlanToUser() đụng, không hơn.
 *
 *   node scripts/setAccountPlanForShots.js --email=a@b.com --plan=professional
 *   node scripts/setAccountPlanForShots.js --email=a@b.com --plan=professional --apply
 *   node scripts/setAccountPlanForShots.js --email=a@b.com --restore
 *
 * Không có --apply thì chỉ in ra sẽ đổi gì, không ghi.
 *
 * Trên VPS:
 *   docker exec uknow-campaign-backend node scripts/setAccountPlanForShots.js ...
 *   docker cp uknow-campaign-backend:/tmp/plan-snapshot-<email>.json .   # giữ bản sao lưu
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import db from '../src/config/database.js';

/**
 * Đúng những cột mà assignPlanToUser() ghi đè. Sao lưu thiếu một cột là mất hạn
 * mức đó vĩnh viễn khi lùi lại, nên danh sách này phải bám sát repository:
 * src/repositories/admin/adminPlans.repository.js → assignPlanToUser
 */
const AFFECTED_COLUMNS = [
  'active_plan_id',
  'subscription_expires_at',
  'plan_activated_at',
  'subscription_reminder_count',
  'max_landing_pages',
  'max_campaigns',
  'max_zalo_campaigns',
  'max_zalo_group_campaigns',
  'max_email_campaigns',
  'max_zalo_accounts',
  'max_email_accounts',
  'max_email_templates',
  'max_zalo_templates',
  'messages_per_period',
  'is_fup_enabled',
];

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [key, ...rest] = a.replace(/^--/, '').split('=');
      return [key, rest.length ? rest.join('=') : true];
    }),
);

const email = typeof args.email === 'string' ? args.email.trim().toLowerCase() : null;
const snapshotPath = typeof args.snapshot === 'string'
  ? args.snapshot
  : `/tmp/plan-snapshot-${String(email).replace(/[^a-z0-9]/gi, '_')}.json`;

async function loadUser() {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.username, ${AFFECTED_COLUMNS.map((c) => `u.${c}`).join(', ')},
            p.name AS plan_name, p.is_custom AS plan_is_custom
       FROM users u
       LEFT JOIN plans p ON p.id = u.active_plan_id
      WHERE lower(u.email) = $1`,
    [email],
  );
  if (!rows.length) throw new Error(`không tìm thấy tài khoản có email ${email}`);
  return rows[0];
}

async function findPlan(wanted) {
  const { rows } = await db.query(
    `SELECT id, name, price, duration_days, is_custom, is_active
       FROM plans ORDER BY is_custom, price NULLS FIRST, id`,
  );
  const needle = String(wanted).trim().toLowerCase();
  const hit = rows.find((p) => String(p.id) === needle || p.name.toLowerCase() === needle)
    ?? rows.find((p) => p.name.toLowerCase().includes(needle));
  if (!hit) {
    console.log('Các gói đang có:');
    for (const p of rows) {
      console.log(`  #${p.id}  ${p.name}${p.is_custom ? '  (gói riêng)' : ''}${p.is_active ? '' : '  (đã tắt)'}`);
    }
    throw new Error(`không có gói nào khớp "${wanted}" — chọn theo tên hoặc số hiệu ở trên`);
  }
  return hit;
}

async function restore() {
  let snapshot;
  try {
    snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
  } catch {
    throw new Error(
      `không đọc được bản sao lưu ở ${snapshotPath}.\n`
      + 'Nếu container đã khởi động lại thì file /tmp đã mất — dùng --snapshot=<đường dẫn> trỏ tới bản bạn đã copy ra.',
    );
  }
  if (snapshot.email !== email) {
    throw new Error(`bản sao lưu này là của ${snapshot.email}, không phải ${email}`);
  }

  const assignments = AFFECTED_COLUMNS.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const values = AFFECTED_COLUMNS.map((c) => snapshot.before[c]);
  const { rowCount } = await db.query(
    `UPDATE users SET ${assignments}, updated_at = NOW() WHERE id = $1`,
    [snapshot.userId, ...values],
  );
  if (!rowCount) throw new Error('không có dòng nào được cập nhật — tài khoản còn tồn tại không?');
  console.log(`Đã trả tài khoản ${email} về trạng thái trong bản sao lưu (gói "${snapshot.beforePlanName}").`);
}

async function main() {
  if (!email) throw new Error('thiếu --email=<email tài khoản>');

  if (args.restore) return restore();

  if (!args.plan) throw new Error('thiếu --plan=<tên gói hoặc số hiệu>, hoặc dùng --restore');

  const user = await loadUser();
  const plan = await findPlan(args.plan);

  console.log(`Tài khoản: ${user.email} (#${user.id})`);
  console.log(`Gói hiện tại: ${user.plan_name ?? '(chưa có)'}${user.plan_is_custom ? ' — gói riêng' : ''}`);
  console.log(`Gói sẽ gán:   ${plan.name} (#${plan.id})\n`);

  if (user.plan_is_custom) {
    console.log('LƯU Ý: gói hiện tại là gói RIÊNG. Gán gói thường sẽ ghi đè toàn bộ hạn mức');
    console.log('tuỳ chỉnh, và ngày hết hạn tính lại từ hôm nay. Bản sao lưu bên dưới là');
    console.log('đường lùi duy nhất — giữ lấy nó.\n');
  }

  const before = Object.fromEntries(AFFECTED_COLUMNS.map((c) => [c, user[c]]));
  const snapshot = {
    email: user.email,
    userId: user.id,
    beforePlanName: user.plan_name,
    takenAt: new Date().toISOString(),
    before,
  };

  if (!args.apply) {
    // So trực tiếp hạn mức cũ với hạn mức của gói mới: cột nào TỤT XUỐNG là chỗ
    // có thể làm gián đoạn việc đang chạy (vd đang nối 5 tài khoản Zalo mà gói
    // mới chỉ cho 2).
    const { rows: [target] } = await db.query('SELECT * FROM plans WHERE id = $1', [plan.id]);
    console.log('Cột                          hiện tại  →  sau khi gán');
    for (const column of AFFECTED_COLUMNS) {
      if (!(column in target)) continue;
      const now = before[column];
      const next = target[column];
      const shrinks = Number.isFinite(Number(now)) && Number.isFinite(Number(next))
        && Number(next) < Number(now);
      console.log(`  ${column.padEnd(26)} ${String(now).padStart(8)}  →  ${String(next).padStart(8)}${shrinks ? '   ← tụt xuống' : ''}`);
    }
    console.log(`\nNgày hết hạn hiện tại: ${before.subscription_expires_at} → tính lại từ hôm nay.`);
    console.log('\nMới chỉ xem trước, CHƯA ghi gì. Thêm --apply để thực hiện.');
    return;
  }

  // Ghi sao lưu TRƯỚC khi đổi. Không ghi được thì dừng — đổi mà không có đường
  // lùi là mất hạn mức tuỳ chỉnh vĩnh viễn.
  await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Đã lưu bản sao lưu: ${snapshotPath}`);
  console.log('--- SAO LƯU, GIỮ LẠI ĐOẠN NÀY ---');
  console.log(JSON.stringify(snapshot));
  console.log('--- hết sao lưu ---\n');

  // Đúng phép gán của assignPlanToUser(), chỉ khác là không tạo bản ghi đơn hàng.
  const { rowCount } = await db.query(
    `UPDATE users u
        SET active_plan_id              = p.id,
            subscription_expires_at     = NOW() + (COALESCE(p.duration_days, 30) || ' days')::INTERVAL,
            plan_activated_at           = NOW(),
            subscription_reminder_count = 0,
            max_landing_pages           = p.max_landing_pages,
            max_campaigns               = p.max_campaigns,
            max_zalo_campaigns          = p.max_zalo_campaigns,
            max_zalo_group_campaigns    = p.max_zalo_group_campaigns,
            max_email_campaigns         = p.max_email_campaigns,
            max_zalo_accounts           = p.max_zalo_accounts,
            max_email_accounts          = p.max_email_accounts,
            max_email_templates         = p.max_email_templates,
            max_zalo_templates          = p.max_zalo_templates,
            messages_per_period         = p.messages_per_period,
            is_fup_enabled              = p.is_fup_enabled,
            updated_at                  = NOW()
       FROM plans p
      WHERE p.id = $1 AND u.id = $2`,
    [plan.id, user.id],
  );
  if (!rowCount) throw new Error('không có dòng nào được cập nhật');

  console.log(`Đã gán "${plan.name}" cho ${user.email}.`);
  console.log('Chụp ảnh xong thì lùi lại:');
  console.log(`  node scripts/setAccountPlanForShots.js --email=${user.email} --restore`);
}

main()
  .catch((error) => {
    console.error(`[setAccountPlanForShots] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => { await db.pool.end(); });
