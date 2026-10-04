/**
 * Mô phỏng thuần (không DB, không mạng, không đồng hồ thật) thời gian gửi một chiến dịch
 * (PLAN_UOC_TINH_THOI_GIAN_CHIEN_DICH_2026-10-04, mục 3.1).
 *
 * MÔ HÌNH — bám đúng engine `services/campaign/campaignRun.service.js` (đã đọc 04/10, commit 762a289f):
 *
 * 1. Một lượt chạy một lần duyệt NODE theo thứ tự topo (`for (const node of orderedNodes)`, :3433). Node B
 *    chỉ bắt đầu SAU KHI node A xử lý xong mọi bước ĐẾN HẠN của nó trong lượt này.
 * 2. Trong một node Email / Zalo cá nhân / Zalo nhóm, engine duyệt THEO BƯỚC rồi mới đến người nhận
 *    (`for stepIndex … for recipient`, :4654, :6726, :8733): bước 1 gửi cho MỌI người, rồi bước 2 cho những
 *    người đã ĐẾN HẠN (`shouldProcessRecipientStep` → `nextDueAt`, :2142-2160), v.v. => `order: 'step_major'`.
 *    Node kênh adapter (Telegram/WhatsApp) thì NGƯỢC LẠI: `for recipient { while step }` — một người đi
 *    hết các bước đến hạn rồi mới sang người sau (campaignChannelRunner.service.js:505-520) => `'recipient_major'`.
 * 3. Người nhận có bước chưa đến hạn bị BỎ QUA trong lượt này; cuối lượt, nếu còn người chờ, run được "đỗ" với
 *    `nonContinuousDeferredUntil` = mốc `nextDueAt` sớm nhất (:9122-9133) và scheduler nhặt lại (cron mỗi phút,
 *    scheduler.js:664) => lượt kế tiếp lại duyệt node từ đầu. Mô phỏng: "lượt" (pass) lặp tới khi không còn ai chờ.
 * 4. Hạn bước sau (`computeStepDueAt`, :2087-2104): `sendMode !== 'schedule'` => đến hạn NGAY; `schedule` =>
 *    `delayFrom 'prev'` = lúc người đó xong bước trước + trễ, `'start'` = lúc người đó xong bước 1 + trễ.
 * 5. Nhịp Zalo theo cặp (tài khoản, kênh) — `zaloRateLimiter.enforceOutboundPolicyBeforeSend`:
 *    mỗi lần gửi (trừ lần đầu của trạng thái) NGỦ NGUYÊN một khoảng ngẫu nhiên [min,max] rồi mới gửi; giờ yên
 *    lặng kiểm lại sau mỗi vòng (sau khi chờ tới giờ mở lại KHÔNG ngủ thêm nếu vừa ngủ xong trước đó); trần/giờ
 *    là cửa sổ cố định bắt đầu từ lần thử đầu. Trần/ngày của tài khoản (`checkAccountDailyLimit`) tính theo
 *    ngày giờ VN, dùng CHUNG mọi kênh của cùng tài khoản (`dailyKey`).
 * 6. Nhiều tài khoản trong một node: người nhận ghim cố định vào một tài khoản (i mod n) cho mọi bước và chạy
 *    theo lô song song cỡ n, lô sau chờ lô trước xong (`runTasksWithConcurrency`, :1727).
 *
 * KHÔNG mô hình được (ghi thành cảnh báo ở tầng service, không đoán số): hạn mức tra số theo ngày của Zalo,
 * máy chủ SMTP tự chặn, tài khoản mất kết nối, độ trễ nhả slot/đánh thức run sau giờ yên lặng.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const VN_OFFSET_MS = 7 * HOUR_MS;

/** Mức Zalo/tài khoản/ngày đã được chứng minh an toàn (dữ liệu 24/09) — trên mức này chỉ cảnh báo. */
export const SAFE_DAILY_ZALO_ACTIONS = 150;

/** Trần mô phỏng: quá 400 ngày kể từ lúc bắt đầu thì dừng (tránh vòng lặp vô hạn / danh sách khổng lồ). */
const HORIZON_MS = 400 * DAY_MS;
const MAX_PASSES = 5000;

