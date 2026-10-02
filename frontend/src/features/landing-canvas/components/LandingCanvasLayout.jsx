import { useCallback, useEffect, useRef, useState } from 'react';
import { HiOutlineSparkles } from 'react-icons/hi';
import LandingCanvasTopbar from './LandingCanvasTopbar.jsx';
import CanvasPreviewArea from './CanvasPreviewArea.jsx';
import CanvasChatPanel from './CanvasChatPanel.jsx';
import useCanvasConversation from '../hooks/useCanvasConversation.js';

const DEFAULT_CHAT_WIDTH = 460;
const MIN_CHAT_WIDTH = 340;
const MAX_CHAT_WIDTH_RATIO = 0.65;

/**
 * Layout 2-panel bên trong main area của MainLayout:
 *
 * 1. Khi mới bắt đầu tạo trang (chưa có htmlContent và chưa có tin nhắn chat):
 *    - Khung Chat Studio AI hiển thị ở GIỮA trang rộng rãi, thoáng đãng.
 * 2. Khi người dùng nhập lệnh Enter / chọn gợi ý / dán HTML:
 *    - Khung chat lùi về bên trái (aside), mở preview area bên phải.
 *    - Tự động thu nhỏ sidebar chính của app về icon-only để mở rộng không gian.
 *    - Cho phép kéo thanh resizer giữa aside và preview để thay đổi kích thước khung chat.
 * 3. Tối ưu không gian dọc:
 *    - Toàn bộ điều khiển Xem trước / Mã HTML, Desktop / Tablet / Mobile, Zoom và Fit-to-screen
 *      được gộp trực tiếp lên Topbar, loại bỏ thanh preview toolbar thứ hai (tiết kiệm ~56px).
 *    - Hỗ trợ chế độ "Vừa màn hình" (Fit to Screen) để xem toàn bộ landing page.
 *    - Hỗ trợ chế độ "Toàn cảnh" để xem preview tràn màn hình.
 */
