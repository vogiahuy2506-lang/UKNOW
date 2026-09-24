/**
 * Vòng tự kiểm → tự sửa hiển thị landing (PLAN_LANDING_TU_KIEM_HIEN_THI_TU_SUA, PR-3, mục 12.3.2).
 *
 * đo (trình duyệt) → có lỗi thì nhờ AI sửa (`autoLayoutFix`, không trừ credit) → ĐO LẠI → tối đa 2
 * vòng. "Đã sửa" chỉ được nói khi MÁY ĐO LẠI thấy hết lỗi (nguyên tắc 3 của plan). Không bao giờ
 * throw. Mọi lỗi của lượt sửa (429 hết lượt / trang dán HTML chưa được cấp lượt, 404, 409, 400, lỗi
 * mạng, bị api.js huỷ vì có request trùng) dừng IM LẶNG — không toast, không tin lỗi — vì đây là việc
 * của hệ thống chứ không phải của người dùng.
 *
 * Trạng thái trả về:
 *   clean        đo xong, không lỗi                      → ✓ "Đã kiểm tra hiển thị"
 *   fixed        có lỗi, sửa xong, ĐO LẠI thấy sạch      → ✓ + tin "Đã chỉnh hiển thị: …"
 *   still_broken có lỗi ĐÃ ĐO THẬT mà chưa sửa hết        → câu tiếng người + nút "Trình bày lại"
 *   unknown      chưa kiểm được (timedOut / errors)       → IM LẶNG: không ✓, không nói gì
 * Hợp đồng bộ đo (runLayoutAudit): chỉ coi là sạch khi findings rỗng VÀ !timedOut VÀ errors rỗng.
 */
import { useCallback } from 'react';
import aiApi from '../../../services/aiApi.js';
import { buildFullLandingHtml, runLayoutAudit } from '../utils/layoutAudit.js';

/** Trần vòng tự sửa ở phía client — khớp trần 2 lượt/tin của server (AUTO_LAYOUT_FIX_MAX_ROUNDS). */
export const MAX_AUTO_FIX_ROUNDS = 2;

/**
 * Đo một trang. `ok: false` = CHƯA KIỂM ĐƯỢC (quá hạn, script đo báo lỗi, hay chính lời gọi hỏng).
 */
async function measure(page) {
  try {
    const result = await runLayoutAudit(buildFullLandingHtml(page));
    const errors = Array.isArray(result?.errors) ? result.errors : [];
    if (!result || result.timedOut || errors.length > 0) {
      return { ok: false, reason: result?.timedOut ? 'timedOut' : errors.join(',') || 'no_result' };
    }
    return { ok: true, findings: Array.isArray(result.findings) ? result.findings : [] };
  } catch (error) {
    return { ok: false, reason: `audit_threw:${error?.message || error}` };
  }
}

/**
 * @param {object} opts
 * @param {{ title?: string, html: string }} opts.page  trang vừa sinh/sửa xong
 * @param {number|string|null} opts.sessionId           bắt buộc để tự sửa (server đếm trần theo tin)
 * @param {number|string|null} [opts.messageId]         id tin landing_page; null → server lấy tin mới nhất
 * @param {string} [opts.locale]
 * @param {() => boolean} [opts.isCancelled]            true → dừng, không gọi thêm request nào
 * @param {boolean} [opts.allowAutoFix=true]             false → CHỈ ĐO: có lỗi thì báo still_broken, không
 *   gọi lượt sửa tự động. Dùng cho trang dán HTML — server không cấp lượt tự sửa miễn phí cho tin dán
 *   (luôn 429), nên gọi chỉ tốn một request vô ích; lỗi đã đo vẫn hiện kèm nút sửa trả phí.
 * @returns {Promise<{ status: 'clean'|'fixed'|'still_broken'|'unknown', page: object, changed: boolean,
 *   findings: Array, changeSummary: string, canRevert: boolean|null, cancelled?: boolean }>}
 */
export async function autoFixLandingLayout({
  page,
  sessionId = null,
  messageId = null,
  locale = 'vi',
  isCancelled = () => false,
  allowAutoFix = true,
}) {
  let current = page;
  let changed = false;
  let changeSummary = '';
  let canRevert = null;
  const result = (status, findings = []) => ({
    status, page: current, changed, findings, changeSummary, canRevert,
  });

  try {
    if (!current || typeof current.html !== 'string' || !current.html.trim()) return result('unknown');

    let measured = await measure(current);
    if (isCancelled()) return { ...result('unknown'), cancelled: true };
    if (!measured.ok) {
      console.info(`[LayoutAudit] chưa kiểm được (${measured.reason}) — im lặng, không hiện ✓`);
      return result('unknown');
    }
    if (measured.findings.length === 0) return result('clean');

    let findings = measured.findings;
    // Không có phiên thì server không đếm được trần → không thể tự sửa; lỗi đã ĐO THẬT vẫn báo.
    // Chế độ chỉ đo (trang dán HTML) cũng dừng ở đây.
    if (!sessionId || !allowAutoFix) return result('still_broken', findings);

    for (let round = 1; round <= MAX_AUTO_FIX_ROUNDS; round += 1) {
      if (isCancelled()) return { ...result('unknown'), cancelled: true };

      let response;
      try {
        response = await aiApi.editLandingHtml({
          currentHtml: current.html,
          locale,
          sessionId,
          messageId,
          autoLayoutFix: true,
          layoutFindings: findings,
        });
      } catch (error) {
        console.info(
          `[LayoutAudit] tự sửa dừng ở vòng ${round}: ${error?.response?.status || ''} ${error?.response?.data?.code || error?.message || ''} — im lặng`,
        );
        break;
      }
      if (isCancelled()) return { ...result('unknown'), cancelled: true };

      const data = response?.success ? response.data : null;
      if (!data || typeof data.html !== 'string' || !data.html.trim() || data.html === current.html) break;

      current = { ...current, title: data.title || current.title, html: data.html };
      changed = true;
      if (data.changeSummary) changeSummary = String(data.changeSummary);
      if (data.canRevert != null) canRevert = Boolean(data.canRevert);

      measured = await measure(current);
      if (isCancelled()) return { ...result('unknown'), cancelled: true };
      if (!measured.ok) {
        // Đã sửa nhưng KHÔNG kiểm lại được → không được nói "đã sửa xong".
        console.info(`[LayoutAudit] đã sửa nhưng chưa đo lại được (${measured.reason}) — im lặng`);
        return result('unknown');
      }
      if (measured.findings.length === 0) return result('fixed');
      findings = measured.findings;
    }
    return result('still_broken', findings);
  } catch (error) {
    console.info('[LayoutAudit] lỗi ngoài dự kiến — im lặng:', error?.message || error);
    return result('unknown');
  }
}

/** Hook mỏng: giữ tham chiếu ổn định cho AiChatbot. Toàn bộ logic ở `autoFixLandingLayout` để test thẳng. */
export function useLandingLayoutAutoFix() {
  const runAutoFix = useCallback((options) => autoFixLandingLayout(options), []);
  return { runAutoFix };
}

export default useLandingLayoutAutoFix;
