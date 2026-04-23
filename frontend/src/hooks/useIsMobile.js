import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * Detects whether the current viewport is mobile-sized.
 *
 * Returns true when window.innerWidth < 768px (Tailwind `md` breakpoint).
 * Updates automatically on window resize.
 *
 * @returns {boolean} true if viewport is mobile width
 */
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
};

export default useIsMobile;
