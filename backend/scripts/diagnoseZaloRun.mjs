/**
 * Chẩn đoán lượt chạy Zalo (CHỈ ĐỌC — không UPDATE/DELETE).
 *
 * Câu hỏi cần trả lời: "phần mềm báo đã gửi N tin" nhưng Zalo thực tế chỉ có M tin.
 * Phân biệt 2 khả năng bằng dữ liệu trong zalo_messages:
 *   - Nếu sent << progressCurrent → phần mềm cộng cả tin lỗi/bỏ qua vào ô "đã gửi".
 *   - Nếu sent ≈ progressCurrent nhưng Zalo không nhận → Zalo im lặng chặn ở tầng không quan sát được
 *     (hệ thống KHÔNG có bước xác nhận giao thật nào — chỉ đọc msgId trả về).
 *
 * Dùng: node scripts/diagnoseZaloRun.mjs [--run=<id>] [--hours=<n>] [--campaign=<id>]
 */
import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;
const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' || process.env.PGSSLMODE === 'require'
    ? { rejectUnauthorized: false }
    : undefined,
});

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  })
);

// effective status = cột `status` trừ 'pending', fallback sang tracking_metadata->>'status'
const EFFECTIVE_STATUS = `COALESCE(NULLIF(zm.status::text, 'pending'), zm.tracking_metadata->>'status')`;

const filters = [];
const params = [];
function addFilter(sql, val) {
  params.push(val);
  filters.push(sql.replace('$?', `$${params.length}`));
}

if (args.run) addFilter('zm.id_run = $?', Number(args.run));
if (args.campaign) addFilter('zm.id_campaign = $?', Number(args.campaign));
if (!args.run && !args.campaign) {
  const hours = Number(args.hours || 30);
  params.push(hours);
  filters.push(`zm.created_at >= NOW() - INTERVAL '${hours} hours'`);
}
const WHERE = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
/** Điều kiện lọc CHỈ áp cho bảng zalo_messages (zm.*), bỏ tiền tố khi dùng trong JOIN. */
const WHERE_ZM = filters.length ? `WHERE ${filters.join(' AND ').replace(/zm\./g, '')}` : '';
/** Bảng campaign_runs dùng cột khác tên → dùng bộ lọc riêng (chỉ id_run / id_campaign). */
const RUN_FILTERS = [];
const runParams = [];
if (args.run) {
  runParams.push(Number(args.run));
  RUN_FILTERS.push(`cr.id = $${runParams.length}`);
}
if (args.campaign) {
  runParams.push(Number(args.campaign));
  RUN_FILTERS.push(`cr.id_campaign = $${runParams.length}`);
}
const WHERE_CR = RUN_FILTERS.length ? `WHERE ${RUN_FILTERS.join(' AND ')}` : '';

// 0. Danh sách lượt chạy Zalo gần nhất — để không phải đoán id
const RECENT_RUNS_SQL = `
  SELECT
    cr.id,
    cr.id_campaign,
    cr.status,
    cr.total_recipients,
    cr.successful_sends,
    cr.failed_sends,
    cr.skipped_sends,
    cr.started_at,
    COUNT(zm.id)::int AS zalo_rows,
    COUNT(zm.id) FILTER (WHERE COALESCE(NULLIF(zm.status::text,'pending'), zm.tracking_metadata->>'status') = 'sent')::int AS sent_rows
  FROM campaign_runs cr
  LEFT JOIN zalo_messages zm ON zm.id_run = cr.id
  WHERE cr.started_at >= NOW() - INTERVAL '30 days'
  GROUP BY cr.id
  ORDER BY cr.id DESC
  LIMIT 15`;

