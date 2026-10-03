import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { UNSAFE_NavigationContext, useLocation } from 'react-router-dom';

const getCurrentPath = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

/** `to` của navigator.push/replace (chuỗi hoặc object Path) → "/path?search#hash"; null nếu không rõ. */
const toPathString = (to) => {
  if (typeof to === 'string') return to;
  if (to && typeof to === 'object') {
    return `${to.pathname || ''}${to.search || ''}${to.hash || ''}`;
  }
  return null;
};

/**
 * Bộ gác popstate DUY NHẤT, gắn ngay lúc nạp module. Lý do (đo bằng Chromium thật 03/10/2026): listener popstate của
 * BrowserRouter gắn lúc mount và chạy TRƯỚC mọi listener gắn sau — kể cả listener capture; React render đồng bộ ngay
 * sau nó (có microtask checkpoint giữa các listener) → trang đang chặn bị gỡ, cleanup gỡ luôn listener chặn trước khi
 * nó kịp chạy → nút Back đi thẳng, không hỏi. jsdom không tái hiện. Module này được App import TĨNH (qua
 * LandingCanvasPage/CampaignBuilder) nên bộ gác luôn gắn trước router; mỗi hook đang chặn đăng ký handler vào đây,
 * handler gọi `event.stopImmediatePropagation()` để router không thấy sự kiện.
 */
const popstateGuards = new Set();
let popstateGuardInstalled = false;
const installPopstateGuard = () => {
  if (popstateGuardInstalled || typeof window === 'undefined') return;
  popstateGuardInstalled = true;
  window.addEventListener(
    'popstate',
    (event) => {
      for (const guard of Array.from(popstateGuards)) {
        if (guard(event) === true) return;
      }
    },
    true
  );
};
installPopstateGuard();

/** Thời gian tối đa một lần "cho qua" còn hiệu lực nếu không có điều hướng nào dùng tới nó. */
const ALLOW_NEXT_TTL_MS = 1500;

/**
 * Block browser-router navigation when a condition is active.
 *
 * This helper keeps a `useBlocker`-like API for apps using `BrowserRouter`
 * (non data-router), so existing confirm/proceed/reset flow can stay unchanged.
 *
 * Chặn cả: thẻ `<a>` nội bộ, nút Back/Forward (popstate) VÀ `navigate()` gọi bằng code
 * (bọc `navigator.push`/`navigator.replace`) — menu trái dùng `navigate()` nên trước đây lọt qua.
 *
 * `allowNext()` cho qua đúng MỘT lần điều hướng kế tiếp (dùng ngay trước `navigate` sau khi lưu xong:
 * `when` còn `true` vì setState bất đồng bộ).
 *
 * @param {boolean} when whether navigation should be blocked
 * @returns {{state: 'blocked'|'unblocked', proceed: () => void, reset: () => void, allowNext: () => void}}
 */
