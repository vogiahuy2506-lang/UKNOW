import { useEffect, useRef, useCallback } from 'react';

/**
 * Persists and restores the scroll position of a DOM element.
 *
 * @param {string} key    - localStorage key
 * @param {React.RefObject} ref - ref attached to the scrollable element
 * @param {number} [throttleMs=150] - debounce delay in ms
 */
export function useScrollPersistence(key, ref, throttleMs = 150) {
  const timerRef = useRef(null);

  const save = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ scrollTop: el.scrollTop, scrollLeft: el.scrollLeft })
      );
    } catch {
      // ignore
    }
  }, [key, ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Restore on mount (defer one frame so content is laid out)
    requestAnimationFrame(() => {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const { scrollTop = 0, scrollLeft = 0 } = JSON.parse(stored);
          el.scrollTop = scrollTop;
          el.scrollLeft = scrollLeft;
        }
      } catch {
        // ignore
      }
    });

    const handleScroll = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(save, throttleMs);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [key, ref, save, throttleMs]);
}
