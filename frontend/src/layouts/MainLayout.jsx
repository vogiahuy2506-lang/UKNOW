import { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/layout/admin/Sidebar';
import Header from '../components/layout/admin/Header';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { HiOutlineSparkles } from 'react-icons/hi';
import useIsMobile from '../hooks/useIsMobile';
import AiChatbot from '../features/ai/AiChatbot';
import { useI18n } from '../i18n';

const MainLayout = () => {
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useLocalStorageState('founder_ai_sidebar_open', true);
  const [sidebarWidth, setSidebarWidth] = useLocalStorageState('founder_ai_sidebar_width', 256);
  const [isResizing, setIsResizing] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useLocalStorageState('founder_ai_ai_panel_open', false);
  const [aiPanelWidth, setAiPanelWidth] = useLocalStorageState('founder_ai_chatbot_width', 420);
  const [isPanelResizing, setIsPanelResizing] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(256);
  const location = useLocation();
  const mainContentRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const isMobile = useIsMobile();

  const isFullLayout =
    location.pathname.startsWith('/campaigns') &&
    (location.pathname.endsWith('/new') || location.pathname.includes('/builder'));

  const isChatbotStudio = location.pathname.includes('/chatbot-studio');

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
  }, [isResizing, setSidebarWidth]);

  const handleResizeStart = (event) => {
    setIsResizing(true);
    dragStartXRef.current = event.clientX;
    dragStartWidthRef.current = sidebarWidth;
  };

  // Persist scroll position per route in main content area
  useEffect(() => {
    const el = mainContentRef.current;
    if (!el || isFullLayout) return;

    const storageKey = `founder_ai_scroll_${location.pathname}`;

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

  // Dispatch resize after the 300ms CSS transition so Recharts/ResizeObserver-based
  // components (charts, etc.) re-measure at the correct content width.
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 310);
    return () => clearTimeout(t);
  }, [aiPanelOpen]);

  const effectiveSidebarWidth = sidebarOpen ? sidebarWidth : 80;
  const desktopMainClassName = isFullLayout
    ? 'flex-1 min-h-0 overflow-hidden p-0'
    : 'flex-1 min-h-0 p-6 overflow-auto';

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', `${effectiveSidebarWidth}px`);
  }, [effectiveSidebarWidth]);

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
        <AiChatbot isOpen={aiPanelOpen} onToggle={() => setAiPanelOpen(false)} />
        
        {/* AI Toggle Trigger (Mobile) */}
        {!aiPanelOpen && (
          <button 
            onClick={() => setAiPanelOpen(true)}
            className="fixed bottom-6 right-6 w-14 h-14 bg-orange-500 text-white rounded-full shadow-2xl z-30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
          >
            <HiOutlineSparkles className="w-7 h-7" />
          </button>
        )}
      </div>
    );
  }

  // Desktop layout — unchanged behavior
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
          title={t('mainLayout.dragToResize')}
        >
          <div className="mx-auto h-full w-px bg-gray-200" />
        </div>
      )}

      <div
        className={`flex-1 min-w-0 flex flex-col${!isPanelResizing ? ' transition-all duration-300' : ''}${aiPanelOpen && !isMobile ? ' ai-panel-open' : ''}`}
        style={{
          marginLeft: `${effectiveSidebarWidth}px`,
          marginRight: aiPanelOpen && !isMobile ? `${aiPanelWidth}px` : '0px',
        }}
      >
        <main ref={mainContentRef} className={desktopMainClassName}>
          <Outlet />
        </main>
      </div>

      {/* AI Side Panel */}
      <AiChatbot
        isOpen={aiPanelOpen}
        onToggle={() => setAiPanelOpen(false)}
        panelWidth={aiPanelWidth}
        onWidthChange={setAiPanelWidth}
        onResizeStart={() => setIsPanelResizing(true)}
        onResizeEnd={() => { setIsPanelResizing(false); window.dispatchEvent(new Event('resize')); }}
      />

      {/* AI Toggle Bar (Desktop) — hidden on chatbot studio (has its own 3-column layout) */}
      {!aiPanelOpen && !isChatbotStudio && (
        <div className="fixed top-0 right-0 h-full w-1 z-50 group">
          <button 
            onClick={() => setAiPanelOpen(true)}
            className="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-24 bg-white border border-slate-200 border-r-0 rounded-l-2xl shadow-xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-orange-500 hover:w-10 transition-all group-hover:border-orange-200"
            title={t('mainLayout.openAIAssistant')}
          >
            <HiOutlineSparkles className="w-5 h-5" />
            <div className="w-1 h-1 bg-orange-500 rounded-full"></div>
          </button>
        </div>
      )}
    </div>
  );
};

export default MainLayout;
