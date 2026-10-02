import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildDraftKey,
  clearDraft,
  pickDraftForm,
  serializeMessages,
  writeDraft,
} from '../utils/landingCanvasDraft.js';

/** Debounce ghi nháp — tab "Mã HTML" (Monaco) đổi form mỗi phím, không được ghi đồng bộ. */
export const DRAFT_WRITE_DEBOUNCE_MS = 800;

/**
 * Ghi nháp trình soạn landing (PLAN_LANDING_GIU_NHAP_KHI_F5_2026-10-03.md, Việc 2).
 *
 * - Debounce 800ms khi form/hội thoại đổi; flush NGAY khi `pagehide` / `visibilitychange→hidden` /
 *   unmount (F5 nhanh hơn 800ms vẫn giữ).
 * - Chỉ ghi `form` khi trang bẩn; trang sạch mà có hội thoại → ghi `form:null` (giữ hội thoại).
 *   Sạch và không hội thoại → xoá nháp.
 * - `writeFailed` = lần ghi gần nhất thất bại (hết dung lượng) — nơi gọi bật `beforeunload`.
 *
 * @param {{ scope: {userId, ownerId}, editingId: number|null, form: object, messages: any[],
 *   dirty: boolean, baseUpdatedAt?: string|null, interruptedText?: string }} params
 */
export default function useLandingCanvasDraft({
  scope,
  editingId,
  form,
  messages,
  dirty,
  baseUpdatedAt = null,
  interruptedText = '',
}) {
  const key = useMemo(
    () => buildDraftKey(scope, editingId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope?.userId, scope?.ownerId, editingId]
  );
  const latestRef = useRef({});
  latestRef.current = { key, form, messages, dirty, interruptedText };
  const baseRef = useRef(baseUpdatedAt ?? null);
  const stoppedRef = useRef(false);
  const timerRef = useRef(null);
  const [writeFailed, setWriteFailed] = useState(false);

  const cancelTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    cancelTimer();
    if (stoppedRef.current) return;
    const { key: k, form: f, messages: m, dirty: d, interruptedText: text } = latestRef.current;
    if (!k) return;
    const list = Array.isArray(m) ? m : [];
    if (!d && list.length === 0) {
      clearDraft(k);
      setWriteFailed(false);
      return;
    }
    const result = writeDraft(k, {
      baseUpdatedAt: baseRef.current,
      form: d ? pickDraftForm(f) : null,
      messages: serializeMessages(list, { interruptedText: text }),
    });
    setWriteFailed(!result.ok);
  }, [cancelTimer]);

  // Debounce khi form / hội thoại / bẩn đổi.
  useEffect(() => {
    if (stoppedRef.current || !key) return undefined;
    cancelTimer();
    timerRef.current = setTimeout(flush, DRAFT_WRITE_DEBOUNCE_MS);
    return cancelTimer;
  }, [form, messages, dirty, key, flush, cancelTimer]);

  // Flush ngay khi rời trang / ẩn tab / unmount.
  useEffect(() => {
    const onHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [flush]);

  /** Dừng ghi (không xoá). */
  const stop = useCallback(() => {
    stoppedRef.current = true;
    cancelTimer();
  }, [cancelTimer]);

  /** Bỏ nháp: xoá + dừng ghi (để flush ở unmount không ghi lại). */
  const discard = useCallback(() => {
    stoppedRef.current = true;
    cancelTimer();
    clearDraft(latestRef.current.key);
    setWriteFailed(false);
  }, [cancelTimer]);

  /**
   * Gọi ngay sau khi LƯU thành công: nháp chỉ còn hội thoại, gắn mốc `updatedAt` mới.
   * Trang mới được tạo (`newId`) → chuyển hội thoại sang khoá của trang đó và dừng ghi khoá 'new'.
   */
  const commitSaved = useCallback(
    ({ newId = null, updatedAt = null } = {}) => {
      const { key: k, messages: m, interruptedText: text } = latestRef.current;
      const list = serializeMessages(Array.isArray(m) ? m : [], { interruptedText: text });
      // Render kế tiếp chưa tới — ép "sạch" để flush ở unmount không ghi lại form cũ.
      latestRef.current = { ...latestRef.current, dirty: false };
      cancelTimer();
      if (newId != null) {
        stoppedRef.current = true;
        clearDraft(k);
        const nextKey = buildDraftKey(scope, newId);
        if (list.length > 0) {
          writeDraft(nextKey, { baseUpdatedAt: updatedAt, form: null, messages: list });
        } else {
          clearDraft(nextKey);
        }
        return;
      }
      if (updatedAt) baseRef.current = updatedAt;
      if (list.length > 0) {
        writeDraft(k, { baseUpdatedAt: baseRef.current, form: null, messages: list });
      } else {
        clearDraft(k);
      }
      setWriteFailed(false);
    },
    [cancelTimer, scope]
  );

  return { writeFailed, flush, stop, discard, commitSaved };
}
