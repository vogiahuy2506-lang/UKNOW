import { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/layout/admin/Sidebar';
import Header from '../components/layout/admin/Header';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import useIsMobile from '../hooks/useIsMobile';

const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useLocalStorageState('uknow_sidebar_open', true);
  const [sidebarWidth, setSidebarWidth] = useLocalStorageState('uknow_sidebar_width', 256);
  const [isResizing, setIsResizing] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(256);
  const location = useLocation();
  const mainContentRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const isMobile = useIsMobile();

  const isFullLayout =
    location.pathname.startsWith('/campaigns') &&
    (location.pathname.endsWith('/new') || location.pathname.includes('/builder'));

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (event) => {
      const delta = event.clientX - dragStartXRef.current;
      const nextWidth = Math.min(420, Math.max(200, dragStartWidthRef.current + delta));
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleResizeStart = (event) => {
    setIsResizing(true);
    dragStartXRef.current = event.clientX;
    dragStartWidthRef.current = sidebarWidth;
  };

  // Persist scroll position per route in main content area
  useEffect(() => {
    const el = mainContentRef.current;
    if (!el || isFullLayout) return;

    const storageKey = `uknow_scroll_${location.pathname}`;

    const rafId = requestAnimationFrame(() => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const { scrollTop = 0, scrollLeft = 0 } = JSON.parse(stored);
          el.scrollTop = scrollTop;
          el.scrollLeft = scrollLeft;
        } else {
          el.scrollTop = 0;
        }
      } catch {
        // ignore
      }
    });

    const handleScroll = () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify({ scrollTop: el.scrollTop, scrollLeft: el.scrollLeft })
          );
        } catch {
          // ignore
        }
      }, 150);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener('scroll', handleScroll);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [location.pathname, isFullLayout]);

  if (isMobile) {
    const mainClassName = isFullLayout
      ? 'flex-1 min-h-0 overflow-hidden p-0'
      : 'flex-1 min-h-0 p-4 overflow-auto';

    return (
      <div className="h-screen overflow-hidden bg-gray-50 flex flex-col">
        {/* Fixed mobile top header */}
        <Header onToggleSidebar={() => setMobileDrawerOpen(true)} />

        {/* Sidebar drawer + backdrop */}
        {mobileDrawerOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 transition-opacity duration-300"
            onClick={() => setMobileDrawerOpen(false)}
            aria-hidden="true"
          />
        )}
        <Sidebar
          isOpen={mobileDrawerOpen}
          width={280}
          isMobile
          onClose={() => setMobileDrawerOpen(false)}
        />

        {/* Main content — offset by header height (64px) */}
        <div className="flex-1 min-w-0 flex flex-col mt-16 min-h-0">
          <main ref={mainContentRef} className={mainClassName}>
            <Outlet />
          </main>
        </div>
      </div>
    );
  }

  // Desktop layout — unchanged behavior
  const effectiveSidebarWidth = sidebarOpen ? sidebarWidth : 80;
  const mainClassName = isFullLayout
    ? 'flex-1 min-h-0 overflow-hidden p-0'
    : 'flex-1 min-h-0 p-6 overflow-auto';

  return (
    <div className="h-screen overflow-hidden bg-gray-50 flex" style={{ zoom: 1 }}>
      <Sidebar
        isOpen={sidebarOpen}
        width={effectiveSidebarWidth}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {sidebarOpen && (
        <div
          className={`fixed top-0 h-full cursor-col-resize transition-colors ${isResizing ? 'bg-primary-100' : 'hover:bg-primary-50'
            }`}
          style={{ left: `${effectiveSidebarWidth - 3}px`, width: '6px' }}
          onMouseDown={handleResizeStart}
          role="separator"
          aria-orientation="vertical"
          title="Kéo để thay đổi kích thước"
        >
          <div className="mx-auto h-full w-px bg-gray-200" />
        </div>
      )}

      <div
        className="flex-1 min-w-0 flex flex-col transition-all duration-300"
        style={{ marginLeft: `${effectiveSidebarWidth}px` }}
      >
        <main ref={mainContentRef} className={mainClassName}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
