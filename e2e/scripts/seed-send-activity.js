/**
 * E2E_SEED_ACTIVITY — hoạt động gửi tin THẬT cho bốn màn hình số liệu mới
 * (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30), phục vụ chụp ảnh bài hướng dẫn:
 *
 *   - "Giám sát gửi tin" (/app/delivery-monitor): tin gửi rải trong 24 giờ qua, có KHOẢNG TRỐNG 23:00–06:00,
 *     lượt đang gửi / đang chờ / xong / đã dừng / lỗi, người chưa gửi được kèm lý do;
 *   - "Báo cáo" (/app/reports): 60 ngày gửi email + Zalo, có mở / nhấp, khách để lại thông tin / đã mua;
 *   - khối "Hoạt động nhóm" (trang Nhân viên): mỗi người một dòng chiến dịch, tin, lượt AI;
 *   - "Tổng quan gói" (/app/billing): các đồng hồ Tin nhắn trong kỳ + Lượt AI trong kỳ có số đã dùng thật.
 *
 * Mọi số đếm ở các màn đó đọc từ BẢNG TIN (email_messages / zalo_messages) qua module sendStats — nên seed ghi thẳng vào
 * hai bảng này, KHÔNG ghi customer_journey hay bộ đếm campaign_runs. Cột bắt buộc theo backend/tests/integration/sql/
 * bootstrap.sql (zalo_messages.tracking_token NOT NULL; workspace_owner_id + actor_user_id để tính theo chủ / người làm).
 *
 * Mốc thời gian tính bằng SQL từ NOW() theo giờ VN (cột sent_at là `timestamp` KHÔNG múi giờ chứa giờ VN, như production)
 * nên chạy lúc nào cũng ra khung "24 giờ qua" đúng — nhưng KHÔNG dựng tin trong 23:00–06:00 (giờ yên lặng của Zalo).
 * Số lượng tính theo công thức (không dùng random()) nên nạp lại DB cho ra cùng con số.
 *
 * ⚠ CHỤP ẢNH thì chạy backend với SCHEDULER_ENABLED=false: worker nền quét lượt `running`, mà chiến dịch mẫu không có
 * node nên nó sẽ đánh lượt đang gửi thành `failed` và ảnh mất trạng thái "Đang gửi" / "Đang chờ".
 */

const VN_TZ_SQL = "'Asia/Ho_Chi_Minh'";
const VN_NOW = `(NOW() AT TIME ZONE ${VN_TZ_SQL})`;

/** Chèn số vào câu SQL: chỉ nhận số hữu hạn (các giá trị này do seed tự đặt, không phải đầu vào người dùng). */
function num(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`seed-send-activity: "${value}" không phải số`);
  return number;
}

const daySql = (daysAgo) => `(date_trunc('day', ${VN_NOW}) - make_interval(days => ${num(daysAgo)}))`;

/**
 * Cặp mốc [đầu, cuối] (biểu thức `timestamp` naive giờ VN) của một cửa sổ gửi:
 *   { daysAgo, fromHour, toHour }   giờ đồng hồ của một ngày (0 = hôm nay);
 *   { startAgoMin, endAgoMin }      lùi từ lúc chạy seed (cuối mặc định = 2 phút trước, không chạm tương lai).
 */
function windowBounds(win) {
  if (win.daysAgo != null) {
    return [
      `(${daySql(win.daysAgo)} + make_interval(secs => ${num(win.fromHour) * 3600}))`,
      `(${daySql(win.daysAgo)} + make_interval(secs => ${num(win.toHour) * 3600}))`,
    ];
  }
  return [
    `(${VN_NOW} - make_interval(secs => ${num(win.startAgoMin) * 60}))`,
    `(${VN_NOW} - make_interval(secs => ${num(win.endAgoMin ?? 2) * 60}))`,
  ];
}

/** Biểu thức `timestamptz` (cho cột campaign_runs) từ mốc đầu của một cửa sổ. */
const runTimeSql = (win) => `(${windowBounds(win)[0]} AT TIME ZONE ${VN_TZ_SQL})`;

async function createCampaign(client, { owner, createdBy, name, description, type, status = 'active', totalCustomers = 0 }) {
  const { rows } = await client.query(
    `INSERT INTO campaigns (
       id_user, workspace_owner_id, created_by, campaign_name, description, campaign_type, status,
       total_customers, published_at, start_date, last_run_at, created_at, updated_at
     ) VALUES (
       $1, $1, $2, $3, $4, $5, $6,
       $7, NOW() - INTERVAL '40 days', NOW() - INTERVAL '40 days', NOW() - INTERVAL '1 hour',
       NOW() - INTERVAL '50 days', NOW()
     ) RETURNING id`,
    [owner, createdBy, name, description, type, status, totalCustomers],
  );
  return Number(rows[0].id);
}

/**
 * Tạo một lượt chạy. `defer` = { reason, minutesFromNextHour } dựng mốc "đang chờ tới" (khoá Zalo của run_metadata) =
 * đầu giờ kế tiếp + N phút, luôn ở tương lai; `metadata` là phần còn lại của run_metadata (vd recipientAudit).
 */
