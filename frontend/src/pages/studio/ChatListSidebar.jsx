/* eslint-disable no-unused-vars */
import { useState, useEffect } from 'react';
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineSparkles,
  HiOutlineX,
  HiOutlineChevronDoubleLeft,
  HiOutlineChevronDoubleRight,
  HiOutlineShoppingCart,
  HiOutlineShare,
  HiOutlineDotsHorizontal,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import marketplaceService from '../../services/marketplace.service';
import { useI18n } from '../../i18n';

const ORIGIN_TABS = [
  { id: 'self_created', label: 'Tự tạo', icon: HiOutlineSparkles },
  { id: 'marketplace_purchased', label: 'Mua', icon: HiOutlineShoppingCart },
  { id: 'shared', label: 'Chia sẻ', icon: HiOutlineShare },
];

function ChatListSidebar({ selectedBot, onSelectBot, searchQuery = '', onSearchChange, collapsed = false, onToggleCollapse }) {
  const { t } = useI18n();
  const [internalSearch, setInternalSearch] = useState(searchQuery);
  const [chatbots, setChatbots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [originTab, setOriginTab] = useState('self_created');
  const [contextMenu, setContextMenu] = useState(null);

  const STORAGE_KEY = 'uknow_chatbots';

  useEffect(() => {
    setInternalSearch(searchQuery);
  }, [searchQuery]);

  const handleSearchChange = (value) => {
    setInternalSearch(value);
    onSearchChange?.(value);
  };

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
        // All tabs use the same API with origin filter
        const params = { origin: originTab };
        const res = await chatbotApi.listChatbots(params);
        if (res.success && res.data) {
          setChatbots(res.data);
          saveToStorage(res.data);
          // Reset selectedBot when changing tabs to avoid showing wrong bot
          if (res.data.length > 0) {
            const firstBot = res.data[0];
            // Only auto-select if current selectedBot doesn't belong to this origin tab
            const currentBotBelongsToNewTab = selectedBot && res.data.some(b => b.id === selectedBot.id);
            if (!currentBotBelongsToNewTab) {
              onSelectBot(firstBot);
            }
          } else if (!selectedBot || !res.data.some(b => b.id === selectedBot.id)) {
            onSelectBot(null);
          }
        } else {
          throw new Error('Invalid response');
        }
      } catch (apiError) {
        console.warn('[ChatListSidebar] API load failed, using localStorage:', apiError.message);
        const bots = loadFromStorage();
        setChatbots(bots);
        // Reset to first bot or null when tab changes
        if (bots.length > 0) {
          const firstBot = bots[0];
          const currentBotBelongsToNewTab = selectedBot && bots.some(b => b.id === selectedBot.id);
          if (!currentBotBelongsToNewTab) {
            onSelectBot(firstBot);
          }
        } else {
          onSelectBot(null);
        }
      } finally {
        setLoading(false);
      }
    };
    loadChatbots();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originTab]);

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
        if (res.success && res.data) newBot = res.data;
        else throw new Error(res.message);
      } catch (apiError) {
        console.warn('[ChatListSidebar] API create failed:', apiError.message);
        newBot = {
          id: Date.now(),
          name: newName.trim(),
          description: '',
          avatar_url: '',
          is_active: true,
          documents: [],
          channels: [],
          widget_settings: {
            theme_color: '#ee7518',
            position: 'bottom-right',
            welcome_message: '',
            primary_color: '#ee7518',
            background_color: '#FFFFFF',
            text_color: '#1F2937',
            accent_color: '#f19342',
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
      if (selectedBot?.id === bot.id) onSelectBot(bots[0] || null);
      toast.success(t('common.success'));
    } catch (apiError) {
      toast.error('Không thể xóa chatbot: ' + apiError.message);
    } finally {
      setDeletingId(null);
      setContextMenu(null);
    }
  };

  const filteredBots = chatbots
    .filter(b => {
      // Filter by origin tab - ensure only matching origin is shown
      if (b.origin !== originTab) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return b.name.toLowerCase().includes(q) || b.description?.toLowerCase().includes(q);
      }
      return true;
    });

  // ── COLLAPSED MODE: chỉ icon vertical strip ──────────────────────────────
  if (collapsed) {
    return (
      <div className="h-full w-full flex flex-col bg-white">
        <div className="flex flex-col items-center py-4 gap-1">
          <button
            onClick={onToggleCollapse}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Mở rộng"
          >
            <HiOutlineChevronDoubleRight className="w-4 h-4" />
          </button>
          <div className="w-8 h-px bg-slate-200 my-1" />
          {ORIGIN_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = originTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setOriginTab(tab.id)}
                className={`relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors group ${
                  isActive ? 'bg-primary-50 text-primary-600' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                }`}
                title={tab.label}
              >
                <Icon className="w-4 h-4" />
                {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary-500 rounded-r-full" />}
              </button>
            );
          })}
          <div className="w-8 h-px bg-slate-200 my-1" />
          {originTab === 'self_created' && (
            <button
              onClick={() => setShowCreate(true)}
              className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary-500 text-white hover:bg-primary-600 transition-colors shadow-sm shadow-primary-500/30"
              title="Tạo chatbot"
            >
              <HiOutlinePlus className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── EXPANDED MODE ─────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary-500 flex items-center justify-center">
              <HiOutlineSparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900 tracking-tight">Chatbots</h2>
          </div>
          <button
            onClick={onToggleCollapse}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Thu gọn"
          >
            <HiOutlineChevronDoubleLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Origin Tabs */}
        <div className="flex items-center gap-1 p-0.5 bg-slate-100/80 rounded-lg">
          {ORIGIN_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = originTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setOriginTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isActive ? 'bg-white text-slate-900 shadow-sm shadow-slate-200/60' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="px-5 pb-3 shrink-0">
        <div className="relative">
          <input
            type="text"
            value={internalSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Tìm chatbot..."
            className="w-full pl-3 pr-3 py-2 text-sm bg-slate-50 border border-slate-200/60 rounded-lg outline-none focus:bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Bot List */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin" />
          </div>
        ) : filteredBots.length === 0 ? (
          <EmptyState
            originTab={originTab}
            onCreate={() => setShowCreate(true)}
          />
        ) : (
          <div className="space-y-0.5">
            {filteredBots.map(bot => (
              <BotCard
                key={bot.id}
                bot={bot}
                isSelected={selectedBot?.id === bot.id}
                onSelect={() => onSelectBot(bot)}
                onDelete={(e) => handleDelete(bot, e)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ botId: bot.id, x: e.clientX, y: e.clientY });
                }}
                deletingId={deletingId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-100 shrink-0">
        {originTab === 'self_created' ? (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors shadow-sm shadow-primary-500/20"
          >
            <HiOutlinePlus className="w-4 h-4" />
            Chatbot mới
          </button>
        ) : (
          <div className="text-[11px] text-center text-slate-400 px-2">
            {originTab === 'marketplace_purchased'
              ? 'Chatbot mua từ Marketplace — không thể tạo mới tại đây'
              : 'Chatbot được chia sẻ với bạn — không thể tạo mới tại đây'}
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 w-44 bg-white rounded-lg shadow-lg shadow-slate-900/10 border border-slate-200/80 py-1"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                const bot = chatbots.find(b => b.id === contextMenu.botId);
                if (bot) handleDelete(bot, e);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <HiOutlineTrash className="w-3.5 h-3.5 text-red-500" />
              Xóa chatbot
            </button>
          </div>
        </>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-2xl md:rounded-xl shadow-xl w-full md:max-w-md md:mx-4 max-h-[92dvh] md:max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 pt-6 pb-5 border-b border-slate-100 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Tạo Chatbot</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Thiết lập trong vài giây</p>
                </div>
                <button
                  onClick={() => { setShowCreate(false); setNewName(''); }}
                  className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <HiOutlineX className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form onSubmit={handleCreate} className="px-6 py-5 space-y-5 overflow-y-auto">
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                  Tên Chatbot
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="VD: Hỗ trợ khách hàng"
                  autoFocus
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 mb-2 block">
                  Mẫu nhanh
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Hỗ trợ khách hàng', emoji: '💬' },
                    { label: 'Tư vấn bán hàng', emoji: '🛒' },
                    { label: 'Giáo dục', emoji: '📚' },
                    { label: 'Tùy chỉnh', emoji: '✨' },
                  ].map(tpl => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => setNewName(tpl.label)}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        newName === tpl.label ? 'border-primary-500 bg-primary-50' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-base mr-2">{tpl.emoji}</span>
                      <span className="text-xs font-medium text-slate-700">{tpl.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setNewName(''); }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white text-sm font-semibold rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {creating ? 'Đang tạo...' : 'Tạo ngay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ originTab, onCreate }) {
  const isSearch = false; // nếu muốn phân biệt search-empty vs list-empty có thể truyền prop riêng
  const config = (() => {
    if (originTab === 'marketplace_purchased') {
      return {
        icon: HiOutlineShoppingCart,
        title: 'Chưa mua chatbot nào',
        desc: 'Khám phá Marketplace để mua chatbot mẫu và dùng ngay.',
      };
    }
    if (originTab === 'shared') {
      return {
        icon: HiOutlineShare,
        title: 'Chưa được chia sẻ chatbot',
        desc: 'Khi có ai đó chia sẻ chatbot cho bạn, nó sẽ hiện ở đây.',
      };
    }
    return {
      icon: HiOutlineSparkles,
      title: isSearch ? 'Không tìm thấy' : 'Chưa có chatbot',
      desc: isSearch ? 'Thử bỏ bộ lọc' : 'Tạo chatbot đầu tiên của bạn',
    };
  })();
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-slate-400" />
      </div>
      <p className="text-sm font-medium text-slate-700 mb-1">{config.title}</p>
      <p className="text-xs text-slate-400 mb-4">{config.desc}</p>
      {originTab === 'self_created' && (
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-primary-500 hover:bg-primary-600 px-3.5 py-2 rounded-lg transition-colors"
        >
          <HiOutlinePlus className="w-3.5 h-3.5" />
          Tạo chatbot
        </button>
      )}
    </div>
  );
}

function BotCard({ bot, isSelected, onSelect, onDelete: _onDelete, onContextMenu, deletingId }) {
  const isMarketplaceBot = bot.widget_key?.startsWith('chatbot_');
  const docCount = bot.documents?.length || 0;

  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`group relative px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        isSelected ? 'bg-primary-50/60' : 'hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold transition-colors ${
          isSelected
            ? 'bg-primary-500 text-white'
            : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
        }`}>
          {bot.avatar_url ? (
            <img src={bot.avatar_url} alt="" className="w-full h-full rounded-lg object-cover" />
          ) : (
            bot.name?.[0]?.toUpperCase() || '?'
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={`text-sm font-medium truncate ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>
              {bot.name}
            </p>
            {isMarketplaceBot && (
              <span className="text-[9px] font-semibold uppercase tracking-wider text-primary-600 bg-primary-50 px-1 rounded">
                MP
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${bot.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className="text-[11px] text-slate-400">
              {docCount > 0 ? `${docCount} tài liệu` : 'Chưa có dữ liệu'}
            </span>
          </div>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onContextMenu(e); }}
          className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
            isSelected ? 'text-slate-500 hover:bg-slate-200/60' : 'text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-slate-200/60 hover:text-slate-600'
          }`}
        >
          <HiOutlineDotsHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary-500 rounded-r-full" />
      )}
    </div>
  );
}

export default ChatListSidebar;
