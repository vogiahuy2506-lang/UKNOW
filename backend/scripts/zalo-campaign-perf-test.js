/**
 * zalo-campaign-perf-test.js
 *
 * Kiểm tra thực tế khả năng gửi Zalo cá nhân của campaign:
 *   1. Đếm khách hàng theo loại dữ liệu Zalo có sẵn trong DB
 *   2. Tính thông lượng lý thuyết dựa trên cấu hình rate limit + quiet hours
 *   3. Phát hiện bottleneck (phone rỗng, unreachable tích lũy, cooldown)
 *   4. Mô phỏng N tin gửi để đo tốc độ thực tế (dry-run, không gọi API Zalo)
 *
 * Chạy:
 *   node scripts/zalo-campaign-perf-test.js [--dry-run=<N>] [--user-id=<id>]
 *
 * Ví dụ:
 *   node scripts/zalo-campaign-perf-test.js
 *   node scripts/zalo-campaign-perf-test.js --dry-run=50 --user-id=1
 */

import 'dotenv/config';
import db from '../src/config/database.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const parseArg = (name) => {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=').slice(1).join('=') : null;
};

const parsePositiveInt = (value, defaultValue) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
};

const fmt = (n) => Number(n).toLocaleString('vi-VN');

const sep = (char = '─', len = 60) => console.log(char.repeat(len));

// ── Config từ env (giống campaignRun.service.js) ─────────────────────────────

const CONFIG = {
  perHourLimit: parsePositiveInt(
    process.env.ZALO_OUTBOUND_PER_HOUR_LIMIT_DEFAULT,
    100
  ),
  windowMs: parsePositiveInt(process.env.ZALO_OUTBOUND_RATE_WINDOW_MS, 3_600_000),
  interMsgMinMs: parsePositiveInt(
    process.env.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT,
    20_000
  ),
  interMsgMaxMs: parsePositiveInt(
    process.env.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT,
    50_000
  ),
  quietStart: (() => {
    const v = Number.parseInt(process.env.ZALO_OUTBOUND_QUIET_HOURS_START, 10);
    return Number.isFinite(v) ? v : 23;
  })(),
  quietEnd: (() => {
    const v = Number.parseInt(process.env.ZALO_OUTBOUND_QUIET_HOURS_END, 10);
    return Number.isFinite(v) ? v : 6;
  })(),
  phoneLookupCooldownMs: parsePositiveInt(
    process.env.ZALO_PERSONAL_PHONE_LOOKUP_COOLDOWN_MS,
    3 * 3_600_000
  ),
  perHourLimitPersonal: parsePositiveInt(
    process.env.ZALO_PERSONAL_PER_HOUR_LIMIT,
    0
  ),
  interMsgMinMsPersonal: parsePositiveInt(
    process.env.ZALO_PERSONAL_INTER_MESSAGE_MIN_MS,
    0
  ),
  interMsgMaxMsPersonal: parsePositiveInt(
    process.env.ZALO_PERSONAL_INTER_MESSAGE_MAX_MS,
    0
  ),
};

// Chế độ kênh personal có thể override default
const effectivePerHour = CONFIG.perHourLimitPersonal || CONFIG.perHourLimit;
const effectiveMinMs = CONFIG.interMsgMinMsPersonal || CONFIG.interMsgMinMs;
const effectiveMaxMs = CONFIG.interMsgMaxMsPersonal || CONFIG.interMsgMaxMs;
const effectiveAvgMs = Math.round((effectiveMinMs + effectiveMaxMs) / 2);

// ── Tính active hours/day ─────────────────────────────────────────────────────

const calcActiveHoursPerDay = (start, end) => {
  // start/end là giờ theo giờ Việt Nam (0-23)
  const quietHours = start >= end ? start - end : 24 - end + start;
  return 24 - quietHours;
};

const activeHours = calcActiveHoursPerDay(CONFIG.quietStart, CONFIG.quietEnd);