async function createRun(client, {
  owner, campaignId, triggeredBy, name, status, start, end = null,
  planned = 0, ok = 0, failed = 0, error = null, metadata = {}, defer = null,
}) {
  const startTz = runTimeSql(start);
  const endTz = end ? runTimeSql(end) : 'NULL';
  const deferSql = defer
    ? `|| jsonb_build_object('zaloDeferredReason', $11::text, 'zaloOutboundDeferredUntil',
         to_jsonb(date_trunc('hour', NOW()) + make_interval(mins => ${num(defer.minutesFromNextHour) + 60})))`
    : '';
  const { rows } = await client.query(
    `INSERT INTO campaign_runs (
       id_campaign, workspace_owner_id, run_name, run_type, status, started_at, completed_at,
       total_recipients, successful_sends, failed_sends, skipped_sends, error_message, run_metadata,
       triggered_by, created_at
     ) VALUES (
       $1, $2, $3, 'manual', $4, ${startTz}, ${endTz},
       $5, $6, $7, 0, $8, $9::jsonb ${deferSql},
       $10, ${startTz}
     ) RETURNING id`,
    [
      campaignId, owner, name, status, planned, ok, failed, error, JSON.stringify(metadata), triggeredBy,
      ...(defer ? [defer.reason] : []),
    ],
  );
  return Number(rows[0].id);
}

/** Dời một lượt chạy CÓ SẴN (chiến dịch mẫu của seedCampaigns) sang mốc gần đây và đặt số cần gửi. */
async function retimeRun(client, runId, { start, end = null, status, planned, ok = 0, failed = 0, error = null, metadata = {} }) {
  const startTz = runTimeSql(start);
  await client.query(
    `UPDATE campaign_runs
        SET started_at = ${startTz}, created_at = ${startTz},
            completed_at = ${end ? runTimeSql(end) : 'NULL'},
            status = $2, total_recipients = $3, successful_sends = $4, failed_sends = $5,
            error_message = $6, run_metadata = $7::jsonb
      WHERE id = $1`,
    [runId, status, planned, ok, failed, error, JSON.stringify(metadata)],
  );
}

/**
 * Chèn `count` email ĐÃ GỬI rải đều trong một cửa sổ (dòng có mốc ở tương lai bị bỏ). Một phần mở / nhấp theo tỉ lệ
 * cố định; `failEvery` = cứ N thư có 1 thư lỗi (người nhận riêng, không gửi lại → tính là "chưa gửi được").
 */
async function insertEmails(client, s) {
  const count = Math.max(0, Math.round(num(s.count)));
  if (count === 0) return;
  const [from, to] = windowBounds(s.window);
  const clickPct = s.clickPct ?? 8;
  const openPct = clickPct + (s.openOnlyPct ?? 28);
  const failEvery = s.failEvery ? num(s.failEvery) : 0;
  const key = s.runId != null ? num(s.runId) : num(s.campaignId) * 1000 + num(s.salt ?? 0);
  await client.query(
    `INSERT INTO email_messages (
       id_campaign, id_run, recipient_email, recipient_name, sender_email, sender_name, from_address,
       subject, email_step, status, open_count, click_count,
       first_opened_at, last_opened_at, first_clicked_at, sent_at, delivered_at,
       error_message, is_preview, created_at, workspace_owner_id, actor_user_id
     )
     SELECT ${num(s.campaignId)}, ${s.runId == null ? 'NULL::bigint' : num(s.runId)},
            'khach' || (${key}::bigint * 100000 + x.n) || '@' || (ARRAY['gmail.com', 'yahoo.com', 'outlook.com'])[1 + x.n % 3],
            'Khách hàng ' || x.n, 'cskh@uknow.vn', 'CSKH UKNOW', 'CSKH UKNOW <cskh@uknow.vn>',
            $1::text, 1, x.st,
            CASE x.st WHEN 'clicked' THEN 2 WHEN 'opened' THEN 1 ELSE 0 END,
            CASE x.st WHEN 'clicked' THEN 1 ELSE 0 END,
            CASE WHEN x.st IN ('clicked', 'opened') THEN LEAST(x.t + make_interval(mins => 4 + x.n % 90), ${VN_NOW}) END,
            CASE WHEN x.st IN ('clicked', 'opened') THEN LEAST(x.t + make_interval(mins => 4 + x.n % 90), ${VN_NOW}) END,
            CASE WHEN x.st = 'clicked' THEN LEAST(x.t + make_interval(mins => 9 + x.n % 90), ${VN_NOW}) END,
            x.t,
            CASE WHEN x.st = 'failed' THEN NULL ELSE x.t + INTERVAL '3 seconds' END,
            CASE WHEN x.st = 'failed' THEN $2::text END,
            FALSE, x.t, ${num(s.owner)}, ${num(s.actor)}
     FROM (
       SELECT n,
              ${from} + (${to} - ${from}) * ((n - 1)::float8 / ${count}) AS t,
              CASE WHEN ${failEvery} > 0 AND n % ${failEvery || 1} = 0 THEN 'failed'
                   WHEN (n * 37 + ${key}) % 100 < ${num(clickPct)} THEN 'clicked'
                   WHEN (n * 37 + ${key}) % 100 < ${num(openPct)} THEN 'opened'
                   ELSE 'delivered' END AS st
       FROM generate_series(1, ${count}) AS n
     ) x
     WHERE x.t <= ${VN_NOW} - INTERVAL '1 minute'`,
    [s.subject, s.failReason ?? '550 5.1.1 Địa chỉ hộp thư không tồn tại'],
  );
}

/**
 * Chèn `count` tin Zalo ĐÃ GỬI (cá nhân hoặc nhóm) rải đều trong một cửa sổ.
 *   failEvery  : cứ N tin có 1 người lỗi cuối cùng (không gửi lại được);
 *   retryEvery : cứ N người có 1 lần lỗi rồi gửi lại được — dòng lỗi + dòng đã gửi cùng đích, KHÔNG tính là chưa gửi được.
 */
