import { useState, useEffect } from 'react';
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineSparkles,
  HiOutlineX,
  HiOutlineRefresh,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';

function ChatListSidebar({ selectedBot, onSelectBot, onCreateNew }) {
  const { t } = useI18n();
  const [chatbots, setChatbots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const STORAGE_KEY = 'uknow_chatbots';

  // Load from localStorage
  const loadFromStorage = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  };

  // Save to localStorage
  const saveToStorage = (bots) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bots));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  };

  useEffect(() => {
    const bots = loadFromStorage();
    setChatbots(bots);
    setLoading(false);
    // Auto-select first bot if none selected
    if (bots.length > 0 && !selectedBot) {
      onSelectBot(bots[0]);
    }
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error(t('chatbot.studio.nameRequired'));
      return;
    }
    setCreating(true);
    try {
      const newBot = {
        id: Date.now(),
        name: newName.trim(),
        description: '',
        avatar_url: '',
        is_active: true,
        documents: [],
        channels: [],
        widget_settings: { theme_color: '#6366F1', position: 'bottom-right', welcome_message: '' },
        greeting_msg: '',
        system_instruction: '',
        temperature: 0.7,
        max_tokens: 2048,
        widget_key: Math.random().toString(36).substring(2, 15),
      };
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
    const bots = chatbots.filter(b => b.id !== bot.id);
    setChatbots(bots);
    saveToStorage(bots);
    setDeletingId(null);
    if (selectedBot?.id === bot.id) {
      onSelectBot(bots[0] || null);
    }
    toast.success(t('common.success'));
  };

  return (
    <div className="w-64 h-full bg-white border-r border-slate-200 flex flex-col shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-800">{t('chatbot.studio.myAssistants')}</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="w-7 h-7 bg-purple-500 hover:bg-purple-600 text-white rounded-lg flex items-center justify-center transition-colors"
            title={t('chatbot.studio.createNew')}
          >
            <HiOutlinePlus className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-400">{t('chatbot.studio.sidebarSubtitle')}</p>
      </div>

      {/* Bot List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : chatbots.length === 0 ? (
          <div className="p-4 text-center">
            <HiOutlineSparkles className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400 mb-3">{t('chatbot.studio.noBots')}</p>
            <button
              onClick={() => setShowCreate(true)}
              className="text-xs text-purple-500 font-medium hover:underline"
            >
              {t('chatbot.studio.createFirst')}
            </button>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {chatbots.map(bot => (
              <div
                key={bot.id}
                onClick={() => onSelectBot(bot)}
                className={`group relative p-3 rounded-xl cursor-pointer transition-all ${
                  selectedBot?.id === bot.id
                    ? 'bg-purple-50 border border-purple-200'
                    : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-xl flex items-center justify-center shrink-0">
                    <span className="text-white text-lg font-bold">{bot.name?.[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800 truncate">{bot.name}</p>
                      {!bot.is_active && (
                        <span className="text-[9px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full">
                          {t('chatbot.studio.inactive')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {bot.description || t('chatbot.studio.noDescription')}
                    </p>
                  </div>
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => handleDelete(bot, e)}
                  disabled={deletingId === bot.id}
                  className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <HiOutlineTrash className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">{t('chatbot.studio.createNewBot')}</h3>
              <button
                onClick={() => { setShowCreate(false); setNewName(''); }}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('chatbot.studio.botName')} *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('chatbot.studio.botNamePlaceholder')}
                  autoFocus
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 transition-all"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setNewName(''); }}
                  className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white text-sm font-semibold rounded-xl hover:bg-purple-600 disabled:opacity-60 transition-all"
                >
                  {creating ? (
                    <><HiOutlineRefresh className="w-4 h-4 animate-spin" />{t('chatbot.studio.creating')}</>
                  ) : (
                    <><HiOutlinePlus className="w-4 h-4" />{t('chatbot.studio.create')}</>
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

export default ChatListSidebar;