// ── Thông lượng lý thuyết ─────────────────────────────────────────────────────

// Số tin tối đa theo rate-limit window
const maxByRateLimit = effectivePerHour * activeHours;

// Số tin tối đa theo delay (3600s / avg delay/window * activeHours)
const msPerHour = 3_600_000;
const maxByDelay = effectiveAvgMs > 0
  ? Math.floor(msPerHour / effectiveAvgMs) * activeHours
  : Infinity;

const theoreticalMax = Math.min(maxByRateLimit, maxByDelay);

// ── Section 1: Thống kê DB ───────────────────────────────────────────────────

async function queryCustomerStats(userId) {
  const userFilter = userId ? 'WHERE id_user = $1' : '';
  const params = userId ? [userId] : [];

  const [total, withPhone, withZaloPhone, withZaloId, withAnyZalo, unreachable] =
    await Promise.all([
      db.query(
        `SELECT COUNT(*) AS n FROM customers ${userFilter}`,
        params
      ),
      db.query(
        `SELECT COUNT(*) AS n FROM customers ${userFilter}
         ${userId ? 'AND' : 'WHERE'} phone IS NOT NULL AND phone <> ''`,
        params
      ),
      db.query(
        `SELECT COUNT(*) AS n FROM customers ${userFilter}
         ${userId ? 'AND' : 'WHERE'} zalo_phone IS NOT NULL AND zalo_phone <> ''`,
        params
      ),
      db.query(
        `SELECT COUNT(*) AS n FROM customers ${userFilter}
         ${userId ? 'AND' : 'WHERE'} zalo_id IS NOT NULL AND zalo_id <> ''`,
        params
      ),
      db.query(
        `SELECT COUNT(*) AS n FROM customers ${userFilter}
         ${userId ? 'AND' : 'WHERE'}
           (phone IS NOT NULL AND phone <> '')
           OR (zalo_phone IS NOT NULL AND zalo_phone <> '')
           OR (zalo_id IS NOT NULL AND zalo_id <> '')`,
        params
      ),
      // Số điện thoại đã bị mark unreachable
      db.query(
        `SELECT COUNT(*) AS n
         FROM zalo_unreachable_phones
         ${userId ? 'WHERE id_user = $1' : ''}`,
        params
      ).catch(() => ({ rows: [{ n: 'N/A (bảng không tồn tại)' }] })),
    ]);

  return {
    total: Number(total.rows[0].n),
    withPhone: Number(withPhone.rows[0].n),
    withZaloPhone: Number(withZaloPhone.rows[0].n),
    withZaloId: Number(withZaloId.rows[0].n),
    withAnyZalo: Number(withAnyZalo.rows[0].n),
    unreachable: unreachable.rows[0].n,
  };
}

async function queryZaloAccounts(userId) {
  const userFilter = userId ? 'WHERE id_user = $1 AND' : 'WHERE';
  const params = userId ? [userId] : [];
  const result = await db.query(
    `SELECT id, display_name, status, is_active,
            zalo_personal_outbound_per_hour_limit,
            zalo_personal_outbound_delay_min_ms,
            zalo_personal_outbound_delay_max_ms
     FROM zalo_settings
     ${userFilter} status = 'connected'
     ORDER BY is_default DESC, created_at DESC`,
    params
  );
  return result.rows;
}

// ── Section 2: Dry-run simulation ────────────────────────────────────────────

