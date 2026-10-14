import { Suspense, useState, useEffect, useRef } from 'react';
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
import TopupExpiringBanner from '../components/layout/TopupExpiringBanner';
import WorkspaceInviteBanner from '../components/layout/WorkspaceInviteBanner';
import WorkspaceInviteAcceptBanner from '../components/layout/WorkspaceInviteAcceptBanner';
import { useRefreshUserOnFocus } from '../hooks/useRefreshUserOnFocus';
import { usePostAuthGates } from '../features/auth/hooks/usePostAuthGates';
import TrialWelcomeModal from '../features/auth/components/TrialWelcomeModal';
import PlanExpiryModal from '../features/auth/components/PlanExpiryModal';
import { trialWelcomeKey } from '../stores/authStore';
import { shouldWarnPlanExpiry } from '../utils/subscriptionStatus.util';
import { planExpiryDismissKey } from '../utils/billingProfile.util';
import { isPathExcludedFromPlanLock } from '../utils/planLock.util';
import { usePlanLockToastGuard } from '../features/auth/hooks/usePlanLockToastGuard';

const SIDEBAR_WIDTH_COLLAPSED = 44; // icon-only desktop width
const SIDEBAR_WIDTH_EXPANDED = 220; // expanded desktop width
const SIDEBAR_GAP = 6; // gap between sidebar and main content
const HEADER_HEIGHT = 44; // topbar height — matches h-[44px] in Header.jsx

// Trang con được tải lười (lazy trong App.jsx): chờ ngay trong khung, giữ nguyên sidebar/header.
const MainContentFallback = () => (
  <div className="flex-1 flex items-center justify-center py-16">
    <div className="spinner w-8 h-8" />
  </div>
);

/**
 * @param {object} props
 * @param {React.ReactNode} [props.children] Nội dung lồng trực tiếp thay cho `<Outlet />` — dùng khi
 *   một layout KHÁC cần chạy bên trong khung app (vd trung tâm hướng dẫn `/huong-dan`, xem
 *   `HelpDocsRoute.jsx`). Bỏ trống thì hoạt động như cũ: render route con qua `<Outlet />`.
 */
