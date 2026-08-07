import { useState, useEffect, useMemo } from 'react';
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineSparkles,
  HiOutlineX,
  HiOutlineSearch,
  HiOutlineChevronDoubleLeft,
  HiOutlinePencil,
  HiOutlineDotsHorizontal,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import { useI18n } from '../../i18n';

/**
 * ChatListSidebar — Orange & White theme
 *
 * - "Tạo chatbot mới" CTA: gradient cam nổi bật (pill)
 * - Search capsule với focus ring cam
 * - Group "Gần đây" uppercase header
 * - Bot card: hover nền cam nhạt, selected nền cam đậm hơn
 * - Avatar gradient cam
 */
function ChatListSidebar({ selectedBot, onSelectBot, searchQuery = '', sidebarOpen, onToggleSidebar }) {
  const { t } = useI18n();
  const [chatbots, setChatbots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [showMenu, setShowMenu] = useState(null);
  const [localSearch, setLocalSearch] = useState('');
  const [recentOpen, setRecentOpen] = useState(true);

  const STORAGE_KEY = 'uknow_chatbots';

  const loadFromStorage = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  };

  const saveToStorage = (bots) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bots));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  };

  useEffect(() => {
    const handler = () => setShowCreate(true);
    document.addEventListener('studio:create-new', handler);
    return () => document.removeEventListener('studio:create-new', handler);
  }, []);

  useEffect(() => {
    const loadChatbots = async () => {
      try {
        const res = await chatbotApi.listChatbots();
        if (res.success && res.data) {
          setChatbots(res.data);
          saveToStorage(res.data);
          if (res.data.length > 0 && !selectedBot) {
            onSelectBot(res.data[0]);
          }
        } else {
          throw new Error('Invalid response');
        }
      } catch (apiError) {
        console.warn('[ChatListSidebar] API load failed, using localStorage:', apiError.message);
        const bots = loadFromStorage();
        setChatbots(bots);
        if (bots.length > 0 && !selectedBot) {
          onSelectBot(bots[0]);
        }
      } finally {
        setLoading(false);
      }
    };
    loadChatbots();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error(t('chatbot.studio.nameRequired'));
      return;
    }
    setCreating(true);
    try {
      let newBot;
      try {
        const res = await chatbotApi.createChatbot({
          name: newName.trim(),
          description: '',
          greeting_msg: 'Xin chào! Tôi có thể giúp gì cho bạn?',
        });
        if (res.success && res.data) {
          newBot = res.data;
        } else {
          throw new Error(res.message);
        }
      } catch (apiError) {
        console.warn('[ChatListSidebar] API create failed, using localStorage:', apiError.message);
        newBot = {
          id: Date.now(),
          name: newName.trim(),
          description: '',
          avatar_url: '',
          is_active: true,
          documents: [],
          channels: [],
          widget_settings: {
            theme_color: '#F97316',
            position: 'bottom-right',
            welcome_message: '',
            primary_color: '#F97316',
            background_color: '#FFFFFF',
            text_color: '#1F2937',
            accent_color: '#FB923C',
            logo_url: '',
            show_avatar: true,
            suggested_questions: [],
          },
          greeting_msg: '',
          system_instruction: '',
          temperature: 0.7,
          max_tokens: 2048,
          widget_key: Math.random().toString(36).substring(2, 15),
          created_at: new Date().toISOString(),
          message_count: 0,
        };
      }
      const bots = [newBot, ...chatbots];
      setChatbots(bots);
      saveToStorage(bots);
      setShowCreate(false);
      setNewName('');
      onSelectBot(newBot);
      toast.success(t('chatbot.studio.createSuccess'));
    } catch {
      toast.error(t('errors.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (bot, e) => {
    e.stopPropagation();
    if (!confirm(t('chatbot.studio.confirmDelete', { name: bot.name }))) return;
    setDeletingId(bot.id);
    try {
      await chatbotApi.deleteChatbot(bot.id);

      const bots = chatbots.filter(b => b.id !== bot.id);
      setChatbots(bots);
      saveToStorage(bots);
      if (selectedBot?.id === bot.id) {
        onSelectBot(bots[0] || null);
      }
      toast.success(t('common.success'));
    } catch (apiError) {
      console.warn('[ChatListSidebar] API delete failed:', apiError.message);
      toast.error('Không thể xóa chatbot: ' + apiError.message);
    } finally {
      setDeletingId(null);
      setShowMenu(null);
    }
  };

  // Search & sort
  const effectiveSearch = (searchQuery || localSearch).toLowerCase();
  const filteredBots = useMemo(() => {
    return chatbots
      .filter(b => {
        if (!effectiveSearch) return true;
        return b.name.toLowerCase().includes(effectiveSearch) ||
               b.description?.toLowerCase().includes(effectiveSearch);
      })
      .sort((a, b) => new Date(b.created_at || b.id) - new Date(a.created_at || a.id));
  }, [chatbots, effectiveSearch]);

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* ── Top Bar (collapse button) ─────────────────────────── */}
      <div className="h-10 px-2 flex items-center justify-end shrink-0">
        <button
          onClick={onToggleSidebar}
          className="w-7 h-7 flex items-center justify-center rounded-full text-[#6B7280] hover:bg-[#FFEDD5] hover:text-[#F97316] transition-colors"
          title="Thu gọn sidebar"
        >
          <HiOutlineChevronDoubleLeft className="w-4 h-4" />
        </button>
      </div>

      {/* ── New Chat CTA (Orange theme) ────────────────────────── */}
      <div className="px-3 pb-3 shrink-0">
        <button
          onClick={() => setShowCreate(true)}
          className="w-full h-10 px-4 flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] hover:from-[#EA580C] hover:to-[#F97316] active:scale-[0.98] transition-all text-[14px] font-semibold text-white shadow-[0_2px_8px_rgba(249,115,22,0.35)] hover:shadow-[0_4px_12px_rgba(249,115,22,0.45)]"
        >
          <HiOutlinePlus className="w-5 h-5" />
          <span>Tạo chatbot mới</span>
        </button>
      </div>

      {/* ── Search ─────────────────────────────────────────────── */}
      <div className="px-3 pb-3 shrink-0">
        <div className="relative">
          <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Tìm kiếm"
            className="w-full pl-9 pr-3 py-2 bg-[#FFFBF5] border border-[#FED7AA]/60 rounded-full text-[13px] text-[#1F2937] placeholder:text-[#9CA3AF] outline-none focus:bg-white focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/20 transition-all"
          />
        </div>
      </div>

      {/* ── Recent Group ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-[#FED7AA] border-t-[#F97316] rounded-full animate-spin" />
          </div>
        ) : filteredBots.length === 0 ? (
          <EmptyState
            hasBots={chatbots.length > 0}
            onCreate={() => setShowCreate(true)}
          />
        ) : (
          <div className="px-2">
            <button
              onClick={() => setRecentOpen(!recentOpen)}
              className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-bold text-[#F97316] uppercase tracking-wider hover:text-[#EA580C]"
            >
              <span>Gần đây</span>
              <HiOutlineChevronDoubleLeft
                className={`w-3 h-3 transition-transform ${recentOpen ? '' : '-rotate-90'}`}
              />
            </button>

            {recentOpen && (
              <div className="space-y-0.5 mt-1">
                {filteredBots.map(bot => (
                  <BotCard
                    key={bot.id}
                    bot={bot}
                    isSelected={selectedBot?.id === bot.id}
                    isHovered={hoveredId === bot.id}
                    onHover={() => setHoveredId(bot.id)}
                    onLeave={() => setHoveredId(null)}
                    onSelect={() => onSelectBot(bot)}
                    onDelete={(e) => handleDelete(bot, e)}
                    deletingId={deletingId}
                    showMenu={showMenu === bot.id}
                    onToggleMenu={() => setShowMenu(showMenu === bot.id ? null : bot.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Create Modal (Orange theme) ──────────────────────── */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => { setShowCreate(false); setNewName(''); }}
        >
          <div
            className="bg-white rounded-2xl shadow-[0_24px_38px_3px_rgba(249,115,22,0.18),0_9px_46px_8px_rgba(0,0,0,0.12),0_11px_15px_-7px_rgba(0,0,0,0.2)] w-full max-w-md mx-4 overflow-hidden border border-[#FED7AA]/60"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header với gradient cam */}
            <div className="relative px-6 pt-5 pb-4 bg-gradient-to-br from-[#FFF7ED] to-white border-b border-[#FED7AA]/60">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#F97316] to-[#FB923C] flex items-center justify-center shadow-[0_4px_12px_rgba(249,115,22,0.35)]">
                    <HiOutlineSparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-[18px] font-semibold text-[#1F2937]">Tạo chatbot mới</h3>
                    <p className="text-[12px] text-[#6B7280] mt-0.5">Bắt đầu với một trợ lý AI tùy chỉnh</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowCreate(false); setNewName(''); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-[#6B7280] hover:bg-[#FFEDD5] hover:text-[#F97316] transition-colors -mr-1 -mt-1"
                >
                  <HiOutlineX className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <form onSubmit={handleCreate} className="px-6 py-5">
              <div className="space-y-4">
                <div>
                  <label className="block text-[12px] font-semibold text-[#374151] mb-1.5">
                    Tên chatbot
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="VD: Hỗ trợ khách hàng"
                    autoFocus
                    className="w-full px-3 py-2.5 bg-[#FFFBF5] border border-[#FED7AA] rounded-lg text-[14px] text-[#1F2937] placeholder:text-[#9CA3AF] outline-none focus:bg-white focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/20 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#374151] mb-2">
                    Chọn mẫu có sẵn
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Hỗ trợ khách hàng', emoji: '💬' },
                      { label: 'Tư vấn bán hàng', emoji: '🛍️' },
                      { label: 'Giáo dục', emoji: '📚' },
                      { label: 'Tùy chỉnh', emoji: '✨' },
                    ].map(({ label, emoji }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setNewName(label)}
                        className={`text-left p-3 rounded-xl border-2 transition-all ${
                          newName === label
                            ? 'border-[#F97316] bg-[#FFF7ED] shadow-[0_2px_8px_rgba(249,115,22,0.15)]'
                            : 'border-[#FED7AA]/60 hover:border-[#F97316]/40 hover:bg-[#FFFBF5]'
                        }`}
                      >
                        <div className="text-[20px] mb-1">{emoji}</div>
                        <div className={`text-[12px] font-medium ${
                          newName === label ? 'text-[#EA580C]' : 'text-[#1F2937]'
                        }`}>{label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-[#FED7AA]/60">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setNewName(''); }}
                  className="px-5 py-2 text-[14px] text-[#6B7280] hover:bg-[#FFEDD5] hover:text-[#EA580C] rounded-full font-medium transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="px-5 py-2 bg-gradient-to-r from-[#F97316] to-[#FB923C] hover:from-[#EA580C] hover:to-[#F97316] text-white text-[14px] font-semibold rounded-full disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_2px_8px_rgba(249,115,22,0.35)] hover:shadow-[0_4px_12px_rgba(249,115,22,0.45)]"
                >
                  {creating ? 'Đang tạo...' : 'Tạo chatbot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ hasBots, onCreate }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#FFEDD5] to-[#FED7AA] flex items-center justify-center mb-3">
        <HiOutlineSparkles className="w-6 h-6 text-[#F97316]" />
      </div>
      <p className="text-[13px] text-[#6B7280] mb-1 font-medium">
        {hasBots ? 'Không tìm thấy kết quả' : 'Chưa có chatbot nào'}
      </p>
      {!hasBots && (
        <button
          onClick={onCreate}
          className="text-[13px] text-[#F97316] font-semibold hover:text-[#EA580C] hover:underline mt-2"
        >
          Tạo chatbot đầu tiên
        </button>
      )}
    </div>
  );
}

function BotCard({ bot, isSelected, isHovered, onHover, onLeave, onSelect, onDelete, deletingId, showMenu, onToggleMenu }) {
  return (
    <div
      onClick={onSelect}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={`group relative rounded-full cursor-pointer transition-all flex items-center gap-2.5 pl-2 pr-1 py-1 ${
        isSelected
          ? 'bg-gradient-to-r from-[#FFF7ED] to-[#FFEDD5] ring-1 ring-[#FED7AA] shadow-[0_1px_3px_rgba(249,115,22,0.1)]'
          : isHovered
          ? 'bg-[#FFEDD5]/60'
          : ''
      }`}
    >
      {/* Avatar — gradient cam */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[12px] font-semibold text-white overflow-hidden ${
          isSelected ? 'ring-2 ring-white' : ''
        }`}
        style={{ background: 'linear-gradient(135deg, #F97316 0%, #FB923C 100%)' }}
      >
        {bot.avatar_url ? (
          <img src={bot.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span>{bot.name?.[0]?.toUpperCase() || '?'}</span>
        )}
      </div>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-[13px] truncate ${
            isSelected ? 'text-[#EA580C] font-semibold' : 'text-[#1F2937]'
          }`}
        >
          {bot.name}
        </p>
      </div>

      {/* Right action */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
        className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
          isHovered || showMenu ? 'opacity-100' : 'opacity-0'
        } ${
          isSelected
            ? 'text-[#F97316] hover:bg-[#FED7AA]/40'
            : 'text-[#6B7280] hover:bg-[#FFEDD5] hover:text-[#F97316]'
        }`}
      >
        <HiOutlineDotsHorizontal className="w-4 h-4" />
      </button>

      {/* Context menu */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggleMenu} />
          <div className="absolute right-2 top-full mt-1 w-44 bg-white rounded-lg shadow-[0_8px_24px_rgba(249,115,22,0.18),0_2px_8px_rgba(0,0,0,0.08)] border border-[#FED7AA] py-1 z-50 overflow-hidden">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[#1F2937] hover:bg-[#FFFBF5] transition-colors"
            >
              <HiOutlinePencil className="w-4 h-4 text-[#F97316]" />
              Đổi tên
            </button>
            <div className="my-1 border-t border-[#FED7AA]/60" />
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(e); }}
              disabled={deletingId === bot.id}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[#DC2626] hover:bg-[#FEF2F2] transition-colors disabled:opacity-50"
            >
              <HiOutlineTrash className="w-4 h-4" />
              Xóa
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default ChatListSidebar;