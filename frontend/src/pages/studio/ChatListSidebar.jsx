import { useState, useEffect } from 'react';
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineSparkles,
  HiOutlineX,
  HiOutlineAdjustments,
  HiOutlineStatusOnline,
  HiOutlineChevronRight,
  HiOutlineDocumentText,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import { useI18n } from '../../i18n';

function ChatListSidebar({ selectedBot, onSelectBot, _onCreateNew, searchQuery = '' }) {
  const { t } = useI18n();
  const [chatbots, setChatbots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [filterActive, setFilterActive] = useState(true);
  const [sortBy, setSortBy] = useState('recent'); // recent | name | created

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

  // Listen for create event from studio page
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
          saveToStorage(res.data); // Sync to localStorage
          if (res.data.length > 0 && !selectedBot) {
            onSelectBot(res.data[0]);
          }
        } else {
          throw new Error('Invalid response');
        }
      } catch (apiError) {
        // Fallback to localStorage if API fails
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
        // Fallback: create locally
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
            theme_color: '#6366F1',
            position: 'bottom-right',
            welcome_message: '',
            primary_color: '#6366F1',
            background_color: '#FFFFFF',
            text_color: '#1F2937',
            accent_color: '#818CF8',
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
      // Must delete via API successfully before removing locally
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
    }
  };

  // Filter & sort
  const filteredBots = chatbots
    .filter(b => {
      if (!filterActive && !b.is_active) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return b.name.toLowerCase().includes(q) || b.description?.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'created') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      return new Date(b.id) - new Date(a.id);
    });

  const activeCount = chatbots.filter(b => b.is_active).length;

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="pl-4 pr-14 pt-4 pb-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary-500 rounded-lg flex items-center justify-center shadow-sm">
              <HiOutlineSparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <h2 className="text-sm font-bold text-slate-800">Chatbots</h2>
            <span className="text-[11px] bg-primary-50 text-primary-600 font-semibold px-1.5 py-0.5 rounded-full">
              {filteredBots.length}
            </span>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="w-7 h-7 bg-primary-500 hover:bg-primary-600 active:scale-95 text-white rounded-lg flex items-center justify-center transition-all shadow-sm"
            title={t('chatbot.studio.createNew')}
          >
            <HiOutlinePlus className="w-4 h-4" />
          </button>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span>{activeCount} đang hoạt động</span>
          </div>
          {chatbots.length - activeCount > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              <span>{chatbots.length - activeCount} tạm dừng</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────── */}
      <div className="px-3 py-2.5 border-b border-slate-100 shrink-0 space-y-2">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilterActive(!filterActive)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
              filterActive
                ? 'bg-green-50 text-green-600 border border-green-200'
                : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-primary-300'
            }`}
          >
            <HiOutlineStatusOnline className="w-3.5 h-3.5" />
            Đang hoạt động
          </button>
          <div className="relative ml-auto">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none bg-slate-50 border border-slate-200 text-slate-600 text-[11px] rounded-lg pl-2 pr-6 py-1.5 outline-none focus:border-primary-400 cursor-pointer"
            >
              <option value="recent">Mới nhất</option>
              <option value="name">A → Z</option>
              <option value="created">Ngày tạo</option>
            </select>
            <HiOutlineChevronRight className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 rotate-90 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ── Bot List ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-400">{t('common.loading')}</p>
          </div>
        ) : filteredBots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
              <HiOutlineSparkles className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-600 mb-1">
              {chatbots.length === 0 ? 'Chưa có chatbot nào' : 'Không tìm thấy'}
            </p>
            <p className="text-[11px] text-slate-400 mb-4">
              {chatbots.length === 0 ? 'Tạo chatbot đầu tiên để bắt đầu' : 'Thử thay đổi bộ lọc'}
            </p>
            {chatbots.length === 0 && (
              <button
                onClick={() => setShowCreate(true)}
                className="text-xs text-primary-600 font-semibold hover:text-primary-700 hover:underline"
              >
                Tạo chatbot đầu tiên
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredBots.map(bot => (
              <BotCard
                key={bot.id}
                bot={bot}
                isSelected={selectedBot?.id === bot.id}
                onSelect={() => onSelectBot(bot)}
                onDelete={(e) => handleDelete(bot, e)}
                deletingId={deletingId}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="px-3 py-2.5 border-t border-slate-100 shrink-0 bg-slate-50/50">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>{chatbots.length} chatbot(s)</span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span>Gemini 2.5 Flash</span>
          </div>
        </div>
      </div>

      {/* ── Create Modal ───────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            {/* Modal Header */}
            <div className="relative px-6 pt-6 pb-4 bg-primary-500">
              <div className="absolute inset-0 bg-white/10" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <HiOutlineSparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-base">Tạo Chatbot mới</h3>
                    <p className="text-primary-100 text-xs mt-0.5">Thiết lập trong vài giây</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowCreate(false); setNewName(''); }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
                >
                  <HiOutlineX className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-5">
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Tên Chatbot *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="VD: Hỗ trợ khách hàng, Tư vấn sản phẩm..."
                  autoFocus
                  className="mt-2 w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-primary-400 transition-colors"
                />
              </div>

              {/* Quick Templates */}
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                  Chọn mẫu nhanh
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Hỗ trợ khách hàng', emoji: '💬', desc: 'Trả lời FAQ, hỗ trợ' },
                    { label: 'Tư vấn bán hàng', emoji: '🛒', desc: 'Giới thiệu sản phẩm' },
                    { label: 'Giáo dục', emoji: '📚', desc: 'Hỏi đáp kiến thức' },
                    { label: 'Tùy chỉnh', emoji: '✨', desc: 'Bắt đầu trắng' },
                  ].map(tpl => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => setNewName(tpl.label)}
                      className={`text-left p-2.5 rounded-xl border-2 transition-all hover:border-primary-300 ${
                        newName === tpl.label
                          ? 'border-primary-400 bg-primary-50'
                          : 'border-slate-200 hover:border-primary-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">{tpl.emoji}</span>
                        <span className="text-xs font-semibold text-slate-700">{tpl.label}</span>
                      </div>
                      <p className="text-[10px] text-slate-400">{tpl.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setNewName(''); }}
                  className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white text-sm font-bold rounded-xl hover:bg-primary-600 disabled:opacity-50 shadow-lg shadow-primary-500/30 transition-all active:scale-95"
                >
                  {creating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Đang tạo...
                    </>
                  ) : (
                    <>
                      <HiOutlinePlus className="w-4 h-4" />
                      Tạo ngay
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function BotCard({ bot, isSelected, onSelect, onDelete, deletingId }) {
  const [showMenu, setShowMenu] = useState(false);
  const docCount = bot.documents?.length || 0;
  const channelCount = bot.channels?.length || 0;

  return (
    <div
      onClick={onSelect}
      className={`group relative rounded-xl cursor-pointer transition-all duration-200 ${
        isSelected
          ? 'bg-primary-50 border-2 border-primary-300 shadow-sm'
          : 'border-2 border-transparent hover:bg-slate-50 hover:border-slate-200'
      }`}
    >
      <div className="p-3 flex items-start gap-3">
        {/* Avatar */}
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
          isSelected
            ? 'bg-primary-500'
            : 'bg-gradient-to-br from-slate-100 to-slate-200 group-hover:from-slate-200 group-hover:to-slate-300'
        }`}>
          {bot.avatar_url ? (
            <img src={bot.avatar_url} alt="" className="w-full h-full rounded-xl object-cover" />
          ) : (
            <span className={`text-lg font-bold ${isSelected ? 'text-white' : 'text-slate-500'}`}>
              {bot.name?.[0]?.toUpperCase() || '?'}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-slate-800 truncate">{bot.name}</p>
            {bot.is_active ? (
              <div className="w-2 h-2 rounded-full bg-green-400 shadow-sm" />
            ) : (
              <div className="w-2 h-2 rounded-full bg-slate-300" />
            )}
          </div>
          <p className="text-[11px] text-slate-400 truncate mt-0.5">
            {bot.description || 'Chưa có mô tả'}
          </p>

          {/* Stats */}
          <div className="flex items-center gap-3 mt-1.5">
            {docCount > 0 && (
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <HiOutlineDocumentText className="w-3 h-3" />
                <span>{docCount} tài liệu</span>
              </div>
            )}
            {channelCount > 0 && (
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span>{channelCount} kênh</span>
              </div>
            )}
          </div>
        </div>

        {/* Menu Button */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
              isSelected
                ? 'text-primary-600 hover:bg-primary-100'
                : 'text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-500'
            }`}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50">
              <button
                onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors"
              >
                <HiOutlineAdjustments className="w-3.5 h-3.5" />
                Chỉnh sửa
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(e); setShowMenu(false); }}
                disabled={deletingId === bot.id}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {deletingId === bot.id ? (
                  <div className="w-3.5 h-3.5 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
                ) : (
                  <HiOutlineTrash className="w-3.5 h-3.5" />
                )}
                Xóa chatbot
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Selection Indicator */}
      {isSelected && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-500 rounded-r-full" />
      )}

      {showMenu && <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />}
    </div>
  );
}

export default ChatListSidebar;