const queries = {
  // 1. Bức tranh tổng thể: bộ đếm trong DB vs bộ đếm mà phần mềm hiển thị
  //    (successful_sends + failed_sends + skipped_sends = "Đã gửi X/Y" trong UI)
  summary: `
    SELECT
      zm.id_run,
      COUNT(*)::int                                            AS total_rows,
      COUNT(*) FILTER (WHERE ${EFFECTIVE_STATUS} = 'sent')::int     AS sent,
      COUNT(*) FILTER (WHERE ${EFFECTIVE_STATUS} = 'failed')::int   AS failed,
      COUNT(*) FILTER (WHERE ${EFFECTIVE_STATUS} = 'partial')::int   AS partial,
      COUNT(*) FILTER (WHERE ${EFFECTIVE_STATUS} = 'abandoned')::int AS abandoned,
      COUNT(*) FILTER (WHERE ${EFFECTIVE_STATUS} IN ('pending','queued'))::int AS not_final
    FROM zalo_messages zm
    ${WHERE}
    GROUP BY zm.id_run
    ORDER BY zm.id_run DESC
    LIMIT 10`,

  // 1b. Đối chiếu trực tiếp: bộ đếm UI (campaign_runs) vs số tin `sent` thật trong zalo_messages
  //     Đây là câu trả lời dứt điểm cho "phần mềm báo đã gửi N nhưng Zalo chỉ có M".
  uiVsReal: `
    SELECT
      cr.id                                                                   AS run,
      cr.status                                                               AS trang_thai,
      cr.total_recipients                                                     AS tong_nguoi_nhan,
      cr.successful_sends                                                     AS ui_thanh_cong,
      cr.failed_sends                                                         AS ui_loi,
      cr.skipped_sends                                                        AS ui_bo_qua,
      (cr.successful_sends + cr.failed_sends + cr.skipped_sends)               AS UI_DA_GUI,
      COUNT(zm.id) FILTER (WHERE COALESCE(NULLIF(zm.status::text,'pending'), zm.tracking_metadata->>'status') = 'sent')::int
                                                                             AS THAT_SU_SENT,
      (cr.successful_sends + cr.failed_sends + cr.skipped_sends)
        - COUNT(zm.id) FILTER (WHERE COALESCE(NULLIF(zm.status::text,'pending'), zm.tracking_metadata->>'status') = 'sent')::int
                                                                             AS CHENH_LECH,
      cr.started_at,
      cr.completed_at
    FROM campaign_runs cr
    LEFT JOIN zalo_messages zm ON zm.id_run = cr.id
    ${WHERE_CR}
    GROUP BY cr.id
    ORDER BY cr.id DESC
    LIMIT 10`,

  // 2. Nguyên nhân lỗi chiếm đa số — đây là thứ quyết định vấn đề là #1 hay #2
  reasons: `
    SELECT
      COALESCE(zm.tracking_metadata->>'errorCategory', '(không phân loại)') AS error_category,
      COALESCE(NULLIF(BTRIM(zm.tracking_metadata->>'errorLabel'), ''),
               NULLIF(BTRIM(zm.tracking_metadata->>'error'), ''), '(trống)') AS error_label,
      COUNT(*)::int AS n
    FROM zalo_messages zm
    ${WHERE ? `${WHERE} AND` : 'WHERE'} ${EFFECTIVE_STATUS} IN ('failed','partial')
    GROUP BY 1, 2
    ORDER BY n DESC
    LIMIT 15`,

  // 3. Silent drop theo tài khoản — đối chiếu với ngưỡng cảnh báo 30% / >=10 lượt
  byAccount: `
    SELECT
      zm.account_id,
      MAX(NULLIF(BTRIM(COALESCE(zm.account_name, '')), '')) AS account_name,
      COUNT(*)::int AS attempts,
      COUNT(*) FILTER (
        WHERE zm.tracking_metadata->>'errorCategory' = 'ZALO_SILENT_DROP'
      )::int AS silent_drops,
      COUNT(*) FILTER (WHERE ${EFFECTIVE_STATUS} = 'sent')::int AS sent,
      ROUND(100.0 * COUNT(*) FILTER (
        WHERE zm.tracking_metadata->>'errorCategory' = 'ZALO_SILENT_DROP'
      ) / NULLIF(COUNT(*), 0), 1) AS silent_drop_pct
    FROM zalo_messages zm
    ${WHERE ? `${WHERE} AND` : 'WHERE'} zm.account_id IS NOT NULL
      AND NOT COALESCE(zm.is_preview, FALSE)
    GROUP BY zm.account_id
    ORDER BY attempts DESC
    LIMIT 15`,

  // 4. Bộ đếm mà UI hiển thị (campaign_runs) để so với số `sent` thật trong zalo_messages
  runProgress: args.run ? {
    sql: `
      SELECT id, status,
             total_recipients, successful_sends, failed_sends, skipped_sends,
             started_at, completed_at, error_message
      FROM campaign_runs
      WHERE id = $1`,
    values: [Number(args.run)],
  } : null,

  // 5. Từng người nhận trong lượt chạy — để đối chiếu THỦ CÔNG với Zalo app
  //    (mở Zalo, xem tin nào thật sự tới → so với cột status ở đây).
  perRecipient: args.run ? {
    sql: `
      SELECT
        zm.id,
        zm.channel,
        COALESCE(zm.recipient_value, zm.group_id, zm.uid, '(trống)') AS nguoi_nhan,
        ${EFFECTIVE_STATUS} AS status,
        COALESCE(zm.tracking_metadata->>'errorCategory', '') AS errorCategory,
        LEFT(COALESCE(zm.tracking_metadata->>'errorLabel', zm.tracking_metadata->>'error', ''), 60) AS loi,
        zm.sent_at AS sent_at
      FROM zalo_messages zm
      WHERE zm.id_run = $1
      ORDER BY zm.id
      LIMIT 300`,
    values: [Number(args.run)],
  } : null,
};

const fmt = (v) => (v === null || v === undefined ? '—' : String(v));

