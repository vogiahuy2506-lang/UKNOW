import { useState, useEffect } from 'react';
import {
  HiOutlineUserCircle, HiOutlinePlus, HiOutlineTrash, HiOutlineSave,
  HiOutlineRefresh, HiOutlineX, HiOutlineSparkles, HiOutlinePencil,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import { useI18n } from '../../i18n';

const EMPTY_FORM = {
  name: '',
  description: '',
  greeting_msg: '',
  avatar_url: '',
  is_active: true,
};

function SubAssistantPage() {
  const { t } = useI18n();
  const [assistants, setAssistants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newForm, setNewForm] = useState({ name: '' });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await chatbotApi.listSubAssistants();
      setAssistants(res.data || []);
    } catch { toast.error(t('errors.loadFailed')); }
    finally { setLoading(false); }
  };

  const selectAssistant = async (assistant) => {
    setSelected(assistant);
    setForm({
      name: assistant.name || '',
      description: assistant.description || '',
      greeting_msg: assistant.greeting_msg || t('chatbot.subAssistant.greetingMsgPlaceholder'),
      avatar_url: assistant.avatar_url || '',
      is_active: assistant.is_active !== false,
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error(t('chatbot.subAssistant.nameRequired')); return; }
    setSaving(true);
    try {
      const res = await chatbotApi.updateSubAssistant(selected.id, form);
      setAssistants(prev => prev.map(a => a.id === selected.id ? res.data : a));
      setSelected(res.data);
      toast.success(t('chatbot.subAssistant.saveSuccess'));
    } catch { toast.error(t('errors.saveFailed')); }
    finally { setSaving(false); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newForm.name.trim()) { toast.error(t('chatbot.subAssistant.nameRequired')); return; }
    setCreating(true);
    try {
      const res = await chatbotApi.createSubAssistant({ ...EMPTY_FORM, name: newForm.name });
      setAssistants(prev => [res.data, ...prev]);
      setShowCreate(false);
      setNewForm({ name: '' });
      selectAssistant(res.data);
      toast.success(t('chatbot.subAssistant.createSuccess'));
    } catch { toast.error(t('errors.createFailed')); }
    finally { setCreating(false); }
  };

  const handleDelete = async (assistant, e) => {
    e.stopPropagation();
    if (!confirm(t('chatbot.subAssistant.confirmDelete', { name: assistant.name }))) return;
    try {
      await chatbotApi.deleteSubAssistant(assistant.id);
      setAssistants(prev => prev.filter(a => a.id !== assistant.id));
      if (selected?.id === assistant.id) setSelected(null);
      toast.success(t('chatbot.subAssistant.deleteSuccess'));
    } catch { toast.error(t('errors.deleteFailed')); }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
            <HiOutlineUserCircle className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">{t('chatbot.subAssistant.title')}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('chatbot.subAssistant.description')}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white text-sm font-semibold rounded-xl hover:bg-indigo-600 transition-all shadow-sm"
        >
          <HiOutlinePlus className="w-4 h-4" />
          {t('chatbot.subAssistant.createNew')}
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">{t('chatbot.subAssistant.createNew')}</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.subAssistant.assistantName')} *</label>
                <input
                  type="text" value={newForm.name}
                  onChange={e => setNewForm({ name: e.target.value })}
                  placeholder={t('chatbot.subAssistant.assistantNamePlaceholder')}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 transition-all"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">{t('common.cancel')}</button>
                <button type="submit" disabled={creating} className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white text-sm font-semibold rounded-xl hover:bg-indigo-600 disabled:opacity-60 transition-all">
                  {creating ? <><HiOutlineRefresh className="w-4 h-4 animate-spin" />{t('chatbot.subAssistant.creating')}</> : <><HiOutlinePlus className="w-4 h-4" />{t('chatbot.subAssistant.create')}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-5">
        {/* Sidebar */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {t('chatbot.subAssistant.title')} ({assistants.length})
            </p>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">{t('common.loading')}</div>
          ) : assistants.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-400 mb-3">{t('chatbot.subAssistant.noAssistants')}</p>
              <button onClick={() => setShowCreate(true)} className="text-xs text-indigo-500 font-medium hover:underline">
                {t('chatbot.subAssistant.createFirst')}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {assistants.map(a => (
                <div
                  key={a.id}
                  onClick={() => selectAssistant(a)}
                  className={`px-4 py-3 cursor-pointer hover:bg-indigo-50 transition-colors ${selected?.id === a.id ? 'bg-indigo-50 border-l-2 border-indigo-500' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-slate-700 truncate">{a.name}</p>
                        {!a.is_active && (
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{t('chatbot.subAssistant.disabled')}</span>
                        )}
                      </div>
                      {a.description && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">{a.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-slate-400">{a.kb_count || 0} KB</span>
                        <span className="text-[10px] text-slate-400">{a.active_channels || 0} {t('chatbot.subAssistant.channels')}</span>
                      </div>
                    </div>
                    <button onClick={(e) => handleDelete(a, e)} className="p-1 text-slate-300 hover:text-red-400 transition-colors shrink-0">
                      <HiOutlineTrash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit Panel */}
        <div className="col-span-2">
          {selected ? (
            <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HiOutlinePencil className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-bold text-slate-800">{t('chatbot.subAssistant.settingsPrefix')} {selected.name}</h3>
                </div>
                <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500 text-white text-xs font-semibold rounded-lg hover:bg-indigo-600 disabled:opacity-60 transition-all">
                  {saving ? <><HiOutlineRefresh className="w-3.5 h-3.5 animate-spin" />{t('chatbot.subAssistant.saving')}</> : <><HiOutlineSave className="w-3.5 h-3.5" />{t('chatbot.subAssistant.save')}</>}
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.subAssistant.assistantName')}</label>
                    <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.subAssistant.status')}</label>
                    <select value={form.is_active ? 'on' : 'off'} onChange={e => setForm(p => ({ ...p, is_active: e.target.value === 'on' }))}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 transition-all bg-white">
                      <option value="on">{t('chatbot.subAssistant.active')}</option>
                      <option value="off">{t('chatbot.subAssistant.inactive')}</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.subAssistant.description')}</label>
                  <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder={t('chatbot.subAssistant.descriptionPlaceholder')}
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 transition-all" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.subAssistant.greetingMsg')}</label>
                  <textarea value={form.greeting_msg} onChange={e => setForm(p => ({ ...p, greeting_msg: e.target.value }))}
                    placeholder={t('chatbot.subAssistant.greetingMsgPlaceholder')}
                    rows={3}
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 transition-all resize-none" />
                  <p className="text-[10px] text-slate-400 mt-1">{t('chatbot.subAssistant.greetingMsgTip')}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.subAssistant.avatarUrl')}</label>
                  <input type="url" value={form.avatar_url} onChange={e => setForm(p => ({ ...p, avatar_url: e.target.value }))}
                    placeholder={t('chatbot.subAssistant.avatarUrlPlaceholder')}
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 transition-all" />
                </div>
              </div>
            </form>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl h-full flex items-center justify-center min-h-64">
              <div className="text-center">
                <HiOutlineSparkles className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400">{t('chatbot.subAssistant.selectFirst')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SubAssistantPage;
