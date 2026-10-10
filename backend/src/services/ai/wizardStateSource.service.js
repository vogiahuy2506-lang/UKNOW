/**
 * PR-C1 (C-NO-GOC1) — nguồn trạng thái wizard: `wizard_state` trong DB hay replay lịch sử do client gửi.
 *
 * Cờ `WIZARD_STATE_SOURCE`:
 *  - `history`: chỉ đường cũ (replay toàn bộ lịch sử + merge với bản đã lưu).
 *  - `shadow` (mặc định): VẪN phục vụ bằng đường cũ, đồng thời tính đường mới và in MỘT dòng log
 *    `[Compiler Shadow WizardState]` (khớp / lệch + TÊN trường — không bao giờ in giá trị).
 *  - `db`: phục vụ bằng đường mới khi bản đã lưu đủ điều kiện (xem isWizardStateInSync), ngược lại rơi về đường cũ.
 *
 * Điều kiện "đủ điều kiện" dùng hai dấu trong `wizard_state.meta` (KHÔNG đổi `v`, FE cũ đòi v===1):
 *  - `historyBackfilledAt`: bản đã lưu từng được dựng từ replay lịch sử đầy đủ (backfill lười — mọi lượt chat ghi dấu này).
 *  - `foldedMessageCount`: số tin trong `ai_chat_messages` tại lúc ghi. Lệch với số tin thật nghĩa là có tin vào DB mà
 *    bản đã lưu chưa gấp (lượt ghi hỏng, tin landing, tin lỗi…) → lượt đó rơi về replay, rồi ghi lại dấu mới (tự chữa).
 */

import { isDeepStrictEqual } from 'node:util';
import {
  GATE_MERGE_POLICIES,
  createEmptyDerivedWizardState,
  extractWizardState,
  foldWizardMessages,
  mergeWizardState,
} from './aiCampaignWizard.service.js';
import { extractCampaignBriefFromHistory, mergeCampaignBrief } from './campaignBrief.service.js';

export const WIZARD_STATE_SOURCES = ['history', 'shadow', 'db'];
export const DEFAULT_WIZARD_STATE_SOURCE = 'shadow';

/** Đọc lúc gọi (không cache) để đổi cờ không cần build lại; sửa .env vẫn phải khởi động lại tiến trình. */
export function resolveWizardStateSource(raw = process.env.WIZARD_STATE_SOURCE) {
  const value = String(raw ?? '').trim().toLowerCase();
  return WIZARD_STATE_SOURCES.includes(value) ? value : DEFAULT_WIZARD_STATE_SOURCE;
}

/**
 * Bản đã lưu có thể làm nguồn duy nhất cho lượt này không?
 * @param {object|null} persistedRaw  cột wizard_state thô
 * @param {number|null} messageCount  số tin hiện có của phiên trong ai_chat_messages (null = không biết)
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function isWizardStateInSync(persistedRaw, messageCount) {
  if (!persistedRaw || typeof persistedRaw !== 'object' || persistedRaw.v !== 1) {
    return { ok: false, reason: 'no_state' };
  }
  const meta = persistedRaw.meta && typeof persistedRaw.meta === 'object' ? persistedRaw.meta : {};
  if (!meta.historyBackfilledAt) return { ok: false, reason: 'not_backfilled' };
  if (!Number.isInteger(messageCount) || messageCount < 0) return { ok: false, reason: 'count_unknown' };
  if (!Number.isInteger(meta.foldedMessageCount)) return { ok: false, reason: 'no_folded_count' };
  if (meta.foldedMessageCount !== messageCount) return { ok: false, reason: 'count_mismatch' };
  return { ok: true, reason: null };
}

/**
 * Dấu backfill ghi kèm mỗi lần ghi state có gates sau lượt chat. `historyBackfilledAt` chỉ đặt một lần (giữ mốc đầu).
 * `foldedMessageCount` KHÔNG tính ở đây: repository đếm ngay trong câu UPDATE (stampFoldedCount) để số đếm và lần ghi
 * cùng một câu lệnh, không có khe giữa hai truy vấn.
 */
export function buildBackfillStamp(prevMeta, now = new Date()) {
  return { historyBackfilledAt: prevMeta?.historyBackfilledAt || now.toISOString() };
}

