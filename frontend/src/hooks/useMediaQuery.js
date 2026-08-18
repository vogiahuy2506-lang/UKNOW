import { useEffect, useState } from 'react';

/**
 * Hook theo dõi media query trong browser.
 * Mặc định trả về `false` khi chạy SSR (không có window).
 *
 * @param {string} query - CSS media query, ví dụ '(max-width: 767.99px)'
 * @returns {boolean}
 */
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const list = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(list.matches);
    if (list.addEventListener) {
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    }
    // Safari fallback
    list.addListener(onChange);
    return () => list.removeListener(onChange);
  }, [query]);

  return matches;
}
