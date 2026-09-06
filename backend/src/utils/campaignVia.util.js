/**
 * Suy ra nhãn `via` cho audit CAMPAIGN_CREATED / CAMPAIGN_RUN: campaign này được dựng bằng
 * đường nào — Builder tay, trợ lý AI (LLM dựng cấu trúc), compiler (code dựng cấu trúc), hay
 * compiler + slot filling (code dựng cấu trúc, LLM chỉ điền nội dung).
 *
 * Vì sao tách ra: trước 06/09/2026 hai call site trong ai.controller.js dùng chung một ternary
 *   (script.compilerApplied || script._via === 'ai_compiler') ? 'ai_compiler' : 'ai'
 * nên hễ compiler chạy là nhãn thành 'ai_compiler', kể cả khi slot filling đã áp dụng
 * (script._via = 'ai_compiler_slot_filling'). Log production ghi "✅ Đã áp dụng Slot Filling"
 * cho campaign 355 nhưng audit_logs vẫn ghi 'ai_compiler' — nhãn giám sát nói dối, không thể
 * nghiệm thu GĐ 4 bằng audit như đã định.
 *
 * Nhận nhiều ứng viên vì script đi qua prepareScript trước khi tới audit; ứng viên đầu có
 * `_via` hợp lệ thắng, sau đó mới xét `compilerApplied`.
 */

export const CAMPAIGN_VIA = Object.freeze({
  BUILDER: 'builder',
  AI: 'ai',
  AI_COMPILER: 'ai_compiler',
  AI_COMPILER_SLOT_FILLING: 'ai_compiler_slot_filling',
});

const KNOWN_AI_VIA = new Set([CAMPAIGN_VIA.AI_COMPILER_SLOT_FILLING, CAMPAIGN_VIA.AI_COMPILER]);

/**
 * @param {...(object|null|undefined)} scripts  script đã chuẩn hoá trước, script gốc sau
 * @returns {'ai'|'ai_compiler'|'ai_compiler_slot_filling'}
 */
export function resolveCampaignVia(...scripts) {
  for (const script of scripts) {
    const via = String(script?._via || '').trim();
    if (KNOWN_AI_VIA.has(via)) return via;
  }
  for (const script of scripts) {
    if (script?.compilerApplied === true) return CAMPAIGN_VIA.AI_COMPILER;
  }
  return CAMPAIGN_VIA.AI;
}
