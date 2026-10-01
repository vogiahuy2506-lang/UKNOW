import { useCallback, useRef, useState } from 'react';
import { HiOutlineSparkles } from 'react-icons/hi';
import LandingCanvasTopbar from './LandingCanvasTopbar.jsx';
import CanvasPreviewArea from './CanvasPreviewArea.jsx';
import CanvasChatPanel from './CanvasChatPanel.jsx';

/**
 * Layout 2-panel bên trong main area của MainLayout:
 *   ┌────────────────────────────────────────────┐
 *   │ LandingCanvasTopbar (56px, border-b)       │
 *   ├──────────────┬─────────────────────────────┤
 *   │ Chat Panel   │ Preview Area                │
 *   │ (380px)      │ (flex)                      │
 *   └──────────────┴─────────────────────────────┘
 *
 * Khi chat collapsed → aside width = 0, hiển thị nút khôi phục ở mép trái và toolbar Preview.
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
  const handleToggleChat = useCallback(() => {
    setChatCollapsed((cur) => !cur);
  }, []);

  // "Nhờ AI tạo" ở thẻ empty-state (Việc 2): mở panel chat nếu đang thu gọn rồi focus ô nhập —
  // panel thu gọn không render ChatComposer nên phải đợi 1 nhịp render trước khi ref có giá trị.
  const handleFocusChat = useCallback(() => {
    setChatCollapsed(false);
    requestAnimationFrame(() => chatPanelRef.current?.focus());
  }, []);

  /**
   * openTab: yêu cầu SettingsModal mở 1 tab cụ thể.
   * Vì chat có thể gọi khi modal đang đóng, ta dispatch event để LandingCanvasEditor bắt,
   * đồng thời fallback gọi onOpenSettingTab nếu đã mở modal.
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
      />

      <div className="flex-1 min-h-0 flex relative">
        {/* Nút dock tab mép trái khi chat panel đang thu gọn (độc lập ngoài aside) */}
        {chatCollapsed && (
          <button
            type="button"
            onClick={handleToggleChat}
            className="fixed left-0 top-20 z-30 group inline-flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-r-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs sm:text-sm font-bold shadow-lg hover:shadow-xl hover:pr-5 transition-all select-none cursor-pointer"
            title="Mở lại Trợ lý AI"
          >
            <HiOutlineSparkles className="w-4.5 h-4.5 animate-pulse" />
            <span>Mở Trợ lý AI</span>
          </button>
        )}

        {/* Chat Panel (left, 380px) */}
        <aside
          className={`shrink-0 border-r border-gray-200 bg-white flex flex-col min-h-0 transition-[width] duration-200 ${
            chatCollapsed ? 'w-0 border-r-0 overflow-hidden' : 'w-[380px]'
          }`}
        >
          {chatPanel ?? (
            <CanvasChatPanel
              ref={chatPanelRef}
              form={form}
              setForm={setForm}
              openTab={openTab}
              collapsed={chatCollapsed}
              onToggleCollapsed={handleToggleChat}
              editingId={editingId}
            />
          )}
        </aside>

        {/* Preview Area (right, flex) */}
        <section className="flex-1 min-w-0 bg-[#f8fafc] flex flex-col min-h-0">
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
            />
          )}
        </section>
      </div>
    </div>
  );
}
