/**
 * Chạy MỘT lượt sinh / sửa landing bằng AI dưới dạng phản hồi LUỒNG (NDJSON) có nhịp giữ kết nối
 * (PLAN_SUA_AI_DOT4_PR9_HET_524, B-4).
 *
 * Vì sao: một lượt sinh trang ~22k token mất 60–150 giây, mà Cloudflare cắt `/api` ở 100 giây nếu KHÔNG có byte nào chạy →
 * khách thấy 524 trong khi server vẫn xong, lưu và TRỪ credit; bấm lại thì trừ lần hai. Nay server mở phản hồi NGAY, mỗi 15 giây
 * ghi một dòng `{"type":"ping"}` (Cloudflare thấy byte đi đều), xong ghi đúng một dòng `result` hoặc `error` rồi đóng.
 *
 * Định dạng (mỗi dòng một JSON, kết thúc `\n`):
 *   {"type":"stage","stage":"generating"|"fixing"}     tiến độ (chỉ để hiện chữ)
 *   {"type":"ping"}                                    giữ kết nối
 *   {"type":"result","success":true,"data":{…}}        = nguyên thân JSON route cũ vẫn trả
 *   {"type":"error","status":422,"success":false,"message":"…", …}   = nguyên thân lỗi + mã HTTP route cũ vẫn trả
 *
 * Chỉ bật khi client XIN (`Accept: application/x-ndjson`). Client cũ (không xin) vẫn nhận JSON một lần như trước → deploy
 * frontend/backend theo thứ tự nào cũng không gãy. Lỗi trước khi bắt đầu luồng (thiếu prompt, quá dài, hết suất landing, hết
 * credit, thiếu quyền…) vẫn là JSON + mã HTTP như cũ vì chúng nằm trong controller/middleware chạy TRƯỚC hàm này.
 *
 * Ba điều hàm này đảm bảo:
 *  1. Trừ credit đúng MỘT lần và chỉ khi khách còn nhận được kết quả: người dùng đóng kết nối (đóng tab / mất mạng) giữa chừng
 *     thì lời gọi Gemini bị huỷ (`signal`), không lưu phiên, không trừ. Kiểm tra kết nối NGAY trước khi lưu phiên và NGAY trước
 *     khi trừ credit.
 *  2. Khoá chống trùng theo `requestId` (RAM, 10 phút): cùng `requestId` đang chạy → bám vào cùng lượt (không gọi Gemini lần 2);
 *     đã xong → trả lại kết quả, không trừ lần 2. Khác người dùng → coi như khác. Production chạy 1 replica
 *     (CLAUDE.md "Campaign runtime — single process"); nhiều replica thì phải chuyển sang Redis.
 *  3. Trần tổng mỗi lượt (`deadlineAtMs`) truyền cho mọi lời gọi Gemini (B-20).
 */
import {
  LANDING_TURN_TOTAL_MS,
  LANDING_TURN_PING_MS,
  LANDING_REQUEST_ID_TTL_MS,
  LANDING_TURN_REGISTRY_MAX,
} from '../../utils/landingTurnBudget.util.js';
import { isClientAbortError } from '../../utils/aiAbort.util.js';

export const NDJSON_CONTENT_TYPE = 'application/x-ndjson';

/** Lượt (theo `kind:userId:requestId`) đang chạy hoặc đã xong trong 10 phút gần đây. */
const turns = new Map();

/** Client có xin phản hồi luồng không (`Accept: application/x-ndjson`). Chịu được req giả của test (không có headers). */
export function wantsNdjson(req) {
  const accept = req?.headers?.accept ?? req?.headers?.Accept;
  return typeof accept === 'string' && accept.toLowerCase().includes(NDJSON_CONTENT_TYPE);
}

/** `requestId` hợp lệ: 8–80 ký tự [A-Za-z0-9_-] (uuid v4 đạt). Sai dạng → coi như không có (không chặn lượt). */
export function readRequestId(req) {
  const raw = req?.body?.requestId;
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  return /^[A-Za-z0-9_-]{8,80}$/.test(id) ? id : null;
}

