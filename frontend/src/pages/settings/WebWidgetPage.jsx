import { useState, useEffect } from 'react';
import {
  HiOutlineCode, HiOutlinePlus, HiOutlineTrash, HiOutlineSave,
  HiOutlineRefresh, HiOutlineX,
  HiOutlineClipboardCopy, HiOutlineCheck,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import { useI18n } from '../../i18n';

function WebWidgetPage() {
  const { t } = useI18n();
  const [widgets, setWidgets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newForm, setNewForm] = useState({ display_name: '', theme_color: '#6366F1' });
  const [copiedKey, setCopiedKey] = useState(null);
  const [_previewMode, _setPreviewMode] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchWidgets(); }, []);

  const fetchWidgets = async () => {
    setLoading(true);
    try {
      const res = await chatbotApi.listWidgets();
      setWidgets(res.data || []);
    } catch { toast.error(t('errors.loadFailed')); }
    finally { setLoading(false); }
  };

  const selectWidget = async (widget) => {
    setSelected(widget);
    setForm({
      display_name: widget.display_name || '',
      theme_color: widget.theme_color || '#6366F1',
      position: widget.position || 'bottom-right',
      welcome_message: widget.welcome_message || '',
      is_active: widget.is_active !== false,
      // Customization
      logo_url: widget.logo_url || '',
      primary_color: widget.primary_color || '#3B82F6',
      background_color: widget.background_color || '#FFFFFF',
      text_color: widget.text_color || '#1F2937',
      accent_color: widget.accent_color || '#60A5FA',
      suggested_questions: widget.suggested_questions || [],
      border_radius: widget.border_radius || 16,
      show_avatar: widget.show_avatar !== false,
      chat_height: widget.chat_height || '500px',
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newForm.display_name.trim()) { toast.error(t('common.required')); return; }
    setCreating(true);
    try {
      const res = await chatbotApi.createWidget(newForm);
      setWidgets(prev => [res.data, ...prev]);
      setShowCreate(false);
      setNewForm({ display_name: '', theme_color: '#6366F1' });
      selectWidget(res.data);
      toast.success(t('common.success'));
    } catch { toast.error(t('errors.createFailed')); }
    finally { setCreating(false); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await chatbotApi.updateWidget(selected.id, form);
      setWidgets(prev => prev.map(w => w.id === selected.id ? res.data : w));
      setSelected(res.data);
      toast.success(t('common.success'));
    } catch { toast.error(t('errors.saveFailed')); }
    finally { setSaving(false); }
  };

  const handleDelete = async (widget, e) => {
    e.stopPropagation();
    if (!confirm(`${t('common.confirm')} Xóa widget "${widget.display_name}"?`)) return;
    try {
      await chatbotApi.deleteWidget(widget.id);
      setWidgets(prev => prev.filter(w => w.id !== widget.id));
      if (selected?.id === widget.id) setSelected(null);
      toast.success(t('common.success'));
    } catch { toast.error(t('errors.deleteFailed')); }
  };

  const copyEmbedCode = (widgetKey) => {
    const code = `<script>
  (function(w,d,s,o,f,js,fjs){
    w['UKnowWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
    js=d.createElement(s);fjs=d.getElementsByTagName(s)[0];
    js.id='uknow-widget-sdk';js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
  }(window,document,'script','uw','${window.location.origin}/widget.js'));
  uw('init', { key: '${widgetKey}', position: 'bottom-right' });
</script>`;
    navigator.clipboard.writeText(code);
    setCopiedKey(widgetKey);
    setTimeout(() => setCopiedKey(null), 2000);
    toast.success(t('chatbot.widget.copied'));
  };

  const addSuggestedQuestion = () => {
    if (!newQuestion.trim()) return;
    if ((form.suggested_questions || []).length >= 5) {
      toast.error('Tối đa 5 câu hỏi gợi ý');
      return;
    }
    setForm(p => ({
      ...p,
      suggested_questions: [...(p.suggested_questions || []), newQuestion.trim()]
    }));
    setNewQuestion('');
  };

  const removeSuggestedQuestion = (index) => {
    setForm(p => ({
      ...p,
      suggested_questions: (p.suggested_questions || []).filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
            <HiOutlineCode className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">{t('chatbot.widget.title')}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('chatbot.widget.description')}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-500 text-white text-sm font-semibold rounded-xl hover:bg-violet-600 transition-all shadow-sm"
        >
          <HiOutlinePlus className="w-4 h-4" />
          {t('chatbot.widget.createNew')}
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">{t('chatbot.widget.createModalTitle')}</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.widget.widgetName')} *</label>
                <input type="text" value={newForm.display_name} onChange={e => setNewForm(p => ({ ...p, display_name: e.target.value }))}
                  placeholder={t('chatbot.widget.widgetNamePlaceholder')}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-all" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.widget.themeColor')}</label>
                <div className="flex items-center gap-3 mt-1">
                  <input type="color" value={newForm.theme_color} onChange={e => setNewForm(p => ({ ...p, theme_color: e.target.value }))}
                    className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer p-1" />
                  <input type="text" value={newForm.theme_color} onChange={e => setNewForm(p => ({ ...p, theme_color: e.target.value }))}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-all font-mono" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">{t('common.cancel')}</button>
                <button type="submit" disabled={creating} className="flex items-center gap-2 px-4 py-2 bg-violet-500 text-white text-sm font-semibold rounded-xl hover:bg-violet-600 disabled:opacity-60 transition-all">
                  {creating ? <><HiOutlineRefresh className="w-4 h-4 animate-spin" />{t('chatbot.widget.creating')}</> : <><HiOutlinePlus className="w-4 h-4" />{t('chatbot.widget.createNew')}</>}
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
              {t('chatbot.widget.widgets')} ({widgets.length})
            </p>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">{t('common.loading')}</div>
          ) : widgets.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-400 mb-3">{t('chatbot.widget.noWidgets')}</p>
              <button onClick={() => setShowCreate(true)} className="text-xs text-violet-500 font-medium hover:underline">
                {t('chatbot.widget.createFirst')}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {widgets.map(w => (
                <div
                  key={w.id}
                  onClick={() => selectWidget(w)}
                  className={`px-4 py-3 cursor-pointer hover:bg-violet-50 transition-colors ${selected?.id === w.id ? 'bg-violet-50 border-l-2 border-violet-500' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: w.theme_color }} />
                        <p className="text-sm font-medium text-slate-700 truncate">{w.display_name || w.widget_key}</p>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono mt-1">{w.widget_key}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{w.conversation_count || 0} {t('chatbot.widget.conversations')}</p>
                    </div>
                    <button onClick={(e) => handleDelete(w, e)} className="p-1 text-slate-300 hover:text-red-400 transition-colors shrink-0">
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
            <div className="space-y-4">
              <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800">{t('chatbot.widget.widgetSettings')}</h3>
                  <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-1.5 bg-violet-500 text-white text-xs font-semibold rounded-lg hover:bg-violet-600 disabled:opacity-60 transition-all">
                    {saving ? <><HiOutlineRefresh className="w-3.5 h-3.5 animate-spin" />{t('chatbot.widget.saving')}</> : <><HiOutlineSave className="w-3.5 h-3.5" />{t('common.save')}</>}
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.widget.widgetName')}</label>
                      <input type="text" value={form.display_name} onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-all" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('common.status')}</label>
                      <select value={form.is_active ? 'on' : 'off'} onChange={e => setForm(p => ({ ...p, is_active: e.target.value === 'on' }))}
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-all bg-white">
                        <option value="on">{t('chatbot.subAssistant.active')}</option>
                        <option value="off">{t('chatbot.subAssistant.disabled')}</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.widget.themeColor')}</label>
                      <div className="flex items-center gap-2 mt-1">
                        <input type="color" value={form.theme_color} onChange={e => setForm(p => ({ ...p, theme_color: e.target.value }))}
                          className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer p-1" />
                        <input type="text" value={form.theme_color} onChange={e => setForm(p => ({ ...p, theme_color: e.target.value }))}
                          className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-all font-mono" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.widget.position')}</label>
                      <select value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))}
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-all bg-white">
                        <option value="bottom-right">{t('chatbot.widget.positionBottomRight')}</option>
                        <option value="bottom-left">{t('chatbot.widget.positionBottomLeft')}</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('chatbot.widget.welcomeMessage')}</label>
                    <input type="text" value={form.welcome_message} onChange={e => setForm(p => ({ ...p, welcome_message: e.target.value }))}
                      placeholder={t('chatbot.widget.welcomeMessagePlaceholder')}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-all" />
                  </div>

                  {/* Customization Section */}
                  <div className="border-t border-slate-100 pt-4 mt-4">
                    <h4 className="text-sm font-bold text-slate-700 mb-3">Tuỳ chỉnh giao diện</h4>

                    {/* Logo/Avatar URL */}
                    <div className="mb-3">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Icon (URL)</label>
                      <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
                        {form.logo_url ? (
                          <img src={form.logo_url} alt="icon" className="w-10 h-10 rounded-lg object-cover bg-slate-200" onError={e => e.target.style.display = 'none'} />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center text-violet-400">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                        )}
                        <input type="url" value={form.logo_url} onChange={e => setForm(p => ({ ...p, logo_url: e.target.value }))}
                          placeholder="https://example.com/icon.png"
                          className="flex-1 bg-transparent text-sm outline-none" />
                        {form.logo_url && (
                          <button type="button" onClick={() => setForm(p => ({ ...p, logo_url: '' }))}
                            className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                            <HiOutlineX className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Icon hiển thị trong widget chat</p>
                    </div>

                    {/* Colors Row */}
                    <div className="mb-3">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Màu sắc</label>
                      <div className="flex flex-wrap gap-3">
                        {/* Primary Color */}
                        <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                          <div className="w-6 h-6 rounded border border-slate-200 overflow-hidden">
                            <input type="color" value={form.primary_color} onChange={e => setForm(p => ({ ...p, primary_color: e.target.value }))}
                              className="w-10 h-10 -ml-1 -mt-1 cursor-pointer" />
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500">Chính</p>
                            <p className="text-xs font-mono text-slate-700">{form.primary_color}</p>
                          </div>
                        </div>
                        {/* Background Color */}
                        <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                          <div className="w-6 h-6 rounded border border-slate-200 overflow-hidden">
                            <input type="color" value={form.background_color} onChange={e => setForm(p => ({ ...p, background_color: e.target.value }))}
                              className="w-10 h-10 -ml-1 -mt-1 cursor-pointer" />
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500">Nền</p>
                            <p className="text-xs font-mono text-slate-700">{form.background_color}</p>
                          </div>
                        </div>
                        {/* Text Color */}
                        <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                          <div className="w-6 h-6 rounded border border-slate-200 overflow-hidden">
                            <input type="color" value={form.text_color} onChange={e => setForm(p => ({ ...p, text_color: e.target.value }))}
                              className="w-10 h-10 -ml-1 -mt-1 cursor-pointer" />
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500">Chữ</p>
                            <p className="text-xs font-mono text-slate-700">{form.text_color}</p>
                          </div>
                        </div>
                        {/* Accent Color */}
                        <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                          <div className="w-6 h-6 rounded border border-slate-200 overflow-hidden">
                            <input type="color" value={form.accent_color} onChange={e => setForm(p => ({ ...p, accent_color: e.target.value }))}
                              className="w-10 h-10 -ml-1 -mt-1 cursor-pointer" />
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500">Nhấn</p>
                            <p className="text-xs font-mono text-slate-700">{form.accent_color}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Show Avatar Toggle */}
                    <div className="flex items-center gap-3 mb-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.show_avatar} onChange={e => setForm(p => ({ ...p, show_avatar: e.target.checked }))}
                          className="w-4 h-4 rounded border-slate-300 text-violet-500 focus:ring-violet-400" />
                        <span className="text-sm text-slate-600">Hiển thị avatar bot</span>
                      </label>
                    </div>

                    {/* Suggested Questions */}
                    <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block">Câu hỏi gợi ý</label>
                          <p className="text-[11px] text-slate-400 mt-0.5">Hiển thị khi người dùng bắt đầu chat</p>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          (form.suggested_questions || []).length >= 5
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-violet-100 text-violet-600'
                        }`}>
                          {(form.suggested_questions || []).length}/5
                        </span>
                      </div>

                      {/* Input Row */}
                      <div className="flex gap-1.5 mb-3">
                        <input type="text" value={newQuestion} onChange={e => setNewQuestion(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); addSuggestedQuestion(); }
                            if (e.key === 'Escape') { setNewQuestion(''); }
                          }}
                          placeholder="Nhập câu hỏi gợi ý..."
                          disabled={(form.suggested_questions || []).length >= 5}
                          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400 transition-all bg-white disabled:opacity-50" />
                        <button type="button" onClick={addSuggestedQuestion} disabled={(form.suggested_questions || []).length >= 5}
                          className="px-3 py-2 bg-violet-500 text-white rounded-lg text-sm hover:bg-violet-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                          +
                        </button>
                        {(form.suggested_questions || []).length > 0 && (
                          <button type="button" onClick={() => setForm(p => ({ ...p, suggested_questions: [] }))}
                            className="px-2.5 py-2 bg-slate-200 text-slate-600 rounded-lg text-xs hover:bg-slate-300 transition-colors">
                            Reset
                          </button>
                        )}
                      </div>

                      {/* Questions List */}
                      {(form.suggested_questions || []).length > 0 ? (
                        <div className="space-y-1.5">
                          {form.suggested_questions.map((q, i) => (
                            <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-violet-100 group hover:border-violet-300 transition-colors">
                              <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-600 text-[10px] font-bold flex items-center justify-center shrink-0">
                                {i + 1}
                              </span>
                              <span className="flex-1 text-sm text-slate-700 truncate">{q}</span>
                              <button onClick={() => removeSuggestedQuestion(i)}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all">
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-slate-400">
                          <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-xs">Chưa có câu hỏi gợi ý nào</p>
                          <p className="text-[10px] mt-0.5">Nhập câu hỏi và nhấn Enter hoặc + để thêm</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </form>

              {/* Embed Code */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800">{t('chatbot.widget.embedCode')}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{t('chatbot.widget.embedCodeTip')}</p>
                </div>
                <div className="p-5">
                  <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs font-mono overflow-x-auto leading-relaxed">
{`<script>
  (function(w,d,s,o,f,js,fjs){
    w['UKnowWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
    js=d.createElement(s);fjs=d.getElementsByTagName(s)[0];
    js.id='uknow-widget-sdk';js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
  }(window,document,'script','uw','${window.location.origin}/widget.js'));
  uw('init', { key: '${selected.widget_key}', position: '${form.position || 'bottom-right'}' });
</script>`}
                  </pre>
                  <button
                    onClick={() => copyEmbedCode(selected.widget_key)}
                    className="mt-3 flex items-center gap-2 px-4 py-2 bg-violet-500 text-white text-xs font-semibold rounded-xl hover:bg-violet-600 transition-all"
                  >
                    {copiedKey === selected.widget_key ? <><HiOutlineCheck className="w-4 h-4" />{t('chatbot.channels.copied')}</> : <><HiOutlineClipboardCopy className="w-4 h-4" />{t('chatbot.widget.copyCode')}</>}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl h-full flex items-center justify-center min-h-64">
              <div className="text-center">
                <HiOutlineCode className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400">{t('chatbot.widget.selectFirst')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default WebWidgetPage;
