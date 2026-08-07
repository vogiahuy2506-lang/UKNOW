import { useState, useCallback } from 'react';
import ChatListSidebar from './ChatListSidebar';
import ChatMessageArea from './ChatMessageArea';
import ChatbotSettings from './ChatbotSettings';
import { HiOutlineX, HiOutlineCog } from 'react-icons/hi';

/**
 * Chatbot Studio — Orange & White Theme
 * 
 * Design system:
 * - Primary color: #F97316 (Orange 500) - xuyên suốt toàn bộ UI
 * - Background: White + tints cam nhẹ (#FFF7ED, #FFFBF5)
 * - Borders: #FED7AA (orange-200), #E5E7EB (gray-200)
 * - Subtle elevation, no heavy shadows
 * - Pill buttons, rounded-2xl cards
 */
export default function ChatbotStudioPage() {
  const [selectedBot, setSelectedBot] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleSelectBot = useCallback((bot) => setSelectedBot(bot), []);
  const handleUpdateBot = useCallback((bot) => setSelectedBot(bot), []);

  return (
    <div className="h-full flex bg-[#FFF7ED]/40">
      {/* ── LEFT: Chatbot List ───────────────────────────────────── */}
      <div
        className={`shrink-0 transition-all duration-200 ${
          sidebarOpen ? 'w-[260px]' : 'w-0'
        } overflow-hidden bg-white`}
      >
        <ChatListSidebar
          selectedBot={selectedBot}
          onSelectBot={handleSelectBot}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
      </div>

      {/* ── CENTER: Chat Area ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white border-l border-[#FED7AA]/60">
        <ChatMessageArea
          chatbot={selectedBot}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          settingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen(!settingsOpen)}
        />
      </div>

      {/* ── RIGHT: Settings (slide-in panel) ─────────────────────── */}
      {settingsOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/20 z-30 transition-opacity"
            onClick={() => setSettingsOpen(false)}
          />
          {/* Panel */}
          <div
            className="fixed right-0 top-0 bottom-0 w-[420px] bg-white border-l border-[#FED7AA]/60 z-40 flex flex-col animate-slide-in-right shadow-[-8px_0_24px_rgba(249,115,22,0.08)]"
          >
            {/* Panel Header */}
            <div className="h-14 flex items-center justify-between px-5 border-b border-[#FED7AA]/60 shrink-0 bg-gradient-to-r from-[#FFF7ED] to-white">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#F97316] flex items-center justify-center">
                  <HiOutlineCog className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-[#1F2937]">Cài đặt</h2>
                  {selectedBot && (
                    <p className="text-[11px] text-[#6B7280] truncate max-w-[200px]">{selectedBot.name}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-[#6B7280] hover:bg-[#FFEDD5] transition-colors"
                title="Đóng"
              >
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-y-auto bg-[#FFFBF5]">
              {selectedBot ? (
                <ChatbotSettings chatbot={selectedBot} onUpdate={handleUpdateBot} />
              ) : (
                <EmptySettings />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EmptySettings() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center">
      <div className="w-14 h-14 bg-[#FFEDD5] rounded-full flex items-center justify-center mb-3">
        <HiOutlineCog className="w-7 h-7 text-[#F97316]" />
      </div>
      <p className="text-sm font-medium text-[#1F2937]">Chưa có chatbot nào được chọn</p>
      <p className="text-xs text-[#6B7280] mt-1">Chọn chatbot từ danh sách bên trái để cấu hình</p>
    </div>
  );
}