function printTable(title, rows, cols) {
  console.log(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`);
  if (!rows || rows.length === 0) {
    console.log('(không có dòng nào)');
    return;
  }
  const headers = cols.map((c) => c.label);
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => fmt(r[cols[i].key]).length)));
  console.log(headers.map((h, i) => h.padEnd(widths[i])).join('  '));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((r) => console.log(cols.map((c, i) => fmt(r[c.key]).padEnd(widths[i])).join('  ')));
}

await client.connect();
try {
  printTable('0. LƯỢT CHẠY GẦN NHẤT (30 ngày) — dùng id_run để chạy tiếp', (await client.query(RECENT_RUNS_SQL)).rows, [
    { key: 'id', label: 'run' },
    { key: 'id_campaign', label: 'campaign' },
    { key: 'status', label: 'status' },
    { key: 'total_recipients', label: 'total' },
    { key: 'successful_sends', label: 'succ' },
    { key: 'failed_sends', label: 'failed' },
    { key: 'skipped_sends', label: 'skip' },
    { key: 'zalo_rows', label: 'rows' },
    { key: 'sent_rows', label: 'SENT' },
    { key: 'started_at', label: 'started' },
  ]);

  const summary = (await client.query(queries.summary, params)).rows;
  printTable('1. BỨC TRANH TỔNG THỂ (mỗi lượt chạy)', summary, [
    { key: 'id_run', label: 'run' },
    { key: 'total_rows', label: 'rows' },
    { key: 'sent', label: 'SENT' },
    { key: 'failed', label: 'failed' },
    { key: 'partial', label: 'partial' },
    { key: 'abandoned', label: 'abandoned' },
    { key: 'not_final', label: 'chua-final' },
  ]);

  printTable('1b. ĐỐI CHIẾU: bộ đếm UI vs số tin SENT THẬT', (await client.query(queries.uiVsReal, runParams)).rows, [
    { key: 'run', label: 'run' },
    { key: 'trang_thai', label: 'status' },
    { key: 'tong_nguoi_nhan', label: 'total' },
    { key: 'ui_thanh_cong', label: 'ui_succ' },
    { key: 'ui_loi', label: 'ui_fail' },
    { key: 'ui_bo_qua', label: 'ui_skip' },
    { key: 'UI_DA_GUI', label: 'UI_DA_GUI' },
    { key: 'THAT_SU_SENT', label: 'THAT_SU_SENT' },
    { key: 'CHENH_LECH', label: 'CHENH_LECH' },
  ]);

  printTable('2. NGUYÊN NHÂN LỖI (chiếm đa số)', (await client.query(queries.reasons, params)).rows, [
    { key: 'error_category', label: 'errorCategory' },
    { key: 'error_label', label: 'errorLabel' },
    { key: 'n', label: 'so' },
  ]);

  printTable('3. THEO TAI KHOAN ZALO (silent-drop)', (await client.query(queries.byAccount, params)).rows, [
    { key: 'account_id', label: 'account' },
    { key: 'account_name', label: 'ten' },
    { key: 'attempts', label: 'attempts' },
    { key: 'silent_drops', label: 'silent' },
    { key: 'sent', label: 'sent' },
    { key: 'silent_drop_pct', label: '%silent' },
  ]);

  if (queries.runProgress) {
    printTable('4. BỘ ĐẾM campaign_runs (cái UI hiển thị)', (await client.query(queries.runProgress.sql, queries.runProgress.values)).rows, [
      { key: 'id', label: 'run' },
      { key: 'status', label: 'status' },
      { key: 'total_recipients', label: 'total' },
      { key: 'successful_sends', label: 'successful' },
      { key: 'failed_sends', label: 'failed' },
      { key: 'skipped_sends', label: 'skipped' },
      { key: 'started_at', label: 'started' },
      { key: 'error_message', label: 'loi' },
    ]);
  }

  if (queries.perRecipient) {
    printTable('5. TỪNG NGƯỜI NHẬN (đối chiếu tay với Zalo app)', (await client.query(queries.perRecipient.sql, queries.perRecipient.values)).rows, [
      { key: 'id', label: 'id' },
      { key: 'channel', label: 'channel' },
      { key: 'nguoi_nhan', label: 'nguoi_nhan' },
      { key: 'status', label: 'status' },
      { key: 'errorCategory', label: 'errorCategory' },
      { key: 'loi', label: 'loi' },
      { key: 'sent_at', label: 'sent_at' },
    ]);
  }

  console.log('\nCÁCH ĐỌC:');
  console.log('  UI_DA_GUI    = successful + failed + skipped = số "Đã gửi X/Y" mà phần mềm hiển thị.');
  console.log('  THAT_SU_SENT = số tin zalo_messages có status=sent (msgId hợp lệ) = phần mềm TIN là đã gửi.');
  console.log('');
  console.log('  - UI_DA_GUI >> THAT_SU_SENT → vấn đề #1: phần mềm cộng cả tin lỗi/bỏ qua vào ô "đã gửi".');
  console.log('  - UI_DA_GUI ≈ THAT_SU_SENT  → vấn đề #2: Zalo nhận lệnh nhưng chặn ở tầng không quan sát được');
  console.log('    (hệ thống KHÔNG có bước xác nhận giao thật nào, chỉ đọc msgId trả về).');
  console.log('    Xem mục 2 (nguyên nhân lỗi) + mục 3 (silent-drop theo tài khoản).');
} finally {
  await client.end();
}