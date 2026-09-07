import { useCallback, useState } from 'react';
import LandingCanvasTopbar from './LandingCanvasTopbar.jsx';
import CanvasPreviewArea from './CanvasPreviewArea.jsx';
import CanvasChatPanel from './CanvasChatPanel.jsx';

/**
 * Layout 2-panel bên trong main area của MainLayout:
 *   ┌────────────────────────────────────────────┐
 *   │ LandingCanvasTopbar (44px, border-b)       │
 *   ├──────────────┬─────────────────────────────┤
 *   │ Chat Panel   │ Preview Area                │
 *   │ (380px)      │ (flex)                      │
 *   └──────────────┴─────────────────────────────┘
 *
 * Khi chat collapsed → aside width = 0, chat panel render floating restore button.
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
  chatPanel,
  previewPanel,
}) {
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const handleToggleChat = useCallback(() => {
    setChatCollapsed((cur) => !cur);
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
    <div className="flex flex-col h-full min-h-0">
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
      />

      <div className="flex-1 min-h-0 flex">
        {/* Chat Panel (left, 380px) */}
        <aside
          className={`shrink-0 border-r border-gray-200 bg-white flex flex-col min-h-0 transition-[width] duration-200 ${
            chatCollapsed ? 'w-0 border-r-0 overflow-hidden' : 'w-[380px]'
          }`}
        >
          {chatPanel ?? (
            <CanvasChatPanel
              form={form}
              setForm={setForm}
              openTab={openTab}
              collapsed={chatCollapsed}
              onToggleCollapsed={handleToggleChat}
            />
          )}
        </aside>

        {/* Preview Area (right, flex) */}
        <section className="flex-1 min-w-0 bg-[#f8fafc] flex flex-col min-h-0">
          {previewPanel ?? <CanvasPreviewArea form={form} setForm={setForm} />}
        </section>
      </div>
    </div>
  );
}