async function insertZalo(client, s) {
  const count = Math.max(0, Math.round(num(s.count)));
  if (count === 0) return;
  const [from, to] = windowBounds(s.window);
  const isGroup = s.channel === 'zalo_group';
  const failEvery = s.failEvery ? num(s.failEvery) : 0;
  const retryEvery = s.retryEvery ? num(s.retryEvery) : 0;
  const clickEvery = s.clickEvery ? num(s.clickEvery) : 0;
  const groupCount = num(s.groupCount ?? 8);
  const key = s.runId != null ? num(s.runId) : num(s.campaignId) * 1000 + num(s.salt ?? 0);
  const recipient = isGroup
    ? `'grp_' || ((x.n - 1) % ${groupCount} + 1)`
    : `'09' || lpad(((${key}::bigint * 100003 + x.n * 7919) % 100000000)::text, 8, '0')`;
  const groupMeta = isGroup
    ? `jsonb_build_object('groupName', 'Nhóm Khách VIP ' || ((x.n - 1) % ${groupCount} + 1))`
    : `'{}'::jsonb`;
  const errorText = '($2::text[])[1 + x.n % array_length($2::text[], 1)]';

  // Một nhánh SELECT từ CTE `x`: nhánh chính (đã gửi / lỗi cuối) và nhánh "lần lỗi trước khi gửi lại được" dùng chung khuôn.
  const branch = ({ at, status, where }) => `
     SELECT ${num(s.campaignId)}, ${s.runId == null ? 'NULL::bigint' : num(s.runId)}, '${isGroup ? 'zalo_group' : 'zalo_personal'}',
            ${isGroup ? recipient : 'NULL::varchar'},
            'e2e_' || md5(random()::text || clock_timestamp()::text || x.n::text || '${key}'),
            jsonb_build_object('status', ${status}::text, 'stepIndex', 1)
              || CASE WHEN ${status}::text = 'failed' THEN jsonb_build_object('error', ${errorText}) ELSE '{}'::jsonb END
              || ${groupMeta},
            $3::text,
            CASE WHEN ${status}::text = 'sent' AND ${clickEvery} > 0 AND x.n % ${clickEvery || 1} = 0 THEN 1 ELSE 0 END,
            ${status}::text, ${at}, $1::text,
            '${isGroup ? 'group' : 'phone'}', ${recipient}, FALSE, ${at}, ${at},
            ${num(s.owner)}, ${num(s.actor)}
     FROM x
     WHERE ${where}`;

  const notFuture = `x.t <= ${VN_NOW} - INTERVAL '1 minute'`;
  const retryBranch = retryEvery > 0
    ? `UNION ALL ${branch({ at: "(x.t - INTERVAL '35 minutes')", status: "'failed'", where: `x.n % ${retryEvery} = 0 AND x.st = 'sent' AND ${notFuture}` })}`
    : '';

  await client.query(
    `WITH x AS (
       SELECT n,
              ${from} + (${to} - ${from}) * ((n - 1)::float8 / ${count}) AS t,
              CASE WHEN ${failEvery} > 0 AND n % ${failEvery || 1} = 0 THEN 'failed' ELSE 'sent' END AS st
       FROM generate_series(1, ${count}) AS n
     )
     INSERT INTO zalo_messages (
       id_campaign, id_run, channel, group_id, tracking_token, tracking_metadata, account_name, click_count,
       status, sent_at, message_text, recipient_type, recipient_value, is_preview, created_at, updated_at,
       workspace_owner_id, actor_user_id
     )
     ${branch({ at: 'x.t', status: 'x.st', where: notFuture })}
     ${retryBranch}`,
    [
      s.text ?? 'Chào bạn, UKNOW gửi bạn ưu đãi dành riêng cho khách hàng thân thiết trong tháng này.',
      s.reasons ?? [
        'Số điện thoại chưa đăng ký Zalo hoặc chặn nhận tin từ người lạ',
        'Không tìm thấy tài khoản Zalo với số điện thoại này',
        'Người nhận đã chặn tin nhắn từ tài khoản này',
      ],
      s.accountName ?? 'Zalo Official Account UKNOW',
    ],
  );
}

/** Một người nhận Zalo cụ thể (số + lý do + số lần thử) — dùng cho bảng "Người nhận / Lý do / Số lần / Lần cuối". */
async function insertZaloAttempts(client, s) {
  for (const item of s.items) {
    const attempts = item.attempts ?? 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const agoMin = num(item.lastAgoMin) + (attempts - 1 - attempt) * 25;
      const isFinalSuccess = item.thenSent && attempt === attempts - 1;
      await client.query(
        `INSERT INTO zalo_messages (
           id_campaign, id_run, channel, tracking_token, tracking_metadata, account_name, click_count, status,
           sent_at, message_text, recipient_type, recipient_value, is_preview, created_at, updated_at,
           workspace_owner_id, actor_user_id
         ) VALUES (
           $1, $2, 'zalo_personal', 'e2e_' || md5(random()::text || clock_timestamp()::text || $3::text),
           $4::jsonb, 'Zalo Official Account UKNOW', 0, $5,
           ${VN_NOW} - make_interval(mins => ${agoMin}), $6, 'phone', $3, FALSE,
           ${VN_NOW} - make_interval(mins => ${agoMin}), ${VN_NOW} - make_interval(mins => ${agoMin}), $7, $8
         )`,
        [
          s.campaignId, s.runId, `${item.phone}`,
          JSON.stringify(isFinalSuccess ? { status: 'sent', stepIndex: 1 } : { status: 'failed', stepIndex: 1, error: item.reason }),
          isFinalSuccess ? 'sent' : 'failed',
          'Chào bạn, UKNOW gửi bạn ưu đãi dành riêng cho khách hàng thân thiết trong tháng này.',
          s.owner, s.actor,
        ],
      );
    }
  }
}