export const useBrowserRouterBlocker = (when) => {
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const location = useLocation();
  const [blockedTransition, setBlockedTransition] = useState(null);
  const historyIndexRef = useRef(Number.isFinite(window.history.state?.idx) ? window.history.state.idx : 0);
  const locationPathRef = useRef('');
  locationPathRef.current = `${location.pathname}${location.search}${location.hash}`;
  const allowNextRef = useRef(false);
  const allowNextTimerRef = useRef(null);

  const consumeAllowNext = useCallback(() => {
    if (!allowNextRef.current) return false;
    allowNextRef.current = false;
    if (allowNextTimerRef.current) {
      clearTimeout(allowNextTimerRef.current);
      allowNextTimerRef.current = null;
    }
    return true;
  }, []);

  const allowNext = useCallback(() => {
    allowNextRef.current = true;
    if (allowNextTimerRef.current) clearTimeout(allowNextTimerRef.current);
    allowNextTimerRef.current = setTimeout(() => {
      allowNextRef.current = false;
      allowNextTimerRef.current = null;
    }, ALLOW_NEXT_TTL_MS);
  }, []);

  useEffect(
    () => () => {
      if (allowNextTimerRef.current) clearTimeout(allowNextTimerRef.current);
    },
    []
  );

  useEffect(() => {
    historyIndexRef.current = Number.isFinite(window.history.state?.idx)
      ? window.history.state.idx
      : historyIndexRef.current;
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    if (!when) {
      setBlockedTransition(null);
      return undefined;
    }
    if (!navigator) return undefined;

    if (typeof navigator.block === 'function') {
      const unblock = navigator.block((tx) => {
        const autoUnblockingTx = {
          ...tx,
          retry() {
            unblock();
            tx.retry();
          },
        };
        setBlockedTransition(autoUnblockingTx);
      });

      return unblock;
    }

    // Bọc navigate() bằng code: cùng đích hiện tại / đang được "cho qua" thì đi thẳng.
    const originalPush = navigator.push;
    const originalReplace = navigator.replace;
    const wrapNavigation = (original) => {
      if (typeof original !== 'function') return null;
      return (to, ...rest) => {
        if (consumeAllowNext()) return original.call(navigator, to, ...rest);
        const target = toPathString(to);
        if (target !== null && target.startsWith('/') && target === locationPathRef.current) {
          return original.call(navigator, to, ...rest);
        }
        setBlockedTransition({
          retry() {
            setBlockedTransition(null);
            original.call(navigator, to, ...rest);
          },
        });
        return undefined;
      };
    };
    const wrappedPush = wrapNavigation(originalPush);
    const wrappedReplace = wrapNavigation(originalReplace);
    if (wrappedPush) navigator.push = wrappedPush;
    if (wrappedReplace) navigator.replace = wrappedReplace;

    const handleAnchorClickCapture = (event) => {
      if (event.defaultPrevented) return;
      if (consumeAllowNext()) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = event.target?.closest?.('a[href]');
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

      let nextUrl;
      try {
        nextUrl = new URL(anchor.href, window.location.origin);
      } catch {
        return;
      }
      if (nextUrl.origin !== window.location.origin) return;

      const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      const currentPath = getCurrentPath();
      if (nextPath === currentPath) return;

      event.preventDefault();
      setBlockedTransition({
        retry() {
          setBlockedTransition(null);
          if (typeof originalPush === 'function') {
            originalPush.call(navigator, nextPath);
            return;
          }
          window.location.assign(nextPath);
        },
      });
    };

    // Nút Back/Forward — chạy qua bộ gác toàn cục (xem `popstateGuards` đầu file) để đứng TRƯỚC router và chặn
    // router thấy sự kiện. URL đã lùi nhưng location của app chưa đổi → `history.go(-delta)` trả URL về, lần popstate
    // đó cũng nuốt luôn. Trả `true` = đã nuốt.
    let restoring = false;
    let passThrough = false;
    const handlePopState = (event) => {
      if (passThrough) {
        // proceed(): để router xử lý bình thường.
        passThrough = false;
        return false;
      }
      event.stopImmediatePropagation();
      if (restoring) {
        // Popstate do chính ta trả URL về: router vẫn đang ở trang này, không cần làm gì.
        restoring = false;
        return true;
      }
      const nextIndex = Number.isFinite(event.state?.idx) ? event.state.idx : null;
      const currentIndex = historyIndexRef.current;
      const delta = nextIndex === null ? -1 : nextIndex - currentIndex;
      if (delta === 0) return true;

      setBlockedTransition({
        retry() {
          setBlockedTransition(null);
          passThrough = true;
          window.history.go(delta);
        },
      });

      restoring = true;
      window.history.go(-delta);
      return true;
    };

    document.addEventListener('click', handleAnchorClickCapture, true);
    installPopstateGuard();
    popstateGuards.add(handlePopState);

    return () => {
      // Chỉ gỡ bọc nếu hàm hiện tại vẫn là bọc của mình (tránh đè lên hàm do nơi khác gắn sau).
      if (wrappedPush && navigator.push === wrappedPush) navigator.push = originalPush;
      if (wrappedReplace && navigator.replace === wrappedReplace) navigator.replace = originalReplace;
      document.removeEventListener('click', handleAnchorClickCapture, true);
      popstateGuards.delete(handlePopState);
    };
  }, [consumeAllowNext, navigator, when]);

  const proceed = useCallback(() => {
    if (!blockedTransition) return;
    const transitionToProceed = blockedTransition;
    setBlockedTransition(null);
    transitionToProceed.retry();
  }, [blockedTransition]);

  const reset = useCallback(() => {
    setBlockedTransition(null);
  }, []);

  return useMemo(
    () => ({
      state: blockedTransition ? 'blocked' : 'unblocked',
      proceed,
      reset,
      allowNext,
    }),
    [blockedTransition, proceed, reset, allowNext]
  );
};

export default useBrowserRouterBlocker;