function turnKeyFor(req, kind) {
  if (!wantsNdjson(req)) return null;
  const requestId = readRequestId(req);
  const userId = req?.user?.id;
  if (!requestId || userId == null) return null;
  return `${kind}:${userId}:${requestId}`;
}

function sweepTurns(now = Date.now()) {
  for (const [key, turn] of turns) {
    // Lượt đang chạy tối đa LANDING_TURN_TOTAL_MS; quá TTL + trần thì chắc chắn là rác (lượt treo không kết thúc).
    const ttl = LANDING_REQUEST_ID_TTL_MS + (turn.status === 'running' ? LANDING_TURN_TOTAL_MS : 0);
    if (now - turn.ts > ttl) turns.delete(key);
  }
  if (turns.size > LANDING_TURN_REGISTRY_MAX) {
    // Chặn phình RAM (mỗi lượt xong giữ nguyên HTML kết quả): bỏ lượt ĐÃ XONG cũ nhất trước.
    const done = [...turns.entries()].filter(([, t]) => t.status === 'done').sort((a, b) => a[1].ts - b[1].ts);
    for (const [key] of done) {
      if (turns.size <= LANDING_TURN_REGISTRY_MAX) break;
      turns.delete(key);
    }
  }
}

const ndjsonLine = (obj) => `${JSON.stringify(obj)}\n`;

function writeSafe(res, text) {
  try {
    if (res.writableEnded || res.destroyed) return false;
    res.write(text);
    return true;
  } catch {
    return false;
  }
}

function endSafe(res) {
  try {
    if (!res.writableEnded) res.end();
  } catch {
    // socket đã đóng — không còn gì để làm
  }
}

function hasOpenSubscriber(turn) {
  for (const sub of turn.subs) if (sub.open) return true;
  return false;
}

/** Một người nghe đã mất kết nối. Hết người nghe mà lượt còn chạy → huỷ lời gọi Gemini đang chờ. */
function closeSubscriber(turn, sub) {
  if (!sub.open) return;
  sub.open = false;
  if (sub.timer) {
    clearInterval(sub.timer);
    sub.timer = null;
  }
  if (turn.status === 'running' && !hasOpenSubscriber(turn) && !turn.controller.signal.aborted) {
    turn.clientClosed = true;
    turn.controller.abort();
  }
}

