/**
 * Mutex trong tiến trình theo khoá (vd. một phiên chat). Các lời gọi cùng khoá chạy TUẦN TỰ theo thứ tự đến;
 * khác khoá chạy song song. Không có hàng đợi vô hạn: khoá tự dọn khi hết người chờ.
 *
 * CHỈ ĐÚNG khi production chạy MỘT tiến trình/replica (xem CLAUDE.md "Campaign runtime — single process only").
 * Scale-out → đổi sang `pg_advisory_xact_lock` (hoặc khoá Redis) trước khi thêm replica.
 *
 * Dùng cho đoạn NGẮN (đọc → áp → ghi). KHÔNG bọc cuộc gọi LLM.
 */
const tails = new Map();

export async function withKeyedLock(key, fn) {
  const previous = tails.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  tails.set(key, tail);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}

/** Khoá cho wizard_state của một phiên trợ lý (chat-turn và PATCH dùng chung). */
export const wizardSessionLockKey = (sessionId) => `ai-wizard-session:${Number(sessionId)}`;

export function __activeLockCountForTest() {
  return tails.size;
}
