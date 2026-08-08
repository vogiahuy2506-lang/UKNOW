import { useState, useEffect } from 'react';

const TABLET_BREAKPOINT = 1024;

/**
 * Detects whether the current viewport is mobile-sized.
 *
 * Returns true when window.innerWidth < 1024px.
 * Updates automatically on window resize.
 *
 * @returns {boolean} true if viewport is mobile width
 */
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < TABLET_BREAKPOINT);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < TABLET_BREAKPOINT);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
};

export default useIsMobile;
