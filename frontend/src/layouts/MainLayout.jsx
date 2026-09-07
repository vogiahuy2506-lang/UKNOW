import { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/layout/admin/Sidebar';
import Header from '../components/layout/admin/Header';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { HiOutlineSparkles } from 'react-icons/hi';
import useIsMobile from '../hooks/useIsMobile';
import AiChatbot from '../features/ai/AiChatbot';
import { useI18n } from '../i18n';
import { useAuthStore } from '../stores/authStore';
import CreditWarningBanner from '../components/layout/CreditWarningBanner';
import ChangePasswordModal from '../features/auth/components/ChangePasswordModal';
import PhoneRequiredModal from '../features/auth/components/PhoneRequiredModal';
import TrialWelcomeModal from '../features/auth/components/TrialWelcomeModal';
import { trialWelcomeKey } from '../stores/authStore';

const SIDEBAR_WIDTH_COLLAPSED = 44; // icon-only desktop width
const SIDEBAR_WIDTH_EXPANDED = 220; // expanded desktop width
const SIDEBAR_GAP = 6; // gap between sidebar and main content
const HEADER_HEIGHT = 44; // topbar height — matches h-[44px] in Header.jsx

const MainLayout = () => {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const mustChangePassword = user?.mustChangePassword === true;
  // Đổi mật khẩu trước, xong mới tới SĐT — hai cổng cùng đóng là chuyện có thật
  // (nhân viên được mời, hoặc admin reset mật khẩu, đều có thể chưa có SĐT).
  // role !== 'admin': khớp isSuperAdmin() bên backend (requirePhone bypass superadmin) —
  // thiếu điều kiện này thì superadmin cũng dính modal không đóng được dù server không chặn họ.
  // Xem PLAN_SDT_BAT_BUOC_SYNC_SHEET_2026-09-02.md mục 1.4 và 1.6.
  // Nhắc, KHÔNG chặn (đổi 04/09/2026). `phonePrompted` cố ý là state trong bộ nhớ —
  // KHÔNG lưu localStorage — để bấm "Để sau" chỉ tắt trong phiên xem hiện tại, còn lần
  // vào /app sau vẫn được nhắc lại. Đây là yêu cầu của sếp, không phải thiếu sót.
  const [phoneDismissed, setPhoneDismissed] = useState(false);
  const phoneRequired = !mustChangePassword && !user?.phone && user?.role !== 'admin' && !phoneDismissed;
  const [sidebarOpen, setSidebarOpen] = useLocalStorageState('founder_ai_sidebar_open', false); // default icon-only
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useLocalStorageState('founder_ai_ai_panel_open', false);
  const [aiPanelWidth, setAiPanelWidth] = useLocalStorageState('founder_ai_chatbot_width', 420);
  const [isPanelResizing, setIsPanelResizing] = useState(false);
  const location = useLocation();
  const mainContentRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const isMobile = useIsMobile();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const activeContext = useAuthStore((state) => state.activeContext);
  const fetchAiCredits = useAuthStore((state) => state.fetchAiCredits);
  const [trial, setTrial] = useState(null);

  useEffect(() => {
    if (!user?.id) {
      setTrial(null);
      return;
    }
    try {
      const stored = localStorage.getItem(trialWelcomeKey(user.id));
      setTrial(stored ? JSON.parse(stored) : null);
    } catch {
      setTrial(null);
    }
  }, [user?.id]);

  const handleCloseTrialWelcome = () => {
    if (user?.id) {
      try {
        localStorage.removeItem(trialWelcomeKey(user.id));
      } catch {
        // ignore
      }
    }
    setTrial(null);
  };

  const isFullLayout =
    location.pathname.startsWith('/campaigns') &&
    (location.pathname.endsWith('/new') || location.pathname.includes('/builder'));

  const isInboxPage = location.pathname.includes('/settings/inbox');
  const isChatbotStudio = location.pathname.includes('/chatbot-studio');
  const isAiHomePage = location.pathname === '/app' || location.pathname === '/app/';
  // Gemini Canvas landing-page editor: dashboard chrome vẫn hiện, nhưng AI panel phải ẩn
  // để nhường chỗ cho chat panel riêng của canvas.
  const isLandingCanvas = /^\/app\/settings\/landing-pages\/(new|\d+\/edit)$/.test(
    location.pathname
  );
  const showAiSidePanel = aiPanelOpen && !isAiHomePage && !isLandingCanvas;

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchAiCredits().catch(() => {});
  }, [activeContext?.ownerId, activeContext?.type, fetchAiCredits, isAuthenticated]);

  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  // Link "Hỏi trợ lý về mục này" → open AI panel
  useEffect(() => {
    const askSlug = new URLSearchParams(location.search).get('ask');
    if (askSlug) setAiPanelOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Quay lại từ modal chỉnh sửa template/landing page → mở lại panel trợ lý
  useEffect(() => {
    if (location.state?.openAiAssistant && !isAiHomePage) {
      setAiPanelOpen(true);
    }
  }, [location.state, isAiHomePage, setAiPanelOpen]);

  // Trang Trợ lý AI đã có chat full-screen
  useEffect(() => {
    if (isAiHomePage && aiPanelOpen) setAiPanelOpen(false);
  }, [isAiHomePage, aiPanelOpen, setAiPanelOpen]);

  // Scroll persistence per route
  useEffect(() => {
    const el = mainContentRef.current;
    if (!el || isFullLayout || isInboxPage) return;

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
          localStorage.setItem(storageKey, JSON.stringify({ scrollTop: el.scrollTop, scrollLeft: el.scrollLeft }));
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
  }, [location.pathname, isFullLayout, isInboxPage]);

  // Dispatch resize after CSS transition so Recharts/ResizeObserver re-measure
  useEffect(() => {
    const tid = setTimeout(() => window.dispatchEvent(new Event('resize')), 310);
    return () => clearTimeout(tid);
  }, [showAiSidePanel]);

  const isBuilderPage = isFullLayout;
  const isSpecialPage = isFullLayout || isInboxPage || isAiHomePage || isChatbotStudio;

  // Persist sidebar width for full-screen editors
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', `${sidebarOpen ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED}px`);
  }, [sidebarOpen]);

  // Mobile layout
  if (isMobile) {
    const mobileContentClass = isSpecialPage && !isChatbotStudio
      ? 'h-full overflow-hidden'
      : 'overflow-auto';

    return (
      <div className="h-screen overflow-hidden bg-gray-50 flex flex-col">
        <Header onToggleSidebar={() => setMobileDrawerOpen(true)} />

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
          onToggle={() => setMobileDrawerOpen(!mobileDrawerOpen)}
        />

        <div className="flex-1 min-h-0 min-w-0 flex flex-col" style={{ paddingTop: HEADER_HEIGHT }}>
          {!isSpecialPage && <CreditWarningBanner />}
          <main ref={mainContentRef} className={`flex-1 min-h-0 min-w-0 relative ${mobileContentClass} ${isSpecialPage ? '' : 'p-4'}`}>
            <div className="relative h-full flex flex-col min-h-0">
              <Outlet />
            </div>
          </main>
        </div>

        <ChangePasswordModal
          isOpen={mustChangePassword}
          forced
          onClose={() => {}}
          onChanged={() => updateUser({ ...user, mustChangePassword: false })}
        />

        <PhoneRequiredModal
          isOpen={phoneRequired}
          onClose={() => setPhoneDismissed(true)}
          onChanged={(phone) => updateUser({ ...user, phone })}
        />

        <TrialWelcomeModal
          isOpen={Boolean(trial)}
          trial={trial}
          onClose={handleCloseTrialWelcome}
        />

        {!isAiHomePage && !isChatbotStudio && !isLandingCanvas && (
          <AiChatbot isOpen={aiPanelOpen} onToggle={() => setAiPanelOpen(false)} />
        )}

        {!aiPanelOpen && !isAiHomePage && !isChatbotStudio && !isLandingCanvas && (
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

  // Desktop layout
  return (
    <div className="h-screen overflow-hidden bg-[#f9fafb] flex flex-col" style={{ zoom: 1 }}>
      {/* Topbar: full-width, fixed top */}
      <div
        className="fixed top-0 left-0 right-0 z-40 bg-white flex items-center transition-all duration-300"
        style={{
          height: HEADER_HEIGHT,
          paddingRight: showAiSidePanel && !isMobile ? aiPanelWidth : 0,
        }}
      >
        <Header />
      </div>

      {/* Sidebar: starts below topbar */}
      <Sidebar
        isOpen={sidebarOpen}
        width={sidebarOpen ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        topOffset={HEADER_HEIGHT}
      />

      <div
        className={`flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden${!isPanelResizing ? ' transition-all duration-300' : ''}`}
        style={{
          marginLeft: sidebarOpen ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED,
          marginRight: showAiSidePanel && !isMobile ? aiPanelWidth : 0,
          padding: `${HEADER_HEIGHT + 6}px 6px 6px ${SIDEBAR_GAP}px`,
        }}
      >
        {!isBuilderPage && <CreditWarningBanner />}

        <main
          ref={mainContentRef}
          className={`flex-1 min-w-0 overflow-auto bg-white rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.04)] border border-gray-200/70 relative ${isSpecialPage ? '' : 'p-2 md:p-3'}`}
        >
          <div className="relative h-full flex flex-col min-h-0">
            <Outlet />
          </div>
        </main>
      </div>

      {/* AI Side Panel */}
      {!isAiHomePage && !isLandingCanvas && (
        <AiChatbot
          isOpen={aiPanelOpen}
          onToggle={() => setAiPanelOpen(false)}
          panelWidth={aiPanelWidth}
          onWidthChange={setAiPanelWidth}
          onResizeStart={() => setIsPanelResizing(true)}
          onResizeEnd={() => { setIsPanelResizing(false); window.dispatchEvent(new Event('resize')); }}
        />
      )}

      {/* AI Toggle Bar (Desktop) */}
      {!aiPanelOpen && !isChatbotStudio && !isAiHomePage && !isLandingCanvas && (
        <div className="fixed top-0 right-0 h-full w-1 z-50 group cursor-pointer"
          onClick={() => setAiPanelOpen(true)}
          title={t('mainLayout.openAIAssistant')}
        >
          <div className="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-24 bg-white border border-slate-200 border-r-0 rounded-l-2xl shadow-xl flex flex-col items-center justify-center gap-2 text-slate-400 group-hover:text-orange-500 group-hover:w-10 group-hover:border-orange-200 transition-all overflow-hidden">
            <HiOutlineSparkles className="w-5 h-5" />
            <div className="w-1 h-1 bg-orange-500 rounded-full"></div>
          </div>
        </div>
      )}

      <ChangePasswordModal
        isOpen={mustChangePassword}
        forced
        onClose={() => {}}
        onChanged={() => updateUser({ ...user, mustChangePassword: false })}
      />

      <PhoneRequiredModal
        isOpen={phoneRequired}
        onClose={() => setPhoneDismissed(true)}
        onChanged={(phone) => updateUser({ ...user, phone })}
      />

      <TrialWelcomeModal
        isOpen={Boolean(trial)}
        trial={trial}
        onClose={handleCloseTrialWelcome}
      />
    </div>
  );
};

export default MainLayout;