/** Một địa chỉ email lỗi cụ thể (không gửi được, không gửi lại). */
async function insertEmailFailures(client, s) {
  for (const item of s.items) {
    await client.query(
      `INSERT INTO email_messages (
         id_campaign, id_run, recipient_email, recipient_name, sender_email, sender_name, from_address, subject,
         email_step, status, sent_at, error_message, is_preview, created_at, workspace_owner_id, actor_user_id
       ) VALUES (
         $1, $2, $3, $4, 'cskh@uknow.vn', 'CSKH UKNOW', 'CSKH UKNOW <cskh@uknow.vn>', $5,
         1, 'failed', ${VN_NOW} - make_interval(mins => ${num(item.agoMin)}), $6, FALSE,
         ${VN_NOW} - make_interval(mins => ${num(item.agoMin)}), $7, $8
       )`,
      [s.campaignId, s.runId, item.email, item.name ?? 'Khách hàng', s.subject, item.reason, s.owner, s.actor],
    );
  }
}

/** Lượt AI đã dùng của một người trong kỳ gói (mỗi lượt 1 dòng delta = 1, như sổ thật), kèm 1 dòng gần đây. */
async function insertAiCredits(client, { owner, actor, count, feature, lastAgoMin }) {
  await client.query(
    `INSERT INTO usage_logs (id_user, actor_user_id, resource_type, delta, period_start, period_end, metadata, created_at)
     SELECT $1::bigint, $2::bigint, 'ai_credit', 1, NOW() - INTERVAL '20 days', NOW() + INTERVAL '10 days',
            jsonb_build_object('feature', $3::text),
            NOW() - make_interval(secs => ((g * 104729) % (19 * 86400)) + 21600)
     FROM generate_series(1, $4::int) AS g`,
    [owner, actor, feature, Math.max(0, count - 1)],
  );
  await client.query(
    `INSERT INTO usage_logs (id_user, actor_user_id, resource_type, delta, period_start, period_end, metadata, created_at)
     VALUES ($1, $2, 'ai_credit', 1, NOW() - INTERVAL '20 days', NOW() + INTERVAL '10 days',
             jsonb_build_object('feature', $3::text), NOW() - make_interval(mins => ${num(lastAgoMin)}))`,
    [owner, actor, feature],
  );
}

/** Đơn của khách theo chiến dịch: 'interested' = để lại thông tin (đang chờ), khác = đã mua (hoàn tất). */
async function insertPurchases(client, { customerIds, campaignId, interested, purchased, offset }) {
  const kinds = [
    ...Array.from({ length: interested }, () => ({ type: 'interested', name: 'Đăng ký tư vấn khoá học', amount: 0 })),
    ...Array.from({ length: purchased }, () => ({ type: 'course', name: 'Khoá Marketing Tự Động Hoá Thực Chiến', amount: 899000 })),
  ];
  for (const [index, kind] of kinds.entries()) {
    const customerId = customerIds[(offset + index) % customerIds.length];
    await client.query(
      `INSERT INTO customer_purchases (
         id_customer, id_campaign, product_name, product_type, amount, currency, payment_method, purchase_date, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, 'VND', 'payos',
         NOW() - make_interval(days => ${(index * 7 + offset) % 27}, hours => ${(index * 5) % 18}),
         NOW() - make_interval(days => ${(index * 7 + offset) % 27}, hours => ${(index * 5) % 18})
       )`,
      [customerId, campaignId, kind.name, kind.type, kind.amount],
    );
  }
}

/** Số email / ngày theo công thức cố định; cuối tuần còn 1/3. `daysAgo` tính từ hôm nay (giờ VN). */
function dailyCount(daysAgo, { base, range, mult }) {
  const vnToday = new Date(Date.now() + 7 * 3600 * 1000);
  const dow = new Date(vnToday.getTime() - daysAgo * 86400000).getUTCDay();
  const raw = base + ((daysAgo * mult) % range);
  return dow === 0 || dow === 6 ? Math.round(raw / 3) : raw;
}

/** Lịch sử theo ngày (KHÔNG gắn lượt chạy: id_run NULL, mỗi dòng là một đích riêng) từ hôm qua lùi `days` ngày. */
async function insertDailyHistory(client, s) {
  for (let daysAgo = 1; daysAgo <= s.days; daysAgo += 1) {
    if (s.everyNthDay && daysAgo % s.everyNthDay !== 0) continue;
    const count = dailyCount(daysAgo, s.formula);
    // Email gửi giờ hành chính; Zalo được gửi từ 06:00 tới trước 23:00 (khung yên lặng là 23:00–06:00).
    const window = s.kind === 'email'
      ? { daysAgo, fromHour: 8, toHour: 21 }
      : { daysAgo, fromHour: 6, toHour: 22.9 };
    if (s.kind === 'email') {
      await insertEmails(client, { ...s, count, window, runId: null, salt: daysAgo });
    } else {
      await insertZalo(client, { ...s, count, window, runId: null, salt: daysAgo });
    }
  }
}