function simulateSending(totalRecipients, options = {}) {
  const {
    perHour = effectivePerHour,
    minDelayMs = effectiveMinMs,
    maxDelayMs = effectiveMaxMs,
    quietStartHour = CONFIG.quietStart,
    quietEndHour = CONFIG.quietEnd,
    phoneLookupCooldownMs = CONFIG.phoneLookupCooldownMs,
    failRate = 0.3,         // tỉ lệ findUser thất bại giả định (30%)
    cooldownTriggerAt = 10, // sau bao nhiêu lỗi liên tiếp thì cooldown
  } = options;

  let nowMs = Date.now();
  let sentCount = 0;
  let failCount = 0;
  let cooldownCount = 0;
  let totalElapsedMs = 0;
  let windowStartMs = nowMs;
  let windowSentCount = 0;
  let consecutiveFails = 0;

  const isInQuietHours = (ms) => {
    const vnHour = new Date(ms + 7 * 3_600_000).getUTCHours();
    return quietStartHour >= quietEndHour
      ? vnHour >= quietStartHour || vnHour < quietEndHour
      : vnHour >= quietStartHour && vnHour < quietEndHour;
  };

  const skipToQuietEnd = (ms) => {
    const shifted = new Date(ms + 7 * 3_600_000);
    const hour = shifted.getUTCHours();
    const addDays = hour >= quietStartHour ? 1 : 0;
    const target = Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() + addDays,
      quietEndHour, 0, 0, 0
    );
    return target - 7 * 3_600_000;
  };

  const startReal = Date.now();

  for (let i = 0; i < totalRecipients; i++) {
    // Quiet hours
    if (isInQuietHours(nowMs)) {
      const resumeMs = skipToQuietEnd(nowMs);
      totalElapsedMs += resumeMs - nowMs;
      nowMs = resumeMs;
      windowStartMs = nowMs;
      windowSentCount = 0;
    }

    // Rate limit window reset
    if (nowMs - windowStartMs >= 3_600_000) {
      windowStartMs = nowMs;
      windowSentCount = 0;
    }

    // Chờ khi đầy quota window
    if (windowSentCount >= perHour) {
      const waitMs = 3_600_000 - (nowMs - windowStartMs);
      totalElapsedMs += waitMs;
      nowMs += waitMs;
      windowStartMs = nowMs;
      windowSentCount = 0;
    }

    // Giả lập findUser fail → cooldown
    const isFail = Math.random() < failRate;
    if (isFail) {
      failCount++;
      consecutiveFails++;
      if (consecutiveFails >= cooldownTriggerAt) {
        cooldownCount++;
        totalElapsedMs += phoneLookupCooldownMs;
        nowMs += phoneLookupCooldownMs;
        windowStartMs = nowMs;
        windowSentCount = 0;
        consecutiveFails = 0;
      }
      // Delay vẫn tính sau mỗi lần thử
      const d = minDelayMs + Math.random() * (maxDelayMs - minDelayMs);
      totalElapsedMs += d;
      nowMs += d;
      continue;
    }

    // Gửi thành công
    consecutiveFails = 0;
    sentCount++;
    windowSentCount++;
    const delay = minDelayMs + Math.random() * (maxDelayMs - minDelayMs);
    totalElapsedMs += delay;
    nowMs += delay;
  }

  const elapsedRealMs = Date.now() - startReal;
  const daysNeeded = totalElapsedMs / (24 * 3_600_000);
  const perDayEffective = daysNeeded > 0 ? Math.round(sentCount / daysNeeded) : sentCount;

  return {
    totalRecipients,
    sentCount,
    failCount,
    cooldownCount,
    totalSimulatedHours: Math.round(totalElapsedMs / 3_600_000),
    daysNeeded: Math.round(daysNeeded * 10) / 10,
    perDayEffective,
    elapsedRealMs,
    failRateUsed: failRate,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const userIdArg = parseArg('user-id');
  const userId = userIdArg ? parseInt(userIdArg, 10) : null;
  const dryRunArg = parseArg('dry-run');
  const dryRunCount = dryRunArg ? Math.max(1, parseInt(dryRunArg, 10)) : null;

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         ZALO CAMPAIGN PERFORMANCE TEST                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // ── Cấu hình hiện tại ──
  sep();
  console.log('  CẤU HÌNH RATE LIMIT (từ env / default)');
  sep();
  console.log(`  Kênh Zalo cá nhân`);
  console.log(`  ├─ Giới hạn mỗi giờ   : ${fmt(effectivePerHour)} tin/giờ`
    + (CONFIG.perHourLimitPersonal ? '  ← ZALO_PERSONAL_PER_HOUR_LIMIT' : '  ← ZALO_OUTBOUND_PER_HOUR_LIMIT_DEFAULT'));
  console.log(`  ├─ Delay giữa tin      : ${fmt(effectiveMinMs)}–${fmt(effectiveMaxMs)} ms`
    + `  (avg ${fmt(effectiveAvgMs)} ms = ${(effectiveAvgMs / 1000).toFixed(1)}s)`);
  console.log(`  ├─ Quiet hours (VN)    : ${CONFIG.quietStart}:00–${CONFIG.quietEnd}:00`);
  console.log(`  ├─ Giờ hoạt động/ngày : ${activeHours}h`);
  console.log(`  └─ Cooldown tra số     : ${CONFIG.phoneLookupCooldownMs / 3_600_000}h khi Zalo rate-limit findUser`);

  // ── Thông lượng lý thuyết ──
  sep();
  console.log('  THÔNG LƯỢNG LÝ THUYẾT (không tính lỗi)');
  sep();
  console.log(`  Theo rate-limit : ${fmt(maxByRateLimit)} tin/ngày`
    + `  (${fmt(effectivePerHour)}/h × ${activeHours}h)`);
  if (effectiveAvgMs > 0) {
    console.log(`  Theo delay      : ${fmt(maxByDelay)} tin/ngày`
      + `  (${fmt(Math.floor(msPerHour / effectiveAvgMs))}/h × ${activeHours}h)`);
  }
  console.log(`  Bottleneck thực : ${fmt(theoreticalMax)} tin/ngày`);

  const bottleneck = maxByRateLimit < maxByDelay ? 'rate-limit' : 'inter-message delay';
  console.log(`  Nguyên nhân     : bị giới hạn bởi ${bottleneck}`);

  if (effectiveAvgMs > 0 && maxByDelay < maxByRateLimit) {
    const neededLimit = Math.floor(msPerHour / effectiveAvgMs);
    console.log(`  → Gợi ý: tăng ZALO_OUTBOUND_PER_HOUR_LIMIT_DEFAULT lên ≥ ${neededLimit}`
      + ` hoặc giảm delay để đạt ${fmt(maxByDelay)} tin/ngày`);
  }

  // ── Thống kê DB ──
  sep();
  console.log(`  THỐNG KÊ KHÁCH HÀNG TRONG DB${userId ? ` (user ${userId})` : ' (toàn hệ thống)'}`);
  sep();

  let stats;
  let accounts;
  try {
    [stats, accounts] = await Promise.all([
      queryCustomerStats(userId),
      queryZaloAccounts(userId),
    ]);
  } catch (err) {
    console.error('  ✗ Không kết nối được DB:', err.message);
    process.exit(1);
  }

  const phoneOnlyCoverage = stats.total > 0
    ? ((stats.withPhone / stats.total) * 100).toFixed(1)
    : '0.0';
  const anyZaloCoverage = stats.total > 0
    ? ((stats.withAnyZalo / stats.total) * 100).toFixed(1)
    : '0.0';

  console.log(`  Tổng khách hàng              : ${fmt(stats.total)}`);
  console.log(`  Có trường phone              : ${fmt(stats.withPhone)}  (${phoneOnlyCoverage}%)`);
  console.log(`  Có trường zalo_phone         : ${fmt(stats.withZaloPhone)}`);
  console.log(`  Có trường zalo_id            : ${fmt(stats.withZaloId)}`);
  console.log(`  Có ÍT NHẤT 1 trường Zalo    : ${fmt(stats.withAnyZalo)}  (${anyZaloCoverage}%)`);
  console.log(`  Đã bị mark unreachable       : ${typeof stats.unreachable === 'number' ? fmt(stats.unreachable) : stats.unreachable}`);

  // Ước lượng hiệu quả sau fix
  const reachableBefore = stats.withPhone;
  const reachableAfterFix = stats.withAnyZalo;
  const gained = reachableAfterFix - reachableBefore;
  if (gained > 0) {
    console.log(`\n  ► Sau fix fallback phone→zalo_phone:`);
    console.log(`    +${fmt(gained)} khách được bao phủ thêm`
      + `  (${((gained / stats.total) * 100).toFixed(1)}% tổng)`);
  } else {
    console.log(`\n  ► Fallback không thêm được khách nào: zalo_phone trùng hoặc rỗng.`);
  }

  // Ước lượng thực tế có thể gửi
  const effectiveReachable = typeof stats.unreachable === 'number'
    ? Math.max(0, reachableAfterFix - stats.unreachable)
    : reachableAfterFix;
  const daysToFinish = effectiveReachable > 0 && theoreticalMax > 0
    ? Math.ceil(effectiveReachable / theoreticalMax)
    : '∞';
  console.log(`\n  Ước lượng với tỉ lệ thành công 100%:`);
  console.log(`    ${fmt(effectiveReachable)} khách × ${fmt(1)} lần = cần ~${daysToFinish} ngày`);

  // ── Tài khoản Zalo ──
  if (accounts.length > 0) {
    sep();
    console.log('  TÀI KHOẢN ZALO ĐÃ KẾT NỐI');
    sep();
    accounts.forEach((acc) => {
      const accLimit = acc.zalo_personal_outbound_per_hour_limit
        ? `${fmt(acc.zalo_personal_outbound_per_hour_limit)}/h (riêng TK)`
        : `${fmt(effectivePerHour)}/h (chung)`;
      const accMin = acc.zalo_personal_outbound_delay_min_ms || effectiveMinMs;
      const accMax = acc.zalo_personal_outbound_delay_max_ms || effectiveMaxMs;
      console.log(`  [${acc.id}] ${acc.display_name}`);
      console.log(`       Giới hạn: ${accLimit}   Delay: ${accMin / 1000}–${accMax / 1000}s`);
    });
    if (accounts.length > 1) {
      const totalCapacity = accounts.reduce((sum, acc) => {
        const lim = acc.zalo_personal_outbound_per_hour_limit || effectivePerHour;
        return sum + lim;
      }, 0);
      console.log(`\n  Tổng capacity đa TK: ${fmt(totalCapacity * activeHours)} tin/ngày`);
    }
  }

  // ── Bottleneck analysis ──
  sep();
  console.log('  PHÂN TÍCH BOTTLENECK');
  sep();

  const issues = [];

  if (effectiveAvgMs > 0) {
    const maxMsgPerHourByDelay = Math.floor(3_600_000 / effectiveAvgMs);
    if (maxMsgPerHourByDelay < effectivePerHour) {
      issues.push({
        level: 'WARN',
        msg: `Delay trung bình ${effectiveAvgMs / 1000}s/tin giới hạn thực tế xuống`
          + ` ${fmt(maxMsgPerHourByDelay)} tin/giờ (thấp hơn rate-limit ${fmt(effectivePerHour)}/giờ)`,
        fix: `Giảm ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT hoặc tăng ZALO_OUTBOUND_PER_HOUR_LIMIT_DEFAULT`,
      });
    }
  }

  if (Number(phoneOnlyCoverage) < 50) {
    issues.push({
      level: 'ERROR',
      msg: `Chỉ ${phoneOnlyCoverage}% khách có trường phone — phần lớn bị skip trước fix`,
      fix: `Fix fallback phone→zalo_phone đã được áp dụng (xem campaignRun.service.js)`,
    });
  }

  if (typeof stats.unreachable === 'number' && stats.unreachable > stats.withAnyZalo * 0.2) {
    issues.push({
      level: 'WARN',
      msg: `${fmt(stats.unreachable)} số bị mark unreachable (>${((stats.unreachable / stats.withAnyZalo) * 100).toFixed(0)}% của danh sách)`,
      fix: `Xem xét reset zalo_unreachable_phones sau khi cập nhật danh sách khách`,
    });
  }

  if (CONFIG.phoneLookupCooldownMs >= 3 * 3_600_000) {
    issues.push({
      level: 'INFO',
      msg: `Phone lookup cooldown = ${CONFIG.phoneLookupCooldownMs / 3_600_000}h — 1 lần lỗi quota chặn gửi suốt ${CONFIG.phoneLookupCooldownMs / 3_600_000} giờ`,
      fix: `Giảm ZALO_PERSONAL_PHONE_LOOKUP_COOLDOWN_MS (ví dụ: 3600000 = 1h)`,
    });
  }

  if (issues.length === 0) {
    console.log('  ✓ Không phát hiện bottleneck rõ ràng.');
  } else {
    issues.forEach(({ level, msg, fix }) => {
      const icon = level === 'ERROR' ? '✗' : level === 'WARN' ? '⚠' : 'ℹ';
      console.log(`\n  [${level}] ${icon} ${msg}`);
      console.log(`         → ${fix}`);
    });
  }

  // ── Dry-run simulation ──
  if (dryRunCount != null) {
    sep();
    console.log(`  DRY-RUN: Mô phỏng gửi ${fmt(dryRunCount)} tin`);
    sep();

    const FAIL_RATES = [0.1, 0.3, 0.5];
    FAIL_RATES.forEach((failRate) => {
      const result = simulateSending(dryRunCount, {
        perHour: effectivePerHour,
        minDelayMs: effectiveMinMs,
        maxDelayMs: effectiveMaxMs,
        quietStartHour: CONFIG.quietStart,
        quietEndHour: CONFIG.quietEnd,
        phoneLookupCooldownMs: CONFIG.phoneLookupCooldownMs,
        failRate,
        cooldownTriggerAt: 10,
      });
      console.log(`\n  Tỉ lệ lỗi findUser = ${(failRate * 100).toFixed(0)}%:`);
      console.log(`    Gửi thành công : ${fmt(result.sentCount)} / ${fmt(dryRunCount)}`);
      console.log(`    Thất bại       : ${fmt(result.failCount)}`);
      console.log(`    Cooldown xảy ra: ${fmt(result.cooldownCount)} lần`);
      console.log(`    Thời gian sim  : ~${fmt(result.totalSimulatedHours)} giờ`
        + ` (${result.daysNeeded} ngày)`);
      console.log(`    Hiệu quả/ngày  : ~${fmt(result.perDayEffective)} tin`);
    });

    // So sánh trước và sau fix (giả lập thêm zalo_phone)
    if (gained > 0) {
      sep('─', 40);
      console.log('  So sánh trước / sau fix fallback (tỉ lệ lỗi 30%):');
      const before = simulateSending(reachableBefore, { failRate: 0.3 });
      const after = simulateSending(reachableAfterFix, { failRate: 0.3 });
      console.log(`    Trước fix : ${fmt(before.sentCount)} tin gửi được (~${fmt(before.perDayEffective)}/ngày)`);
      console.log(`    Sau fix   : ${fmt(after.sentCount)} tin gửi được (~${fmt(after.perDayEffective)}/ngày)`);
      console.log(`    Tăng thêm : +${fmt(after.sentCount - before.sentCount)} tin`);
    }
  } else {
    console.log('\n  Gợi ý: Chạy với --dry-run=<N> để mô phỏng gửi N tin');
    console.log('  Ví dụ: node scripts/zalo-campaign-perf-test.js --dry-run=1000 --user-id=1');
  }

  sep();
  console.log('');
  await db.pool.end().catch(() => {});
}

main().catch((err) => {
  console.error('\n✗ Lỗi:', err.message);
  process.exit(1);
});