/**
 * Các khoá của `turn` khác `start` (so sâu). Lượt chat chỉ ghi phần NÓ THAY ĐỔI so với bản đã đọc lúc đầu lượt, để
 * khi lượt chạy lâu (LLM 10–30 giây) một PATCH xen giữa (approve_plan, set_zalo_friends…) không bị ghi đè lại bằng
 * giá trị cũ của đầu lượt.
 */
/** Giá trị mặc định "rỗng" của một cổng (null/false/''/[]/{}) — xoá nó đi hay giữ nguyên đều như nhau. */
function isEmptyGateValue(value) {
  if (value === null || value === undefined || value === false || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

export function diffChangedKeys(start, turn) {
  const base = start && typeof start === 'object' ? start : {};
  const out = {};
  if (!turn || typeof turn !== 'object') return out; // lượt không dựng gates → không đổi gì
  const next = turn;
  for (const [key, value] of Object.entries(next)) {
    // `undefined` không qua được JSON → ghi `null` tường minh, nếu không phép gộp `||` sẽ giữ giá trị cũ.
    if (!isDeepStrictEqual(value, base[key])) out[key] = value === undefined ? null : value;
  }
  // Khoá có lúc đầu lượt mà kết quả lượt không còn: bản cũ thay CẢ khối nên khoá đó mất — giữ đúng nghĩa đó bằng `null`.
  for (const key of Object.keys(base)) {
    if (!(key in next) && !isEmptyGateValue(base[key])) out[key] = null;
  }
  return out;
}

const SHADOW_LOG_PREFIX = '[Compiler Shadow WizardState]';

/** Tên các trường lệch giữa hai kết quả (CHỈ TÊN — không bao giờ trả giá trị để khỏi lọt PII/sheetUrl/nội dung vào log). */
export function diffWizardTurnState(legacy, candidate) {
  const names = [];
  const fields = Object.keys(GATE_MERGE_POLICIES);
  for (const field of fields) {
    if (!isDeepStrictEqual(legacy.mergedGates?.[field], candidate.mergedGates?.[field])) names.push(field);
  }
  // Tín hiệu suy ra mà service dùng NGOÀI bước merge (quyền nhân viên, cổng tệp đính kèm).
  for (const field of ['isCampaignFlow', 'hasAttachedFile', 'hasAttachedSpreadsheet']) {
    if (Boolean(legacy.derivedState?.[field]) !== Boolean(candidate.derivedState?.[field])) names.push(`derived.${field}`);
  }
  if (!isDeepStrictEqual(legacy.briefSignature, candidate.briefSignature)) names.push('brief');
  return names;
}

const briefSignature = (persistedBrief, extracted) => ({
  invalid: Boolean(extracted?.invalid),
  merged: extracted?.invalid ? null : mergeCampaignBrief(persistedBrief, extracted?.brief ?? null, { defaultContentLocale: 'vi' }),
});

/**
 * Dựng trạng thái wizard của MỘT lượt chat theo cờ nguồn (xem đầu file).
 *
 * Đường cũ (luôn tính, vì shadow/db-rơi-về cần nó): replay TOÀN BỘ lịch sử client gửi rồi merge với bản đã lưu.
 * Đường mới: bản đã lưu đã gồm mọi tin trước đó (đủ điều kiện = isWizardStateInSync) nên chỉ gấp tin user MỚI NHẤT
 * (chỉ số tuyệt đối = history.length-1) rồi cũng merge với bản đã lưu — cùng một bảng chính sách `mergeWizardState`.
 *
 * @returns {{ derivedState, mergedGates, extracted, source: 'history'|'db' }}
 *   `extracted` = kết quả extractCampaignBriefFromHistory (hoặc bản gấp riêng tin cuối ở đường mới).
 */
export function deriveWizardTurnState({
  mode = resolveWizardStateSource(),
  history = [],
  options = {},
  lastUserText = '',
  persistedRaw = null,
  persistedState,
  messageCount = null,
  log = (line) => console.log(line),
}) {
  const messages = Array.isArray(history) ? history : [];
  const legacyDerived = extractWizardState(messages, options);
  const legacyMerged = mergeWizardState(persistedState.gates, legacyDerived, { lastUserText });
  const legacyExtracted = extractCampaignBriefFromHistory(messages);
  const legacy = { derivedState: legacyDerived, mergedGates: legacyMerged, extracted: legacyExtracted, source: 'history' };
  if (mode === 'history') return legacy;

  try {
    const sync = isWizardStateInSync(persistedRaw, messageCount);
    const last = messages[messages.length - 1];
    const skipReason = !sync.ok ? sync.reason : (last?.role === 'user' ? null : 'last_not_user');
    if (skipReason) {
      // Mỗi lượt đúng MỘT dòng, kể cả khi bỏ qua — để số liệu "đủ điều kiện / tổng lượt" đọc được từ file log.
      if (mode === 'shadow') log(`${SHADOW_LOG_PREFIX} ⏭ bỏ qua (${skipReason})`);
      return legacy;
    }

    const tailDerived = foldWizardMessages(createEmptyDerivedWizardState(), [last], { ...options, indexOffset: messages.length - 1 });
    // Hai thói quen của đường replay được GIỮ NGUYÊN có chủ đích (PR-C1 không đổi hành vi):
    //  (1) Tin `content_plan` cũ vẫn nằm trong lịch sử nên `hasContentPlan` suy ra vẫn true sau khi đổi kênh (chỉ planApproved bị
    //      marker channel reset). Ở đường mới tin đó không còn trong tay → lấy từ bản đã lưu, trừ khi đã có mốc huỷ.
    //  (2) Marker `channel` luôn xoá lịch suy từ câu yêu cầu đầu ("5 ngày") — lịch được hỏi lại ở cổng schedule.
    if (options?.abandonedAtMessageCount == null && persistedState.gates?.hasContentPlan) tailDerived.hasContentPlan = true;
    const tailMerged = mergeWizardState(persistedState.gates, tailDerived, { lastUserText });
    if (tailDerived.markerGates.includes('channel')) tailMerged.schedule = tailDerived.schedule ?? null;
    // Tín hiệu "có tệp / đang trong luồng" của đường cũ nhìn cả lịch sử; đường mới lấy từ bản đã gộp với bản lưu.
    tailDerived.isCampaignFlow = Boolean(tailDerived.isCampaignFlow || tailMerged.isCampaignFlow);
    tailDerived.hasAttachedFile = Boolean(tailDerived.hasAttachedFile || tailMerged.hasAttachedFile);
    tailDerived.hasAttachedSpreadsheet = Boolean(tailDerived.hasAttachedSpreadsheet || tailMerged.hasAttachedSpreadsheet);
    const tailExtracted = extractCampaignBriefFromHistory([last]);
    const candidate = { derivedState: tailDerived, mergedGates: tailMerged, extracted: tailExtracted, source: 'db' };

    if (mode === 'db') return candidate;

    const names = diffWizardTurnState(
      { ...legacy, briefSignature: briefSignature(persistedState.brief, legacyExtracted) },
      { ...candidate, briefSignature: briefSignature(persistedState.brief, tailExtracted) },
    );
    log(names.length === 0 ? `${SHADOW_LOG_PREFIX} ✅ khớp` : `${SHADOW_LOG_PREFIX} ❌ lệch: ${names.join(', ')}`);
    return legacy;
  } catch (err) {
    // So sánh lỗi KHÔNG được làm hỏng lượt. Chỉ in tên lỗi (message có thể chứa giá trị).
    if (mode === 'shadow') log(`${SHADOW_LOG_PREFIX} ⚠️ lỗi so sánh (${err?.name || 'Error'})`);
    return legacy;
  }
}

/**
 * Dạng wizard_state trả cho CLIENT sau mỗi lượt chat (`data.wizardState` của /ai/chat): CHỈ phần FE cần để bỏ suy diễn
 * từ lịch sử — gates đã gộp, trạng thái kế hoạch, meta cổng. KHÔNG kèm `brief` (có thể chứa văn bản tệp đính kèm hàng trăm KB)
 * và KHÔNG kèm snapshot/savedTemplates của kế hoạch (tải qua GET phiên). `v` giữ nguyên 1 — FE cũ đòi v===1.
 */
export function toClientWizardState(state) {
  if (!state || typeof state !== 'object' || state.v !== 1) return null;
  const meta = state.meta && typeof state.meta === 'object' ? state.meta : {};
  const plan = state.plan && typeof state.plan === 'object' ? state.plan : {};
  return {
    v: 1,
    gates: { ...(state.gates || {}) },
    plan: { status: plan.status ?? null, campaignId: plan.campaignId ?? null },
    meta: {
      lastGate: meta.lastGate ?? null,
      lastGateCount: meta.lastGateCount ?? 0,
      updatedAt: meta.updatedAt ?? null,
    },
  };
}