/** Mở phản hồi luồng NGAY: header + flush, rồi nhịp ping. */
function openNdjson(res) {
  res.status(200);
  res.setHeader('Content-Type', `${NDJSON_CONTENT_TYPE}; charset=utf-8`);
  // `no-transform`: proxy/CDN không được nén/đệm gom lại; `X-Accel-Buffering: no` cho nginx (nếu có đứng giữa).
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

function attachSubscriber(turn, res, { stream, pingMs }) {
  const sub = { res, stream, open: true, timer: null };
  turn.subs.add(sub);

  const onGone = () => {
    // 'close' cũng nổ khi phản hồi KẾT THÚC bình thường — chỉ tính là mất kết nối khi chưa ghi xong.
    if (!res.writableFinished) closeSubscriber(turn, sub);
  };
  if (typeof res.on === 'function') {
    res.on('close', onGone);
    res.on('error', () => closeSubscriber(turn, sub));
  }

  if (stream) {
    openNdjson(res);
    // Nhịp giữ kết nối; ghi hỏng (Cloudflare/trình duyệt đã đóng) = phát hiện mất kết nối sớm, không chờ tới lúc ghi kết quả.
    sub.timer = setInterval(() => {
      if (!writeSafe(res, ndjsonLine({ type: 'ping' }))) closeSubscriber(turn, sub);
    }, pingMs);
    sub.timer.unref?.();
    if (turn.stage) writeSafe(res, ndjsonLine({ type: 'stage', stage: turn.stage }));
  }
  return sub;
}

function setStage(turn, stage) {
  if (!stage || turn.stage === stage) return;
  turn.stage = stage;
  for (const sub of turn.subs) {
    if (sub.open && sub.stream && !writeSafe(sub.res, ndjsonLine({ type: 'stage', stage }))) closeSubscriber(turn, sub);
  }
}

/** Ghi kết quả cuối cho mọi người nghe còn kết nối rồi đóng. */
function deliver(turn, outcome) {
  for (const sub of turn.subs) {
    if (sub.timer) {
      clearInterval(sub.timer);
      sub.timer = null;
    }
    if (!sub.open || !outcome) continue;
    sub.open = false;
    if (sub.stream) {
      const line = outcome.ok
        ? { type: 'result', ...outcome.body }
        : { type: 'error', status: outcome.status, ...outcome.body };
      writeSafe(sub.res, ndjsonLine(line));
      endSafe(sub.res);
    } else if (outcome.ok) {
      // Giữ y nguyên cách trả của route cũ: thành công không gọi status(), lỗi mới gọi.
      sub.res.json(outcome.body);
    } else {
      sub.res.status(outcome.status).json(outcome.body);
    }
  }
}

/** Bám vào lượt có sẵn (cùng requestId). Trả true nếu đã xử lý xong request này (không chạy lượt mới). */
function attachToExistingTurn(turn, req, res, { kind, pingMs }) {
  const userId = req?.user?.id;
  if (turn.status === 'done') {
    // Lượt đã xong: ghi lại đúng dòng kết quả đã nhớ cho request này rồi đóng — KHÔNG gọi Gemini, KHÔNG trừ credit. Dùng một "lượt tạm"
    // riêng để người nghe này không dính vào tập người nghe của lượt gốc.
    const tmp = { status: 'done', subs: new Set(), controller: { signal: { aborted: false } }, stage: null };
    attachSubscriber(tmp, res, { stream: true, pingMs });
    deliver(tmp, turn.outcome);
    console.log(`[LandingAI] turn kind=${kind} user=${userId} streamed=1 dedup=1 state=cached charged=0`);
    return true;
  }
  attachSubscriber(turn, res, { stream: true, pingMs });
  console.log(`[LandingAI] turn kind=${kind} user=${userId} streamed=1 dedup=1 state=attached charged=0`);
  return true;
}

function findLiveTurn(key) {
  if (!key) return null;
  const turn = turns.get(key);
  if (!turn) return null;
  // Lượt đã bị huỷ (mọi người nghe đều đã đóng) — không ai nhận kết quả của nó; bỏ để lượt mới chạy lại từ đầu.
  if (turn.controller.signal.aborted) {
    turns.delete(key);
    return null;
  }
  return turn;
}

/**
 * Middleware đặt TRƯỚC `assertAiCreditAvailable`: request trùng `requestId` của một lượt đang chạy / đã xong thì bám vào lượt đó
 * ngay, KHÔNG qua bước kiểm credit (khách chỉ còn 1 credit, lượt đầu đã trừ xong rồi mất mạng → bấm lại vẫn phải nhận được trang đã
 * trả tiền, không phải câu "hết credit").
 *
 * @param {'generate'|'edit'} kind
 */
export function attachToExistingLandingTurn(kind, { pingMs = LANDING_TURN_PING_MS } = {}) {
  return (req, res, next) => {
    const key = turnKeyFor(req, kind);
    const turn = findLiveTurn(key);
    if (!turn) return next();
    attachToExistingTurn(turn, req, res, { kind, pingMs });
    return undefined;
  };
}

/**
 * @param {object} opts
 * @param {import('express').Request} opts.req
 * @param {import('express').Response} opts.res
 * @param {'generate'|'edit'} opts.kind
 * @param {(ctx: { signal: AbortSignal, deadlineAtMs: number, timeBudgetMs: (number|undefined), streamed: 0|1, setStage: (s: string) => void, isDeliverable: () => boolean }) =>
 *   Promise<{ data: object, persist?: () => Promise<void>, free?: boolean }>} opts.work
 *   Việc nặng. `persist` (ghi phiên) chạy SAU khi kiểm còn kết nối và TRƯỚC khi trừ credit; `free` = lượt không trừ credit.
 * @param {(error: Error) => { status: number, body: object }} opts.mapError  lỗi → mã HTTP + thân lỗi (như catch của route cũ)
 * @param {() => Promise<void>} opts.charge  trừ credit (chỉ gọi khi giao được kết quả và lượt không `free`)
 * @param {number} [opts.pingMs]
 */
export async function runLandingAiTurn({ req, res, kind, work, mapError, charge, pingMs = LANDING_TURN_PING_MS }) {
  const stream = wantsNdjson(req);
  const key = turnKeyFor(req, kind);
  sweepTurns();

  // Hai request cùng requestId có thể cùng lọt qua middleware trước khi lượt đầu kịp đăng ký (middleware kiểm credit có await) —
  // kiểm lại ở đây, đồng bộ với bước đăng ký bên dưới.
  const existing = findLiveTurn(key);
  if (existing) {
    attachToExistingTurn(existing, req, res, { kind, pingMs });
    return;
  }

  const startedAt = Date.now();
  const turn = {
    key,
    kind,
    status: 'running',
    ts: startedAt,
    subs: new Set(),
    controller: new AbortController(),
    stage: null,
    clientClosed: false,
    outcome: null,
  };
  if (key) turns.set(key, turn);
  attachSubscriber(turn, res, { stream, pingMs });

  const ctx = {
    signal: turn.controller.signal,
    deadlineAtMs: startedAt + LANDING_TURN_TOTAL_MS,
    // Đường luồng không còn bị Cloudflare cắt → dùng cả ngân sách tổng; đường JSON cũ để dịch vụ tự dùng ngân sách 85 giây của nó.
    timeBudgetMs: stream ? LANDING_TURN_TOTAL_MS : undefined,
    streamed: stream ? 1 : 0,
    setStage: (stage) => setStage(turn, stage),
    isDeliverable: () => hasOpenSubscriber(turn),
  };

  let outcome = null;
  let charged = false;
  let ended = 'closed';
  try {
    const result = await work(ctx);

    // Chốt 1 — người dùng đã đi rồi: không lưu phiên, không trừ credit.
    if (!hasOpenSubscriber(turn)) throw clientGone();
    if (typeof result?.persist === 'function') await result.persist();
    // Chốt 2 — NGAY trước khi trừ: lưu phiên có thể mất vài chục ms, kết nối có thể rớt đúng lúc đó.
    if (!hasOpenSubscriber(turn)) throw clientGone();
    if (!result?.free) {
      await charge();
      charged = true;
    }
    outcome = { ok: true, status: 200, body: { success: true, data: result?.data } };
    ended = 'result';
  } catch (error) {
    if (turn.clientClosed || error?.isClientGone || isClientAbortError(error)) {
      outcome = null;
      ended = 'closed';
    } else {
      const mapped = mapError(error);
      outcome = { ok: false, status: mapped.status, body: mapped.body };
      ended = 'error';
    }
  }

  turn.status = 'done';
  turn.ts = Date.now();
  if (key) {
    // Chỉ NHỚ kết quả thành công: lỗi / bị huỷ thì lần bấm lại phải chạy mới (chưa trừ đồng nào nên chạy lại không thiệt gì ai).
    if (outcome?.ok) turn.outcome = outcome;
    else turns.delete(key);
  }
  deliver(turn, outcome);
  console.log(
    `[LandingAI] turn kind=${kind} user=${req?.user?.id} streamed=${stream ? 1 : 0} clientClosed=${turn.clientClosed || ended === 'closed' ? 1 : 0} dedup=0 `
    + `outcome=${ended} charged=${charged ? 1 : 0} ms=${Date.now() - startedAt}`,
  );
}

function clientGone() {
  const err = new Error('Người dùng đã đóng kết nối trước khi nhận kết quả');
  err.isClientGone = true;
  return err;
}

/** Chỉ cho test: xoá sổ lượt đã nhớ. */
export function resetLandingTurnsForTest() {
  for (const turn of turns.values()) {
    for (const sub of turn.subs) if (sub.timer) clearInterval(sub.timer);
  }
  turns.clear();
}