export default function LandingCanvasLayout({
  form,
  setForm,
  editingId,
  saving,
  onClose,
  onSave,
  activeModalTab,
  onOpenSettingTab,
  onOpenTemplateGallery,
  onOpenVisualEditor,
  onOpenVersionHistory,
  onOpenSaveTemplate,
  onOpenImportHtml,
  previewResetKey,
  chatPanel,
  previewPanel,
}) {
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const chatPanelRef = useRef(null);
  const containerRef = useRef(null);

  // Điều khiển chế độ xem trước (Gộp lên Topbar)
  const [previewMode, setPreviewMode] = useState('view'); // 'view' | 'code'
  const [viewport, setViewport] = useState('desktop'); // 'desktop' | 'tablet' | 'mobile'
  const [zoom, setZoom] = useState(1);
  const [isFitToScreen, setIsFitToScreen] = useState(false);
  const [fitPercent, setFitPercent] = useState(null);

  // Kích thước khung chat (lưu localStorage, mặc định 460px)
  const [chatWidth, setChatWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('founder_ai_landing_canvas_chat_width');
      const parsed = saved ? parseInt(saved, 10) : DEFAULT_CHAT_WIDTH;
      return Number.isFinite(parsed) && parsed >= MIN_CHAT_WIDTH ? parsed : DEFAULT_CHAT_WIDTH;
    } catch {
      return DEFAULT_CHAT_WIDTH;
    }
  });

  const [isResizing, setIsResizing] = useState(false);
  const chatWidthRef = useRef(chatWidth);
  chatWidthRef.current = chatWidth;

  const handleToggleChat = useCallback(() => {
    setChatCollapsed((cur) => !cur);
  }, []);

  const handleFocusChat = useCallback(() => {
    setChatCollapsed(false);
    requestAnimationFrame(() => chatPanelRef.current?.focus());
  }, []);

  /**
   * openTab: yêu cầu SettingsModal mở 1 tab cụ thể.
   */
  const openTab = useCallback(
    (tab) => {
      window.dispatchEvent(new CustomEvent('landing-canvas:change-setting-tab', { detail: tab }));
      if (activeModalTab) {
        onOpenSettingTab?.(tab);
      }
    },
    [activeModalTab, onOpenSettingTab]
  );

  // Khởi tạo conversation ở Layout để state không bị reset khi chuyển từ centered sang docked
  const hasExistingHtml = Boolean(String(form?.htmlContent || '').trim());
  const conversation = useCanvasConversation({
    form,
    setForm,
    hasExistingHtml,
    openTab,
    editingId,
  });

  // Khi chưa có HTML và chưa có tin nhắn hay streaming AI -> Hiển thị khung chat ở giữa
  const hasChatActivity = (conversation?.messages?.length ?? 0) > 0 || conversation?.isStreaming;
  const isCentered = !hasExistingHtml && !hasChatActivity;

  // Khi lùi vào bên trái -> tự động thu nhỏ sidebar chính của ứng dụng để tối đa không gian
  useEffect(() => {
    if (!isCentered) {
      window.dispatchEvent(new CustomEvent('app:collapse-sidebar'));
    }
  }, [isCentered]);

  // Xử lý kéo thanh resizer thay đổi độ rộng chat panel
  const handleMouseDownResize = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const rawWidth = e.clientX - rect.left;
      const maxWidth = Math.max(MIN_CHAT_WIDTH, rect.width * MAX_CHAT_WIDTH_RATIO);
      const newWidth = Math.round(Math.max(MIN_CHAT_WIDTH, Math.min(rawWidth, maxWidth)));
      chatWidthRef.current = newWidth;
      setChatWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      try {
        localStorage.setItem('founder_ai_landing_canvas_chat_width', String(chatWidthRef.current));
      } catch {}
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Nhấp đúp chuột để reset kích thước về mặc định (460px)
  const handleResetChatWidth = useCallback(() => {
    setChatWidth(DEFAULT_CHAT_WIDTH);
    chatWidthRef.current = DEFAULT_CHAT_WIDTH;
    try {
      localStorage.setItem('founder_ai_landing_canvas_chat_width', String(DEFAULT_CHAT_WIDTH));
    } catch {}
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      <LandingCanvasTopbar
        form={form}
        setForm={setForm}
        editingId={editingId}
        saving={saving}
        onClose={onClose}
        onSave={onSave}
        activeModalTab={activeModalTab}
        onOpenSettingTab={onOpenSettingTab}
        onOpenTemplateGallery={onOpenTemplateGallery}
        onOpenVisualEditor={onOpenVisualEditor}
        onOpenVersionHistory={onOpenVersionHistory}
        onOpenSaveTemplate={onOpenSaveTemplate}
        onOpenImportHtml={onOpenImportHtml}
        // Gộp cụm điều khiển Preview lên Topbar khi ở chế độ 2 cột
        showPreviewControls={!isCentered}
        previewMode={previewMode}
        onPreviewModeChange={setPreviewMode}
        viewport={viewport}
        onViewportChange={setViewport}
        zoom={zoom}
        onZoomChange={setZoom}
        isFitToScreen={isFitToScreen}
        onToggleFitToScreen={() => setIsFitToScreen((prev) => !prev)}
        fitPercent={fitPercent}
        isChatCollapsed={chatCollapsed}
        onToggleChat={handleToggleChat}
      />

      <div
        ref={containerRef}
        className={`flex-1 min-h-0 flex relative ${
          isResizing ? 'cursor-col-resize select-none' : ''
        }`}
      >
        {isCentered ? (
          /* Giao diện Studio AI ở giữa trang khi chưa có nội dung / tương tác */
          <div className="flex-1 min-h-0 overflow-y-auto bg-gradient-to-b from-gray-50/70 via-white to-orange-50/20 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
            <div className="w-full max-w-3xl my-auto py-6">
              {chatPanel ?? (
                <CanvasChatPanel
                  ref={chatPanelRef}
                  conversation={conversation}
                  form={form}
                  setForm={setForm}
                  openTab={openTab}
                  collapsed={false}
                  editingId={editingId}
                  isCentered={true}
                  onOpenImportHtml={onOpenImportHtml}
                  onOpenTemplateGallery={onOpenTemplateGallery}
                />
              )}
            </div>
          </div>
        ) : (
          /* Giao diện 2 cột chuẩn: Chat bên trái + Preview bên phải kèm thanh kéo thay đổi kích thước */
          <>
            {/* Nút dock tab mép trái khi chat panel đang thu gọn */}
            {chatCollapsed && (
              <button
                type="button"
                onClick={handleToggleChat}
                className="fixed left-0 top-16 z-30 group inline-flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-r-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs sm:text-sm font-bold shadow-lg hover:shadow-xl hover:pr-5 transition-all select-none cursor-pointer"
                title="Mở lại Trợ lý AI"
              >
                <HiOutlineSparkles className="w-4.5 h-4.5 animate-pulse" />
                <span>Mở Trợ lý AI</span>
              </button>
            )}

            {/* Chat Panel (left, resizable) */}
            <aside
              style={{ width: chatCollapsed ? 0 : `${chatWidth}px` }}
              className={`shrink-0 border-r border-gray-200 bg-white flex flex-col min-h-0 transition-[width] ${
                isResizing ? 'transition-none select-none' : 'duration-150'
              } ${chatCollapsed ? 'border-r-0 overflow-hidden' : ''}`}
            >
              {chatPanel ?? (
                <CanvasChatPanel
                  ref={chatPanelRef}
                  conversation={conversation}
                  form={form}
                  setForm={setForm}
                  openTab={openTab}
                  collapsed={chatCollapsed}
                  onToggleCollapsed={handleToggleChat}
                  editingId={editingId}
                  isCentered={false}
                  onOpenImportHtml={onOpenImportHtml}
                  onOpenTemplateGallery={onOpenTemplateGallery}
                />
              )}
            </aside>

            {/* Thanh kéo phân cách thay đổi kích thước (Resizer Handle) */}
            {!chatCollapsed && (
              <div
                role="separator"
                aria-orientation="vertical"
                tabIndex={0}
                onMouseDown={handleMouseDownResize}
                onDoubleClick={handleResetChatWidth}
                title="Kéo để thay đổi kích thước khung chat (Nhấp đúp để đặt lại)"
                className={`relative group w-2 -ml-1 z-20 cursor-col-resize select-none shrink-0 transition-colors flex items-center justify-center ${
                  isResizing ? 'bg-orange-500' : 'bg-transparent hover:bg-orange-400'
                }`}
              >
                <div
                  className={`w-0.5 h-7 rounded-full transition-colors ${
                    isResizing ? 'bg-white' : 'bg-gray-300 group-hover:bg-white'
                  }`}
                />
              </div>
            )}

            {/* Preview Area (right, flex) */}
            <section
              className={`flex-1 min-w-0 bg-[#f8fafc] flex flex-col min-h-0 ${
                isResizing ? 'pointer-events-none select-none' : ''
              }`}
            >
              {previewPanel ?? (
                <CanvasPreviewArea
                  key={previewResetKey}
                  form={form}
                  setForm={setForm}
                  onOpenImportHtml={onOpenImportHtml}
                  onOpenTemplateGallery={onOpenTemplateGallery}
                  onFocusChat={handleFocusChat}
                  isChatCollapsed={chatCollapsed}
                  onToggleChat={handleToggleChat}
                  mode={previewMode}
                  onModeChange={setPreviewMode}
                  viewport={viewport}
                  onViewportChange={setViewport}
                  zoom={zoom}
                  onZoomChange={setZoom}
                  isFitToScreen={isFitToScreen}
                  onToggleFitToScreen={() => setIsFitToScreen((prev) => !prev)}
                  onFitPercentChange={setFitPercent}
                />
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
