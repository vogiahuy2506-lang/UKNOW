import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { UNSAFE_NavigationContext, useLocation } from 'react-router-dom';

const getCurrentPath = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

/**
 * Block browser-router navigation when a condition is active.
 *
 * This helper keeps a `useBlocker`-like API for apps using `BrowserRouter`
 * (non data-router), so existing confirm/proceed/reset flow can stay unchanged.
 *
 * @param {boolean} when whether navigation should be blocked
 * @returns {{state: 'blocked'|'unblocked', proceed: () => void, reset: () => void}}
 */
export const useBrowserRouterBlocker = (when) => {
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const location = useLocation();
  const [blockedTransition, setBlockedTransition] = useState(null);
  const historyIndexRef = useRef(Number.isFinite(window.history.state?.idx) ? window.history.state.idx : 0);

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

    const handleAnchorClickCapture = (event) => {
      if (event.defaultPrevented) return;
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
          if (typeof navigator.push === 'function') {
            navigator.push(nextPath);
            return;
          }
          window.location.assign(nextPath);
        },
      });
    };

    const handlePopState = (event) => {
      const nextIndex = Number.isFinite(event.state?.idx) ? event.state.idx : null;
      const currentIndex = historyIndexRef.current;
      const shouldGoBack = nextIndex === null || nextIndex < currentIndex;

      setBlockedTransition({
        retry() {
          setBlockedTransition(null);
          if (shouldGoBack) {
            window.history.back();
          } else {
            window.history.forward();
          }
        },
      });

      if (shouldGoBack) {
        window.history.forward();
      } else {
        window.history.back();
      }
    };

    document.addEventListener('click', handleAnchorClickCapture, true);
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', handleAnchorClickCapture, true);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [navigator, when]);

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
    }),
    [blockedTransition, proceed, reset]
  );
};

export default useBrowserRouterBlocker;