const MainLayout = ({ children = null }) => {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const { anyGateOpen } = usePostAuthGates();
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
  // Quay lại tab thì làm mới hồ sơ: nhân viên nhận quyền/lời mời mới mà không cần F5 (PLAN_NHAN_VIEN mục 5.3).
  useRefreshUserOnFocus({ enabled: isAuthenticated && user?.role !== 'admin' });
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

  // Modal cảnh báo sắp hết hạn / đã hết hạn gói (PR-1 — mục 3)
  const billingStatus = useAuthStore((state) => state.billingStatus);
  const [expiryDismissed, setExpiryDismissed] = useState(() => {
    if (!user?.id) return false;
    try {
      return sessionStorage.getItem(planExpiryDismissKey(user.id)) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!user?.id) {
      setExpiryDismissed(false);
      return;
    }
    try {
      setExpiryDismissed(sessionStorage.getItem(planExpiryDismissKey(user.id)) === 'true');
    } catch {
      setExpiryDismissed(false);
    }
  }, [user?.id]);

  const handleClosePlanExpiry = () => {
    if (user?.id) {
      try {
        sessionStorage.setItem(planExpiryDismissKey(user.id), 'true');
      } catch {
        // ignore
      }
    }
    setExpiryDismissed(true);
  };

  // Cổng khoá gói hết hạn (PLAN_CONG_KHOA_GOI_HET_HAN_2026-10-11): server đã chặn thật (403 PLAN_EXPIRED /
  // NO_ACTIVE_PLAN) nên modal KHÔNG đóng được và KHÔNG phụ thuộc "Để sau" của cảnh báo cũ. Áp cho cả nhân
  // viên (họ cũng bị 403 vì gói của chủ). `billingStatus` null (chưa nạp hồ sơ) chỉ khoá khi server đã báo mã.
  const planLockedCode = useAuthStore((state) => state.planLockedCode);
  const planLocked =
    !anyGateOpen && !trial
    && user?.role !== 'admin'
    && Boolean(billingStatus?.isFullyExpired || billingStatus?.planRevokedAfterExpiry || planLockedCode);
  const planLockModalOpen = planLocked && !isPathExcludedFromPlanLock(location.pathname);
  // Toast lỗi chung của trang nổi trên modal (Toaster zIndex 999999) → dẹp trong lúc modal khoá mở.
  usePlanLockToastGuard(planLockModalOpen);

  // Cảnh báo đóng được (ân hạn / sắp hết hạn) — chỉ khi KHÔNG khoá.
  const planExpiryWarning =
    !anyGateOpen && !trial
    && !planLocked
    && activeContext?.type === 'self'
    && user?.role !== 'admin'
    && shouldWarnPlanExpiry(billingStatus)
    && !expiryDismissed;

  // Trình dựng chiến dịch là "full-screen editor": không padding quanh canvas, không banner credit,
  // không ghi nhớ scroll của <main>. Từ commit đầu (e24f6725) route đã nằm dưới `/app` nhưng phép
  // so vẫn là `startsWith('/campaigns')` → cờ này chưa bao giờ true; sửa 13/09/2026 (dọn nợ sau
  // PLAN_GOP_TRANG_CHIEN_DICH_MOT_MUC_2026-09-12).
  const isFullLayout =
    location.pathname.startsWith('/app/campaigns/') &&
    (location.pathname.endsWith('/new') || location.pathname.includes('/builder'));

  const isInboxPage = location.pathname.includes('/settings/inbox');
  const isChatbotStudio = location.pathname.includes('/chatbot-studio');
  const isAiHomePage = location.pathname === '/app' || location.pathname === '/app/';
  // Gemini Canvas landing-page editor: dashboard chrome vẫn hiện, nhưng AI panel phải ẩn
  // để nhường chỗ cho chat panel riêng của canvas.
  const isLandingCanvas = /^\/app\/settings\/landing-pages\/(new|\d+\/edit)$/.test(
    location.pathname
  );
  // 11/10/2026: trang SOẠN của quản trị dùng khung editor tràn màn (components/editor/AdminEditorShell) giống canvas landing.
  const isAdminEditor = /^\/admin\/(landing-customizer|welcome-email|notification-center)\/?$/.test(location.pathname);
  // 11/10/2026: trình soạn Biểu mẫu (tạo mới / sửa) cũng là trang soạn tràn màn: danh sách trường bên trái, xem trước cố định
  // bên phải, Cài đặt là modal (features/forms/pages/FormEditorPage.jsx) — không đệm, không bo góc, không banner credit.
  const isFormEditor = /^\/app\/forms\/(new|[^/]+\/edit)\/?$/.test(location.pathname);
  // 14/10/2026: Trung tâm chiến dịch (/admin/notification-center) chỉ ẩn header khi ở tab "Soạn mẫu" (tab=templates).
  const [ncMode, setNcMode] = useState('history');
  useEffect(() => {
    const handler = (e) => {
      if (typeof e?.detail === 'string') setNcMode(e.detail);
    };
    window.addEventListener('notification-center:mode-change', handler);
    return () => window.removeEventListener('notification-center:mode-change', handler);
  }, []);

  useEffect(() => {
    setNcMode('history');
  }, [location.pathname]);

  const isNotificationCenterTemplates =
    location.pathname.startsWith('/admin/notification-center') &&
    (ncMode === 'templates' || new URLSearchParams(location.search).get('tab') === 'templates');
  // Trang soạn bài viết hướng dẫn (/admin/help-articles/new, /admin/help-articles/:id): giấu sidebar để tối đa không gian cho 2 cột soạn + xem trước
  const isHelpArticleEditor = /^\/admin\/help-articles\/[^/]+$/.test(location.pathname);

  // Các trang soạn tràn màn: ẩn Header toàn cục, kéo topbar lên sát đỉnh
  // - Landing Canvas
  // - Form Editor (/app/forms/new, /app/forms/:id/edit)
  // - Trang soạn quản trị: Tuỳ chỉnh landing, Email chào mừng, hoặc Trung tâm thông báo khi ở tab Soạn mẫu
  const shouldHideHeader =
    isLandingCanvas ||
    isFormEditor ||
    (/^\/admin\/(landing-customizer|welcome-email)\/?$/.test(location.pathname)) ||
    isNotificationCenterTemplates;
  const shouldHideSidebar = isHelpArticleEditor;
  const showAiSidePanel = aiPanelOpen && !isAiHomePage && !shouldHideHeader;

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

  // Lắng nghe yêu cầu thu nhỏ sidebar từ các editor (ví dụ Landing Canvas lùi vào bên trái)
  useEffect(() => {
    const handleCollapseSidebar = () => setSidebarOpen(false);
    window.addEventListener('app:collapse-sidebar', handleCollapseSidebar);
    return () => window.removeEventListener('app:collapse-sidebar', handleCollapseSidebar);
  }, [setSidebarOpen]);

  const isBuilderPage = isFullLayout || isLandingCanvas || isFormEditor || isAdminEditor || isHelpArticleEditor;
  const isSpecialPage = isFullLayout || isInboxPage || isAiHomePage || isChatbotStudio || isLandingCanvas || isAdminEditor || isFormEditor || isHelpArticleEditor;

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
      <div className="h-screen overflow-hidden bg-gray-50 dark:bg-dk-inset flex flex-col transition-colors" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
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

        {/* Header ở nhánh mobile nằm TRONG luồng (không fixed như desktop) → không cộng thêm paddingTop, nếu không dư một dải
            trống 44px phía trên mọi trang (đo 11/10/2026: nội dung bắt đầu ở top=88 thay vì 44). */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          {!isSpecialPage && <CreditWarningBanner />}
          {!isSpecialPage && <TopupExpiringBanner />}
          {!isSpecialPage && <WorkspaceInviteAcceptBanner />}
          {!isSpecialPage && <WorkspaceInviteBanner />}
          <main ref={mainContentRef} className={`flex-1 min-h-0 min-w-0 relative ${mobileContentClass} ${isSpecialPage ? '' : 'p-4'}`}>
            <div className="relative h-full flex flex-col min-h-0">
              <Suspense fallback={<MainContentFallback />}>{children ?? <Outlet />}</Suspense>
            </div>
          </main>
        </div>

        <TrialWelcomeModal
          isOpen={Boolean(trial)}
          trial={trial}
          onClose={handleCloseTrialWelcome}
        />

        <PlanExpiryModal
          isOpen={Boolean(planExpiryWarning) || planLockModalOpen}
          billingStatus={billingStatus}
          onClose={handleClosePlanExpiry}
          locked={planLockModalOpen}
          isEmployee={activeContext?.type === 'employee'}
        />

        {!isAiHomePage && !isChatbotStudio && !shouldHideHeader && (
          <AiChatbot isOpen={aiPanelOpen} onToggle={() => setAiPanelOpen(false)} />
        )}

        {!aiPanelOpen && !isAiHomePage && !isChatbotStudio && !shouldHideHeader && (
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
    <div className="h-screen overflow-hidden bg-[#f9fafb] dark:bg-dk-inset flex flex-col transition-colors" style={{ zoom: 1 }}>
      {/* Topbar: full-width, fixed top (ẩn khi ở Studio Landing Canvas hoặc trang soạn mẫu quản trị để giải phóng không gian dọc) */}
      {!shouldHideHeader && (
        <div
          className="fixed top-0 left-0 right-0 z-40 bg-white dark:bg-dk-bg flex items-center border-b border-gray-200/80 dark:border-dk-border/80 transition-all duration-300"
          style={{
            height: HEADER_HEIGHT,
            paddingRight: showAiSidePanel && !isMobile ? aiPanelWidth : 0,
          }}
        >
          <Header />
        </div>
      )}

      {/* Sidebar: starts below topbar (hoặc top 0 khi ở Landing Canvas / Admin Editor; ẩn khi ở Help Article Editor) */}
      {!shouldHideSidebar && (
        <Sidebar
          isOpen={sidebarOpen}
          width={sidebarOpen ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          topOffset={shouldHideHeader ? 0 : HEADER_HEIGHT}
        />
      )}

      <div
        className={`flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden${!isPanelResizing ? ' transition-all duration-300' : ''}`}
        style={{
          marginLeft: shouldHideSidebar
            ? 0
            : (sidebarOpen ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED),
          marginRight: showAiSidePanel && !isMobile ? aiPanelWidth : 0,
          padding: shouldHideHeader
            ? 0
            : (isAdminEditor
                ? `${HEADER_HEIGHT}px 0 0 0`
                : (shouldHideSidebar
                    ? `${HEADER_HEIGHT + 6}px 6px 6px 6px`
                    : `${HEADER_HEIGHT + 6}px 6px 6px ${SIDEBAR_GAP}px`)),
        }}
      >
        {!isBuilderPage && <CreditWarningBanner />}
        {!isBuilderPage && <TopupExpiringBanner />}
        {!isBuilderPage && <WorkspaceInviteAcceptBanner />}
        {!isBuilderPage && <WorkspaceInviteBanner />}

        <main
          ref={mainContentRef}
          className={`flex-1 min-w-0 overflow-auto bg-white dark:bg-dk-inset ${
            isLandingCanvas || isAdminEditor || isFormEditor ? 'rounded-none border-0 shadow-none' : 'rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.04)] border border-gray-200/70 dark:border-dk-border/80 text-slate-900 dark:text-dk-text'
          } relative ${isSpecialPage ? '' : 'p-2 md:p-3'}`}
        >
          <div className="relative h-full flex flex-col min-h-0">
            <Suspense fallback={<MainContentFallback />}>{children ?? <Outlet />}</Suspense>
          </div>
        </main>
      </div>

      {/* AI Side Panel */}
      {!isAiHomePage && !shouldHideHeader && (
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
      {!aiPanelOpen && !isChatbotStudio && !isAiHomePage && !shouldHideHeader && (
        <div className="fixed top-0 right-0 h-full w-1 z-50 group cursor-pointer"
          onClick={() => setAiPanelOpen(true)}
          title={t('mainLayout.openAIAssistant')}
        >
          <div className="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-24 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border border-r-0 rounded-l-2xl shadow-xl flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-dk-muted group-hover:text-orange-500 group-hover:w-10 group-hover:border-orange-200 dark:group-hover:border-orange-500/40 transition-all overflow-hidden">
            <HiOutlineSparkles className="w-5 h-5" />
            <div className="w-1 h-1 bg-orange-500 rounded-full"></div>
          </div>
        </div>
      )}

      <TrialWelcomeModal
        isOpen={Boolean(trial)}
        trial={trial}
        onClose={handleCloseTrialWelcome}
      />

      <PlanExpiryModal
        isOpen={Boolean(planExpiryWarning) || planLockModalOpen}
        billingStatus={billingStatus}
        onClose={handleClosePlanExpiry}
        locked={planLockModalOpen}
        isEmployee={activeContext?.type === 'employee'}
      />
    </div>
  );
};

export default MainLayout;