/**
 * @param {import('pg').Client} client
 * @param {{ userId: number|string }} options
 * @returns {Promise<{ campaigns: number, runs: number }>}
 */
export async function seedSendActivity(client, { userId }) {
  const owner = Number(userId);

  const { rows: staffRows } = await client.query(
    `SELECT id, username FROM users WHERE username IN ('nv_marketing', 'nv_cskh', 'nv_intern')`,
  );
  const staff = Object.fromEntries(staffRows.map((row) => [row.username, Number(row.id)]));
  // Không có nhân viên mẫu (chưa bật E2E_SEED_EMPLOYEES) thì mọi việc đều là của chủ — vẫn chạy được.
  const marketing = staff.nv_marketing ?? owner;
  const cskh = staff.nv_cskh ?? owner;
  const intern = staff.nv_intern ?? owner;

  // Kỳ gói: kích hoạt 20 ngày trước (khớp đơn mẫu 26082301 của gói Basic) → kỳ hiện tại còn 10 ngày; hạn gói lệch 1 ngày
  // để plan_activated_at KHÔNG trùng "hạn − 30 ngày" (getBillingCycle coi mốc đó là dấu vết migration 150 và đổi sang đơn).
  await client.query(
    `UPDATE users
        SET plan_activated_at = NOW() - INTERVAL '20 days',
            subscription_expires_at = NOW() + INTERVAL '11 days',
            updated_at = NOW()
      WHERE id = $1 AND active_plan_id IS NOT NULL`,
    [owner],
  );

  // Chiến dịch mẫu CÓ SẴN của seedCampaigns (nếu có): dùng lại để bảng "Lượt chạy gần đây" khớp với phần còn lại của ảnh.
  const { rows: existing } = await client.query(
    `SELECT r.id AS run_id, c.id AS campaign_id, c.campaign_name
       FROM campaign_runs r JOIN campaigns c ON c.id = r.id_campaign
      WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1
      ORDER BY r.id`,
    [owner],
  );
  const existingByName = new Map(existing.map((row) => [row.campaign_name, row]));
  const zaloVip = existingByName.get('Gửi ưu đãi Zalo Khách hàng thân thiết');
  const triAn = existingByName.get('Chương trình Tri ân Khách hàng VIP Quý 3');
  const flashSale = existingByName.get('Thông báo Khuyến mãi Đột xuất Flash Sale');
  const { rows: chamSocRows } = await client.query(
    `SELECT id FROM campaigns WHERE COALESCE(workspace_owner_id, id_user) = $1 AND campaign_name = $2`,
    [owner, 'Chuỗi email chăm sóc khách mới (đang chạy)'],
  );
  const chamSocId = chamSocRows[0] ? Number(chamSocRows[0].id) : null;

  // ── Chiến dịch mới ────────────────────────────────────────────────────────────────────────────────────────────
  const bantin = await createCampaign(client, {
    owner, createdBy: marketing, name: 'Bản tin sản phẩm mới', type: 'email',
    description: 'Bản tin email gửi khách đã đăng ký nhận tin', totalCustomers: 900,
  });
  const sinhNhat = await createCampaign(client, {
    owner, createdBy: marketing, name: 'Ưu đãi sinh nhật khách hàng', type: 'email',
    description: 'Tự động gửi ưu đãi vào tuần sinh nhật của khách', totalCustomers: 0,
  });
  const khaoSat = await createCampaign(client, {
    owner, createdBy: cskh, name: 'Khảo sát sau mua hàng', type: 'email',
    description: 'Hỏi ý kiến khách sau khi nhận hàng', totalCustomers: 400,
  });
  const nhacLich = await createCampaign(client, {
    owner, createdBy: owner, name: 'Nhắc lịch hẹn qua Zalo', type: 'zalo',
    description: 'Nhắc khách lịch hẹn tư vấn trong ngày', totalCustomers: 320,
  });
  const nhomVip = await createCampaign(client, {
    owner, createdBy: marketing, name: 'Thông báo nhóm khách VIP', type: 'zalo_group',
    description: 'Đăng thông báo vào các nhóm khách VIP', totalCustomers: 34,
  });

  // ── Lượt chạy ────────────────────────────────────────────────────────────────────────────────────────────────
  // 1. Đang GỬI, email liên tục — chưa biết chắc số cần gửi (total_recipients = 0) nên cột chỉ hiện số đã gửi.
  const runSinhNhat = await createRun(client, {
    owner, campaignId: sinhNhat, triggeredBy: marketing, name: 'Lượt chạy liên tục',
    status: 'running', start: { daysAgo: 0, fromHour: 6, toHour: 6 }, planned: 0,
  });
  // 2. Đang CHỜ — Zalo chạm trần gửi trong giờ, tự chạy lại sau đầu giờ kế tiếp.
  const runNhacLich = await createRun(client, {
    owner, campaignId: nhacLich, triggeredBy: owner, name: 'Đợt nhắc lịch hôm nay',
    status: 'running', start: { startAgoMin: 300 }, planned: 320, ok: 60,
    defer: { reason: 'rate_limited', minutesFromNextHour: 3 },
    metadata: { recipientAudit: { sourceRows: 335, withRecipient: 326, attempted: 320, skippedNoRecipient: 9, skippedAlreadySent: 6 } },
  });
  // 3. Xong (email, sáng nay) và Xong (nhóm Zalo, chiều nay).
  const runBanTinNay = await createRun(client, {
    owner, campaignId: bantin, triggeredBy: marketing, name: 'Bản tin số hôm nay',
    status: 'completed', start: { daysAgo: 0, fromHour: 9, toHour: 9 }, end: { daysAgo: 0, fromHour: 12.5, toHour: 12.5 },
    planned: 240, ok: 237, failed: 3,
  });
  const runNhomVip = await createRun(client, {
    owner, campaignId: nhomVip, triggeredBy: marketing, name: 'Thông báo khuyến mãi cuối tháng',
    status: 'completed', start: { daysAgo: 0, fromHour: 13.2, toHour: 13.2 }, end: { daysAgo: 0, fromHour: 15.5, toHour: 15.5 },
    planned: 34, ok: 33, failed: 1,
  });
  // 4. Đã DỪNG (hôm qua) — chủ bấm dừng giữa chừng.
  const runKhaoSat = await createRun(client, {
    owner, campaignId: khaoSat, triggeredBy: cskh, name: 'Khảo sát đợt tháng 9',
    status: 'stopped', start: { daysAgo: 1, fromHour: 14, toHour: 14 }, end: { daysAgo: 1, fromHour: 14.1, toHour: 14.1 },
    planned: 400, ok: 152, failed: 2,
  });
  // 5. Các lượt XONG cũ của bản tin.
  const runBanTinTuan1 = await createRun(client, {
    owner, campaignId: bantin, triggeredBy: marketing, name: 'Bản tin số tuần trước',
    status: 'completed', start: { daysAgo: 7, fromHour: 9, toHour: 9 }, end: { daysAgo: 7, fromHour: 9.1, toHour: 9.1 },
    planned: 260, ok: 260,
  });
  const runBanTinTuan2 = await createRun(client, {
    owner, campaignId: bantin, triggeredBy: marketing, name: 'Bản tin số hai tuần trước',
    status: 'completed', start: { daysAgo: 14, fromHour: 9, toHour: 9 }, end: { daysAgo: 14, fromHour: 9.1, toHour: 9.1 },
    planned: 255, ok: 255,
  });

  // Ba lượt của chiến dịch mẫu có sẵn — dời về mốc gần đây và đặt lại số cần gửi.
  let runZaloVip = null;
  if (zaloVip) {
    runZaloVip = Number(zaloVip.run_id);
    await retimeRun(client, runZaloVip, {
      status: 'running', start: { startAgoMin: 700 }, planned: 500, ok: 84, failed: 4,
      metadata: { recipientAudit: { sourceRows: 520, withRecipient: 505, attempted: 500, skippedNoRecipient: 15, skippedAlreadySent: 5 } },
    });
  }
  let runTriAn = null;
  if (triAn) {
    runTriAn = Number(triAn.run_id);
    await retimeRun(client, runTriAn, {
      status: 'completed', start: { daysAgo: 3, fromHour: 10, toHour: 10 }, end: { daysAgo: 3, fromHour: 14.5, toHour: 14.5 },
      planned: 250, ok: 250,
    });
  }
  let runFlash = null;
  if (flashSale) {
    runFlash = Number(flashSale.run_id);
    await retimeRun(client, runFlash, {
      status: 'failed', start: { daysAgo: 1, fromHour: 8, toHour: 8 }, planned: 100, ok: 62, failed: 5,
      error: 'Tài khoản SMTP bị gián đoạn kết nối do vượt ngưỡng gửi hàng loạt (535 Authentication Failed)',
    });
  }

  // ── Tin THEO LƯỢT (hôm nay, hôm qua, các lượt cũ) ─────────────────────────────────────────────────────────────────
  const emailBase = { owner, subject: 'Ưu đãi dành riêng cho bạn' };
  // Bản tin số hôm nay: 240 email trong 6 phút lúc 09:00, 3 thư lỗi (hộp thư đầy / không tồn tại).
  await insertEmails(client, {
    ...emailBase, actor: marketing, campaignId: bantin, runId: runBanTinNay, count: 237,
    window: { daysAgo: 0, fromHour: 9, toHour: 12.5 }, subject: 'Bản tin sản phẩm mới tháng 9',
  });
  await insertEmailFailures(client, {
    owner, actor: marketing, campaignId: bantin, runId: runBanTinNay, subject: 'Bản tin sản phẩm mới tháng 9',
    items: [
      { email: 'khach.hop.thu.day@gmail.com', reason: '552 5.2.2 Hộp thư của người nhận đã đầy', agoMin: 700 },
      { email: 'lien.he@congty-da-dong.vn', reason: '550 5.1.1 Địa chỉ hộp thư không tồn tại', agoMin: 700 },
      { email: 'info@tenmiensai.com', reason: '550 5.4.1 Máy chủ nhận thư không tồn tại', agoMin: 700 },
    ],
  });
  // Ưu đãi sinh nhật (đang chạy liên tục): nhỏ giọt từ 07:00 tới giờ.
  await insertEmails(client, {
    ...emailBase, actor: marketing, campaignId: sinhNhat, runId: runSinhNhat, count: 130,
    window: { daysAgo: 0, fromHour: 6, toHour: 20.5 }, subject: 'Chúc mừng sinh nhật — quà tặng dành riêng cho bạn',
  });
  // Nhắc lịch qua Zalo (đang chờ): 60 tin, tin cuối cách đây 6 phút — đã chạm trần giờ nên chờ.
  await insertZalo(client, {
    owner, actor: owner, campaignId: nhacLich, runId: runNhacLich, channel: 'zalo_personal', count: 60,
    window: { startAgoMin: 300, endAgoMin: 6 }, retryEvery: 20, accountName: 'Zalo Official Account UKNOW',
    text: 'Nhắc bạn: lịch tư vấn của bạn diễn ra vào chiều nay, vui lòng phản hồi để xác nhận.',
  });
  await insertZaloAttempts(client, {
    owner, actor: owner, campaignId: nhacLich, runId: runNhacLich,
    items: [{ phone: '0902300114', reason: 'Số điện thoại chưa đăng ký Zalo hoặc chặn nhận tin từ người lạ', lastAgoMin: 90 }],
  });
  // Nhóm Zalo: 33 tin trong chiều nay, 1 nhóm không gửi được.
  await insertZalo(client, {
    owner, actor: marketing, campaignId: nhomVip, runId: runNhomVip, channel: 'zalo_group', count: 33,
    window: { daysAgo: 0, fromHour: 13.2, toHour: 15.5 }, groupCount: 8,
    text: 'Thông báo: chương trình ưu đãi cuối tháng dành cho thành viên nhóm VIP bắt đầu từ hôm nay.',
  });
  // Khảo sát (đã dừng hôm qua): 152 thư trong 6 phút, 2 địa chỉ lỗi.
  await insertEmails(client, {
    ...emailBase, actor: cskh, campaignId: khaoSat, runId: runKhaoSat, count: 152,
    window: { daysAgo: 1, fromHour: 14, toHour: 14.1 }, subject: 'Bạn thấy đơn hàng vừa rồi thế nào?',
  });
  await insertEmailFailures(client, {
    owner, actor: cskh, campaignId: khaoSat, runId: runKhaoSat, subject: 'Bạn thấy đơn hàng vừa rồi thế nào?',
    items: [
      { email: 'tran.van.k@mail-cu.com', reason: '550 5.1.1 Địa chỉ hộp thư không tồn tại', agoMin: 1900 },
      { email: 'shop.ngung.hoat.dong@gmail.com', reason: '550 5.1.1 Địa chỉ hộp thư không tồn tại', agoMin: 1900 },
    ],
  });
  await insertEmails(client, {
    ...emailBase, actor: marketing, campaignId: bantin, runId: runBanTinTuan1, count: 260,
    window: { daysAgo: 7, fromHour: 9, toHour: 9.1 }, subject: 'Bản tin sản phẩm mới tháng 9',
  });
  await insertEmails(client, {
    ...emailBase, actor: marketing, campaignId: bantin, runId: runBanTinTuan2, count: 255,
    window: { daysAgo: 14, fromHour: 9, toHour: 9.1 }, subject: 'Bản tin sản phẩm mới tháng 9',
  });

  if (runZaloVip) {
    // 84 tin từ ~11 giờ 40 trước tới giờ (~7 tin/giờ); 1 số lỗi rồi gửi lại được (đã trừ) + 4 người chưa gửi được.
    await insertZalo(client, {
      owner, actor: owner, campaignId: Number(zaloVip.campaign_id), runId: runZaloVip, channel: 'zalo_personal', count: 84,
      window: { startAgoMin: 700, endAgoMin: 3 }, accountName: 'Zalo Official Account UKNOW',
      text: 'Chào bạn, UKNOW gửi tặng bạn mã giảm giá 20% khi gia hạn dịch vụ trong tháng này!', clickEvery: 12,
    });
    await insertZaloAttempts(client, {
      owner, actor: owner, campaignId: Number(zaloVip.campaign_id), runId: runZaloVip,
      items: [
        { phone: '0901200101', reason: 'Số điện thoại chưa đăng ký Zalo hoặc chặn nhận tin từ người lạ', attempts: 1, lastAgoMin: 45 },
        { phone: '0901200102', reason: 'Người nhận đã chặn tin nhắn từ tài khoản này', attempts: 3, lastAgoMin: 120 },
        { phone: '0901200103', reason: 'Không tìm thấy tài khoản Zalo với số điện thoại này', attempts: 1, lastAgoMin: 200 },
        { phone: '0901200104', reason: 'Tài khoản Zalo tạm thời không nhận được tin — thử lại sau', attempts: 2, lastAgoMin: 260 },
        // Lỗi lần đầu rồi gửi lại được: KHÔNG nằm trong "Chưa gửi được" (đã trừ lần gửi lại thành công).
        { phone: '0901200105', reason: 'Zalo tạm thời từ chối gửi (giới hạn tần suất)', attempts: 2, lastAgoMin: 300, thenSent: true },
      ],
    });
  }
  if (runTriAn) {
    await insertEmails(client, {
      ...emailBase, actor: owner, campaignId: Number(triAn.campaign_id), runId: runTriAn, count: 130,
      window: { daysAgo: 3, fromHour: 10, toHour: 10.1 }, subject: '[UKNOW] Tri ân khách hàng thân thiết — Ưu đãi đặc biệt Quý 3',
    });
    await insertZalo(client, {
      owner, actor: owner, campaignId: Number(triAn.campaign_id), runId: runTriAn, channel: 'zalo_personal', count: 120,
      window: { daysAgo: 3, fromHour: 10.2, toHour: 14.5 }, text: 'Cảm ơn bạn đã đồng hành cùng UKNOW — quà tri ân Quý 3 đang chờ bạn.',
    });
  }
  if (runFlash) {
    await insertEmails(client, {
      ...emailBase, actor: owner, campaignId: Number(flashSale.campaign_id), runId: runFlash, count: 62,
      window: { daysAgo: 1, fromHour: 8, toHour: 8.1 }, subject: 'Flash Sale 24 giờ — giảm đến 50%',
    });
    await insertEmailFailures(client, {
      owner, actor: owner, campaignId: Number(flashSale.campaign_id), runId: runFlash, subject: 'Flash Sale 24 giờ — giảm đến 50%',
      items: ['a.nguyen', 'b.tran', 'c.le', 'd.pham', 'e.hoang'].map((name) => ({
        email: `${name}@khachhang.vn`, reason: '535 5.7.8 Authentication Failed — thông tin đăng nhập SMTP bị từ chối', agoMin: 1600,
      })),
    });
  }

  // ── Lịch sử theo ngày (60 ngày) cho trang Báo cáo + đồng hồ Tin nhắn trong kỳ ───────────────────────────────────────
  const history = { days: 59, owner };
  await insertDailyHistory(client, {
    ...history, kind: 'email', actor: marketing, campaignId: bantin, subject: 'Bản tin sản phẩm mới',
    formula: { base: 150, range: 140, mult: 53 }, clickPct: 9, openOnlyPct: 30, failEvery: 61,
  });
  await insertDailyHistory(client, {
    ...history, kind: 'email', actor: marketing, campaignId: sinhNhat, subject: 'Chúc mừng sinh nhật',
    formula: { base: 80, range: 90, mult: 31 }, clickPct: 12, openOnlyPct: 34, failEvery: 83,
  });
  await insertDailyHistory(client, {
    ...history, kind: 'email', actor: cskh, campaignId: khaoSat, subject: 'Khảo sát sau mua hàng',
    formula: { base: 40, range: 60, mult: 17 }, clickPct: 6, openOnlyPct: 22, failEvery: 47,
  });
  if (chamSocId) {
    await insertDailyHistory(client, {
      ...history, kind: 'email', actor: owner, campaignId: chamSocId, subject: 'Chăm sóc khách mới',
      formula: { base: 60, range: 50, mult: 29 }, clickPct: 10, openOnlyPct: 30,
    });
  }
  await insertDailyHistory(client, {
    ...history, kind: 'zalo', channel: 'zalo_personal', actor: owner, campaignId: nhacLich,
    formula: { base: 45, range: 60, mult: 23 }, failEvery: 41, clickEvery: 18,
  });
  if (zaloVip) {
    await insertDailyHistory(client, {
      ...history, kind: 'zalo', channel: 'zalo_personal', actor: owner, campaignId: Number(zaloVip.campaign_id),
      formula: { base: 30, range: 50, mult: 19 }, failEvery: 37, clickEvery: 14,
    });
  }
  await insertDailyHistory(client, {
    ...history, kind: 'zalo', channel: 'zalo_group', actor: marketing, campaignId: nhomVip,
    formula: { base: 15, range: 12, mult: 7 }, everyNthDay: 3, groupCount: 8, failEvery: 11,
  });

  // ── Khách phản hồi (đơn) cho thẻ "Để lại thông tin / Đã mua" ───────────────────────────────────────────────────────
  const { rows: customers } = await client.query(
    'SELECT id FROM customers WHERE COALESCE(workspace_owner_id, id_user) = $1 ORDER BY id',
    [owner],
  );
  const customerIds = customers.map((row) => Number(row.id));
  if (customerIds.length > 0) {
    await insertPurchases(client, { customerIds, campaignId: bantin, interested: 14, purchased: 6, offset: 0 });
    await insertPurchases(client, { customerIds, campaignId: sinhNhat, interested: 9, purchased: 5, offset: 3 });
    await insertPurchases(client, { customerIds, campaignId: khaoSat, interested: 4, purchased: 2, offset: 7 });
    await insertPurchases(client, { customerIds, campaignId: nhacLich, interested: 7, purchased: 3, offset: 11 });
    await insertPurchases(client, { customerIds, campaignId: nhomVip, interested: 2, purchased: 1, offset: 15 });
    if (chamSocId) await insertPurchases(client, { customerIds, campaignId: chamSocId, interested: 5, purchased: 3, offset: 19 });
    if (zaloVip) await insertPurchases(client, { customerIds, campaignId: Number(zaloVip.campaign_id), interested: 3, purchased: 2, offset: 21 });
  }

  // ── Lượt AI (hạn mức gói 1.600 / kỳ) + trần của từng nhân viên ──────────────────────────────────────────────────────
  await insertAiCredits(client, { owner, actor: owner, count: 420, feature: 'campaign_assistant', lastAgoMin: 12 });
  await insertAiCredits(client, { owner, actor: marketing, count: 310, feature: 'landing_page_ai', lastAgoMin: 45 });
  await insertAiCredits(client, { owner, actor: cskh, count: 95, feature: 'chatbot_reply', lastAgoMin: 190 });
  await insertAiCredits(client, { owner, actor: intern, count: 12, feature: 'campaign_assistant', lastAgoMin: 1560 });
  for (const [employeeId, limit] of [[marketing, 500], [cskh, 200], [intern, 50]]) {
    if (employeeId === owner) continue;
    await client.query(
      'UPDATE user_members SET period_ai_credit_limit = $3 WHERE owner_id = $1 AND employee_id = $2',
      [owner, employeeId, limit],
    );
  }

  return { campaigns: 5, runs: 7 + [runZaloVip, runTriAn, runFlash].filter(Boolean).length };
}