const SCENARIOS = Object.freeze({
  earliest: { pick: (acc) => acc.minDelayMs, resumeLatencyMs: 0 },
  typical: { pick: (acc) => Math.round((acc.minDelayMs + acc.maxDelayMs) / 2), resumeLatencyMs: 30_000 },
  latest: { pick: (acc) => acc.maxDelayMs, resumeLatencyMs: 60_000 },
});

/** Khoá ngày giờ VN `YYYY-MM-DD` của một mốc epoch ms. */
export const vnDayKey = (ms) => new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10);

/** 00:00 giờ VN kế tiếp (epoch ms) — luôn > ms. */
const nextVnMidnight = (ms) => (Math.floor((ms + VN_OFFSET_MS) / DAY_MS) + 1) * DAY_MS - VN_OFFSET_MS;

const vnHour = (ms) => Math.floor((((ms + VN_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS / HOUR_MS);

/**
 * Nếu `ms` nằm trong giờ yên lặng thì trả mốc mở lại (epoch ms), ngược lại null.
 * Khung vắt nửa đêm khi start > end (cùng luật zaloRateLimiter.computeNextAllowedSendAtByQuietHours).
 */
const quietEndAt = (ms, quiet) => {
  if (!quiet) return null;
  const start = Number(quiet.start);
  const end = Number(quiet.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return null;
  const hour = vnHour(ms);
  const dayStart = Math.floor((ms + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS;
  if (start > end) {
    if (!(hour >= start || hour < end)) return null;
    return dayStart + (hour >= start ? DAY_MS : 0) + end * HOUR_MS;
  }
  if (!(hour >= start && hour < end)) return null;
  return dayStart + end * HOUR_MS;
};

const toMs = (value, fallback) => {
  if (value instanceof Date) return value.getTime();
  const parsed = typeof value === 'number' ? value : Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const int = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isZaloChannel = (channel) => String(channel || '').startsWith('zalo_');

/**
 * Chạy MỘT kịch bản độ trễ (earliest | typical | latest).
 *
 * @returns {{ finishAtMs: number, totalActions: number, aborted: string|null, perNode: Map, perDay: Map,
 *   dailyLimitHits: Map }}
 */
function runScenario({ startAtMs, groups, continuous, scenario }) {
  const { pick, resumeLatencyMs } = SCENARIOS[scenario];

  /** Trạng thái nhịp theo (tài khoản, kênh) — dùng chung giữa các node/lượt, như Map trong zaloRateLimiter. */
  const rateStates = new Map();
  /** Đếm tin trong ngày theo tài khoản gốc (`dailyKey`) và ngày VN; `sentToday` chỉ áp cho ngày bắt đầu. */
  const dailyCounts = new Map();
  const startDayKey = vnDayKey(startAtMs);
  const perNode = new Map();
  const perDay = new Map();
  const dailyLimitHits = new Map();
  let totalActions = 0;
  let finishAtMs = startAtMs;
  let aborted = null;

  const dailyCountOf = (dailyKey, dayKey) => {
    const byDay = dailyCounts.get(dailyKey);
    return byDay?.get(dayKey) || 0;
  };
  const bumpDaily = (dailyKey, dayKey) => {
    let byDay = dailyCounts.get(dailyKey);
    if (!byDay) {
      byDay = new Map();
      dailyCounts.set(dailyKey, byDay);
    }
    byDay.set(dayKey, (byDay.get(dayKey) || 0) + 1);
  };

  // Khởi tạo bộ đếm ngày đầu bằng số đã gửi hôm nay (mọi kênh của tài khoản).
  for (const group of groups) {
    for (const acc of group.accounts) {
      const seeded = dailyCounts.get(acc.dailyKey);
      if (!seeded) {
        dailyCounts.set(acc.dailyKey, new Map([[startDayKey, Math.max(0, int(acc.sentToday, 0))]]));
      }
    }
  }

  const stateOf = (group, acc) => {
    const key = `${acc.key}::${group.channel}`;
    let state = rateStates.get(key);
    if (!state) {
      state = { lastAttemptAt: null, windows: [] };
      rateStates.set(key, state);
    }
    return state;
  };

  const windowsOf = (acc) => {
    const list = [];
    if (acc.perMinuteLimit > 0) list.push({ limit: acc.perMinuteLimit, windowMs: 60_000 });
    if (acc.perHourLimit > 0) list.push({ limit: acc.perHourLimit, windowMs: HOUR_MS });
    return list;
  };

  /**
   * Mô phỏng `enforceOutboundPolicyBeforeSend` + trần ngày: trả mốc gửi thật (epoch ms), cập nhật trạng thái.
   */
  const advanceToSend = (group, acc, fromMs) => {
    const state = stateOf(group, acc);
    const limits = windowsOf(acc);
    let t = fromMs;
    for (let guard = 0; guard < 100_000; guard += 1) {
      // Trần ngày của tài khoản (người dùng tự đặt).
      if (acc.dailyLimit != null) {
        const dayKey = vnDayKey(t);
        if (dailyCountOf(acc.dailyKey, dayKey) >= acc.dailyLimit) {
          dailyLimitHits.set(acc.dailyKey, acc.dailyLimit);
          t = nextVnMidnight(t);
          continue;
        }
      }
      const quietEnd = quietEndAt(t, acc.quietHours);
      if (quietEnd !== null) {
        t = quietEnd;
        continue;
      }
      let blockedUntil = null;
      limits.forEach((limit, idx) => {
        const w = state.windows[idx] || (state.windows[idx] = { start: t, count: 0 });
        if (t - w.start >= limit.windowMs) {
          w.start = t;
          w.count = 0;
        }
        if (w.count >= limit.limit) {
          blockedUntil = Math.max(blockedUntil ?? 0, w.start + limit.windowMs);
        }
      });
      if (blockedUntil !== null) {
        t = blockedUntil;
        continue;
      }
      if (state.lastAttemptAt !== null) {
        t += pick(acc);
        state.lastAttemptAt = null;
        continue;
      }
      state.lastAttemptAt = t;
      limits.forEach((limit, idx) => {
        const w = state.windows[idx] || (state.windows[idx] = { start: t, count: 0 });
        w.count += 1;
      });
      return t;
    }
    aborted = 'loop_guard';
    return t;
  };

  // Trạng thái người nhận theo từng nhóm.
  const books = groups.map((group) => ({
    stepsDone: new Int32Array(group.recipients),
    dueAt: new Float64Array(group.recipients),
    firstSentAt: new Float64Array(group.recipients),
    effectiveSteps: continuous ? 1 : group.steps.length,
    actions: 0,
    lastSendAt: null,
    firstSendAt: null,
  }));
  groups.forEach((group, idx) => {
    perNode.set(group.nodeId, { actions: 0, finishAtMs: null, startAtMs: null, index: idx });
  });

  const nextDueFor = (group, book, i, completedStep, sentAt) => {
    // completedStep = số bước đã xong (1-based) của người i vừa tính xong.
    if (completedStep >= book.effectiveSteps) return Infinity;
    if (group.sendMode !== 'schedule') return sentAt;
    const next = group.steps[completedStep] || {};
    const delay = Math.max(0, int(next.delayMs, 0));
    const base = next.delayFrom === 'prev' ? sentAt : book.firstSentAt[i];
    return base + delay;
  };

  const recordSend = (group, book, acc, sentAt) => {
    totalActions += 1;
    book.actions += 1;
    book.lastSendAt = sentAt;
    if (book.firstSendAt === null) book.firstSendAt = sentAt;
    if (sentAt > finishAtMs) finishAtMs = sentAt;
    const dayKey = vnDayKey(sentAt);
    bumpDaily(acc.dailyKey, dayKey);
    let day = perDay.get(dayKey);
    if (!day) {
      day = { date: dayKey, actions: 0, perAccount: {}, zaloPerAccount: {} };
      perDay.set(dayKey, day);
    }
    day.actions += 1;
    day.perAccount[acc.key] = (day.perAccount[acc.key] || 0) + 1;
    if (isZaloChannel(group.channel)) {
      day.zaloPerAccount[acc.dailyKey] = (day.zaloPerAccount[acc.dailyKey] || 0) + 1;
    }
    if (sentAt - startAtMs > HORIZON_MS) aborted = 'horizon';
  };

  const sendTask = (group, book, i, stepIdx, acc, fromMs) => {
    const sentAt = advanceToSend(group, acc, fromMs);
    book.stepsDone[i] = stepIdx + 1;
    if (book.firstSentAt[i] === 0) book.firstSentAt[i] = sentAt;
    book.dueAt[i] = nextDueFor(group, book, i, stepIdx + 1, sentAt);
    recordSend(group, book, acc, sentAt);
    return sentAt;
  };

  const runStepMajor = (group, book, startClock) => {
    const n = Math.max(1, group.accounts.length);
    let clock = startClock;
    for (let s = 0; s < book.effectiveSteps && !aborted; s += 1) {
      for (let from = 0; from < group.recipients && !aborted; from += n) {
        let batchEnd = clock;
        const batchClock = clock;
        for (let i = from; i < Math.min(group.recipients, from + n); i += 1) {
          if (book.stepsDone[i] !== s || book.dueAt[i] > batchClock) continue;
          const sentAt = sendTask(group, book, i, s, group.accounts[i % n], batchClock);
          if (sentAt > batchEnd) batchEnd = sentAt;
        }
        clock = batchEnd;
      }
    }
    return clock;
  };

  const runRecipientMajor = (group, book, startClock) => {
    const n = Math.max(1, group.accounts.length);
    let clock = startClock;
    for (let i = 0; i < group.recipients && !aborted; i += 1) {
      while (book.stepsDone[i] < book.effectiveSteps && !aborted) {
        const s = book.stepsDone[i];
        if (s > 0 && book.dueAt[i] > clock) break;
        clock = sendTask(group, book, i, s, group.accounts[i % n], clock);
      }
    }
    return clock;
  };

  // Mọi người nhận bắt đầu ở bước 0, đến hạn ngay.
  books.forEach((book) => book.dueAt.fill(startAtMs));
  // Ước tính "còn lại" của lượt đang chạy (PR-5): người xong dở bắt đầu ở bước đã xong, hạn bước kế theo sổ (nếu
  // còn ở tương lai). `firstSentAt` không có trong sổ → lấy startAt (xấp xỉ cho `delayFrom 'start'`).
  groups.forEach((group, idx) => {
    if (!group.initial) return;
    const book = books[idx];
    group.initial.stepsDone.forEach((done, i) => {
      book.stepsDone[i] = done;
      if (done > 0) book.firstSentAt[i] = startAtMs;
      const due = group.initial.dueAtMs[i];
      if (due !== null && due > startAtMs) book.dueAt[i] = due;
    });
  });

  let clock = startAtMs;
  for (let pass = 0; pass < MAX_PASSES && !aborted; pass += 1) {
    const actionsBefore = totalActions;
    groups.forEach((group, idx) => {
      if (aborted) return;
      const book = books[idx];
      const node = perNode.get(group.nodeId);
      clock = group.order === 'recipient_major'
        ? runRecipientMajor(group, book, clock)
        : runStepMajor(group, book, clock);
      node.actions = book.actions;
      node.finishAtMs = book.lastSendAt;
      node.startAtMs = book.firstSendAt;
    });
    let pendingDueAt = Infinity;
    books.forEach((book, idx) => {
      for (let i = 0; i < groups[idx].recipients; i += 1) {
        if (book.stepsDone[i] < book.effectiveSteps && book.dueAt[i] < pendingDueAt) pendingDueAt = book.dueAt[i];
      }
    });
    if (pendingDueAt === Infinity) break;
    if (totalActions === actionsBefore && pendingDueAt <= clock) {
      aborted = 'no_progress';
      break;
    }
    clock = Math.max(clock, pendingDueAt) + resumeLatencyMs;
  }

  return { finishAtMs, totalActions, aborted, perNode, perDay, dailyLimitHits };
}

/**
 * Chuẩn hoá đầu vào nhóm việc (điền mặc định, ép kiểu) — hàm thuần.
 */
const normalizeGroups = (rawGroups) => (Array.isArray(rawGroups) ? rawGroups : []).map((raw, index) => {
  const accountsRaw = Array.isArray(raw?.accounts) && raw.accounts.length > 0
    ? raw.accounts
    : [{ key: `__account_${index}` }];
  const accounts = accountsRaw.map((acc, accIdx) => {
    const minDelayMs = Math.max(0, int(acc?.minDelayMs, 0));
    const maxDelayMs = Math.max(minDelayMs, int(acc?.maxDelayMs, minDelayMs));
    const key = String(acc?.key ?? `__account_${index}_${accIdx}`);
    return {
      key,
      dailyKey: String(acc?.dailyKey ?? key),
      minDelayMs,
      maxDelayMs,
      perHourLimit: int(acc?.perHourLimit, 0),
      perMinuteLimit: int(acc?.perMinuteLimit, 0),
      dailyLimit: acc?.dailyLimit == null ? null : Math.max(0, int(acc.dailyLimit, 0)),
      sentToday: Math.max(0, int(acc?.sentToday, 0)),
      quietHours: acc?.quietHours && Number.isFinite(Number(acc.quietHours.start)) && Number.isFinite(Number(acc.quietHours.end))
        ? { start: Number(acc.quietHours.start), end: Number(acc.quietHours.end) }
        : null,
    };
  });
  const steps = (Array.isArray(raw?.steps) && raw.steps.length > 0 ? raw.steps : [{ delayMs: 0, delayFrom: 'prev' }])
    .map((step) => ({
      delayMs: Math.max(0, int(step?.delayMs, 0)),
      delayFrom: step?.delayFrom === 'start' ? 'start' : 'prev',
    }));
  // `initialProgress` (tuỳ chọn, PR-5 — ước tính phần CÒN LẠI của lượt đang chạy): `{ untouched, partial:[{ stepsDone,
  // dueAtMs, count }] }`. Có thì `recipients` bị thay bằng số người CHƯA xong: `partial` (đã xong `stepsDone` bước, chưa
  // hết) rồi `untouched` (chưa gửi gì). Người đã xong hết bước không có mặt. Bước >= số bước của node (cấu hình đổi) bỏ.
  let initial = null;
  if (raw?.initialProgress && typeof raw.initialProgress === 'object') {
    initial = { stepsDone: [], dueAtMs: [] };
    (Array.isArray(raw.initialProgress.partial) ? raw.initialProgress.partial : []).forEach((entry) => {
      const done = Math.max(0, int(entry?.stepsDone, 0));
      if (done >= steps.length) return;
      const dueRaw = entry?.dueAtMs;
      const due = dueRaw == null || !Number.isFinite(Number(dueRaw)) ? null : Number(dueRaw);
      for (let k = 0; k < Math.max(0, int(entry?.count, 0)); k += 1) {
        initial.stepsDone.push(done);
        initial.dueAtMs.push(due);
      }
    });
    for (let k = 0; k < Math.max(0, int(raw.initialProgress.untouched, 0)); k += 1) {
      initial.stepsDone.push(0);
      initial.dueAtMs.push(null);
    }
  }
  return {
    nodeId: String(raw?.nodeId ?? `node_${index}`),
    label: String(raw?.label ?? raw?.nodeId ?? `node_${index}`),
    channel: String(raw?.channel ?? 'email'),
    order: raw?.order === 'recipient_major' ? 'recipient_major' : 'step_major',
    recipients: initial ? initial.stepsDone.length : Math.max(0, int(raw?.recipients, 0)),
    initial,
    steps,
    sendMode: raw?.sendMode === 'schedule' ? 'schedule' : 'all',
    accounts,
  };
});

const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

/**
 * Ước tính thời điểm gửi xong một chiến dịch.
 *
 * @param {object} input
 * @param {Date|string|number} input.startAt thời điểm bắt đầu
 * @param {Array<object>} input.groups nhóm việc theo THỨ TỰ node:
 *   `{ nodeId, label, channel, order?, recipients, steps:[{delayMs, delayFrom}], sendMode, accounts:[{ key,
 *   dailyKey?, minDelayMs, maxDelayMs, perHourLimit?, perMinuteLimit?, dailyLimit?, sentToday?, quietHours? }] }`
 * @param {{ continuous?: boolean }} [input.options]
 * @returns {{ startAt: string, finishAtEarliest: string|null, finishAtTypical: string|null,
 *   finishAtLatest: string|null, totalActions: number,
 *   perNode: Array<object>, perDay: Array<object>, warnings: Array<{code: string, params: object}> }}
 */
export function estimateCampaignSend({ startAt, groups: rawGroups, options = {} } = {}) {
  const startAtMs = toMs(startAt, Date.now());
  const groups = normalizeGroups(rawGroups);
  const continuous = options?.continuous === true;
  const warnings = [];

  const blockedAccount = groups
    .flatMap((g) => g.accounts)
    .find((acc) => acc.dailyLimit === 0);
  const activeGroups = groups.filter((g) => g.recipients > 0);
  if (continuous) warnings.push({ code: 'continuous_mode', params: {} });

  if (activeGroups.length === 0 || blockedAccount) {
    if (blockedAccount) {
      warnings.push({ code: 'account_daily_limit', params: { accountKey: blockedAccount.dailyKey, limit: 0 } });
    }
    return {
      startAt: iso(startAtMs),
      finishAtEarliest: blockedAccount ? null : iso(startAtMs),
      finishAtTypical: blockedAccount ? null : iso(startAtMs),
      finishAtLatest: blockedAccount ? null : iso(startAtMs),
      totalActions: 0,
      perNode: groups.map((g) => ({
        nodeId: g.nodeId, label: g.label, channel: g.channel, recipients: g.recipients, actions: 0,
        finishAtEarliest: null, finishAtLatest: null,
      })),
      perDay: [],
      warnings,
    };
  }

  const earliest = runScenario({ startAtMs, groups: activeGroups, continuous, scenario: 'earliest' });
  const typical = runScenario({ startAtMs, groups: activeGroups, continuous, scenario: 'typical' });
  const latest = runScenario({ startAtMs, groups: activeGroups, continuous, scenario: 'latest' });

  if (latest.aborted) {
    warnings.push({ code: 'estimate_incomplete', params: { reason: latest.aborted } });
  }

  const elapsedLatest = latest.finishAtMs - startAtMs;
  if (elapsedLatest >= DAY_MS) {
    warnings.push({
      code: 'multi_day',
      params: { days: Math.ceil(elapsedLatest / DAY_MS), finishAtLatest: iso(latest.finishAtMs) },
    });
  }

  const perDay = [...latest.perDay.values()]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => ({ date: d.date, actions: d.actions, perAccount: d.perAccount }));

  // Zalo vượt mức an toàn/ngày/tài khoản — đếm cả số đã gửi hôm nay ở ngày đầu.
  const overSafe = [];
  const seededToday = new Map();
  activeGroups.forEach((g) => g.accounts.forEach((acc) => {
    if (isZaloChannel(g.channel) && !seededToday.has(acc.dailyKey)) seededToday.set(acc.dailyKey, acc.sentToday);
  }));
  const startDay = vnDayKey(startAtMs);
  [...latest.perDay.values()].forEach((d) => {
    Object.entries(d.zaloPerAccount).forEach(([accountKey, count]) => {
      const total = count + (d.date === startDay ? (seededToday.get(accountKey) || 0) : 0);
      if (total > SAFE_DAILY_ZALO_ACTIONS) {
        overSafe.push({ accountKey, date: d.date, actions: total, safeLimit: SAFE_DAILY_ZALO_ACTIONS });
      }
    });
  });
  if (overSafe.length > 0) {
    const worst = overSafe.reduce((a, b) => (b.actions > a.actions ? b : a));
    warnings.push({
      code: 'zalo_over_safe_daily',
      params: { ...worst, accounts: [...new Set(overSafe.map((o) => o.accountKey))], days: overSafe.length },
    });
  }

  latest.dailyLimitHits.forEach((limit, accountKey) => {
    warnings.push({ code: 'account_daily_limit', params: { accountKey, limit } });
  });

  const perNode = activeGroups.map((g) => {
    const e = earliest.perNode.get(g.nodeId);
    const l = latest.perNode.get(g.nodeId);
    return {
      nodeId: g.nodeId,
      label: g.label,
      channel: g.channel,
      recipients: g.recipients,
      steps: g.steps.length,
      accounts: g.accounts.map((a) => a.key),
      actions: l?.actions || 0,
      finishAtEarliest: iso(e?.finishAtMs),
      finishAtLatest: iso(l?.finishAtMs),
    };
  });
  // Nhóm không có người nhận vẫn hiện trong perNode (actions 0) để giao diện liệt kê đủ node.
  const perNodeFull = groups.map((g) => perNode.find((p) => p.nodeId === g.nodeId) || {
    nodeId: g.nodeId, label: g.label, channel: g.channel, recipients: g.recipients, steps: g.steps.length,
    accounts: g.accounts.map((a) => a.key), actions: 0, finishAtEarliest: null, finishAtLatest: null,
  });

  return {
    startAt: iso(startAtMs),
    finishAtEarliest: iso(earliest.finishAtMs),
    finishAtTypical: iso(typical.finishAtMs),
    finishAtLatest: iso(latest.finishAtMs),
    totalActions: latest.totalActions,
    perNode: perNodeFull,
    perDay,
    warnings,
  };
}

export default estimateCampaignSend;
